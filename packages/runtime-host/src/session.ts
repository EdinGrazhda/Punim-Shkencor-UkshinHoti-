import { createHash, randomUUID, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { ApprovedQuestion, AnswerRequest, GameSnapshot, HostCommand, Player, PublicSessionState, ScoreBreakdown, SessionPhase, calculateScore } from "@ckadinti/contracts";
import { z } from "zod";

export type SessionEvent = { id: string; at: number; type: string; playerId?: string; payload?: unknown };
export type AnswerResult = { accepted: boolean; duplicate?: boolean; reason?: string };
type Answer = { playerId: string; questionIndex: number; optionIndex: number; submittedAt: number; idempotencyKey: string; score: ScoreBreakdown };
type BonusOffer = 150 | 300 | "hack";
type BonusSelection = { boxIndex: number; kind: "points" | "hack"; points: number; targetId?: string; stolen?: number; soloFallback?: boolean };
type PlayerResult = {
  questionIndex: number;
  answered: boolean;
  selectedOption?: number;
  correctOption?: number;
  correct?: boolean;
  score?: number;
  xp?: number;
  questionXp?: number;
  questionScore?: number;
  streak?: number;
  bonus?: Partial<BonusSelection> & { available: boolean; targets?: { id: string; displayName: string }[] };
};
const REVEAL_WINDOW_MS = 8_000;
const MIN_FEEDBACK_MS = 2_500;
const HACK_PERCENT = 15;

const persistedSessionSchema = z.object({
  version: z.literal(1),
  code: z.string().length(6),
  snapshot: GameSnapshot,
  players: z.array(Player),
  events: z.array(z.object({ id: z.string(), at: z.number(), type: z.string(), playerId: z.string().optional(), payload: z.unknown().optional() })),
  answers: z.array(z.object({
    playerId: z.string(),
    questionIndex: z.number().int().nonnegative(),
    optionIndex: z.number().int().nonnegative(),
    submittedAt: z.number().nonnegative(),
    idempotencyKey: z.string(),
    score: z.object({ base: z.number(), speedBonus: z.number(), streakBonus: z.number(), total: z.number() }),
  })),
  scores: z.array(z.tuple([z.string(), z.number()])),
  streaks: z.array(z.tuple([z.string(), z.number()])),
  xp: z.array(z.tuple([z.string(), z.number()])),
  bonusOffers: z.array(z.tuple([z.string(), z.tuple([z.union([z.literal(150), z.literal(300), z.literal("hack")]), z.union([z.literal(150), z.literal(300), z.literal("hack")]), z.union([z.literal(150), z.literal(300), z.literal("hack")])])])).default([]),
  bonusSelections: z.array(z.tuple([z.string(), z.object({ boxIndex: z.number().int().min(0).max(2), kind: z.enum(["points", "hack"]), points: z.number().int().nonnegative(), targetId: z.string().optional(), stolen: z.number().int().nonnegative().optional(), soloFallback: z.boolean().optional() })])).default([]),
  scoreAdjustments: z.array(z.tuple([z.string(), z.number().int()])).default([]),
  playerTokenHashes: z.array(z.tuple([z.string(), z.string()])),
  studentAccounts: z.array(z.tuple([z.string(), z.string()])),
  currentIndex: z.number().int().nonnegative(),
  deadlineAt: z.number().nonnegative(),
  revealUntil: z.number().nonnegative(),
  pausedRemaining: z.number().nonnegative(),
  phase: SessionPhase,
  lobbyLocked: z.boolean(),
}).superRefine((state, context) => {
  if (state.currentIndex >= state.snapshot.questions.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "currentIndex is outside the approved snapshot", path: ["currentIndex"] });
  }
});
export type PersistedSession = z.infer<typeof persistedSessionSchema>;

export class AuthoritativeSession {
  readonly snapshot: Readonly<GameSnapshot>;
  readonly players = new Map<string, Player>();
  readonly events: SessionEvent[] = [];
  readonly answers: Answer[] = [];
  private readonly idempotency = new Map<string, AnswerResult>();
  private readonly scores = new Map<string, number>();
  private readonly streaks = new Map<string, number>();
  private readonly playerTokens = new Map<string, string>();
  private readonly playerTokenHashes = new Map<string, string>();
  private readonly studentAccounts = new Map<string, string>();
  readonly hostToken = randomBytes(32).toString("hex");
  private readonly xp = new Map<string, number>();
  private readonly bonusOffers = new Map<string, [BonusOffer, BonusOffer, BonusOffer]>();
  private readonly bonusSelections = new Map<string, BonusSelection>();
  private readonly scoreAdjustments = new Map<string, number>();
  private revealUntil = 0;
  private pausedRemaining = 0;
  private currentIndex = 0;
  private deadlineAt = 0;
  private phase: PublicSessionState["phase"] = "lobby";
  private lobbyLocked = false;

  constructor(readonly code: string, snapshot: GameSnapshot, private now = () => Date.now(), restored?: PersistedSession) {
    this.snapshot = structuredClone(snapshot);
    if (restored) this.restore(restored);
    else this.emit("session.created", { snapshotId: snapshot.id });
  }

  static restore(input: unknown, now = () => Date.now()) {
    const state = persistedSessionSchema.parse(input);
    return new AuthoritativeSession(state.code, state.snapshot, now, state);
  }

  private restore(state: PersistedSession) {
    for (const player of state.players) this.players.set(player.id, { ...player, connected: false });
    this.events.push(...structuredClone(state.events));
    this.answers.push(...structuredClone(state.answers));
    for (const [key, value] of state.scores) this.scores.set(key, value);
    for (const [key, value] of state.streaks) this.streaks.set(key, value);
    for (const [key, value] of state.xp) this.xp.set(key, value);
    for (const [key, value] of state.bonusOffers) this.bonusOffers.set(key, value);
    for (const [key, value] of state.bonusSelections) this.bonusSelections.set(key, value);
    for (const [key, value] of state.scoreAdjustments) this.scoreAdjustments.set(key, value);
    for (const [key, value] of state.playerTokenHashes) this.playerTokenHashes.set(key, value);
    for (const [key, value] of state.studentAccounts) this.studentAccounts.set(key, value);
    for (const answer of state.answers) this.idempotency.set(`${answer.playerId}:${answer.idempotencyKey}`, { accepted: true });
    this.currentIndex = state.currentIndex;
    this.deadlineAt = state.deadlineAt;
    this.revealUntil = state.revealUntil;
    this.pausedRemaining = state.pausedRemaining;
    this.phase = state.phase;
    this.lobbyLocked = state.lobbyLocked;
  }

  toPersistence(): PersistedSession {
    return {
      version: 1,
      code: this.code,
      snapshot: structuredClone(this.snapshot),
      players: [...this.players.values()].map(player => ({ ...player, connected: false })),
      events: structuredClone(this.events),
      answers: structuredClone(this.answers),
      scores: [...this.scores],
      streaks: [...this.streaks],
      xp: [...this.xp],
      bonusOffers: [...this.bonusOffers],
      bonusSelections: [...this.bonusSelections],
      scoreAdjustments: [...this.scoreAdjustments],
      playerTokenHashes: [...this.playerTokenHashes],
      studentAccounts: [...this.studentAccounts],
      currentIndex: this.currentIndex,
      deadlineAt: this.deadlineAt,
      revealUntil: this.revealUntil,
      pausedRemaining: this.pausedRemaining,
      phase: this.phase,
      lobbyLocked: this.lobbyLocked,
    };
  }

  join(displayName: string, playerId: string = randomUUID(), emblem?: string): Player {
    if (this.lobbyLocked || this.phase !== "lobby") throw new Error("lobby_closed");
    const player = Player.parse({ id: playerId, displayName, emblem, connected: true, joinedAt: this.now() });
    this.players.set(player.id, player);
    this.scores.set(player.id, 0);
    this.streaks.set(player.id, 0);
    this.issuePlayerToken(player.id);
    this.emit("player.joined", { playerId: player.id });
    return player;
  }

  reconnect(playerId: string): Player {
    const existing = this.players.get(playerId);
    if (!existing) throw new Error("player_not_found");
    const player = { ...existing, connected: true };
    this.players.set(playerId, player);
    this.emit("player.reconnected", { playerId });
    return player;
  }

  tokenFor(playerId: string) { return this.playerTokens.get(playerId); }
  issuePlayerToken(playerId: string) {
    if (!this.players.has(playerId)) throw new Error("player_not_found");
    const token = randomBytes(32).toString("hex");
    this.playerTokens.set(playerId, token);
    this.playerTokenHashes.set(playerId, tokenDigest(token));
    return token;
  }
  linkStudentAccount(playerId: string, accountId: string) { if (!this.players.has(playerId)) throw new Error("player_not_found"); this.studentAccounts.set(playerId, accountId); }
  playerIdForStudent(accountId: string) { return [...this.studentAccounts].find(([, id]) => id === accountId)?.[0]; }
  studentAccountFor(playerId: string) { return this.studentAccounts.get(playerId); }
  verifyPlayer(playerId: string, token: string | undefined) { return secureEqual(this.playerTokenHashes.get(playerId), token ? tokenDigest(token) : undefined); }
  verifyHost(token: string | undefined) { return secureEqual(this.hostToken, token); }

  disconnect(playerId: string) {
    const existing = this.players.get(playerId);
    if (existing) { this.players.set(playerId, { ...existing, connected: false }); this.emit("player.disconnected", { playerId }); }
  }

  command(command: HostCommand) {
    if (command.type === "set-timer") { if (this.phase !== "lobby") throw new Error("invalid_phase"); for (const q of this.snapshot.questions) q.timeLimitMs = command.timeLimitMs; this.emit("timer.changed"); }
    if (command.type === "start") { if (this.phase !== "lobby") throw new Error("invalid_phase"); this.phase = "question"; this.openQuestion(); }
    if (command.type === "pause") { if (this.phase !== "question") throw new Error("invalid_phase"); this.pausedRemaining = Math.max(0, this.deadlineAt - this.now()); this.phase = "paused"; this.emit("session.paused"); }
    if (command.type === "resume") { if (this.phase !== "paused") throw new Error("invalid_phase"); this.phase = "question"; this.deadlineAt = this.now() + this.pausedRemaining; this.emit("session.resumed"); }
    if (command.type === "end") { this.phase = "ended"; this.emit("session.ended"); }
    if (command.type === "lock-lobby") { this.lobbyLocked = command.locked; this.emit("lobby.locked", { locked: command.locked }); }
    if (command.type === "kick") { this.players.delete(command.playerId); this.playerTokens.delete(command.playerId); this.playerTokenHashes.delete(command.playerId); this.studentAccounts.delete(command.playerId); this.emit("player.kicked", { playerId: command.playerId }); }
    if (command.type === "reveal") { if (this.phase !== "question") throw new Error("invalid_phase"); this.revealQuestion(); }
    if (command.type === "next") this.nextQuestion();
  }

  answer(playerId: string, request: AnswerRequest): AnswerResult {
    const idempotencyKey = `${playerId}:${request.idempotencyKey}`;
    const cached = this.idempotency.get(idempotencyKey); if (cached) return { ...cached, duplicate: true };
    const reject = (reason: string): AnswerResult => { const result = { accepted: false, reason }; this.idempotency.set(idempotencyKey, result); return result; };
    if (this.phase !== "question") return reject("not_accepting_answers");
    if (request.questionIndex !== this.currentIndex) return reject("stale_question");
    if (this.now() >= this.deadlineAt) return reject("deadline_passed");
    if (!this.players.has(playerId)) return reject("player_not_found");
    if (this.answers.some(a => a.playerId === playerId && a.questionIndex === this.currentIndex)) return reject("already_answered");
    const question = this.snapshot.questions[this.currentIndex]!;
    if (!Number.isInteger(request.optionIndex) || request.optionIndex < 0 || request.optionIndex >= question.options.length) return reject("invalid_option");
    const previousStreak = this.streaks.get(playerId) ?? 0;
    const correct = request.optionIndex === question.correctOption;
    const score = calculateScore(correct, this.now() - (this.deadlineAt - question.timeLimitMs), question.timeLimitMs, correct ? previousStreak + 1 : 0);
    const answer = { playerId, questionIndex: this.currentIndex, optionIndex: request.optionIndex, submittedAt: this.now(), idempotencyKey: request.idempotencyKey, score };
    this.answers.push(answer); this.scores.set(playerId, (this.scores.get(playerId) ?? 0) + score.total); this.streaks.set(playerId, correct ? previousStreak + 1 : 0);
    this.xp.set(playerId, (this.xp.get(playerId) ?? 0) + (correct ? 100 : 10));
    const result = { accepted: true }; this.idempotency.set(idempotencyKey, result); this.emit("answer.accepted", { playerId, questionIndex: this.currentIndex }); return result;
  }

  tick(at = this.now()) {
    if (this.phase === "question") {
      const complete = this.players.size > 0 && [...this.players.keys()].every(id => {
        const answer = this.answers.find(a => a.playerId === id && a.questionIndex === this.currentIndex);
        return answer && at >= answer.submittedAt + 1500;
      });
      if (at >= this.deadlineAt || complete) this.revealQuestion();
    } else if (this.phase === "reveal") {
      const feedbackShown = at >= this.revealUntil - REVEAL_WINDOW_MS + MIN_FEEDBACK_MS;
      const resolved = [...this.players.keys()].every(playerId => {
        const answer = this.answers.find(item => item.playerId === playerId && item.questionIndex === this.currentIndex);
        if (!answer || answer.score.base === 0) return true;
        const selection = this.bonusSelections.get(this.bonusKey(playerId));
        return Boolean(selection && (selection.kind === "points" || selection.targetId));
      });
      if (at >= this.revealUntil || (feedbackShown && resolved)) this.nextQuestion();
    }
  }

  private bonusKey(playerId: string) { return `${this.currentIndex}:${playerId}`; }
  private offerFor(playerId: string): [BonusOffer, BonusOffer, BonusOffer] {
    const key = this.bonusKey(playerId);
    const existing = this.bonusOffers.get(key);
    if (existing) return existing;
    const offers: [BonusOffer, BonusOffer, BonusOffer] = [150, 300, "hack"];
    for (let index = 2; index > 0; index--) {
      const other = randomInt(index + 1);
      [offers[index], offers[other]] = [offers[other]!, offers[index]!];
    }
    this.bonusOffers.set(key, offers);
    return offers;
  }
  private adjustScore(playerId: string, points: number) {
    this.scores.set(playerId, Math.max(0, (this.scores.get(playerId) ?? 0) + points));
    const key = this.bonusKey(playerId);
    this.scoreAdjustments.set(key, (this.scoreAdjustments.get(key) ?? 0) + points);
  }
  pickBonus(playerId: string, boxIndex: number) {
    if (this.phase !== "reveal" || this.now() >= this.revealUntil) throw new Error("bonus_closed");
    if (!Number.isInteger(boxIndex) || boxIndex < 0 || boxIndex > 2) throw new Error("invalid_box");
    const answer = this.answers.find(item => item.playerId === playerId && item.questionIndex === this.currentIndex);
    if (!answer || answer.score.base === 0) throw new Error("bonus_not_earned");
    const key = this.bonusKey(playerId);
    if (this.bonusSelections.has(key)) return this.playerResult(playerId);
    const offer = this.offerFor(playerId)[boxIndex]!;
    const hasTarget = [...this.players.keys()].some(id => id !== playerId);
    const selection: BonusSelection = offer === "hack" && hasTarget
      ? { boxIndex, kind: "hack", points: 0 }
      : { boxIndex, kind: "points", points: offer === "hack" ? 150 : offer, ...(offer === "hack" ? { soloFallback: true } : {}) };
    this.bonusSelections.set(key, selection);
    if (selection.kind === "points") this.adjustScore(playerId, selection.points);
    this.emit("bonus.picked", { playerId, questionIndex: this.currentIndex, kind: selection.kind });
    return this.playerResult(playerId);
  }
  hack(playerId: string, targetId: string) {
    if (this.phase !== "reveal" || this.now() >= this.revealUntil) throw new Error("bonus_closed");
    const key = this.bonusKey(playerId);
    const selection = this.bonusSelections.get(key);
    if (!selection || selection.kind !== "hack") throw new Error("hack_not_earned");
    if (selection.targetId) return this.playerResult(playerId);
    if (targetId === playerId || !this.players.has(targetId)) throw new Error("invalid_hack_target");
    const stolen = Math.floor(this.score(targetId) * HACK_PERCENT / 100);
    this.adjustScore(targetId, -stolen);
    this.adjustScore(playerId, stolen);
    Object.assign(selection, { targetId, stolen });
    this.emit("bonus.hacked", { playerId, targetId, questionIndex: this.currentIndex, stolen });
    return this.playerResult(playerId);
  }
  private revealQuestion() {
    this.phase = "reveal";
    this.revealUntil = this.now() + REVEAL_WINDOW_MS;
    for (const answer of this.answers) {
      if (answer.questionIndex === this.currentIndex && answer.score.base > 0) this.offerFor(answer.playerId);
    }
    this.emit("question.revealed", { questionIndex: this.currentIndex });
  }
  nextQuestion() { if (this.phase !== "reveal") throw new Error("invalid_phase"); if (this.currentIndex + 1 >= this.snapshot.questions.length) { this.phase = "ended"; this.emit("session.ended"); } else { this.currentIndex += 1; this.openQuestion(); } }

  state(): PublicSessionState { const question = this.snapshot.questions[this.currentIndex]; return PublicSessionState.parse({ code: this.code, questionCount: this.snapshot.questions.length, phase: this.phase, lobbyLocked: this.lobbyLocked, players: [...this.players.values()], question: question && this.phase !== "lobby" && this.phase !== "ended" ? { index: this.currentIndex, prompt: question.prompt, options: question.options, deadlineAt: this.deadlineAt, timeLimitMs: question.timeLimitMs } : undefined, reveal: this.phase === "reveal" && question ? { correctOption: question.correctOption, explanation: question.explanation } : undefined, questionIndex: this.currentIndex, answeredCount: this.answers.filter(a => a.questionIndex === this.currentIndex).length }); }
  score(playerId: string) { return this.scores.get(playerId) ?? 0; }
  playerResult(playerId: string): PlayerResult {
    const answer = this.answers.find(a => a.playerId === playerId && a.questionIndex === this.currentIndex);
    if (this.phase !== "reveal" && this.phase !== "ended") {
      return {
        questionIndex: this.currentIndex,
        answered: Boolean(answer),
        selectedOption: answer?.optionIndex,
      };
    }
    const bonus = answer?.score.base ? this.bonusSelections.get(this.bonusKey(playerId)) : undefined;
    return { questionIndex: this.currentIndex, score: this.score(playerId), xp: this.xp.get(playerId) ?? 0,
      questionXp: answer ? (answer.score.base ? 100 : 10) : 0,
      questionScore: (answer?.score.total ?? 0) + (this.scoreAdjustments.get(this.bonusKey(playerId)) ?? 0), correct: Boolean(answer?.score.base),
      answered: Boolean(answer), selectedOption: answer?.optionIndex,
      correctOption: answer ? this.snapshot.questions[this.currentIndex]!.correctOption : undefined,
      streak: this.streaks.get(playerId) ?? 0,
      ...(answer?.score.base ? { bonus: bonus
        ? { available: false, ...bonus, ...(bonus.kind === "hack" && !bonus.targetId ? { targets: [...this.players.values()].filter(player => player.id !== playerId).map(player => ({ id: player.id, displayName: player.displayName })) } : {}) }
        : { available: this.phase === "reveal" && this.now() < this.revealUntil } } : {}) };
  }
  answerBreakdown(playerId: string) {
    if (!this.players.has(playerId)) throw new Error("player_not_found");
    return this.snapshot.questions.map((question, questionIndex) => {
      const answer = this.answers.find(item => item.playerId === playerId && item.questionIndex === questionIndex);
      return {
        questionIndex,
        prompt: question.prompt,
        answered: Boolean(answer),
        selectedOption: answer?.optionIndex,
        selectedAnswer: answer ? question.options[answer.optionIndex] : undefined,
        correctOption: question.correctOption,
        correctAnswer: question.options[question.correctOption]!,
        correct: answer?.optionIndex === question.correctOption,
        score: (answer?.score.total ?? 0) + (this.scoreAdjustments.get(`${questionIndex}:${playerId}`) ?? 0),
      };
    });
  }
  leaderboard() { return [...this.players.values()].map(p => ({ id: p.id, displayName: p.displayName, score: this.score(p.id) })).sort((a,b) => b.score - a.score); }
  private openQuestion() { this.phase = "question"; this.deadlineAt = this.now() + this.snapshot.questions[this.currentIndex]!.timeLimitMs; this.emit("question.opened", { questionIndex: this.currentIndex, deadlineAt: this.deadlineAt }); }
  private emit(type: string, payload?: unknown) { this.events.push({ id: randomUUID(), at: this.now(), type, payload }); }
}

function secureEqual(expected: string | undefined, received: string | undefined) { if (!expected || !received || expected.length !== received.length) return false; return timingSafeEqual(Buffer.from(expected), Buffer.from(received)); }
function tokenDigest(token: string) { return createHash("sha256").update(token).digest("hex"); }

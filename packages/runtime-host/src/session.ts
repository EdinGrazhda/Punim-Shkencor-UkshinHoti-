import { createHash, randomUUID, randomBytes, timingSafeEqual } from "node:crypto";
import { ApprovedQuestion, AnswerRequest, GameSnapshot, HostCommand, Player, PublicSessionState, ScoreBreakdown, SessionPhase, teamAssignmentModeSchema, calculateScore, type NicknameMode, type TeamAssignmentMode } from "@ckadinti/contracts";
import { z } from "zod";

export type SessionEvent = { id: string; at: number; type: string; playerId?: string; payload?: unknown };
export type AnswerResult = { accepted: boolean; duplicate?: boolean; reason?: string };
type Answer = { playerId: string; questionIndex: number; optionIndex: number; submittedAt: number; idempotencyKey: string; score: ScoreBreakdown };
const nicknameWords = ["Curious Comet", "Kind Koala", "Brave Badger", "Bright Bee", "Swift Sparrow", "Clever Fox", "Calm Panda", "Bold Dolphin", "Mighty Maple", "Silver Star", "Happy Heron", "Cosmic Cat"];

function classroomNickname(index: number) {
  const word = nicknameWords[index % nicknameWords.length]!;
  const number = Math.floor(index / nicknameWords.length) + 1;
  return `${word} ${String(number).padStart(2, "0")}`;
}

const persistedSessionSchema = z.object({
  version: z.literal(1),
  code: z.string().length(6),
  snapshot: GameSnapshot,
  teamCount: z.number().int().min(0).max(6).default(0),
  teamAssignmentMode: teamAssignmentModeSchema.default("random"),
  nicknameMode: z.enum(["student-choice", "assigned"]).default("student-choice"),
  nicknameCounter: z.number().int().nonnegative().default(0),
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
  playerTokenHashes: z.array(z.tuple([z.string(), z.string()])),
  studentAccounts: z.array(z.tuple([z.string(), z.string()])),
  currentIndex: z.number().int().nonnegative(),
  playOrder: z.array(z.number().int().nonnegative()).optional(),
  deadlineAt: z.number().nonnegative(),
  questionStartedAt: z.number().nonnegative().optional(),
  pausedQuestionElapsed: z.number().nonnegative().optional(),
  sessionDeadlineAt: z.number().nonnegative().default(0),
  pausedSessionRemaining: z.number().nonnegative().default(0),
  revealUntil: z.number().nonnegative(),
  pausedRemaining: z.number().nonnegative(),
  phase: SessionPhase,
  lobbyLocked: z.boolean(),
}).superRefine((state, context) => {
  if (state.snapshot.sessionMode !== "timed-repeat" && state.currentIndex >= state.snapshot.questions.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "currentIndex is outside the approved snapshot", path: ["currentIndex"] });
  }
  if (state.snapshot.sessionMode === "timed-repeat" && state.playOrder?.length && state.currentIndex >= state.playOrder.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "currentIndex is outside the timed question order", path: ["currentIndex"] });
  }
  for (const questionIndex of state.playOrder ?? []) {
    if (questionIndex >= state.snapshot.questions.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "playOrder contains an unknown question", path: ["playOrder"] });
      break;
    }
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
  private revealUntil = 0;
  private pausedRemaining = 0;
  private currentIndex = 0;
  private playOrder: number[] = [];
  private deadlineAt = 0;
  private questionStartedAt = 0;
  private pausedQuestionElapsed = 0;
  private sessionDeadlineAt = 0;
  private pausedSessionRemaining = 0;
  private phase: PublicSessionState["phase"] = "lobby";
  private lobbyLocked = false;
  private teamCount = 0;
  private teamAssignmentMode: TeamAssignmentMode = "random";
  private nicknameMode: NicknameMode = "student-choice";
  private nicknameCounter = 0;

  constructor(readonly code: string, snapshot: GameSnapshot, private now = () => Date.now(), restored?: PersistedSession) {
    this.snapshot = structuredClone(snapshot);
    if (restored) this.restore(restored);
    else {
      this.playOrder = this.isTimedRepeat ? this.shuffledRound() : this.snapshot.questions.map((_, index) => index);
      this.emit("session.created", { snapshotId: snapshot.id });
    }
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
    for (const [key, value] of state.playerTokenHashes) this.playerTokenHashes.set(key, value);
    for (const [key, value] of state.studentAccounts) this.studentAccounts.set(key, value);
    for (const answer of state.answers) this.idempotency.set(`${answer.playerId}:${answer.idempotencyKey}`, { accepted: true });
    this.currentIndex = state.currentIndex;
    this.playOrder = state.playOrder?.length ? [...state.playOrder] : this.snapshot.questions.map((_, index) => index);
    this.deadlineAt = state.deadlineAt;
    const legacyQuestionTimeLimit = this.currentQuestion().timeLimitMs;
    this.questionStartedAt = state.questionStartedAt ?? (state.deadlineAt > 0 ? state.deadlineAt - legacyQuestionTimeLimit : 0);
    this.pausedQuestionElapsed = state.pausedQuestionElapsed ?? (state.phase === "paused" ? Math.max(0, legacyQuestionTimeLimit - state.pausedRemaining) : 0);
    this.sessionDeadlineAt = state.sessionDeadlineAt;
    this.pausedSessionRemaining = state.pausedSessionRemaining;
    this.revealUntil = state.revealUntil;
    this.pausedRemaining = state.pausedRemaining;
    this.phase = state.phase;
    this.lobbyLocked = state.lobbyLocked;
    this.teamCount = state.teamCount;
    this.teamAssignmentMode = state.teamAssignmentMode;
    this.nicknameMode = state.nicknameMode;
    this.nicknameCounter = state.nicknameCounter;
  }

  toPersistence(): PersistedSession {
    return {
      version: 1,
      code: this.code,
      snapshot: structuredClone(this.snapshot),
      teamCount: this.teamCount,
      teamAssignmentMode: this.teamAssignmentMode,
      nicknameMode: this.nicknameMode,
      nicknameCounter: this.nicknameCounter,
      players: [...this.players.values()].map(player => ({ ...player, connected: false })),
      events: structuredClone(this.events),
      answers: structuredClone(this.answers),
      scores: [...this.scores],
      streaks: [...this.streaks],
      xp: [...this.xp],
      playerTokenHashes: [...this.playerTokenHashes],
      studentAccounts: [...this.studentAccounts],
      currentIndex: this.currentIndex,
      playOrder: [...this.playOrder],
      deadlineAt: this.deadlineAt,
      questionStartedAt: this.questionStartedAt,
      pausedQuestionElapsed: this.pausedQuestionElapsed,
      sessionDeadlineAt: this.sessionDeadlineAt,
      pausedSessionRemaining: this.pausedSessionRemaining,
      revealUntil: this.revealUntil,
      pausedRemaining: this.pausedRemaining,
      phase: this.phase,
      lobbyLocked: this.lobbyLocked,
    };
  }

  join(displayName: string | undefined, playerId: string = randomUUID(), emblem?: string): Player {
    if (this.lobbyLocked || this.phase !== "lobby") throw new Error("lobby_closed");
    const name = this.nicknameMode === "assigned" ? classroomNickname(this.nicknameCounter++) : this.validateNickname(displayName);
    let player = Player.parse({ id: playerId, displayName: name, emblem, connected: true, joinedAt: this.now() });
    this.players.set(player.id, player);
    this.assignPlayerToRandomTeam(player.id);
    player = this.players.get(player.id)!;
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
    if (command.type === "start") { if (this.phase !== "lobby") throw new Error("invalid_phase"); this.phase = "question"; if (this.isTimedRepeat) this.sessionDeadlineAt = this.now() + this.snapshot.sessionDurationMs!; this.openQuestion(); }
    if (command.type === "pause") { if (this.phase !== "question") throw new Error("invalid_phase"); this.pausedRemaining = Math.max(0, this.deadlineAt - this.now()); this.pausedQuestionElapsed = Math.max(0, this.now() - this.questionStartedAt); if (this.isTimedRepeat) { this.pausedSessionRemaining = Math.max(0, this.sessionDeadlineAt - this.now()); this.sessionDeadlineAt = 0; } this.phase = "paused"; this.emit("session.paused"); }
    if (command.type === "resume") { if (this.phase !== "paused") throw new Error("invalid_phase"); if (this.isTimedRepeat && this.pausedSessionRemaining <= 0) { this.endSession(); return; } this.phase = "question"; if (this.isTimedRepeat) { this.sessionDeadlineAt = this.now() + this.pausedSessionRemaining; this.pausedSessionRemaining = 0; } this.questionStartedAt = this.now() - this.pausedQuestionElapsed; this.pausedQuestionElapsed = 0; this.deadlineAt = this.now() + this.pausedRemaining; if (this.isTimedRepeat) this.deadlineAt = Math.min(this.deadlineAt, this.sessionDeadlineAt); this.emit("session.resumed"); }
    if (command.type === "end") { this.phase = "ended"; this.emit("session.ended"); }
    if (command.type === "lock-lobby") { this.lobbyLocked = command.locked; this.emit("lobby.locked", { locked: command.locked }); }
    if (command.type === "set-team-count") { if (this.phase !== "lobby") throw new Error("invalid_phase"); this.teamCount = command.teamCount; this.assignTeams(); this.emit("teams.changed", { teamCount: this.teamCount, teamAssignmentMode: this.teamAssignmentMode }); }
    if (command.type === "set-team-assignment-mode") { if (this.phase !== "lobby") throw new Error("invalid_phase"); this.teamAssignmentMode = command.teamAssignmentMode; this.assignTeams(); this.emit("teams.assignment-mode-changed", { teamCount: this.teamCount, teamAssignmentMode: this.teamAssignmentMode }); }
    if (command.type === "set-nickname-mode") { if (this.phase !== "lobby") throw new Error("invalid_phase"); this.nicknameMode = command.nicknameMode; if (this.nicknameMode === "assigned") { let index = 0; for (const player of this.players.values()) this.players.set(player.id, { ...player, displayName: classroomNickname(index++) }); this.nicknameCounter = index; } this.emit("nicknames.changed", { nicknameMode: this.nicknameMode }); }
    if (command.type === "rename-player") {
      if (this.phase !== "lobby") throw new Error("invalid_phase");
      const player = this.players.get(command.playerId);
      if (!player) throw new Error("player_not_found");
      const displayName = this.validateNickname(command.displayName, player.id);
      this.players.set(player.id, { ...player, displayName });
      this.emit("player.renamed", { playerId: player.id });
    }
    if (command.type === "assign-player-team") {
      if (this.phase !== "lobby") throw new Error("invalid_phase");
      if (this.teamCount === 0) throw new Error("teams_disabled");
      if (this.teamAssignmentMode !== "manual") throw new Error("random_team_assignment_active");
      if (command.teamIndex > this.teamCount) throw new Error("team_not_found");
      const player = this.players.get(command.playerId);
      if (!player) throw new Error("player_not_found");
      if (command.teamIndex === 0) {
        const { teamId: _teamId, teamName: _teamName, ...unassigned } = player;
        this.players.set(player.id, unassigned);
        this.emit("player.team-assigned", { playerId: player.id, teamIndex: 0 });
        return;
      }
      this.players.set(player.id, { ...player, teamId: `team-${command.teamIndex}`, teamName: `Team ${command.teamIndex}` });
      this.emit("player.team-assigned", { playerId: player.id, teamIndex: command.teamIndex });
    }
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
    const question = this.currentQuestion();
    if (!Number.isInteger(request.optionIndex) || request.optionIndex < 0 || request.optionIndex >= question.options.length) return reject("invalid_option");
    const previousStreak = this.streaks.get(playerId) ?? 0;
    const correct = request.optionIndex === question.correctOption;
    const effectiveTimeLimitMs = Math.max(1, this.deadlineAt - this.questionStartedAt);
    const score = calculateScore(correct, this.now() - this.questionStartedAt, effectiveTimeLimitMs, correct ? previousStreak + 1 : 0);
    const answer = { playerId, questionIndex: this.currentIndex, optionIndex: request.optionIndex, submittedAt: this.now(), idempotencyKey: request.idempotencyKey, score };
    this.answers.push(answer); this.scores.set(playerId, (this.scores.get(playerId) ?? 0) + score.total); this.streaks.set(playerId, correct ? previousStreak + 1 : 0);
    this.xp.set(playerId, (this.xp.get(playerId) ?? 0) + (correct ? 100 : 10));
    const result = { accepted: true }; this.idempotency.set(idempotencyKey, result); this.emit("answer.accepted", { playerId, questionIndex: this.currentIndex }); return result;
  }

  tick(at = this.now()) {
    if (this.isTimedRepeat && this.phase !== "lobby" && this.phase !== "paused" && this.phase !== "ended" && this.sessionDeadlineAt > 0 && at >= this.sessionDeadlineAt) {
      this.endSession();
      return;
    }
    if (this.phase === "question") {
      const complete = this.players.size > 0 && [...this.players.keys()].every(id => {
        const answer = this.answers.find(a => a.playerId === id && a.questionIndex === this.currentIndex);
        return answer && at >= answer.submittedAt + 1500;
      });
      if (at >= this.deadlineAt || complete) this.revealQuestion();
    } else if (this.phase === "reveal" && at >= this.revealUntil) this.nextQuestion();
  }

  private revealQuestion() {
    if (this.isTimedRepeat && this.sessionDeadlineAt > 0 && this.now() >= this.sessionDeadlineAt) { this.endSession(); return; }
    this.phase = "reveal";
    this.revealUntil = this.now() + 3000;
    this.emit("question.revealed", { questionIndex: this.currentIndex });
  }
  nextQuestion() {
    if (this.phase !== "reveal") throw new Error("invalid_phase");
    if (this.now() < this.revealUntil) throw new Error("reveal_in_progress");
    if (this.isTimedRepeat && this.sessionDeadlineAt > 0 && this.now() >= this.sessionDeadlineAt) { this.endSession(); return; }
    const nextIndex = this.currentIndex + 1;
    if (!this.isTimedRepeat && nextIndex >= this.snapshot.questions.length) { this.endSession(); return; }
    if (this.isTimedRepeat && nextIndex >= this.playOrder.length) this.appendShuffledRound();
    this.currentIndex = nextIndex;
    this.openQuestion();
  }

  state(): PublicSessionState {
    const question = this.currentQuestion();
    return PublicSessionState.parse({
      code: this.code,
      questionCount: this.snapshot.questions.length,
      ...(this.isTimedRepeat ? {
        sessionMode: "timed-repeat",
        sessionDurationMs: this.snapshot.sessionDurationMs,
        ...(this.sessionDeadlineAt > 0 && this.phase !== "ended" ? { sessionDeadlineAt: this.sessionDeadlineAt } : {}),
        sessionRemainingMs: this.phase === "paused" ? this.pausedSessionRemaining : this.phase === "ended" ? 0 : this.sessionDeadlineAt > 0 ? Math.max(0, this.sessionDeadlineAt - this.now()) : this.snapshot.sessionDurationMs,
      } : {}),
      phase: this.phase,
      lobbyLocked: this.lobbyLocked,
      teamCount: this.teamCount,
      teamAssignmentMode: this.teamAssignmentMode,
      nicknameMode: this.nicknameMode,
      players: [...this.players.values()].map(player => ({ ...player, answered: this.answers.some(answer => answer.playerId === player.id && answer.questionIndex === this.currentIndex) })),
      question: question && this.phase !== "lobby" && this.phase !== "ended" ? { index: this.currentIndex, prompt: question.prompt, options: question.options, deadlineAt: this.deadlineAt, timeLimitMs: Math.max(1, this.deadlineAt - this.questionStartedAt), ...(this.phase === "paused" ? { remainingMs: this.pausedRemaining } : {}) } : undefined,
      revealUntil: this.phase === "reveal" ? this.revealUntil : undefined,
      reveal: this.phase === "reveal" && question ? { correctOption: question.correctOption, explanation: question.explanation } : undefined,
      questionIndex: this.currentIndex,
      answeredCount: this.answers.filter(a => a.questionIndex === this.currentIndex).length,
    });
  }
  get questionsPlayed() { return this.events.some(event => event.type === "question.opened") ? this.currentIndex + 1 : 0; }
  score(playerId: string) { return this.scores.get(playerId) ?? 0; }
  playerResult(playerId: string) {
    const answer = this.answers.find(a => a.playerId === playerId && a.questionIndex === this.currentIndex);
    if (this.phase !== "reveal" && this.phase !== "ended") {
      return {
        questionIndex: this.currentIndex,
        answered: Boolean(answer),
        selectedOption: answer?.optionIndex,
      };
    }
    return { questionIndex: this.currentIndex, score: this.score(playerId), xp: this.xp.get(playerId) ?? 0,
      questionXp: answer ? (answer.score.base ? 100 : 10) : 0,
      questionScore: answer?.score.total ?? 0, correct: Boolean(answer?.score.base),
      answered: Boolean(answer), selectedOption: answer?.optionIndex,
      correctOption: answer ? this.currentQuestion().correctOption : undefined,
      streak: this.streaks.get(playerId) ?? 0 };
  }
  answerBreakdown(playerId: string) {
    if (!this.players.has(playerId)) throw new Error("player_not_found");
    return this.playOrder.slice(0, Math.min(this.questionsPlayed, this.playOrder.length)).map((sourceQuestionIndex, questionIndex) => {
      const question = this.snapshot.questions[sourceQuestionIndex]!;
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
        score: answer?.score.total ?? 0,
      };
    });
  }
  leaderboard() { return [...this.players.values()].map(p => ({ id: p.id, displayName: p.displayName, score: this.score(p.id), ...(p.teamId ? { teamId: p.teamId, teamName: p.teamName } : {}) })).sort((a,b) => b.score - a.score); }
  teamLeaderboard() {
    const teams = new Map<string, { id: string; name: string; score: number; players: number }>();
    for (const player of this.players.values()) {
      if (!player.teamId) continue;
      const team = teams.get(player.teamId) ?? { id: player.teamId, name: player.teamName ?? player.teamId, score: 0, players: 0 };
      team.score += this.score(player.id);
      team.players += 1;
      teams.set(player.teamId, team);
    }
    return [...teams.values()].sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
  }
  private validateNickname(displayName?: string, exceptPlayerId?: string) {
    const name = (displayName ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ");
    if (!name) throw new Error("nickname_required");
    if (name.length > 32 || /[\u0000-\u001f\u007f<>]/u.test(name) || /(?:https?:\/\/|www\.)/iu.test(name)) throw new Error("nickname_invalid");
    const normalized = name.toLocaleLowerCase("en-US");
    if ([...this.players.values()].some(player => player.id !== exceptPlayerId && player.displayName.normalize("NFKC").toLocaleLowerCase("en-US") === normalized)) throw new Error("nickname_taken");
    return name;
  }
  private randomSmallestTeamIndex(sizes: number[]) {
    const minSize = Math.min(...sizes);
    const smallestTeams = sizes.flatMap((size, index) => size === minSize ? [index] : []);
    return smallestTeams[Math.floor(Math.random() * smallestTeams.length)]!;
  }
  private assignPlayerToRandomTeam(playerId: string) {
    if (this.teamCount === 0 || this.teamAssignmentMode !== "random") return;
    const sizes = Array.from({ length: this.teamCount }, () => 0);
    for (const player of this.players.values()) {
      if (player.id === playerId || !player.teamId) continue;
      const teamIndex = Number(player.teamId.slice("team-".length)) - 1;
      if (teamIndex >= 0 && teamIndex < sizes.length) sizes[teamIndex] = sizes[teamIndex]! + 1;
    }
    const teamIndex = this.randomSmallestTeamIndex(sizes);
    const player = this.players.get(playerId);
    if (player) this.players.set(playerId, { ...player, teamId: `team-${teamIndex + 1}`, teamName: `Team ${teamIndex + 1}` });
  }
  private assignTeams() {
    if (this.teamCount === 0 || this.teamAssignmentMode === "manual") {
      for (const player of this.players.values()) {
        const { teamId: _teamId, teamName: _teamName, ...individual } = player;
        this.players.set(player.id, individual);
      }
      return;
    }
    const sizes = Array.from({ length: this.teamCount }, () => 0);
    const shuffledPlayers = [...this.players.values()];
    for (let index = shuffledPlayers.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffledPlayers[index], shuffledPlayers[swapIndex]] = [shuffledPlayers[swapIndex]!, shuffledPlayers[index]!];
    }
    for (const player of shuffledPlayers) {
      const teamIndex = this.randomSmallestTeamIndex(sizes);
      sizes[teamIndex] = sizes[teamIndex]! + 1;
      this.players.set(player.id, { ...player, teamId: `team-${teamIndex + 1}`, teamName: `Team ${teamIndex + 1}` });
    }
  }
  private get isTimedRepeat() { return this.snapshot.sessionMode === "timed-repeat"; }
  private currentQuestion() { return this.snapshot.questions[this.playOrder[this.currentIndex] ?? 0]!; }
  private shuffledRound() {
    const questions = this.snapshot.questions.map((_, index) => index);
    for (let index = questions.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [questions[index], questions[swapIndex]] = [questions[swapIndex]!, questions[index]!];
    }
    return questions;
  }
  private appendShuffledRound() {
    const round = this.shuffledRound();
    const previousQuestion = this.playOrder.at(-1);
    if (round.length > 1 && round[0] === previousQuestion) {
      const swapIndex = round.findIndex(questionIndex => questionIndex !== previousQuestion);
      [round[0], round[swapIndex]] = [round[swapIndex]!, round[0]!];
    }
    this.playOrder.push(...round);
  }
  private openQuestion() {
    this.phase = "question";
    this.questionStartedAt = this.now();
    const question = this.currentQuestion();
    this.deadlineAt = this.questionStartedAt + question.timeLimitMs;
    if (this.isTimedRepeat && this.sessionDeadlineAt > 0) this.deadlineAt = Math.min(this.deadlineAt, this.sessionDeadlineAt);
    this.emit("question.opened", { questionIndex: this.currentIndex, deadlineAt: this.deadlineAt });
  }
  private endSession() { if (this.phase === "ended") return; this.phase = "ended"; this.emit("session.ended"); }
  private emit(type: string, payload?: unknown) { this.events.push({ id: randomUUID(), at: this.now(), type, payload }); }
}

function secureEqual(expected: string | undefined, received: string | undefined) { if (!expected || !received || expected.length !== received.length) return false; return timingSafeEqual(Buffer.from(expected), Buffer.from(received)); }
function tokenDigest(token: string) { return createHash("sha256").update(token).digest("hex"); }

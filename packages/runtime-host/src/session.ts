import { randomUUID } from "node:crypto";
import { ApprovedQuestion, AnswerRequest, GameSnapshot, HostCommand, Player, PublicSessionState, ScoreBreakdown, calculateScore } from "@ckadinti/contracts";

export type SessionEvent = { id: string; at: number; type: string; playerId?: string; payload?: unknown };
export type AnswerResult = { accepted: boolean; duplicate?: boolean; reason?: string; score?: ScoreBreakdown };
type Answer = { playerId: string; questionIndex: number; optionIndex: number; submittedAt: number; score: ScoreBreakdown };

export class AuthoritativeSession {
  readonly snapshot: Readonly<GameSnapshot>;
  readonly players = new Map<string, Player>();
  readonly events: SessionEvent[] = [];
  readonly answers: Answer[] = [];
  private readonly idempotency = new Map<string, AnswerResult>();
  private readonly scores = new Map<string, number>();
  private readonly streaks = new Map<string, number>();
  private currentIndex = 0;
  private deadlineAt = 0;
  private phase: PublicSessionState["phase"] = "lobby";
  private lobbyLocked = false;

  constructor(readonly code: string, snapshot: GameSnapshot, private now = () => Date.now()) {
    this.snapshot = structuredClone(snapshot);
    this.emit("session.created", { snapshotId: snapshot.id });
  }

  join(displayName: string, playerId: string = randomUUID()): Player {
    if (this.lobbyLocked || this.phase !== "lobby") throw new Error("lobby_closed");
    const player = Player.parse({ id: playerId, displayName, connected: true, joinedAt: this.now() });
    this.players.set(player.id, player);
    this.scores.set(player.id, 0);
    this.streaks.set(player.id, 0);
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

  disconnect(playerId: string) {
    const existing = this.players.get(playerId);
    if (existing) { this.players.set(playerId, { ...existing, connected: false }); this.emit("player.disconnected", { playerId }); }
  }

  command(command: HostCommand) {
    if (command.type === "start") { if (this.phase !== "lobby") throw new Error("invalid_phase"); this.phase = "question"; this.openQuestion(); }
    if (command.type === "pause") { if (this.phase !== "question") throw new Error("invalid_phase"); this.phase = "paused"; this.emit("session.paused"); }
    if (command.type === "resume") { if (this.phase !== "paused") throw new Error("invalid_phase"); this.phase = "question"; this.deadlineAt = this.now() + this.snapshot.questions[this.currentIndex]!.timeLimitMs; this.emit("session.resumed"); }
    if (command.type === "end") { this.phase = "ended"; this.emit("session.ended"); }
    if (command.type === "lock-lobby") { this.lobbyLocked = command.locked; this.emit("lobby.locked", { locked: command.locked }); }
    if (command.type === "kick") { this.players.delete(command.playerId); this.emit("player.kicked", { playerId: command.playerId }); }
  }

  answer(playerId: string, request: AnswerRequest): AnswerResult {
    const cached = this.idempotency.get(request.idempotencyKey); if (cached) return { ...cached, duplicate: true };
    const reject = (reason: string): AnswerResult => { const result = { accepted: false, reason }; this.idempotency.set(request.idempotencyKey, result); return result; };
    if (this.phase !== "question") return reject("not_accepting_answers");
    if (request.questionIndex !== this.currentIndex) return reject("stale_question");
    if (this.now() > this.deadlineAt) return reject("deadline_passed");
    if (!this.players.has(playerId)) return reject("player_not_found");
    const question = this.snapshot.questions[this.currentIndex]!;
    const previousStreak = this.streaks.get(playerId) ?? 0;
    const correct = request.optionIndex === question.correctOption;
    const score = calculateScore(correct, this.now() - (this.deadlineAt - question.timeLimitMs), question.timeLimitMs, correct ? previousStreak + 1 : 0);
    const answer = { playerId, questionIndex: this.currentIndex, optionIndex: request.optionIndex, submittedAt: this.now(), score };
    this.answers.push(answer); this.scores.set(playerId, (this.scores.get(playerId) ?? 0) + score.total); this.streaks.set(playerId, correct ? previousStreak + 1 : 0);
    const result = { accepted: true, score }; this.idempotency.set(request.idempotencyKey, result); this.emit("answer.accepted", { playerId, questionIndex: this.currentIndex }); return result;
  }

  tick(at = this.now()) { if (this.phase === "question" && at >= this.deadlineAt) { this.phase = "reveal"; this.emit("question.revealed", { questionIndex: this.currentIndex }); } }

  nextQuestion() { if (this.phase !== "reveal") throw new Error("invalid_phase"); if (this.currentIndex + 1 >= this.snapshot.questions.length) { this.phase = "ended"; this.emit("session.ended"); } else { this.currentIndex += 1; this.openQuestion(); } }

  state(): PublicSessionState { const question = this.phase === "question" || this.phase === "paused" ? this.snapshot.questions[this.currentIndex] : undefined; return PublicSessionState.parse({ code: this.code, phase: this.phase, lobbyLocked: this.lobbyLocked, players: [...this.players.values()], question: question && { index: this.currentIndex, prompt: question.prompt, options: question.options, deadlineAt: this.deadlineAt }, questionIndex: this.currentIndex, answeredCount: this.answers.filter(a => a.questionIndex === this.currentIndex).length }); }
  score(playerId: string) { return this.scores.get(playerId) ?? 0; }
  private openQuestion() { this.deadlineAt = this.now() + this.snapshot.questions[this.currentIndex]!.timeLimitMs; this.emit("question.opened", { questionIndex: this.currentIndex, deadlineAt: this.deadlineAt }); }
  private emit(type: string, payload?: unknown) { this.events.push({ id: randomUUID(), at: this.now(), type, payload }); }
}

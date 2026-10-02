import { z } from "zod";

export const SessionPhase = z.enum(["lobby", "question", "reveal", "paused", "ended"]);
export type SessionPhase = z.infer<typeof SessionPhase>;

export const Player = z.object({
  id: z.string().min(1),
  displayName: z.string().trim().min(1).max(32),
  emblem: z.string().trim().min(1).max(32).optional(),
  connected: z.boolean(),
  joinedAt: z.number().int().nonnegative(),
});
export type Player = z.infer<typeof Player>;

export const ApprovedQuestion = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(6),
  correctOption: z.number().int().nonnegative(),
  timeLimitMs: z.number().int().positive().max(10 * 60_000).default(10_000),
  explanation: z.string().optional(),
}).superRefine((q, ctx) => {
  if (q.correctOption >= q.options.length) ctx.addIssue({ code: "custom", message: "correctOption is out of range" });
});
export type ApprovedQuestion = z.infer<typeof ApprovedQuestion>;

export const GameSnapshot = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  questions: z.array(ApprovedQuestion).min(1),
});
export type GameSnapshot = z.infer<typeof GameSnapshot>;

export const JoinRequest = z.object({ displayName: Player.shape.displayName, emblem: Player.shape.emblem });
export const SessionCodeParam = z.object({ code: z.string().trim().length(6) });
export const CreateSessionRequest = z.object({ code: z.string().trim().length(6).optional(), snapshot: GameSnapshot });
export const ReconnectRequest = z.object({ playerId: Player.shape.id });
export const AnswerRequest = z.object({
  questionIndex: z.number().int().nonnegative(),
  optionIndex: z.number().int().nonnegative(),
  idempotencyKey: z.string().uuid(),
});
export type AnswerRequest = z.infer<typeof AnswerRequest>;
export const HttpAnswerRequest = AnswerRequest.extend({ playerId: Player.shape.id });
export type HttpAnswerRequest = z.infer<typeof HttpAnswerRequest>;
export const HttpCommandRequest = z.object({ command: z.unknown() });
export const HostCommand = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set-timer"), timeLimitMs: z.number().int().min(1000).max(600_000) }),
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("end") }),
  z.object({ type: z.literal("lock-lobby"), locked: z.boolean() }),
  z.object({ type: z.literal("kick"), playerId: z.string().min(1) }),
  z.object({ type: z.literal("reveal") }),
  z.object({ type: z.literal("next") }),
]);
export type HostCommand = z.infer<typeof HostCommand>;

export const PublicQuestion = z.object({
  index: z.number().int().nonnegative(),
  prompt: z.string(),
  options: z.array(z.string()),
  deadlineAt: z.number().int().positive(),
  timeLimitMs: z.number().int().positive(),
});
export type PublicQuestion = z.infer<typeof PublicQuestion>;

export const PublicSessionState = z.object({
  code: z.string().length(6),
  questionCount: z.number().int().positive(),
  phase: SessionPhase,
  lobbyLocked: z.boolean(),
  players: z.array(Player),
  question: PublicQuestion.optional(),
  questionIndex: z.number().int().nonnegative().optional(),
  answeredCount: z.number().int().nonnegative(),
  reveal: z.object({ correctOption: z.number().int().nonnegative(), explanation: z.string().optional() }).optional(),
});
export type PublicSessionState = z.infer<typeof PublicSessionState>;

export const SocketEvents = {
  join: JoinRequest,
  answer: AnswerRequest,
  hostCommand: HostCommand,
} as const;

export type ScoreBreakdown = { base: number; speedBonus: number; streakBonus: number; total: number };

export function calculateScore(correct: boolean, elapsedMs: number, timeLimitMs: number, streak: number): ScoreBreakdown {
  if (!correct) return { base: 0, speedBonus: 0, streakBonus: 0, total: 0 };
  const boundedElapsed = Math.max(0, Math.min(elapsedMs, timeLimitMs));
  const speedBonus = Math.round(60 * (1 - boundedElapsed / timeLimitMs));
  const streakBonus = Math.min(40, Math.max(0, streak) * 10);
  return { base: 1000, speedBonus, streakBonus, total: 1000 + speedBonus + streakBonus };
}

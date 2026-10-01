import { z } from "zod";

export const SessionPhase = z.enum(["lobby", "question", "reveal", "paused", "ended"]);
export type SessionPhase = z.infer<typeof SessionPhase>;

export const Player = z.object({
  id: z.string().min(1),
  displayName: z.string().trim().min(1).max(32),
  connected: z.boolean(),
  joinedAt: z.number().int().nonnegative(),
});
export type Player = z.infer<typeof Player>;

export const ApprovedQuestion = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(6),
  correctOption: z.number().int().nonnegative(),
  timeLimitMs: z.number().int().positive().max(10 * 60_000),
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

export const JoinRequest = z.object({ displayName: Player.shape.displayName });
export const AnswerRequest = z.object({
  questionIndex: z.number().int().nonnegative(),
  optionIndex: z.number().int().nonnegative(),
  idempotencyKey: z.string().uuid(),
});
export type AnswerRequest = z.infer<typeof AnswerRequest>;
export const HostCommand = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("end") }),
  z.object({ type: z.literal("lock-lobby"), locked: z.boolean() }),
  z.object({ type: z.literal("kick"), playerId: z.string().min(1) }),
]);
export type HostCommand = z.infer<typeof HostCommand>;

export const PublicQuestion = z.object({
  index: z.number().int().nonnegative(),
  prompt: z.string(),
  options: z.array(z.string()),
  deadlineAt: z.number().int().positive(),
});
export type PublicQuestion = z.infer<typeof PublicQuestion>;

export const PublicSessionState = z.object({
  code: z.string().length(6),
  phase: SessionPhase,
  lobbyLocked: z.boolean(),
  players: z.array(Player),
  question: PublicQuestion.optional(),
  questionIndex: z.number().int().nonnegative().optional(),
  answeredCount: z.number().int().nonnegative(),
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

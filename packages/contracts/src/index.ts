import { z } from "zod";

export const lessonSourceTypeSchema = z.enum(["txt", "markdown", "pdf", "docx"]);
export type LessonSourceType = z.infer<typeof lessonSourceTypeSchema>;

export const lessonImportRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  subject: z.string().trim().max(120).optional(),
  language: z.string().trim().min(2).max(16).default("en"),
  sourceType: lessonSourceTypeSchema,
  originalFilename: z.string().trim().max(255).optional(),
  normalizedText: z.string().trim().min(1),
});
export type LessonImportRequest = z.infer<typeof lessonImportRequestSchema>;

export const lessonListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  subject: z.string().nullable(),
  language: z.string(),
  sourceType: lessonSourceTypeSchema,
  originalFilename: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type LessonListItem = z.infer<typeof lessonListItemSchema>;

export const lessonImportResultSchema = z.object({
  lesson: lessonListItemSchema,
  duplicate: z.boolean(),
});
export const lessonIdSchema = z.string().uuid();
export const MAX_QUIZ_QUESTIONS = 200;
export const MAX_LESSON_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_LESSON_TEXT_CHARS = 2_000_000;
export const questionCountSchema = z.number().int().min(1).max(MAX_QUIZ_QUESTIONS);
export const generateQuizRequestSchema = z.object({
  lessonId: lessonIdSchema,
  questionCount: questionCountSchema.default(8),
});

export const questionKindSchema = z.enum(["multiple-choice", "true-false"]);
export const difficultySchema = z.enum(["easy", "medium", "hard"]);
export const reviewStatusSchema = z.enum(["draft", "needs-review", "approved", "rejected"]);

export const generatedQuestionSchema = z.object({
  kind: questionKindSchema,
  prompt: z.string().trim().min(1).max(1000),
  explanation: z.string().trim().min(1).max(2000),
  topic: z.string().trim().min(1).max(120),
  difficulty: difficultySchema,
  confidence: z.enum(["low", "medium", "high"]),
  options: z.array(z.object({ text: z.string().trim().min(1).max(500), isCorrect: z.boolean() })).min(2).max(6),
  evidence: z.array(z.object({ quoteStart: z.number().int().nonnegative(), quoteEnd: z.number().int().positive() })).min(1),
}).superRefine((question, context) => {
  if (question.options.filter((option) => option.isCorrect).length !== 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "A question must have exactly one correct option", path: ["options"] });
  }
});
export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;

export const quizGenerationResultSchema = z.object({
  title: z.string().trim().min(1).max(160),
  language: z.string().trim().min(2).max(16),
  difficulty: difficultySchema,
  questions: z.array(generatedQuestionSchema).min(1).max(MAX_QUIZ_QUESTIONS),
});
export type QuizGenerationResult = z.infer<typeof quizGenerationResultSchema>;

// Provider-facing shape uses block-relative citations; the desktop resolves quotes
// to absolute source offsets before applying generatedQuestionSchema.
export const modelQuizOutputSchema = z.object({
  title: z.string(),
  language: z.string(),
  difficulty: difficultySchema,
  questions: z.array(z.object({
    kind: questionKindSchema,
    prompt: z.string(),
    explanation: z.string(),
    topic: z.string(),
    difficulty: difficultySchema,
    confidence: z.enum(["low", "medium", "high"]),
    options: z.array(z.object({ text: z.string(), isCorrect: z.boolean() })),
    evidence: z.array(z.object({ blockOrdinal: z.number().int().nonnegative(), quote: z.string() })),
  })),
});

// Runtime-compatible approved quiz contract. Edin's host consumes this shape
// when an approved teacher quiz becomes a game snapshot.
export const SessionPhase = z.enum(["lobby", "question", "reveal", "paused", "ended"]);
export type SessionPhase = z.infer<typeof SessionPhase>;

export const ApprovedQuestion = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(6),
  correctOption: z.number().int().nonnegative(),
  timeLimitMs: z.number().int().positive().max(10 * 60_000).default(10_000),
  explanation: z.string().trim().min(1).max(2000).optional(),
}).superRefine((question, context) => {
  if (question.correctOption >= question.options.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "correctOption is out of range" });
  }
});
export type ApprovedQuestion = z.infer<typeof ApprovedQuestion>;

export const sessionPlayModeSchema = z.enum(["fixed", "timed-repeat"]);
export type SessionPlayMode = z.infer<typeof sessionPlayModeSchema>;
export const MIN_SESSION_DURATION_MS = 60_000;
export const MAX_SESSION_DURATION_MS = 120 * 60_000;

export const GameSnapshot = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  questions: z.array(ApprovedQuestion).min(1),
  // Optional to preserve snapshots created before configurable session modes.
  sessionMode: sessionPlayModeSchema.optional(),
  sessionDurationMs: z.number().int().min(MIN_SESSION_DURATION_MS).max(MAX_SESSION_DURATION_MS).optional(),
}).superRefine((snapshot, context) => {
  if (snapshot.sessionMode === "timed-repeat" && snapshot.sessionDurationMs === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Timed repeat sessions require a duration", path: ["sessionDurationMs"] });
  }
});
export type GameSnapshot = z.infer<typeof GameSnapshot>;

// Runtime contracts shared by the teacher host and student browser. Keep these
// additive so the lesson/AI/review contracts above remain the single source of truth.
export const Player = z.object({
  id: z.string().min(1),
  displayName: z.string().trim().min(1).max(32),
  emblem: z.string().trim().min(1).max(32).optional(),
  connected: z.boolean(),
  joinedAt: z.number().int().nonnegative(),
});
export type Player = z.infer<typeof Player>;

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
  remainingMs: z.number().int().nonnegative().optional(),
});
export type PublicQuestion = z.infer<typeof PublicQuestion>;

// Database-free demo only. The quiz payload excludes answer keys, explanations,
// citations and scores; correctness is disclosed only after an answer submission.
export const StudentQuizPreview = z.object({
  title: z.string().min(1),
  attemptToken: z.string().uuid(),
  questions: z.array(PublicQuestion.pick({ prompt: true, options: true }).extend({ id: z.string().uuid() })).min(1),
});
export type StudentQuizPreview = z.infer<typeof StudentQuizPreview>;
export const StudentPreviewAnswerSubmission = z.object({
  attemptToken: z.string().uuid(),
  questionId: z.string().uuid(),
  optionIndex: z.number().int().nonnegative(),
});
export const StudentPreviewAnswerResult = z.object({
  correct: z.boolean(),
  correctAnswer: z.string().min(1),
});
export type StudentPreviewAnswerResult = z.infer<typeof StudentPreviewAnswerResult>;

export const PublicSessionState = z.object({
  code: z.string().length(6),
  questionCount: z.number().int().positive(),
  sessionMode: sessionPlayModeSchema.optional(),
  sessionDurationMs: z.number().int().positive().optional(),
  sessionDeadlineAt: z.number().int().positive().optional(),
  sessionRemainingMs: z.number().int().nonnegative().optional(),
  phase: SessionPhase,
  lobbyLocked: z.boolean(),
  players: z.array(Player),
  question: PublicQuestion.optional(),
  questionIndex: z.number().int().nonnegative().optional(),
  answeredCount: z.number().int().nonnegative(),
  reveal: z.object({ correctOption: z.number().int().nonnegative(), explanation: z.string().optional() }).optional(),
});
export type PublicSessionState = z.infer<typeof PublicSessionState>;
export const SocketEvents = { join: JoinRequest, answer: AnswerRequest, hostCommand: HostCommand } as const;
export type ScoreBreakdown = { base: number; speedBonus: number; streakBonus: number; total: number };
export function calculateScore(correct: boolean, elapsedMs: number, timeLimitMs: number, streak: number): ScoreBreakdown {
  if (!correct) return { base: 0, speedBonus: 0, streakBonus: 0, total: 0 };
  const boundedElapsed = Math.max(0, Math.min(elapsedMs, timeLimitMs));
  const speedBonus = Math.round(60 * (1 - boundedElapsed / timeLimitMs));
  const streakBonus = Math.min(40, Math.max(0, streak) * 10);
  return { base: 1000, speedBonus, streakBonus, total: 1000 + speedBonus + streakBonus };
}

export const gameSnapshotFromApprovedQuestions = (input: {
  id: string;
  title: string;
  questions: Array<{
    id: string;
    prompt: string;
    options: Array<{ text: string; isCorrect: boolean }>;
    timeLimitMs?: number;
    explanation?: string;
  }>;
}): GameSnapshot => GameSnapshot.parse({
  id: input.id,
  title: input.title,
  questions: input.questions.map((question) => ({
    id: question.id,
    prompt: question.prompt,
    options: question.options.map((option) => option.text),
    correctOption: question.options.findIndex((option) => option.isCorrect),
    timeLimitMs: question.timeLimitMs ?? 30_000,
    ...(question.explanation ? { explanation: question.explanation } : {}),
  })),
});

export const reviewQuestionUpdateSchema = z.object({
  questionId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(1000).optional(),
  explanation: z.string().trim().min(1).max(2000).optional(),
  reviewStatus: reviewStatusSchema,
});

export const reviewQuestionSaveSchema = z.object({
  questionId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(1000),
  explanation: z.string().trim().min(1).max(2000),
  topic: z.string().trim().min(1).max(120),
  difficulty: difficultySchema,
  options: z.array(z.object({ text: z.string().trim().min(1).max(500), isCorrect: z.boolean() })).min(2).max(6),
}).superRefine((value, context) => {
  if (value.options.filter((option) => option.isCorrect).length !== 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Select exactly one correct answer.", path: ["options"] });
  }
});
export const manualQuestionCreateSchema = z.object({
  quizId: z.string().uuid(),
  kind: questionKindSchema,
  prompt: z.string().trim().min(1).max(1000),
  explanation: z.string().trim().min(1).max(2000),
  topic: z.string().trim().min(1).max(120),
  difficulty: difficultySchema,
  options: z.array(z.object({ text: z.string().trim().min(1).max(500), isCorrect: z.boolean() })).min(2).max(6),
}).superRefine((value, context) => {
  if (value.options.filter((option) => option.isCorrect).length !== 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Select exactly one correct answer.", path: ["options"] });
  }
});
export const questionReviewDecisionSchema = z.object({ questionId: z.string().uuid(), reviewStatus: z.enum(["approved", "rejected"]) });
export const questionIdSchema = z.string().uuid();
export const quizIdSchema = z.string().uuid();
export const quizReorderSchema = z.object({ quizId: quizIdSchema, orderedQuestionIds: z.array(z.string().uuid()).min(1).max(100) });

export const teacherIpcErrorSchema = z.object({ code: z.string(), message: z.string() });
export const teacherIpcResultSchema = <T extends z.ZodTypeAny>(data: T) => z.object({ ok: z.literal(true), data }).or(z.object({ ok: z.literal(false), error: teacherIpcErrorSchema }));

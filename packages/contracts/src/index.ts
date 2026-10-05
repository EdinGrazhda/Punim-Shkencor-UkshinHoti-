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
export const generateQuizRequestSchema = z.object({
  lessonId: lessonIdSchema,
  questionCount: z.number().int().min(3).max(20).default(8),
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
  questions: z.array(generatedQuestionSchema).min(1).max(50),
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
  timeLimitMs: z.number().int().positive().max(10 * 60_000),
  explanation: z.string().trim().min(1).max(2000).optional(),
}).superRefine((question, context) => {
  if (question.correctOption >= question.options.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "correctOption is out of range" });
  }
});
export type ApprovedQuestion = z.infer<typeof ApprovedQuestion>;

export const GameSnapshot = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  questions: z.array(ApprovedQuestion).min(1),
});
export type GameSnapshot = z.infer<typeof GameSnapshot>;

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

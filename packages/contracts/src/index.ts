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

export const reviewQuestionUpdateSchema = z.object({
  questionId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(1000).optional(),
  explanation: z.string().trim().min(1).max(2000).optional(),
  reviewStatus: reviewStatusSchema,
});

export const teacherIpcErrorSchema = z.object({ code: z.string(), message: z.string() });
export const teacherIpcResultSchema = <T extends z.ZodTypeAny>(data: T) => z.object({ ok: z.literal(true), data }).or(z.object({ ok: z.literal(false), error: teacherIpcErrorSchema }));

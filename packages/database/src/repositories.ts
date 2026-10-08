import { and, asc, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

type Database = PostgresJsDatabase<typeof schema>;
type LessonInsert = typeof schema.lessons.$inferInsert;
type QuizInsert = typeof schema.quizzes.$inferInsert;
type QuestionInsert = typeof schema.questions.$inferInsert;

export interface LessonBlockInput {
  heading: string | null;
  charStart: number;
  charEnd: number;
}

export interface CreateLessonInput extends Omit<LessonInsert, "id" | "createdAt" | "updatedAt"> {
  blocks: LessonBlockInput[];
}

export function createRepositories(db: Database) {
  const lessons = {
    async create(input: CreateLessonInput) {
      const now = new Date();
      return db.transaction(async (tx) => {
        const [lesson] = await tx.insert(schema.lessons).values({
          id: crypto.randomUUID(),
          title: input.title,
          subject: input.subject,
          language: input.language,
          sourceType: input.sourceType,
          originalFilename: input.originalFilename,
          normalizedText: input.normalizedText,
          contentSha256: input.contentSha256,
          createdAt: now,
          updatedAt: now,
        }).onConflictDoNothing({ target: schema.lessons.contentSha256 }).returning();

        if (!lesson) {
          const [existing] = await tx.select().from(schema.lessons)
            .where(eq(schema.lessons.contentSha256, input.contentSha256)).limit(1);
          if (!existing) throw new Error("The matching lesson was not available after duplicate detection.");
          return { lesson: existing, duplicate: true };
        }

        if (input.blocks.length) {
          await tx.insert(schema.lessonBlocks).values(input.blocks.map((block, ordinal) => ({
            id: crypto.randomUUID(),
            lessonId: lesson.id,
            ordinal,
            heading: block.heading,
            charStart: block.charStart,
            charEnd: block.charEnd,
            createdAt: now,
            updatedAt: now,
          })));
        }
        return { lesson, duplicate: false };
      });
    },

    async list() {
      return db.select({
        id: schema.lessons.id,
        title: schema.lessons.title,
        subject: schema.lessons.subject,
        language: schema.lessons.language,
        sourceType: schema.lessons.sourceType,
        originalFilename: schema.lessons.originalFilename,
        createdAt: schema.lessons.createdAt,
        updatedAt: schema.lessons.updatedAt,
      }).from(schema.lessons).orderBy(desc(schema.lessons.updatedAt));
    },

    async get(id: string) {
      const [lesson] = await db.select().from(schema.lessons).where(eq(schema.lessons.id, id)).limit(1);
      if (!lesson) return null;
      const blocks = await db.select().from(schema.lessonBlocks)
        .where(eq(schema.lessonBlocks.lessonId, id)).orderBy(asc(schema.lessonBlocks.ordinal));
      return { ...lesson, blocks };
    },

    async delete(id: string) {
      const deleted = await db.delete(schema.lessons).where(eq(schema.lessons.id, id)).returning({ id: schema.lessons.id });
      return deleted.length > 0;
    },
  };

  const quizzes = {
    async create(input: Omit<QuizInsert, "id" | "createdAt" | "updatedAt" | "status" | "approvedAt">) {
      const now = new Date();
      const [quiz] = await db.insert(schema.quizzes).values({
        ...input,
        id: crypto.randomUUID(),
        status: "draft",
        approvedAt: null,
        createdAt: now,
        updatedAt: now,
      }).returning();
      return quiz;
    },

    async list() {
      return db.select().from(schema.quizzes).orderBy(desc(schema.quizzes.updatedAt));
    },

    async getForReview(id: string) {
      const [quiz] = await db.select().from(schema.quizzes).where(eq(schema.quizzes.id, id)).limit(1);
      if (!quiz) return null;
      const questionRows = await db.select().from(schema.questions)
        .where(eq(schema.questions.quizId, id)).orderBy(asc(schema.questions.ordinal));
      const items = await Promise.all(questionRows.map(async (question) => {
        const [options, evidence] = await Promise.all([
          db.select().from(schema.questionOptions).where(eq(schema.questionOptions.questionId, question.id)).orderBy(asc(schema.questionOptions.ordinal)),
          db.select().from(schema.questionEvidence).where(eq(schema.questionEvidence.questionId, question.id)),
        ]);
        return { ...question, options, evidence };
      }));
      return { ...quiz, questions: items };
    },

    async update(id: string, patch: Partial<Pick<QuizInsert, "title" | "language" | "difficulty">>) {
      const [quiz] = await db.update(schema.quizzes).set({
        ...patch,
        status: "needs-review",
        approvedAt: null,
        updatedAt: new Date(),
      }).where(eq(schema.quizzes.id, id)).returning();
      return quiz ?? null;
    },

    async approve(id: string) {
      return db.transaction(async (tx) => {
        const rows = await tx.select({ reviewStatus: schema.questions.reviewStatus })
          .from(schema.questions).where(eq(schema.questions.quizId, id));
        if (!rows.length || rows.some((row) => row.reviewStatus !== "approved")) {
          throw new Error("Every question must be reviewed and approved before approving the quiz.");
        }
        const [quiz] = await tx.update(schema.quizzes).set({ status: "approved", approvedAt: new Date(), updatedAt: new Date() })
          .where(eq(schema.quizzes.id, id)).returning();
        return quiz ?? null;
      });
    },
  };

  const questions = {
    async getForReview(id: string) {
      const [question] = await db.select().from(schema.questions).where(eq(schema.questions.id, id)).limit(1);
      if (!question) return null;
      const [[quiz], [options, evidence]] = await Promise.all([
        db.select().from(schema.quizzes).where(eq(schema.quizzes.id, question.quizId)).limit(1),
        Promise.all([
          db.select().from(schema.questionOptions).where(eq(schema.questionOptions.questionId, id)).orderBy(asc(schema.questionOptions.ordinal)),
          db.select().from(schema.questionEvidence).where(eq(schema.questionEvidence.questionId, id)),
        ]),
      ]);
      if (!quiz) return null;
      return { question, quiz, options, evidence };
    },

    async create(
      input: Omit<QuestionInsert, "id" | "createdAt" | "updatedAt" | "reviewStatus">,
      options: Array<{ text: string; isCorrect: boolean }>,
      evidence: Array<{ lessonBlockId: string; quoteStart: number; quoteEnd: number }> = [],
    ) {
      if (options.length < 2 || options.filter((option) => option.isCorrect).length !== 1) {
        throw new Error("A question must have at least two options and exactly one correct option.");
      }
      const now = new Date();
      return db.transaction(async (tx) => {
        const [question] = await tx.insert(schema.questions).values({ ...input, id: crypto.randomUUID(), reviewStatus: "needs-review", createdAt: now, updatedAt: now }).returning();
        if (!question) throw new Error("Question could not be created.");
        if (options.length) await tx.insert(schema.questionOptions).values(options.map((option, ordinal) => ({
          id: crypto.randomUUID(), questionId: question.id, ordinal, ...option,
        })));
        if (evidence.length) await tx.insert(schema.questionEvidence).values(evidence.map((item) => ({
          id: crypto.randomUUID(), questionId: question.id, ...item,
        })));
        await tx.update(schema.quizzes).set({ status: "needs-review", approvedAt: null, updatedAt: now })
          .where(eq(schema.quizzes.id, input.quizId));
        return question;
      });
    },

    async createManual(input: {
      quizId: string; kind: string; prompt: string; explanation: string; topic: string; difficulty: string;
      options: Array<{ text: string; isCorrect: boolean }>;
    }) {
      if (input.options.length < 2 || input.options.filter((option) => option.isCorrect).length !== 1) {
        throw new Error("A question must have at least two options and exactly one correct option.");
      }
      return db.transaction(async (tx) => {
        const [quiz] = await tx.select({ id: schema.quizzes.id }).from(schema.quizzes).where(eq(schema.quizzes.id, input.quizId)).limit(1);
        if (!quiz) return null;
        const [last] = await tx.select({ ordinal: schema.questions.ordinal }).from(schema.questions)
          .where(eq(schema.questions.quizId, input.quizId)).orderBy(desc(schema.questions.ordinal)).limit(1);
        const now = new Date();
        const [question] = await tx.insert(schema.questions).values({
          id: crypto.randomUUID(), quizId: input.quizId, kind: input.kind, prompt: input.prompt,
          explanation: input.explanation, topic: input.topic, difficulty: input.difficulty,
          aiGenerated: false, aiConfidence: null, reviewStatus: "needs-review", ordinal: (last?.ordinal ?? -1) + 1,
          createdAt: now, updatedAt: now,
        }).returning();
        if (!question) throw new Error("Question could not be created.");
        await tx.insert(schema.questionOptions).values(input.options.map((option, ordinal) => ({
          id: crypto.randomUUID(), questionId: question.id, ordinal, ...option,
        })));
        await tx.update(schema.quizzes).set({ status: "needs-review", approvedAt: null, updatedAt: now })
          .where(eq(schema.quizzes.id, input.quizId));
        return question;
      });
    },

    async duplicate(id: string) {
      return db.transaction(async (tx) => {
        const [source] = await tx.select().from(schema.questions).where(eq(schema.questions.id, id)).limit(1);
        if (!source) return null;
        const [last] = await tx.select({ ordinal: schema.questions.ordinal }).from(schema.questions)
          .where(eq(schema.questions.quizId, source.quizId)).orderBy(desc(schema.questions.ordinal)).limit(1);
        const [newQuestion] = await tx.insert(schema.questions).values({
          ...source, id: crypto.randomUUID(), ordinal: (last?.ordinal ?? -1) + 1,
          reviewStatus: "needs-review", createdAt: new Date(), updatedAt: new Date(),
        }).returning();
        if (!newQuestion) throw new Error("Question could not be duplicated.");
        const [options, evidence] = await Promise.all([
          tx.select().from(schema.questionOptions).where(eq(schema.questionOptions.questionId, id)).orderBy(asc(schema.questionOptions.ordinal)),
          tx.select().from(schema.questionEvidence).where(eq(schema.questionEvidence.questionId, id)),
        ]);
        if (options.length) await tx.insert(schema.questionOptions).values(options.map(({ id: _id, questionId: _questionId, ...option }) => ({
          ...option, id: crypto.randomUUID(), questionId: newQuestion.id,
        })));
        if (evidence.length) await tx.insert(schema.questionEvidence).values(evidence.map(({ id: _id, questionId: _questionId, ...item }) => ({
          ...item, id: crypto.randomUUID(), questionId: newQuestion.id,
        })));
        await tx.update(schema.quizzes).set({ status: "needs-review", approvedAt: null, updatedAt: new Date() })
          .where(eq(schema.quizzes.id, source.quizId));
        return newQuestion;
      });
    },

    async approvePending(quizId: string) {
      return db.transaction(async (tx) => {
        const updated = await tx.update(schema.questions).set({ reviewStatus: "approved", updatedAt: new Date() })
          .where(and(eq(schema.questions.quizId, quizId), eq(schema.questions.reviewStatus, "needs-review")))
          .returning({ id: schema.questions.id });
        if (updated.length) await tx.update(schema.quizzes).set({ status: "needs-review", approvedAt: null, updatedAt: new Date() })
          .where(eq(schema.quizzes.id, quizId));
        return updated.length;
      });
    },

    async replaceGeneratedContent(id: string, input: {
      kind: string; prompt: string; explanation: string; topic: string; difficulty: string; confidence: string;
      options: Array<{ text: string; isCorrect: boolean }>;
      evidence: Array<{ lessonBlockId: string; quoteStart: number; quoteEnd: number }>;
    }) {
      if (input.options.length < 2 || input.options.filter((option) => option.isCorrect).length !== 1 || !input.evidence.length) {
        throw new Error("Regenerated questions require valid answers and lesson evidence.");
      }
      return db.transaction(async (tx) => {
        const [existing] = await tx.select().from(schema.questions).where(eq(schema.questions.id, id)).limit(1);
        if (!existing) return null;
        const now = new Date();
        const [question] = await tx.update(schema.questions).set({
          kind: input.kind, prompt: input.prompt, explanation: input.explanation, topic: input.topic,
          difficulty: input.difficulty, aiGenerated: true, aiConfidence: input.confidence,
          reviewStatus: "needs-review", updatedAt: now,
        }).where(eq(schema.questions.id, id)).returning();
        if (!question) return null;
        await tx.delete(schema.questionOptions).where(eq(schema.questionOptions.questionId, id));
        await tx.insert(schema.questionOptions).values(input.options.map((option, ordinal) => ({
          id: crypto.randomUUID(), questionId: id, ordinal, ...option,
        })));
        await tx.delete(schema.questionEvidence).where(eq(schema.questionEvidence.questionId, id));
        await tx.insert(schema.questionEvidence).values(input.evidence.map((item) => ({ id: crypto.randomUUID(), questionId: id, ...item })));
        await tx.update(schema.quizzes).set({ status: "needs-review", approvedAt: null, updatedAt: now })
          .where(eq(schema.quizzes.id, question.quizId));
        return question;
      });
    },

    async update(id: string, patch: Partial<Pick<QuestionInsert, "prompt" | "explanation" | "topic" | "difficulty" | "ordinal">>) {
      return db.transaction(async (tx) => {
        const [question] = await tx.update(schema.questions).set({
          ...patch,
          reviewStatus: "needs-review",
          updatedAt: new Date(),
        }).where(eq(schema.questions.id, id)).returning();
        if (!question) return null;
        await tx.update(schema.quizzes).set({ status: "needs-review", approvedAt: null, updatedAt: new Date() })
          .where(eq(schema.quizzes.id, question.quizId));
        return question;
      });
    },

    async setReviewStatus(id: string, reviewStatus: "approved" | "rejected") {
      return db.transaction(async (tx) => {
        const [question] = await tx.update(schema.questions).set({ reviewStatus, updatedAt: new Date() })
          .where(eq(schema.questions.id, id)).returning();
        if (question && reviewStatus !== "approved") {
          await tx.update(schema.quizzes).set({ status: "needs-review", approvedAt: null, updatedAt: new Date() })
            .where(eq(schema.quizzes.id, question.quizId));
        }
        return question ?? null;
      });
    },

    async replaceOptions(questionId: string, options: Array<{ text: string; isCorrect: boolean }>) {
      if (options.length < 2 || options.filter((option) => option.isCorrect).length !== 1) {
        throw new Error("Provide at least two options and exactly one correct option.");
      }
      return db.transaction(async (tx) => {
        const [question] = await tx.select().from(schema.questions).where(eq(schema.questions.id, questionId)).limit(1);
        if (!question) return false;
        await tx.delete(schema.questionOptions).where(eq(schema.questionOptions.questionId, questionId));
        await tx.insert(schema.questionOptions).values(options.map((option, ordinal) => ({
          id: crypto.randomUUID(), questionId, ordinal, ...option,
        })));
        await tx.update(schema.questions).set({ reviewStatus: "needs-review", updatedAt: new Date() })
          .where(eq(schema.questions.id, questionId));
        await tx.update(schema.quizzes).set({ status: "needs-review", approvedAt: null, updatedAt: new Date() })
          .where(eq(schema.quizzes.id, question.quizId));
        return true;
      });
    },

    async replaceEvidence(questionId: string, evidence: Array<{ lessonBlockId: string; quoteStart: number; quoteEnd: number }>) {
      return db.transaction(async (tx) => {
        const [question] = await tx.select().from(schema.questions).where(eq(schema.questions.id, questionId)).limit(1);
        if (!question) return false;
        await tx.delete(schema.questionEvidence).where(eq(schema.questionEvidence.questionId, questionId));
        if (evidence.length) await tx.insert(schema.questionEvidence).values(evidence.map((item) => ({
          id: crypto.randomUUID(), questionId, ...item,
        })));
        await tx.update(schema.questions).set({ reviewStatus: "needs-review", updatedAt: new Date() })
          .where(eq(schema.questions.id, questionId));
        await tx.update(schema.quizzes).set({ status: "needs-review", approvedAt: null, updatedAt: new Date() })
          .where(eq(schema.quizzes.id, question.quizId));
        return true;
      });
    },

    async delete(id: string) {
      const [question] = await db.select({ quizId: schema.questions.quizId }).from(schema.questions)
        .where(eq(schema.questions.id, id)).limit(1);
      if (!question) return false;
      await db.transaction(async (tx) => {
        await tx.delete(schema.questions).where(eq(schema.questions.id, id));
        await tx.update(schema.quizzes).set({ status: "needs-review", approvedAt: null, updatedAt: new Date() })
          .where(eq(schema.quizzes.id, question.quizId));
      });
      return true;
    },

    async reorder(quizId: string, orderedQuestionIds: string[]) {
      return db.transaction(async (tx) => {
        const current = await tx.select({ id: schema.questions.id }).from(schema.questions)
          .where(eq(schema.questions.quizId, quizId)).orderBy(asc(schema.questions.ordinal));
        if (current.length !== orderedQuestionIds.length || new Set(orderedQuestionIds).size !== current.length ||
          current.some(({ id }) => !orderedQuestionIds.includes(id))) {
          throw new Error("The new order must contain every quiz question exactly once.");
        }
        const now = new Date();
        const offset = current.length;
        for (const [ordinal, { id }] of current.entries()) {
          await tx.update(schema.questions).set({ ordinal: ordinal + offset, updatedAt: now })
            .where(and(eq(schema.questions.id, id), eq(schema.questions.quizId, quizId)));
        }
        for (const [ordinal, id] of orderedQuestionIds.entries()) {
          await tx.update(schema.questions).set({ ordinal, updatedAt: now })
            .where(and(eq(schema.questions.id, id), eq(schema.questions.quizId, quizId)));
        }
        await tx.update(schema.quizzes).set({ status: "needs-review", approvedAt: null, updatedAt: now })
          .where(eq(schema.quizzes.id, quizId));
      });
    },
  };

  const generationJobs = {
    async create(input: Omit<typeof schema.aiGenerationJobs.$inferInsert, "id" | "createdAt" | "updatedAt">) {
      const now = new Date();
      const [job] = await db.insert(schema.aiGenerationJobs).values({
        ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now,
      }).returning();
      return job;
    },

    async updateStatus(id: string, status: string, errorMessage?: string | null, quizId?: string | null) {
      const [job] = await db.update(schema.aiGenerationJobs).set({ status, errorMessage: errorMessage ?? null, ...(quizId !== undefined ? { quizId } : {}), updatedAt: new Date() })
        .where(eq(schema.aiGenerationJobs.id, id)).returning();
      return job ?? null;
    },
  };

  return { lessons, quizzes, questions, generationJobs };
}

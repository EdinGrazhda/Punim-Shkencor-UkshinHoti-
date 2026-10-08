import { randomUUID } from "node:crypto";
import type { ContentRepositories } from "../main/services/content-repositories.js";

type Lesson = NonNullable<Awaited<ReturnType<ContentRepositories["lessons"]["get"]>>>;
type Quiz = NonNullable<Awaited<ReturnType<ContentRepositories["quizzes"]["create"]>>>;
type Question = NonNullable<Awaited<ReturnType<ContentRepositories["quizzes"]["getForReview"]>>>["questions"][number];
type Job = NonNullable<Awaited<ReturnType<ContentRepositories["generationJobs"]["create"]>>>;

// Only imported by the explicit AI demo command; nothing survives a restart.
export function createMemoryContentRepositories(): ContentRepositories {
  const lessons = new Map<string, Lesson>();
  const quizzes = new Map<string, Quiz>();
  const questions = new Map<string, Question>();
  const jobs = new Map<string, Job>();
  const copy = structuredClone;

  function invalidateQuiz(id: string) {
    const quiz = quizzes.get(id);
    if (quiz) Object.assign(quiz, { status: "needs-review", approvedAt: null, updatedAt: new Date() });
  }

  function validOptions(options: Array<{ text: string; isCorrect: boolean }>) {
    if (options.length < 2 || options.filter(option => option.isCorrect).length !== 1) {
      throw new Error("Provide at least two options and exactly one correct option.");
    }
  }

  function optionsFor(id: string, options: Array<{ text: string; isCorrect: boolean }>) {
    return options.map((option, ordinal) => ({ ...option, id: randomUUID(), questionId: id, ordinal }));
  }

  function evidenceFor(id: string, evidence: Array<{ lessonBlockId: string; quoteStart: number; quoteEnd: number }>) {
    return evidence.map(item => ({ ...item, id: randomUUID(), questionId: id }));
  }

  return {
    lessons: {
      async create(input) {
        const existing = [...lessons.values()].find(lesson => lesson.contentSha256 === input.contentSha256);
        if (existing) return { lesson: copy(existing), duplicate: true };
        const id = randomUUID();
        const now = new Date();
        const lesson: Lesson = {
          ...input, id, subject: input.subject ?? null, originalFilename: input.originalFilename ?? null,
          createdAt: now, updatedAt: now,
          blocks: input.blocks.map((block, ordinal) => ({ ...block, id: randomUUID(), lessonId: id, ordinal, createdAt: now, updatedAt: now })),
        };
        lessons.set(id, lesson);
        return { lesson: copy(lesson), duplicate: false };
      },
      async list() {
        return copy([...lessons.values()].reverse().map(({ blocks: _blocks, normalizedText: _text, contentSha256: _hash, ...lesson }) => lesson));
      },
      async get(id) { return copy(lessons.get(id) ?? null); },
    },
    quizzes: {
      async create(input) {
        const now = new Date();
        const quiz: Quiz = { ...input, id: randomUUID(), lessonId: input.lessonId ?? null, status: "draft", approvedAt: null, createdAt: now, updatedAt: now };
        quizzes.set(quiz.id, quiz);
        return copy(quiz);
      },
      async list() { return copy([...quizzes.values()].reverse()); },
      async getForReview(id) {
        const quiz = quizzes.get(id);
        return quiz ? copy({ ...quiz, questions: [...questions.values()].filter(question => question.quizId === id).sort((a, b) => a.ordinal - b.ordinal) }) : null;
      },
      async approve(id) {
        const quiz = quizzes.get(id);
        if (!quiz) return null;
        const items = [...questions.values()].filter(question => question.quizId === id);
        if (!items.length || items.some(question => question.reviewStatus !== "approved")) {
          throw new Error("Every question must be reviewed and approved before approving the quiz.");
        }
        Object.assign(quiz, { status: "approved", approvedAt: new Date(), updatedAt: new Date() });
        return copy(quiz);
      },
    },
    questions: {
      async create(input, options, evidence = []) {
        validOptions(options);
        if (!quizzes.has(input.quizId)) throw new Error("The quiz could not be found.");
        const id = randomUUID();
        const now = new Date();
        const question: Question = {
          ...input, id, aiConfidence: input.aiConfidence ?? null, reviewStatus: "needs-review", createdAt: now, updatedAt: now,
          options: optionsFor(id, options), evidence: evidenceFor(id, evidence),
        };
        questions.set(id, question);
        invalidateQuiz(input.quizId);
        return copy(question);
      },
      async getForReview(id) {
        const question = questions.get(id);
        const quiz = question && quizzes.get(question.quizId);
        return question && quiz ? copy({ question, quiz, options: question.options, evidence: question.evidence }) : null;
      },
      async update(id, patch) {
        const question = questions.get(id);
        if (!question) return null;
        Object.assign(question, patch, { reviewStatus: "needs-review", updatedAt: new Date() });
        invalidateQuiz(question.quizId);
        return copy(question);
      },
      async replaceOptions(id, options) {
        validOptions(options);
        const question = questions.get(id);
        if (!question) return false;
        Object.assign(question, { options: optionsFor(id, options), reviewStatus: "needs-review", updatedAt: new Date() });
        invalidateQuiz(question.quizId);
        return true;
      },
      async setReviewStatus(id, reviewStatus) {
        const question = questions.get(id);
        if (!question) return null;
        Object.assign(question, { reviewStatus, updatedAt: new Date() });
        if (reviewStatus !== "approved") invalidateQuiz(question.quizId);
        return copy(question);
      },
      async replaceGeneratedContent(id, input) {
        validOptions(input.options);
        if (!input.evidence.length) throw new Error("Regenerated questions require lesson evidence.");
        const question = questions.get(id);
        if (!question) return null;
        const { options, evidence, confidence, ...content } = input;
        Object.assign(question, content, {
          aiGenerated: true, aiConfidence: confidence, reviewStatus: "needs-review", updatedAt: new Date(),
          options: optionsFor(id, options), evidence: evidenceFor(id, evidence),
        });
        invalidateQuiz(question.quizId);
        return copy(question);
      },
    },
    generationJobs: {
      async create(input) {
        const now = new Date();
        const job: Job = { ...input, id: randomUUID(), quizId: input.quizId ?? null, errorMessage: input.errorMessage ?? null, createdAt: now, updatedAt: now };
        jobs.set(job.id, job);
        return copy(job);
      },
      async updateStatus(id, status, errorMessage, quizId) {
        const job = jobs.get(id);
        if (!job) return null;
        Object.assign(job, { status, errorMessage: errorMessage ?? null, ...(quizId !== undefined ? { quizId } : {}), updatedAt: new Date() });
        return copy(job);
      },
    },
  };
}

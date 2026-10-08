import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDatabase } from "./client.js";
import { createRepositories } from "./repositories.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)("PostgreSQL lesson repository", () => {
  let connection: ReturnType<typeof createDatabase>;
  let repositories: ReturnType<typeof createRepositories>;
  let lessonId: string | undefined;

  beforeAll(async () => {
    connection = createDatabase(testDatabaseUrl!);
    repositories = createRepositories(connection.db);
    await migrate(connection.db, { migrationsFolder: "./migrations" });
  });

  afterAll(async () => {
    if (lessonId && repositories) await repositories.lessons.delete(lessonId);
    if (connection) await connection.close();
  });

  it("persists lesson blocks and identifies duplicate content", async () => {
    const contentSha256 = `integration-${randomUUID()}`;
    const input = {
      title: "Repository integration fixture",
      subject: undefined,
      language: "en",
      sourceType: "txt",
      originalFilename: "fixture.txt",
      normalizedText: "Lesson body",
      contentSha256,
      blocks: [{ heading: "Fixture", charStart: 0, charEnd: 11 }],
    };

    const created = await repositories.lessons.create(input);
    lessonId = created.lesson.id;
    expect(created.duplicate).toBe(false);

    const loaded = await repositories.lessons.get(lessonId);
    expect(loaded?.blocks).toHaveLength(1);
    expect(loaded?.blocks[0]?.heading).toBe("Fixture");

    const duplicate = await repositories.lessons.create(input);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.lesson.id).toBe(lessonId);
  });

  it("keeps generated, manually added, and duplicated questions pending until approved", async () => {
    const sourceLesson = await repositories.lessons.get(lessonId!);
    const quiz = await repositories.quizzes.create({ lessonId: lessonId!, title: "Review workflow fixture", language: "en", difficulty: "easy" });
    if (!quiz) throw new Error("Quiz fixture could not be created.");
    const options = [{ text: "Correct", isCorrect: true }, { text: "Incorrect", isCorrect: false }];
    const generated = await repositories.questions.create({
      quizId: quiz.id, kind: "multiple-choice", prompt: "Generated question?", explanation: "From the source.", topic: "Fixture",
      difficulty: "easy", aiGenerated: true, aiConfidence: "high", ordinal: 0,
    }, options, [{ lessonBlockId: sourceLesson!.blocks[0]!.id, quoteStart: 0, quoteEnd: 11 }]);
    const manual = await repositories.questions.createManual({
      quizId: quiz.id, kind: "true-false", prompt: "Manual question?", explanation: "Teacher authored.", topic: "Fixture",
      difficulty: "medium", options: [{ text: "True", isCorrect: true }, { text: "False", isCorrect: false }],
    });
    const duplicate = await repositories.questions.duplicate(generated.id);

    expect(manual?.reviewStatus).toBe("needs-review");
    expect(duplicate?.reviewStatus).toBe("needs-review");
    expect((await repositories.quizzes.getForReview(quiz.id))?.questions).toHaveLength(3);
    await expect(repositories.quizzes.approve(quiz.id)).rejects.toThrow(/Every question/);

    await repositories.questions.setReviewStatus(generated.id, "rejected");
    await repositories.questions.reorder(quiz.id, [duplicate!.id, manual!.id, generated.id]);
    const reordered = await repositories.quizzes.getForReview(quiz.id);
    expect(reordered?.questions.map(question => question.id)).toEqual([duplicate!.id, manual!.id, generated.id]);
    expect(reordered?.questions.find(question => question.id === generated.id)?.reviewStatus).toBe("rejected");
    expect(await repositories.questions.approvePending(quiz.id)).toBe(2);
    await expect(repositories.quizzes.approve(quiz.id)).rejects.toThrow(/Every question/);
    await repositories.questions.setReviewStatus(generated.id, "approved");
    expect((await repositories.quizzes.approve(quiz.id))?.status).toBe("approved");
  });
});

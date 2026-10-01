import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
    const contentSha256 = `integration-${crypto.randomUUID()}`;
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
});

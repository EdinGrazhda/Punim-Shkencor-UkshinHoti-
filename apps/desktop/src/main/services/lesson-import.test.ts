import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRepositories, type CreateLessonInput } from "@ckadinti/database";
import { importLessonFile, normalizeLessonText, splitLessonIntoBlocks } from "./lesson-import.js";

const fixtures = fileURLToPath(new URL("./fixtures/", import.meta.url));
let temporaryDirectory: string;

function createLessonRepositoryStub() {
  const lessons = new Map<string, Awaited<ReturnType<ReturnType<typeof createRepositories>["lessons"]["get"]>>>();
  const repositories = {
    lessons: {
      async create(input: CreateLessonInput) {
        const id = randomUUID();
        const now = new Date();
        const lesson = {
          ...input, subject: input.subject ?? null, originalFilename: input.originalFilename ?? null,
          id, createdAt: now, updatedAt: now,
          blocks: input.blocks.map((block, ordinal) => ({ ...block, id: randomUUID(), lessonId: id, ordinal, createdAt: now, updatedAt: now })),
        };
        lessons.set(id, lesson);
        return { lesson, duplicate: false };
      },
      async get(id: string) { return lessons.get(id) ?? null; },
    },
  };
  return repositories as unknown as ReturnType<typeof createRepositories>;
}

beforeAll(async () => { temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "ckadinti-import-fixtures-")); });
afterAll(async () => { if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true }); });

describe("lesson text normalization", () => {
  it("normalizes line endings, whitespace, and leading byte-order marks", () => {
    expect(normalizeLessonText("\uFEFF  First\tline.  \r\n\r\n\r\nSecond  line.  "))
      .toBe("First line.\n\nSecond line.");
  });

  it("preserves exact character ranges for source blocks and headings", () => {
    const normalized = normalizeLessonText("## Basics\r\nConcept one.\r\n\r\nConcept two.");
    const blocks = splitLessonIntoBlocks(normalized);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.heading).toBe("Basics");
    expect(normalized.slice(blocks[0]!.charStart, blocks[0]!.charEnd)).toBe("## Basics\nConcept one.");
    expect(blocks[1]?.heading).toBe("Basics");
    expect(normalized.slice(blocks[1]!.charStart, blocks[1]!.charEnd)).toBe("Concept two.");
  });

  it("returns no blocks for empty content", () => {
    expect(splitLessonIntoBlocks(normalizeLessonText(" \r\n "))).toEqual([]);
  });

  it.each([
    ["lesson.txt", "txt", "Water freezes at 0 degrees Celsius."],
    ["lesson.md", "md", "Water freezes at 0 degrees Celsius."],
    ["lesson.pdf", "pdf", "Fixture PDF: water freezes at 0 degrees Celsius."],
    ["lesson.docx.b64", "docx", "Fixture DOCX: water freezes at 0 degrees Celsius."],
  ])("imports %s into normalized text and evidence blocks", async (fixtureName, extension, expectedText) => {
    const fixture = await readFile(path.join(fixtures, fixtureName), "utf8");
    const content = fixtureName.endsWith(".b64") ? Buffer.from(fixture.trim(), "base64") : Buffer.from(fixture, "utf8");
    const lessonPath = path.join(temporaryDirectory, `fixture-${randomUUID()}.${extension}`);
    await writeFile(lessonPath, content);
    const imported = await importLessonFile(lessonPath, createLessonRepositoryStub());

    expect(imported.lesson.normalizedText).toContain(expectedText);
    expect(imported.lesson.blocks.length).toBeGreaterThan(0);
    for (const block of imported.lesson.blocks) {
      expect(imported.lesson.normalizedText.slice(block.charStart, block.charEnd)).not.toBe("");
    }
  });
});

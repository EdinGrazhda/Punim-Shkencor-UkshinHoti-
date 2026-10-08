import { describe, expect, it } from "vitest";
import { questionCountSchema } from "@ckadinti/contracts";
import { planQuizGeneration } from "./generation-plan.js";
import { splitLessonIntoBlocks } from "./lesson-import.js";

describe("custom counts and bounded lesson source planning", () => {
  it("accepts every whole count from 1 through 200 and preserves the exact total in batches", () => {
    const lesson = { normalizedText: "Source text.", blocks: [{ ordinal: 0, charStart: 0, charEnd: 12 }] };
    for (let count = 1; count <= 200; count++) {
      expect(questionCountSchema.parse(count)).toBe(count);
      const plan = planQuizGeneration(lesson, count);
      expect(plan.batches.reduce((sum, batch) => sum + batch.questionCount, 0)).toBe(count);
      expect(plan.batches.every(batch => batch.questionCount >= 1 && batch.questionCount <= 8)).toBe(true);
      expect(plan.sampled).toBe(false);
    }
  });

  it.each([0, -1, 201, 1.5, NaN, Infinity, "8"])("rejects an invalid count: %s", value => {
    expect(questionCountSchema.safeParse(value).success).toBe(false);
  });

  it("does not truncate after 500 blocks and retains all non-whitespace source characters", () => {
    const text = Array.from({ length: 700 }, (_, i) => `Paragraph ${i}: ${"Source fact. ".repeat(10)}`).join("\n\n") + "\n\n" + "Last section. ".repeat(2000);
    const blocks = splitLessonIntoBlocks(text);
    expect(blocks.length).toBeGreaterThan(700);
    expect(blocks.every(block => block.charEnd - block.charStart <= 6000)).toBe(true);
    expect(blocks.map(block => text.slice(block.charStart, block.charEnd)).join("").replace(/\s/gu, "")).toBe(text.replace(/\s/gu, ""));
    const plan = planQuizGeneration({ normalizedText: text, blocks: blocks.map((block, ordinal) => ({ ...block, ordinal })) }, 25);
    expect(plan.batches).toHaveLength(4);
    expect(plan.batches.every(batch => batch.source.length < 43_000)).toBe(true);
    expect(plan.batches[0]!.source).toContain("Paragraph 0:");
    expect(plan.batches.at(-1)!.source).toContain("Last section.");
    expect(plan.sampled).toBe(true);
  });

  it("also bounds giant blocks imported by older versions", () => {
    const text = "BEGIN " + "content ".repeat(40000) + " END";
    const plan = planQuizGeneration({ normalizedText: text, blocks: [{ ordinal: 0, charStart: 0, charEnd: text.length }] }, 1);
    expect(plan.batches[0]!.source.length).toBeLessThan(43_000);
    expect(plan.batches[0]!.source).toContain("BEGIN");
    expect(plan.batches[0]!.source).toContain("END");
    expect(plan.sampled).toBe(true);
  });
});

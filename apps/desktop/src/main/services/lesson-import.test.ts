import { describe, expect, it } from "vitest";
import { normalizeLessonText, splitLessonIntoBlocks } from "./lesson-import.js";

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
});

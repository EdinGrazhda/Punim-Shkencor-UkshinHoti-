import { questionCountSchema } from "@ckadinti/contracts";

type SourceLesson = { normalizedText: string; blocks: Array<{ ordinal: number; charStart: number; charEnd: number }> };
const EXCERPT_CHARS = 6_000;
const EXCERPTS_PER_BATCH = 7;
export const QUESTIONS_PER_BATCH = 8;

/** Keep original ordinals/ranges, including lessons imported before block chunking. */
export function planQuizGeneration(lesson: SourceLesson, count: number) {
  questionCountSchema.parse(count);
  const excerpts = lesson.blocks.flatMap(block => {
    const parts: Array<{ ordinal: number; start: number; end: number }> = [];
    for (let start = block.charStart; start < block.charEnd; start += EXCERPT_CHARS) {
      parts.push({ ordinal: block.ordinal, start, end: Math.min(start + EXCERPT_CHARS, block.charEnd) });
    }
    return parts;
  });
  if (!excerpts.length) throw new Error("This lesson has no source blocks to support evidence-backed questions.");
  const batchCount = Math.ceil(count / QUESTIONS_PER_BATCH);
  const used = new Set<number>();
  const batches = Array.from({ length: batchCount }, (_, batch) => {
    // Short lessons can be reused across batches. Long lessons distribute the
    // available question budget across the document, never only its beginning.
    const start = excerpts.length <= EXCERPTS_PER_BATCH ? 0 : Math.floor(batch * excerpts.length / batchCount);
    const end = excerpts.length <= EXCERPTS_PER_BATCH ? excerpts.length : Math.max(start + 1, Math.floor((batch + 1) * excerpts.length / batchCount));
    const available = end - start;
    const take = Math.min(available, EXCERPTS_PER_BATCH);
    const indexes = Array.from({ length: take }, (_, i) => start + (take === 1 ? 0 : Math.round(i * (available - 1) / (take - 1))));
    indexes.forEach(index => used.add(index));
    return {
      questionCount: Math.min(QUESTIONS_PER_BATCH, count - batch * QUESTIONS_PER_BATCH),
      source: indexes.map(index => {
        const part = excerpts[index]!;
        return `BLOCK ${part.ordinal} [${part.start},${part.end}): ${lesson.normalizedText.slice(part.start, part.end)}`;
      }).join("\n\n"),
    };
  });
  return { batches, sampled: used.size < excerpts.length };
}

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import { lessonImportRequestSchema, MAX_LESSON_FILE_BYTES, MAX_LESSON_TEXT_CHARS } from "@ckadinti/contracts";
import type { ContentRepositories } from "./content-repositories.js";
import { extractPdfText } from "./pdf-extraction.js";

type Repositories = ContentRepositories;

const MAX_BLOCK_CHARS = 6_000;

function sourceTypeFromPath(filePath: string): "txt" | "markdown" | "pdf" | "docx" {
  const extension = path.extname(filePath).toLowerCase();
  const byExtension: Record<string, "txt" | "markdown" | "pdf" | "docx"> = {
    ".txt": "txt",
    ".md": "markdown",
    ".pdf": "pdf",
    ".docx": "docx",
  };
  const sourceType = byExtension[extension];
  if (!sourceType) throw new Error("Choose a TXT, Markdown, PDF, or DOCX lesson file.");
  return sourceType;
}

export function normalizeLessonText(rawText: string): string {
  return rawText
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\t\u00a0 ]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function splitLessonIntoBlocks(normalizedText: string): Array<{ heading: string | null; charStart: number; charEnd: number }> {
  const blocks: Array<{ heading: string | null; charStart: number; charEnd: number }> = [];
  const paragraphPattern = /\S[\s\S]*?(?=\n{2,}|$)/g;
  let currentHeading: string | null = null;
  for (const match of normalizedText.matchAll(paragraphPattern)) {
    const matchedText = match[0] ?? "";
    const value = matchedText.trim();
    if (!value) continue;
    const charStart = (match.index ?? 0) + matchedText.indexOf(value);
    const charEnd = charStart + value.length;
    const headingMatch = value.match(/^#{1,6}\s+(.+)$/m);
    if (headingMatch) currentHeading = headingMatch[1]?.trim() ?? null;
    // Preserve all paragraphs and split large ones without changing source offsets.
    for (let start = charStart; start < charEnd;) {
      let end = Math.min(start + MAX_BLOCK_CHARS, charEnd);
      if (end < charEnd) {
        const whitespace = normalizedText.lastIndexOf(" ", end);
        if (whitespace > start + MAX_BLOCK_CHARS / 2) end = whitespace;
      }
      blocks.push({ heading: currentHeading, charStart: start, charEnd: end });
      start = end;
      while (start < charEnd && /\s/u.test(normalizedText[start]!)) start++;
    }
  }
  if (!blocks.length && normalizedText.length) {
    blocks.push({ heading: null, charStart: 0, charEnd: normalizedText.length });
  }
  return blocks;
}

async function extractText(buffer: Buffer, sourceType: ReturnType<typeof sourceTypeFromPath>): Promise<string> {
  if (buffer.byteLength > MAX_LESSON_FILE_BYTES) throw new Error("Lesson files must be 50 MB or smaller.");
  if (sourceType === "txt" || sourceType === "markdown") return buffer.toString("utf8");
  if (sourceType === "pdf") {
    return extractPdfText(new Uint8Array(buffer));
  }
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

export async function importLessonBytes(filename: string, source: Uint8Array, repositories: Repositories) {
  const originalFilename = path.basename(filename).trim();
  if (!originalFilename || originalFilename.length > 255) throw new Error("Choose a lesson filename under 256 characters.");
  const sourceType = sourceTypeFromPath(originalFilename);
  const rawText = await extractText(Buffer.from(source), sourceType);
  const normalizedText = normalizeLessonText(rawText);
  if (!normalizedText) throw new Error("No readable text was found in this lesson file.");
  if (normalizedText.length > MAX_LESSON_TEXT_CHARS) {
    throw new Error("Extracted lesson text exceeds the 2,000,000 character limit. Import a smaller section.");
  }

  const title = path.basename(originalFilename, path.extname(originalFilename)).replace(/[_-]+/g, " ").trim() || "Untitled lesson";
  const request = lessonImportRequestSchema.parse({
    title,
    language: "auto",
    sourceType,
    originalFilename,
    normalizedText,
  });
  const contentSha256 = createHash("sha256").update(request.normalizedText, "utf8").digest("hex");
  const result = await repositories.lessons.create({
    ...request,
    contentSha256,
    blocks: splitLessonIntoBlocks(request.normalizedText),
  });
  const lesson = await repositories.lessons.get(result.lesson.id);
  if (!lesson) throw new Error("The lesson was saved but could not be loaded.");
  return { lesson, duplicate: result.duplicate };
}

export async function importLessonFile(filePath: string, repositories: Repositories) {
  return importLessonBytes(path.basename(filePath), await readFile(filePath), repositories);
}

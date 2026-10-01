import { afterEach, describe, expect, it, vi } from "vitest";
import type { createRepositories } from "@ckadinti/database";
import { regenerateQuestionFromLesson } from "./quiz-generation.js";

const lessonId = "c83de776-c565-47d7-ac26-2a5f672bcb2d";
const quizId = "2b11fe10-9484-4a34-ae9d-39286a243652";
const questionId = "acfb8331-f16c-4b56-9199-29bbd17b4197";
const blockId = "cb4f6634-c28f-4fe8-9d2c-1f5644fd0b67";
const lessonText = "Water freezes at 0 degrees Celsius.";

function output(quote: string) {
  return {
    title: "Water basics", language: "en", difficulty: "easy",
    questions: [{
      kind: "multiple-choice", prompt: "At what temperature does water freeze?", explanation: "The lesson says zero degrees Celsius.",
      topic: "Water", difficulty: "easy", confidence: "high",
      options: [{ text: "0°C", isCorrect: true }, { text: "100°C", isCorrect: false }],
      evidence: [{ blockOrdinal: 0, quote }],
    }],
  };
}

function repositories() {
  const persistedQuestion = { id: questionId, prompt: "At what temperature does water freeze?" };
  const repo = {
    lessons: { get: vi.fn(async () => ({ id: lessonId, title: "Water", language: "en", normalizedText: lessonText, blocks: [{ id: blockId, ordinal: 0, heading: null, charStart: 0, charEnd: lessonText.length }] })) },
    quizzes: {},
    questions: {
      getForReview: vi.fn(async () => ({
        question: { id: questionId, prompt: "Old question?", topic: "Water", explanation: "Old explanation." },
        quiz: { id: quizId, lessonId, title: "Water basics" }, options: [], evidence: [],
      })),
      replaceGeneratedContent: vi.fn(async () => persistedQuestion),
    },
    generationJobs: {
      create: vi.fn(async () => ({ id: "job-1" })),
      updateStatus: vi.fn(async () => ({ id: "job-1" })),
    },
  };
  return repo as unknown as ReturnType<typeof createRepositories>;
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("single-question AI regeneration", () => {
  it("requires exact source evidence and returns the regenerated question to review", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key-not-real");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output(lessonText)) }] }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const repo = repositories();

    const result = await regenerateQuestionFromLesson(questionId, repo);

    expect(result.reviewStatus).toBe("needs-review");
    expect(repo.questions.replaceGeneratedContent).toHaveBeenCalledWith(questionId, expect.objectContaining({
      prompt: "At what temperature does water freeze?",
      evidence: [{ lessonBlockId: blockId, quoteStart: 0, quoteEnd: lessonText.length }],
    }));
    expect(repo.generationJobs.updateStatus).toHaveBeenCalledWith("job-1", "completed", null, quizId);
  });

  it("does not replace content when the model’s evidence is not an exact lesson quote", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key-not-real");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output("unsupported quotation")) }] }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const repo = repositories();

    await expect(regenerateQuestionFromLesson(questionId, repo)).rejects.toThrow(/evidence did not exactly match/);
    expect(repo.questions.replaceGeneratedContent).not.toHaveBeenCalled();
    expect(repo.generationJobs.updateStatus).toHaveBeenCalledWith("job-1", "failed", expect.any(String), quizId);
  });
});

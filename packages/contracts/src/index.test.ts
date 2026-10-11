import { describe, expect, it } from "vitest";
import { GameSnapshot, HostCommand, JoinRequest, gameSnapshotFromApprovedQuestions, generatedQuestionSchema, reviewQuestionSaveSchema } from "./index.js";

describe("teacher quiz contracts", () => {
  it("supports optional display names for assigned classroom aliases and validates lobby controls", () => {
    expect(JoinRequest.safeParse({ emblem: "Comet" }).success).toBe(true);
    expect(HostCommand.safeParse({ type: "set-team-count", teamCount: 4 }).success).toBe(true);
    expect(HostCommand.safeParse({ type: "set-team-count", teamCount: 1 }).success).toBe(false);
    expect(HostCommand.safeParse({ type: "set-team-assignment-mode", teamAssignmentMode: "manual" }).success).toBe(true);
    expect(HostCommand.safeParse({ type: "set-team-assignment-mode", teamAssignmentMode: "random" }).success).toBe(true);
    expect(HostCommand.safeParse({ type: "set-team-assignment-mode", teamAssignmentMode: "automatic" }).success).toBe(false);
    expect(HostCommand.safeParse({ type: "set-nickname-mode", nicknameMode: "assigned" }).success).toBe(true);
    expect(HostCommand.safeParse({ type: "set-nickname-mode", nicknameMode: "unknown" }).success).toBe(false);
    expect(HostCommand.safeParse({ type: "rename-player", playerId: "student-1", displayName: "Ada Lovelace" }).success).toBe(true);
    expect(HostCommand.safeParse({ type: "assign-player-team", playerId: "student-1", teamIndex: 2 }).success).toBe(true);
    expect(HostCommand.safeParse({ type: "assign-player-team", playerId: "student-1", teamIndex: 0 }).success).toBe(true);
    expect(HostCommand.safeParse({ type: "assign-player-team", playerId: "student-1", teamIndex: 7 }).success).toBe(false);
  });

  it("accepts a question with exactly one correct answer and evidence", () => {
    expect(generatedQuestionSchema.safeParse({
      kind: "multiple-choice", prompt: "At what temperature does water freeze?", explanation: "The lesson states zero degrees.",
      topic: "Water", difficulty: "easy", confidence: "high",
      options: [{ text: "0°C", isCorrect: true }, { text: "10°C", isCorrect: false }],
      evidence: [{ quoteStart: 0, quoteEnd: 35 }],
    }).success).toBe(true);
  });

  it("rejects review edits without exactly one correct answer", () => {
    const parsed = reviewQuestionSaveSchema.safeParse({
      questionId: "ec830a17-1dd0-4ecb-8d40-ddc505646c13", prompt: "Question?", explanation: "Explanation.",
      topic: "Topic", difficulty: "medium",
      options: [{ text: "A", isCorrect: true }, { text: "B", isCorrect: true }],
    });
    expect(parsed.success).toBe(false);
  });

  it("exports approved questions in Edin's runtime snapshot shape", () => {
    expect(gameSnapshotFromApprovedQuestions({
      id: "quiz-1", title: "Water", questions: [{ id: "q-1", prompt: "Freezing point?", explanation: "The lesson states that water freezes at 0°C.", options: [{ text: "0°C", isCorrect: true }, { text: "100°C", isCorrect: false }] }],
    })).toEqual({ id: "quiz-1", title: "Water", questions: [{ id: "q-1", prompt: "Freezing point?", options: ["0°C", "100°C"], correctOption: 0, timeLimitMs: 30_000, explanation: "The lesson states that water freezes at 0°C." }] });
  });

  it("keeps the Edin-optional explanation optional for existing approved quizzes", () => {
    expect(gameSnapshotFromApprovedQuestions({
      id: "quiz-2", title: "Without explanation", questions: [{ id: "q-2", prompt: "Question?", options: [{ text: "A", isCorrect: true }, { text: "B", isCorrect: false }] }],
    })).toEqual({ id: "quiz-2", title: "Without explanation", questions: [{ id: "q-2", prompt: "Question?", options: ["A", "B"], correctOption: 0, timeLimitMs: 30_000 }] });
  });

  it("keeps existing snapshots fixed by default and requires a duration for repeat mode", () => {
    const fixed = { id: "quiz-fixed", title: "Fixed", questions: [{ id: "q1", prompt: "Question?", options: ["A", "B"], correctOption: 0 }] };
    expect(GameSnapshot.parse(fixed).sessionMode).toBeUndefined();
    expect(GameSnapshot.safeParse({ ...fixed, sessionMode: "timed-repeat" }).success).toBe(false);
    expect(GameSnapshot.parse({ ...fixed, sessionMode: "timed-repeat", sessionDurationMs: 10 * 60_000 })).toMatchObject({ sessionMode: "timed-repeat", sessionDurationMs: 10 * 60_000 });
    expect(GameSnapshot.safeParse({ ...fixed, sessionMode: "timed-repeat", sessionDurationMs: 30_000 }).success).toBe(false);
  });
});

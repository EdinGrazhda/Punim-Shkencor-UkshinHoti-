import { describe, expect, it } from "vitest";
import { AuthoritativeSession } from "./session.js";
import type { GameSnapshot } from "@ckadinti/contracts";

const snapshot: GameSnapshot = { id: "quiz-1", title: "Raid", questions: [{ id: "q1", prompt: "2+2?", options: ["3", "4"], correctOption: 1, timeLimitMs: 1000 }] };
describe("authoritative session", () => {
  it("freezes the approved snapshot and rejects duplicate answers", () => {
    let now = 1000; const session = new AuthoritativeSession("ABC123", snapshot, () => now); const player = session.join("Ada", "player-1"); session.command({ type: "start" });
    const request = { questionIndex: 0, optionIndex: 1, idempotencyKey: "00000000-0000-4000-8000-000000000001" };
    now = 1100; const first = session.answer(player.id, request); const second = session.answer(player.id, request);
    expect(first.accepted).toBe(true); expect(second.duplicate).toBe(true); expect(session.answers).toHaveLength(1); expect(session.snapshot).not.toBe(snapshot);
  });
  it("keeps answer correctness and score private until reveal", () => {
    let now = 1000;
    const session = new AuthoritativeSession("ABC123", snapshot, () => now);
    const player = session.join("Ada", "player-1");
    session.command({ type: "start" });
    now = 1100;
    expect(session.answer(player.id, {
      questionIndex: 0,
      optionIndex: 1,
      idempotencyKey: "00000000-0000-4000-8000-000000000011",
    }).accepted).toBe(true);

    const privateDuringQuestion = session.playerResult(player.id);
    expect(privateDuringQuestion).toEqual({ questionIndex: 0, answered: true, selectedOption: 1 });
    expect(privateDuringQuestion).not.toHaveProperty("correct");
    expect(privateDuringQuestion).not.toHaveProperty("correctOption");
    expect(privateDuringQuestion).not.toHaveProperty("score");
    expect(privateDuringQuestion).not.toHaveProperty("xp");

    session.command({ type: "reveal" });
    expect(session.playerResult(player.id)).toMatchObject({
      questionIndex: 0,
      answered: true,
      selectedOption: 1,
      correctOption: 1,
      correct: true,
      score: expect.any(Number),
    });
  });
  it("does not accept answers after the deadline", () => {
    let now = 0; const session = new AuthoritativeSession("ABC123", snapshot, () => now); const player = session.join("Ada", "player-1"); session.command({ type: "start" }); now = 1001;
    expect(session.answer(player.id, { questionIndex: 0, optionIndex: 1, idempotencyKey: "00000000-0000-4000-8000-000000000002" })).toEqual({ accepted: false, reason: "deadline_passed" });
  });

  it("plays a fixed quiz once and ends after its selected questions", () => {
    let now = 1000;
    const session = new AuthoritativeSession("ABC123", snapshot, () => now);
    session.join("Ada", "player-fixed");
    session.command({ type: "start" });
    const legacyState = { ...session.toPersistence() } as unknown as Record<string, unknown>;
    delete legacyState.playOrder;
    delete legacyState.questionStartedAt;
    delete legacyState.pausedQuestionElapsed;
    delete legacyState.sessionDeadlineAt;
    delete legacyState.pausedSessionRemaining;
    expect(AuthoritativeSession.restore(legacyState, () => now).state().question?.timeLimitMs).toBe(1000);
    session.command({ type: "reveal" });
    now += 2000;
    session.tick();
    expect(session.state().phase).toBe("ended");
    expect(session.questionsPlayed).toBe(1);
  });

  it("shuffles question rounds and accepts a fresh answer each time in timed-repeat mode", () => {
    let now = 1000;
    const repeatedQuiz: GameSnapshot = {
      id: "quiz-repeat",
      title: "Repeat",
      sessionMode: "timed-repeat",
      sessionDurationMs: 120_000,
      questions: [
        { id: "q1", prompt: "First?", options: ["A", "B"], correctOption: 0, timeLimitMs: 20_000 },
        { id: "q2", prompt: "Second?", options: ["A", "B"], correctOption: 1, timeLimitMs: 20_000 },
      ],
    };
    const session = new AuthoritativeSession("ABC123", repeatedQuiz, () => now);
    const player = session.join("Ada", "player-repeat");
    session.command({ type: "start" });
    const firstPrompt = session.state().question!.prompt;
    const restored = AuthoritativeSession.restore(session.toPersistence(), () => now);
    expect(restored.state().question?.prompt).toBe(firstPrompt);
    const played: string[] = [];
    for (let occurrence = 0; occurrence < 4; occurrence += 1) {
      const state = session.state();
      played.push(state.question!.prompt);
      expect(session.answer(player.id, {
        questionIndex: state.questionIndex!,
        optionIndex: 0,
        idempotencyKey: `00000000-0000-4000-8000-${String(occurrence + 20).padStart(12, "0")}`,
      }).accepted).toBe(true);
      session.command({ type: "reveal" });
      if (occurrence < 3) {
        now += 2000;
        session.tick();
      }
    }
    expect(new Set(played.slice(0, 2))).toEqual(new Set(["First?", "Second?"]));
    expect(new Set(played.slice(2, 4))).toEqual(new Set(["First?", "Second?"]));
    expect(played[1]).not.toBe(played[2]);
    expect(session.answers).toHaveLength(4);
    expect(session.questionsPlayed).toBe(4);
    expect(session.state()).toMatchObject({ sessionMode: "timed-repeat", sessionDurationMs: 120_000 });
  });

  it("enforces the overall timed deadline and freezes it while paused", () => {
    let now = 1000;
    const repeatedQuiz: GameSnapshot = {
      id: "quiz-deadline",
      title: "Timed",
      sessionMode: "timed-repeat",
      sessionDurationMs: 60_000,
      questions: snapshot.questions.map(question => ({ ...question, timeLimitMs: 10_000 })),
    };
    const session = new AuthoritativeSession("ABC123", repeatedQuiz, () => now);
    session.command({ type: "start" });
    now = 3000;
    session.command({ type: "pause" });
    expect(session.state().sessionRemainingMs).toBe(58_000);
    expect(session.state().question?.remainingMs).toBe(8000);
    now = 10_000;
    session.tick();
    expect(session.state().phase).toBe("paused");
    session.command({ type: "resume" });
    now = 12_000;
    expect(session.state().question?.deadlineAt! - now).toBe(6000);
    now = 68_000;
    session.tick();
    expect(session.state().phase).toBe("ended");
  });
});

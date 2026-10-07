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
});

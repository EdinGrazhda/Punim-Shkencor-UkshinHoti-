import { describe, expect, it } from "vitest";
import { AuthoritativeSession } from "./session.js";
import type { GameSnapshot } from "@ckadinti/contracts";

const snapshot: GameSnapshot = { id: "quiz-1", title: "Raid", questions: [{ id: "q1", prompt: "2+2?", options: ["3", "4"], correctOption: 1, timeLimitMs: 1000 }] };
describe("authoritative session", () => {
  it("enforces classroom nickname rules and supports teacher-assigned aliases across reconnects", () => {
    const session = new AuthoritativeSession("ABC123", snapshot);
    const first = session.join("  Ada  ", "player-alias-1");
    expect(first.displayName).toBe("Ada");
    expect(() => session.join("ada", "player-alias-duplicate")).toThrow("nickname_taken");
    expect(() => session.join("https://example.com", "player-alias-link")).toThrow("nickname_invalid");

    session.command({ type: "set-nickname-mode", nicknameMode: "assigned" });
    expect(session.players.get(first.id)?.displayName).toBe("Curious Comet 01");
    const second = session.join(undefined, "player-alias-2");
    expect(second.displayName).toBe("Kind Koala 01");

    const restored = AuthoritativeSession.restore(session.toPersistence());
    expect(restored.state()).toMatchObject({ nicknameMode: "assigned", players: [{ displayName: "Curious Comet 01", connected: false }, { displayName: "Kind Koala 01", connected: false }] });
    expect(restored.reconnect(first.id).connected).toBe(true);
    expect(restored.state().players[0]?.connected).toBe(true);
  });

  it("balances players across teams and reports aggregated team scores", () => {
    let now = 1000;
    const session = new AuthoritativeSession("ABC123", snapshot, () => now);
    session.command({ type: "set-team-count", teamCount: 2 });
    const ada = session.join("Ada", "player-team-1");
    const ben = session.join("Ben", "player-team-2");
    const cy = session.join("Cy", "player-team-3");
    expect([ada, ben, cy].every(player => player.teamId)).toBe(true);
    const memberCounts = [ada, ben, cy].reduce<Record<string, number>>((counts, player) => {
      const teamId = player.teamId!;
      counts[teamId] = (counts[teamId] ?? 0) + 1;
      return counts;
    }, {});
    expect(Object.values(memberCounts).sort()).toEqual([1, 2]);
    expect(session.state().teamCount).toBe(2);
    expect(session.state().teamAssignmentMode).toBe("random");
    expect(AuthoritativeSession.restore(session.toPersistence()).state()).toMatchObject({ teamCount: 2, teamAssignmentMode: "random" });
    expect(() => session.command({ type: "assign-player-team", playerId: ada.id, teamIndex: 2 })).toThrow("random_team_assignment_active");

    session.command({ type: "start" });
    now += 100;
    expect(session.answer(ada.id, { questionIndex: 0, optionIndex: 1, idempotencyKey: "00000000-0000-4000-8000-000000000101" }).accepted).toBe(true);
    expect(session.state().players.find(player => player.id === ada.id)?.answered).toBe(true);
    session.command({ type: "reveal" });
    expect(session.teamLeaderboard()).toHaveLength(2);
    expect(session.teamLeaderboard().reduce((sum, team) => sum + team.players, 0)).toBe(3);
    expect(session.teamLeaderboard().reduce((sum, team) => sum + team.score, 0)).toBe(session.score(ada.id) + session.score(ben.id) + session.score(cy.id));
    expect(() => session.command({ type: "set-team-count", teamCount: 3 })).toThrow("invalid_phase");
  });

  it("lets teachers rename students and manually assign teams in the lobby", () => {
    const session = new AuthoritativeSession("ABC123", snapshot);
    session.command({ type: "set-team-assignment-mode", teamAssignmentMode: "manual" });
    session.command({ type: "set-team-count", teamCount: 2 });
    const ada = session.join("Ada", "player-manual-1");
    const ben = session.join("Ben", "player-manual-2");
    const cy = session.join("Cy", "player-manual-3");
    expect([ada, ben, cy].every(player => !player.teamId)).toBe(true);

    session.command({ type: "rename-player", playerId: ada.id, displayName: "Ada L." });
    session.command({ type: "assign-player-team", playerId: ada.id, teamIndex: 2 });
    expect(session.state().players.find(player => player.id === ada.id)).toMatchObject({ displayName: "Ada L.", teamId: "team-2", teamName: "Team 2" });
    expect(() => session.command({ type: "rename-player", playerId: cy.id, displayName: "  ada l.  " })).toThrow("nickname_taken");
    expect(() => session.command({ type: "assign-player-team", playerId: cy.id, teamIndex: 3 })).toThrow("team_not_found");

    const dee = session.join("Dee", "player-manual-4");
    expect(session.players.get(ada.id)?.teamId).toBe("team-2");
    expect(session.players.get(dee.id)?.teamId).toBeUndefined();
    session.command({ type: "assign-player-team", playerId: ada.id, teamIndex: 0 });
    expect(session.players.get(ada.id)?.teamId).toBeUndefined();
    session.command({ type: "assign-player-team", playerId: ada.id, teamIndex: 2 });

    session.command({ type: "start" });
    expect(() => session.command({ type: "rename-player", playerId: ben.id, displayName: "Ben B." })).toThrow("invalid_phase");
    expect(() => session.command({ type: "assign-player-team", playerId: ben.id, teamIndex: 1 })).toThrow("invalid_phase");
  });

  it("shuffles existing lobby students into balanced teams when random mode is selected", () => {
    const session = new AuthoritativeSession("ABC123", snapshot);
    session.command({ type: "set-team-count", teamCount: 2 });
    const players = ["Ada", "Ben", "Cy", "Dee", "Eli"].map((name, index) => session.join(name, `player-random-${index}`));
    session.command({ type: "set-team-assignment-mode", teamAssignmentMode: "manual" });
    expect([...session.players.values()].every(player => !player.teamId)).toBe(true);
    session.command({ type: "set-team-assignment-mode", teamAssignmentMode: "random" });

    const counts = players.reduce<Record<string, number>>((result, player) => {
      const teamId = session.players.get(player.id)!.teamId!;
      result[teamId] = (result[teamId] ?? 0) + 1;
      return result;
    }, {});
    expect(Object.values(counts).sort()).toEqual([2, 3]);
    expect(session.state().teamAssignmentMode).toBe("random");
  });

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

  it("holds each revealed answer for three seconds and blocks an early next command", () => {
    let now = 1_000;
    const session = new AuthoritativeSession("ABC123", snapshot, () => now);
    session.command({ type: "start" });
    session.command({ type: "reveal" });
    expect(session.state()).toMatchObject({ phase: "reveal", revealUntil: 4_000 });
    expect(() => session.command({ type: "next" })).toThrow("reveal_in_progress");

    now = 3_999;
    session.tick();
    expect(session.state().phase).toBe("reveal");
    now = 4_000;
    session.command({ type: "next" });
    expect(session.state().phase).toBe("ended");
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
    now += 3000;
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
        now += 3000;
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

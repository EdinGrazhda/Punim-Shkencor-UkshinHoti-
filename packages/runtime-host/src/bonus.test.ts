import { describe, expect, it } from "vitest";
import { AuthoritativeSession } from "./session.js";
import { createRuntimeHost } from "./server.js";
import { makeMemoryStudentAccountStore } from "./student-auth.js";
import { hashPassword, issueTeacherSession, makeMemoryTeacherStore } from "./teacher-auth.js";
import { MemoryRuntimeSessionStore } from "./session-store.js";

const snapshot = {
  id: "bonus-quiz", title: "Bonus flow",
  questions: [0, 1].map(index => ({ id: `q${index}`, prompt: "2 + 2?", options: ["3", "4"], correctOption: 1, timeLimitMs: 10_000 })),
};

describe("mystery box flow", () => {
  it("hides offers until reveal, awards 10 XP for a wrong answer, transfers 15%, and advances automatically", () => {
    let now = 1_000;
    const session = new AuthoritativeSession("BONUS1", snapshot, () => now);
    const ada = session.join("Ada", "ada");
    const ben = session.join("Ben", "ben");
    const cal = session.join("Cal", "cal");
    session.command({ type: "start" });
    now = 2_000;
    for (const [playerId, optionIndex] of [[ada.id, 1], [ben.id, 1], [cal.id, 0]] as const) {
      expect(session.answer(playerId, { questionIndex: 0, optionIndex, idempotencyKey: `00000000-0000-4000-8000-00000000000${playerId === "ada" ? 1 : playerId === "ben" ? 2 : 3}` }).accepted).toBe(true);
    }
    expect(session.playerResult(ada.id)).toEqual({ questionIndex: 0, answered: true, selectedOption: 1 });
    expect(() => session.pickBonus(ada.id, 0)).toThrow("bonus_closed");
    now = 3_500;
    session.tick();
    expect(session.state().phase).toBe("reveal");
    expect(session.playerResult(cal.id)).toMatchObject({ correct: false, questionXp: 10, xp: 10, selectedOption: 0, correctOption: 1 });
    expect(session.playerResult(ada.id).bonus).toEqual({ available: true });
    const offers = session.toPersistence().bonusOffers;
    for (const [key, boxes] of offers) {
      expect(key).toMatch(/^0:(ada|ben)$/);
      expect([...boxes].sort()).toEqual([150, 300, "hack"].sort());
    }
    const adaBoxes = offers.find(([key]) => key === "0:ada")![1];
    const benBoxes = offers.find(([key]) => key === "0:ben")![1];
    const hackIndex = adaBoxes.indexOf("hack");
    const pointsIndex = benBoxes.indexOf(300);
    const benBefore = session.score(ben.id);
    expect(session.pickBonus(ada.id, hackIndex).bonus).toMatchObject({ kind: "hack", available: false });
    expect(() => session.hack(ada.id, ada.id)).toThrow("invalid_hack_target");
    const stolen = Math.floor(benBefore * 0.15);
    expect(session.hack(ada.id, ben.id).bonus).toMatchObject({ targetId: ben.id, stolen });
    expect(session.score(ben.id)).toBe(benBefore - stolen);
    const adaAfterHack = session.score(ada.id);
    session.hack(ada.id, ben.id);
    expect(session.score(ada.id)).toBe(adaAfterHack);
    expect(session.pickBonus(ben.id, pointsIndex).bonus).toMatchObject({ kind: "points", points: 300 });
    expect(() => session.pickBonus(cal.id, 0)).toThrow("bonus_not_earned");
    const restored = AuthoritativeSession.restore(session.toPersistence(), () => now);
    expect(restored.score(ada.id)).toBe(adaAfterHack);
    expect(restored.playerResult(ada.id).bonus).toMatchObject({ kind: "hack", stolen });
    expect(restored.pickBonus(ada.id, 0).bonus).toMatchObject({ kind: "hack", stolen });
    now = 6_000;
    restored.tick();
    expect(restored.state().questionIndex).toBe(1);
    expect(restored.state().phase).toBe("question");
    expect(restored.state().question?.deadlineAt).toBe(now + 10_000);
    now = 16_000;
    restored.tick();
    expect(restored.state().phase).toBe("reveal");
    now = 18_500;
    restored.tick();
    expect(restored.state().phase).toBe("ended");
  });

  it("requires the player's token for box and hack actions", async () => {
    const teachers = makeMemoryTeacherStore();
    const host = createRuntimeHost(teachers, makeMemoryStudentAccountStore(), new MemoryRuntimeSessionStore());
    await host.init();
    try {
      const teacher = await teachers.create("Teacher", "teacher@example.test", await hashPassword("teacher-password"), "teacher", false);
      const teacherToken = (await issueTeacherSession(teachers, teacher)).token;
      const created = await host.app.inject({ method: "POST", url: "/api/v1/sessions", headers: { authorization: `Bearer ${teacherToken}` }, payload: { code: "BONUS2", snapshot } });
      expect(created.statusCode).toBe(201);
      const join = async (displayName: string) => (await host.app.inject({ method: "POST", url: "/api/v1/sessions/BONUS2/players", payload: { displayName } })).json();
      const ada = await join("Ada");
      const ben = await join("Ben");
      const token = `Bearer ${ada.playerToken}`;
      const answer = (player: typeof ada, idempotencyKey: string) => host.app.inject({ method: "POST", url: "/api/v1/sessions/BONUS2/answers", headers: { authorization: `Bearer ${player.playerToken}` }, payload: { playerId: player.player.id, questionIndex: 0, optionIndex: 1, idempotencyKey } });
      await host.app.inject({ method: "POST", url: "/api/v1/sessions/BONUS2/commands", headers: { authorization: `Bearer ${created.json().hostToken}` }, payload: { command: { type: "start" } } });
      await answer(ada, "00000000-0000-4000-8000-000000000001");
      await answer(ben, "00000000-0000-4000-8000-000000000002");
      expect((await host.app.inject({ method: "GET", url: "/api/v1/sessions/BONUS2/me", headers: { authorization: token, "x-player-id": ada.player.id } })).json()).toEqual({ available: true, questionIndex: 0, answered: true, selectedOption: 1 });
      const early = await host.app.inject({ method: "POST", url: "/api/v1/sessions/BONUS2/players/bonus", headers: { authorization: token }, payload: { playerId: ada.player.id, boxIndex: 0 } });
      expect(early.statusCode).toBe(400);
      await host.app.inject({ method: "POST", url: "/api/v1/sessions/BONUS2/commands", headers: { authorization: `Bearer ${created.json().hostToken}` }, payload: { command: { type: "reveal" } } });
      const hackIndex = host.sessions.get("BONUS2")!.toPersistence().bonusOffers.find(([key]) => key.endsWith(ada.player.id))![1].indexOf("hack");
      const unauthorized = await host.app.inject({ method: "POST", url: "/api/v1/sessions/BONUS2/players/bonus", headers: { authorization: `Bearer ${ben.playerToken}` }, payload: { playerId: ada.player.id, boxIndex: hackIndex } });
      expect(unauthorized.statusCode).toBe(401);
      const picked = await host.app.inject({ method: "POST", url: "/api/v1/sessions/BONUS2/players/bonus", headers: { authorization: token }, payload: { playerId: ada.player.id, boxIndex: hackIndex } });
      expect(picked.json().bonus.kind).toBe("hack");
      const denied = await host.app.inject({ method: "POST", url: "/api/v1/sessions/BONUS2/players/hack", headers: { authorization: `Bearer ${ben.playerToken}` }, payload: { playerId: ada.player.id, targetId: ben.player.id } });
      expect(denied.statusCode).toBe(401);
      const used = await host.app.inject({ method: "POST", url: "/api/v1/sessions/BONUS2/players/hack", headers: { authorization: token }, payload: { playerId: ada.player.id, targetId: ben.player.id } });
      expect(used.statusCode).toBe(200);
      expect(used.json().bonus.targetId).toBe(ben.player.id);
    } finally { await host.app.close(); }
  });

  it("restores sessions saved before mystery boxes were added", () => {
    const session = new AuthoritativeSession("LEGACY", snapshot);
    const oldState = session.toPersistence() as Partial<ReturnType<typeof session.toPersistence>>;
    delete oldState.bonusOffers;
    delete oldState.bonusSelections;
    delete oldState.scoreAdjustments;
    const restored = AuthoritativeSession.restore(oldState);
    expect(restored.state().phase).toBe("lobby");
    expect(restored.toPersistence().bonusOffers).toEqual([]);
  });
});

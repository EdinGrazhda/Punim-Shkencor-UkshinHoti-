import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRuntimeHost } from "./server.js";
import { makeMemoryStudentAccountStore } from "./student-auth.js";
import { hashPassword, issueTeacherSession, makeMemoryTeacherStore } from "./teacher-auth.js";
import { MemoryRuntimeSessionStore } from "./session-store.js";

const snapshot = {
  id: "approved-quiz",
  title: "Persistence check",
  questions: [{ id: "q1", prompt: "2 + 2?", options: ["3", "4"], correctOption: 1, timeLimitMs: 30000 }],
};

describe("runtime session persistence", () => {
  const teacherStore = makeMemoryTeacherStore();
  const studentStore = makeMemoryStudentAccountStore();
  const runtimeSessionStore = new MemoryRuntimeSessionStore();
  let teacherToken = "";
  let firstHost: ReturnType<typeof createRuntimeHost>;
  let secondHost: ReturnType<typeof createRuntimeHost> | undefined;

  beforeAll(async () => {
    await teacherStore.init();
    const teacher = await teacherStore.create("Ada Teacher", "ada@example.test", await hashPassword("teacher-password-123"), "teacher", false);
    teacherToken = (await issueTeacherSession(teacherStore, teacher)).token;
    firstHost = createRuntimeHost(teacherStore, studentStore, runtimeSessionStore);
    await firstHost.init();
  });

  afterAll(async () => {
    if (secondHost) await secondHost.app.close();
    else await firstHost?.app.close();
  });

  it("restores a live game, answer idempotency, player auth, and host ownership", async () => {
    const created = await firstHost.app.inject({
      method: "POST",
      url: "/api/v1/sessions",
      headers: { authorization: "Bearer " + teacherToken },
      payload: { code: "PERS01", snapshot },
    });
    expect(created.statusCode).toBe(201);

    const joined = await firstHost.app.inject({
      method: "POST",
      url: "/api/v1/sessions/PERS01/players",
      payload: { displayName: "Student" },
    });
    expect(joined.statusCode).toBe(201);
    const { player, playerToken } = joined.json();
    const hostToken = created.json().hostToken as string;

    await firstHost.app.inject({
      method: "POST",
      url: "/api/v1/sessions/PERS01/commands",
      headers: { authorization: "Bearer " + hostToken },
      payload: { command: { type: "start" } },
    });
    const answer = {
      playerId: player.id,
      questionIndex: 0,
      optionIndex: 1,
      idempotencyKey: "00000000-0000-4000-8000-000000000091",
    };
    const accepted = await firstHost.app.inject({
      method: "POST",
      url: "/api/v1/sessions/PERS01/answers",
      headers: { authorization: "Bearer " + playerToken },
      payload: answer,
    });
    expect(accepted.json().accepted).toBe(true);
    expect((await firstHost.app.inject({
      method: "GET",
      url: "/api/v1/sessions/PERS01/me",
      headers: { authorization: "Bearer " + playerToken, "x-player-id": player.id },
    })).json().correctOption).toBeUndefined();

    await firstHost.app.close();
    secondHost = createRuntimeHost(teacherStore, studentStore, runtimeSessionStore);
    await secondHost.init();

    const recoveredPlayer = await secondHost.app.inject({
      method: "GET",
      url: "/api/v1/sessions/PERS01/me",
      headers: { authorization: "Bearer " + playerToken, "x-player-id": player.id },
    });
    expect(recoveredPlayer.statusCode).toBe(200);
    expect(recoveredPlayer.json()).toMatchObject({ answered: true, selectedOption: 1 });
    expect(recoveredPlayer.json().correctOption).toBeUndefined();

    const duplicate = await secondHost.app.inject({
      method: "POST",
      url: "/api/v1/sessions/PERS01/answers",
      headers: { authorization: "Bearer " + playerToken },
      payload: answer,
    });
    expect(duplicate.json()).toMatchObject({ accepted: true, duplicate: true });

    const resumedTeacher = await secondHost.app.inject({
      method: "GET",
      url: "/api/v1/teachers/me/session",
      headers: { authorization: "Bearer " + teacherToken },
    });
    const renewedHostToken = resumedTeacher.json().session.token as string;
    const reveal = await secondHost.app.inject({
      method: "POST",
      url: "/api/v1/sessions/PERS01/commands",
      headers: { authorization: "Bearer " + renewedHostToken },
      payload: { command: { type: "reveal" } },
    });
    expect(reveal.json().state.phase).toBe("reveal");
    expect((await secondHost.app.inject({
      method: "GET",
      url: "/api/v1/sessions/PERS01/me",
      headers: { authorization: "Bearer " + playerToken, "x-player-id": player.id },
    })).json()).toMatchObject({ correct: true, correctOption: 1 });

    const earlyNext = await secondHost.app.inject({
      method: "POST",
      url: "/api/v1/sessions/PERS01/commands",
      headers: { authorization: "Bearer " + renewedHostToken },
      payload: { command: { type: "next" } },
    });
    expect(earlyNext.statusCode).toBe(409);
    await new Promise(resolve => setTimeout(resolve, 3_100));
    const report = await secondHost.app.inject({
      method: "GET",
      url: "/api/v1/sessions/PERS01/host/results",
      headers: { authorization: "Bearer " + renewedHostToken },
    });
    expect(report.statusCode).toBe(200);
    expect(report.json().leaderboard[0].answers[0]).toMatchObject({ correct: true, selectedAnswer: "4" });

    const history = await secondHost.app.inject({
      method: "GET",
      url: "/api/v1/teachers/me/sessions",
      headers: { authorization: "Bearer " + teacherToken },
    });
    expect(history.json().sessions).toContainEqual(expect.objectContaining({ code: "PERS01", title: "Persistence check", phase: "ended", playerCount: 1 }));

    const teacherReport = await secondHost.app.inject({
      method: "GET",
      url: "/api/v1/teachers/me/sessions/PERS01/results",
      headers: { authorization: "Bearer " + teacherToken },
    });
    expect(teacherReport.statusCode).toBe(200);
    expect(teacherReport.json().leaderboard[0].answers[0]).toMatchObject({ correct: true, selectedAnswer: "4" });

    const otherTeacher = await teacherStore.create("Other Teacher", "other@example.test", await hashPassword("other-password-456"), "teacher", false);
    const otherTeacherToken = (await issueTeacherSession(teacherStore, otherTeacher)).token;
    const privateReport = await secondHost.app.inject({
      method: "GET",
      url: "/api/v1/teachers/me/sessions/PERS01/results",
      headers: { authorization: "Bearer " + otherTeacherToken },
    });
    expect(privateReport.statusCode).toBe(404);
  });
});

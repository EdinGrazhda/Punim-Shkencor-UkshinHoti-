import { afterEach, describe, expect, it, vi } from "vitest";
import { createHostedQuizSession } from "./runtime-host.js";

const snapshot = {
  id: "quiz-1", title: "Water basics", questions: [{ id: "q1", prompt: "At what temperature does water freeze?", options: ["0°C", "100°C"], correctOption: 0, timeLimitMs: 30_000, explanation: "Water freezes at 0°C." }],
};

afterEach(() => { vi.unstubAllGlobals(); });

describe("approved quiz runtime bridge", () => {
  it("verifies the local host, authenticates a teacher, and returns no host token", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      if (calls.length === 1) return new Response(JSON.stringify({ ok: true, service: "ckadinti-runtime-host" }), { status: 200 });
      if (calls.length === 2) return new Response(JSON.stringify({ teacher: { role: "teacher", mustChangePassword: false }, token: "teacher-session-token" }), { status: 200 });
      return new Response(JSON.stringify({ code: "ABC234", joinUrl: "http://localhost:4173/join?code=ABC234", hostToken: "private-host-token" }), { status: 201 });
    });

    const result = await createHostedQuizSession(snapshot, " teacher@example.test ", "teacher-password");

    expect(result).toEqual({ code: "ABC234", joinUrl: "http://localhost:4173/join?code=ABC234", title: "Water basics", questionCount: 1 });
    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:4310/health",
      "http://127.0.0.1:4310/api/v1/teachers/login",
      "http://127.0.0.1:4310/api/v1/sessions",
    ]);
    expect(calls.every((call) => call.init?.redirect === "error")).toBe(true);
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ email: "teacher@example.test", password: "teacher-password", expectedRole: "teacher" });
    expect(new Headers(calls[2]?.init?.headers).get("authorization")).toBe("Bearer teacher-session-token");
    expect(JSON.parse(String(calls[2]?.init?.body))).toEqual({ snapshot });
    expect(JSON.stringify(result)).not.toContain("private-host-token");
  });

  it("stops before sign-in if port 4310 is not the CkaDinTi runtime", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, service: "another-local-service" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createHostedQuizSession(snapshot, "teacher@example.test", "teacher-password"))
      .rejects.toThrow(/Nothing responding on the local runtime port/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requires teachers to replace the temporary password before hosting", async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) return new Response(JSON.stringify({ ok: true, service: "ckadinti-runtime-host" }), { status: 200 });
      return new Response(JSON.stringify({ teacher: { role: "teacher", mustChangePassword: true }, token: "temporary-session" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(createHostedQuizSession(snapshot, "teacher@example.test", "temporary-password"))
      .rejects.toThrow(/change the temporary password/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

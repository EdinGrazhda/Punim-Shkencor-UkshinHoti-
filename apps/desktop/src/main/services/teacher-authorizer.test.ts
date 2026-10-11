import { afterEach, describe, expect, it, vi } from "vitest";
import { createTeacherAuthorizer } from "./teacher-authorizer.js";

afterEach(() => vi.unstubAllGlobals());

describe("teacher session authorization", () => {
  it.each([
    [{ teacher: { role: "teacher", mustChangePassword: false } }, true],
    [{ teacher: { role: "admin", mustChangePassword: false } }, false],
    [{ teacher: { role: "teacher", mustChangePassword: true } }, false],
    [{ teacher: { role: "teacher" } }, false],
  ])("validates runtime identity %j", async (identity, allowed) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(identity)));
    vi.stubGlobal("fetch", fetchMock);
    expect(await createTeacherAuthorizer("http://runtime-host:4310")("session-token")).toBe(allowed);
    expect(fetchMock).toHaveBeenCalledWith(new URL("http://runtime-host:4310/api/v1/teachers/me"), expect.objectContaining({
      headers: { Authorization: "Bearer session-token" }, redirect: "error",
    }));
  });

  it.each([401, 403])("rejects expired or forbidden sessions (%s)", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    expect(await createTeacherAuthorizer()("expired-token")).toBe(false);
  });

  it("reports runtime outages instead of allowing access", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(createTeacherAuthorizer()("session-token")).rejects.toThrow("teacher_auth_unavailable");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { createRepositories } from "@ckadinti/database";
import { createTeacherContentApi } from "./teacher-content-api.js";

const instances: Array<ReturnType<typeof createTeacherContentApi>> = [];

async function startApi(overrides: { authorizeTeacher?: (token: string) => Promise<boolean>; getRepositories?: () => ReturnType<typeof createRepositories> } = {}) {
  const repositories = {
    lessons: { list: vi.fn(async () => [{ id: "lesson-1", title: "HTML Basics" }]) },
  } as unknown as ReturnType<typeof createRepositories>;
  const api = createTeacherContentApi({
    port: 0,
    getRepositories: overrides.getRepositories ?? (() => repositories),
    authorizeTeacher: overrides.authorizeTeacher ?? (async token => token === "valid-teacher-token"),
  });
  instances.push(api);
  await api.listen();
  const address = api.address() as AddressInfo;
  return { api, repositories, baseUrl: `http://127.0.0.1:${address.port}/api/teacher-content/v1` };
}

afterEach(async () => {
  await Promise.all(instances.splice(0).map(instance => instance.close()));
});

describe("local teacher content API", () => {
  it("authenticates requests and serves the lesson list without allowing arbitrary origins", async () => {
    const authorizeTeacher = vi.fn(async (token: string) => token === "valid-teacher-token");
    const { baseUrl, repositories } = await startApi({ authorizeTeacher });

    const denied = await fetch(`${baseUrl}/lessons`, { headers: { Origin: "https://untrusted.example", Authorization: "Bearer valid-teacher-token" } });
    expect(denied.status).toBe(403);
    expect(authorizeTeacher).not.toHaveBeenCalled();

    const unauthorized = await fetch(`${baseUrl}/lessons`);
    expect(unauthorized.status).toBe(401);

    const response = await fetch(`${baseUrl}/lessons`, { headers: { Authorization: "Bearer valid-teacher-token" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual([{ id: "lesson-1", title: "HTML Basics" }]);
    expect(repositories.lessons.list).toHaveBeenCalledOnce();
  });

  it("validates generation request JSON before calling the AI service", async () => {
    const getRepositories = vi.fn(() => ({ lessons: { list: vi.fn() } } as unknown as ReturnType<typeof createRepositories>));
    const { baseUrl } = await startApi({ getRepositories });

    const response = await fetch(`${baseUrl}/lessons/589eac50-8f4c-4fa3-a151-f04af1f526b2/generate`, {
      method: "POST",
      headers: { Authorization: "Bearer valid-teacher-token", "Content-Type": "application/json" },
      body: JSON.stringify({ questionCount: 99 }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
    expect(getRepositories).toHaveBeenCalledOnce();
  });

  it("binds only to loopback and returns generic database configuration errors", async () => {
    const getRepositories = vi.fn(() => { throw new Error("Set DATABASE_URL to connect to PostgreSQL."); });
    const { api, baseUrl } = await startApi({ getRepositories });
    expect((api.address() as AddressInfo).address).toBe("127.0.0.1");

    const response = await fetch(`${baseUrl}/lessons`, { headers: { Authorization: "Bearer valid-teacher-token" } });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Teacher content database is unavailable. Check DATABASE_URL and apply the migrations." });
  });
});

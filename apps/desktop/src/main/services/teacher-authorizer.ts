import { z } from "zod";

const identitySchema = z.object({
  teacher: z.object({ role: z.string(), mustChangePassword: z.boolean() }),
});

/** Reuse the runtime's teacher sessions; content services never accept host tokens. */
export function createTeacherAuthorizer(runtimeOrigin = "http://127.0.0.1:4310") {
  const endpoint = new URL("/api/v1/teachers/me", runtimeOrigin);
  return async (token: string): Promise<boolean> => {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(3_000),
    });
    if (response.status === 401 || response.status === 403) return false;
    if (!response.ok) throw new Error("teacher_auth_unavailable");
    const result = identitySchema.safeParse(await response.json());
    return result.success && result.data.teacher.role === "teacher" && !result.data.teacher.mustChangePassword;
  };
}

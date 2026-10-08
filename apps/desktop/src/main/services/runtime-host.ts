import { GameSnapshot, HostCommand, PublicSessionState, SessionCodeParam } from "@ckadinti/contracts";
import { z } from "zod";

const localApi = "http://127.0.0.1:4310";
export type HostedSession = { code: string; joinUrl: string; title: string; questionCount: number };
const hostedSessions = new Map<string, { summary: HostedSession; token: string }>();
const resultsSchema = z.object({
  questions: z.number().int().positive(),
  leaderboard: z.array(z.object({
    id: z.string(), displayName: z.string(), score: z.number(),
    answers: z.array(z.object({
      questionIndex: z.number().int().nonnegative(), prompt: z.string(), answered: z.boolean(),
      selectedOption: z.number().int().optional(), selectedAnswer: z.string().optional(),
      correctOption: z.number().int(), correctAnswer: z.string(), correct: z.boolean(), score: z.number(),
    })),
  })),
});
export type HostedResults = z.infer<typeof resultsSchema>;

export function listHostedSessions(): HostedSession[] {
  return [...hostedSessions.values()].map(({ summary }) => ({ ...summary })).reverse();
}

function ownedSession(codeInput: unknown) {
  const { code } = SessionCodeParam.parse({ code: codeInput });
  const session = hostedSessions.get(code);
  if (!session) throw new Error("Open a session created in this desktop workspace first.");
  return session;
}

export async function getHostedSessionState(code: unknown) {
  const session = ownedSession(code);
  return PublicSessionState.parse(await requestJson(`/api/v1/sessions/${session.summary.code}`));
}

export async function commandHostedSession(code: unknown, input: unknown) {
  const session = ownedSession(code);
  const command = HostCommand.parse(input);
  const response = await requestJson(`/api/v1/sessions/${session.summary.code}/commands`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ command }),
  });
  return z.object({ state: PublicSessionState }).parse(response).state;
}

export async function getHostedSessionResults(code: unknown): Promise<HostedResults> {
  const session = ownedSession(code);
  return resultsSchema.parse(await requestJson(`/api/v1/sessions/${session.summary.code}/host/results`, {
    headers: { Authorization: `Bearer ${session.token}` },
  }));
}
const teacherLoginResponseSchema = z.object({
  teacher: z.object({ role: z.enum(["teacher", "admin"]), mustChangePassword: z.boolean() }),
  token: z.string().min(1),
});
const createSessionResponseSchema = z.object({
  code: z.string().length(6),
  joinUrl: z.string().url(),
  hostToken: z.string().min(1),
});

async function requestJson(path: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(`${localApi}${path}`, { ...init, redirect: "error", signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new Error("Could not reach the local classroom runtime. Start PostgreSQL and the runtime host, then try again.");
  }

  const text = await response.text();
  let payload: unknown = {};
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new Error("The local classroom runtime returned an unreadable response.");
    }
  }
  if (!response.ok) {
    const error = (payload && typeof payload === "object" ? payload : {}) as { error?: unknown };
    if (error.error === "invalid_credentials" || error.error === "unauthorized") {
      throw new Error("Teacher sign-in failed. Check the teacher email and password.");
    }
    if (error.error === "wrong_sign_in_portal") {
      throw new Error("Use a teacher account to host a quiz. Admin accounts can create teacher accounts.");
    }
    if (error.error === "password_change_required") {
      throw new Error("Sign in to the browser teacher portal and change the temporary password before hosting.");
    }
    throw new Error(typeof error.error === "string" ? error.error : `Local classroom runtime request failed (${response.status}).`);
  }
  if (!text) throw new Error("The local classroom runtime returned an empty response.");
  return payload;
}

/** Sends an approved snapshot only to the loopback runtime. Credentials and
 * bearer tokens remain in Electron's main process and are never returned. */
export async function createHostedQuizSession(snapshotInput: unknown, emailInput: string, password: string) {
  const snapshot = GameSnapshot.parse(snapshotInput);
  const email = z.string().trim().email().max(254).parse(emailInput).toLowerCase();
  if (!password || password.length > 128) throw new Error("Enter the teacher account password.");

  const healthPayload = await requestJson("/health");
  if (!healthPayload || typeof healthPayload !== "object" || (healthPayload as { service?: unknown }).service !== "ckadinti-runtime-host") {
    throw new Error("Nothing responding on the local runtime port identifies as CkaDinTi. Check the host service and port 4310.");
  }

  const loginPayload = await requestJson("/api/v1/teachers/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, expectedRole: "teacher" }),
  });
  const login = teacherLoginResponseSchema.parse(loginPayload);
  if (login.teacher.role !== "teacher") throw new Error("Only a teacher account can host a quiz.");
  if (login.teacher.mustChangePassword) {
    throw new Error("Sign in to the browser teacher portal and change the temporary password before hosting.");
  }

  const sessionPayload = await requestJson("/api/v1/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.token}` },
    body: JSON.stringify({ snapshot }),
  });
  const session = createSessionResponseSchema.parse(sessionPayload);
  const summary = { code: session.code, joinUrl: session.joinUrl, title: snapshot.title, questionCount: snapshot.questions.length };
  hostedSessions.set(session.code, { summary, token: session.hostToken });
  return summary;
}

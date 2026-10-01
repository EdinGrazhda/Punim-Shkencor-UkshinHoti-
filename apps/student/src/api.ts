import type { GameSnapshot, HostCommand, PublicSessionState } from "@ckadinti/contracts";
import { io, type Socket } from "socket.io-client";

export type PlayerIdentity = { code: string; id: string; token: string; name: string; emblem: string };
export type HostIdentity = { code: string; token: string };
export type TeacherIdentity = { teacher: { id: string; name: string; email: string; role: "teacher" | "admin"; mustChangePassword: boolean }; token: string };
export type AdminOverview = {
  teachers: { id: string; name: string; email: string; role: "teacher"; mustChangePassword: boolean; createdAt: string }[];
  games: { code: string; title: string; phase: string; playerCount: number; teacherId?: string; teacherName: string; teacherEmail?: string; createdAt: number; question?: { index: number; count: number; prompt: string; deadlineAt: number; answeredCount: number }; players: { id: string; displayName: string; connected: boolean; answered: boolean }[]; leaderboard: { id: string; displayName: string; score: number }[] }[];
  totals: { teachers: number; games: number; liveGames: number; players: number };
};
export type PlayerResult = { available: boolean; score?: number; questionScore?: number; correct?: boolean; answered?: boolean; streak?: number };
export type Leaderboard = { leaderboard: { id: string; displayName: string; score: number }[]; questions: number };

const base = "/api/v1";
async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error === "session_not_found" ? "Game code not found." : data.error === "lobby_closed" ? "This lobby is closed." : data.error === "unauthorized" ? "Session access expired. Please join again." : data.error ?? "Request failed.");
  return data as T;
}

export const api = {
  state: (code: string) => request<PublicSessionState>(`/sessions/${code}`),
  create: (snapshot: GameSnapshot, teacherToken: string) => request<{ code: string; hostToken: string; joinUrl: string; state: PublicSessionState }>("/sessions", { method: "POST", body: JSON.stringify({ snapshot }) }, teacherToken),
  loginTeacher: (email: string, password: string, expectedRole: "teacher" | "admin") => request<TeacherIdentity>("/teachers/login", { method: "POST", body: JSON.stringify({ email, password, expectedRole }) }),
  changeTeacherPassword: (token: string, currentPassword: string, newPassword: string) => request<TeacherIdentity>("/teachers/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }, token),
  teacherMe: (token: string) => request<{ teacher: TeacherIdentity["teacher"] }>("/teachers/me", {}, token),
  teacherSession: (token: string) => request<{ session: { code: string; token: string; state: PublicSessionState } | null }>("/teachers/me/session", {}, token),
  logoutTeacher: (token: string) => request<{ ok: boolean }>("/teachers/logout", { method: "POST" }, token),
  adminOverview: (token: string) => request<AdminOverview>("/admin/overview", {}, token),
  adminCreateTeacher: (token: string, name: string, email: string, password?: string) => request<{ teacher: AdminOverview["teachers"][number]; temporaryPassword?: string }>("/admin/teachers", { method: "POST", body: JSON.stringify({ name, email, ...(password ? { password } : {}) }) }, token),
  adminUpdateTeacher: (token: string, id: string, name: string, email: string, password?: string) => request<{ teacher: AdminOverview["teachers"][number] }>(`/admin/teachers/${id}`, { method: "PATCH", body: JSON.stringify({ name, email, ...(password ? { password } : {}) }) }, token),
  adminDeleteTeacher: (token: string, id: string) => request<{ ok: boolean }>(`/admin/teachers/${id}`, { method: "DELETE" }, token),
  join: (code: string, displayName: string, emblem: string) => request<{ player: { id: string }; playerToken: string; state: PublicSessionState }>(`/sessions/${code}/players`, { method: "POST", body: JSON.stringify({ displayName, emblem }) }),
  reconnect: (identity: PlayerIdentity) => request<{ state: PublicSessionState }>(`/sessions/${identity.code}/players/reconnect`, { method: "POST", body: JSON.stringify({ playerId: identity.id }) }, identity.token),
  answer: (identity: PlayerIdentity, questionIndex: number, optionIndex: number, idempotencyKey: string) => request<{ accepted: boolean; duplicate?: boolean; reason?: string }>(`/sessions/${identity.code}/answers`, { method: "POST", body: JSON.stringify({ playerId: identity.id, questionIndex, optionIndex, idempotencyKey }) }, identity.token),
  command: (host: HostIdentity, command: HostCommand) => request<{ state: PublicSessionState }>(`/sessions/${host.code}/commands`, { method: "POST", body: JSON.stringify({ command }) }, host.token),
  me: (identity: PlayerIdentity) => request<PlayerResult>(`/sessions/${identity.code}/me`, { headers: { "x-player-id": identity.id } }, identity.token),
  results: (code: string) => request<Leaderboard>(`/sessions/${code}/results`),
  host: (host: HostIdentity) => request<{ snapshot: GameSnapshot; state: PublicSessionState; leaderboard: Leaderboard["leaderboard"] }>(`/sessions/${host.code}/host`, {}, host.token),
};

export function watchSession(code: string, onState: (state: PublicSessionState) => void): Socket {
  const socket = io(window.location.origin, { transports: ["websocket", "polling"] });
  socket.on("connect", () => socket.emit("session:watch", { code }, (reply: { ok: boolean; state?: PublicSessionState }) => { if (reply.ok && reply.state) onState(reply.state); }));
  socket.on("session:state", onState);
  return socket;
}

export const demoQuiz: GameSnapshot = {
  id: "cyber-security-basics",
  title: "Cyber Security Basics",
  questions: [
    { id: "password", prompt: "What is the safest way to create a password?", options: ["Use a long, random combination of letters, numbers and symbols", "Use your name and birth year", "Use the same password everywhere", "Use a common word like password"], correctOption: 0, timeLimitMs: 30000, explanation: "Strong passwords are long and unpredictable. A password manager can create and remember them for you." },
    { id: "phishing", prompt: "An unexpected email asks you to verify your school account. What should you do?", options: ["Open the link immediately", "Check the sender and ask a trusted adult or teacher", "Reply with your password", "Forward it to everyone"], correctOption: 1, timeLimitMs: 30000, explanation: "Pause and verify unexpected requests using a trusted channel before clicking links or sharing details." },
    { id: "updates", prompt: "Why should you keep your device updated?", options: ["Updates only change the wallpaper", "They can fix security problems and bugs", "They make passwords unnecessary", "Updates remove all viruses instantly"], correctOption: 1, timeLimitMs: 30000, explanation: "Software updates often include fixes for newly discovered security weaknesses." },
    { id: "wifi", prompt: "What should you avoid on public Wi-Fi?", options: ["Reading a weather forecast", "Sharing sensitive account information on an untrusted connection", "Closing unused tabs", "Turning down your screen brightness"], correctOption: 1, timeLimitMs: 30000, explanation: "Public networks can be less secure. Avoid sensitive actions unless the connection is protected and trusted." },
    { id: "two-factor", prompt: "What does two-factor authentication add?", options: ["A second check before someone can sign in", "A second username", "An automatic password reset every day", "A public copy of your password"], correctOption: 0, timeLimitMs: 30000, explanation: "A second factor makes it harder for someone else to access your account even if they know your password." },
  ],
};

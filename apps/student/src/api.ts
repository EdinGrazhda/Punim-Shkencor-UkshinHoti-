import type {
  GameSnapshot,
  HostCommand,
  PublicSessionState,
} from "@ckadinti/contracts";
import { io, type Socket } from "socket.io-client";

export type PlayerIdentity = {
  code: string;
  id: string;
  token: string;
  name: string;
  emblem: string;
};
export type StudentAccountIdentity = {
  student: { id: string; name: string; email: string };
  token: string;
};
export type HostIdentity = { code: string; token: string };
export type TeacherIdentity = {
  teacher: {
    id: string;
    name: string;
    email: string;
    role: "teacher" | "admin";
    mustChangePassword: boolean;
  };
  token: string;
};
const legacyTeacherAuthKey = "ckadinti-teacher";
function teacherAuthKey(role: TeacherIdentity["teacher"]["role"]) {
  return `ckadinti-${role}-auth`;
}
export function readTeacherIdentity(
  role: TeacherIdentity["teacher"]["role"],
): TeacherIdentity | null {
  const parse = (raw: string | null) => {
    try {
      return raw ? (JSON.parse(raw) as TeacherIdentity) : null;
    } catch {
      return null;
    }
  };
  const scoped = parse(localStorage.getItem(teacherAuthKey(role)));
  if (scoped?.teacher?.role === role && scoped.token) return scoped;
  const legacy = parse(localStorage.getItem(legacyTeacherAuthKey));
  if (legacy?.teacher?.role !== role || !legacy.token) return null;
  localStorage.setItem(teacherAuthKey(role), JSON.stringify(legacy));
  return legacy;
}
export function storeTeacherIdentity(identity: TeacherIdentity) {
  localStorage.setItem(
    teacherAuthKey(identity.teacher.role),
    JSON.stringify(identity),
  );
  localStorage.setItem(legacyTeacherAuthKey, JSON.stringify(identity));
}
export function clearTeacherIdentity(identity: TeacherIdentity) {
  localStorage.removeItem(teacherAuthKey(identity.teacher.role));
  try {
    const legacy = JSON.parse(
      localStorage.getItem(legacyTeacherAuthKey) ?? "null",
    ) as TeacherIdentity | null;
    if (legacy?.token === identity.token)
      localStorage.removeItem(legacyTeacherAuthKey);
  } catch {
    localStorage.removeItem(legacyTeacherAuthKey);
  }
}
export type AdminOverview = {
  teachers: {
    id: string;
    name: string;
    email: string;
    role: "teacher";
    mustChangePassword: boolean;
    createdAt: string;
  }[];
  games: {
    code: string;
    title: string;
    phase: string;
    playerCount: number;
    teacherId?: string;
    teacherName: string;
    teacherEmail?: string;
    createdAt: number;
    question?: {
      index: number;
      count: number;
      prompt: string;
      deadlineAt: number;
      answeredCount: number;
    };
    players: {
      id: string;
      displayName: string;
      connected: boolean;
      answered: boolean;
    }[];
    leaderboard: { id: string; displayName: string; score: number }[];
  }[];
  totals: {
    teachers: number;
    games: number;
    liveGames: number;
    players: number;
  };
};
export type PlayerResult = {
  available: boolean;
  questionIndex?: number;
  xp?: number;
  questionXp?: number;
  selectedOption?: number;
  correctOption?: number;
  score?: number;
  questionScore?: number;
  correct?: boolean;
  answered?: boolean;
  streak?: number;
};
export type Leaderboard = {
  leaderboard: { id: string; displayName: string; score: number }[];
  questions: number;
};
export type HostResults = {
  leaderboard: {
    id: string;
    displayName: string;
    score: number;
    answers: {
      questionIndex: number;
      prompt: string;
      answered: boolean;
      selectedOption?: number;
      selectedAnswer?: string;
      correctOption: number;
      correctAnswer: string;
      correct: boolean;
      score: number;
    }[];
  }[];
  questions: number;
};
export type TeacherSessionSummary = {
  code: string;
  title: string;
  phase: PublicSessionState["phase"];
  playerCount: number;
  questionCount: number;
  createdAt: number;
  completedAt: number | null;
};
export type StudentLeaderboard = {
  leaderboard: {
    id: string;
    displayName: string;
    score: number;
    gamesPlayed: number;
  }[];
};
export type TeacherLesson = {
  id: string;
  title: string;
  subject: string | null;
  language: string;
  sourceType: "txt" | "markdown" | "pdf" | "docx";
  originalFilename: string | null;
  createdAt: string;
  updatedAt: string;
};
export type TeacherQuizSummary = {
  id: string;
  lessonId: string | null;
  title: string;
  language: string;
  difficulty: "easy" | "medium" | "hard";
  status: "draft" | "needs-review" | "approved";
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type TeacherReviewQuestion = {
  id: string;
  quizId: string;
  kind: "multiple-choice" | "true-false";
  prompt: string;
  explanation: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  aiGenerated: boolean;
  aiConfidence: "low" | "medium" | "high" | null;
  reviewStatus: "draft" | "needs-review" | "approved" | "rejected";
  ordinal: number;
  options: {
    id: string;
    questionId: string;
    ordinal: number;
    text: string;
    isCorrect: boolean;
  }[];
  evidence: {
    id: string;
    questionId: string;
    lessonBlockId: string;
    quoteStart: number;
    quoteEnd: number;
    blockOrdinal: number | null;
    quote: string;
  }[];
};
export type TeacherReviewQuiz = TeacherQuizSummary & {
  questions: TeacherReviewQuestion[];
};

const base = "/api/v1";
async function request<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error === "session_not_found"
        ? "Game code not found."
        : data.error === "lobby_closed"
          ? "This lobby is closed."
          : data.error === "unauthorized"
            ? "Session access expired. Please join again."
            : (data.error ?? "Request failed."),
    );
  return data as T;
}

export const api = {
  state: (code: string) => request<PublicSessionState>(`/sessions/${code}`),
  registerStudent: (name: string, email: string, password: string) =>
    request<StudentAccountIdentity>("/students/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),
  loginStudent: (email: string, password: string) =>
    request<StudentAccountIdentity>("/students/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  studentMe: (token: string) =>
    request<{ student: StudentAccountIdentity["student"] }>(
      "/students/me",
      {},
      token,
    ),
  logoutStudent: (token: string) =>
    request<{ ok: boolean }>("/students/logout", { method: "POST" }, token),
  studentLeaderboard: () =>
    request<StudentLeaderboard>("/students/leaderboard"),
  create: (snapshot: GameSnapshot, teacherToken: string) =>
    request<{
      code: string;
      hostToken: string;
      joinUrl: string;
      state: PublicSessionState;
    }>(
      "/sessions",
      { method: "POST", body: JSON.stringify({ snapshot }) },
      teacherToken,
    ),
  loginTeacher: (
    email: string,
    password: string,
    expectedRole: "teacher" | "admin",
  ) =>
    request<TeacherIdentity>("/teachers/login", {
      method: "POST",
      body: JSON.stringify({ email, password, expectedRole }),
    }),
  changeTeacherPassword: (
    token: string,
    currentPassword: string,
    newPassword: string,
  ) =>
    request<TeacherIdentity>(
      "/teachers/change-password",
      {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      },
      token,
    ),
  teacherMe: (token: string) =>
    request<{ teacher: TeacherIdentity["teacher"] }>("/teachers/me", {}, token),
  teacherSession: (token: string) =>
    request<{
      session: {
        code: string;
        token: string;
        state: PublicSessionState;
      } | null;
    }>("/teachers/me/session", {}, token),
  teacherSessions: (token: string) =>
    request<{ sessions: TeacherSessionSummary[] }>("/teachers/me/sessions", {}, token),
  teacherSessionResults: (token: string, code: string) =>
    request<HostResults>(`/teachers/me/sessions/${code}/results`, {}, token),
  logoutTeacher: (token: string) =>
    request<{ ok: boolean }>("/teachers/logout", { method: "POST" }, token),
  adminOverview: (token: string) =>
    request<AdminOverview>("/admin/overview", {}, token),
  adminCreateTeacher: (
    token: string,
    name: string,
    email: string,
    password?: string,
  ) =>
    request<{
      teacher: AdminOverview["teachers"][number];
      temporaryPassword?: string;
    }>(
      "/admin/teachers",
      {
        method: "POST",
        body: JSON.stringify({
          name,
          email,
          ...(password ? { password } : {}),
        }),
      },
      token,
    ),
  adminUpdateTeacher: (
    token: string,
    id: string,
    name: string,
    email: string,
    password?: string,
  ) =>
    request<{ teacher: AdminOverview["teachers"][number] }>(
      `/admin/teachers/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          name,
          email,
          ...(password ? { password } : {}),
        }),
      },
      token,
    ),
  adminDeleteTeacher: (token: string, id: string) =>
    request<{ ok: boolean }>(
      `/admin/teachers/${id}`,
      { method: "DELETE" },
      token,
    ),
  join: (
    code: string,
    displayName: string,
    emblem: string,
    studentToken?: string,
  ) =>
    request<{
      player: { id: string };
      playerToken: string;
      state: PublicSessionState;
    }>(
      `/sessions/${code}/players`,
      { method: "POST", body: JSON.stringify({ displayName, emblem }) },
      studentToken,
    ),
  reconnect: (identity: PlayerIdentity) =>
    request<{ state: PublicSessionState }>(
      `/sessions/${identity.code}/players/reconnect`,
      { method: "POST", body: JSON.stringify({ playerId: identity.id }) },
      identity.token,
    ),
  answer: (
    identity: PlayerIdentity,
    questionIndex: number,
    optionIndex: number,
    idempotencyKey: string,
  ) =>
    request<{ accepted: boolean; duplicate?: boolean; reason?: string }>(
      `/sessions/${identity.code}/answers`,
      {
        method: "POST",
        body: JSON.stringify({
          playerId: identity.id,
          questionIndex,
          optionIndex,
          idempotencyKey,
        }),
      },
      identity.token,
    ),
  command: (host: HostIdentity, command: HostCommand) =>
    request<{ state: PublicSessionState }>(
      `/sessions/${host.code}/commands`,
      { method: "POST", body: JSON.stringify({ command }) },
      host.token,
    ),
  me: (identity: PlayerIdentity) =>
    request<PlayerResult>(
      `/sessions/${identity.code}/me`,
      { headers: { "x-player-id": identity.id } },
      identity.token,
    ),
  results: (code: string) => request<Leaderboard>(`/sessions/${code}/results`),
  hostResults: (host: HostIdentity) =>
    request<HostResults>(`/sessions/${host.code}/host/results`, {}, host.token),
  host: (host: HostIdentity) =>
    request<{
      snapshot: GameSnapshot;
      state: PublicSessionState;
      leaderboard: Leaderboard["leaderboard"];
    }>(`/sessions/${host.code}/host`, {}, host.token),
};

async function teacherContentRequest<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/teacher-content/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(typeof init.body === "string"
          ? { "Content-Type": "application/json" }
          : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new Error("Cannot reach the teacher content service. Start the Electron desktop app and keep it open; it hosts the local browser authoring API.");
  }
  const unavailableMessage = `Teacher content service returned HTTP ${response.status}. Start or restart the Electron desktop app; it hosts the local browser authoring API.`;
  const text = await response.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(
        response.ok
          ? "Teacher content service returned an invalid response."
          : response.status >= 500
            ? unavailableMessage
            : `Teacher content service failed (${response.status}).`,
      );
    }
  }
  if (!response.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : response.status >= 500
          ? unavailableMessage
          : `Teacher content request failed (${response.status}).`,
    );
  return data as T;
}

export const teacherContentApi = {
  listLessons: (token: string) =>
    teacherContentRequest<TeacherLesson[]>("/lessons", token),
  importLesson: async (token: string, file: File) =>
    teacherContentRequest<{ lesson: TeacherLesson; duplicate: boolean }>(
      "/lessons",
      token,
      {
        method: "POST",
        body: await file.arrayBuffer(),
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Lesson-Filename": encodeURIComponent(file.name),
        },
      },
    ),
  generateQuiz: (token: string, lessonId: string, questionCount: number) =>
    teacherContentRequest<{
      quizId: string;
      title: string;
      questionCount: number;
      status: "needs-review";
      sampledSource?: boolean;
    }>(`/lessons/${lessonId}/generate`, token, {
      method: "POST",
      body: JSON.stringify({ questionCount }),
    }),
  listQuizzes: (token: string) =>
    teacherContentRequest<TeacherQuizSummary[]>("/quizzes", token),
  getQuiz: (token: string, id: string) =>
    teacherContentRequest<TeacherReviewQuiz>(`/quizzes/${id}`, token),
  saveQuestion: (
    token: string,
    question: Pick<
      TeacherReviewQuestion,
      "id" | "prompt" | "explanation" | "topic" | "difficulty" | "options"
    >,
  ) =>
    teacherContentRequest<{ questionId: string; reviewStatus: "needs-review" }>(
      `/questions/${question.id}`,
      token,
      {
        method: "PATCH",
        body: JSON.stringify({
          questionId: question.id,
          prompt: question.prompt,
          explanation: question.explanation,
          topic: question.topic,
          difficulty: question.difficulty,
          options: question.options.map(({ text, isCorrect }) => ({
            text,
            isCorrect,
          })),
        }),
      },
    ),
  decideQuestion: (
    token: string,
    questionId: string,
    reviewStatus: "approved" | "rejected",
  ) =>
    teacherContentRequest<{
      questionId: string;
      reviewStatus: "approved" | "rejected";
    }>(`/questions/${questionId}/decision`, token, {
      method: "POST",
      body: JSON.stringify({ questionId, reviewStatus }),
    }),
  regenerateQuestion: (token: string, questionId: string) =>
    teacherContentRequest<{
      questionId: string;
      prompt: string;
      reviewStatus: "needs-review";
    }>(`/questions/${questionId}/regenerate`, token, { method: "POST" }),
  approveQuiz: (token: string, quizId: string) =>
    teacherContentRequest<{ quizId: string; status: "approved" }>(
      `/quizzes/${quizId}/approve`,
      token,
      { method: "POST" },
    ),
  approvedSnapshot: (token: string, quizId: string) =>
    teacherContentRequest<GameSnapshot>(`/quizzes/${quizId}/snapshot`, token, {
      method: "POST",
    }),
};

export function watchSession(
  code: string,
  onState: (state: PublicSessionState) => void,
): Socket {
  const socket = io(window.location.origin, {
    transports: ["websocket", "polling"],
  });
  socket.on("connect", () =>
    socket.emit(
      "session:watch",
      { code },
      (reply: { ok: boolean; state?: PublicSessionState }) => {
        if (reply.ok && reply.state) onState(reply.state);
      },
    ),
  );
  socket.on("session:state", onState);
  return socket;
}

export const demoQuiz: GameSnapshot = {
  id: "cyber-security-basics",
  title: "Cyber Security Basics",
  questions: [
    {
      id: "password",
      prompt: "What is the safest way to create a password?",
      options: [
        "Use a long, random combination of letters, numbers and symbols",
        "Use your name and birth year",
        "Use the same password everywhere",
        "Use a common word like password",
      ],
      correctOption: 0,
      timeLimitMs: 10000,
      explanation:
        "Strong passwords are long and unpredictable. A password manager can create and remember them for you.",
    },
    {
      id: "phishing",
      prompt:
        "An unexpected email asks you to verify your school account. What should you do?",
      options: [
        "Open the link immediately",
        "Check the sender and ask a trusted adult or teacher",
        "Reply with your password",
        "Forward it to everyone",
      ],
      correctOption: 1,
      timeLimitMs: 10000,
      explanation:
        "Pause and verify unexpected requests using a trusted channel before clicking links or sharing details.",
    },
    {
      id: "updates",
      prompt: "Why should you keep your device updated?",
      options: [
        "Updates only change the wallpaper",
        "They can fix security problems and bugs",
        "They make passwords unnecessary",
        "Updates remove all viruses instantly",
      ],
      correctOption: 1,
      timeLimitMs: 10000,
      explanation:
        "Software updates often include fixes for newly discovered security weaknesses.",
    },
    {
      id: "wifi",
      prompt: "What should you avoid on public Wi-Fi?",
      options: [
        "Reading a weather forecast",
        "Sharing sensitive account information on an untrusted connection",
        "Closing unused tabs",
        "Turning down your screen brightness",
      ],
      correctOption: 1,
      timeLimitMs: 10000,
      explanation:
        "Public networks can be less secure. Avoid sensitive actions unless the connection is protected and trusted.",
    },
    {
      id: "two-factor",
      prompt: "What does two-factor authentication add?",
      options: [
        "A second check before someone can sign in",
        "A second username",
        "An automatic password reset every day",
        "A public copy of your password",
      ],
      correctOption: 0,
      timeLimitMs: 10000,
      explanation:
        "A second factor makes it harder for someone else to access your account even if they know your password.",
    },
  ],
};

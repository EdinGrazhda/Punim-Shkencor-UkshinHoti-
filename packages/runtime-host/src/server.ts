import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { Server } from "socket.io";
import {
  AnswerRequest,
  CreateSessionRequest,
  GameSnapshot,
  HostCommand,
  HttpAnswerRequest,
  JoinRequest,
  ReconnectRequest,
  SessionCodeParam,
} from "@ckadinti/contracts";
import { AuthoritativeSession } from "./session.js";
import { buildJoinPayload, createSessionCode } from "./join.js";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { hashPassword, hashToken, issueTeacherSession, makeTeacherStore, verifyPassword, type TeacherStore } from "./teacher-auth.js";
import { issueStudentSession, makeStudentAccountStore, type StudentAccountStore } from "./student-auth.js";
import { makeRuntimeSessionStore, type RuntimeSessionStore } from "./session-store.js";

type CodeParams = { code: string };

function errorResponse(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : "request_failed";
  const status = message === "session_not_found" || message === "player_not_found" || message === "teacher_not_found" ? 404 : message === "email_taken" || message === "invalid_phase" || message === "lobby_closed" || message === "deadline_passed" ? 409 : 400;
  return reply.code(status).send({ error: message });
}

const email = z.string().trim().email().max(254).transform(value => value.toLowerCase());
const loginBody = z.object({ email, password: z.string().min(1), expectedRole: z.enum(["teacher", "admin"]).optional() });
const createTeacherBody = z.object({ name: z.string().trim().min(2).max(80), email, password: z.string().min(10).max(128).optional() });
const updateTeacherBody = z.object({ name: z.string().trim().min(2).max(80), email, password: z.string().min(10).max(128).optional() });
const changePasswordBody = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(10).max(128) }).refine(body => body.currentPassword !== body.newPassword, { message: "new_password_must_differ" });
const studentAccountBody = z.object({ name: z.string().trim().min(2).max(80), email, password: z.string().min(10).max(128) });
const studentLoginBody = z.object({ email, password: z.string().min(1) });

export function createRuntimeHost(
  teacherStore: TeacherStore = makeTeacherStore(),
  studentStore: StudentAccountStore = makeStudentAccountStore(),
  runtimeSessionStore: RuntimeSessionStore = makeRuntimeSessionStore(),
) {
  const app = Fastify({ logger: false });
  const io = new Server(app.server, { cors: { origin: true } });
  const sessions = new Map<string, AuthoritativeSession>();
  const owners = new Map<string, string>();
  app.register(cors, { origin: true });

  const getSession = (code: string) => {
    const session = sessions.get(code.toUpperCase());
    if (!session) throw new Error("session_not_found");
    return session;
  };
  const joinPayload = (request: FastifyRequest, code: string) => buildJoinPayload(process.env.STUDENT_ORIGIN ?? `${request.protocol}://${request.hostname.split(":")[0]}:4173`, code);
  const token = (request: FastifyRequest) => request.headers.authorization?.replace(/^Bearer\s+/i, "");
  const persistSession = (session: AuthoritativeSession) => runtimeSessionStore.save({
    code: session.code,
    ownerTeacherId: owners.get(session.code) ?? null,
    state: session.toPersistence(),
  });
  const teacherFromRequest = async (request: FastifyRequest) => {
    const value = token(request);
    return value ? teacherStore.findByToken(hashToken(value)) : null;
  };
  const hostResults = (session: AuthoritativeSession) => ({
    leaderboard: session.leaderboard().map(player => ({ ...player, answers: session.answerBreakdown(player.id) })),
    questions: session.snapshot.questions.length,
  });
  const publish = (session: AuthoritativeSession) => io.to(session.code).emit("session:state", session.state());
  const dirtySessions = new Set<string>();
  let tickerRunning = false;
  const ticker = setInterval(() => {
    if (tickerRunning) return;
    tickerRunning = true;
    void (async () => {
      for (const session of sessions.values()) {
        const previousPhase = session.state().phase;
        session.tick();
        const phaseChanged = previousPhase !== session.state().phase;
        if (phaseChanged) dirtySessions.add(session.code);
        if (!dirtySessions.has(session.code)) continue;
        try {
          await persistSession(session);
          dirtySessions.delete(session.code);
          if (phaseChanged) publish(session);
        } catch (error) {
          app.log.error({ err: error, sessionCode: session.code }, "Could not persist runtime session state");
        }
      }
    })().finally(() => { tickerRunning = false; });
  }, 250);
  ticker.unref();
  app.addHook("onClose", async () => { clearInterval(ticker); await teacherStore.close(); await studentStore.close(); await runtimeSessionStore.close(); });

  const initialize = async () => {
    await Promise.all([teacherStore.init(), studentStore.init(), runtimeSessionStore.init()]);
    for (const record of await runtimeSessionStore.list()) {
      const session = AuthoritativeSession.restore(record.state);
      sessions.set(session.code, session);
      if (record.ownerTeacherId) owners.set(session.code, record.ownerTeacherId);
    }
  };

  app.get("/health", async () => ({ ok: true, service: "ckadinti-runtime-host" }));
  app.get("/api/v1/health", async () => ({ ok: true, service: "ckadinti-runtime-host" }));
  app.get("/network-readiness", async () => ({ ok: true, host: app.server.address() }));
  app.get("/api/v1/network-readiness", async () => ({ ok: true, host: app.server.address() }));

  app.post("/api/v1/students/register", async (request, reply) => {
    try {
      const body = studentAccountBody.parse(request.body);
      const student = await studentStore.create(body.name, body.email, body.password);
      return reply.code(201).send(await issueStudentSession(studentStore, student));
    } catch (error) { return errorResponse(reply, error); }
  });
  app.post("/api/v1/students/login", async (request, reply) => {
    try {
      const body = studentLoginBody.parse(request.body);
      const student = await studentStore.authenticate(body.email, body.password);
      if (!student) return reply.code(401).send({ error: "invalid_credentials" });
      return reply.send(await issueStudentSession(studentStore, student));
    } catch (error) { return errorResponse(reply, error); }
  });
  app.get("/api/v1/students/me", async (request, reply) => {
    const value = token(request);
    const student = value ? await studentStore.findByToken(hashToken(value)) : null;
    return student ? reply.send({ student }) : reply.code(401).send({ error: "unauthorized" });
  });
  app.post("/api/v1/students/logout", async (request, reply) => {
    const value = token(request);
    if (value) await studentStore.deleteSession(hashToken(value));
    return reply.send({ ok: true });
  });

  app.post("/api/v1/teachers/login", async (request, reply) => {
    try {
      const body = loginBody.parse(request.body);
      const teacher = await teacherStore.findByEmail(body.email);
      if (!teacher || !await verifyPassword(body.password, teacher.passwordHash)) return reply.code(401).send({ error: "invalid_credentials" });
      if (body.expectedRole && teacher.role !== body.expectedRole) return reply.code(403).send({ error: "wrong_sign_in_portal" });
      return reply.send(await issueTeacherSession(teacherStore, teacher));
    } catch (error) { return errorResponse(reply, error); }
  });
  app.get("/api/v1/teachers/me", async (request, reply) => {
    const teacher = await teacherFromRequest(request);
    return teacher ? reply.send({ teacher }) : reply.code(401).send({ error: "unauthorized" });
  });
  app.post("/api/v1/teachers/change-password", async (request, reply) => {
    try {
      const teacher = await teacherFromRequest(request);
      if (!teacher) return reply.code(401).send({ error: "unauthorized" });
      const body = changePasswordBody.parse(request.body);
      const stored = await teacherStore.findByEmail(teacher.email);
      if (!stored || !await verifyPassword(body.currentPassword, stored.passwordHash)) return reply.code(401).send({ error: "invalid_credentials" });
      await teacherStore.updatePassword(teacher.id, await hashPassword(body.newPassword));
      return reply.send(await issueTeacherSession(teacherStore, { ...teacher, mustChangePassword: false }));
    } catch (error) { return errorResponse(reply, error); }
  });
  app.post("/api/v1/teachers/logout", async (request, reply) => {
    const value = token(request);
    if (value) await teacherStore.deleteSession(hashToken(value));
    return reply.send({ ok: true });
  });
  app.get("/api/v1/teachers/me/session", async (request, reply) => {
    const teacher = await teacherFromRequest(request);
    if (!teacher) return reply.code(401).send({ error: "unauthorized" });
    if (teacher.role !== "teacher") return reply.code(403).send({ error: "forbidden" });
    if (teacher.mustChangePassword) return reply.code(403).send({ error: "password_change_required" });
    const code = [...owners.entries()].reverse().find(([, id]) => id === teacher.id)?.[0];
    const session = code ? sessions.get(code) : undefined;
    return reply.send({ session: session ? { ...joinPayload(request, session.code), token: session.hostToken, state: session.state() } : null });
  });

  app.get("/api/v1/teachers/me/sessions", async (request, reply) => {
    const teacher = await teacherFromRequest(request);
    if (!teacher) return reply.code(401).send({ error: "unauthorized" });
    if (teacher.role !== "teacher" || teacher.mustChangePassword) return reply.code(403).send({ error: "forbidden" });
    const history = [...sessions.values()]
      .filter(session => owners.get(session.code) === teacher.id)
      .map(session => ({
        code: session.code,
        title: session.snapshot.title,
        phase: session.state().phase,
        playerCount: session.players.size,
        questionCount: session.snapshot.questions.length,
        createdAt: session.events.find(event => event.type === "session.created")?.at ?? 0,
        completedAt: [...session.events].reverse().find(event => event.type === "session.ended")?.at ?? null,
      }))
      .sort((left, right) => right.createdAt - left.createdAt);
    return reply.send({ sessions: history });
  });

  app.get<{ Params: CodeParams }>("/api/v1/teachers/me/sessions/:code/results", async (request, reply) => {
    const teacher = await teacherFromRequest(request);
    if (!teacher) return reply.code(401).send({ error: "unauthorized" });
    if (teacher.role !== "teacher" || teacher.mustChangePassword) return reply.code(403).send({ error: "forbidden" });
    const code = SessionCodeParam.parse(request.params).code;
    const session = sessions.get(code);
    if (!session || owners.get(code) !== teacher.id) return reply.code(404).send({ error: "session_not_found" });
    if (session.state().phase !== "ended") return reply.code(409).send({ error: "results_not_ready" });
    return reply.send(hostResults(session));
  });

  app.get("/api/v1/admin/overview", async (request, reply) => {
    const account = await teacherFromRequest(request);
    if (!account) return reply.code(401).send({ error: "unauthorized" });
    if (account.role !== "admin") return reply.code(403).send({ error: "forbidden" });
    const teachers = await teacherStore.listTeachers();
    const teachersById = new Map(teachers.map(teacher => [teacher.id, teacher]));
    const games = [...sessions.values()].map(session => ({
      code: session.code,
      title: session.snapshot.title,
      phase: session.state().phase,
      playerCount: session.players.size,
      teacherId: owners.get(session.code),
      teacherName: teachersById.get(owners.get(session.code) ?? "")?.name ?? "Former teacher",
      teacherEmail: teachersById.get(owners.get(session.code) ?? "")?.email,
      createdAt: session.events[0]?.at ?? 0,
      question: session.state().question ? { index: session.state().question!.index, count: session.snapshot.questions.length, prompt: session.state().question!.prompt, deadlineAt: session.state().question!.deadlineAt, answeredCount: session.state().answeredCount } : undefined,
      players: [...session.players.values()].map(player => ({ id: player.id, displayName: player.displayName, connected: player.connected, answered: session.answers.some(answer => answer.playerId === player.id && answer.questionIndex === session.state().questionIndex) })),
      leaderboard: session.leaderboard(),
    })).sort((a, b) => b.createdAt - a.createdAt);
    return reply.send({ teachers, games, totals: { teachers: teachers.length, games: games.length, liveGames: games.filter(game => game.phase !== "ended").length, players: games.reduce((count, game) => count + game.playerCount, 0) } });
  });

  app.post("/api/v1/admin/teachers", async (request, reply) => {
    try {
      const account = await teacherFromRequest(request);
      if (!account) return reply.code(401).send({ error: "unauthorized" });
      if (account.role !== "admin") return reply.code(403).send({ error: "forbidden" });
      const body = createTeacherBody.parse(request.body);
      const temporaryPassword = body.password ? undefined : randomBytes(18).toString("base64url");
      const password = body.password ?? temporaryPassword!;
      const teacher = await teacherStore.create(body.name, body.email, await hashPassword(password), "teacher", !body.password);
      return reply.code(201).send({ teacher, ...(temporaryPassword ? { temporaryPassword } : {}) });
    } catch (error) { return errorResponse(reply, error); }
  });
  app.patch<{ Params: { id: string } }>("/api/v1/admin/teachers/:id", async (request, reply) => {
    try {
      const account = await teacherFromRequest(request);
      if (!account) return reply.code(401).send({ error: "unauthorized" });
      if (account.role !== "admin") return reply.code(403).send({ error: "forbidden" });
      const body = updateTeacherBody.parse(request.body);
      const teacher = await teacherStore.updateTeacher(request.params.id, body.name, body.email, body.password ? await hashPassword(body.password) : undefined);
      return reply.send({ teacher });
    } catch (error) { return errorResponse(reply, error); }
  });
  app.delete<{ Params: { id: string } }>("/api/v1/admin/teachers/:id", async (request, reply) => {
    try {
      const account = await teacherFromRequest(request);
      if (!account) return reply.code(401).send({ error: "unauthorized" });
      if (account.role !== "admin") return reply.code(403).send({ error: "forbidden" });
      await teacherStore.deleteTeacher(request.params.id);
      return reply.send({ ok: true });
    } catch (error) { return errorResponse(reply, error); }
  });

  app.post("/api/v1/sessions", async (request, reply) => {
    try {
      const teacher = await teacherFromRequest(request);
      if (!teacher) return reply.code(401).send({ error: "unauthorized" });
      if (teacher.role !== "teacher") return reply.code(403).send({ error: "forbidden" });
      if (teacher.mustChangePassword) return reply.code(403).send({ error: "password_change_required" });
      const body = CreateSessionRequest.parse(request.body);
      const code = (body.code ?? createSessionCode()).toUpperCase();
      if (sessions.has(code)) return reply.code(409).send({ error: "session_already_exists" });
      const session = new AuthoritativeSession(code, GameSnapshot.parse(body.snapshot));
      sessions.set(code, session);
      owners.set(code, teacher.id);
      await persistSession(session);
      return reply.code(201).send({ ...joinPayload(request, code), hostToken: session.hostToken, state: session.state() });
    } catch (error) { return errorResponse(reply, error); }
  });

  app.get<{ Params: CodeParams }>("/api/v1/sessions/:code", async (request, reply) => {
    try { SessionCodeParam.parse(request.params); return reply.send(getSession(request.params.code).state()); }
    catch (error) { return errorResponse(reply, error); }
  });

  app.post<{ Params: CodeParams }>("/api/v1/sessions/:code/players", async (request, reply) => {
    try {
      const session = getSession(request.params.code);
      const data = JoinRequest.parse(request.body);
      const accountToken = token(request);
      const student = accountToken ? await studentStore.findByToken(hashToken(accountToken)) : null;
      if (accountToken && !student) return reply.code(401).send({ error: "unauthorized" });
      const existingId = student ? session.playerIdForStudent(student.id) : undefined;
      if (existingId) {
        const player = session.reconnect(existingId);
        const playerToken = session.issuePlayerToken(player.id);
        await persistSession(session);
        publish(session);
        return reply.send({ player, playerToken, state: session.state() });
      }
      const player = session.join(data.displayName, undefined, data.emblem);
      if (student) session.linkStudentAccount(player.id, student.id);
      await persistSession(session);
      publish(session);
      return reply.code(201).send({ player, playerToken: session.tokenFor(player.id), state: session.state() });
    }
    catch (error) { return errorResponse(reply, error); }
  });

  app.post<{ Params: CodeParams }>("/api/v1/sessions/:code/players/reconnect", async (request, reply) => {
    try { const session = getSession(request.params.code); const playerId = ReconnectRequest.parse(request.body).playerId; if (!session.verifyPlayer(playerId, token(request))) return reply.code(401).send({ error: "unauthorized" }); const player = session.reconnect(playerId); await persistSession(session); publish(session); return reply.send({ player, state: session.state() }); }
    catch (error) { return errorResponse(reply, error); }
  });

  app.post<{ Params: CodeParams }>("/api/v1/sessions/:code/answers", async (request, reply) => {
    try {
      const session = getSession(request.params.code);
      const body = HttpAnswerRequest.parse(request.body);
      const { playerId, ...answer } = body;
      if (!session.verifyPlayer(playerId, token(request))) return reply.code(401).send({ error: "unauthorized" });
      const result = session.answer(playerId, AnswerRequest.parse(answer));
      if (result.accepted) await persistSession(session);
      publish(session);
      return reply.send(result);
    } catch (error) { return errorResponse(reply, error); }
  });

  app.post<{ Params: CodeParams }>("/api/v1/sessions/:code/commands", async (request, reply) => {
    try { const session = getSession(request.params.code); if (!session.verifyHost(token(request))) return reply.code(401).send({ error: "unauthorized" }); const command = HostCommand.parse((request.body as { command?: unknown }).command); session.command(command); await persistSession(session); publish(session); return reply.send({ ok: true, state: session.state() }); }
    catch (error) { return errorResponse(reply, error); }
  });

  app.get<{ Params: CodeParams }>("/api/v1/sessions/:code/me", async (request, reply) => {
    try { const session = getSession(request.params.code); const playerId = String(request.headers["x-player-id"] ?? ""); if (!session.verifyPlayer(playerId, token(request))) return reply.code(401).send({ error: "unauthorized" }); return reply.send({ available: true, ...session.playerResult(playerId) }); }
    catch (error) { return errorResponse(reply, error); }
  });
  app.get<{ Params: CodeParams }>("/api/v1/sessions/:code/results", async (request, reply) => {
    try { const session = getSession(request.params.code); if (session.state().phase !== "ended") return reply.code(409).send({ error: "results_not_ready" }); return reply.send({ leaderboard: session.leaderboard(), questions: session.snapshot.questions.length }); }
    catch (error) { return errorResponse(reply, error); }
  });
  app.get<{ Params: CodeParams }>("/api/v1/sessions/:code/host/results", async (request, reply) => {
    try {
      const session = getSession(request.params.code);
      if (!session.verifyHost(token(request))) return reply.code(401).send({ error: "unauthorized" });
      if (session.state().phase !== "ended") return reply.code(409).send({ error: "results_not_ready" });
      return reply.send(hostResults(session));
    } catch (error) { return errorResponse(reply, error); }
  });
  app.get("/api/v1/students/leaderboard", async (_request, reply) => {
    const rankings = new Map<string, { id: string; displayName: string; score: number; gamesPlayed: number }>();
    for (const student of await studentStore.listAccounts()) {
      rankings.set(`account:${student.id}`, { id: `account:${student.id}`, displayName: student.name, score: 0, gamesPlayed: 0 });
    }
    for (const session of sessions.values()) {
      if (session.state().phase !== "ended") continue;
      for (const player of session.leaderboard()) {
        const accountId = session.studentAccountFor(player.id);
        const id = accountId ? `account:${accountId}` : `guest:${session.code}:${player.id}`;
        const entry = rankings.get(id) ?? { id, displayName: player.displayName, score: 0, gamesPlayed: 0 };
        if (!accountId) entry.displayName = player.displayName;
        entry.score += player.score;
        entry.gamesPlayed += 1;
        rankings.set(id, entry);
      }
    }
    return reply.send({ leaderboard: [...rankings.values()].sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName)) });
  });
  app.get<{ Params: CodeParams }>("/api/v1/sessions/:code/host", async (request, reply) => {
    try { const session = getSession(request.params.code); if (!session.verifyHost(token(request))) return reply.code(401).send({ error: "unauthorized" }); return reply.send({ snapshot: session.snapshot, state: session.state(), leaderboard: session.leaderboard(), ...joinPayload(request, session.code) }); }
    catch (error) { return errorResponse(reply, error); }
  });

  // Socket.IO remains available for realtime clients and delegates to the same engine.
  io.on("connection", (socket) => {
    socket.on("session:watch", (raw, ack) => { try { const session = getSession(String(raw.code)); socket.join(session.code); ack({ ok: true, state: session.state() }); } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : "watch_failed" }); } });
    socket.on("session:join", async (raw, ack) => {
      try { const data = JoinRequest.parse(raw); const session = getSession(String(raw.code)); const player = session.join(data.displayName, socket.id, data.emblem); await persistSession(session); socket.join(session.code); ack({ ok: true, player, playerToken: session.tokenFor(player.id), state: session.state() }); publish(session); }
      catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : "join_failed" }); }
    });
    socket.on("session:reconnect", async (raw, ack) => { try { const session = getSession(String(raw.code)); if (!session.verifyPlayer(raw.playerId, raw.playerToken)) throw new Error("unauthorized"); const player = session.reconnect(raw.playerId); await persistSession(session); socket.join(session.code); ack({ ok: true, player, state: session.state() }); publish(session); } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : "reconnect_failed" }); } });
    socket.on("session:answer", async (raw, ack) => { try { const data = AnswerRequest.parse(raw); const session = getSession(String(raw.code)); if (!session.verifyPlayer(raw.playerId, raw.playerToken)) throw new Error("unauthorized"); const result = session.answer(raw.playerId, data); if (result.accepted) await persistSession(session); ack(result); publish(session); } catch (error) { ack({ accepted: false, reason: error instanceof Error ? error.message : "answer_failed" }); } });
    socket.on("session:command", async (raw, ack) => { try { const session = getSession(String(raw.code)); if (!session.verifyHost(raw.hostToken)) throw new Error("unauthorized"); session.command(HostCommand.parse(raw.command)); await persistSession(session); ack({ ok: true, state: session.state() }); publish(session); } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : "command_failed" }); } });
    socket.on("disconnect", () => { for (const session of sessions.values()) if (session.players.has(socket.id)) { session.disconnect(socket.id); void persistSession(session).catch(error => app.log.error({ err: error, sessionCode: session.code }, "Could not persist player disconnect")); } });
  });

  return { app, io, sessions, teacherStore, studentStore, runtimeSessionStore, init: initialize };
}

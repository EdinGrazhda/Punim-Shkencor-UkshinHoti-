import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server } from "socket.io";
import { AnswerRequest, GameSnapshot, HostCommand, JoinRequest } from "@ckadinti/contracts";
import { AuthoritativeSession } from "./session.js";
import { buildJoinPayload, createSessionCode } from "./join.js";

export function createRuntimeHost() {
  const app = Fastify({ logger: false });
  const io = new Server(app.server, { cors: { origin: true } });
  const sessions = new Map<string, AuthoritativeSession>();
  app.register(cors, { origin: true });
  app.get("/health", async () => ({ ok: true, service: "ckadinti-runtime-host" }));
  app.get("/network-readiness", async () => ({ ok: true, host: app.server.address() }));
  app.post<{ Body: { code?: string; snapshot: GameSnapshot } }>("/sessions", async (request, reply) => {
    const code = (request.body.code ?? createSessionCode()).toUpperCase();
    const session = new AuthoritativeSession(code, GameSnapshot.parse(request.body.snapshot));
    sessions.set(code, session); return reply.code(201).send({ ...buildJoinPayload(`${request.protocol}://${request.hostname}`, code), state: session.state() });
  });
  io.on("connection", (socket) => {
    socket.on("session:join", (raw, ack) => {
      try { const data = JoinRequest.parse(raw); const code = String(raw.code ?? "").toUpperCase(); const session = sessions.get(code); if (!session) throw new Error("session_not_found"); const player = session.join(data.displayName, socket.id); socket.join(code); ack({ ok: true, player, state: session.state() }); io.to(code).emit("session:state", session.state()); } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : "join_failed" }); }
    });
    socket.on("session:reconnect", (raw, ack) => { try { const session = sessions.get(String(raw.code).toUpperCase()); if (!session) throw new Error("session_not_found"); const player = session.reconnect(raw.playerId); socket.join(session.code); ack({ ok: true, player, state: session.state() }); } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : "reconnect_failed" }); } });
    socket.on("session:answer", (raw, ack) => { try { const data = AnswerRequest.parse(raw); const session = sessions.get(String(raw.code).toUpperCase()); if (!session) throw new Error("session_not_found"); const result = session.answer(socket.id, data); ack(result); io.to(session.code).emit("session:state", session.state()); } catch (error) { ack({ accepted: false, reason: error instanceof Error ? error.message : "answer_failed" }); } });
    socket.on("session:command", (raw, ack) => { try { const session = sessions.get(String(raw.code).toUpperCase()); if (!session) throw new Error("session_not_found"); session.command(HostCommand.parse(raw.command)); ack({ ok: true, state: session.state() }); io.to(session.code).emit("session:state", session.state()); } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : "command_failed" }); } });
    socket.on("disconnect", () => { for (const session of sessions.values()) if (session.players.has(socket.id)) session.disconnect(socket.id); });
  });
  return { app, io, sessions };
}

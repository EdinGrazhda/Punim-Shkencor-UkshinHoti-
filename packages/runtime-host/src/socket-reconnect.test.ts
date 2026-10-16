import { afterEach, describe, expect, it } from "vitest";
import { io, type Socket } from "socket.io-client";
import { createRuntimeHost } from "./server.js";
import { makeMemoryStudentAccountStore } from "./student-auth.js";
import { hashPassword, issueTeacherSession, makeMemoryTeacherStore } from "./teacher-auth.js";
import { MemoryRuntimeSessionStore } from "./session-store.js";

const snapshot = {
  id: "socket-quiz",
  title: "Reconnect check",
  questions: [{ id: "q1", prompt: "Ready?", options: ["Yes", "No"], correctOption: 0, timeLimitMs: 30_000 }],
};

describe("authenticated student sockets", () => {
  let firstSocket: Socket | undefined;
  let secondSocket: Socket | undefined;
  let runtime: ReturnType<typeof createRuntimeHost> | undefined;

  afterEach(async () => {
    firstSocket?.disconnect();
    secondSocket?.disconnect();
    if (runtime) {
      await new Promise<void>(resolve => runtime!.io.close(() => resolve()));
      await runtime.app.close().catch(() => undefined);
    }
    firstSocket = undefined;
    secondSocket = undefined;
    runtime = undefined;
  });

  it("marks a student offline on socket loss and online after authenticated reconnect", async () => {
    const teacherStore = makeMemoryTeacherStore();
    const studentStore = makeMemoryStudentAccountStore();
    await teacherStore.init();
    const teacher = await teacherStore.create("Socket Teacher", "socket@example.test", await hashPassword("teacher-password-123"), "teacher", false);
    const teacherToken = (await issueTeacherSession(teacherStore, teacher)).token;
    runtime = createRuntimeHost(teacherStore, studentStore, new MemoryRuntimeSessionStore());
    await runtime.init();
    const baseUrl = await runtime.app.listen({ host: "127.0.0.1", port: 0 });

    const created = await fetch(`${baseUrl}/api/v1/sessions`, {
      method: "POST",
      headers: { authorization: `Bearer ${teacherToken}`, "content-type": "application/json" },
      body: JSON.stringify({ code: "SOCK01", snapshot }),
    });
    expect(created.status).toBe(201);
    const joined = await fetch(`${baseUrl}/api/v1/sessions/SOCK01/players`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Ada" }),
    });
    expect(joined.status).toBe(201);
    const joinedPlayer = await joined.json() as { player: { id: string }; playerToken: string };

    const connectAndWatch = async () => {
      const socket = io(baseUrl, { transports: ["websocket"], autoConnect: false });
      const connected = new Promise<void>((resolve, reject) => {
        socket.once("connect", () => resolve());
        socket.once("connect_error", reject);
      });
      socket.connect();
      await connected;
      const reply = await new Promise<{ ok: boolean; state?: { players: { id: string; connected: boolean }[] }; error?: string }>((resolve, reject) => {
        socket.emit("session:watch", { code: "SOCK01", playerId: joinedPlayer.player.id, playerToken: joinedPlayer.playerToken }, (value: { ok: boolean; state?: { players: { id: string; connected: boolean }[] }; error?: string }) => value.ok ? resolve(value) : reject(new Error(value.error)));
      });
      return { socket, reply };
    };

    const first = await connectAndWatch();
    firstSocket = first.socket;
    expect(first.reply.state?.players.find(player => player.id === joinedPlayer.player.id)?.connected).toBe(true);
    first.socket.disconnect();
    await expect.poll(() => runtime!.sessions.get("SOCK01")?.state().players[0]?.connected, { timeout: 2_000 }).toBe(false);

    const second = await connectAndWatch();
    secondSocket = second.socket;
    expect(second.reply.state?.players.find(player => player.id === joinedPlayer.player.id)?.connected).toBe(true);
  });
});

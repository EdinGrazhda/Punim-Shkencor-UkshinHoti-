import assert from "node:assert/strict";
import { AuthoritativeSession } from "./session.js";
import type { GameSnapshot } from "@ckadinti/contracts";

const snapshot: GameSnapshot = { id: "quiz-1", title: "Raid", questions: [{ id: "q1", prompt: "2+2?", options: ["3", "4"], correctOption: 1, timeLimitMs: 1000 }] };
let now = 1000;
const session = new AuthoritativeSession("ABC123", snapshot, () => now);
const player = session.join("Ada", "player-1");
session.command({ type: "start" });
const request = { questionIndex: 0, optionIndex: 1, idempotencyKey: "00000000-0000-4000-8000-000000000001" } as const;
now = 1100;
assert.equal(session.answer(player.id, request).accepted, true);
assert.equal(session.answer(player.id, request).duplicate, true);
assert.equal(session.answers.length, 1);
assert.notEqual(session.snapshot, snapshot);

let lateNow = 0;
const lateSession = new AuthoritativeSession("ABC123", snapshot, () => lateNow);
const latePlayer = lateSession.join("Ada", "player-2");
lateSession.command({ type: "start" });
lateNow = 1001;
assert.deepEqual(lateSession.answer(latePlayer.id, { questionIndex: 0, optionIndex: 1, idempotencyKey: "00000000-0000-4000-8000-000000000002" }), { accepted: false, reason: "deadline_passed" });
console.log("runtime smoke tests passed");

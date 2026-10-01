import assert from "node:assert/strict";
import { createRuntimeHost } from "./server.js";
import { hashPassword, issueTeacherSession } from "./teacher-auth.js";

const { app, teacherStore } = createRuntimeHost();
const snapshot = { id: "quiz-1", title: "Raid", questions: [{ id: "q1", prompt: "2+2?", options: ["3", "4"], correctOption: 1, timeLimitMs: 1000 }] };

const unauthenticatedCreate = await app.inject({ method: "POST", url: "/api/v1/sessions", payload: { code: "REST01", snapshot } });
assert.equal(unauthenticatedCreate.statusCode, 401);
const publicRegistration = await app.inject({ method: "POST", url: "/api/v1/teachers/register", payload: { name: "Ada Teacher", email: "ada@school.edu", password: "classroom-pass-123" } });
assert.equal(publicRegistration.statusCode, 404);
const admin = await teacherStore.create("Admin", "admin@school.edu", await hashPassword("admin-test-password"), "admin");
const adminToken = (await issueTeacherSession(teacherStore, admin)).token;
const adminLogin = await app.inject({ method: "POST", url: "/api/v1/teachers/login", payload: { email: "admin@school.edu", password: "admin-test-password" } });
assert.equal(adminLogin.json().teacher.role, "admin");
const noAdminAccess = await app.inject({ method: "GET", url: "/api/v1/admin/overview" });
assert.equal(noAdminAccess.statusCode, 401);
const adminCannotHost = await app.inject({ method: "POST", url: "/api/v1/sessions", headers: { authorization: `Bearer ${adminToken}` }, payload: { code: "ADMIN1", snapshot } });
assert.equal(adminCannotHost.statusCode, 403);
const createdTeacher = await app.inject({ method: "POST", url: "/api/v1/admin/teachers", headers: { authorization: `Bearer ${adminToken}` }, payload: { name: "Ada Teacher", email: "ADA@SCHOOL.EDU" } });
assert.equal(createdTeacher.statusCode, 201);
assert.equal(createdTeacher.json().teacher.email, "ada@school.edu");
assert.ok(createdTeacher.json().temporaryPassword);
const duplicateEmail = await app.inject({ method: "POST", url: "/api/v1/admin/teachers", headers: { authorization: `Bearer ${adminToken}` }, payload: { name: "Another Teacher", email: "ada@school.edu" } });
assert.equal(duplicateEmail.statusCode, 409);
const invalidLogin = await app.inject({ method: "POST", url: "/api/v1/teachers/login", payload: { email: "ada@school.edu", password: "wrong" } });
assert.equal(invalidLogin.statusCode, 401);
const login = await app.inject({ method: "POST", url: "/api/v1/teachers/login", payload: { email: "ada@school.edu", password: createdTeacher.json().temporaryPassword } });
assert.equal(login.statusCode, 200);
let teacherToken = login.json().token;
assert.equal(login.json().teacher.role, "teacher");
assert.equal(login.json().teacher.mustChangePassword, true);
const me = await app.inject({ method: "GET", url: "/api/v1/teachers/me", headers: { authorization: `Bearer ${teacherToken}` } });
assert.equal(me.json().teacher.name, "Ada Teacher");
const teacherCannotSeeAdmin = await app.inject({ method: "GET", url: "/api/v1/admin/overview", headers: { authorization: `Bearer ${teacherToken}` } });
assert.equal(teacherCannotSeeAdmin.statusCode, 403);
const blockedUntilPasswordChange = await app.inject({ method: "POST", url: "/api/v1/sessions", headers: { authorization: `Bearer ${teacherToken}` }, payload: { code: "REST01", snapshot } });
assert.equal(blockedUntilPasswordChange.statusCode, 403);
const changedPassword = await app.inject({ method: "POST", url: "/api/v1/teachers/change-password", headers: { authorization: `Bearer ${teacherToken}` }, payload: { currentPassword: createdTeacher.json().temporaryPassword, newPassword: "my-private-password-123" } });
assert.equal(changedPassword.statusCode, 200);
assert.equal(changedPassword.json().teacher.mustChangePassword, false);
const oldToken = teacherToken;
teacherToken = changedPassword.json().token;
const invalidated = await app.inject({ method: "GET", url: "/api/v1/teachers/me", headers: { authorization: `Bearer ${oldToken}` } });
assert.equal(invalidated.statusCode, 401);
const created = await app.inject({ method: "POST", url: "/api/v1/sessions", headers: { authorization: `Bearer ${teacherToken}` }, payload: { code: "REST01", snapshot } });
assert.equal(created.statusCode, 201);
const createdBody = created.json();
assert.equal(createdBody.state.phase, "lobby");
assert.ok(createdBody.hostToken);
const resumed = await app.inject({ method: "GET", url: "/api/v1/teachers/me/session", headers: { authorization: `Bearer ${teacherToken}` } });
assert.equal(resumed.json().session.code, "REST01");
const adminOverview = await app.inject({ method: "GET", url: "/api/v1/admin/overview", headers: { authorization: `Bearer ${adminToken}` } });
assert.equal(adminOverview.json().totals.teachers, 1);
assert.equal(adminOverview.json().games[0].code, "REST01");

const joined = await app.inject({ method: "POST", url: "/api/v1/sessions/REST01/players", payload: { displayName: "Ada", emblem: "Shield" } });
assert.equal(joined.statusCode, 201);
assert.equal(joined.json().player.emblem, "Shield");
const playerId = joined.json().player.id;
const playerToken = joined.json().playerToken;

const blocked = await app.inject({ method: "POST", url: "/api/v1/sessions/REST01/commands", payload: { command: { type: "start" } } });
assert.equal(blocked.statusCode, 401);
const started = await app.inject({ method: "POST", url: "/api/v1/sessions/REST01/commands", headers: { authorization: `Bearer ${createdBody.hostToken}` }, payload: { command: { type: "start" } } });
assert.equal(started.statusCode, 200);
assert.equal(started.json().state.question.timeLimitMs, 1000);

const answered = await app.inject({ method: "POST", url: "/api/v1/sessions/REST01/answers", headers: { authorization: `Bearer ${playerToken}` }, payload: { playerId, questionIndex: 0, optionIndex: 1, idempotencyKey: "00000000-0000-4000-8000-000000000003" } });
assert.equal(answered.statusCode, 200);
assert.deepEqual(answered.json(), { accepted: true });

const duplicate = await app.inject({ method: "POST", url: "/api/v1/sessions/REST01/answers", headers: { authorization: `Bearer ${playerToken}` }, payload: { playerId, questionIndex: 0, optionIndex: 1, idempotencyKey: "00000000-0000-4000-8000-000000000003" } });
assert.deepEqual(duplicate.json(), { accepted: true, duplicate: true });

const hidden = await app.inject({ method: "GET", url: "/api/v1/sessions/REST01/me", headers: { authorization: `Bearer ${playerToken}`, "x-player-id": playerId } });
assert.deepEqual(hidden.json(), { available: false });
const revealed = await app.inject({ method: "POST", url: "/api/v1/sessions/REST01/commands", headers: { authorization: `Bearer ${createdBody.hostToken}` }, payload: { command: { type: "reveal" } } });
assert.equal(revealed.statusCode, 200);
assert.equal(revealed.json().state.reveal.correctOption, 1);

const loggedOut = await app.inject({ method: "POST", url: "/api/v1/teachers/logout", headers: { authorization: `Bearer ${teacherToken}` } });
assert.equal(loggedOut.statusCode, 200);
const afterLogout = await app.inject({ method: "GET", url: "/api/v1/teachers/me", headers: { authorization: `Bearer ${teacherToken}` } });
assert.equal(afterLogout.statusCode, 401);

await app.close();
console.log("REST smoke tests passed");

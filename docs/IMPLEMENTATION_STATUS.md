# Edin runtime status

## Milestone A - runtime foundation

- [x] Shared Zod contracts for snapshots, player state, host commands, and answer submissions.
- [x] Fastify health and network-readiness endpoints.
- [x] Socket.IO join, reconnect, answer, and host-command acknowledgements.
- [x] Versioned REST endpoints for health, readiness, sessions, players, commands, reconnects, and answers.
- [x] Six-character session code boundary and student join shell.
- [x] Server-side deadlines and idempotency-key handling.

## Milestone B - authoritative game

- [x] Immutable approved-question snapshot per session.
- [x] Cyber Raid scoring: base 1000, speed bonus 0-60, capped streak bonus 0-40.
- [x] No score or correct answer is included in public question state.
- [x] Answer acknowledgements do not reveal correctness or score before reveal.
- [x] Session events and answer records are retained behind the runtime boundary.
- [x] PostgreSQL-backed teacher accounts and login sessions.
- [ ] PostgreSQL persistence for live games, answers, and results (currently in-memory).

## Milestone C - student and host UX

- [x] Public landing page, teacher/admin login, admin-only teacher account creation with first-login password change, and student name → code join flow.
- [x] Responsive student lobby, question, reveal/explanation, mission progress, and results screens.
- [x] Teacher dashboard, sample quiz creation, live controls, results, and basic session indicators.
- [x] Projector-safe public output and Playwright walkthrough through final results.
- [ ] Full teacher analytics and persisted game settings.

Scope note: teacher review, AI generation, lesson parsing, and content repositories are intentionally out of scope for Edin.

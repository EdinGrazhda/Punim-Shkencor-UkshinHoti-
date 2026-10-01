# Edin runtime status

## Milestone A - runtime foundation

- [x] Shared Zod contracts for snapshots, player state, host commands, and answer submissions.
- [x] Fastify health and network-readiness endpoints.
- [x] Socket.IO join, reconnect, answer, and host-command acknowledgements.
- [x] Six-character session code boundary and student join shell.
- [x] Server-side deadlines and idempotency-key handling.

## Milestone B - authoritative game

- [x] Immutable approved-question snapshot per session.
- [x] Cyber Raid scoring: base 1000, speed bonus 0-60, capped streak bonus 0-40.
- [x] No score or correct answer is included in public question state.
- [x] Session events and answer records are retained behind the runtime boundary.
- [ ] SQLite/Drizzle persistence adapter.

## Milestone C - student and host UX

- [x] Initial student Join/Lobby screen.
- [ ] Game, reveal/explanation, mission progress, and results screens.
- [ ] Teacher live controls and private analytics drawer.
- [ ] Projector-safe output and Playwright workflows.

Scope note: teacher review, AI generation, lesson parsing, and content repositories are intentionally out of scope for Edin.

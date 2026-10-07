# Arron and Edin alignment

This document records the comparison and selective import of `origin/Edin` at `8341f84` performed on October 5, 2026. The source branch itself was not edited.

## October 6, 2026 follow-up

Latest inspected Edin head: `cfb7a82`. Its new product change fixes UUID creation for student answers on insecure LAN HTTP origins; Arron includes this focused cherry-pick. Runtime source files are identical between the compared branch heads. The intermediate ignore change was reviewed; Arron retains its own local-artifact rules. The Graphify Python project/corpora are still excluded.

Arron's desktop now creates approved sessions, holds host tokens only in main memory, controls games using the existing `HostCommand` contract, polls `PublicSessionState`, and renders `/host/results`. Scores are never recalculated by the desktop. `ApprovedQuestion.timeLimitMs` now consumes Edin's 10-second default when absent; the teacher adapter continues to send 30 seconds explicitly and retains validated explanations. The root host command now launches `src/index.ts`, which actually listens for connections.

Verified locally: PostgreSQL migrations and review transactions, mocked AI generation through real repositories, runtime REST/session smoke tests, and actual Electron login/hosting/guest answers/results. Tests caught and fixed a rejected-question reset on reorder. Persistent analytics and live provider generation remain outside that verification.

### Edin handoff before main integration

- `server.ts` answer feedback and `/sessions/:code/me` call `playerResult` during the question phase. `session.ts` returns `correctOption` and scores before reveal; this violates the agreed privacy boundary. The existing REST smoke script currently expects that behavior and must change with the fix.
- `session.ts` rewards add 200 points or transfer 10% of another player's score. The MVP specifies no score from power-ups; resolve this in the authoritative runtime.
- Persist sessions, snapshots, answers, and results through versioned PostgreSQL migrations and provide a history/analytics API. Current desktop reports are limited to sessions in the running processes.
- Confirm LAN URLs, disconnect/reconnect behavior and multi-device play on actual classroom devices. The student UUID fix is included, but physical LAN QA is still separate from the local API/UI tests.

All changes and pushes from this follow-up target Arron. No merge to main is implied by passing the local tests.

## October 7, 2026 Arron integration follow-up

The integrated copy on `Arron` now persists each runtime session's approved snapshot, players, token hashes, answers, idempotency state, score state, and event history in PostgreSQL JSONB. Migration `0001_runtime_persistence.sql` versions the runtime account and session tables; runtime startup no longer creates schema with ad hoc DDL. After restart, the host token is rotated and the authenticated teacher can recover the latest session. Teacher-owned session history and completed-session results are available through the existing browser teacher Results view. The session aggregate is intentionally a small MVP persistence boundary, not a normalized analytics warehouse.

Verification on this machine: workspace typecheck and runtime unit/restart/ownership tests pass. An opt-in PostgreSQL migration/restart test is available, but the PostgreSQL repository tests were skipped because `TEST_DATABASE_URL` is not configured, and no local PostgreSQL or Docker runtime is available. Therefore, the migration and real PostgreSQL restart path remain unverified; Arron is not yet safe to merge into `main` until those checks plus full CI and LAN/multi-device acceptance pass. No changes were made to `Edin`.

## Shared runtime names

Arron now exports the same runtime-facing names used by Edin's host and student code:

- `GameSnapshot`: immutable approved quiz snapshot with `id`, `title`, and `questions`.
- `ApprovedQuestion`: `id`, `prompt`, string `options`, zero-based `correctOption`, `timeLimitMs`, and optional teacher-reviewed `explanation`.
- `SessionPhase`: `lobby`, `question`, `reveal`, `paused`, `ended`.
- `Player`, `JoinRequest`, `SessionCodeParam`, `CreateSessionRequest`, `ReconnectRequest`, `AnswerRequest`, `HttpAnswerRequest`, `HttpCommandRequest`, `HostCommand`, `PublicQuestion`, `PublicSessionState`, `SocketEvents`, and `calculateScore` are now exported additively alongside Arron's content contracts.

Arron's stored review model keeps richer teacher data such as evidence, topic, difficulty, confidence, and review status. The `gameSnapshotFromApprovedQuestions` adapter removes teacher-only fields but now carries the approved explanation so Edin's runtime can reveal it with the answer.

## Product names

- Teacher flow: `Cyber Raid`, classroom mission, lesson, quiz review, approved quiz.
- Student/runtime flow: `CLASSROOM RAID`, mission code, lobby, session, question, reveal, results.
- Runtime service name: `ckadinti-runtime-host`.

The teacher app should use `Cyber Raid` for the game mode and `mission` for student-facing classroom language. The host remains authoritative for timing, answers, and scoring.

## Edin branch observation

The remote `Edin` ref was inspected at `8341f84` on October 5, 2026. Its student/teacher/admin/projector preview and Fastify/Socket.IO runtime were selectively imported to Arron, alongside Docker and browser-QA setup. The separate Graphify Python project and its corpora were excluded. Runtime consumes `GameSnapshot`; the later privacy audit above supersedes the earlier assumption that answers were hidden until reveal. Accounts remain preview-only, live game data remains in memory, and account tables use startup SQL rather than versioned migrations. The integration preserves Arron's content contracts and explanation adapter.

The Arron-side compatibility increment preserves approved explanations in exported snapshots, and runtime schemas were added without replacing lesson/AI/review contracts. Account functionality must remain preview-only until the team resolves product scope. Do not call the integration production-ready until runtime persistence, analytics, versioned migration ownership, and full PostgreSQL-backed end-to-end checks are complete.

## Integration checklist

- Keep `packages/contracts` names and field meanings identical across branches.
- Keep PostgreSQL as the persistence engine on both branches.
- Arron exports approved `GameSnapshot` data; Edin consumes it.
- Edin owns session state, socket events, authoritative scoring, and game/session tables.
- Arron owns lesson/quiz tables, review workflow, AI generation, and teacher reports.
- Coordinate versioned runtime migration ownership and persisted analytics before main-branch integration.

# Arron and Edin alignment

This document records the comparison and selective import of `origin/Edin` at `8341f84` performed on October 5, 2026. The source branch itself was not edited.

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

The remote `Edin` ref was inspected at `8341f84` on October 5, 2026. Its student/teacher/admin/projector preview under `apps/student` and Fastify/Socket.IO runtime under `packages/runtime-host` have now been selectively imported to Arron, alongside Docker and browser-QA setup. The separate Graphify Python project and its corpora were intentionally excluded. Runtime consumes `GameSnapshot` and exposes explanations only during answer reveal. Teacher/student account flows are preview-only because accounts are outside the current MVP boundary. Live sessions, answers, and results remain in memory; full analytics and persisted game settings remain outstanding. Runtime account tables use startup SQL rather than versioned Drizzle migrations. Arron and Edin had no common ancestor; the integration preserves both histories without replacing Arron's shared contracts.

The Arron-side compatibility increment preserves approved explanations in exported snapshots, and runtime schemas were added without replacing lesson/AI/review contracts. Account functionality must remain preview-only until the team resolves product scope. Do not call the integration production-ready until runtime persistence, analytics, versioned migration ownership, and full PostgreSQL-backed end-to-end checks are complete.

## Integration checklist

- Keep `packages/contracts` names and field meanings identical across branches.
- Keep PostgreSQL as the persistence engine on both branches.
- Arron exports approved `GameSnapshot` data; Edin consumes it.
- Edin owns session state, socket events, authoritative scoring, and game/session tables.
- Arron owns lesson/quiz tables, review workflow, AI generation, and teacher reports.
- Coordinate versioned runtime migration ownership and persisted analytics before main-branch integration.

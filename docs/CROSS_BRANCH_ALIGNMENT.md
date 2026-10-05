# Arron and Edin alignment

This document records the read-only comparison of `origin/Edin` at `8341f84` performed on October 5, 2026. No Edin files were edited.

## Shared runtime names

Arron now exports the same runtime-facing names used by Edin's host and student code:

- `GameSnapshot`: immutable approved quiz snapshot with `id`, `title`, and `questions`.
- `ApprovedQuestion`: `id`, `prompt`, string `options`, zero-based `correctOption`, `timeLimitMs`, and optional teacher-reviewed `explanation`.
- `SessionPhase`: `lobby`, `question`, `reveal`, `paused`, `ended`.
- `HostCommand`, `AnswerRequest`, `PublicQuestion`, and `PublicSessionState` remain Edin-owned runtime contracts.

Arron's stored review model keeps richer teacher data such as evidence, topic, difficulty, confidence, and review status. The `gameSnapshotFromApprovedQuestions` adapter removes teacher-only fields but now carries the approved explanation so Edin's runtime can reveal it with the answer.

## Product names

- Teacher flow: `Cyber Raid`, classroom mission, lesson, quiz review, approved quiz.
- Student/runtime flow: `CLASSROOM RAID`, mission code, lobby, session, question, reveal, results.
- Runtime service name: `ckadinti-runtime-host`.

The teacher app should use `Cyber Raid` for the game mode and `mission` for student-facing classroom language. The host remains authoritative for timing, answers, and scoring.

## Edin branch observation

The remote `Edin` ref was inspected read-only at `8341f84` on October 5, 2026. It contains a student/teacher/admin preview under `apps/student` and a Fastify/Socket.IO runtime under `packages/runtime-host`, alongside the separate Graphify Python project. The runtime accepts `GameSnapshot` data with an optional question explanation and only includes the explanation in reveal state. Teacher and student account/login tables use PostgreSQL, but live sessions, answers, and results remain in memory; full analytics and persisted game settings are still outstanding. Its account flows also exceed the current product brief, which defers accounts. The Arron and Edin histories have no common ancestor, and Edin's shared-contract file omits Arron's lesson/AI/review schemas, so a whole-branch merge would not be safe.

The first Arron-side compatibility increment now preserves approved explanations in exported snapshots. Before importing the runtime UI/API, reconcile Edin's branch with the CkaDinTi baseline, agree whether account flows are in scope, and preserve the lesson/AI/review contracts. Arron should not duplicate socket contracts or invent analytics DTOs while that reconciliation is pending.

## Integration checklist

- Keep `packages/contracts` names and field meanings identical across branches.
- Keep PostgreSQL as the persistence engine on both branches.
- Arron exports approved `GameSnapshot` data; Edin consumes it.
- Edin owns session state, socket events, authoritative scoring, and game/session tables.
- Arron owns lesson/quiz tables, review workflow, AI generation, and teacher reports.
- Resolve any shared-contract or migration conflicts in a focused integration commit before end-to-end testing.

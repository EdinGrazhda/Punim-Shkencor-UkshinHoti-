# Arron and Edin alignment

This document records the read-only comparison of `origin/Edin` performed on October 1, 2026. No Edin files were edited.

## Shared runtime names

Arron now exports the same runtime-facing names used by Edin's host and student code:

- `GameSnapshot`: immutable approved quiz snapshot with `id`, `title`, and `questions`.
- `ApprovedQuestion`: `id`, `prompt`, string `options`, zero-based `correctOption`, and `timeLimitMs`.
- `SessionPhase`: `lobby`, `question`, `reveal`, `paused`, `ended`.
- `HostCommand`, `AnswerRequest`, `PublicQuestion`, and `PublicSessionState` remain Edin-owned runtime contracts.

Arron's stored review model keeps richer teacher data such as evidence, explanation, topic, difficulty, confidence, and review status. The `gameSnapshotFromApprovedQuestions` adapter removes teacher-only fields before a game starts.

## Product names

- Teacher flow: `Cyber Raid`, classroom mission, lesson, quiz review, approved quiz.
- Student/runtime flow: `CLASSROOM RAID`, mission code, lobby, session, question, reveal, results.
- Runtime service name: `ckadinti-runtime-host`.

The teacher app should use `Cyber Raid` for the game mode and `mission` for student-facing classroom language. The host remains authoritative for timing, answers, and scoring.

## Edin branch observation

The remote `Edin` ref was inspected read-only at `3db511d` on October 1, 2026. It contains runtime files under `apps/student` and `packages/runtime-host`, but its root `AGENTS.md`, README, Graphify package, and much of its history identify the checkout as the separate Graphify Python project. The runtime exposes `POST /sessions` and Socket.IO join, reconnect, answer, and host-command events. The branch tree does not contain the PostgreSQL runtime persistence or analytics/reporting implementation required by the teacher app.

Before integration, Edin should reconcile that branch with the CkaDinTi repository baseline and preserve only the runtime/student files needed for this project. Arron should not duplicate the socket contracts or make up analytics DTOs while that reconciliation is pending.

## Integration checklist

- Keep `packages/contracts` names and field meanings identical across branches.
- Keep PostgreSQL as the persistence engine on both branches.
- Arron exports approved `GameSnapshot` data; Edin consumes it.
- Edin owns session state, socket events, authoritative scoring, and game/session tables.
- Arron owns lesson/quiz tables, review workflow, AI generation, and teacher reports.
- Resolve any shared-contract or migration conflicts in a focused integration commit before end-to-end testing.

# Implementation status

## Repository setup

- [x] Empty GitHub repository cloned locally.
- [x] Shared agent instructions added.
- [x] Non-overlapping Arron/Edin task split added.
- [x] Graphify and RTK references recorded.
- [x] Monorepo scaffold.
- [x] Shared contracts.
- [x] Teacher content pipeline, review gate, and approved snapshot hosting.
- [x] Edin classroom UI and Fastify/Socket.IO runtime selectively integrated on Arron for local preview.
- [ ] Persist active sessions, answers, and results so runtime restarts do not lose games.
- [ ] Replace runtime account-table startup DDL with reviewed/versioned PostgreSQL migrations; decide whether account flows belong in MVP.
- [ ] Complete stable runtime analytics and teacher reports.
- [ ] CI and packaging smoke test (GitHub Actions workflow configured; first remote run pending).

## Arron progress

- [x] pnpm workspace and Electron Forge teacher shell scaffolded.
- [x] Secure main/preload boundary with lesson file-picker IPC added.
- [x] Shared Zod lesson, quiz, generation, and review contracts added.
- [x] Drizzle PostgreSQL schema added for Arron-owned lesson/quiz/content tables.
- [x] PostgreSQL client and Drizzle migration commands configured.
- [x] Generate the initial PostgreSQL SQL migration.
- [x] Apply migrations and run repository integration tests against an isolated PostgreSQL 16 cluster (October 6, 2026).
- [x] Verify desktop dev launch and package build on Windows with repository-pinned pnpm 10.15.0.
- [ ] Verify a clean install, PostgreSQL integration tests, and packaging through GitHub Actions.
- [x] PostgreSQL lesson, quiz, question, and generation-job repository operations scaffolded.
- [x] Import TXT, Markdown, PDF, and DOCX lessons with text normalization, evidence blocks, and content deduplication.
- [x] Validated IPC for importing and listing persisted lessons; renderer no longer receives file paths.
- [x] Added runtime-compatible `GameSnapshot` and `ApprovedQuestion` contracts for Edin's host.
- [x] Approved quiz export validates review state and produces an Edin-compatible `GameSnapshot`, including the teacher-reviewed explanation for the reveal phase.
- [x] Create local sessions from approved quizzes; host credentials remain in main-process memory and typed passwords are cleared after use. Loopback-only requests reject redirects.
- [x] Add normalization/block unit tests and a `TEST_DATABASE_URL`-gated PostgreSQL repository integration test.
- [x] Add parser fixtures and import-path tests for TXT, Markdown, text PDF, and DOCX extraction.
- [x] Lessons listing/detail and generated quiz draft listing wired to PostgreSQL repositories.
- [x] OpenAI Responses API generation service with strict structured output, source-quote evidence mapping, prompt/model tracking, and failed-job reporting.
- [x] Lesson detail generates persisted drafts; quizzes remain in `needs-review` until the teacher explicitly approves them.
- [x] Settings screen shows PostgreSQL/OpenAI readiness without exposing credentials.
- [x] Desktop Games: lobby lock/unlock, timer, players/removal, start, pause/resume, reveal, next, and end controls; server state polling and error handling.
- [x] Desktop Reports: final host scores and question-by-question answers for sessions created during the current desktop run.
- [x] Actual Electron UI → PostgreSQL → runtime → guest answer → desktop results smoke check (October 6, 2026), including preload loading and cleanup.
- [x] Import → generated draft → evidence → approval gate → runtime snapshot integration tested with real PostgreSQL and a mocked OpenAI response.
- [x] Reordering preserves rejected/approved question decisions; PostgreSQL regression test passes.
- [x] Correct desktop preload/root environment paths and local runtime development entry point.
- [ ] Historical reports await Edin's versioned runtime persistence and stable analytics API.
- [ ] Live OpenAI generation needs a private API key/model available to the account; no paid generation was performed.
- [ ] Physical multi-device LAN/browser acceptance and deployment configuration.
- [x] Teacher review workflow.
  - [x] Review screen with source quotes and “view in lesson”, editable prompt/explanation/topic/difficulty/options, approve/reject, delete, reorder, and quiz-level approval gate.
  - [x] Add a manual teacher question, duplicate a question with its options/evidence, and bulk-approve pending questions (rejected questions stay rejected).
  - [x] Regenerate an individual question from lesson evidence, track the generation job, and return the replacement to pending review.

## Edin integration preview on Arron

- [x] Import `apps/student` and `packages/runtime-host` while retaining Arron's lesson, AI, review, and desktop contracts.
- [x] Add Edin runtime schemas and scoring exports additively to `packages/contracts`.
- [x] Add workspace commands for browser/runtime development and validation, plus local Docker Compose setup.
- [x] Inspect Edin at `cfb7a82`; cherry-pick LAN UUID fix to Arron and adopt the compatible default timer contract without replacing the teacher explanation adapter.
- [x] Local runtime smoke tests and actual Electron/PostgreSQL host flow verified. CI run still requires remote verification.
- [ ] Persist live game state, answers, and results; currently these are memory-backed.
- [ ] Review account registration/login scope against the MVP's no-accounts product boundary.
- [ ] Design versioned migration ownership for runtime account/session data with Edin before main integration.
- [ ] Edin: defer answer keys/scores until reveal (current answer feedback and player-results routes expose them early).
- [ ] Edin: remove power-up score changes or coordinate an explicit MVP rule change; current rewards add/steal points.

## Branch status

- `main`: shared documentation and integration baseline.
- `Arron`: teacher/content work.
- `Edin`: runtime/student work.

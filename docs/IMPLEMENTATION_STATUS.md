# Implementation status

## Integrated Arron preview

- [x] Workspace, Electron teacher shell, secure main/preload boundary, and Windows desktop packaging.
- [x] PostgreSQL/Drizzle migrations and teacher-owned lesson, quiz, question, evidence, and generation-job repositories.
- [x] TXT, Markdown, text-based PDF, and DOCX ingestion with normalized evidence blocks and deduplication.
- [x] OpenAI Responses API structured quiz generation with source-quote evidence and mandatory teacher review.
- [x] Teacher review actions: edit, approve/reject, add, duplicate, delete, reorder, bulk approve, and per-question regenerate.
- [x] Approved quiz export through the shared `GameSnapshot` contract, including teacher-reviewed explanations.
- [x] Local session creation and native desktop host controls/reports.
- [x] Edin's student/teacher/admin/projector browser UI and Fastify/Socket.IO runtime selectively integrated on Arron.
- [x] Browser teacher **Create Game** flow wired to Arron's import → AI draft → review → approval → runtime host pipeline through a trusted loopback API.
- [x] Tests for parsers, schemas, review transitions, PostgreSQL repositories, runtime REST/session behavior, and desktop-to-runtime host flow.

## Remaining before main integration

- [x] Keep answer acknowledgements and player endpoints free of correctness, correct options, score, XP, and streak until reveal; add runtime and REST regression coverage.
- [x] Remove reward/power-up endpoints and score changes; the agreed MVP scoring has no score changes from power-ups.
- [x] Persist runtime snapshots, accepted answers, events, and results in PostgreSQL through the versioned runtime migration; restore games after restart. Unit/regression coverage uses a memory-store double.
- [x] Replace runtime account startup DDL with reviewed/versioned migrations. Teacher/student account flows remain preview-only and outside the no-accounts MVP boundary.
- [x] Add teacher-owned persisted session history and completed-session reports to the integrated browser UI/API. Broader historical analytics and desktop history remain incomplete.
- [ ] Validate migrations and runtime persistence against a disposable PostgreSQL database (`TEST_DATABASE_URL`); the opt-in `test:postgres` check is implemented but could not run because the service is unavailable in this environment.
- [x] Run local workspace typecheck, runnable unit/smoke tests, Vite production build, and Electron packaging.
- [ ] Verify a clean dependency install, PostgreSQL-backed tests, LAN/multi-device play, and CI on the integrated branch.
- [ ] Run browser teacher import/generation/approval flow with a locally configured database and private OpenAI key; live provider generation has not been performed here.

## Security and behavior blockers

The Arron-integrated runtime now returns only the student's own submitted/selection state while a question is active. The answer acknowledgement contains no feedback; correctness, XP, and score are returned to that student only at reveal (or after the game ends). The mystery-reward route, state, UI, and score mutations have been removed. Regression tests cover these reveal boundaries. Runtime state and auth schemas now use versioned PostgreSQL migrations, and a restart test verifies rehydration and teacher-owned results against a memory-store double. Merge readiness is still blocked on PostgreSQL-backed migration/persistence checks, full CI, and classroom acceptance.

Teacher/admin account flows are preview functionality, not part of the stated MVP. The runtime uses the new versioned schema; existing local databases must run migrations before startup. The runtime persists each game's authoritative snapshot and evolving state as one versioned JSONB aggregate, rather than normalized answer/event tables.

## Branch status

- `main`: shared documentation/tooling/integration baseline.
- `Arron`: teacher/content pipeline plus a local integrated copy of Edin's runtime/student app. Integration work here does not modify the Edin branch.
- `Edin`: runtime/student owner branch; its state is not changed by this Arron integration.

See [TEAM_TASKS.md](TEAM_TASKS.md), [CROSS_BRANCH_ALIGNMENT.md](CROSS_BRANCH_ALIGNMENT.md), and [DEPENDENCIES.md](DEPENDENCIES.md) for ownership, contract boundaries, and dependency decisions.

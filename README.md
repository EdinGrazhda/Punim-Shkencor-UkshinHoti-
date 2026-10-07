# CkaDinTi

Desktop-first, local-first AI classroom quiz platform backed by PostgreSQL.

Read [AGENTS.md](AGENTS.md) for repository rules and [docs/TEAM_TASKS.md](docs/TEAM_TASKS.md) for branch ownership and MVP acceptance criteria.

## Current integrated preview

The teacher desktop app uses Electron, React, and TypeScript. It imports TXT, Markdown, text-based PDF, and DOCX lessons, normalizes them into evidence blocks, and persists them with PostgreSQL/Drizzle. A teacher can generate a quiz draft through the OpenAI Responses API, review/edit questions and evidence, approve the quiz, and export an approved runtime snapshot. The review screen supports add, duplicate, delete, reorder, bulk approval, and per-question regeneration.

The Arron branch now includes a local integrated copy of Edin's student/teacher/admin/projector browser UI and Fastify/Socket.IO runtime. The integrated browser teacher workspace also uses Arron's lesson import, AI draft, teacher review, and approved-snapshot flow to create a game. Runtime sessions, accepted answers, events, and score state are stored in PostgreSQL and restored after a host restart. The teacher can recover the latest host session and view completed-session history and reports. The separate desktop host view still reports sessions created during its current run.

This is still an integration preview, not yet merge-ready for `main`: the runtime persistence and migration changes have unit/restart coverage, but have not been exercised against a real PostgreSQL test database in this environment. Full CI and classroom acceptance checks are also pending. The Arron integration closes the early-answer feedback and score-changing reward gaps: correctness and scores are withheld until reveal, and rewards have been removed. See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) and [docs/CROSS_BRANCH_ALIGNMENT.md](docs/CROSS_BRANCH_ALIGNMENT.md).

## Local development

Requirements: Node.js, Corepack/pnpm 10.15.0, PostgreSQL, and (for AI generation) an OpenAI API key. Docker Compose can run the integrated browser/runtime preview.

1. Run `corepack pnpm install`.
2. Copy `.env.example` to `.env`, set `DATABASE_URL`, then run `corepack pnpm --filter @ckadinti/database db:migrate`.
3. Set `OPENAI_API_KEY` to enable generation. Optionally set `OPENAI_MODEL`; the default is `gpt-6-astra`. Keep secrets out of renderer code and commits.
4. Start `corepack pnpm dev:host` and `corepack pnpm dev:student` in separate terminals, then `corepack pnpm dev:desktop`. The browser teacher content API is hosted by the trusted Electron main process at `127.0.0.1:4320`; keep the desktop process open while using that browser authoring flow. The Vite server proxies API/socket traffic to the runtime at port 4310.

For LAN students, set `STUDENT_ORIGIN=http://<teacher-LAN-IP>:4173` before starting the runtime and allow the relevant ports through the local firewall. A localhost join URL works only on the teacher computer.

For a Docker preview, set `POSTGRES_PASSWORD` in `.env` and run `docker compose up --build`. Open [the student/teacher app](http://localhost:4173) and [runtime health](http://localhost:4310/health). To create a preview administrator, run `docker compose exec runtime-host node packages/runtime-host/dist/bootstrap-admin.js admin@example.test "Preview Admin"` and save the one-time password printed in that terminal. Accounts are preview-only; do not use real student data.

## Checks

- `corepack pnpm typecheck` - typecheck all workspace packages.
- `corepack pnpm test` - run workspace tests and runtime smoke checks.
- With `TEST_DATABASE_URL` set to a disposable PostgreSQL database, tests cover lesson persistence, review transitions, and import → mocked generation → approval → runtime flow. Runtime restart/teacher-history regression tests also run against an in-memory persistence-store double; an opt-in PostgreSQL restart test is available but still needs to pass before merge.
- To run the opt-in PostgreSQL migration/restart test, set both `TEST_DATABASE_URL` (disposable database only) and `RUN_POSTGRES_PERSISTENCE=1`, then run `corepack pnpm --filter @ckadinti/runtime-host test:postgres`.
- `corepack pnpm build` - build/typecheck workspace packages.
- `QA_DATABASE_URL=<disposable migrated database> node --import tsx scripts/qa-desktop.mjs` - after building, run the Electron UI against a temporary runtime; requires Playwright and never calls OpenAI.
- Use the RTK wrappers in [AGENTS.md](AGENTS.md) for compact CLI output.

## Contributor tools and branches

RTK is the required compact CLI proxy: https://github.com/rtk-ai/rtk. Graphify is a development-only local code graph refreshed after code edits with `uvx --from graphifyy graphify update . --no-cluster`; generated output remains local. Product-side Graphify visualizations, if added, must remain optional and adapter-based: https://github.com/Graphify-Labs/graphify.

- `Arron`: teacher desktop, lesson ingestion, AI generation, quiz review, teacher reports.
- `Edin`: student browser, LAN game host, realtime protocol, runtime scoring and analytics.

The attached deep-research report is the original product brief. The team selected PostgreSQL instead of its SQLite recommendation; see [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md).

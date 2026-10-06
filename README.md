# CkaDinTi

Desktop-first, local-first AI classroom quiz platform backed by PostgreSQL.

Read [AGENTS.md](AGENTS.md) for repository rules and [docs/TEAM_TASKS.md](docs/TEAM_TASKS.md) for the non-overlapping branch ownership plan.

## Current MVP

The teacher desktop app is built with Electron, React, and TypeScript. It can import TXT, Markdown, text-based PDF, and DOCX lessons, normalize them into evidence blocks, and persist them in PostgreSQL. From a lesson, a teacher can request a quiz draft using the OpenAI Responses API. Generated questions are schema-validated and their evidence quotes must match the lesson text. The quiz review screen supports editing prompts, explanations, topics, difficulty and answers; opening source quotes in the lesson; approving/rejecting, deleting, and reordering questions; manually adding and duplicating questions; bulk-approving pending questions; per-question AI regeneration; and approving a quiz only after every remaining question is approved. Approved questions are adapted to the shared `GameSnapshot` contract, including their reviewed explanation for the host's reveal phase.

The teacher app includes a secure Electron main/preload boundary, PostgreSQL/Drizzle persistence, readiness reporting, and a Windows desktop package. Approved quizzes can create local runtime sessions. The desktop Games screen provides lobby locking, timer changes, player removal, start/pause/resume/reveal/next/end controls, and live participation. Reports display final host-supplied scores and per-question answers. Host tokens stay in Electron main memory; passwords entered in the teacher form are cleared after the request or leaving the page. The Arron branch also contains Edin's student/teacher/admin/projector browser UI and Fastify/Socket.IO runtime, including the LAN UUID fix from `cfb7a82`.

This remains an integration preview. Runtime sessions/results are held in memory, and the desktop session list clears on restart. Runtime account tables use startup SQL rather than versioned migrations. Edin's early-answer feedback and reward-based score changes conflict with the agreed MVP privacy/scoring rules and block merging to `main`. Account flows are preview-only. See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) and [docs/CROSS_BRANCH_ALIGNMENT.md](docs/CROSS_BRANCH_ALIGNMENT.md) for the remaining handoff items.

## Local development

Requirements: Node.js, Corepack (to select the repository-pinned pnpm version), a running PostgreSQL database, and (for AI quiz generation) an OpenAI API key. Docker Compose is an alternative for starting PostgreSQL and the integrated browser/runtime preview.

1. Install workspace dependencies with `corepack pnpm install`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to your local PostgreSQL database. Apply the schema with `corepack pnpm --filter @ckadinti/database db:migrate`.
3. Add `OPENAI_API_KEY` to `.env` to enable quiz generation. Optionally set `OPENAI_MODEL`; the default is `gpt-6-astra`. Keep `.env` private and never put API keys in renderer code or commits.
4. Start the runtime host (`corepack pnpm dev:host`) and browser (`corepack pnpm dev:student`) in separate terminals, then the teacher app (`corepack pnpm dev:desktop`). The host command launches its listening entry point and loads the root `.env` when present. From an approved quiz, choose **Start LAN session** and sign in with a teacher account whose temporary password has been changed. The desktop opens **Games**; finished sessions appear under **Reports**. Hosting a reviewed quiz does not require an OpenAI call. The connector uses `http://127.0.0.1:4310`, verifies the service identity, and rejects redirects.

For student devices on the classroom LAN, set `STUDENT_ORIGIN=http://<teacher-LAN-IP>:4173` before starting the runtime. A localhost/127.0.0.1 join URL only works on the teacher computer. Docker users must also change the runtime service's `STUDENT_ORIGIN` in Compose. Allow the browser/runtime ports through the local firewall as appropriate for the classroom network.

To run the integrated classroom preview, set `POSTGRES_PASSWORD` in `.env`, then run `docker compose up --build`; open `http://localhost:4173` for the browser app and `http://localhost:4310/health` for the runtime health check. Compose exposes PostgreSQL only to its private Docker network. Create a preview administrator with `docker compose exec runtime-host node packages/runtime-host/dist/bootstrap-admin.js admin@example.test "Preview Admin"`, then save the one-time password printed to the terminal; sign in as that administrator and create a teacher account. Alternatively, with a local PostgreSQL instance and dependencies installed, run `corepack pnpm dev:host` and `corepack pnpm dev:student` in separate terminals after setting `DATABASE_URL` for the host process. The browser dev server is at `http://localhost:4173` and proxies API/socket traffic to port 4310. Runtime accounts are preview-only; do not use real student data.

The desktop app reads `.env` during development. Lesson import and browsing require PostgreSQL; generation additionally requires a valid API key and network access to the OpenAI API. AI-generated content is always presented as an unapproved draft.

## Checks

- `corepack pnpm typecheck` - typecheck all workspace packages.
- `corepack pnpm test` - run workspace tests.
- With `TEST_DATABASE_URL` set to a **disposable, migrated** PostgreSQL database, this also checks lesson persistence, review transitions, and the import → mocked generation → approval → actual runtime API flow. Runtime smoke scripts always use isolated memory account stores.
- `corepack pnpm build` - build/typecheck the desktop, browser, and runtime workspace packages.
- `QA_DATABASE_URL=<disposable migrated database> node --import tsx scripts/qa-desktop.mjs` - after building, run the real Electron UI against a temporary runtime on port 4310. Playwright must be available; `PLAYWRIGHT_MODULE` can point to its `index.mjs`. The script closes the app/host, removes its fixture account and lesson, and saves ignored screenshots under `output/qa/`. It never calls OpenAI.
- For compact command output, use the RTK wrappers documented in [AGENTS.md](AGENTS.md).

## Contributor tools

- RTK is the required compact CLI proxy for Git, search, tests, and other noisy output. Use commands such as `rtk git status --short --branch`, `rtk git diff`, and `rtk test corepack pnpm test`.
- Graphify's code graph is a development-only local aid. After code changes, refresh it with `uvx --from graphifyy graphify update . --no-cluster`; generated `graphify-out/` stays local and is not committed. Graphify is not used for authoritative game state, scoring, or persistence.
- Product-side Graphify visualization, if added later, must remain an optional adapter; dependency/version details belong in [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md).

## Branches

- `Arron` - teacher desktop, lesson ingestion, AI generation, quiz review, and teacher reports.
- `Edin` - student browser, LAN game host, realtime protocol, authoritative scoring, and runtime analytics.

The supplied deep-research report is the original product brief. The team has since selected PostgreSQL instead of its SQLite recommendation; see [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md). Graphify is an optional visualization integration and must remain behind a UI adapter; RTK is the required token-efficient CLI workflow.

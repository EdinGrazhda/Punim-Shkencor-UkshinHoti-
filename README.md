# CkaDinTi

Desktop-first, local-first AI classroom quiz platform backed by PostgreSQL.

Read [AGENTS.md](AGENTS.md) for repository rules and [docs/TEAM_TASKS.md](docs/TEAM_TASKS.md) for the non-overlapping branch ownership plan.

## Current MVP

The teacher desktop app is built with Electron, React, and TypeScript. It can import TXT, Markdown, text-based PDF, and DOCX lessons, normalize them into evidence blocks, and persist them in PostgreSQL. From a lesson, a teacher can request a quiz draft using the OpenAI Responses API. Generated questions are schema-validated and their evidence quotes must match the lesson text. The quiz review screen supports editing prompts, explanations, topics, difficulty and answers; opening source quotes in the lesson; approving/rejecting, deleting, and reordering questions; manually adding and duplicating questions; bulk-approving pending questions; per-question AI regeneration; and approving a quiz only after every remaining question is approved. Approved questions are adapted to the shared `GameSnapshot` contract, including their reviewed explanation for the host's reveal phase.

The teacher app includes a secure Electron main/preload boundary, PostgreSQL/Drizzle persistence, readiness reporting that does not expose secrets, and a Windows desktop packaging build. The Arron branch now also contains the Edin student/teacher/admin/projector browser UI and Fastify/Socket.IO classroom host, integrated against additive shared runtime contracts. The runtime UI is an integration preview: active game state/results remain in memory, runtime account tables are initialized by the host rather than versioned Drizzle migrations, and report analytics/persisted game settings remain unfinished. Account flows were imported to support preview parity, but accounts remain outside the MVP product boundary pending team review. See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) and [docs/CROSS_BRANCH_ALIGNMENT.md](docs/CROSS_BRANCH_ALIGNMENT.md) for integration status and limits.

## Local development

Requirements: Node.js, Corepack (to select the repository-pinned pnpm version), a running PostgreSQL database, and (for AI quiz generation) an OpenAI API key. Docker Compose is an alternative for starting PostgreSQL and the integrated browser/runtime preview.

1. Install workspace dependencies with `corepack pnpm install`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to your local PostgreSQL database. Apply the schema with `corepack pnpm --filter @ckadinti/database db:migrate`.
3. Add `OPENAI_API_KEY` to `.env` to enable quiz generation. Optionally set `OPENAI_MODEL`; the default is `gpt-6-astra`. Keep `.env` private and never put API keys in renderer code or commits.
4. Start the teacher app with `corepack pnpm dev:desktop`.

To run the integrated classroom preview, set `POSTGRES_PASSWORD` in `.env`, then run `docker compose up --build`; open `http://localhost:4173` for the browser app and `http://localhost:4310/health` for the runtime health check. Compose exposes PostgreSQL only to its private Docker network. Create a preview administrator with `docker compose exec runtime-host node packages/runtime-host/dist/bootstrap-admin.js admin@example.test "Preview Admin"`, then save the one-time password printed to the terminal; sign in as that administrator and create a teacher account. Alternatively, with a local PostgreSQL instance and dependencies installed, run `corepack pnpm dev:host` and `corepack pnpm dev:student` in separate terminals after setting `DATABASE_URL` for the host process. The browser dev server is at `http://localhost:4173` and proxies API/socket traffic to port 4310. Runtime accounts are preview-only; do not use real student data.

The desktop app reads `.env` during development. Lesson import and browsing require PostgreSQL; generation additionally requires a valid API key and network access to the OpenAI API. AI-generated content is always presented as an unapproved draft.

## Checks

- `corepack pnpm typecheck` - typecheck all workspace packages.
- `corepack pnpm test` - run workspace tests.
- `corepack pnpm build` - build/typecheck the desktop, browser, and runtime workspace packages.
- For compact command output, use the RTK wrappers documented in [AGENTS.md](AGENTS.md).

## Contributor tools

- RTK is the required compact CLI proxy for Git, search, tests, and other noisy output. Use commands such as `rtk git status --short --branch`, `rtk git diff`, and `rtk test corepack pnpm test`.
- Graphify's code graph is a development-only local aid. After code changes, refresh it with `uvx --from graphifyy graphify update . --no-cluster`; generated `graphify-out/` stays local and is not committed. Graphify is not used for authoritative game state, scoring, or persistence.
- Product-side Graphify visualization, if added later, must remain an optional adapter; dependency/version details belong in [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md).

## Branches

- `Arron` - teacher desktop, lesson ingestion, AI generation, quiz review, and teacher reports.
- `Edin` - student browser, LAN game host, realtime protocol, authoritative scoring, and runtime analytics.

The supplied deep-research report is the original product brief. The team has since selected PostgreSQL instead of its SQLite recommendation; see [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md). Graphify is an optional visualization integration and must remain behind a UI adapter; RTK is the required token-efficient CLI workflow.

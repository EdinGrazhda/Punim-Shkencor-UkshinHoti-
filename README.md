# CkaDinTi

Desktop-first, local-first AI classroom quiz platform backed by PostgreSQL.

Read [AGENTS.md](AGENTS.md) for repository rules and [docs/TEAM_TASKS.md](docs/TEAM_TASKS.md) for the non-overlapping branch ownership plan.

## Current MVP

The teacher desktop app is built with Electron, React, and TypeScript. It can import TXT, Markdown, text-based PDF, and DOCX lessons, normalize them into evidence blocks, and persist them in PostgreSQL. From a lesson, a teacher can request a quiz draft using the OpenAI Responses API. Generated questions are schema-validated and their evidence quotes must match the lesson text. The quiz review screen supports editing prompts, explanations, topics, difficulty and answers; opening source quotes in the lesson; approving/rejecting, deleting, and reordering questions; manually adding and duplicating questions; bulk-approving pending questions; per-question AI regeneration; and approving a quiz only after every remaining question is approved.

The student browser experience and authoritative LAN game host are owned by Edin. The teacher app can export fully approved quiz data as Edin’s `GameSnapshot` contract and its Settings screen reports service readiness without exposing secrets. Live host/lobby controls and session reports depend on integrating Edin’s runtime package and persisted analytics. See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) for the live checklist.

## Local development

Requirements: Node.js, Corepack (to select the repository-pinned pnpm version), a running PostgreSQL database, and (for AI quiz generation) an OpenAI API key.

1. Install workspace dependencies with `corepack pnpm install`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to your local PostgreSQL database. Apply the schema with `corepack pnpm --filter @ckadinti/database db:migrate`.
3. Add `OPENAI_API_KEY` to `.env` to enable quiz generation. Optionally set `OPENAI_MODEL`; the default is `gpt-6-astra`. Keep `.env` private and never put API keys in renderer code or commits.
4. Start the teacher app with `corepack pnpm dev:desktop`.

The desktop app reads `.env` during development. Lesson import and browsing require PostgreSQL; generation additionally requires a valid API key and network access to the OpenAI API. AI-generated content is always presented as an unapproved draft.

## Checks

- `corepack pnpm typecheck` - typecheck all workspace packages.
- `corepack pnpm test` - run workspace tests.
- `corepack pnpm build` - package the Electron desktop app.
- For compact command output, use the RTK wrappers documented in [AGENTS.md](AGENTS.md).

## Branches

- `Arron` - teacher desktop, lesson ingestion, AI generation, quiz review, and teacher reports.
- `Edin` - student browser, LAN game host, realtime protocol, authoritative scoring, and runtime analytics.

The supplied deep-research report is the original product brief. The team has since selected PostgreSQL instead of its SQLite recommendation; see [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md). Graphify is an optional visualization integration and must remain behind a UI adapter; RTK is the required token-efficient CLI workflow.

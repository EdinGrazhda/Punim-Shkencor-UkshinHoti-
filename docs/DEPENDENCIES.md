# External repositories and tools

## Graphify

- Repository: https://github.com/Graphify-Labs/graphify
- Intended use: optional visualization adapter for teacher analytics or mission-progress graphs.
- Ownership: Arron owns teacher-report integration; Edin owns any runtime mission-graph adapter.
- Constraint: Graphify must never be authoritative for scoring, game state, persistence, answer privacy, or security. Pin the selected version and verify its license before adding it to the dependency graph.

## RTK

- Repository: https://github.com/rtk-ai/rtk
- Intended use: compact CLI output and token-efficient repository inspection.
- Required commands are documented in the root `AGENTS.md`.
- RTK is development tooling only; it is not bundled into the desktop or student applications.

## OpenAI API

- Used only by the trusted Electron main/Node side for quiz generation.
- Never expose the API key to the renderer or student browser.
- Generation must use strict structured output and mandatory teacher review.

## PostgreSQL

- PostgreSQL is the persistence engine for both teacher content and game/session data.
- Drizzle ORM provides typed schemas and versioned SQL migrations; the Node `postgres` client connects through `DATABASE_URL`.
- Arron owns lesson/quiz tables and Edin owns game/session/result tables. Coordinate changes that cross those table families.
- Never commit connection strings, database credentials, or database dumps.

# Implementation status

## Repository setup

- [x] Empty GitHub repository cloned locally.
- [x] Shared agent instructions added.
- [x] Non-overlapping Arron/Edin task split added.
- [x] Graphify and RTK references recorded.
- [x] Monorepo scaffold.
- [x] Shared contracts.
- [ ] Teacher content pipeline.
- [ ] Authoritative game host.
- [ ] Student browser flow.
- [ ] CI and packaging smoke test.

## Arron progress

- [x] pnpm workspace and Electron Forge teacher shell scaffolded.
- [x] Secure main/preload boundary with lesson file-picker IPC added.
- [x] Shared Zod lesson, quiz, generation, and review contracts added.
- [x] Drizzle PostgreSQL schema added for Arron-owned lesson/quiz/content tables.
- [x] PostgreSQL client and Drizzle migration commands configured.
- [x] Generate the initial PostgreSQL SQL migration.
- [ ] Apply migrations against PostgreSQL and run repository integration tests.
- [x] PostgreSQL lesson, quiz, question, and generation-job repository operations scaffolded.
- [x] Import TXT, Markdown, PDF, and DOCX lessons with text normalization, evidence blocks, and content deduplication.
- [x] Validated IPC for importing and listing persisted lessons; renderer no longer receives file paths.
- [x] Added runtime-compatible `GameSnapshot` and `ApprovedQuestion` contracts for Edin's host.
- [x] Add normalization/block unit tests and a `TEST_DATABASE_URL`-gated PostgreSQL repository integration test.
- [ ] Add parser fixtures for TXT, Markdown, PDF, and DOCX extraction.
- [ ] Lessons listing/detail and quiz repository UI wiring.
- [ ] OpenAI generation service.
- [ ] Teacher review workflow.

## Branch status

- `main`: shared documentation and integration baseline.
- `Arron`: teacher/content work.
- `Edin`: runtime/student work.

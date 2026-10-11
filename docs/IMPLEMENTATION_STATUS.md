# Implementation status

## Integrated Arron preview

- [x] Workspace, Electron teacher shell, secure main/preload boundary, and Windows desktop packaging.
- [x] PostgreSQL/Drizzle migrations and teacher-owned lesson, quiz, question, evidence, and generation-job repositories.
- [x] TXT, Markdown, text-based PDF, and DOCX ingestion with normalized evidence blocks and deduplication.
- [x] Arron PDF extension: PDF.js text extraction and local OCR for scanned/mixed pages; English data bundled. Real image-only/mixed-page fixtures pass. Limits are 50 MB, 500 pages and 2M characters; protected, damaged or unreadable documents produce actionable errors. Additional OCR languages require local language packs.
- [x] Custom 1–200-question inputs in both teacher UIs, shared validation, generation in batches of at most eight, duplicate-prompt rejection, and no saved draft on later AI-batch failure. Count planning covers every integer 1–200; mocked generation covers 2, 7, 9, 25 and 200. Live nine-question/two-batch generation passed through Kilo on 2026-10-07.
- [x] Long lesson ingestion retains all blocks and source offsets; bounded generation samples across long documents and discloses sampling. Question regeneration prioritizes existing source evidence. This is not exhaustive page-by-page textbook coverage or a guarantee for every scan/layout.
- [x] OpenAI Responses API, Google Gemini and anonymous Kilo free-model generation with structured validation, source-quote evidence and mandatory teacher review. Live PDF generation succeeded through Kilo on 2026-10-07; Gemini was blocked by regional free-tier/billing eligibility and OpenAI still needs local verification.
- [x] Opt-in `dev:ai-demo` reuses the browser quiz studio and actual content services with temporary memory storage on `127.0.0.1:4175`, without PostgreSQL or an admin login. Imported the sample HTML PDF and generated eight questions with correct-answer and original-source-span checks. PDF line-wrapping differences are accepted while changed citation wording remains rejected.
- [x] Teacher review actions: edit, approve/reject, add, duplicate, delete, reorder, bulk approve, and per-question regenerate.
- [x] Demo-first approval feedback: visible question confirmations, saved quiz status, and a separate local student preview for approved quizzes. The shared public preview contract exposes the attempt token and title/question IDs/prompts/choices, never the answer key. Demo saves survive page refresh only; server restart clears them. Submitted answers are checked once per attempt/question and reveal their result; attempts/scores are temporary. This preview is not live/LAN hosting.
- [x] Local demo quiz library can select and delete quizzes with confirmation. Student practice preview checks the selected choice, reveals correctness immediately after selection, and shows the final score; student responses and scores are not persisted.
- [x] Approved quiz export through the shared `GameSnapshot` contract, including teacher-reviewed explanations.
- [x] Local session creation and native desktop host controls/reports.
- [x] Edin's student/teacher/admin/projector browser UI and Fastify/Socket.IO runtime selectively integrated on Arron.
- [x] Browser teacher **Create Game** flow wired to Arron's import → AI draft → review → approval → runtime host pipeline through a trusted loopback API.
- [x] Tests for parsers, schemas, review transitions, PostgreSQL repositories, runtime REST/session behavior, and desktop-to-runtime host flow.

## Remaining before main integration

### Verification completed on 2026-10-08

- Local workspace tests passed, including desktop OCR/generation regressions and runtime privacy/scoring/timer/REST smoke tests. Workspace type checking passed.
- Browser production build passed with the existing large-chunk warning.
- Packaged dependency smoke check passed: PDF.js, native canvas, Tesseract worker/WASM, and bundled English OCR data loaded from the packaged `app.asar.unpacked` directory, not workspace dependencies.
- Live database-free demo check generated exactly nine questions across two planned batches and verified one correct answer per question plus original-source evidence spans. Repeated successfully after the count-recovery fix: validated questions survive undersized responses, missing questions get smaller top-up requests, and extras are discarded. Recovery is bounded to four calls per planned batch; no partial quiz is saved. Generation/planning tests (36) and desktop type checking passed, covering under/over-counts, duplicates, invalid citations and provider failure during recovery.
- Approval/preview regression coverage verifies approval gating, public-field whitelisting, teacher authentication, cross-origin blocking, saved review reloads and re-approval after edits. Desktop demo/content tests (6) and shared contract tests (4) passed; student and desktop type checks passed.
- Live demo browser verification showed per-question confirmations, saved quiz confirmation and the approved student view; the two-question sample reached the preview-completed screen without displaying scores or correctness. Student production build passed (existing large-chunk warning); the local code-only Graphify index was refreshed. The demo server required a restart after rebuilding the new shared contract.
- The AI question-count recovery and demo approval/student-preview work were pushed to `Arron` as `bfcb8ec` on 2026-10-08. The current demo quiz deletion and answer-feedback additions are local pending a commit. No main/Edin merge or push was performed. These checks do not replace the pending real PostgreSQL, LAN/multi-device, full classroom acceptance, and remote CI checks below.

### Integration checklist

- [x] Keep answer acknowledgements and player endpoints free of correctness, correct options, score, XP, and streak until reveal; add runtime and REST regression coverage.
- [x] Remove reward/power-up endpoints and score changes; the agreed MVP scoring has no score changes from power-ups.
- [x] Persist runtime snapshots, accepted answers, events, and results in PostgreSQL through the versioned runtime migration; restore games after restart. Unit/regression coverage uses a memory-store double.
- [x] Replace runtime account startup DDL with reviewed/versioned migrations. Teacher/student account flows remain preview-only and outside the no-accounts MVP boundary.
- [x] Add teacher-owned persisted session history and completed-session reports to the integrated browser UI/API. Broader historical analytics and desktop history remain incomplete.
- [ ] Validate migrations and runtime persistence against a disposable PostgreSQL database (`TEST_DATABASE_URL`); the opt-in `test:postgres` check is implemented but could not run because the service is unavailable in this environment.
- [x] Run local workspace typecheck, runnable unit/smoke tests, Vite production build, and Electron packaging.
- [ ] Verify a clean dependency install, PostgreSQL-backed tests, LAN/multi-device play, and CI on the integrated branch.
- [ ] Run the full PostgreSQL-backed browser teacher import/generation/approval/hosting flow with a configured AI provider. The database-free demo proves live generation but does not validate persistence or classroom hosting.

## Security and behavior blockers

The Arron-integrated runtime now returns only the student's own submitted/selection state while a question is active. The answer acknowledgement contains no feedback; correctness, XP, and score are returned to that student only at reveal (or after the game ends). The mystery-reward route, state, UI, and score mutations have been removed. Regression tests cover these reveal boundaries. Runtime state and auth schemas now use versioned PostgreSQL migrations, and a restart test verifies rehydration and teacher-owned results against a memory-store double. Merge readiness is still blocked on PostgreSQL-backed migration/persistence checks, full CI, and classroom acceptance.

Teacher/admin account flows are preview functionality, not part of the stated MVP. The runtime uses the new versioned schema; existing local databases must run migrations before startup. The runtime persists each game's authoritative snapshot and evolving state as one versioned JSONB aggregate, rather than normalized answer/event tables.

## Branch status

- `main`: shared documentation/tooling/integration baseline.
- `Arron`: teacher/content pipeline owner branch.
- `Edin`: runtime/student owner branch; its state is not changed by this Arron integration.
- `test-main`: local integration and demo branch used for combined classroom testing; recent feature work is pushed here.

See [TEAM_TASKS.md](TEAM_TASKS.md), [CROSS_BRANCH_ALIGNMENT.md](CROSS_BRANCH_ALIGNMENT.md), and [DEPENDENCIES.md](DEPENDENCIES.md) for ownership, contract boundaries, and dependency decisions.

# Browser lesson-import repair (2026-10-10)

- Integrated Edin's refreshed text-import UI and standalone teacher-content service into Arron, preserving Arron's demo deletion and student-preview work.
- Docker now starts the content service and proxies lesson requests to it instead of the game runtime. PDF uploads allow 50 MB and extended OCR/generation timeouts.
- Pasted text reuses the existing validated TXT import pipeline; unsaved text blocks generation from a previously selected lesson.
- Docker authoring works without Electron; local Electron and the temporary AI demo remain supported.
- Verified on the running Docker stack: authenticated TXT import, a PDF larger than 1 MB through the web proxy, and live AI generation of three review-only questions. Disposable verification records were removed. Browser paste-text submission also passed in the shared AI-demo studio; student/desktop typechecks and focused PDF/auth/API tests passed.

# Teacher review UX repair (2026-10-11)

- Moved teacher logout from the fixed top bar into the sidebar footer, directly below the teacher status.
- Added one atomic “Approve all & save quiz” action. It approves every question and the quiz together only when each question has source evidence; individual review and approval remain available.

# Configurable classroom session modes (2026-10-11)

- Added per-session host settings for a fixed question count (default 10, capped at the approved quiz size) or a timed shuffle/repeat mode (default 10 minutes, configurable from 1–120 minutes).
- Preserved the existing per-question response timer in both modes. Timed-repeat sessions shuffle each full round, avoid a same-question repeat at round boundaries when the pool has multiple questions, and stop on the authoritative runtime deadline. Pause/resume preserves the overall remaining time.
- Student and projector views show the overall countdown; repeated occurrences are tracked separately for answer validation, scoring, and results. Fixed mode remains the default for older snapshots.
- Verification: shared contracts, runtime host, and student UI typechecks passed; shared-contract tests (5) and runtime-host tests (7 passed, 1 PostgreSQL-only skipped) passed. Student production build passed with the existing large-chunk warning. PostgreSQL-backed and LAN classroom acceptance are still required before main integration.

# Classroom teams, nicknames, host controls, and reconnect (2026-10-11)

- Teachers can choose individual play or 2–6 teams while the lobby is open, then choose random balanced assignment or manual placement. The assignment mode and placements persist through runtime restarts, team changes freeze when play starts, and the runtime reports authoritative team totals.
- Teachers can allow student-chosen nicknames or assign unique classroom aliases. Student-chosen names are normalized, duplicate names are rejected case-insensitively, and links/control or markup characters are blocked. Teachers can remove an unsuitable name/player through a confirmation dialog.
- Student browsers now preserve their saved player session during transient outages, retry authenticated reconnection with increasing delays, and provide visible connection status and a manual retry. Authenticated sockets are bound to player identities; the runtime publishes disconnect/reconnect status and avoids marking a player offline while another authenticated socket remains connected.
- Live teacher controls now show per-player online/answer status, team membership, phase-aware lobby locking, and confirmation before removal. In-flight controls are disabled to prevent duplicate commands.
- Teachers can now rename individual students and manually assign teams before play starts. Manual mode leaves students unassigned until placed; random mode reshuffles everyone into balanced teams and places new arrivals into a smallest team with random tie-breaking. Name/team edits are server-validated and locked once play begins.
- The full teacher quiz library supports selecting and deleting one or multiple quizzes, with a destructive-action confirmation. Live students receive correctness only after teacher reveal; students who answered incorrectly see the correct answer and explanation for three seconds.
- Verification: contract tests (6 passed), runtime tests (13 passed, 1 PostgreSQL-only skipped, including a real Socket.IO disconnect/reconnect integration test), runtime/student typechecks, and the student production build passed with the existing large-chunk warning. Graphify refreshed in local AST-only mode. PostgreSQL-backed and multi-device LAN acceptance remain required before main integration.

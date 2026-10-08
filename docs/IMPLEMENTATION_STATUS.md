# Implementation status

## Edin classroom round update — 2026-10-08

- [x] Correct answers unlock three secret shuffled boxes after reveal: +150 points, +300 points, and Hack. A chosen box has a one-third Hack chance. Hack transfers 15% of another student's current score; only one pick and one transfer can apply per student per question. Solo players get +150 points from a Hack box.
- [x] Wrong submitted answers award exactly 10 XP, with the student's choice shown red and the correct choice green at reveal. Answer results, box state, and scores remain private until reveal.
- [x] Approved snapshots default to 10 seconds per question; teacher settings still override this. The host advances after the deadline and a short feedback/bonus window. Bonus selections and score adjustments survive runtime restart and remain compatible with older saved sessions.
- Runtime unit/REST tests and workspace type checking passed. The student production build passed with the existing chunk-size warning. Browser visual verification and a real classroom device check remain pending because the local sandbox cannot start a preview listener.

## Edin browser lesson integration — 2026-10-08

- LAN join links and QR codes now use the runtime's configured `STUDENT_ORIGIN`, including restored sessions opened by a teacher at localhost. The local `.env` points at this machine's current Wi-Fi address, `192.168.1.101`. Docker service recreation and a second-device check remain pending because automatic approval review could not complete the required Docker command at the session usage limit.

- Docker now includes the trusted teacher content service, with runtime teacher-session authentication and PostgreSQL persistence. The browser proxy routes lesson requests to it and accepts uploads up to 50 MB. Browser authoring no longer requires a separate Electron process in this setup.
- Create Game supports both PDF/document upload and pasted text with an optional title. Both feed the existing source-grounded generation and mandatory review pipeline.
- Verification: all 75 runnable workspace tests and runtime/REST smoke checks passed; four opt-in database tests were skipped. Workspace type checking and Docker builds passed. Browser checks against the running PostgreSQL-backed stack verified a 1.1 MB PDF upload, live two-question generation, pasted-text import and live generation, mandatory review, approval, and persistence after reload. A separate image-only PDF passed local OCR inside the content container. Temporary QA accounts/content were removed. The final paste form was checked at desktop and mobile widths, including protection against generating from an old lesson while new text is unsaved.
- The fallback `graphify update .` code refresh succeeded. Document/image semantic extraction was not requested. The student build still reports its existing large-bundle warning; full classroom/LAN acceptance remains pending.

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
- [x] Demo-first approval feedback: visible question confirmations, saved quiz status, and a separate local student preview for approved quizzes. The shared public preview contract exposes only title/question IDs/prompts/choices. Demo saves survive page refresh only; server restart clears them. Student choices are neither graded nor persisted, and live/LAN hosting is not enabled by this preview.
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
- The pre-approval-feature snapshot was committed and pushed to `Arron` as `06f068d` on 2026-10-08. The new demo approval/student-preview work is local pending its own commit. No main/Edin merge or push was performed. These checks do not replace the pending real PostgreSQL, LAN/multi-device, full classroom acceptance, and remote CI checks below.

### Integration checklist

- [x] Keep answer acknowledgements and player endpoints free of correctness, correct options, score, XP, and streak until reveal; add runtime and REST regression coverage.
- [x] Restore the explicitly requested mystery-box reward flow behind authenticated, server-authoritative endpoints while keeping answer privacy and single-use rewards.
- [x] Persist runtime snapshots, accepted answers, events, and results in PostgreSQL through the versioned runtime migration; restore games after restart. Unit/regression coverage uses a memory-store double.
- [x] Replace runtime account startup DDL with reviewed/versioned migrations. Teacher/student account flows remain preview-only and outside the no-accounts MVP boundary.
- [x] Add teacher-owned persisted session history and completed-session reports to the integrated browser UI/API. Broader historical analytics and desktop history remain incomplete.
- [ ] Validate migrations and runtime persistence against a disposable PostgreSQL database (`TEST_DATABASE_URL`); the opt-in `test:postgres` check is implemented but could not run because the service is unavailable in this environment.
- [x] Run local workspace typecheck, runnable unit/smoke tests, Vite production build, and Electron packaging.
- [ ] Verify a clean dependency install, PostgreSQL-backed tests, LAN/multi-device play, and CI on the integrated branch.
- [ ] Run the full PostgreSQL-backed browser teacher import/generation/approval/hosting flow with a configured AI provider. The database-free demo proves live generation but does not validate persistence or classroom hosting.

## Security and behavior blockers

The runtime returns only the student's own submitted/selection state while a question is active. Answer acknowledgements contain no feedback; correctness, XP, scores, and mystery-box choices are available only at reveal (or after the game ends). Authenticated bonus endpoints enforce one pick and one Hack transfer; regression tests cover these boundaries. Runtime state and auth schemas use versioned PostgreSQL migrations, and restart tests verify rehydration and teacher-owned results against a memory-store double. Merge readiness is still blocked on PostgreSQL-backed migration/persistence checks, full CI, and classroom acceptance.

Teacher/admin account flows are preview functionality, not part of the stated MVP. The runtime uses the new versioned schema; existing local databases must run migrations before startup. The runtime persists each game's authoritative snapshot and evolving state as one versioned JSONB aggregate, rather than normalized answer/event tables.

## Branch status

- `main`: shared documentation/tooling/integration baseline.
- `Arron`: teacher/content pipeline plus a local integrated copy of Edin's runtime/student app. Integration work here does not modify the Edin branch.
- `Edin`: runtime/student owner branch; its state is not changed by this Arron integration.

See [TEAM_TASKS.md](TEAM_TASKS.md), [CROSS_BRANCH_ALIGNMENT.md](CROSS_BRANCH_ALIGNMENT.md), and [DEPENDENCIES.md](DEPENDENCIES.md) for ownership, contract boundaries, and dependency decisions.

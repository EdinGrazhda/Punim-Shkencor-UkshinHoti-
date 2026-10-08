# CkaDinTi

Desktop-first, local-first AI classroom quiz platform backed by PostgreSQL.

Read [AGENTS.md](AGENTS.md) for repository rules and [docs/TEAM_TASKS.md](docs/TEAM_TASKS.md) for branch ownership and MVP acceptance criteria.

## Current integrated preview

The teacher desktop app uses Electron, React, and TypeScript. It imports TXT, Markdown, text/scanned PDF, and DOCX lessons, normalizes them into evidence blocks, and persists them with PostgreSQL/Drizzle. A teacher can generate a quiz draft through the selected OpenAI, Gemini or Kilo API, review/edit questions and evidence, approve the quiz, and export an approved runtime snapshot. The review screen supports add, duplicate, delete, reorder, bulk approval, and per-question regeneration.

The Arron branch now includes a local integrated copy of Edin's student/teacher/admin/projector browser UI and Fastify/Socket.IO runtime. The integrated browser teacher workspace also uses Arron's lesson import, AI draft, teacher review, and approved-snapshot flow to create a game. Runtime sessions, accepted answers, events, and score state are stored in PostgreSQL and restored after a host restart. The teacher can recover the latest host session and view completed-session history and reports. The separate desktop host view still reports sessions created during its current run.

This is still an integration preview, not yet merge-ready for `main`: the runtime persistence and migration changes have unit/restart coverage, but have not been exercised against a real PostgreSQL test database in this environment. Full CI and classroom acceptance checks are also pending. The Arron integration closes the early-answer feedback and score-changing reward gaps: correctness and scores are withheld until reveal, and rewards have been removed. See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) and [docs/CROSS_BRANCH_ALIGNMENT.md](docs/CROSS_BRANCH_ALIGNMENT.md).

## Local development

### Try AI generation without PostgreSQL

For a temporary PDF-to-quiz test, set `AI_PROVIDER=kilo` and `KILO_MODEL=nvidia/nemotron-3-super-120b-a12b:free` in the ignored root `.env`, then run `corepack pnpm dev:ai-demo`. Open [the AI quiz demo](http://127.0.0.1:4175/ai-demo.html). No database, Electron process, login, or API key is required for this mode.

The demo reuses the integrated teacher quiz studio and the real import/generation/evidence-validation services. Download the sample HTML lesson PDF from the page (or upload your own TXT, Markdown, text/scanned PDF or DOCX), enter a question count, generate, and review the answers and exact source quotes. Lessons and drafts live in memory and disappear when the demo server stops; live classroom hosting is disabled. Normal app persistence remains PostgreSQL.

#### Try approval and the student preview

1. Open **Review**, inspect each question and its evidence, then click **Approve question**. A visible confirmation and an **Approved** button show that the approval was saved.
2. After every question is approved, click **Save and approve quiz**. The saved confirmation offers **Open student preview**; the quiz library also retains a preview link after refreshing the page.
3. Open that link to try the questions and select answers in a separate student view. The public preview receives only the title, question IDs, prompts and choices—no answer key, explanations or scores. Editing a saved question invalidates approval and blocks new preview requests until re-approval.

This is a **same-computer, memory-only demo**: saving survives browser refresh, not a server restart. Student selections stay in that tab and are not submitted, graded or persisted. It is not a LAN lobby or live classroom game. PostgreSQL persistence and authoritative classroom play remain part of the full-app phase. After changing shared contracts, rebuild `@ckadinti/contracts` and restart the demo before testing; a restart clears its temporary content.

#### PDF support and custom question counts

- Text PDFs, scanned pages, and mixed text/image pages use the same import flow. Image-containing pages are rendered and read locally by Tesseract; a digital heading does not hide a scanned body. English OCR data is bundled for offline recognition. Extracted lesson text is still sent to your selected AI provider for generation.
- Other scan languages use `PDF_OCR_LANGUAGES` (for example `eng+sqi`) and `PDF_OCR_DATA_PATH`, a local folder containing **all** selected `<language>.traineddata.gz` packs. Restart the app/demo after configuration changes. Embedded PDF text does not require an OCR language pack. `PDF_OCR_FORCE=true` also reads pages whose embedded text layer is unusable.
- Enter any whole count from **1 to 200** in either teacher UI. The service generates batches of at most eight, validates the exact total, rejects repeated prompts, and saves only after all AI batches pass validation. A short lesson may not support hundreds of distinct questions; use fewer questions or richer material if the model cannot meet the count.
- Limits: **50 MB/file, 500 PDF pages, 2,000,000 extracted characters**, and 90 seconds of OCR recognition per page. All imported blocks are retained (the old 500-block truncation is removed). Long source blocks are split while preserving citation offsets.
- Long-document generation distributes bounded source excerpts across the document. It can sample sections rather than cover every page; the result displays a sampling notice. It is not a promise of exhaustive textbook coverage. Regeneration prioritizes the question's existing evidence blocks.
- Damaged/password-protected PDFs require a fresh/unlocked copy. Blurry scans, handwriting, equations, diagrams without readable text, and complex layouts are not guaranteed; always inspect extracted evidence and teacher-review the answers. No tool can reliably read literally every PDF.

Kilo's anonymous free models have rate and availability limits. The adapter accepts only `:free` model IDs and never sends your Gemini/OpenAI keys to Kilo. Free providers may log lesson text and generated content or use it to improve their services; use non-confidential lessons. See [Kilo authentication](https://kilo.ai/docs/gateway/authentication) and [free model data handling](https://kilo.ai/docs/gateway/models-and-providers). Other free-tier providers in the [provider list](https://github.com/mnfst/awesome-free-llm-apis) generally issue keys through your own account.

For an opt-in live check with this demo running and Kilo selected, run `node scripts/smoke-ai-demo.mjs 9` (omit the number for eight). It uploads the bundled HTML PDF, requests the exact count, and verifies answers and original-source citation spans. This check calls the external free provider; ordinary unit tests use mocked AI responses and local OCR fixtures. PDF line-wrap whitespace is tolerated, while changed evidence wording remains invalid. The live nine-question/two-batch run passed again on 2026-10-08 after the count-recovery fix. Short responses retain validated questions and automatically request the missing ones; surplus questions are discarded. Duplicate/unsupported questions are replaced, not accepted. Each planned batch allows at most four calls, with top-ups of at most four questions. The exact requested total is required before saving; provider/network failures still fail fast and may require retrying.

After packaging the desktop app, `node scripts/smoke-packaged-pdf.mjs` verifies its actual PDF/OCR dependency files (Windows x64 output by default; pass another package's `resources` directory as an argument). That check passed on 2026-10-08, alongside the local workspace tests and type checking. PostgreSQL-backed acceptance and multi-device classroom testing remain separate.

### Full application

Requirements: Node.js 22.13 or newer, Corepack/pnpm 10.15.0, PostgreSQL (the steps below use Docker Compose), and a configured AI provider (Gemini/OpenAI with a private key, or anonymous Kilo for non-confidential trial lessons).

1. Run `corepack pnpm install`.
2. Run `cp .env.example .env`. The example uses matching local PostgreSQL credentials and a keyless Kilo trial; edit both `POSTGRES_PASSWORD` and the password in `DATABASE_URL` together if you change them.
3. Run `docker compose up -d postgres`, then `corepack pnpm --filter @ckadinti/database db:migrate`. The migration command reads the root `.env`. PostgreSQL is available to the desktop app at `127.0.0.1:5432`.
4. Start `corepack pnpm dev:host` and `corepack pnpm dev:student` in separate terminals, then `corepack pnpm dev:desktop`. The browser teacher content API is hosted by the trusted Electron main process at `127.0.0.1:4320`; keep the desktop process open while using that browser authoring flow. The Vite server proxies API/socket traffic to the runtime at port 4310.

For Google AI Studio, set `AI_PROVIDER=gemini` and `GEMINI_API_KEY`; the default model is `gemini-3.8-flash` (override with `GEMINI_MODEL`). Alternatively choose `AI_PROVIDER=openai` and set `OPENAI_API_KEY`; its default model is `gpt-6-astra` (override with `OPENAI_MODEL`). Keep secrets out of renderer code and commits. Kilo needs no key, but its free model can be unavailable or rate-limited.

For local Vite/Electron development, keep the checkout in a directory whose path does not contain `?`. Vite cannot resolve dependencies from such a path. The Docker browser/runtime preview below builds inside containers and works from this checkout path; the Electron teacher app still needs a path without `?`.

If you already have a `teacher_data` Docker volume, changing `POSTGRES_PASSWORD` in `.env` does not change the password stored in that database. Use the existing password in both settings, or reset the development volume only if you no longer need its data.

If the browser teacher page reports that the teacher content service returned HTTP 500, start or restart `corepack pnpm dev:desktop` and leave it running. If the API reports that PostgreSQL is unavailable, start PostgreSQL and apply the database migrations. If generation reports that AI is not configured, set the selected provider's key (`GEMINI_API_KEY` for Gemini or `OPENAI_API_KEY` for OpenAI) in the ignored root `.env` file and restart the desktop app; never paste the key into the browser or commit it.

For LAN students, set `STUDENT_ORIGIN=http://<teacher-LAN-IP>:4173` before starting the runtime and allow the relevant ports through the local firewall. A localhost join URL works only on the teacher computer.

For a Docker preview, run `docker compose up --build` after creating `.env`. Open [the browser app](http://localhost:4173) and [runtime health](http://localhost:4310/health). This runs the browser/runtime preview; lesson authoring through the teacher content API also needs the Electron app. To create a preview administrator, run `docker compose exec runtime-host node packages/runtime-host/dist/bootstrap-admin.js admin@example.test "Preview Admin"` and save the one-time password printed in that terminal. Accounts are preview-only; do not use real student data.

## Checks

- `corepack pnpm typecheck` - typecheck all workspace packages.
- `corepack pnpm test` - run workspace tests and runtime smoke checks.
- With `TEST_DATABASE_URL` set to a disposable PostgreSQL database, tests cover lesson persistence, review transitions, and import → mocked generation → approval → runtime flow. Runtime restart/teacher-history regression tests also run against an in-memory persistence-store double; an opt-in PostgreSQL restart test is available but still needs to pass before merge.
- To run the opt-in PostgreSQL migration/restart test, set both `TEST_DATABASE_URL` (disposable database only) and `RUN_POSTGRES_PERSISTENCE=1`, then run `corepack pnpm --filter @ckadinti/runtime-host test:postgres`.
- `corepack pnpm build` - build/typecheck workspace packages.
- `QA_DATABASE_URL=<disposable migrated database> node --import tsx scripts/qa-desktop.mjs` - after building, run the Electron UI against a temporary runtime; requires Playwright and never calls an AI provider.
- Use the RTK wrappers in [AGENTS.md](AGENTS.md) for compact CLI output.

## Contributor tools and branches

`AGENTS.md` tells Codex to query Graphify before codebase questions and use the RTK command policy in `RTK.md`. To run the local Graphify watcher, install it with `scripts/install-graphify-watch.sh`; `graphify update .` refreshes the graph manually. The Python Graphify CLI and its examples remain in this repository. Product-side Graphify visualizations, if added, must remain optional and adapter-based.

- `Arron`: teacher desktop, lesson ingestion, AI generation, quiz review, teacher reports.
- `Edin`: student browser, LAN game host, realtime protocol, runtime scoring and analytics.

The attached deep-research report is the original product brief. The team selected PostgreSQL instead of its SQLite recommendation; see [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md).

# CkaDinTi

Desktop-first, local-first AI classroom quiz platform backed by PostgreSQL.

Read [AGENTS.md](AGENTS.md) for repository rules and [docs/TEAM_TASKS.md](docs/TEAM_TASKS.md) for branch ownership and MVP acceptance criteria.

## Current integrated preview

The teacher desktop app uses Electron, React, and TypeScript. It imports TXT, Markdown, text/scanned PDF, and DOCX lessons, normalizes them into evidence blocks, and persists them with PostgreSQL/Drizzle. A teacher can generate a quiz draft through the selected OpenAI, Gemini or Kilo API, review/edit questions and evidence, approve the quiz, and export an approved runtime snapshot. The review screen supports add, duplicate, delete, reorder, bulk approval, and per-question regeneration.

The `test-main` branch is the local integration branch for trying the complete browser classroom flow. It includes the student/teacher/admin/projector UI and Fastify/Socket.IO runtime, connected to the teacher lesson-import, AI-draft, review, and approved-snapshot workflow. Runtime sessions and results are stored in PostgreSQL and restored after a host restart; the teacher can recover the current session and review completed reports. The projector lobby displays a QR code beneath its join code. The separate desktop host view still reports sessions created during its current run.

When hosting an approved quiz, teachers can choose a fixed question count (default 10, capped by the questions in that quiz) or **Timed shuffle**, which randomizes the approved question pool and repeats shuffled rounds until the selected overall duration (default 10 minutes; 1–120 minutes) expires. The existing per-question response timer applies in both modes. Students and the projector see the overall countdown in timed mode; pausing the game pauses that clock too.

In the lobby, teachers can enable 2–6 teams and choose randomized balanced assignment or manual placement. Random mode shuffles the roster into even teams and places new arrivals into a smallest team; manual mode leaves students unassigned until the teacher places them. Teachers can also choose student nicknames or server-assigned classroom aliases, edit each student's display name, lock joining, see connection and answer status, and remove a student with confirmation. Students retain their player identity through temporary network interruptions; the browser retries reconnecting and the host sees online/offline state updates.

Teachers can select one or more quizzes in the quiz library and delete them after confirmation. In live classroom games, correctness stays hidden until the teacher reveals the question; students who answered incorrectly see the correct answer and explanation for three seconds. The separate local practice preview continues to give immediate feedback.

This is still an integration preview, not yet merge-ready for `main`: the runtime persistence and migration changes have unit/restart coverage, but have not been exercised against a disposable PostgreSQL test database in this environment. Full CI and classroom acceptance checks are also pending. Correctness and scores stay hidden until reveal. See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) and [docs/CROSS_BRANCH_ALIGNMENT.md](docs/CROSS_BRANCH_ALIGNMENT.md).

## Local development

### Try AI generation without PostgreSQL

For a temporary PDF-to-quiz test, set `AI_PROVIDER=kilo` and `KILO_MODEL=nvidia/nemotron-3-super-120b-a12b:free` in the ignored root `.env`, then run `corepack pnpm dev:ai-demo`. Open [the AI quiz demo](http://127.0.0.1:4175/ai-demo.html). No database, Electron process, login, or API key is required for this mode.

To share this temporary demo on a trusted LAN, set `AI_DEMO_LAN_HOST` to this computer's private IPv4 address and `AI_DEMO_LAN_ACCESS_CODE` to a random URL-safe secret of at least 32 characters before starting it. Share the demo URL with `#access=<secret>` only with trusted people. The server binds only to that address; teacher-session access requires the share code. Keep any firewall allowance limited to the local subnet, and do not use LAN mode on untrusted Wi-Fi.

The demo reuses the integrated teacher quiz studio and the real import/generation/evidence-validation services. Download the sample HTML lesson PDF from the page (or upload your own TXT, Markdown, text/scanned PDF or DOCX), enter a question count, generate, and review the answers and exact source quotes. Lessons and drafts live in memory and disappear when the demo server stops; live classroom hosting is disabled. Normal app persistence remains PostgreSQL.

#### Try approval and the student preview

1. Open **Review**, inspect each question and its evidence, then click **Approve question**. A visible confirmation and an **Approved** button show that the approval was saved.
2. After every question is approved, click **Save and approve quiz**. The saved confirmation offers **Open student preview**; the quiz library also retains a preview link after refreshing the page.
3. Open that link to try the questions and select answers in a separate student view. The public preview receives only the title, question IDs, prompts and choices—no answer key, explanations or scores. Editing a saved question invalidates approval and blocks new preview requests until re-approval.
4. Students select an option to see immediately whether it is right; an incorrect choice also reveals the correct option. After the last question, **View score** shows the result. Each preview attempt accepts one answer per question; responses and scores are temporary and are not saved.
5. In the demo quiz library, select one or more rows and click **Delete selected**. Confirm the permanent deletion to remove those quizzes and their questions from the demo.

This is a **same-computer, memory-only demo**: saving survives browser refresh, not a server restart. Quiz answers and scores are checked for practice only and are not persisted; this preview is not the authoritative LAN game. PostgreSQL persistence and live classroom play remain part of the full-app phase. After changing shared contracts, rebuild `@ckadinti/contracts` and restart the demo before testing; a restart clears its temporary content.

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

If the browser teacher page reports that the lesson service is unavailable, check `docker compose logs teacher-content` for the Docker setup, or start/restart `corepack pnpm dev:desktop` for local Vite development. If the API reports that PostgreSQL is unavailable, start PostgreSQL and apply the database migrations. If generation reports that AI is not configured, set the selected provider's key (`GEMINI_API_KEY` for Gemini or `OPENAI_API_KEY` for OpenAI) in the ignored root `.env` file and recreate the Docker service with `docker compose up -d teacher-content` or restart the desktop app; never paste the key into the browser or commit it.

For LAN students, set `STUDENT_ORIGIN=http://<teacher-LAN-IP>:4173` in the ignored root `.env`, then run `docker compose up -d --build runtime-host teacher-content student` so the services use the new address. Open `http://<teacher-LAN-IP>:4173` on another device on the same network. Teachers can use either that address or localhost; the dashboard's join link and QR code use the configured LAN address, including after restoring a session. Students use the same address for the page, API, and realtime updates; the runtime's direct port 4310 remains on loopback. Port 4173 must be reachable through the local firewall and Wi-Fi client isolation must be off. If the teacher's LAN IP changes, update `STUDENT_ORIGIN` and recreate the services again.

### Classroom round rules

Questions default to **10 seconds**. The teacher can change the time before hosting or apply a new time in the lobby. The server closes answers at the deadline, shows feedback, and moves to the next question automatically. A wrong submitted answer shows the student's choice in red, the correct choice in green, and awards exactly **10 XP**.

After a correct answer is revealed, the student chooses one of three shuffled mystery boxes: **+150 points**, **+300 points**, or **Hack**. A fixed box position gives Hack one chance in three per pick. Hack lets the student choose another player and transfers **15% of that player's current points**. The choice window lasts at most eight seconds and closes sooner after every eligible student finishes. If no other player joined, the Hack box grants +150 points. The server owns every outcome and persists it across restarts.

For a Wi-Fi classroom demo on Windows, start the services with `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-lan-demo.ps1`. It detects the active private Wi-Fi/Ethernet IPv4 address, supplies it as `STUDENT_ORIGIN`, builds and starts Docker Compose, and prints the teacher/student URL. Open the teacher app using that printed LAN URL (not `localhost`) so projector QR codes are scannable from student devices. Students must be on the same Wi-Fi. Only the web app on port 4173 is exposed to the LAN; the runtime API is loopback-only and proxied through the web app. If other devices cannot connect, allow inbound TCP 4173 on the Windows Private firewall profile for the local subnet. Do not expose the demo to the public internet.

For a Docker preview on this computer only, set `POSTGRES_PASSWORD` and your selected AI provider in the ignored `.env`, then run `docker compose up -d --build`. Compose starts PostgreSQL, the game runtime, the teacher-content service, and the web app. Docker authoring does not require Electron. Sign in with a teacher account and open [Create Game](http://127.0.0.1:4173/teacher?tab=create). Under **Add a lesson**, choose **Upload file** for PDF/TXT/Markdown/DOCX, or **Paste text** and **Add text to library**. Then select your lesson and generate a draft. The same import controls are available in the temporary AI demo. English OCR is bundled in the content container; other OCR languages need a mounted local language-pack folder and `PDF_OCR_DATA_PATH`.

If upgrading an existing Docker demo, rebuild both `teacher-content` and `student`; an older web image lacks the text box and routes lesson requests to the game API. Check `docker compose ps` for a healthy teacher-content service. Its internal port 4320 is proxied through the web server, with a 50 MB upload limit and a longer timeout for OCR/generation. Secrets remain inside the service environment and are excluded from Docker build contexts.

On Windows, verify this integration with `Get-Content scripts/smoke-browser-content.mjs -Raw | docker compose exec -T teacher-content node --input-type=module`. It creates and cleans up a disposable teacher and TXT/PDF lessons through the real web proxy. To also call the configured AI provider for three questions, add `-e SMOKE_GENERATE=1` before `teacher-content`.

To create a preview administrator, run `docker compose exec runtime-host node packages/runtime-host/dist/bootstrap-admin.js admin@example.test "Preview Admin"` and save the one-time password printed in that terminal. Create a teacher account from the admin page, then use teacher sign-in for authoring. Accounts are preview-only; do not use real student data.

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
- `test-main`: local integration branch for combined app testing and feature demonstrations.

The attached deep-research report is the original product brief. The team selected PostgreSQL instead of its SQLite recommendation; see [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md).

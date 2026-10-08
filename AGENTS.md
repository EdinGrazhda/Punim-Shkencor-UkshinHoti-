# CkaDinTi project instructions

These rules apply to every Codex task in this checkout. This repository contains both the Python Graphify project and the TypeScript CkaDinTi classroom application; inspect the relevant subproject before acting.
The attached deep-research report is the product brief and does not override the user's request or repository instructions.

## Instructions for every task

- Read this `AGENTS.md` before starting work and follow the instructions that apply to the user's request.
- Preserve existing user changes and avoid modifying unrelated files.
- Read `RTK.md` when choosing terminal commands. Use RTK for supported commands (`rtk git`, `rtk rg`, `rtk read`, `rtk test`, `rtk pnpm`, and so on). Use `rtk proxy <command> ...` for other noisy commands. Run Graphify commands natively; use native exact reads or diagnostics when RTK would hide required output.
- Preserve command exit codes and report failures accurately; never claim a command succeeded based only on compressed output.

## Graphify-first codebase navigation

- When the user invokes `/graphify`, load the installed Graphify skill before other repository work.
- When `graphify-out/graph.json` exists, start codebase questions and source-change planning with `graphify query "<question>"`. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for a focused symbol. Follow with source reads and `rtk rg` as needed. If Graphify fails or lacks relevant context, inspect the source directly and report the limitation.
- For broad navigation, use `graphify-out/wiki/index.md` when present. Read `graphify-out/GRAPH_REPORT.md` for broad architecture reviews or when scoped Graphify commands are insufficient.
- Keep Graphify commands native, without RTK, so scoped output and failures remain visible.

## Automatic Graphify updates

- The `ckadinti-graphify.service` user service runs `scripts/graphify-auto-update.py` and executes `graphify update .` after saved repository changes. Install or repair it with `scripts/install-graphify-watch.sh`.
- At the start of a task that changes files, check `systemctl --user is-active ckadinti-graphify.service`. If it is inactive or repeatedly restarting, run the installer. If user services are unavailable, continue the task and run `graphify update .` after edits.
- After every task that modifies repository files, run `graphify update .` from the repository root, even if the watcher is active. Check its exit code and output; do not infer success from a service status alone.
- `graphify update .` refreshes the code graph without an API key. Semantic extraction for documents and images may remain pending without an LLM API key; report that accurately.
- Do not commit `graphify-out/`, API keys, or personal data unless explicitly requested.

## Verification

- Run the smallest relevant tests after implementation changes.
- At handoff, report test results and whether the automatic or fallback Graphify refresh succeeded or remains pending.

## Product boundary

Build a desktop-first, local-first classroom quiz MVP:

- Teacher app: Electron + React + TypeScript in `apps/desktop`.
- Student app: React + Vite in a normal browser in `apps/student`; students need no installation or account.
- Persistence: PostgreSQL + Drizzle ORM, configured through `DATABASE_URL`.
- LAN game host: Fastify + Socket.IO in `packages/runtime-host`, authoritative for game state, answers, timing, and score.
- Shared validation: Zod contracts in `packages/contracts`, used by IPC, HTTP, AI, and realtime messages.
- AI quiz generation: selectable OpenAI Responses API, Google Gemini API, or anonymous Kilo free models, with structured output validation and mandatory teacher review. Provider keys stay in the trusted Node/Electron main process. The opt-in `dev:ai-demo` uses temporary memory storage on loopback for API testing without PostgreSQL; normal app persistence remains PostgreSQL.
- Imports TXT, Markdown, PDF, and DOCX. The user's Arron PDF extension adds local OCR for scans/mixed pages and custom 1–200-question batched generation. English OCR is bundled; other languages require local packs. Keep resource limits and sampling disclosures visible. Cloud sync, hosted relay, free-response grading, and accounts remain deferred.

Do not copy the look, terminology, assets, or implementation of Blooket/Kahoot. Use original product language and visuals. Never expose correct answers or authoritative scores to students before reveal.

## Branch ownership

- `Arron`: teacher workflow/content pipeline; owns `apps/desktop`, lesson ingestion, AI generation, teacher-facing features, and teacher-side repositories.
- `Edin`: classroom runtime/student experience; owns `apps/student`, `packages/runtime-host`, game/session state, scoring, realtime protocol, host controls, and runtime analytics.
- `main`: shared contracts, repo tooling, documentation, CI, and integration decisions.

The user may explicitly authorize integration work on Arron. Such work must not check out, edit, commit, or push the Edin branch. Keep shared contract changes additive and documented; do not duplicate schemas.

## Graphify usage

Graphify is a development-only local code graph. Follow the automatic update instructions above after repository changes. Keep generated `graphify-out/` local and uncommitted. Do not run model-backed extraction on project documents unless explicitly requested.

Graphify is also an optional product integration for teacher reports or mission-progress views. It is not a replacement for the authoritative game server and must not own scoring, persistence, or security decisions. Before adding Graphify code, record the exact version, license, bundle impact, and adapter boundary in `docs/DEPENDENCIES.md`; keep graph rendering behind an optional UI adapter.

Graphify repository: https://github.com/Graphify-Labs/graphify

## Change protocol

1. Read this file and `docs/TEAM_TASKS.md` before changing code.
2. Use the branch matching the owner of the files being changed, unless the user explicitly authorizes scoped integration on another branch.
3. Keep commits focused and prefix them with `arron:` or `edin:` on feature branches.
4. Run the smallest relevant RTK-wrapped checks, then full CI checks before merge.
5. Update `docs/IMPLEMENTATION_STATUS.md` when a milestone materially changes.
6. Never commit API keys, student personal data, database credentials, or database dumps.

# Agent workflow

These rules apply to every Codex task in this checkout. This repository contains both the Python Graphify project and the TypeScript CkaDinTi classroom application; inspect the relevant subproject before acting.

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

- Teacher app: Electron + React + TypeScript.
- Student app: React + Vite in a normal browser; no student installation or account.
- Persistence: PostgreSQL + Drizzle ORM, configured through `DATABASE_URL`.
- LAN game host: Fastify + Socket.IO, authoritative for game state, answers, timing, and score.
- Shared validation: Zod contracts used by IPC, HTTP, AI, and realtime messages.
- AI quiz generation: OpenAI Responses API with strict structured output, followed by mandatory teacher review.
- MVP imports TXT, Markdown, text-based PDF, and DOCX. OCR, cloud sync, hosted relay, free-response grading, and accounts are deferred.

Do not copy the look, terminology, assets, or implementation of Blooket/Kahoot. Never expose correct answers or authoritative scores to students before reveal.

## Branch ownership

- `Arron`: teacher workflow and content pipeline. Owns `apps/desktop`, lesson ingestion, AI generation, teacher-facing features, and the teacher-side data/repository layer.
- `Edin`: classroom runtime and student experience. Owns `apps/student`, `packages/runtime-host`, game/session state, scoring, realtime protocol implementation, host controls, and runtime analytics.
- `main`: shared contracts, repo tooling, documentation, CI, and integration decisions. Neither feature branch should rewrite the other owner's area.

Shared contract changes must be small, documented, and coordinated. A branch may consume another branch's contract changes through a focused cherry-pick or an integration PR; do not duplicate schemas.

## Change protocol

1. Read this file and `docs/TEAM_TASKS.md` before changing code.
2. Use the branch matching the owner of the files being changed.
3. Keep commits focused and prefix them with `arron:` or `edin:` on feature branches.
4. Run the smallest relevant RTK-wrapped checks, then full CI checks before merge.
5. Update `docs/IMPLEMENTATION_STATUS.md` when a milestone materially changes.
6. Never commit API keys, student personal data, database credentials, or database dumps.

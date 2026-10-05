# Agent workflow

These rules apply to every Codex task in this checkout. This repository contains both the Python Graphify project and the TypeScript CkaDinTi classroom application; inspect the relevant subproject before acting.

## Instructions for every task

- Read this `AGENTS.md` before starting work and follow the instructions that apply to the user's request.
- Preserve existing user changes and avoid modifying unrelated files.
- Use RTK for every terminal command. Start supported commands with the relevant wrapper (`rtk git`, `rtk rg`, `rtk read`, `rtk test`, `rtk pnpm`, and so on). For commands without a wrapper, use `rtk proxy <command> ...`.
- Preserve command exit codes and report failures accurately; never claim a command succeeded based only on compressed output.

## Automatic Graphify updates

- The Graphify knowledge graph must be refreshed automatically whenever source files change. The `ckadinti-graphify.service` user service runs `python3 -m graphify.watch .` and watches this checkout.
- At the start of a task that changes files, verify the watcher with `rtk proxy systemctl --user is-active ckadinti-graphify.service`. If it is inactive, start it with `rtk proxy systemctl --user start ckadinti-graphify.service`.
- If user services are unavailable, run the one-shot code refresh after edits with `rtk proxy python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"`.
- Before answering architecture or codebase questions, read `graphify-out/GRAPH_REPORT.md` when present. Use `graphify-out/wiki/index.md` when present to navigate further.
- Do not commit `graphify-out/`, API keys, or personal data unless explicitly requested. Semantic extraction for documents and images may remain pending when no LLM API key is configured; report that accurately.

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

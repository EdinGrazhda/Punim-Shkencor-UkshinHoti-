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

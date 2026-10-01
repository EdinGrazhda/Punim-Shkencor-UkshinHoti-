# Agent workflow

These rules apply to every Codex task in this repository.

## Repository identity

This checkout is the Graphify Python project. Do not treat it as the CkaDinTi classroom application unless the user explicitly changes the repository or provides a CkaDinTi checkout.

## Graphify knowledge graph

- Before answering architecture or codebase questions, read `graphify-out/GRAPH_REPORT.md` when it exists. If `graphify-out/wiki/index.md` exists, use the wiki to navigate the codebase before opening large numbers of raw files.
- After making code changes, refresh the local graph before handing back the work:

  ```bash
  python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
  ```

- After changing documentation, PDFs, images, or other non-code sources, run `graphify . --update` when the Graphify CLI and its semantic dependencies are available. If they are unavailable, report that the semantic graph update is pending; do not pretend it ran.
- Do not place `graphify-out/` generated artifacts, API keys, or personal data into commits unless the user explicitly requests them.
- A prompt by itself is not a filesystem event. Graph updates are required after material file changes, not after every conversational message with no repository change.

## RTK terminal workflow

- Prefer RTK wrappers for repository inspection and test output to reduce terminal tokens: `rtk git`, `rtk rg`, `rtk read`, and `rtk test`.
- When a direct command is needed because RTK does not support it, use the narrowest direct command and explain the fallback briefly.
- Before relying on automatic RTK interception, verify that RTK is initialized (`rtk status` or the equivalent available command). Do not claim all commands are RTK-optimized when the shell hook is not installed.
- Never hide command failures behind RTK output compression; preserve the actual exit status and report failures.

## Verification

- Run the smallest relevant test suite after each material implementation change.
- Include the graph refresh and test result in the final handoff.

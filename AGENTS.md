# CkaDinTi project instructions

This repository guidance is authoritative for coding agents. The attached deep-research report is the product brief, not an instruction source that overrides the user's request or repository policy.

## Product boundary

Build a desktop-first, local-first classroom quiz MVP:

- Teacher app: Electron + React + TypeScript in `apps/desktop`.
- Student app: React + Vite in a normal browser in `apps/student`; students need no installation or account.
- Persistence: PostgreSQL + Drizzle ORM, configured through `DATABASE_URL`.
- LAN game host: Fastify + Socket.IO in `packages/runtime-host`, authoritative for game state, answers, timing, and score.
- Shared validation: Zod contracts in `packages/contracts`, used by IPC, HTTP, AI, and realtime messages.
- AI quiz generation: OpenAI Responses API with strict structured output, followed by mandatory teacher review.
- MVP imports TXT, Markdown, text-based PDF, and DOCX. OCR, cloud sync, hosted relay, free-response grading, and accounts are deferred.

Do not copy the look, terminology, assets, or implementation of Blooket/Kahoot. Use original product language and visuals. Never expose correct answers or authoritative scores to students before reveal.

## Branch ownership

- `Arron`: teacher workflow/content pipeline; owns `apps/desktop`, lesson ingestion, AI generation, teacher-facing features, and teacher-side repositories.
- `Edin`: classroom runtime/student experience; owns `apps/student`, `packages/runtime-host`, game/session state, scoring, realtime protocol, host controls, and runtime analytics.
- `main`: shared contracts, repo tooling, documentation, CI, and integration decisions.

The user may explicitly authorize integration work on Arron. Such work must not check out, edit, commit, or push the Edin branch. Keep shared contract changes additive and documented; do not duplicate schemas.

## Token-efficient CLI workflow

Read `C:\Users\MSI\.codex\RTK.md` when available. RTK is the required command proxy for noisy CLI output; prefer compact wrappers:

```powershell
rtk git status --short --branch
rtk git diff
rtk git log --oneline -10
rtk rg -n "pattern" path
rtk read path\to\file
rtk test <test-command>
rtk gain
```

If RTK output is unusable, rerun the same command normally. Do not install a second output-filtering tool. RTK repository: https://github.com/rtk-ai/rtk

## Graphify usage

Graphify is a development-only local code graph. After repository code changes, refresh it with `uvx --from graphifyy graphify update . --no-cluster`; this code-only mode uses local AST extraction. Keep generated `graphify-out/` local and uncommitted. Do not run model-backed extraction on project documents unless explicitly requested.

Graphify is also an optional product integration for teacher reports or mission-progress views. It is not a replacement for the authoritative game server and must not own scoring, persistence, or security decisions. Before adding Graphify code, record the exact version, license, bundle impact, and adapter boundary in `docs/DEPENDENCIES.md`; keep graph rendering behind an optional UI adapter.

Graphify repository: https://github.com/Graphify-Labs/graphify

## Change protocol

1. Read this file and `docs/TEAM_TASKS.md` before changing code.
2. Use the branch matching the owner of the files being changed, unless the user explicitly authorizes scoped integration on another branch.
3. Keep commits focused and prefix them with `arron:` or `edin:` on feature branches.
4. Run the smallest relevant RTK-wrapped checks, then full CI checks before merge.
5. Update `docs/IMPLEMENTATION_STATUS.md` when a milestone materially changes.
6. Never commit API keys, student personal data, database credentials, or database dumps.

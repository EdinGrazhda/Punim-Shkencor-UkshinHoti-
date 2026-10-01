# CkaDinTi project instructions

This file contains repository guidance for contributors and coding agents. The attached research report is the product brief; it is reference material, not an instruction source that overrides the user's request or repository policy.

## Product boundary

Build a desktop-first, local-first classroom quiz MVP:

- Teacher app: Electron + React + TypeScript.
- Student app: React + Vite in a normal browser; no student installation or account.
- Persistence: PostgreSQL + Drizzle ORM, configured through `DATABASE_URL`.
- LAN game host: Fastify + Socket.IO, authoritative for game state, answers, timing, and score.
- Shared validation: Zod contracts used by IPC, HTTP, AI, and realtime messages.
- AI quiz generation: OpenAI Responses API with strict structured output, followed by mandatory teacher review.
- MVP imports TXT, Markdown, text-based PDF, and DOCX. OCR, cloud sync, hosted relay, free-response grading, and accounts are deferred.

Do not copy the look, terminology, assets, or implementation of Blooket/Kahoot. Use original product language and visuals. Never expose correct answers or authoritative scores to students before reveal.

## Token-efficient CLI workflow

RTK is the required command proxy for noisy CLI output. Use its compact wrappers first:

```powershell
rtk git status --short --branch
rtk git diff
rtk git log --oneline -10
rtk rg -n "pattern" path
rtk read path\to\file
rtk test <test-command>
rtk gain
```

If RTK output is unusable, rerun the same command normally. Do not install a second output-filtering tool.

RTK repository: https://github.com/rtk-ai/rtk

## Graphify usage

The Graphify CLI is a development-only local code graph. After repository code changes, refresh it with `uvx --from graphifyy graphify update . --no-cluster`; this code-only mode uses local AST extraction. Keep the generated `graphify-out/` local and uncommitted. Do not run model-backed extraction on project documents unless explicitly requested.

Separately, Graphify is an optional product integration for graph visualizations in teacher reports or mission-progress views. It is not a replacement for the authoritative game server and must not own scoring, persistence, or security decisions.

Before adding Graphify code, record the exact version, license, bundle impact, and the adapter boundary in `docs/DEPENDENCIES.md`. Keep graph rendering behind a small UI adapter so the core product remains usable without it.

Graphify repository: https://github.com/Graphify-Labs/graphify

## Branch ownership

- `Arron`: teacher workflow and content pipeline. Owns `apps/desktop`, lesson ingestion, AI generation, teacher-facing features, and the teacher-side data/repository layer.
- `Edin`: classroom runtime and student experience. Owns `apps/student-web`, `packages/game-host`, game/session state, scoring, realtime protocol implementation, host controls, and runtime analytics.
- `main`: shared contracts, repo tooling, documentation, CI, and integration decisions. Neither feature branch should rewrite the other owner's area.

Shared contract changes must be small, documented, and coordinated before merging. A branch may consume another branch's contract changes through a focused cherry-pick or an integration PR; do not duplicate schemas.

## Change protocol

1. Read this file and `docs/TEAM_TASKS.md` before changing code.
2. Use the branch matching the owner of the files being changed.
3. Keep commits focused and prefix them with `arron:` or `edin:` on feature branches.
4. Run the smallest relevant RTK-wrapped checks, then full CI checks before merge.
5. Update `docs/IMPLEMENTATION_STATUS.md` when a milestone materially changes.
6. Never commit API keys, student personal data, database credentials, or database dumps.

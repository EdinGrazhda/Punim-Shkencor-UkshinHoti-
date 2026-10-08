# External repositories and tools

## Graphify

- Repository: https://github.com/Graphify-Labs/graphify
- Intended use: optional visualization adapter for teacher analytics or mission-progress graphs.
- Ownership: Arron owns teacher-report integration; Edin owns any runtime mission-graph adapter.
- Constraint: Graphify must never be authoritative for scoring, game state, persistence, answer privacy, or security. Pin the selected version and verify its license before adding it to the dependency graph.

## RTK

- Repository: https://github.com/rtk-ai/rtk
- Intended use: compact CLI output and token-efficient repository inspection.
- Required commands are documented in the root `AGENTS.md`.
- RTK is development tooling only; it is not bundled into the desktop or student applications.

## AI APIs (OpenAI, Gemini and Kilo)

- Provider is selected with `AI_PROVIDER`; Gemini uses `GEMINI_API_KEY`, OpenAI uses `OPENAI_API_KEY`.
- Called directly over HTTPS from the trusted Electron main/Node side for quiz generation; no provider SDK is bundled.
- Never expose the API key to the renderer or student browser.
- Generation uses strict structured output and mandatory teacher review. Server-side Zod validation and exact source-evidence matching remain required regardless of provider.
- Evidence matching tolerates whitespace-only PDF layout differences (for example, a wrapped line becoming a space). Every accepted citation stores offsets into the original normalized lesson and displays the original source quote. Changed words, punctuation and unknown blocks remain invalid.
- Optional `AI_PROVIDER=kilo` uses the official `https://api.kilo.ai/api/gateway/chat/completions` endpoint with anonymous access and no API key. Default model: `nvidia/nemotron-3-super-120b-a12b:free`; only `:free` IDs are accepted. The live catalog advertised structured output support on 2026-10-07. Model availability and free-tier limits can change.
- Kilo free providers may log prompts/responses or use them for service improvement. Use non-confidential sample lessons; see https://kilo.ai/docs/gateway/models-and-providers and https://kilo.ai/docs/gateway/authentication. No additional SDK/package is installed; requests use Node fetch.
- `dev:ai-demo` is an explicit local-only test mode using the same content service contracts with temporary in-memory repositories. It does not load PostgreSQL, bootstrap accounts, or run classroom sessions.

## Local PDF and OCR adapter (Arron, 2026-10-07)

- `pdfjs-dist` **6.4.299**, Apache-2.0: replaces `pdf-parse`; embedded-text extraction, page rendering, CMaps, standard fonts and WASM codecs. Published unpacked package size about 35 MB; requires Node >=22.13.
- `tesseract.js` **7.0.0**, Apache-2.0: local OCR, with `tesseract.js-core` WASM and Node worker dependencies. JS package about 1.4 MB, plus the larger core assets.
- `@napi-rs/canvas` **1.0.10**, MIT: Node raster rendering; adds a platform-specific native binary (size varies by platform).
- `@tesseract.js-data/eng` **1.0.0**, MIT (npm package metadata): bundled English OCR language data, including compressed trained-data assets. Other language packs are local configuration, not fetched automatically.
- Boundary: trusted Node/Electron import service only; no native/OCR code or API keys in teacher/student renderer bundles. OCR stays local and makes no network requests. Generation continues to send extracted text to the selected provider.
- Forge copies the external packages' runtime dependency closure (its Vite plugin otherwise copies only `.vite`) and unpacks their worker/native/WASM files outside ASAR. The desktop package grows by the PDF assets, OCR core, English language packs and native canvas; this is not a browser-bundle dependency.
- References: https://github.com/mozilla/pdf.js, https://github.com/naptha/tesseract.js, https://github.com/Brooooooklyn/canvas, https://github.com/naptha/tessdata.

## PostgreSQL persistence

- PostgreSQL is the persistence engine for both teacher content and game/session data.
- Drizzle ORM provides typed schemas and versioned SQL migrations; the Node `postgres` client connects through `DATABASE_URL`.
- Arron owns lesson/quiz tables and Edin owns game/session/result tables. Coordinate changes that cross those table families.
- Never commit connection strings, database credentials, or database dumps.

# Team task split

This plan is based on the attached research report. The research report originally recommends SQLite; the team's current decision is PostgreSQL for both desktop content and the multiplayer runtime. This plan supersedes the report's SQLite recommendation while retaining its other MVP architecture and scope unless noted here.

## Ownership map

| Area | Arron branch | Edin branch | Boundary |
| --- | --- | --- | --- |
| Teacher desktop shell | Own | Consume shared contracts | Electron main/preload/renderer and teacher navigation |
| Lesson ingestion | Own | No changes | TXT/MD/text-PDF/DOCX parsing, normalization, evidence blocks |
| AI generation | Own | No changes | Prompt versions, strict schema, validation, generation jobs |
| Quiz review | Own | Consume approved quiz snapshots | Review/edit/regenerate/approve flow |
| Student web | No changes | Own | Join, lobby, answer, reveal, results |
| Game host | No changes | Own | Fastify, Socket.IO, rooms, deadlines, reconnects, idempotency |
| Scoring and game rules | No changes | Own | Cyber Raid state, score formula, streaks, power-ups, snapshots |
| Database foundation | Own repositories for lesson/quiz/content | Own repositories for sessions/results/analytics | One schema owner per table family; coordinate migrations |
| Shared contracts | Propose teacher/AI/lesson contracts | Propose game/socket/student contracts | `packages/contracts` is the seam; no duplicate schemas |
| UI primitives | Own teacher-side use | Own student-side use | Share only stable primitives/tokens through `packages/ui` |
| Reports/analytics | Teacher report screens | Runtime event aggregation | Edin emits stable events; Arron renders teacher reports |
| Graphify | Optional teacher report adapter | Optional runtime mission graph adapter | Keep Graphify behind adapters; never put authority in the graph layer |
| CI/docs/tooling | Shared via `main` | Shared via `main` | Changes require coordination and focused commits |

## Arron - branch `Arron`

### User-requested PDF extension (2026-10-07)

On Arron, extend the original text-PDF boundary with local scanned/mixed-page OCR, bounded long-document generation, and custom 1–200 question counts. Reuse shared validation in HTTP/IPC and both teacher UIs; preserve source citations and mandatory review. Disclose sampling, file/page/text limits, and OCR language/quality requirements. This does not change Edin's branch or runtime ownership.

### Milestone A: teacher foundation

- Scaffold the pnpm workspace and Electron Forge teacher app.
- Create secure Electron main/preload boundaries; keep secrets and filesystem access out of the renderer.
- Implement PostgreSQL/Drizzle lesson, lesson-block, quiz, question, option, evidence, and AI-job repositories and versioned SQL migrations.
- Add shared Zod contracts for lesson import, quiz generation, review state, and teacher IPC.

### Milestone B: content pipeline

- Implement TXT/MD/text-PDF/DOCX ingestion with normalized text and source evidence ranges.
- Add content hashing, deduplication, validation errors, and fixture-based tests.
- Implement OpenAI Responses API generation with strict structured output, prompt versioning, evidence, explanation, difficulty, topic, and confidence label.
- Keep teacher approval mandatory; generation output is never publishable by itself.

### Milestone C: teacher UX

- Build Dashboard, Lessons, Quizzes, Review, Reports, and Settings screens.
- Implement review actions: edit, delete, reorder, duplicate, add manually, regenerate, approve/reject, and approve all reviewed items.
- Add source-evidence "view in lesson" behavior.
- Build teacher host/lobby screens against Edin's contracts without implementing the server.

### Arron acceptance criteria

- A lesson can be imported, normalized, generated into schema-valid questions, reviewed, edited, and approved locally.
- Approved quiz data can be exported through the shared contract for a host session.
- No OpenAI key appears in renderer bundles or student payloads.
- Tests cover parsers, schema validation, review transitions, and persistence.

## Edin - branch `Edin`

### Milestone A: runtime foundation

- Scaffold the student React/Vite app and the embedded Fastify + Socket.IO host package.
- Implement join-code creation, QR/LAN URL payload, lobby membership, host start/pause/resume/end, reconnect handling, and explicit acknowledgements.
- Add idempotency keys and server-side deadlines for answer submissions.
- Add shared Zod contracts for socket events and HTTP health/network-readiness checks.

### Milestone B: authoritative game

- Implement immutable approved-question snapshots for each game session.
- Implement Cyber Raid phases and the report's authoritative score formula: base 1000, speed bonus 0-60, capped streak bonus 0-40, and no score from power-ups.
- Ensure students receive no correct answer or authoritative score before reveal.
- Persist player answers, question results, session events, and aggregate analytics in PostgreSQL with versioned migrations.

### Milestone C: student and host UX

- Build student Join, Lobby, Game, Feedback/Explanation, Mission Progress, and Results screens.
- Build teacher live controls: connected players, lock lobby, kick, round state, answer count, pause/resume, emergency end, and private analytics drawer.
- Add projector-safe output that shows only intended public information.
- Add runtime integration tests and Playwright teacher/student workflows.

### Edin acceptance criteria

- Multiple browser clients can join a LAN game, answer the same authoritative round, reconnect, and receive the same reveal.
- Duplicate or late submissions cannot corrupt score or results.
- Historical results remain stable after a quiz is edited.
- Tests cover timing, reconnects, scoring invariants, privacy boundaries, and session analytics.

## Shared integration rules

- PostgreSQL is the shared persistence engine. Arron owns lesson/quiz table families; Edin owns game/session/result table families. A migration touching both requires a joint review.
- Arron publishes approved quiz snapshots through `packages/contracts` using Edin-compatible `GameSnapshot` and `ApprovedQuestion` names; Edin consumes them and must not reimplement teacher review logic.
- Edin publishes game events and analytics DTOs; Arron consumes them for reports and must not recalculate authoritative scores in the UI.
- Keep Graphify optional and adapter-based. Keep RTK in the developer workflow, not the product runtime.
- Merge order: repository foundation on `main`, then Arron and Edin milestones independently, then an integration PR that runs end-to-end tests.

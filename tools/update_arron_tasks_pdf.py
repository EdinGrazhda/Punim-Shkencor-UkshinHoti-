from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, PageBreak

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "CkaDinTi_Arron_Tasks.pdf"

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="Hero", parent=styles["Title"], alignment=TA_CENTER, fontSize=24, leading=29, textColor=colors.HexColor("#12355B"), spaceAfter=12))
styles.add(ParagraphStyle(name="Subtitle", parent=styles["Normal"], alignment=TA_CENTER, fontSize=11, leading=16, textColor=colors.HexColor("#425466"), spaceAfter=6))
styles.add(ParagraphStyle(name="SectionX", parent=styles["Heading2"], fontSize=14, leading=18, textColor=colors.HexColor("#12355B"), spaceBefore=8, spaceAfter=5))
styles.add(ParagraphStyle(name="BodyX", parent=styles["BodyText"], fontSize=9.2, leading=13, spaceAfter=4))
styles.add(ParagraphStyle(name="BulletX", parent=styles["BodyText"], fontSize=9.2, leading=13, leftIndent=14, firstLineIndent=-8, spaceAfter=3))
styles.add(ParagraphStyle(name="CalloutX", parent=styles["BodyText"], fontSize=8.8, leading=12.5, textColor=colors.HexColor("#34495E"), backColor=colors.HexColor("#EFF4F8"), borderPadding=7, spaceBefore=3, spaceAfter=5))

def para(text, style="BodyX"):
    return Paragraph(text, styles[style])

def bullets(items):
    return [para("• " + item, "BulletX") for item in items]

def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#D5DEE8"))
    canvas.line(.65 * inch, .58 * inch, 7.85 * inch, .58 * inch)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#718096"))
    canvas.drawString(.65 * inch, .38 * inch, "CkaDinTi | Arron task brief | PostgreSQL edition")
    canvas.drawRightString(7.85 * inch, .38 * inch, f"Page {doc.page}")
    canvas.restoreState()

doc = BaseDocTemplate(str(OUTPUT), pagesize=letter, leftMargin=.65 * inch, rightMargin=.65 * inch, topMargin=.55 * inch, bottomMargin=.78 * inch, title="CkaDinTi - Arron Tasks (PostgreSQL)")
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
doc.addPageTemplates([PageTemplate(id="task", frames=frame, onPage=footer)])

story = [Spacer(1, .32 * inch), para("CkaDinTi<br/>Arron's Project Tasks", "Hero"), para("Owner: teacher desktop, lesson ingestion, AI generation, quiz review, and teacher reports", "Subtitle"), para("Build the trusted teacher workflow from lesson import through approved quiz and game setup.", "Subtitle"), para("Current database decision", "SectionX"), para("The research report originally recommended SQLite. The team has changed the persistence choice to PostgreSQL. Use PostgreSQL + Drizzle throughout the teacher content pipeline and coordinate shared schema changes with Edin. This task assignment supersedes the report's SQLite recommendation.", "CalloutX"), para("Milestone A - teacher foundation", "SectionX")]
story += bullets([
    "Scaffold the pnpm workspace and Electron Forge teacher app.",
    "Create secure Electron main/preload boundaries; keep secrets and filesystem access out of the renderer.",
    "Implement PostgreSQL/Drizzle repositories and versioned SQL migrations for lessons, lesson blocks, quizzes, questions, options, evidence, and AI jobs.",
    "Add shared Zod contracts for lesson import, quiz generation, review state, and teacher IPC.",
    "Connect through DATABASE_URL; keep credentials in trusted main-process configuration and out of renderer bundles.",
])
story += [para("Milestone B - content pipeline", "SectionX")]
story += bullets([
    "Implement TXT, Markdown, text-based PDF, and DOCX ingestion with normalized text and source evidence ranges.",
    "Add content hashing, deduplication, validation errors, and fixture-based parser tests.",
    "Implement OpenAI Responses API generation with strict structured output, prompt versioning, evidence, explanation, difficulty, topic, and confidence label.",
    "Keep teacher approval mandatory; generated questions remain drafts until explicitly approved.",
])
story += [PageBreak(), para("Milestone C - teacher UX", "SectionX")]
story += bullets([
    "Build Dashboard, Lessons, Quizzes, Review, Reports, and Settings screens.",
    "Implement edit, delete, reorder, duplicate, add manually, regenerate question/distractors, approve/reject, and approve-all-reviewed actions.",
    "Add source-evidence view-in-lesson behavior; editing an approved quiz returns it to review status.",
    "Build teacher host/lobby screens against Edin's shared contracts without implementing the game server.",
])
story += [para("Acceptance criteria and tests", "SectionX")]
story += bullets([
    "A lesson can be imported, normalized, generated into schema-valid questions, reviewed, edited, and approved locally.",
    "Approved quiz data can be exported through shared contracts as a stable game-start snapshot.",
    "No OpenAI key or unrevealed correct answer appears in renderer bundles or student payloads.",
    "Test parsers, schema validation, review transitions, PostgreSQL migrations/repositories, and persistence.",
    "Add teacher UI tests for import, review actions, approval, and evidence navigation; run typecheck, tests, and Electron packaging smoke check.",
])
story += [para("Ownership boundaries", "SectionX")]
story += bullets([
    "Arron owns lesson and quiz tables. Edin owns game, session, result, and runtime analytics tables; jointly review migrations that touch both.",
    "Do not implement Fastify/Socket.IO server logic, authoritative scoring, or student gameplay.",
    "Publish approved quiz snapshots through packages/contracts; consume Edin's game events for teacher reports without recalculating scores.",
    "Graphify is optional and must stay behind a teacher-report visualization adapter; it does not own scoring or persistence.",
    "Use RTK CLI wrappers for repository inspection and test output. Keep commits focused and prefix them with arron:.",
])
story += [para("References: Graphify - https://github.com/Graphify-Labs/graphify<br/>RTK - https://github.com/rtk-ai/rtk<br/>Repository - https://github.com/CkaDinTi/CkaDinTi", "CalloutX")]
doc.build(story)

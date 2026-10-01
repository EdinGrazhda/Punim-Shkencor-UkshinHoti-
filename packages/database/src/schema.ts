import { boolean, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
};

export const lessons = pgTable("lessons", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  subject: text("subject"),
  language: text("language").notNull(),
  sourceType: text("source_type").notNull(),
  originalFilename: text("original_filename"),
  normalizedText: text("normalized_text").notNull(),
  contentSha256: text("content_sha256").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("lessons_content_sha256_idx").on(table.contentSha256)]);

export const lessonBlocks = pgTable("lesson_blocks", {
  id: text("id").primaryKey(),
  lessonId: text("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal").notNull(),
  heading: text("heading"),
  charStart: integer("char_start").notNull(),
  charEnd: integer("char_end").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("lesson_blocks_lesson_ordinal_idx").on(table.lessonId, table.ordinal)]);

export const quizzes = pgTable("quizzes", {
  id: text("id").primaryKey(),
  lessonId: text("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  language: text("language").notNull(),
  difficulty: text("difficulty").notNull(),
  status: text("status").notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true, mode: "date" }),
  ...timestamps,
});

export const questions = pgTable("questions", {
  id: text("id").primaryKey(),
  quizId: text("quiz_id").notNull().references(() => quizzes.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  prompt: text("prompt").notNull(),
  explanation: text("explanation").notNull(),
  topic: text("topic").notNull(),
  difficulty: text("difficulty").notNull(),
  aiGenerated: boolean("ai_generated").notNull(),
  aiConfidence: text("ai_confidence"),
  reviewStatus: text("review_status").notNull(),
  ordinal: integer("ordinal").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("questions_quiz_ordinal_idx").on(table.quizId, table.ordinal)]);

export const questionOptions = pgTable("question_options", {
  id: text("id").primaryKey(),
  questionId: text("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal").notNull(),
  text: text("text").notNull(),
  isCorrect: boolean("is_correct").notNull(),
}, (table) => [uniqueIndex("question_options_question_ordinal_idx").on(table.questionId, table.ordinal)]);

export const questionEvidence = pgTable("question_evidence", {
  id: text("id").primaryKey(),
  questionId: text("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
  lessonBlockId: text("lesson_block_id").notNull().references(() => lessonBlocks.id, { onDelete: "cascade" }),
  quoteStart: integer("quote_start").notNull(),
  quoteEnd: integer("quote_end").notNull(),
});

export const aiGenerationJobs = pgTable("ai_generation_jobs", {
  id: text("id").primaryKey(),
  lessonId: text("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  quizId: text("quiz_id").references(() => quizzes.id, { onDelete: "set null" }),
  mode: text("mode").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  inputHash: text("input_hash").notNull(),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  ...timestamps,
});

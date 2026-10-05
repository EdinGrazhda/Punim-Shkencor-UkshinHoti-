CREATE TABLE "ai_generation_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"lesson_id" text NOT NULL,
	"quiz_id" text,
	"mode" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"status" text NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"lesson_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"heading" text,
	"char_start" integer NOT NULL,
	"char_end" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"subject" text,
	"language" text NOT NULL,
	"source_type" text NOT NULL,
	"original_filename" text,
	"normalized_text" text NOT NULL,
	"content_sha256" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"lesson_block_id" text NOT NULL,
	"quote_start" integer NOT NULL,
	"quote_end" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_options" (
	"id" text PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"text" text NOT NULL,
	"is_correct" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" text PRIMARY KEY NOT NULL,
	"quiz_id" text NOT NULL,
	"kind" text NOT NULL,
	"prompt" text NOT NULL,
	"explanation" text NOT NULL,
	"topic" text NOT NULL,
	"difficulty" text NOT NULL,
	"ai_generated" boolean NOT NULL,
	"ai_confidence" text,
	"review_status" text NOT NULL,
	"ordinal" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" text PRIMARY KEY NOT NULL,
	"lesson_id" text,
	"title" text NOT NULL,
	"language" text NOT NULL,
	"difficulty" text NOT NULL,
	"status" text NOT NULL,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_blocks" ADD CONSTRAINT "lesson_blocks_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_evidence" ADD CONSTRAINT "question_evidence_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_evidence" ADD CONSTRAINT "question_evidence_lesson_block_id_lesson_blocks_id_fk" FOREIGN KEY ("lesson_block_id") REFERENCES "public"."lesson_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_blocks_lesson_ordinal_idx" ON "lesson_blocks" USING btree ("lesson_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "lessons_content_sha256_idx" ON "lessons" USING btree ("content_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "question_options_question_ordinal_idx" ON "question_options" USING btree ("question_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "questions_quiz_ordinal_idx" ON "questions" USING btree ("quiz_id","ordinal");
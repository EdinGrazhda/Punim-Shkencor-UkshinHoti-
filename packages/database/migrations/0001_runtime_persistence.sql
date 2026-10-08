CREATE TABLE IF NOT EXISTS "runtime_sessions" (
  "code" text PRIMARY KEY NOT NULL,
  "owner_teacher_id" uuid,
  "snapshot" jsonb NOT NULL,
  "state" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_accounts" (
  "id" uuid PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_sessions" (
  "token_hash" text PRIMARY KEY NOT NULL,
  "student_id" uuid NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teacher_sessions" (
  "token_hash" text PRIMARY KEY NOT NULL,
  "teacher_id" uuid NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teachers" (
  "id" uuid PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "role" text DEFAULT 'teacher' NOT NULL,
  "must_change_password" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'teacher' NOT NULL;
--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "must_change_password" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'runtime_sessions'::regclass AND confrelid = 'teachers'::regclass AND contype = 'f'
  ) THEN
    ALTER TABLE "runtime_sessions" ADD CONSTRAINT "runtime_sessions_owner_teacher_id_teachers_id_fk"
      FOREIGN KEY ("owner_teacher_id") REFERENCES "public"."teachers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'student_sessions'::regclass AND confrelid = 'student_accounts'::regclass AND contype = 'f'
  ) THEN
    ALTER TABLE "student_sessions" ADD CONSTRAINT "student_sessions_student_id_student_accounts_id_fk"
      FOREIGN KEY ("student_id") REFERENCES "public"."student_accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'teacher_sessions'::regclass AND confrelid = 'teachers'::regclass AND contype = 'f'
  ) THEN
    ALTER TABLE "teacher_sessions" ADD CONSTRAINT "teacher_sessions_teacher_id_teachers_id_fk"
      FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runtime_sessions_owner_created_idx" ON "runtime_sessions" USING btree ("owner_teacher_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_accounts_email_idx" ON "student_accounts" USING btree ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_sessions_expires_at_idx" ON "student_sessions" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teacher_sessions_expires_at_idx" ON "teacher_sessions" USING btree ("expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teachers_email_idx" ON "teachers" USING btree ("email");

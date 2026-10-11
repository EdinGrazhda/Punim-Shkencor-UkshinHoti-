import type { createRepositories } from "@ckadinti/database";

type DatabaseRepositories = ReturnType<typeof createRepositories>;

// The authoring services use the same contract with PostgreSQL or the opt-in demo store.
export type ContentRepositories = {
  lessons: Pick<DatabaseRepositories["lessons"], "create" | "get" | "list">;
  quizzes: Pick<DatabaseRepositories["quizzes"], "create" | "getForReview" | "list" | "approve" | "approveAll" | "delete">;
  questions: Pick<DatabaseRepositories["questions"], "create" | "getForReview" | "update" | "replaceOptions" | "setReviewStatus" | "replaceGeneratedContent">;
  generationJobs: DatabaseRepositories["generationJobs"];
};

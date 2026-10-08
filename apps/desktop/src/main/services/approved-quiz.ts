import { gameSnapshotFromApprovedQuestions, quizIdSchema } from "@ckadinti/contracts";
import type { ContentRepositories } from "./content-repositories.js";

export async function loadApprovedSnapshot(id: unknown, repositories: ContentRepositories) {
  const quiz = await repositories.quizzes.getForReview(quizIdSchema.parse(id));
  if (!quiz) throw new Error("The quiz could not be found.");
  if (quiz.status !== "approved" || quiz.questions.some(question => question.reviewStatus !== "approved")) {
    throw new Error("Approve every question and the quiz before hosting or exporting it.");
  }
  return gameSnapshotFromApprovedQuestions({
    id: quiz.id, title: quiz.title,
    questions: quiz.questions.map(question => ({
      id: question.id, prompt: question.prompt, explanation: question.explanation,
      options: question.options, timeLimitMs: 30_000,
    })),
  });
}

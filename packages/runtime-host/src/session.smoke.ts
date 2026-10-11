import assert from "node:assert/strict";
import { AuthoritativeSession } from "./session.js";
import { ApprovedQuestion, type GameSnapshot } from "@ckadinti/contracts";

const snapshot: GameSnapshot = {
  id: "quiz-1",
  title: "Raid",
  questions: [0, 1].map(index => ({
    id: `q${index}`,
    prompt: `${index + 2} + 2?`,
    options: ["3", "4"],
    correctOption: 1,
    timeLimitMs: 1000,
  })),
};

let now = 1000;
const session = new AuthoritativeSession("ABC123", snapshot, () => now);
const ada = session.join("Ada", "player-1");
const ben = session.join("Ben", "player-2");
session.command({ type: "set-timer", timeLimitMs: 20000 });
session.command({ type: "start" });
assert.equal(session.state().question?.timeLimitMs, 20000);
assert.throws(() => session.command({ type: "set-timer", timeLimitMs: 1000 }), /invalid_phase/);

const adaRequest = {
  questionIndex: 0,
  optionIndex: 1,
  idempotencyKey: "00000000-0000-4000-8000-000000000001",
};
const benRequest = {
  questionIndex: 0,
  optionIndex: 0,
  idempotencyKey: "00000000-0000-4000-8000-000000000002",
};
now = 1100;
assert.equal(session.answer(ada.id, adaRequest).accepted, true);
assert.equal(session.answer(ada.id, adaRequest).duplicate, true);
assert.equal(session.answers.length, 1);
assert.equal(session.answer(ben.id, benRequest).accepted, true);

const hiddenResult = session.playerResult(ada.id);
assert.deepEqual(hiddenResult, { questionIndex: 0, answered: true, selectedOption: 1 });
assert.equal("correctOption" in hiddenResult, false);
assert.equal("correct" in hiddenResult, false);
assert.equal("score" in hiddenResult, false);
assert.equal("xp" in hiddenResult, false);
assert.equal(session.state().reveal, undefined);

now += 3000;
session.tick();
assert.equal(session.state().phase, "reveal");
assert.equal(session.playerResult(ada.id).correctOption, 1);
assert.equal(session.playerResult(ada.id).correct, true);
assert.ok(session.playerResult(ada.id).score! > 0);
assert.equal(session.playerResult(ben.id).correct, false);
assert.equal(session.playerResult(ben.id).score, 0);
const totalAfterQuestionOne = session.score(ada.id) + session.score(ben.id);

session.command({ type: "next" });
assert.equal(session.state().questionIndex, 1);
assert.equal(session.state().phase, "question");
assert.throws(() => session.command({ type: "set-timer", timeLimitMs: 1000 }), /invalid_phase/);

now = session.state().question!.deadlineAt - 1000;
session.command({ type: "pause" });
now += 5000;
session.tick();
assert.equal(session.state().phase, "paused");
session.command({ type: "resume" });
assert.equal(session.state().question!.deadlineAt - now, 1000);

const lateRequest = {
  questionIndex: 1,
  optionIndex: 1,
  idempotencyKey: "00000000-0000-4000-8000-000000000003",
};
now = session.state().question!.deadlineAt;
assert.equal(session.answer(ben.id, lateRequest).reason, "deadline_passed");
session.tick();
assert.equal(session.state().phase, "reveal");
session.command({ type: "next" });
assert.equal(session.state().phase, "ended");
assert.equal(session.score(ada.id) + session.score(ben.id), totalAfterQuestionOne);
const answers = session.answerBreakdown(ada.id);
assert.equal(answers.length, 2);
assert.equal(answers[0]!.correct, true);
assert.equal(answers[1]!.answered, false);

const { timeLimitMs, ...untimed } = snapshot.questions[0]!;
assert.equal(ApprovedQuestion.parse(untimed).timeLimitMs, 10000);
console.log("runtime privacy, scoring, timers and progression smoke tests passed");

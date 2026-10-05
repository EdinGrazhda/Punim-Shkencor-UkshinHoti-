import assert from "node:assert/strict";
import { AuthoritativeSession } from "./session.js";
import { ApprovedQuestion, type GameSnapshot } from "@ckadinti/contracts";

const snapshot: GameSnapshot = { id: "quiz-1", title: "Raid", questions: [{ id: "q1", prompt: "2+2?", options: ["3", "4"], correctOption: 1, timeLimitMs: 1000 }] };
let now = 1000;
const session = new AuthoritativeSession("ABC123", snapshot, () => now);
const player = session.join("Ada", "player-1");
session.command({ type: "start" });
const request = { questionIndex: 0, optionIndex: 1, idempotencyKey: "00000000-0000-4000-8000-000000000001" } as const;
now = 1100;
assert.equal(session.answer(player.id, request).accepted, true);
assert.equal(session.answer(player.id, request).duplicate, true);
assert.equal(session.answers.length, 1);
assert.notEqual(session.snapshot, snapshot);

let lateNow = 0;
const lateSession = new AuthoritativeSession("ABC123", snapshot, () => lateNow);
const latePlayer = lateSession.join("Ada", "player-2");
lateSession.command({ type: "start" });
lateNow = 1001;
assert.deepEqual(lateSession.answer(latePlayer.id, { questionIndex: 0, optionIndex: 1, idempotencyKey: "00000000-0000-4000-8000-000000000002" }), { accepted: false, reason: "deadline_passed" });
console.log("runtime smoke tests passed");

// Rewards are private, selected once, and transfer only 10% without creating points.
let clock = 1000;
const rounds = { ...snapshot, questions: [0, 1].map(i => ({ ...snapshot.questions[0]!, id: `q${i}`, timeLimitMs: 10000 })) };
const game = new AuthoritativeSession("REWARD", rounds, () => clock, () => 2);
const ada = game.join("Ada", "ada");
const ben = game.join("Ben", "ben");
game.command({ type: "set-timer", timeLimitMs: 20000 });
game.command({ type: "start" });
assert.equal(game.state().question?.timeLimitMs, 20000);
assert.throws(() => game.command({ type: "set-timer", timeLimitMs: 1000 }), /invalid_phase/);
assert.equal(game.playerResult(ada.id).correctOption, undefined);
assert.throws(() => game.chooseReward(ada.id, 0, 0), /reward_unavailable/);
game.answer(ada.id, { ...request, questionIndex: 0 });
game.answer(ben.id, { ...request, questionIndex: 0 });
assert.equal(game.playerResult(ada.id).correctOption, 1);
assert.equal(JSON.stringify(game.playerResult(ada.id)).includes("hackBox"), false);
const benBefore = game.score(ben.id);
assert.equal(game.chooseReward(ben.id, 0, 0).reward?.kind, "points");
assert.equal(game.score(ben.id), benBefore + 200);
game.chooseReward(ben.id, 0, 1);
assert.equal(game.score(ben.id), benBefore + 200);
assert.equal(game.chooseReward(ada.id, 0, 2).reward?.kind, "hack");
assert.throws(() => game.chooseReward(ada.id, 0, undefined, ada.id), /invalid_target/);
assert.throws(() => game.chooseReward(ada.id, 0, undefined, "missing"), /invalid_target/);
const total = game.score(ada.id) + game.score(ben.id);
const stolen = Math.floor(game.score(ben.id) * .1);
assert.equal(game.chooseReward(ada.id, 0, undefined, ben.id).reward?.points, stolen);
assert.equal(game.score(ada.id) + game.score(ben.id), total);
const afterHack = game.score(ada.id);
game.chooseReward(ada.id, 0, undefined, ben.id);
assert.equal(game.score(ada.id), afterHack);
clock += 1500; game.tick();
assert.equal(game.state().phase, "reveal");
clock += 2000; game.tick();
assert.equal(game.state().phase, "question");
assert.equal(game.state().questionIndex, 1);
assert.throws(() => game.chooseReward(ada.id, 0, 1), /stale_question/);
const xpBefore = game.playerResult(ada.id).xp;
game.answer(ada.id, { ...request, questionIndex: 1, optionIndex: 0, idempotencyKey: "wrong" });
assert.equal(game.playerResult(ada.id).questionXp, 10);
assert.equal(game.playerResult(ada.id).xp, xpBefore + 10);
assert.equal(game.playerResult(ada.id).questionScore, 0);
assert.equal(game.playerResult(ada.id).reward, undefined);
assert.equal(game.playerResult(ada.id).correct, false);
game.answer(ada.id, { ...request, questionIndex: 1, optionIndex: 0, idempotencyKey: "wrong" });
assert.equal(game.playerResult(ada.id).xp, xpBefore + 10);
clock += 1000; game.command({ type: "pause" });
clock += 5000; game.tick();
assert.equal(game.state().phase, "paused");
game.command({ type: "resume" });
assert.equal(game.state().question!.deadlineAt - clock, 19000);
clock = game.state().question!.deadlineAt;
assert.equal(game.answer(ben.id, { ...request, questionIndex: 1, idempotencyKey: "late" }).reason, "deadline_passed");
game.tick(); assert.equal(game.state().phase, "reveal");
clock += 2000; game.tick(); assert.equal(game.state().phase, "ended");
const adaAnswers = game.answerBreakdown(ada.id);
assert.equal(adaAnswers.length, 2);
assert.deepEqual(adaAnswers.map(answer => ({ selectedAnswer: answer.selectedAnswer, correct: answer.correct })), [{ selectedAnswer: "4", correct: true }, { selectedAnswer: "3", correct: false }]);
assert.equal(game.answerBreakdown(ben.id)[1]!.answered, false);
const { timeLimitMs, ...untimed } = snapshot.questions[0]!;
assert.equal(ApprovedQuestion.parse(untimed).timeLimitMs, 10000);
// Every possible hidden position has exactly two points choices and one Hack.
for (let hidden = 0; hidden < 3; hidden++) {
  for (let choice = 0; choice < 3; choice++) {
    const trial = new AuthoritativeSession("TRIAL1", rounds, () => 1000, () => hidden);
    const p = trial.join("Player"); trial.join("Target"); trial.command({ type: "start" });
    trial.answer(p.id, request);
    assert.equal(trial.chooseReward(p.id, 0, choice).reward?.kind, hidden === choice ? "hack" : "points");
  }
}
console.log("reward, XP, timer and automatic progression tests passed");

// A last-second correct answer still gets a full, visible reward window.
let rewardClock = 1000;
const lastSecond = new AuthoritativeSession("LAST01", snapshot, () => rewardClock, () => 2);
const lastPlayer = lastSecond.join("Late learner");
lastSecond.join("Target");
lastSecond.command({ type: "start" });
rewardClock = 1999;
lastSecond.answer(lastPlayer.id, request);
rewardClock = 2000; lastSecond.tick();
assert.equal(lastSecond.state().phase, "question");
assert.equal(lastSecond.playerResult(lastPlayer.id).reward?.deadlineAt, 16999);
assert.equal(lastSecond.chooseReward(lastPlayer.id, 0, 2).reward?.kind, "hack");
rewardClock = 3000;
assert.equal(lastSecond.chooseReward(lastPlayer.id, 0, undefined, [...lastSecond.players.keys()][1]).reward?.completed, true);
lastSecond.tick(); assert.equal(lastSecond.state().phase, "reveal");
console.log("last-second reward selection passed");

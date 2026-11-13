import assert from "node:assert/strict";
import { catHtmlHash, meanOfNumbers, parseCatScoreInput, shuffledOrders } from "../src/lib/cat-evaluation.ts";
import { CAT_RUBRIC } from "../src/lib/cat-rubric.ts";
import { catReviewerEmailForNumber, catReviewerCodeForNumber } from "../src/lib/cat-login.ts";

assert.equal(catReviewerEmailForNumber("1"), "cat-reviewer-1@vibeclassroom.invalid");
assert.equal(catReviewerEmailForNumber(5), "cat-reviewer-5@vibeclassroom.invalid");
assert.equal(catReviewerCodeForNumber("3"), "R03");
assert.throws(() => catReviewerEmailForNumber("6"), /1–5/);
assert.throws(() => catReviewerEmailForNumber("1@x.com"), /1–5/);

const valid = { overall_creativity: 5, originality: 3, design_appropriateness: 2, elaboration_coherence: 1, playability: "playable", note: "有明确规则" };
assert.deepEqual(parseCatScoreInput(valid, true), valid);
const overallOnly = { overall_creativity: 4, originality: null, design_appropriateness: null, elaboration_coherence: null, playability: "playable", note: "玩法与主题有自己的组合" };
assert.deepEqual(parseCatScoreInput(overallOnly, true), overallOnly);
assert.throws(() => parseCatScoreInput({ ...overallOnly, playability: null }, true), /试玩状态/);
assert.equal(parseCatScoreInput({ ...valid, originality: 0, design_appropriateness: 0, elaboration_coherence: 0 }, true).overall_creativity, 5);
assert.throws(() => parseCatScoreInput({ ...valid, overall_creativity: 0 }, true), /总体创造力/);
assert.throws(() => parseCatScoreInput({ ...valid, originality: 4 }, true), /新颖性/);
assert.throws(() => parseCatScoreInput({ ...valid, playability: "unavailable" }, true), /不得填分数/);
assert.throws(() => parseCatScoreInput({ ...valid, overall_creativity: null }, true), /正式提交前/);
const unavailable = { overall_creativity: null, originality: null, design_appropriateness: null, elaboration_coherence: null, playability: "unavailable", note: "文件损坏" };
assert.deepEqual(parseCatScoreInput(unavailable, true), unavailable);
assert.equal(meanOfNumbers([1, null, 5]), 3);
assert.equal(meanOfNumbers([null, undefined]), null);
assert.equal(catHtmlHash("<html>test</html>"), "bc7c8fc96a25bf6ff242fc73cce18291deac4505886b017220a151d0d8192d36");
assert.deepEqual(shuffledOrders([1]), [1]);
assert.deepEqual(CAT_RUBRIC.map((field) => field.anchors.map((anchor) => anchor.value)), [[1, 2, 3, 4, 5], [0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]]);
console.log("CAT validation tests passed");

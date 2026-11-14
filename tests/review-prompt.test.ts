import { test } from "node:test";
import assert from "node:assert/strict";
import { decode, defaults } from "../src/save/save.ts";
import { decodeReview, finishReview, pressReview, reviewDue } from "../src/review-prompt.ts";

test("the review button shows once a new tower opens, until it is pressed", () => {
  const review = defaults().review;
  assert.equal(reviewDue(review, 1), false, "Tower I alone: not yet");
  assert.equal(reviewDue(review, 2), true, "Tower II opened");
  pressReview(review, 2);
  assert.equal(reviewDue(review, 2), false, "pressed: gone, whatever was chosen");
  assert.equal(reviewDue(review, 3), true, "Later: back once the next tower opens");
});

test("Review or Never retires the button for good", () => {
  const review = defaults().review;
  pressReview(review, 2);
  finishReview(review);
  assert.equal(reviewDue(review, 9), false);
});

test("the review button's state saves, and a bad one reads as new", () => {
  const save = defaults();
  pressReview(save.review, 4);
  finishReview(save.review);
  assert.deepEqual(decode(JSON.stringify(save)).review, { pressedAt: 4, done: true });
  assert.deepEqual(decodeReview({ pressedAt: 40, done: "yes" }), { pressedAt: 1, done: false });
  assert.deepEqual(decodeReview(undefined), { pressedAt: 1, done: false });
});

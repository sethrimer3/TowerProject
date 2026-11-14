import { isRecord, wholeIn } from "./save/decode.ts";
import { TIERS } from "./tiers.ts";

/** The Review Prompt: once a new tower opens, the forest shows a Play Store
 * button inviting the player to rate the game, every time they are in the
 * forest, until it is pressed. Its dialog offers Review (the store's page),
 * Later (the button comes back once the next tower opens) and Never.
 * TODO: PLAY_STORE_URL is a placeholder until the game's Play Store listing
 * exists; set it to the listing's real address (see the GitHub issue "Set the
 * Play Store review link"). */
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=TODO";

/** What the save keeps of the Review Prompt: the towers open when its button
 * was last pressed (1, none yet), and whether the player chose Review or
 * Never, after which it never shows again. */
export type ReviewSave = { pressedAt: number; done: boolean };
export const defaultReview = (): ReviewSave => ({ pressedAt: 1, done: false });
export function decodeReview(v: unknown): ReviewSave {
  const d = defaultReview();
  if (!isRecord(v)) return d;
  if (wholeIn(v.pressedAt, 1, TIERS)) d.pressedAt = v.pressedAt as number;
  d.done = v.done === true;
  return d;
}

/** Whether the forest shows the review button, with `towersOpen` towers
 * open: a tower opened since it was last pressed, and Review or Never not
 * chosen. */
export const reviewDue = (review: ReviewSave, towersOpen: number) => !review.done && towersOpen > review.pressedAt;

/** The button pressed: it stays away until another tower opens, whatever
 * is chosen (closing the dialog is Later). */
export function pressReview(review: ReviewSave, towersOpen: number) {
  review.pressedAt = Math.max(review.pressedAt, Math.min(TIERS, towersOpen));
}
/** Review (the store's page opened) or Never chosen: it never shows again. */
export function finishReview(review: ReviewSave) {
  review.done = true;
}

import { finishReview, PLAY_STORE_URL, pressReview } from "../review-prompt.ts";
import type { AppContext } from "./app.ts";
import { controlIcon } from "./control-icon.ts";
import { closesOnBackdrop } from "./dialogs.ts";
import { el } from "./dom.ts";

/** The forest's review button pressed: it goes away until the next tower
 * opens, and the dialog asks for a review under five stars. Review opens
 * the Play Store page and Never retires the button for good; Later, or
 * closing the dialog, leaves it to come back. `saved` runs once the save
 * has changed. */
export function showReviewPrompt(ctx: AppContext, saved: () => void) {
  const save = ctx.game.save, modal = ctx.modal;
  pressReview(save.review, save.tower.tiersOpen);
  saved();
  const stars = Array.from({ length: 5 }, () => controlIcon("star", undefined, "review-star")).join("");
  modal.innerHTML = `<div class="review-stars" aria-hidden="true">${stars}</div><h2>Enjoying the game? Post a review!</h2><div class="dialog-actions review-actions"><button id="review-never">Never</button><button id="review-later">Later</button><button id="review-go">Review</button></div>`;
  modal.showModal();
  closesOnBackdrop(modal);
  el("review-later").onclick = () => modal.close();
  el("review-never").onclick = () => {
    finishReview(save.review);
    saved();
    modal.close();
  };
  el("review-go").onclick = () => {
    finishReview(save.review);
    saved();
    modal.close();
    window.open(PLAY_STORE_URL, "_blank", "noopener");
  };
}

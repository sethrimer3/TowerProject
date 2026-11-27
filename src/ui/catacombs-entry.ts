import type { AppContext } from "./app.ts";
import { confirmAction } from "./dialogs.ts";
import { el } from "./dom.ts";
import { tierNumeral } from "../tiers.ts";

/** The Mausoleum, tapped: enters the Catacomb of the tower the forest
 * shows. A run of another number past Hall 1 starts over there, so that
 * asks first. */
export function enterFromMausoleum(ctx: AppContext) {
  const desk = ctx.game.catacombs, number = ctx.game.save.tower.tier, leave = desk.wouldLeave(number);
  const go = () => {
    if (desk.enter(number)) showCatacombs(ctx);
  };
  if (!leave) return go();
  confirmAction(ctx, {
    title: `Enter Catacomb ${tierNumeral(number)}?`,
    body: `Your run in Catacomb ${tierNumeral(leave.number)} is on Hall ${leave.hall.toLocaleString("en-US")}. Entering Catacomb ${tierNumeral(number)} starts a new run at Hall 1. You keep what you have earned.`,
    label: "Enter", cancel: "Stay",
  }, go);
}

/** Shows the Catacomb run under way. A stand-in until the Catacomb screen
 * (docs/CATACOMBS.md, step 4): its number and hall. */
export function showCatacombs(ctx: AppContext) {
  const desk = ctx.game.catacombs, run = desk.run;
  if (!run) return;
  const modal = ctx.modal;
  modal.innerHTML = `<small>THE CATACOMBS</small><h2>Catacomb ${tierNumeral(desk.number)}</h2>` +
    `<p>Hall ${run.hall.toLocaleString("en-US")}.</p><p class="hint">The Magician waits at the entrance. The Catacomb screen opens in a later update.</p>` +
    `<div class="dialog-actions"><button id="catacombs-ok">Back</button></div>`;
  modal.showModal();
  el("catacombs-ok").onclick = () => modal.close();
}

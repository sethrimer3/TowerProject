import type { AppContext } from "./app.ts";
import { confirmAction } from "./dialogs.ts";
import { tierNumeral } from "../tiers.ts";

/** The Mausoleum, tapped: enters the Catacomb of the tower the forest
 * shows. A run of another number past Hall 1 starts over there, so that
 * asks first. */
export function enterFromMausoleum(ctx: AppContext, show: () => void) {
  const desk = ctx.game.catacombs, number = ctx.game.save.tower.tier, leave = desk.wouldLeave(number);
  const go = () => {
    if (desk.enter(number)) show();
  };
  if (!leave) return go();
  confirmAction(ctx, {
    title: `Enter Catacomb ${tierNumeral(number)}?`,
    body: `Your run in Catacomb ${tierNumeral(leave.number)} is on Hall ${leave.hall.toLocaleString("en-US")}. Entering Catacomb ${tierNumeral(number)} starts a new run at Hall 1. You keep what you have earned.`,
    label: "Enter", cancel: "Stay",
  }, go);
}

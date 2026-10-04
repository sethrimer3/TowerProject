import type { NoticeTree, Save } from "../entities.ts";
import { MODES } from "../modes.ts";
import { CLEARED_INSPIRATION } from "../tower/area-ledger.ts";

// The Inspiration and Courage trees' help (their heading's ? button): how
// a run earns the tree's currency. The slower rates past floor 100 and
// 1,000 are told once the player has climbed that far.

/** The most equivalent floors completed in the tree's mode, in any tier. */
function furthest(save: Save, tree: NoticeTree) {
  const mode = tree === "inspiration" ? "tower" : "delve", slice = save[mode];
  const best = Math.max(slice.best, ...Object.values(slice.tierRecords).map((r) => r.best));
  return MODES[mode].equivalentFloor(best);
}

/** The help dialog's title and body for `tree`. */
export function currencyHelp(save: Save, tree: NoticeTree) {
  const far = furthest(save, tree);
  const tower = tree === "inspiration";
  const p = (text: string) => `<p>${text}</p>`;
  const body = tower
    ? p("Climb past your highest floor to earn Inspiration: +1 for each new floor you complete, paid as you climb its stairs.") +
      p(`Clear every enemy from an area of ten floors (1–10, 11–20 …) for +${CLEARED_INSPIRATION} more, once per area in each tower.`)
    : p("Delve deeper than ever before to earn Courage: +1 at each new 10 depth, paid as you reach it.");
  const later = [
    far >= 100 ? (tower ? "Past floor 100, a point takes 10 new floors." : "Past depth 1,000, a point takes 100 new depth.") : "",
    far >= 1000 ? (tower ? "Past floor 1,000, a point takes 100 new floors, up to floor 10,000." : "Past depth 10,000, a point takes 1,000 new depth, up to depth 100,000.") : "",
  ].filter(Boolean).map(p).join("");
  const record = tower ? "Ground you have climbed before never pays again, so beat your record to earn more." : "Depths you have reached before never pay again, so beat your record to earn more.";
  return { title: tower ? "Earning Inspiration" : "Earning Courage", body: body + later + `<p class="hint">${record}</p>` };
}

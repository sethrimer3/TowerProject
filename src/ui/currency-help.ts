import type { NoticeTree, Save } from "../save/shape.ts";
import { MODES } from "../modes.ts";

// The Inspiration and Breakthrough trees' help (their heading's ? button):
// how each currency is earned. Inspiration's slower rates past floor 100
// and 1,000 are told once the player has climbed that far.

/** The most floors completed in the Tower, in any tier. */
function furthest(save: Save) {
  const slice = save.tower;
  return MODES.tower.equivalentFloor(Math.max(slice.best, ...Object.values(slice.tierRecords).map((r) => r.best)));
}

/** The help dialog's title and body for `tree`. */
export function currencyHelp(save: Save, tree: NoticeTree) {
  const p = (text: string) => `<p>${text}</p>`;
  if (tree === "breakthrough")
    return {
      title: "Earning Breakthrough",
      body: p("Claim a Tower Goal to earn a Breakthrough point: +1 for each Goal's reward you claim.") +
        `<p class="hint">Spend them on breakthroughs: each unlocks a new limit for you to reach. Premium rewards pay no Breakthrough points.</p>`,
    };
  const far = furthest(save);
  const body = p("Climb past your highest floor to earn Inspiration: +1 for each new floor you complete, paid as you climb its stairs.") +
    p("Clear every enemy from an area of ten floors (1–10, 11–20 …) to earn its floors' Inspiration again, once per area in each tower.");
  const later = [far >= 100 ? "Past floor 100, a point takes 10 new floors." : "", far >= 1000 ? "Past floor 1,000, a point takes 100 new floors, up to floor 10,000." : ""]
    .filter(Boolean).map(p).join("");
  return { title: "Earning Inspiration", body: body + later + `<p class="hint">Ground you have climbed before never pays again, so beat your record to earn more.</p>` };
}

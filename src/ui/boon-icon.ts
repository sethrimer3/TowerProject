import { boon, type BoonId } from "../shrines.ts";
import { BOON_SPRITES } from "../sprites/boons.ts";
import { ARCANUM_ICONS } from "./arcana-panel.ts";
import { arcaniteIcon } from "./dom.ts";
import { kitIcon } from "../sprites/kit.ts";

/** Icons supplement live boon descriptions only in the loaded PNG look.
 * With another theme, Sprites off or a failed request, the original text
 * layout has no empty icon space. An augment boon wears its arcanum's picture. */
export function boonIcon(id: BoonId) {
  const def = boon(id);
  if (def.kind === "augment") return ARCANUM_ICONS[def.arcanum];
  return id === "unlockArcanum" ? arcaniteIcon("arcanite-icon boon-icon") : kitIcon(BOON_SPRITES[id as keyof typeof BOON_SPRITES], "", "boon-icon");
}

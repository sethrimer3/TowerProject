import type { BoonId } from "../shrines.ts";
import { BOON_SPRITES } from "../sprites/boons.ts";
import { kitIcon } from "../sprites/kit.ts";

/** Icons supplement live boon descriptions only in the loaded PNG look.
 * With another theme, Sprites off or a failed request, the original text
 * layout has no empty icon space. */
export const boonIcon = (id: BoonId) => kitIcon(BOON_SPRITES[id], "", "boon-icon");

// Whether the Catacombs are open (docs/CATACOMBS.md): the Inspiration skill
// Reveal Catacombs owned, which the Tower VI floor 20 Goal reveals, or
// Access to Everything on.
import { seesAll } from "../access.ts";
import type { Save } from "../save/shape.ts";

export const catacombsOpen = (save: Pick<Save, "upgrades" | "settings">) => save.upgrades.catacombs > 0 || seesAll(save);

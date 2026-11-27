// Seeds every one of a CatacombSave's saved streams (catacombs/state.ts), so
// a test's or tool's draws are its own and repeat on every run.
import type { CatacombSave } from "../src/catacombs/state.ts";

export const seedAll = (c: CatacombSave, seed: number) => {
  c.rng = { spawns: seed, drops: seed + 1, crits: seed + 2, crosshairs: seed + 3, potions: seed + 4 };
};

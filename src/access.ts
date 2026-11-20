import { TIERS } from "./tiers.ts";
import type { Mode } from "./entities.ts";
import type { ModeSave, Save } from "./save/shape.ts";

/** Access to Everything (the Dev `accessAll` setting): while it is on, the
 * guards that keep towers, Warp's floors, themes, pages, skill trees and
 * their hidden skills, Archives projects and Settings rows out of reach
 * until they are unlocked let the player through to see them.
 * It grants and saves nothing: buying, claiming and earning keep their own
 * guards, and turning it off leaves the profile as it was. */
export const seesAll = (save: { settings: Pick<Save["settings"], "accessAll"> }) => save.settings.accessAll;

/** The highest tier of `mode` the player may visit: every one while
 * Access to Everything is on, else those opened. */
export const tiersReachable = (save: { settings: Pick<Save["settings"], "accessAll"> } & Record<Mode, Pick<ModeSave, "tiersOpen">>, mode: Mode) =>
  seesAll(save) ? TIERS : save[mode].tiersOpen;

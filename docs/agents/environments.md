# Floor Environments

Environments (`src/environments.ts`) are rules a whole floor (in the Delve, each equivalent floor) may be given, each at its own chance: today Treasure Floor and Golden Floor.
`ENVIRONMENTS` holds each one's name, salt and the run's chance (`chance(run)`), in the order the enemy stats box lists them; a new environment is one row there, its run field, and the code its rule reaches.
`environmentOn(id, seed, floor, chance)` compares the floor's own fixed number (`tileRandom(floor, 0, seed ^ salt)`) with the chance, so a floor has its environments from the moment it is generated, a higher chance only ever adds floors, and the environments roll apart and overlap freely; `hasEnvironment(run, id, floor)` reads the run's chance, and `possibleEnvironments(run)` lists those with one above none.
Floors are numbered from 1 as `Game.floorOf(x, y)` numbers a tile's: the Tower's `run.height + 1`, the Delve's `depth / 10 + 1`.

Each chance is fixed as the run goes inside (`Game.dealHand`, both modes) and saved in the run: `run.treasureFloor` (CHEST's tree) and `run.goldenFloor` (Golden Floor Chance research, whose target `goldenFloorChance` counts tenths of a percent, once the Breakthrough skill `goldenFloors` is owned), so a floor never changes under the run and undo can't change it.

**Treasure Floor** changes generation: `withTreasureFloors` in `board.ts` (through `isTreasureFloor`, the environment's roll, salt unchanged) makes a Treasure Floor's shards and potions treasure chests in `RoomWorld`'s constructor and the Delve `World`'s `chunk` (see hand-and-automation.md).

**Golden Floor** changes no tiles, only Gold and drawing.
`RunPurse` takes the tile's floor (`floorOf`, passed by `Game.purse`) and `golden(floor)` is Golden Floor Multiplier research (`goldenFloorMultiplier`, in tenths, from ×2) on a Golden Floor, else 1, read when the Gold is paid so a level finished mid-run counts at once.
`RunPurse.gold(found, golden)` hands it to `goldBanked` as `GoldContext.golden`, one factor among the Gold multipliers, so each find is multiplied once: kills, chests (Double and Triple included), Pickup Gold and the previews by the find's tile, Gold Touch and smelts by the hero's, Spare Change by the floor reached (`floorGold(key, reached)`) and Floor Skip Reward by the floor skipped.
End-of-run Gold has no floor and isn't multiplied.
`Game.goldContext` passes the hero's floor's factor once `goldenFloors` is owned, so the All Gold Bonuses box and the HUD's total show a Golden Floor line (Inactive off one).

The board draws a Golden Floor through `BoardLook.golden` (`Game.goldenAt`: a Delve wall, which has no floor, is golden beside a Golden Floor's open ground).
Classic gilds the open ground as `paintGround` bakes it (`gild` with `GOLDEN_GROUND` in `tile-painters.ts`: a `color` blend, then a screen lift), so the ground cache's key carries `run.goldenFloor`.
The Game themes gild after their `ground` (`drawThemedBoard`), each by its own `GoldenLook` in `GOLDEN_LOOKS` (`themed-boards.ts`): the ground on boards whose ground has hue, the walls (their lines and glyphs dodged gold, or light walls multiplied) on boards whose ground is black or without hue.
Gold is kept for Golden Floors; the Amber Catacombs biome (Tower floors 20 to 29 of each hundred, and one Delve region theme) is the nearest colour already in use, brown-amber.

The enemy stats box (`ui/enemy-odds-box.ts`) adds an Environments table from `Game.floorEnvironments` once any chance is above none, its key redrawing it as the hero's floor changes.

Tests: `tests/environments.test.ts` (the rolls, the research, the chance fixed per run, Gold multiplied once on and never off a Golden Floor, the Gold bonuses line, the box's rows, which tiles are drawn golden); the render goldens' `goldenTower` and `goldenDelve` scenes, appended after the trial's jobs.

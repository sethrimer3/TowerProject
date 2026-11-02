# Floor Environments

Environments (`src/environments.ts`) are rules a whole floor (in the Delve, each equivalent floor) may be given, each at its own chance: today Treasure Floor, Golden Floor and Stellar Floor.
`ENVIRONMENTS` holds each one's name, salt and the run's chance (`chance(run)`), in the order the enemy stats box lists them; a new environment is one row there, its run field, and the code its rule reaches.
`environmentOn(id, seed, floor, chance)` compares the floor's own fixed number (`tileRandom(floor, 0, seed ^ salt)`) with the chance, so a floor has its environments from the moment it is generated, a higher chance only ever adds floors, and the environments roll apart and overlap freely; `hasEnvironment(run, id, floor)` reads the run's chance, and `possibleEnvironments(run)` lists those with one above none.
Floors are numbered from 1 as `Game.floorOf(x, y)` numbers a tile's: the Tower's `run.height + 1`, the Delve's `depth / 10 + 1`.

What a run's own trees and research give is fixed as it goes inside (`Game.dealHand`, both modes) and saved in the run: `run.treasureFloor` (CHEST's tree) and `run.goldenFloor` (Golden Floor Chance research, whose target `goldenFloorChance` counts tenths of a percent, once the Breakthrough skill `goldenFloors` is owned), so undo can't change it.
**Aurum Bloom** (`docs/agents/arcana.md`) adds to the Golden Floor's chance and gives the Stellar Floor's, and isn't saved in the run: `withBloom(run, bloom)` adds `ArcanaDesk.aurumBloom()` as the chances are read (`Game.environments`, and `RunPurse` by its `bloom`).
So switching it, a level bought mid-run or a Shrine lending it counts at once, and since its levels, its switch and the loan all outlive undo, undo can't change these either.
Read chances from `Game.environments` or the purse, never `run.goldenFloor` alone.

**Treasure Floor** changes generation: `withTreasureFloors` in `board.ts` (through `isTreasureFloor`, the environment's roll, salt unchanged) makes a Treasure Floor's shards and potions treasure chests in `RoomWorld`'s constructor and the Delve `World`'s `chunk` (see hand-and-automation.md).

**Golden Floor** and **Stellar Floor** change no tiles, only Gold, Silver and drawing.
`RunPurse` takes the tile's floor (`floorOf`, passed by `Game.purse`).
`golden(floor)` on a Golden Floor starts from ×1: the `goldenFloors` skill makes that Golden Floor Multiplier research (`goldenFloorMultiplier`, in tenths, from ×2), and Aurum Bloom adds its Bonus less the shared 1 (×5 alone, ×6 with the skill), and its augment boon's `FloorBloom.golden` multiplies all of that (×7.5 alone, ×9 with the skill); off one it is 1. It is read when the Gold is paid so a level finished mid-run counts at once; `stellar(floor)` is `STELLAR_FACTOR` (×10) on a Stellar Floor, else 1.
Together they are a floor's `FloorPay` (`floorPay`, `payAt`, `payHere`), and on a floor with both they multiply.
`RunPurse.gold(found, pay)` hands it to `goldBanked` as `GoldContext.golden` and `stellar`, factors among the Gold multipliers, so each find is multiplied once: kills, chests (Double and Triple included), Pickup Gold and the previews by the find's tile, Gold Touch and smelts by the hero's, Spare Change by the floor reached (`floorGold(key, reached)`) and Floor Skip Reward by the floor skipped.
`RunPurse.silver(base, pay)` multiplies Silver alike: kills (`killSilver`'s `at`), chests, doors and pickups by the find's tile (`silverAt`), Silver Touch and smelts by the hero's (`silverHere`), Wishing Well and Interest by the floor reached (`floorSilver(reached)`, `interest(reached)`).
Interest stops at Max Interest before Gold Bonus and the environments multiply it, and the Events' full-Interest check reads `maxInterest(reached)` for that.
End-of-run Gold and Warp Loot's Silver have no floor and aren't multiplied.
`Game.goldContext` passes the hero's floor's factors, so the All Gold Bonuses box and the HUD's total show a Golden Floor line once `goldenFloors` or Aurum Bloom is owned and a Stellar Floor line with Aurum Bloom (Inactive off one).

The board draws a Golden Floor through `BoardLook.golden` (`Game.goldenAt`: a Delve wall, which has no floor, is golden beside a Golden Floor's open ground).
Classic gilds the open ground as `paintGround` bakes it (`gild` with `GOLDEN_GROUND` in `tile-painters.ts`: a `color` blend, then a screen lift), so the ground cache's key carries `run.goldenFloor`.
The Game themes gild after their `ground` (`drawThemedBoard`), each by its own `GoldenLook` in `GOLDEN_LOOKS` (`themed-boards.ts`): the ground on boards whose ground has hue, the walls (their lines and glyphs dodged gold, or light walls multiplied) on boards whose ground is black or without hue.
Gold is kept for Golden Floors; the Amber Catacombs biome (Tower floors 20 to 29 of each hundred, and one Delve region theme) is the nearest colour already in use, brown-amber.

The board draws a Stellar Floor by `drawStellarStars` (`render/stellar-stars.ts`), called from `Renderer.drawOverlays` with `Game.stellarAt` (which treats a Delve wall as `goldenAt` does), so it is the same in every Game theme: after the shields, marks and the Gem, over the hero and enemies, and before the volley, popups and every other effect.
`starAt(x, y, now)` works each star out from its tile and the clock, with no state and only `tileRandom`, so a star stays put as the camera moves, none draws on any stream, and a fixed clock draws the same frame.
Each tile starts one star every `STAR_CYCLE_MS`, in its own phase; it lives 1 to 2 seconds at a spot rolled for that cycle, its reach a sine from a point to a point, turning `TURN_PER_MS`.
`starHue` is one hue for every star, from the clock.
With Reduce Motion the stars hold still at clock 0 while the hue still turns.

The enemy stats box (`ui/enemy-odds-box.ts`) adds an Environments table from `Game.floorEnvironments` once any chance is above none, its key redrawing it as the hero's floor changes.

Tests: `tests/environments.test.ts` (the rolls, the research, the chance fixed per run, Gold multiplied once on and never off a Golden Floor, the Gold bonuses line, the box's rows, which tiles are drawn golden); `tests/aurum-bloom.test.ts` (Silver on these floors, the two multiplying, Aurum Bloom's chances, the stars); the render goldens' `goldenTower`, `goldenDelve`, `stellarTower` and `stellarDelve` scenes, appended after the trial's jobs.

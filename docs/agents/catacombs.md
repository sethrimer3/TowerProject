# Catacombs

The Catacombs' engine (`src/catacombs/`), an idle side area where the hero, as a Magician, fights undead a turn a second.
The design and build plan is `docs/CATACOMBS.md`; this doc covers what is built.

Built so far: step 1, the engine; step 2, the unlock and the save; step 3, the Mausoleum and the Catacomb button.
The engine is pure and knows nothing of the DOM, `Game`, the board drawing or the clock: the game layer (step 3 on) passes it the wall clock, runs the turns it returns, and credits the Lore it reports.
No game code takes turns yet: entering shows a stand-in dialog until the Catacomb screen (step 4).

## Unlock and save

- Tower VI's floor 20 Goal, Catacombs (`GoalUnlock` `catacombs`), reveals the Inspiration skill Reveal Catacombs (`catacombs`, 40 Inspiration; the node's `revealGoal`, progression.md).
- `open.ts`: `catacombsOpen(save)`, the skill owned or Access to Everything on.
- `save.catacombs` is a `CatacombSave`: `defaultCatacombs()` in `defaults()`, `decodeCatacombs` in `decode()`; the profile file keeps it in `towers` with its run cleared (`exportProfile`).

## The way in

- `OutsideWorld`'s seventh flag, `mausoleum` (set by `Game.forestWorld` from `catacombsOpen`; the Tower's forest only), raises the Mausoleum at `MAUSOLEUM` (`outside.ts`: by the entrance column, `dx` 7, rows 1 to 3, a 3 × 3 block of walls) in a yard one tile wider that the trees and grass leave clear (`forestProtected`, `Roads.mausoleum` in the grass's cache key, the cloud shadows' key).
  `drawMausoleum` draws it in pixels until its PNG is made; `Renderer` draws it after the Tournament Hall.
- `Game.atMausoleum(x, y)` is what `BoardOverlay`'s tap tests (its sixth callback); `Game.reshapeForest()` rebuilds the forest when a building opens, which the Upgrades page calls on buying Reveal Catacombs.
- `game/catacomb-desk.ts`: `CatacombDesk` (`game.catacombs`): `open`, `run`, `number`, `wouldLeave(number)` (the number and hall a run of another number past Hall 1 would leave) and `enter(number)` (refused while shut).
- `ui/catacombs-entry.ts`: `enterFromMausoleum` enters the forest's `save.tower.tier`, confirming first when `wouldLeave` says so; `showCatacombs` is the stand-in for the Catacomb screen.
- The menu's `#catacombs-button` (`ui/shell.ts`) shows once the Catacombs are open and a run exists (`renderRunMenu`); a Proving Grounds trial's cloned save has no Catacomb run (`TrialSession`), so it never shows there.

## Modules

- `catalog.ts`: the data.
  `UNDEAD` (Wisp to Demon, each its rarity, MHP, MAtk, MDef, MXP and first hall; the Demon's `from` is null, future content), `SPIRIT_RARITIES` (common to ancestral, its own list, though it matches `RarityId`), `INGOTS` and `INGOT_EVERY`, `STRENGTHS` (normal, strong ×1.25, elite ×1.5, boss MHP ×3.5, MAtk ×1.3, MDef ×1; rewards ×1, ×2, ×4, ×10), `hallStrength` (a hall's final enemy: Boss every 25th, else Elite every 10th, else Strong every 5th), `DEEP_HALLS` and `deepFactors` (MHP and MDef compounding from the hall after each listed one), `spawnOdds` (the placeholder Wisp 30%, Ghost 15% a slot, gated by each type's first hall), `undeadStats` (base × `tierStats(number)` × strength × deep halls, on the `snap` grid), `undeadRewards`, and the Lore tile's amount (`loreOnTile`: `tierGold(number, LORE_PER_TILE)`, 1 before the bonus).
- `hall.ts`: a hall's 17 × 17 layout.
  `hallCell(hall, x, y)` is what a tile is before anyone acts (the corridor rows 7 to 9, every slot's column walled above and below, the treasure rooms of `ROOMS` on halls that have them, each Ingot and torch); `hallTargets(hall, number, slots)` lists the hero's targets in order (E1 to E3, the Lore, the Ingots brass, steel, iron, nickel, E4 to E6, the stairs; empty and beaten slots left out); `rollSlots(hall, number, rng)` rolls the six slots, one draw each, the final slot of a ranked hall a second draw weighted among the open types, and one Wisp on the last slot of a hall that rolled none; `ingotAmount` is its nth room times the number.
  The `Board` that draws a hall comes with the Catacomb screen (step 4).
- `magic.ts`: Magic levels and stats.
  `mxpToNext(level)` is 200 × 1.2^(level − 1), rounded, its powers multiplied out in order; `mxpForLevel` totals them (level 2 at 200, 3 at 440); `magicLevel`, `pointsEarned` (a point a level past the first); `MAGIC_STATS` (Force +2 MAtk, Ward +1 MDef, Vitality +100 MHP a point), `HERO_BASE` (1,000 MHP, 10 MAtk, 0 MDef), `heroStats`, and `movePoint` (never below 0 in a box, never past the points earned).
- `state.ts`: `CatacombSave` and `CatacombRun`, `defaultCatacombs`, the saved spawn stream (`drawing`: seeded once from `stream("catacombs")`, its state stored after each draw, as the missions' and gifts' are), `enterHall`, `startRun` and `enterCatacomb` (the same number keeps the run, another starts Hall 1 there).
- `turn.ts`: `catacombTurn(c, gains)` takes one turn: a restart if the hero fell; else, by the next target, a descent (the stairs: the next hall rolled, the hero at its entrance with the MHP it had), a pickup (Lore into `gains.lore`, Ingots into the save), a dash (to the tile left of the next enemy) or a round (the hero strikes first, `max(0, MAtk − MDef)`; a beaten enemy pays MXP and Spirit and answers nothing; else it strikes back, and 0 MHP marks the run `fell`).
  Neither side able to hurt the other restarts the run that same turn.
  MHP is capped at the current maximum at the start of each turn, so moved points apply on the next turn and taking Vitality back never heals.
  A kill empties its slot, so the run's `target` index (every earlier target done) already points at the next target.
  `runTurns(c, n)` takes `n` turns across however many runs and sums their gains.
- `clock.ts`: `tick(clock, now, carry)` returns the turns due: a whole second gone is a real turn; a gap over `BANK_GAP_MS` (10 s, the app closed or the tab hidden) banks its whole seconds instead, which is how offline time reaches the bank; at ×N each second also owes N − 1 hasted turns (`HasteCarry`, not saved, carries the fraction), paid from the bank, and what the bank can't pay drops the haste to ×1 (`slowed`).
  `setHaste` refuses haste with nothing banked; `offlineSeconds` is what the next tick will bank, for the Offline dialog.
- `save.ts`: `decodeCatacombs`, reading every field through the shared readers; a run that doesn't fit its hall (wrong slots, a target past the hall's last) is dropped, and points spent past those earned are all handed back.
- `open.ts`: `catacombsOpen`.
- `index.ts` re-exports them.

## Rules

- Everything the engine decides is saved or played by, so it uses only `+ - * /` and `Math.round`: no `Math.pow` or `**`, no draws in a sort.
  `tests/engine-independence.test.ts` fingerprints its halls, stats, levels and a 3,000-turn run, and scans `src/catacombs/` for `**`.
- Spawns draw only from the saved spawn stream, and a hall is rolled once, as the hero arrives, so a reload never rerolls it.
- The engine credits only what the Catacombs keep (MXP, Spirit, Ingots, best halls); Lore belongs to `save.cells` and is reported for the caller to credit with `earn`.

## Tests

`tests/catacombs-engine.test.ts`: the corridor and its pinches, the rooms by hall and their reach, Ingot amounts, target order, strength precedence, the deep halls' products, enemy stats and rewards, spawn odds and the lone Wisp, the saved stream, entering, dash and rounds, Ingot pickups, an invincible enemy to a fall and the restart that keeps what was earned, the stalemate restart, Magic levels, moving points, `runTurns` across runs, the clock and haste, decoding, and the save and profile file keeping it (the run left out of the file).
`tests/catacombs-forest.test.ts` covers the Mausoleum (its tiles, yard, mode and flag), buying the skill raising it, entering by the forest's tower number, `wouldLeave`, and Access to Everything; `tests/forest-sprites.test.ts` keeps the foliage off it.
`tests/skill-trees.test.ts` covers Reveal Catacombs: hidden and unbuyable until the Goal is claimed, then 40 Inspiration.

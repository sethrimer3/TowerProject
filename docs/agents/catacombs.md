# Catacombs

The Catacombs' engine (`src/catacombs/`), an idle side area where the hero, as a Magician, fights undead a turn a second.
The design and build plan is `docs/CATACOMBS.md`; this doc covers what is built.

Built so far: step 1, the engine; step 2, the unlock and the save; step 3, the Mausoleum and the Catacomb button; step 4, the Catacomb screen; step 5, its Stats menu; step 6, the time away and the currencies table.
The engine is pure and knows nothing of the DOM, `Game`, the board drawing or the clock: the game layer (step 3 on) passes it the wall clock, runs the turns it returns, and credits the Lore it reports.
The screen (`ui/catacomb-view.ts`) runs the engine on the wall clock and credits the Lore it reports.

## Unlock and save

- Tower VI's floor 20 Goal, Catacombs (`GoalUnlock` `catacombs`), reveals the Inspiration skill Reveal Catacombs (`catacombs`, 40 Inspiration; the node's `revealGoal`, progression.md).
- `open.ts`: `catacombsOpen(save)`, the skill owned or Access to Everything on.
- `save.catacombs` is a `CatacombSave`: `defaultCatacombs()` in `defaults()`, `decodeCatacombs` in `decode()`; the profile file keeps it in `towers` with its run cleared (`exportProfile`).

## The way in

- `OutsideWorld`'s seventh flag, `mausoleum` (set by `Game.forestWorld` from `catacombsOpen`; the Tower's forest only), raises the Mausoleum at `MAUSOLEUM` (`outside.ts`: by the entrance column, `dx` 7, rows 1 to 3, a 3 × 3 block of walls) in a yard one tile wider that the trees and grass leave clear (`forestProtected`, `Roads.mausoleum` in the grass's cache key, the cloud shadows' key).
  `drawMausoleum` draws it in pixels until its PNG is made; `Renderer` draws it after the Tournament Hall.
- `Game.atMausoleum(x, y)` is what `BoardOverlay`'s tap tests (its sixth callback); `Game.reshapeForest()` rebuilds the forest when a building opens, which the Upgrades page calls on buying Reveal Catacombs.
- `game/catacomb-desk.ts`: `CatacombDesk` (`game.catacombs`): `open`, `run`, `number`, `wouldLeave(number)` (the number and hall a run of another number past Hall 1 would leave) and `enter(number)` (refused while shut).
- `ui/catacombs-entry.ts`: `enterFromMausoleum` enters the forest's `save.tower.tier`, confirming first when `wouldLeave` says so, then opens the Catacomb screen.
- The menu's `#catacombs-button` (`ui/shell.ts`) shows once the Catacombs are open and a run exists (`renderRunMenu`); a Proving Grounds trial's cloned save has no Catacomb run (`TrialSession`), so it never shows there.

## The Catacomb screen

- `catacombs/player.ts`: `CatacombPlayer.step(save, wallNow, frameNow)` runs the turns `tick` says are due, at most `DRAWN_PER_SECOND` (15) times a second of frame time, so at ×100 a step takes six or seven turns and only the last is drawn; it credits their Lore to `save.cells` (`earn`) and returns the clock's verdict, the gains and the last turn's event.
- `FrameLoopHost.background` runs every frame on every page (`frame-loop.ts`): `main.ts` passes `CatacombView.frame`, so the Catacombs play on behind any page, and a hidden tab's gap goes to the bank (`BANK_GAP_MS`).
- `ui/catacomb-view.ts`: `CatacombView` opens on the run under way (the Mausoleum's tap, the menu's Catacomb button) and closes with Switch Back or Escape.
  While open it owns the board through `FrameLoopHost.boardFrame` (after a trial, which comes first), so no Tower or Delve turn, route or fight runs behind it, and its capture listeners keep the board's taps and the game's keys from the run.
  `html.catacombs` hides what the run shows and the Catacomb has no use for (`style.css`: the hand, Training bar, auto and speed, End Climb, the Shop, keys, Silver, shield, shroud, boosts, inspect and route boxes, the tabs' icons); `.catacomb-only` pieces show only then, made once on first open (`build`): Lore in the purse, the magic skill points in the portrait's top-right corner (the level row has no room for them beside the MXP bar), Switch Back under the hamburger where the run's Shop sits, the Lore icon in the Gold bonus, and the bank over the board's top right (`#catacomb-bank`: the clock, `bankTime`, the ×1 ×5 ×10 ×100 `select`, shown while a second is banked or haste is on).
  `decorate`, called by `main.ts`'s `update` after the HUD renders and after each step, writes MHP, MAtk and MDef into the HP, ATK and DEF slots, MAGICIAN, the Magic level and MXP (the bar purple), the hall in the floor's place, the Lore bonus in the Gold bonus's, the Wisp's stats here in the base enemy box, the heading and a status line per turn (`turnLine`).
  The board's heading is marked `catacombs`, so the run's heading is drawn again on Switch Back.
- `ui/catacomb-odds.ts`: `catacombOddsHtml(hall, number)`, the base enemy box's table on the Catacomb screen: each type's chance a slot, its MHP, MAtk and MDef there, MXP and Spirit, and the ranked last slot's; it follows the hero to each new hall, and `refreshEnemyOddsBox` leaves it alone.
- `ui/catacomb-menus.ts`: `CatacombMenus`, the bottom row in the tab bar's place (`html.catacombs nav` hidden; mounted after it on first open): Stats, Spirit, Forge and Academy tabs over a panel.
  Stats (`menuPanelHtml`) shows the table button, then a box per `MAGIC_STAT_IDS` entry (`statBoxHtml`: its name and points; tapped, it widens to − and + buttons, each disabled when it can't be pressed, and a line per stat it raises, `statLines`: a point's worth and the total), then the points free.
  `movePoint` moves a point; the view's `decorate` shows it on the HUD at once, and the engine counts it from the next turn.
  The table button opens `catacombStatRows` (`catacombs/summary.ts`: MHP, MAtk, MDef, Magic level, MXP to next, points, the Catacomb, hall, deepest hall, Lore bonus, Lore, every Spirit and Ingot), put away by a tap anywhere.
  Spirit, Forge and Academy say what they will do and show what they will spend (`LATER`); their designs are docs/CATACOMBS.md's TODOs.
  The view re-renders the panel in `decorate` only when its HTML changes.
- `render/catacomb-board.ts`: `CatacombBoard` draws the hall on `#world` at its own size: crypt stone from the Tower's tiles (`paintTile`, Tower III's look, addressed bottom up since `paintTile` reads north as y + 1), the stairs, torches, the Lore tablet and Ingot bars not yet taken, the undead in pixels (`UNDEAD_ART`, until their PNGs) with rank chevrons and an MHP bar, the hero tweened to each turn's tile, a dark falloff from the hero, and each strike's and pickup's number rising.
  It reads the run and never changes it.

## Time away and currencies

- `bankGap(clock, now)` (`clock.ts`) banks a gap over `BANK_GAP_MS` since the clock's last turn; `tick` uses it for a hidden tab, and `CatacombDesk.arrive(now)` for the app starting (only while the Catacombs are open and a run is under way).
- `main.ts` calls `arrive` right after `arriveOffline`, before anything saves, and the Offline dialog (`ui/offline-gold-dialog.ts`) adds `catacombLine` (*Catacombs: +10,800 banked turns (03h:00m)*); with no Offline Gold or Gems owed it opens for that line alone, headed *The Catacombs*.
- The currencies table (`currencyRows`) lists the seven Spirits and four Ingots after Lore once the Catacombs are open, their icons `spiritIcon` and `ingotIcon` (`ui/dom.ts`, drawn in CSS until their PNGs).

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
`tests/catacombs-offline.test.ts` covers `bankGap`, banking on start-up (only with a run, once, never while shut), the dialog's line and the currencies rows.
`tests/catacombs-menus.test.ts` covers the Stats boxes (lines, buttons and their disabled states), the panels and the stats table's rows.
`tests/catacombs-player.test.ts` covers the wall-clock turns: none without a run, a turn a second stepped at most 15 times a second, Lore credited, haste spending the bank down to ×1, and a long gap banked.
`tests/catacombs.mjs` (in `npm run test:browser`; no fixed clock, since the Catacombs play on the wall clock) claims the start-up dialog's banked turns, enters from the menu during a climb, sees turns, hastes, spends and takes back a point in Force, opens and closes the stats table and the undead table, visits a menu still to come, and switches back by button and by Escape to the climb's HUD.
`tests/catacombs-forest.test.ts` covers the Mausoleum (its tiles, yard, mode and flag), buying the skill raising it, entering by the forest's tower number, `wouldLeave`, and Access to Everything; `tests/forest-sprites.test.ts` keeps the foliage off it.
`tests/skill-trees.test.ts` covers Reveal Catacombs: hidden and unbuyable until the Goal is claimed, then 40 Inspiration.

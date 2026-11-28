# Golden Scarabs and boosts

Temporary boosts that reward a player who is watching: a **Golden Scarab** lies on a floor, and claiming it starts a **boost** for a while of real time.
Player-facing rules: `docs/gameplay/boosts.md`.

## Modules

- `boosts/catalog.ts`: the catalog (`BOOSTS`, `BOOST_IDS`: name, icon, base value, whether it adds steps or tiles, `plus`), `scaledBoost` (a boost's value with Golden Scarab Effect's percent: a factor raised as a whole, ×1.5 at 100% to ×4.5 at 300%; a `plus` value rounded down), `BOOST_MS` (12 minutes), `SCARAB_COOLDOWN_SECONDS` (15 minutes), `SCARAB_MISSED_FLOORS` (3) and `countdown` (*11:55*, *1:02:30*).
  It imports nothing, so the Archives and anything that reads a boost can import it.
- `boosts/boosts.ts`: the save's side.
  `save.boosts` (`BoostsSave`) holds each boost's end (wall clock ms); `addBoost` adds time on top of what is left (from now once it has run out).
  `boostFactor` and `boostPlus` read a boost at `now`, its strength from the Archives at that moment (`boostStrength`), so Golden Scarab Effect counts at once.
  `boostDuration` and `scarabCooldown` read Duration and Cooldown research.
  `openBoosts` lists those a scarab may give now (`boostOpen`: research once the Archives are open, training once a trainer is hired, Game Speed while `moveSpeed` research plus Movement Speed +1 is under `MAX_MOVE_RATE`, End Rush with its skill, Equipment Drops once Equipment is open, Gem Bank Refill with Gem Card, Rubies and Lore once the profile has earned one, `profile.earned`), and `rollBoost` picks one evenly.
  The training pace (`TrainingPace`, `trainingPace`, `trainingLeft`, `trainingDoneAt`, `trainingSpeedAt`, `samePace`) adds the Training Speed boost to the ad's ×2 and the Shop's rate; with no Training Speed boost running they are exactly `workLeft` and `doneAt` from `training-jobs.ts`.
- `boosts/pace.ts`: rate windows (`Pace`: a steady rate, each window's factor until its end, overlapping windows multiplying), `workBetween`, `doneAfter` (its inverse) and `repaced`.
- `boosts/scarabs.ts`: `save.scarab` (`ScarabDrop`), a timed find, and `scarabDraw`, the saved stream boosts are picked from (`rng`, seeded once from `stream("scarabs")`, so a reload never picks again).
- `economy/timed-drop.ts`: what the floor Gem and the Golden Scarab share: one find out at a time on a run's floor (`out`), the wall-clock cooldown (`readyAt`), the new floors owed after a miss (`wait`) and the furthest floor each mode reached (`reached`); `reachTimedFloor`, `collectedDrop`, `missDrop`, `spotOn`, `decodeTimedFields`.
  `economy/gems.ts` keeps its own names (`reachFloor`, `collectedGem`, `missGem`, `gemOn`) over it, the GEM card's extra Gems beside it.
- `game/scarab-finder.ts` (`ScarabFinder`, `Game.scarabFinder`): `step` (after `GemFinder.step`, on each step and on entering) claims a scarab under the hero, misses one left behind, and on a floor new to the run, once ready, lays one with `gemSpot` (salted run seed and floor, so its tile is fixed for the floor; the Gems' tiles in `taken`, so it never shares one; the Delve within the view).
  On a new profile `readyAt` is 0, so the first `step` sets it a whole cooldown ahead: no scarab on the first floors.
  `collectAt` claims one tapped from anywhere (`BoardOverlay.tap`, cinematic mode's `boardTap`).
  A claim starts the cooldown, sparkles (a golden Gem's), cues `gemGolden`, picks the boost, adds `boostDuration` through `Game.boostStarting` (which retimes ranks in training for Training Speed) and retimes research under way for Research Speed (`repaceResearch`), and queues a `ScarabClaim` in `claims` for the drop animation.
- `render/effects/scarab-art.ts`: `drawScarab` (the `scarab` sprite on a breathing glow, bobbing like a Gem) and its sparkle, drawn by `Renderer` after the Gems; `effectsOver` waits for the sparkle.
- `ui/boost-table.ts`: `boostRows` (the run's Level-up Boost, the Gold ad's boost, then each scarab boost, in that fixed order) and `renderBoostTable`, the bordered column over the board's top-left corner (`#boost-table` in `#board-frame`), built again only when its rows change and otherwise counting down each second (`renderAdButton`, main's tick).
  Each row carries its `name` and `about` (a scarab boost's from `BOOSTS[id].about`, given its value); a tap on a row shows them in the hand's tip (`showCardTip` with a detail line), and the table's own taps never reach the board.
  It returns the rows that change Gold, so `hud.ts` works the Gold bonus out again when one starts or ends.
  `claimHtml` and `BoardOverlay.flyClaims` (called by `main.ts`'s `update`) fly each claim from its tile to its row with `flyToPurse`: *icon ×1.5 +12:00*.
- `tools/prepare-scarab-sprites.mjs` draws `public/assets/style/scarab.png` pixel by pixel in the shared palette; then `npm run sprites:atlas` and `npm run sprites:manifest`.

## Where each boost applies

Each boost is a factor of its own kind (AGENTS.md's bonus rule), multiplying the others.
- Gold: `goldMultipliers` lists *Golden Scarab* while it runs (`id: "scarab"`), after the Level-up Boost, so paying (`RunPurse`) and the *All Gold Bonuses* box read it.
- XP: `Game.addXp`, all the hero's XP. Card XP: `Game.gainCardXp`, after the relics'.
- Research Speed: `researchPace` (`progression/archives.ts`), read by `begin` for research started while it runs; `repaceResearch` on a claim keeps each job's share done.
  A change of Golden Scarab Effect mid-boost doesn't retime jobs already under way.
- Training Speed: the training desk's `pace` (`trainingPace`), every due time and timer through `trainingDoneAt` and `trainingLeft`; `repace` on a claim.
- Game Speed: `Game.moveRate` adds its steps while the hand plays (`stepsPerSecond` above 0), capped at `MAX_MOVE_RATE` (now in `config.ts`).
- End Rush: `Game.dashFor("stairs")`.
- Equipment Drops: `RunPurse.killDrops`'s `eye`.
- Gem Bank Refill: `GemFinder.adTerms` divides the cooldown.
- Rubies: `RunPurse.bankRubies` (bosses' and floors' Rubies), rounded to whole Rubies; an ad series prize's Rubies are a prize, not a find, and aren't raised.
- Lore: `RunPurse.bankCells`.

A Proving Grounds trial shares `save.boosts` with the base game and gets a scarab state that never lays one (`proving-grounds/session.ts`).
The profile file keeps `scarab` and `boosts` in its currencies section, a scarab lying out and the floors reached dropped as a Gem's are.

## Research

The Breakthrough skill Golden Scarab Research (`goldenScarab`, 2 points, under Gem Card at (30, 189)) opens three projects in Quality of Life: Golden Scarab Effect (`scarabEffect`, percent from 100, +2 a level for 100 levels on `critLevels`, Offline Gold Multiplier's curve), Duration (`scarabDuration`, the same, on `scarabTimeLevels`, Offline Gold Duration's curve carried on to 100 levels) and Cooldown (`scarabCooldown`, seconds from 900, −2 a level for 90 levels, the same curve).

## Tests

`tests/boosts.test.ts`: values and countdowns, stacking time, the open list, the research, the Gold line multiplying the Level-up Boost, pace math, Training and Research Speed retiming, the finder in a run (first cooldown, placement, claim, cooldown), misses, XP, Card XP and Game Speed, Rubies and Lore, decoding and the saved stream.
`tests/gems.test.ts` covers the Gem's side of the shared timer.

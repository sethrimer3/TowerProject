# Familiars

Familiars (`src/familiars/`, `game/familiar-desk.ts`, `ui/familiars-panel.ts`, `ui/hatch-reveal.ts`, `render/effects/familiars.ts`): five young beasts hatched from eggs and grown for Medals, which move over the board in Tower, Delve and tournament runs and act by themselves.
The player's rules are in `docs/gameplay/familiars.md`.

**Modules.**
- `catalog.ts`: `FAMILIARS`, each one's four stats in whole units (hundredths of a tile, tenths or hundredths of a factor), `HATCH_MEDALS` and `upgradeMedals`. Levels are saved by each one's `order`, so never reorder one.
- `paths.ts`: where each is, a pure function of the turns it has moved, as an offset from the room's middle, and the Wolf's point (`wolfOffset`, at `wolfAngle`'s angle by the run's seed and its dash number).
- `rules.ts`: one turn of the clocks (`stepFamiliars`, `endFamiliarsTurn`), the area test (`inArea`) and the Wisp's boost (`wispBoost`, `wolfArea`, `falconArea`). It reads nothing of the game but what it is given.
- `marks.ts`: what they leave on enemies, and `familiarTile`, which reads it onto the enemy.
- `strikes.ts`: the Dragon's strike (`dragonStrike`) and burn (`burnTicks`), and the Slime's stun and linger (`slimeStrike`).
- `save.ts`: `save.familiars` (those hatched, levels and switches) and `run.familiars` (`turns`, `timer`, `left`, and the Wolf's `casts` and `at`), with their decoders.

`Game` decides only when: `familiarsTurn`, `burnTurn`, `endFamiliars`, `familiarSight`, `falconGold`, `familiarView`.

**Balance intent.**
Familiars are meant to be powerful after steady, very long-term investment: the multi-year Medal and research totals (194,090 Medals in all, five 577-day projects) are on purpose.
The Dragon's burn scales with the hero's own ATK and crits, so at any floor the hero can win fights on it outpaces the hero.
Its Damage therefore starts at ×5 and grows 9.5 a level to ×290: at ×50 an unraised Dragon felled everything at the frontier within 12 turns, and at ×5 it takes a median 21 and fells nothing 200 floors past it in a floor's 53 turns.
Don't raise that base without measuring this again.
Dragon Range is its own: the hero's shot range doesn't widen it, or the last levels would reach past the whole floor.

**Exactness.**
Where a familiar is decides play, so paths use only `pointing` (`exact.ts`), `+ - * /` and `Math.sqrt`; `tests/engine-independence.test.ts` rebuilds them and scans `src/familiars/`.
No stream is drawn: the Wolf's angle is a `tileRandom` of the run's seed.
Drawing may use `Math` freely.

**The room** (`Game.familiarRoom`): a Tower floor's middle (8, 8), the room 17 tiles across to its outer edge, or in the Delve a room that size round the hero as the turn began.
The Wolf's point is fixed in the world once chosen.

**A turn.**
Everything reads each familiar where it stood as the turn began.
1. The step and its fight resolve against what stands.
2. `familiarsTurn`, in `playTurn` before anything strikes: the cooldowns, start to start, then what fires, in the order Wisp, Slime, Dragon, Wolf, Falcon, so the Wisp counts for what fires with it and a stunned enemy doesn't shoot that turn.
3. The arcana, the volley and the Aggroed steps.
4. `wearStuns` wears lingers first, only for enemies not stunned, so the turn a stun ends uses up none of Linger's `LINGER_TURNS` (3).
5. `burnTurn` beside `decayNecro`: each burned enemy ticks, but those lit this turn (`lit`, moved along with an Aggroed step).
6. `endTurn`, round `playTurn`, calls `endFamiliars` last whichever way the turn ended: paths on a turn, durations down one.

So a new early return in `playTurn` can't stop their clocks.
A climb interrupts nothing but leaves the marks with the floor; a new run starts all over.
A familiar hatched mid-run starts with a whole cooldown.

**Marks and what is read.**
`Tile.burn` (the Wisp's boost in hundredths, 100 without) and `Tile.linger` lie raw in `run.changes`, beside `wound` and `stun`, and move with the enemy.
The boards' `tile` passes each enemy through `familiarTile` with `Board.familiars` (`Game.familiarSight`, set by the `world` setter as `vortex` is), after the vortex and before a bubble:
- `burned`, with its ATK already cut by Damage Reduction, so fights, shots, previews, planners and labels see one ATK;
- `linger`, the percent it slows by;
- `tagged`, the Wolf's factor where it is planted.

None of the three is ever saved.
A switched-off familiar's marks lie still and do nothing.
`familiarSight` runs for every enemy tile read, so it reads no research (`FamiliarDesk.stats`).

**What each does.**
- **Dragon:** `arcaneStrike` with `arcanumBoost(Damage, crit)` × the Wisp's × Overseer's beam: DEF, bubbles, Shock and the tag count; no rolled crit, Lifesteal or Armor Break. One burn an enemy, the higher Wisp boost kept; hero ATK and level are read at each tick. Shots and kills are marked `familiar`.
- **Slime:** the existing `Tile.stun` (a longer one stays) and a linger. A boss or Greater Boss takes half the Duration and half the percent, rounded down, for the same 3 turns (not `stunFor`, which halves only for a Greater Boss). Linger reaches a fight through `fighterAt`'s `slowdown`, shooters through `volleyTurn`, steps through `aggroTurn`'s `slowAt`, all by `togetherSlow`.
- **Wolf:** `taggedDamage` multiplies on `enemy.tagged` for a hero carrying `Player.tags` (`Game.striker`, `fighterAt`), so previews and planners count the plain hero, the worst case, as with Shock. It is read in `attackAgainst` (fights, arrows, every `arcaneStrike`, Necrotic Frost), `bombStrike` and `lifespringContact`. Thorns, Takedown and Voidwell Damage don't read it. **A new damage source struck with the hero's ATK must read it too.**
- **Falcon:** `falconGold(at)` joins the kill's Gold factor in `Finds.kill` and `enemyGold`, Gold alone, left out of All Gold Bonuses.
- **Wisp:** multiplies the whole Dragon Damage, Slime Linger, Wolf Bonus and Falcon Bonus of a familiar standing in its area; the first two as they fire, the others each turn. Never Damage Reduction (95% would become immunity), durations, cooldowns or ranges.

An encounter keeps the enemy as the fight began (`fighterAt(to, enemy)`), so a toggle mid-fight counts from the next fight.

**The desk** (`game.familiars`).
`hatch`, `upgrade` and `toggle`, with `hatchRefusal` and `upgradeRefusal`; buying needs Events earned, switching doesn't.
Switching off ends the effect in both modes' runs; cooldown and path hold still, so it neither skips nor restarts a wait.
`values` counts research (five Cooldown projects opened by Tower V's floor 60 Goal, `familiarResearch`), `stats` doesn't.

**Trials** leave familiars out: `TrialSession` empties its copy's `save.familiars`.

**Drawing** (`FamiliarLayer`).
The areas and the Slime's 0.8 s circle go through `underContents`, their stepped rims baked once by size (`bakedRim`), in the Arcana Effects Lab's pixel style.
The sprites (frames 1, 2, 3, 2), the Dragon's 30 flames and the icons go in `drawOverlays`.
Only presentation is kept outside the run: the Wolf's place as it lags after the hero, and `Game.familiarFx`.
`drawEnemyStates` draws the burn icon at a tile's top center and a stun icon at its bottom center (whatever stunned it; Battery saver's board draws its own stun), clear of the other marks.
Battery saver draws white silhouettes keeping their ink.
`dragonDamage` (Settings' Toggles, its Familiars group) hides the Dragon's numbers alone.

**The tab** is `FamiliarsPanel`, inside `EventsPage`.
A control short of Medals wears `unaffordable`, not `short`, which several themes paint red throughout: only a Hatch's price turns red, and only a stat's outline greys.
`showHatch` plays after the purchase is saved.

**Art.** `node tools/prepare-familiar-sprites.mjs` draws every PNG (`--sheet <file>` only a contact sheet to review), then `npm run sprites:atlas`.

**TODO.**
- Falcon Duration research, to 45 turns: no schedule has been given.
- Falcon Range from relics and equipment: none is defined yet.

**Tests.** `tests/familiars.test.ts` (catalog and save), `familiar-paths`, `familiar-desk` (buying, the Goal, research), `familiar-turns` (the clocks, every way a turn ends, reloads), `familiar-combat` (each rule, and `predict` against `bout`), `marks-reload` (marks worn off and a reload).
`node tests/familiars.mjs` (dev server or `TEST_URL`) checks the tab, dialogs, reveal, switch, setting and board in every theme, with review images in `test-results/familiars/`.

# Arcana

Arcana (`src/arcana/arcana.ts`, `src/game/arcana-desk.ts`, `ui/arcana-panel.ts`), their triggers, Ricochet Shot, Aurum Bloom, Overseer, and their run cards.

**What they are.**
Spells bought with Arcanite on the Gear page's Arcana tab and kept for good, or lent to one climb by a Shrine boon.
Each is one row of `ARCANA`: its name, its `trigger`, three `attributes` (each a table of `steps`, value and Arcanite cost, the first free), its `summary`, and either `damage` (what its Arcanum Damage multiplies by) or `effect` (its run card's text).
Tower and Delve runs alike hold every arcanum owned; Proving Grounds' trial `Game` holds none (`session.ts` clears its copy).

**Triggers.**
Each arcanum names its own (`ArcanumTrigger`), since they differ from one to the next.
`always` needs no event: the arcanum works while it is on; `shotHit` is raised in `volley.ts`; `cooldown` is a number of turns, worked by `ArcanaDesk.turn` (`Game.endTurn`) through `tickCooldowns`, restarting the moment it runs out, whatever the arcanum is still doing.
No arcanum has a cooldown yet, so its firing has no effect to apply: the first one to use it reads what `turn` returns.
A new trigger is a new member of `ArcanumTrigger` and the code that raises its event.

**Buying.**
`ARCANUM_PRICES` by how many are owned; lent arcana don't count.
`save.arcana` (`ArcanaSave`, `decodeArcana`) keeps each arcanum's attribute levels, the choice waiting (`offer`), and the choices' own stream: `rng`, seeded once from `stream("arcana")`, and the `rolls` drawn (`nextDraw`).
`ArcanaDesk.offer` draws up to `OFFER_SIZE` of those not owned, each as likely as any other (`drawOptions`), and keeps them until one is bought or rerolled, so closing the dialog or reloading changes nothing.
`reroll` costs a fifth of the price (`rerollPrice`) and gives a different set whenever there is one (`redrawOptions`); it is offered only while more than `OFFER_SIZE` remain (`rerollOpen`), since otherwise every option left already shows.
With Dev free purchases nothing is paid, and the Arcana tab shows whatever Arcanite has been held (`arcanaOpen`), so a choice and every upgrade can be pressed from a fresh save.

**Arcanum Damage** (`arcanumBoost`): Multiplier × Equipment × Hero ATK × (1 + Critical Factor × Critical Chance) × (1 + Super Crit Mult × Super Crit Chance × Critical Chance).
It is this average, never rolled, and is what a damaging arcanum's card shows.
No equipment raises it yet: the factor is `arcanumBoost`'s `equipment`, 1 by default.

**Ricochet Shot** (`ricochet` in `volley.ts`, given `VolleyTurn.ricochet` by `ArcanaDesk.ricochet`).
Each arrow that lands, whatever damage it did, rolls `chance` on a `tileRandom` (`RICOCHET_SALT`, by turn, shot and tile), so undo and a replay agree.
It then strikes the `rebounds` closest other enemies on the floor (`Board.floorEnemies`: the Tower floor's, or in the Delve the hero's area on its equivalent floor), any distance, by Euclidean distance from the enemy struck, round the wrap.
A strike is `arrowDamage` with Arcanum Damage's boost, so it passes through DEF, Piercing, the enemy cards' ATK and a Shielded enemy's bubble, as an arrow does; it heals no Lifesteal and breaks no armor, and rolls no crit.
Only arrows spring ricochets, so one never sets off another.
Its `Shot` carries `ricochet`: it lands as its arrow does (`leavesAt` equals `landsAt`), its number and HP bar rise like an arrow's, and `drawRicochet` in `render/volley-art.ts` flashes a white line from the enemy struck for `RICOCHET_FLASH_MS`, for which `volleyOver` waits.
A kill is a `VolleyKill` marked `ricochet`, never an instakill, and pays through `finds.kill`.
A multishot's later targets are read again from the board (`inPlace`), since a ricochet may have struck them.

**Aurum Bloom** (trigger `always`, given by `ArcanaDesk.aurumBloom`, its effect the run card's text) raises the floor environments: Bonus is the Golden Floor's factor it makes alone, and over Golden Floor Multiplier counts all but the ×1 they share (first level: ×5 alone, ×6 with the skill); Golden Chance to the Golden Floor's chance and Stellar Chance to the Stellar Floor's.
None needs a Breakthrough skill or research.
It holds nothing in the run: see `withBloom` in environments.md.

**Overseer** (`src/arcana/overseer.ts`, trigger `always`, given by `ArcanaDesk.beams`, its effect the run card's text) sends out Quantity beams, spread evenly round the hero, each Angle degrees wide, and multiplies the hero's ATK by Bonus on hits on enemies in them.
Quantity's table starts at a free 1 beam, with 2, 3 and 4 the priced levels.
They take no notice of walls or distance.
**Their direction** (`beamDirection`) is whole hundredths of a degree clockwise from straight up the board, starting at 0: `BEAM_TURN` (4 degrees) a turn and a hundredth of that a tick.
`run.beamTurns` counts the turns finished; `ArcanaDesk.turn` raises it in `Game.endTurn` while the run holds Overseer, on or off, whether or not the turn has a volley, and since it lies in the run, undo turns the beams back and a new run starts them at 0.
A dash is one turn; a Bomb's throw, no `endTurn`, is none.
**Being in a beam** (`inBeams`) compares the angle from the hero to the center of the enemy's tile with the nearest beam's center: at most half the Angle counts, the edge included, and the hero's own spot (a Flying enemy overhead) is in them all.
It decides play, so the angle comes from `bearing` in `src/exact.ts`, an arctangent of `+ - * /` and `Math.sqrt`, never `Math.atan2`.
**What it multiplies**, each before DEF and multiplying the other kinds:
- A fight: `Game.fighterAt(to)` carries `Player.beamAttack`, which `squaredUp` applies as its own factor, read as the turn begins (tick 0) from the tile the hero stands on, the same for the whole fight. Like `comboAttack`, only `Game.move`'s `resolveStep` and `FightPlayback`'s `bout` and `retrain` read it, so previews, the inspect panel, Damage Visual and the planners count the plain hero, the worst case.
- An arrow: `beam` in `volleyTurn` multiplies its `boost` by the beams and the hero as they stand the tick it fires, mid-step and round the Delve's wrap (`heroAt`, `shortWay`), so it also decides what `hurts` can aim at. Enemies don't move during a turn's ticks (Aggroed ones step after tick 100), so each is read at its tile as it stands that tick.
- A ricochet: `ricochet` multiplies its `boost` by the same `beam` at the enemy it strikes, at the tick of the arrow that sprang it.
- A Bomb: `Game.bombStrike` multiplies the hero's ATK, read as the turn stands (tick 0).

Thorns, Shield Thorns and boss Takedown take shares of the enemy's HP, and doors take keys or HP, so none of them reads it.
A new damage source that is struck with the hero's ATK must read the beams too.
**Drawing** (`drawOverseerBeams`, `render/effects/overseer-beams.ts`, first in `drawOverlays`) fills each wedge from the hero as drawn (`f.playerX`, `f.playerY`) with a faint white in `soft-light` (`BEAM_LIGHT`), above the darkness and under what is marked on the board, reaching past the canvas's edges.
It turns by `Game.turnClock`, stamped with every `endTurn`, unlike `turnShown` set however far the turn came, as the volley's ticks do; reduced motion jumps to the turn's end.

**The run.**
`ArcanaDesk.held` is what the run holds: owned at their levels, and lent at their first.
`slice.runArcana` (`ArcanaRun`, `decodeArcanaRun`) sits beside the run, like `runFinds`, so undo never touches it, and `newRun` resets it: the toggles spent (`RUN_TOGGLES`, all arcana together), those off, and the cooldowns left.
Toggling off forgets the arcanum's cooldown, so it starts over when turned on.

**The Shrine boon.**
`unlockArcanum`, the one `spell` boon, joins `rollOffer` at weight 20 against the trade-offs' 15 and the standard boons' 65 while `arcanaToLend` has any.
`ShrineDesk.pick` then rolls `run.shrine.choosing` from the run's own draws (`rollArcanumChoice`), which counts as unspent and holds back further offers until `choose` moves the pick to `run.shrine.arcana`; `share` copies both to every undo snapshot, so undo never takes one back.
Auto Pick takes the first option.
It has no boon PNG: `boonIcon` gives it the Arcanite icon.

**UI.**
The Gear page's Arcana tab (`GearPage`, `ArcanaPanel`) shows once `arcanaOpen`: Arcanite held or ever earned, or an arcanum owned; the Gear tab opens with it.
`notices.waiting("arcana")` puts a dot on the Gear tab and the Arcana tab, and the last of the forest's lessons, `arcana`, points at the Gear tab, until `notices.shown("arcana")` (`save.tutorials.arcana`), set when the tab first shows; `navigate` opens the page on the tab while the lesson waits.
Short of Arcanite, the Select button keeps its full look with a red price, and it and every other price offer the Shop (`askForArcanite`); an upgrade button short of Arcanite fades only its border.
`closesOnBackdrop` (`ui/dialogs.ts`) closes the choice and information dialogs on a press outside.
`RunTrainingBar` adds the Arcana tab after the Training groups (`[data-run-tab="arcana"]`), with a card each in `#run-drills`: `.arcana-switch` toggles, and a press elsewhere on the card opens `showHeldArcanum`; the toggles left rise off the switch for `TOGGLES_SHOWN_MS`.
The bar shows inside a run holding any arcanum, even before On the Job.
`enhancementsOf` gives the rows of research enhancements both information views show; none are defined yet.
The `.arcana-attr` and `.arcana-switch` rules use two ids to beat the themes' and the sprite kit's blanket button rules.

**Tests.** `tests/arcana.test.ts`, `tests/aurum-bloom.test.ts`, `tests/overseer.test.ts`.

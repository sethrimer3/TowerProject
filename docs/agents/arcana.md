# Arcana

Arcana (`src/arcana/arcana.ts`, `src/game/arcana-desk.ts`, `ui/arcana-panel.ts`), their triggers, Ricochet Shot, and their run cards.

**What they are.**
Spells bought with Arcanite on the Gear page's Arcana tab and kept for good, or lent to one climb by a Shrine boon.
Each is one row of `ARCANA`: its name, its `trigger`, three `attributes` (each a table of `steps`, value and Arcanite cost, the first free), its `summary`, and either `damage` (what its Arcanum Damage multiplies by) or `effect` (its run card's text).
Tower and Delve runs alike hold every arcanum owned; Proving Grounds' trial `Game` holds none (`session.ts` clears its copy).

**Triggers.**
Each arcanum names its own (`ArcanumTrigger`), since they differ from one to the next.
`shotHit` is raised in `volley.ts`; `cooldown` is a number of turns, worked by `ArcanaDesk.turn` (`Game.endTurn`) through `tickCooldowns`, restarting the moment it runs out, whatever the arcanum is still doing.
No arcanum has a cooldown yet, so its firing has no effect to apply: the first one to use it reads what `turn` returns.
A new trigger is a new member of `ArcanumTrigger` and the code that raises its event.

**Buying.**
`ARCANUM_PRICES` by how many are owned; lent arcana don't count.
`save.arcana` (`ArcanaSave`, `decodeArcana`) keeps each arcanum's attribute levels, the choice waiting (`offer`), and the choices' own stream: `rng`, seeded once from `stream("arcana")`, and the `rolls` drawn (`nextDraw`).
`ArcanaDesk.offer` draws up to `OFFER_SIZE` of those not owned, each as likely as any other (`drawOptions`), and keeps them until one is bought or rerolled, so closing the dialog or reloading changes nothing.
`reroll` costs a fifth of the price (`rerollPrice`) and gives a different set whenever there is one (`redrawOptions`); it is offered only while more than `OFFER_SIZE` remain (`rerollOpen`), since otherwise every option left already shows.
With Dev free purchases nothing is paid.

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

**Tests.** `tests/arcana.test.ts`.

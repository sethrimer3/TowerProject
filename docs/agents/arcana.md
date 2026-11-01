# Arcana

Arcana (`src/arcana/arcana.ts`, `src/game/arcana-desk.ts`, `ui/arcana-panel.ts`), their triggers, Ricochet Shot, Aurum Bloom, Overseer, Thunderbolt, Lifespring, Time Dilation, Phantasm, Necrotic Frost, Voidwell, their run cards, and how they work in a trial.

**What they are.**
Spells bought with Arcanite on the Gear page's Arcana tab and kept for good, or lent to one climb by a Shrine boon.
Each is one row of `ARCANA`: its name, its `trigger`, three `attributes` (each a table of `steps`, value and Arcanite cost, the first free), its `summary`, and either `damage` (what its Arcanum Damage multiplies by) or `effect` (its run card's text).
Tower and Delve runs alike hold every arcanum owned, and a Proving Grounds trial every one but Aurum Bloom (see **In a trial**).

**Triggers.**
Each arcanum names its own (`ArcanumTrigger`), since they differ from one to the next.
`always` needs no event: the arcanum works while it is on; `enemyHit` is raised in `volley.ts`, by an arrow landing or a fight won; `cooldown` is a number of turns, worked by `ArcanaDesk.turn` (`Game.endTurn`) through `tickCooldowns`, restarting the moment it runs out, whatever the arcanum is still doing.
What `turn` returns is what ran out, for `Game.endTurn` to act on.
A cooldown upgraded while it runs counts down from no more than its new length.
Any arcanum with a cooldown gets a bar on its run card from `ArcanaDesk.cooldown`.
A new floor interrupts none of them: each keeps its cooldown and what it has in progress (bolts waiting, waves and the pool, fields, ghosts, a vortex) in the run or `runArcana`, which a climb doesn't touch, counting the turn that climbed; `tests/voidwell.test.ts` takes real stairs holding all of them.
What dies with the floor left is only what lies on its tiles (`sprung`, `necro`), along with its enemies.
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
Only arrows and fights spring ricochets, so one never sets off another.
Its `Shot` carries `ricochet`: it lands as its arrow does (`leavesAt` equals `landsAt`), its number and HP bar rise like an arrow's, and `drawRicochet` in `render/volley-art.ts` flashes a white line from the enemy struck for `RICOCHET_FLASH_MS`, for which `volleyOver` waits.
A kill is a `VolleyKill` marked `ricochet`, never an instakill, and pays through `finds.kill`.
A multishot's later targets are read again from the board (`inPlace`), since a ricochet may have struck them.
**Off a fight** (`fightRicochet`, called from `Game.enter` once `winFight` says the hero stands, before `land` clears the tile): a fight rolls once, however many strikes it took and only when won, a `tileRandom` fixed per run, floor and tile (`FIGHT_RICOCHET_SALT`), so undo and a refight agree.
It springs from the fought enemy's tile with the same strike, Overseer's beam read as the turn begins like the fight's own; its shots wait in `Game.sprung` for `endTurn` to show at tick 1, once the fight has played, and the undo snapshot taken before the fight takes it all back.
Previews and planners don't count it.

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

**Thunderbolt** (trigger `cooldown`; `thunderbolts` in `volley.ts`, given its rule by `ArcanaDesk.chargeBolts`, called from `Game.strikeBolts` in `endTurn` before the volley, so what a bolt fells shoots no more that turn, and whatever the tier or the Archer) strikes Quantity bolts when its Cooldown runs out.
**Targets:** `boltTargets` gives each enemy of `Board.floorEnemies` at the hero a key from `tileRandom`, by the run's seed and `runArcana.strikes` (the turns it has struck), sorts on those and takes one enemy a bolt, so they are distinct, each as likely as another, and the same in every engine.
**Leftovers:** with fewer enemies than bolts, the rest wait in `runArcana.bolts` and strike next turn, each enemy again at most once a turn; a new trigger adds to them, and they follow the hero to the floor it stands on.
If no enemy remains after a strike, or none stands there at all, they are wasted at once.
**A strike** is `arcaneStrike`, which Ricochet Shot shares: `arrowDamage` with Arcanum Damage's boost and Overseer's beam as the hero and they stand the tick it falls, no Lifesteal, no Armor Break, no rolled crit; a kill is a `VolleyKill` marked `thunderbolt`, paid through `finds.kill`.
Its `Shot` carries `thunderbolt`: the ticks spread over the turn, it falls for `THUNDERBOLT_FALL_MS` and flashes for `THUNDERBOLT_FLASH_MS`, however fast the turn; number, HP bar and ghost work as an arrow's.
**Drawing** (`render/effects/thunderbolt.ts`, used by `drawVolley` and `TrialRenderer`): `paintThunderbolt`, a hard-edged jagged white line straight down from the canvas's top, its kinks fixed by the tile and tick, and `paintThunderlight`, a pixel sprite (`LIGHT`, no glow) round the target, flipped to crackle; reduced motion shows the bolt whole and the sprite still.

**Lifespring** (`src/arcana/lifespring.ts`, trigger `cooldown`; `Game.lifespringTurn` and `Game.lifespringContact`, `lifespringContact` in `volley.ts`) sets off Effect Waves, then a field with an HP Pool.
**Its state** is `run.lifespring` (`LifespringRun`), in the run and not `runArcana`, cooldown included, so undo takes back the pool, waves and Health Bonus together with the enemies they touched, and replaying gives the same.
`ArcanaDesk.turn` therefore leaves it out of `tickCooldowns`, and `stepLifespring` runs it instead; a climb keeps it, and switching it off clears all of it but the Health Bonus (`clearLifespring`).
**A turn** (`Game.endTurn`): `stepLifespring` right after the cooldowns, before anything strikes, so a wave's DEF Reduction counts for that turn's bolts and shots.
Activation queues Effect Waves; the first fires that turn, the next each `WAVE_INTERVAL` (4) turns, and the field forms one interval after the last, adding HP × the hero's ATK as it stands (no crits, no beams) to the pool, blue for `TINT_TURNS` if a pool still held.
**An Effect Wave** marks every enemy of `Board.floorEnemies` at the hero through `Board.markSpring` (`springMark`): the tile's `sprung`, in `run.changes` beside `wound` and moving with an Aggroed enemy, read onto the enemy as `Enemy.sprung` by `wounded`, never saved on it.
It deals no damage and wakes no Flying enemy.
**Its reach** (`Game.lifespringReach`) is the hero's shot range, `arrowRange` of Attack Range with the hand's tree bonus, whether or not the hero is an Archer: 3 tiles untrained.
**The field** strikes with `lifespringContact` twice a turn.
Before `volleyTurn`, it strikes only what the hero's step brought into range (`entered`), so these enemies meet it before an arrow; only a turn with a volley needs this.
At the very end of the turn (after the volley and `aggroTurn`), it strikes everything in range, so shots get their chance at what already stood there.
Each pass goes closest first; `fieldHit` pays `hp / rate` from the pool, or all of it prorated, where `rate` is `springAmplify` (Damage Amplification × wave hits, 1 with none) cut by a Shielded enemy's bubble (`guarded`).
It ignores DEF, Lifesteal and Armor Break, and reads no beams: the pool was paid in ATK when it formed.
Its `Shot` carries `lifespring`: no art, only its number and HP bar, landing at once (`landsAt`), at tick 1 before the volley and `TURN_TICKS` at the end.
**What Effect Waves give** comes from `lifespringEffects(save)`, the one place research will raise them: Health Bonus (`Finds.kill` → `ArcanaDesk.lifespringKill` → `boostLifespringHealth`, per enemy with `sprung` set (a wave or the field touched it), once however often, its own factor on max HP through `lifespringFactor` in `heroFactor` and `rowValue`, capped at `healthLimit`), Damage Amplification, Gold and Cell Bonus (`RunPurse.enemyLoot`'s `spring`, for any enemy with `sprung` set, its Gold gated like any kill's; previews don't count them) and DEF Reduction (a percent added to `broken`).
All of them apply only while it is on, by whatever means the enemy falls.
**Drawing** (`render/effects/lifespring.ts`, from `drawOverlays` under the shields): `paintLifespring`, three gapped rings at 25% alpha spinning at their own speeds, their centers slightly off the hero, spreading for `FIELD_GROW_MS` from `Game.springFx.formedAt`, and `paintEffectWave`, a ring rising past the canvas's corners for `WAVE_MS`; reduced motion stills the rings and shows no waves.
**Its card** presses to `showHeldArcanum`, adding `lifespringTables`: the HP Pool and what Effect Waves give; `RunTrainingBar.refreshTip` shows Health Bonus's factor on the Max HP card.

**Time Dilation** (`src/arcana/time-dilation.ts`, trigger `cooldown`; `ArcanaDesk.timeDilationRule`, `Game.dilation`) sets a field round the hero for Duration turns, slowing the enemies in it by Slowdown.
**Its state** is `run.timeDilation` (`DilationRun`: `timer` and `left`), in the run like Lifespring's, so undo takes the field back with what it slowed and a refight comes out the same; `ArcanaDesk.turn` leaves it out of `tickCooldowns`, and `timeDilationTurn` runs `stepDilation` in `Game.endTurn`, just after Lifespring's turn, so a new field counts for that turn's shots.
`stepDilation` counts the field down and the cooldown, which starts over the moment it runs out and sets `left` to Duration, whatever was left: nothing stacks, and a Duration past the Cooldown makes it constant.
A field set in one turn's `endTurn` slows that turn's shots and steps and the next Duration fights.
Switching it off clears both (`clearDilation`).
**Slowdown and reach** come through `dilationEffects(save)`, the one place research will raise them: `fieldSlowdown` caps Slowdown at `SLOWDOWN_CAP` (90), and `fieldReach` widens the hero's shot range (`Game.lifespringReach`: 3 tiles untrained, whether or not the hero is an Archer).
An enemy is in the field by Euclidean distance from the hero to its tile, round the Delve's wrap (`Game.slowdownAt`).
**What is slowed:**
- A chance to act: `slowedAct(tally, slow)` says whether an enemy acts and carries a running tally, and `actsOf` is its closed form. Under 50% each chance adds Slowdown and the one reaching 100 is lost (25%: chances 4, 8, 12 are lost). From 50% the delay is a whole chance or more per act, so chances are lost first: each adds 100 − Slowdown and only the one reaching 100 acts (50%: 2, 4, 6; 75%: 4, 8, 12). Whatever is over 100 rolls on. Either way it acts on 100 − Slowdown percent of its chances.
- A fight: `Game.fighterAt(to)` carries `Player.slowdown`, read as the turn begins, so as with `beamAttack` only `Game.move`'s `resolveStep` and `FightPlayback`'s `bout` and `retrain` read it, and previews, the inspect panel, Damage Visual and the planners count the plain hero, the worst case. `play` (`BoutState.tally`), `thornRounds` and `lifestealEnding` ask `slowedAct` before each enemy strike, a Fast enemy's opening being its first chance; a skipped strike leaves the hero's next to come, adds no thorns and doesn't raise the enemy's ATK, since that rises with the strikes that land. So `predict`'s plain path needs only the count (`actsOf`, `CombatPrediction.strikes`), and a slowed `predict` always plays every round. `resume` rebuilds the tally from the chances gone by (`tallyAfter`).
- A shot: `VolleyTurn.dilation` slows a shooter's cooldown. One the hero comes within reach of charges by `slowedTickGain` the ticks the hero's walk has it in the field, whole units adding up to the turn's `slowedCharge`, since saved cooldowns are whole; the rest charge by `slowedCharge` if in the field as the turn ends. A shooter already ready isn't delayed.
- A step: `AggroTurn.slowAt` slows an Aggroed enemy's `stride` by `slowedCharge`, so it takes 1 / (1 − Slowdown) as many turns a step.

Thorns, Bombs and arrows at the enemy don't read it; a Shielded enemy's bubble isn't touched.
**Drawing** (`render/effects/time-dilation.ts`): `drawDilationField`, `paintDilationField`, one arc a frame: a `#8fd8ff` disc at 10% alpha and a solid thin rim, round the hero as drawn.
`DungeonLight` calls `LitBoard.underContents` after the darkness and just before the contents (the Classic board), and `drawThemedBoard` takes the same hook, so it lies on the floor under items and enemies and isn't dimmed; it isn't baked into the ground cache.

**Phantasm** (`src/arcana/phantasm.ts`, trigger `cooldown`; `ArcanaDesk.phantasmRule`, `Game.strikeGhosts`, `ghostStrikes` in `volley.ts`) keeps ghosts in a ring round the hero.
**Its state** is `run.phantasm` (`PhantasmRun`: `timer`, `turns`, `ring`, `ghosts`), in the run like Lifespring's, so undo takes the ghosts back with what they struck and a replay comes out the same; `ArcanaDesk.turn` leaves it out of `tickCooldowns`, and `phantasmTurn` runs `stepPhantasm` in `Game.endTurn`, after Time Dilation's turn.
`stepPhantasm` counts `turns` (the ring's turning) and the cooldown, which starts over the moment it runs out and fills every slot, `ring` set to Quantity, so a Quantity bought since spaces the whole ring anew.
A ghost lost keeps its slot empty; the others don't close up.
Switching it off clears all but `turns` (`clearPhantasm`).
`phantasmEffects(save)` is the one place research will raise it: `blast` (0.1 tile), `spin` (100 hundredths of a degree a turn) and `cooldown`, turns off it. `phantasmCooldown` never goes under `COOLDOWN_CAP` (37), whatever lowers it.
**Where a ghost is** decides play, so it is exact in every engine: `ghostDirection`, in hundredths of a degree clockwise from straight up the board, and `ghostOffset` from `pointing` in `src/exact.ts`, a sine and cosine of `+ - * /`, never `Math.sin`. Its center rides `RING_RADIUS` (1 tile) from the hero's.
**Contact** (`touchesTile`): its body, a circle of `GHOST_RADIUS` (0.25 tile), overlaps the enemy's tile, walls or no walls. `ghostStrikes` plays each tick of the hero's walk, as a volley does, each live ghost in slot order, so a ghost riding over an enemy mid-step strikes there; enemies are found once (`enemiesWithin`) and don't move during the ticks. Blast alone never sets a ghost off.
**A strike** hits every enemy whose tile the body overlaps and every enemy whose tile center lies within `blast` (`inBlast`, Euclidean, round the wrap), each `arcaneStrike` with Arcanum Damage and Overseer's beam at that tick: through DEF, no Lifesteal, no Armor Break, no rolled crit. The ghost goes whatever damage it did. A kill is a `VolleyKill` marked `phantasm`, paid through `finds.kill`.
**In a turn** (`Game.endTurn`): along the step after Thunderbolt and before the volley (`first` = 1), then again from `TURN_TICKS` after `aggroTurn`, for what stepped up. A turn onto another floor counts as standing at the arrival.
Its `Shot` carries `phantasm`: no art of its own in `drawVolley`, only its number and HP bar, landing the moment it strikes.
**Drawing** (`drawPhantasms`, `render/effects/phantasm.ts`, in `drawOverlays`, above the darkness): `paintGhost`, a pixel ghost half a tile wide, one path a colour so it blends evenly at the `phantasmAlpha` setting, round the hero as drawn and turning by `Game.turnClock`. `Game.ghostFx` keeps each strike: the ghost shows until the moment it struck, then `paintGhostBurst`, a fading ring where it was. Reduced motion stills the bob and shows no burst.

**Necrotic Frost** (`src/arcana/necrotic-frost.ts`, trigger `cooldown`; `ArcanaDesk.frostRule`, `Game.frostArea`, `Game.decayNecro`, `necroDecay` in `volley.ts`) sets stacking fields round the hero, which slow what stands in them and leave a decay on what they touch.
**Its state** is `run.necroticFrost` (`FrostRun`: `timer`, `casts`, `fields`), in the run like Time Dilation's, so undo takes it back with what it did and a replay comes out the same; `ArcanaDesk.turn` leaves it out of `tickCooldowns`, and `frostTurn` runs `stepFrost` in `Game.endTurn`, after Phantasm's turn.
`stepFrost` counts each field's `left` down and the cooldown, which starts over the moment it runs out and adds a field, keeping those still standing, so a Duration as long as the Cooldown is constant, and a longer one overlaps.
**A field** (`FrostField`) is its `id` (`casts` at its making), its `left`, and its `angle`: whole hundredths of a degree, a `tileRandom` by the run's seed and that id.
Where it lies decides play, so `frostArea` takes its offset (`offset`, 1 tile) from `pointing`, relative to the hero, so it moves with the hero, onto the next floor too.
`frostEffects(save)` is the one place research will raise it: `radius` (3 tiles), `offset`, and the slowdowns.
An enemy is in a field (`fieldsOn`) by Euclidean distance from the field's center to its tile's, round the Delve's wrap, walls or no walls.
**Slowing:** `frostSlowAt` gives `slow` (25%) in one field and `overlap` (50%) in two or more, however many.
It slows through what Time Dilation's does, all of it by position: `Game.slowdownAt` (the fight's `Player.slowdown`, the Aggroed step's `AggroTurn.slowAt`), `VolleyTurn.frost` (a shooter's cooldown, by its `slowAt`), and `slowedAt` in a trial.
`togetherSlow` multiplies the two arcana's slowdowns as two kinds of source, up to `SLOWDOWN_CAP`.
**An effect** per field on each enemy: `Tile.necro` (`Necro`, field id to its ticks), in `run.changes` beside `wound` and moving with an Aggroed enemy, read onto the enemy as `Enemy.necro` by `wounded`, never saved on it; `enemyTitle` then says "Necro", and `tile-info.ts` adds a line.
**A turn's decay** (`necroDecay`, called from `Game.decayNecro` last of all in `endTurn`, after the volley, `aggroTurn`, the ghosts and Lifespring, so it reaches what stepped up): the enemies in reach of a field and every `necro` tile of `run.changes`, wherever it stands.
`decayed` starts the effect of each field touching it and ticks every effect once; `units`, the sum of the ticks, is how many steps it takes: 1, 2, 3 for one field.
A step is `attackAgainst` the enemy × Arcanum Damage's boost (the crits' average) × Overseer's beam at `TURN_TICKS`, through DEF (no `defenseAgainst`), cut by a Shielded enemy's bubble (`guarded`), with no Lifesteal and no Armor Break; wounding a Flying enemy makes it Aggroed, as any wound does.
An enemy takes one `Shot`, however many effects are on it.
A kill is a `VolleyKill` marked `necro`, paid through `finds.kill`.
A floor climbed from is gone, its `run.changes` with it, so its enemies' decay ends there.
**Switched off** (`clearFrost`), the fields and cooldown go and `casts` stays; the marks stay on the tiles and don't tick until it is on again, at the ramp where they were.
Its `Shot` carries `necro`: no art of its own in `drawVolley`, only its number and HP bar, landing at once at `TURN_TICKS`.
**Drawing** (`render/effects/necrotic-frost.ts`): `drawFrostFields`, `paintFrostField`, through the same `underContents` hook as Time Dilation's, so it lies over the baked floor and under items and enemies: a `#b48cff` disc at 20% alpha, a pale green ring at its edge and a pale purple one just inside, then `paintBubbles`, `BUBBLES` a field, each from `now` and `tileRandom` alone, nothing kept and no stream drawn on, growing and then popping into a fading ring. Reduced motion shows no bubbles.

**Voidwell** (`src/arcana/voidwell.ts`, trigger `cooldown`; `ArcanaDesk.voidwellRule`, `Game.voidwellTurn`, `Game.vortex`) opens a vortex out on the floor that stuns what is in it.
**Its state** is `run.voidwell` (`VoidwellRun`: `timer`, `casts`, `vortex`), in the run like Time Dilation's, so undo takes it back with what it stunned and a replay comes out the same; `ArcanaDesk.turn` leaves it out of `tickCooldowns`, and `Game.voidwellTurn` runs `stepVoidwell` in `Game.endTurn`, after Necrotic Frost's turn and before anything strikes, so a new vortex stuns that turn's shots and steps.
`stepVoidwell` counts the vortex down and the cooldown, which starts over the moment it runs out and opens a new one in the old one's place; Duration's highest is under Cooldown's lowest, so as the tables stand they never meet.
A vortex stands where it opened, whatever the hero does, and lasts its turns onto a new floor: its coordinates carry over, so on a Tower floor it lies at the same place on the new board, and in the Delve at the same place in the world. It stuns what stands there, and placement isn't checked again.
Switching it off clears the timer and vortex (`clearVoidwell`); `casts` stays, so the rolls go on.
**Where it opens** (`placeVortex`) decides play, so it is exact in every engine: `UNITS`, `ANGLES` (720) directions from `pointing`, and one `voidwellRoll` (`tileRandom` by the run's seed and `casts`) picks among those whose center is allowed at `distance`, the hero's shot range (`Game.lifespringReach`: 3 tiles untrained, whether or not the hero is an Archer).
Allowed means its edge is at most a tile past the floor's in every direction: a center between `low - 1.5 + radius` and `high + 1.5 - radius` of `Board.floorBounds`, the smallest bounds of the floor's tiles that aren't walls, by their centers (the Tower's floor, or in the Delve `floorTiles` of the hero's area and equivalent floor).
A vortex too wide for an axis lies across its middle.
If no angle fits, the distance shrinks by `DISTANCE_STEP` (0.25 tile) until one does; if the hero stands too far from any allowed place even at its range (a big vortex beside a corner), it grows until one does instead, since the floor outranks the range.
**Being in it** (`inVortex`) is Euclidean from its center to the tile's, round the Delve's wrap, walls or no walls.
**The stun is read, not stored**: both worlds' `tile` pass each enemy through `stunnedTile` (`Board.vortex`, which the `Game.world` setter points at `Game.vortex` for every board), marking `enemy.stunned` and bringing a Flying enemy down to an enemy tile, `flying` kept; then `guardedTile` runs over that, so a Shielded enemy's bubble guards it.
`run.changes` keeps the raw tile, so when the vortex ends the enemy is itself again, wounds and all, and nothing about the stun is saved.
So a grounded flyer is an ordinary enemy to `Game.move`, `predict`, the planners, Damage Visual and the inspect panel, and `Board.wound`, `clear` and the marks still reach its raw tile.
Two readers keep its `flying` in mind: `noEnemies` doesn't count it, as it doesn't count one in the air, and `enemiesWithin` still finds it over the tile it is asked about.
**What a stun stops**, each read off `stunned`:
- Moving: `aggroTurn`'s `stunnedAt` skips an Aggroed enemy, its `stride` held. The others walk round it, since it reads as an enemy, not open floor.
- Firing: `shoots` is false, and `volleyTurn` carries its `run.volleys.foes` charge as it stood, so the cooldown stands still (absent means ready, so one stunned ready still fires as it is freed).
- Striking first: `strikesFirst` (`combat.ts`, read by `predict`, `lifestealEnding`, `bout`, `resume`, `critForecast`, `Game.move`'s First Strike and `DamagePredictions`' key).

What it leaves alone: a stunned enemy still replies in a fight, the Shielded bubble holds, Armored's DEF and Fast's raised ATK stay in its stats, its attribute icons and kill pay stay, and the enemy cards still read its attributes.
**Drawing** (`render/effects/voidwell.ts`): `drawVortex`, `paintVortex`, through the same `underContents` hook as Time Dilation's, first of them: a see-through dark blue radial disc with a rim, and `ARMS` spiral arms turning once in `TURN_MS` (9 s); reduced motion stills them. `drawFlyers` adds a themed board's wing to an enemy that is `flying` on the ground; Classic's baked enemies wear it already.

**Toggles.** `ricochetAnimation` and `thunderboltAnimation` (Settings' Toggles menu, once `arcanaOpen`), and `lifespringDamage`, `phantasmDamage` and `necroDamage` (once it is owned or lent), only hide: `Game.showVolley` leaves those shots out of the volley it shows, so no line or bolt, number or sound, and `TrialRenderer` skips them by its `hidden` option. They strike all the same.
`phantasmAlpha` (a slider, 0 to 1, default 0.5, shown with `phantasmDamage`) is how solid the ghosts and their bursts are drawn; at 0 they don't draw at all.

**In a trial.**
Aurum Bloom raises floors a trial doesn't have; every other arcanum works, and a lent one doesn't exist there.
`TrialSession` deletes Aurum Bloom from its `Game`'s copy, and points that `Game`'s `tower.runArcana` at `state.arcana.run` (`TrialArcana`, `trial-spells.ts`, saved with the attempt, none without arcana), so the run bar's Arcana tab toggles the attempt's own, never the ordinary run's.
`sync` copies what the desk gives into `state.arcana.spells` (not saved) before each turn.
`trialStep` is the only turn: `noteStrike` records what the hero's step strikes, and `trialArcanaTurn` (`trial-arcana.ts`) follows every accepted arena turn while the attempt is active, staging's steps being none.
- `targets` lists what can be struck: a corporeal boss, Light Slimes, mimics, a boss's parts and its minions; an incorporeal boss is invincible, so it isn't one.
- A hit is `max(1, round(ATK × boost × beam − DEF))`, DEF as the hero's own hits read it. It only wounds: no teleport, key drop, coin pop or counter. A slime it hits disperses, a minion it fells pays its Silver, its damage counts toward `damageThisRun`, and a boss it fells wins the attempt as the last hit would.
- Thunderbolt follows the rules above, by `chargeBolts` and `settleBolts` on the attempt's run.
- Lifespring runs the same `stepLifespring` on `state.arcana.lifespring`, with `game.run.lifespring` pointing at it for the card; `lifespringTurn` in `trial-arcana.ts` strikes after the bolts, reaching `spells.lifespring.reach`. `state.arcana.springWaves` counts every wave for everything in the arena, what comes later too. Nothing in a trial pays a kill, so Health, Gold and Cell Bonus find nothing to raise, and DEF Reduction isn't read.
- Time Dilation runs the same `stepDilation` on `state.arcana.dilation`, with `game.run.timeDilation` pointing at it for the card, at the end of `trialArcanaTurn`, so its field holds back the turns after it; `slowedAt` (`trial-spells.ts`) reads the distance from the hero. Each foe's counter or bite and its scheduled step asks `foeActs`, with a tally per foe in `state.arcana.tallies` (`boss`, `part:<id>`, `minion:<id>`, `mimic:<id>`, and `move:…` for steps), going on across the hero's hits. A boss effect's schedule runs on a boss clock (`bossClock`: the attempt's turns less `state.arcana.lag`, in hundredths of a turn, with its own `turret` clock for the Blaster Turret): `bossTurn` holds it back by Slowdown while what owns it stands in the field and says what falls due, a clock passing its mark rolling what it passed by on to the next. With no field it is exactly the turns of before. Regeneration has no cooldown, so it isn't slowed, and neither is the Obelisk's turn limit. See proving-grounds.md for what each trial's schedule is.
- Phantasm runs the same `stepPhantasm` on `state.arcana.phantasm`, with `game.run.phantasm` pointing at it for the card; `phantasmTurn` in `trial-arcana.ts` strikes after Lifespring, once as the turn ends, a trial's turn having no ticks, so it reads no walk. `spells.phantasm` is `phantasmRule` as it stands; `TrialRenderer` draws the ring at `phantasmAlpha` and each `TrialStrike` of kind `phantasm` as a burst at its `from`, the ghost's place.
- Necrotic Frost runs the same `stepFrost` on `state.arcana.frost`, with `game.run.necroticFrost` pointing at it for the card; `frostTurn` in `trial-arcana.ts` follows Phantasm, before Time Dilation. What is on each foe is `state.arcana.necro`, by `Target.key` (`boss`, `slime:<id>`, `mimic:<id>`, `part:<id>`, `minion:<id>`); a hit is `max(1, round(ATK × boost × beam × steps))`, DEF not read. A boss gone incorporeal isn't a target, so its decay waits, and what is on a fallen foe is dropped. `slowedAt` adds its slowdown to Time Dilation's by `togetherSlow`, so counters, steps and boss clocks read it; `TrialRenderer` paints the fields by the same `floorFields`, and each `TrialStrike` of kind `necro` shows only its number.
- Voidwell runs the same `stepVoidwell` on `state.arcana.voidwell`, with `game.run.voidwell` pointing at it for the card; `voidwellTurn` in `trial-arcana.ts` follows Necrotic Frost, before Time Dilation, so its vortex holds back the turns after it, and adds `fits` to `placeVortex` for the arena's six sides (bounds 1 to 23). `stunnedIn` (`trial-spells.ts`) reads `inVortex`: `foeActs` returns false for its `move:` keys, a counter or bite being its answer to a hit, as in a run's fight; `bossTurn` holds a clock back a whole turn (`lag`), so a boss's or turret's effects don't fall due. `TrialRenderer` paints it with the floor's other fields.
- A trial has no arrows, so Ricochet Shot springs from each hit of the hero's instead, a fixed roll per seed, turn and tile, to the closest other targets (never the one struck, even if it has moved: `Target.foe`).
- Overseer multiplies the hero's hits through `heroAttackOn` at every strike site in `trial.ts`, `keymaster.ts` and `boss-variants.ts`, and `state.arcana.beamTurns` keeps its turn. A new hit there must read it too.
`state.arcana.strikes`, the last turn's, are what `TrialRenderer` draws; it also paints the beams.

**The run.**
`ArcanaDesk.held` is what the run holds: owned at their levels, and lent at their first.
`slice.runArcana` (`ArcanaRun`, `decodeArcanaRun`) sits beside the run, like `runFinds`, so undo never touches it, and `newRun` resets it: the toggles spent (`RUN_TOGGLES`, all arcana together), those off, the cooldowns left, and Thunderbolt's bolts and strikes.
So undo takes back what a bolt did to the board but not its cooldown: the bolts are spent.
Toggling off forgets the arcanum's cooldown, and Thunderbolt's bolts, so it starts over when turned on.

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
A card with a cooldown holds `.arcana-cooldown`, a `progressbar` filling as it runs down, the turns left at its right end, kept up on every redraw.
The bar shows inside a run holding any arcanum, even before On the Job.
`enhancementsOf` gives the rows of research enhancements both information views show; none are defined yet.
The `.arcana-attr` and `.arcana-switch` rules use two ids to beat the themes' and the sprite kit's blanket button rules.

**Tests.** `tests/arcana.test.ts`, `tests/aurum-bloom.test.ts`, `tests/overseer.test.ts`, `tests/thunderbolt.test.ts` (with the arcana in trials), `tests/lifespring.test.ts`, `tests/time-dilation.test.ts`, `tests/phantasm.test.ts`, `tests/necrotic-frost.test.ts`, `tests/voidwell.test.ts`; `node tests/voidwell.mjs` (dev server) checks the vortex's pixels and spin in the Tower and a trial, its colours, its card and a real activation, with review images in `test-results/voidwell/`; `node tests/necrotic-frost.mjs` (dev server) checks the field's pixels and colours in the Tower and two trials, the bubbles moving, its card and a real activation, with review images in `test-results/necrotic-frost/`; `node tests/phantasm.mjs` (dev server) checks the ghosts' pixels and their alpha, the Toggles' two controls, its card and a real activation, with review images in `test-results/phantasm/`; `node tests/time-dilation.mjs` (dev server) checks the field's pixels in the Tower and three trials, its card and a real activation, with review images in `test-results/time-dilation/`; `node tests/lifespring.mjs` (dev server) checks the rings' pixels and its card, with review images in `test-results/lifespring/`; `node tests/thunderbolt.mjs` (dev server) checks the card's bar, real strikes' pixels, the toggle and a trial, with review images in `test-results/thunderbolt/`.

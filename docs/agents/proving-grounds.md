# Proving Grounds

The gold square two columns right of the Tower forest's path on row 4 opens **Proving Grounds Trials** when entered.
`OutsideWorld.isProvingGrounds` identifies it, `Game.land` stops the route and asks for its menu, and `ProvingGroundsDialog` owns the shared modal, controls, persistence and frame lifecycle.
The two trials are separate encounters: `save.provingGrounds` stores the current attempt, while ordinary Tower and Delve runs, equipment, currencies and supplies remain untouched.
The player's current max HP, ATK and DEF are copied into the attempt, which starts at full HP; other normal-run combat systems do not apply.
Leaving or cancelling discards the attempt and returns to the same forest square, and a reload resumes the saved attempt.

## Controls and cards

Trial I snapshots the equipped hand and plays automatically; Trial II has manual movement and no cards.
`autoplay.ts` adapts the staging room and arena into a `Board` and isolated `TowerRun` for the existing `planHand` planner, preserving card priority and enemy categories.
It replans each turn because slime targets and the elemental move; a corporeal elemental is a boss enemy, an incorporeal elemental is passable floor, and slimes are weak enemies.
There are no normal-run card activations, badges, supplies or rewards in either encounter.
The dialog shows the copied hand and pause/resume for Trial I, and direction/wait controls for Trial II.
Card autoplay advances at most one turn per 450 ms animation frame while visible, without catching up missed turns.
While the elemental is incorporeal, a hand with no reachable target spends a wait turn instead of pausing, so the lasers can restore its body.
Otherwise a hand with no reachable target pauses with an explanation; a retry or new entry copies the equipped hand again.
All manual event handlers go through `trialStep`, whose source/mode guard also rejects manual actions in card trials and card actions in manual trials.
Paused card attempts remain paused across reloads.

## Turns and persistence

`trial.ts` is the pure turn model: a 9×9 staging room leads through stairs to a hexagonal chamber whose walls fit inside 25×25 tiles.
The Light Elemental starts at (12,12); stepping into its corporeal body strikes it, with a smaller return hit from its radiance.
Each nonlethal hit deterministically relocates it to a different free interior tile at least six Manhattan tiles from its former position, away from the hero, slimes and wall potions.
Its saved `elemental` holds its position, `incorporeal` flag and last teleport origin/turn; ghost tiles are walkable and cannot be damaged or targeted by cards.
The next laser volley restores corporeality, including when a hit and volley fall on the same turn.
If the hero occupies the ghost's tile then, `materialize` moves the boss into the nearest free tile before casting, preventing a solid overlap without moving the hero.
Every accepted move, strike or wait counts as one turn; blocked moves cost none, and staging moves do not advance arena hazards.
Every third arena turn existing light slimes hop within a two-tile square radius and the elemental releases one more, up to six at once.
Hops and elemental teleports use the saved seed and turn through `tileRandom` (plus the slime ID or teleport origin), so reloads preserve their future destinations without consuming another system's RNG.
Slimes reserve their occupied tiles during a pulse, cannot land on walls, the boss or one another, and a landing on the hero deals 5% max HP before the slime disappears.
Walking into a slime disperses it and moves onto its tile.
Every tenth arena turn fires two rays from the elemental's current tile along the next axis: north–south, northeast–southwest, east–west, southeast–northwest, then repeat.
The saved `beam` records its origin, axis and turn, keeping a recent flash anchored even if the boss teleports again.
Rays stop on the first wall and mark its surface as well as every floor tile crossed; a hit costs 25% max HP, while each wall-side potion restores 35% once.
Cracks persist for the attempt, their glow fading over 30 turns; victory removes the slimes and prevents further attacks, and defeat offers a fresh attempt or a safe exit.
Boss HP is at least 240 and otherwise 24 times the copied ATK.

`decodeTrial` bounds the hand, seed, elemental phase/position, teleport origin/turn, beam origin/axis/turn, slime positions/IDs/hop origins, potion keys and scorch timestamps, and rejects invalid mode/input state.
Trial layout version 2 restarts unversioned 50×50 attempts in manual staging with their copied stats, avoiding invalid positions after the shrink.
Existing version 2 attempts without the additive elemental/beam fields keep their progress and gain a corporeal boss at the original center plus their last center-origin volley.
Old saves without an attempt remain unchanged.

## Rendering and tests

`elemental-art.ts` owns the elemental body, ghost palette and teleport particles; `render.ts` reuses Classic stone, hero, potion and torch art, adds pixel Light Elemental and light slime sprites, and follows the player over 17×17 tiles.
The arena has no ambient floor light: only torches, glowing enemies, smoldering cracks and the hero's small foothold light reveal it.
Slime hops interpolate for 260 ms on native pixel coordinates; Reduce motion displays their new tiles immediately.
Animation state is presentation only and resets on reload; saved destinations remain authoritative.
A teleport breaks the literal body texels into staggered curved paths with fading trails, then crossfades them into a translucent cyan body over 1,100 ms.
Its animation clock is independent of player turns, and subsequent turns do not reset it; Reduce motion skips the flight and bobbing while preserving the ghost silhouette.
Beam flashes last 900 ms, while visible cracks and their turn-based glow survive reloads.
`tests/proving-grounds.test.ts` covers topology, entry, timing, slime collisions and deterministic reloads, mode input authority, real card priorities, combat, migration and separation from ordinary runs.
`npm run test:proving` exercises both modes, manual-input rejection, reload, autoplay and mobile layouts with the dev server running.
The render goldens include staging, elemental, beam, glow, wall-scar, slime-hop, dissolution, light trails, reformation, ghost/reduced-motion and restored-corporeal laser frames.

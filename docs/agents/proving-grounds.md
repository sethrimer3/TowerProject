# Proving Grounds

The gold square two columns right of the Tower forest's path on row 4 opens **Proving Grounds Trials** when entered.
`OutsideWorld.isProvingGrounds` identifies it, `Game.land` stops the route and asks for its menu, and `ProvingGroundsDialog` owns the entrance menu, trial controls and main-board presentation.
Only the selection menu uses the shared modal; the encounter itself uses `#world`, the normal HUD, `#hand` and `RunTrainingBar`.
Its numeric level selector (1–10,000) previews the encounter rules and remembers the selection in `save.trialAccess.level`.
`access.ts` owns the shared two-key daily allowance (`day`, the UTC day index, and `spent`); `trialKeys` refills on a strictly later day, and `spendTrialKey` guards both entry and retry before replacing an attempt.
Unused keys do not bank; reload/resume does not charge, and Dev mode bypasses spending without changing the ordinary allowance.
The controller's once-a-second `tick` refreshes an open list or finished encounter across midnight, so disabled entries/retries become available without a reload.
The two trials are separate encounters: `save.provingGrounds` stores the current attempt, while ordinary Tower and Delve runs, equipment, currencies and supplies remain untouched.
The player's current max HP, ATK and DEF are copied into the attempt, which starts at full HP; other normal-run combat systems do not apply.
`session.ts` creates an isolated `Game` over a cloned profile and the live `trialBoard` so the shared HUD and run-training bar use their existing code.
Only trial stats, run-training ranks and trial Silver are copied back into the attempt; permanent currencies and the ordinary mode runs remain separate.
Settings remain shared so normal speed and display choices persist.
Leaving the trial or pressing Escape on its board discards the attempt and returns to the same forest square, and a reload resumes the saved attempt.

## Controls and cards

Trial I snapshots the equipped hand and plays automatically; Trial II has manual movement and no cards.
`autoplay.ts` adapts the staging room and arena into a `Board` and isolated `TowerRun` for the existing `planHand` planner, preserving card priority and enemy categories.
It replans each turn because slime targets and the elemental move; a corporeal elemental is a boss enemy, an incorporeal elemental is passable floor, and slimes are weak enemies.
There are no normal-run card activations, badges, supplies or rewards in either encounter.
The existing On the Job unlock and Silver prices govern ATK, DEF and Max HP purchases; unsupported training rows are filtered rather than accepting purchases with no encounter effect.
Trial Silver starts at `Game.startingSilver`, and purchases do not advance arena movement/hazard turns.
The normal HUD shows the trial hero and play/pause/speed controls, and the normal hand displays the copied equipped cards.
Manual trials retain those card faces with red X overlays and `aria-disabled`, while their actual planning hand remains empty.
The manual direction/wait buttons and boss countdown sit over the shared canvas; the main HUD and purchase bar keep their normal layout.
Card autoplay follows the normal Movement Speed setting and advances at most one turn per visible frame, without catching up missed turns.
`FrameLoopHost.boardFrame` lets the trial own board drawing and turns before ordinary routes/automove run; normal board input is suppressed while the trial owns it.
While the elemental is incorporeal, a hand with no reachable target spends a wait turn instead of pausing, so the lasers can restore its body.
Otherwise a hand with no reachable target pauses with an explanation; a retry or new entry copies the equipped hand again.
All manual event handlers go through `trialStep`, whose source/mode guard also rejects manual actions in card trials and card actions in manual trials.
Paused card attempts remain paused across reloads.
Resume explicitly selects the saved Tower forest before attaching the encounter, so an older paused Delve cannot take over the trial or its exit.

## Turns and persistence

`trial.ts` is the pure turn model: a 9×9 staging room leads through stairs to a hexagonal chamber whose walls fit inside 25×25 tiles.
The Light Elemental starts at (12,12); stepping into its corporeal body strikes it, with a smaller return hit from its radiance.
Each nonlethal hit deterministically relocates it to a different free interior tile at least six Manhattan tiles from its former position, away from the hero, slimes and wall potions.
Its saved `elemental` holds its position, `incorporeal` flag and last teleport origin/turn; ghost tiles are walkable and cannot be damaged or targeted by cards.
The next laser volley restores corporeality, including when a hit and volley fall on the same turn.
If the hero occupies the ghost's tile then, `materialize` moves the boss into the nearest free tile before casting, preventing a solid overlap without moving the hero.
Every accepted move, strike or wait counts as one turn; blocked moves cost none, and staging moves do not advance arena hazards.
Every third arena turn existing light slimes hop within a two-tile square radius.
Independent releases happen every `max(2,20-2*floor(level/5))` arena turns, up to six slimes at once; spawned IDs are the turn of release, and a new slime immediately hops out from the elemental.
`ARENA_TORCHES`, `ARENA_CRATES` and `ARENA_POTIONS` occupy distinct cardinal wall-adjacent floor tiles, with a coordinate pattern keeping potions at their previous positions.
Crates and standing torches remain passable floor props; they do not alter the card planner's board or block movement or rays.
Slime landing tiles and every laser cell call `breakProp`, recording a prop's first destruction turn in `destroyed`.
Potions cannot be destroyed, and repeat hits do not reset a prop's destruction turn.
Hops and elemental teleports use the saved seed and turn through `tileRandom` (plus the slime ID or teleport origin), so reloads preserve their future destinations without consuming another system's RNG.
Slimes reserve their occupied tiles during a pulse, cannot land on walls, the boss or one another, and a landing on the hero deals 5% max HP before the slime disappears.
Walking into a slime disperses it and moves onto its tile.
Every tenth arena turn fires `min(8,1+floor(level/10))` rays from the elemental's current tile.
`beamHeadings` spreads them over eight compass headings via `floor(i*8/count)` offsets, then rotates the pattern one heading per volley.
The saved `beam` records its origin, first heading (`axis`), count and turn, keeping a recent flash anchored even if the boss teleports again.
Rendering, telegraphs, HUD directions, damage and scars use the same headings and ray cells.
Rays stop on the first wall and mark its surface as well as every floor tile crossed; a hit costs 25% max HP, while each wall-side potion restores 35% once.
Cracks persist for the attempt, their glow fading over 30 turns; victory removes the slimes and prevents further attacks, and defeat offers a fresh attempt or a safe exit.
Boss HP is `ceil(max(240,24*ATK)*(1+(level-1)/10))`; each level adds 10% of base HP while existing damage fractions remain unchanged.

`decodeTrial` bounds the hand, seed, elemental phase/position, teleport origin/turn, beam origin/axis/turn, slime positions/IDs/hop origins, potion keys and scorch timestamps, and rejects invalid mode/input state.
Trial layout version 2 restarts unversioned 50×50 attempts in manual staging with their copied stats, avoiding invalid positions after the shrink.
Existing version 2 attempts without the additive elemental/beam fields keep their progress and gain a corporeal boss at the original center plus their last center-origin volley.
The additive `displayHand` preserves visible cards even for manual attempts, while `purchases` holds trial Silver and known training ranks.
The additive `destroyed` map contains only known crate/torch floor coordinates with valid past turns; old attempts default to an empty map, keeping their progress and adding the new props intact.
Older attempts infer the displayed hand and start their isolated purchase balance on resume.
Attempts without a level resume at level 1, retain their saved HP and slimes, and keep a previously fired two-ray flash when its saved beam has no count.
Legacy four-axis beams normalize to the equivalent eight-heading axis on decode, so migrated attempts round-trip again after saving.
Old saves without an attempt remain unchanged.

## Rendering and tests

`elemental-art.ts` owns the elemental body, ghost palette and teleport particles; `render.ts` reuses Classic stone, hero, potion and torch art, adds pixel Light Elemental and light slime sprites, and follows the player over 17×17 tiles.
The controller passes `usesGameSprites(save)` and Animations into every trial frame, so the live Sprites setting, board-art opt-out and independent Game theme gate agree with the normal Tower renderer.
With the kit enabled, shared `paintTile` draws connected native paving and wall contours over the trial geometry, `paintContents` draws stairs and potions, and `paintHero`/`paintTorch` select the same PNGs and ambient animation options as the main board.
Kit crates draw at their native 24-pixel size, and broken crates retain their native 12-pixel pieces; legacy procedural crates and other old art remain complete off/loading/failure fallbacks.
Hero facing follows trial movement; its optional idle cycle uses `HeroIdleAnimation` and honors Reduce motion.
The trial repaints every frame, so late images and settings changes do not need a separate cache invalidation path.
Edge crates reuse `drawCrates` and its splintered-board wreckage; floor torches have small iron stands and leave charred fragments when broken.
Both torch painting and its darkness-mask light source read the same persisted destruction state, so an extinguished torch cannot keep illuminating the room or return on reload.
The arena has no ambient floor light: only torches, glowing enemies, smoldering cracks and the hero's small foothold light reveal it.
Slime hops interpolate for 260 ms on native pixel coordinates; Reduce motion displays their new tiles immediately.
Animation state is presentation only and resets on reload; saved destinations remain authoritative.
A teleport breaks the literal body texels into staggered curved paths with fading trails, then crossfades them into a translucent cyan body over 1,100 ms.
Its animation clock is independent of player turns, and subsequent turns do not reset it; Reduce motion skips the flight and bobbing while preserving the ghost silhouette.
Beam flashes last 900 ms, while visible cracks and their turn-based glow survive reloads.
`tests/proving-grounds.test.ts` covers topology, entry, timing, slime collisions and deterministic reloads, mode input authority, real card priorities, combat, migration and separation from ordinary runs.
`tests/trial-session.test.ts` covers the isolated HUD/training Game, real stat purchases, persistence, unsupported rows and protection of the original run.
`tests/trial-levels.test.ts` covers HP scaling, every beam/spawn breakpoint and cap, ray damage, independent hopping, deterministic reloads, UTC refill, clock rollback and Dev bypass.
`tests/trial-props.test.ts` checks floor-edge placement, unique prop tiles, every breakable's laser contact, deterministic slime landings (including on the hero), persistence, fresh retries and defensive decoding.
`node tests/trial-props.mjs` uses the dev server to check 320/1024-pixel edge layouts, actual torch-light loss, beam/slime destruction of both types, reloads and protection of the ordinary Tower run.
Its review fixtures enable Sprites, matching the current game art instead of silently capturing the older fallback.
`node tests/trial-sprites.mjs` checks actual trial PNG draws, native hero/stair texels, delayed-image recovery, exact live off/on restoration, board opt-out, hero facing, independent UI/Game theme gates, 320/390/1024-pixel previews and destroyed-prop PNGs.
`npm run test:proving` exercises both modes in the main shell, red X cards, actual training purchases, manual-input rejection, reload, autoplay, victory/retry and 320/390/1024-pixel layouts with the dev server running.
The render goldens include staging, elemental, beam, glow, wall-scar, slime-hop, dissolution, light trails, reformation, ghost/reduced-motion and restored-corporeal laser frames.
Five appended sprite-kit frames cover staging, intact edge props, beam damage, extinguished torches and the board-art opt-out; the earlier legacy trial frames remain unchanged.

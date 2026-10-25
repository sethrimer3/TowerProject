# Proving Grounds

The gold square two columns right of the Tower forest's path on row 4 opens **Proving Grounds Trials** when entered.
`OutsideWorld.isProvingGrounds` identifies it, `Game.land` stops the route and asks for its menu, and `ProvingGroundsDialog` owns the entrance menu, trial controls and main-board presentation.
Only the selection menu uses the shared modal; the encounter itself uses `#world`, the normal HUD, `#hand` and `RunTrainingBar`.
`catalog.ts` defines one entry per boss, its trial number, difficulty multiplier and first-clear reward.
Selecting Trial 1 — Light Elemental or Trial 2 — Keymaster opens a picker for Without cards, Only with cards or With both; there is no difficulty selector.
`progression.ts` selects the highest cleared difficulty plus one (up to 10,000), shared by all three controls for that boss.
`access.ts` owns the shared two-key daily allowance (`day`, the UTC day index, and `spent`); `trialKeys` refills on a strictly later day, and `spendTrialKey` guards both entry and retry before replacing an attempt.
Unused keys do not bank; reload/resume does not charge, and Dev mode bypasses spending without changing the ordinary allowance.
The controller's once-a-second `tick` refreshes an open list or finished encounter across midnight, so disabled entries/retries become available without a reload.
The three control options share one encounter and progression: `save.provingGrounds` stores the current attempt, while ordinary Tower and Delve runs, equipment, currencies and supplies remain untouched.
The player's current max HP, ATK and DEF are copied into the attempt, which starts at full HP; other normal-run combat systems do not apply.
`session.ts` creates an isolated `Game` over a cloned profile and the live `trialBoard` so the shared HUD and run-training bar use their existing code.
Only trial stats, run-training ranks and trial Silver are copied back into the attempt; permanent currencies and the ordinary mode runs remain separate.
Settings remain shared so normal speed and display choices persist.
Leaving the trial or pressing Escape on its board discards the attempt and returns to the same forest square, and a reload resumes the saved attempt.

## Controls and cards

`TrialMode` is `cards`, `manual` or `hybrid`.
Cards-only snapshots the equipped hand and plays automatically; manual has no active cards, while hybrid retains autoplay and accepts player commands.
`autoplay.ts` adapts the staging room and arena into a `Board` and isolated `TowerRun` for the existing `planHand` planner, preserving card priority and enemy categories.
It replans each turn because slime targets and the elemental move; a corporeal elemental is a boss enemy, an incorporeal elemental is passable floor, and slimes are weak enemies.
There are no normal-run card activations, badges, supplies or rewards in these encounters.
The existing On the Job unlock and Silver prices govern ATK, DEF and Max HP purchases; unsupported training rows are filtered rather than accepting purchases with no encounter effect.
Trial Silver starts at `Game.startingSilver`, and purchases do not advance arena movement/hazard turns.
The normal HUD shows the trial hero and play/pause/speed controls, and the normal hand displays the copied equipped cards.
Manual trials retain those card faces with red X overlays and `aria-disabled`, while their actual planning hand remains empty.
Manual and hybrid players click a destination tile; `navigation.ts` uses `routeTo(trialPosition(state), x, y)` and replans each step, spending one turn per tile.
A route ends on arrival, a strike on the clicked enemy, a room transition or an ended attempt; routes are transient and reloads clear them.
The canvas maps clicks through `TrialRenderer.tileAt`, using the currently painted fractional 17×17 view, and draws a gold destination outline.
The controller caches camera look-ahead from the current manual route or card plan, invalidating on a turn, command, phase or play/pause change rather than replanning on every draw frame.
There are no movement-arrow buttons; Wait, the boss countdown and leave/retry actions sit over the shared canvas.
Arrow/WASD keyboard shortcuts remain available, and clicking the current tile or pressing Space waits.
Card autoplay follows the normal Movement Speed setting and advances at most one turn per visible frame, without catching up missed turns.
`advanceTrial` plans cards first, then overrides their proposed turn with a pending player route in hybrid mode; only one turn is spent.
Routes run at least four steps per second and work while hybrid cards are paused; autoplay resumes after the route if it was playing.
`FrameLoopHost.boardFrame` lets the trial own board drawing and turns before ordinary routes/automove run; normal board input is suppressed while the trial owns it.
While the elemental is incorporeal, a hand with no reachable target spends a wait turn instead of pausing, so the lasers can restore its body.
Otherwise a hand with no reachable target pauses with an explanation; a retry or new entry copies the equipped hand again.
All manual event handlers go through `trialStep`, whose `TrialInput` source/mode guard rejects manual actions in card trials and card actions in manual trials, while allowing both sources in hybrid mode.
Paused card and hybrid attempts remain paused across reloads.
Resume explicitly selects the saved Tower forest before attaching the encounter, so an older paused Delve cannot take over the trial or its exit.

## Progression and rewards

`save.trialAccess` stores `points` and a per-boss `progress` map alongside daily key usage.
Each progress record holds the highest `cleared` difficulty and sorted `claimed` difficulty receipts.
`settleTrialVictory` advances the shared record on any mode's victory and awards exactly N Trial Points for difficulty N if its receipt is absent.
The wallet, receipt and lifetime `earn(save, "trialPoints", N)` tally persist together; reloading or settling an old result pays nothing again and never lowers progress.
No Gold or Gems are paid; Trial Points have no spending use yet.
The list and picker show the boss's next difficulty, multiplier and reward; the HUD shows the current difficulty and multiplier.
A victory's Next difficulty or a defeat's Try again opens the control picker without spending a key; choosing a control starts and charges the attempt.
The highest cleared difficulty is never manually selectable, and finishing difficulty 10,000 disables further entries.

## Turns and persistence

`arena.ts` owns the shared hexagonal geometry and edge props; `trial.ts` dispatches the pure turn model after a shared 9×9 staging room.
`KEYMASTER_WALL_BLOCKS` defines six fixed square cover clusters, four 2×2 and two 3×3, inside the shared outline.
`keymasterArenaFloor` excludes them, and `trialFloor` adds the four Keymaster door cells; staging and Light Elemental geometry remain unchanged.
Player input, card/manual paths, mimic spawns and pursuit, key drops, retreat, teleport destinations and safe reformation all respect this same encounter geometry.
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
Attempts without `trialId` default to `light-elemental`; unknown IDs are rejected, and `hybrid` decodes with the same hand rules as `cards`.
The old selected `trialAccess.level` is ignored and cannot manufacture completed difficulties.

## Keymaster

Trial 2 uses `keymaster.ts` and an optional `TrialState.keymaster` payload; older Light Elemental saves gain no new encounter fields.
The Keymaster starts at the shared center with the same HP multiplier and direct-hit retaliation, but has no lasers or slimes.
`boss-movement.ts` shares the Light Elemental's deterministic teleport and safe reformation rules; a surviving Keymaster hit relocates it at least six Manhattan tiles away and makes it incorporeal.
Every ten arena turns it reforms and becomes vulnerable; an empty-target card hand waits through this phase rather than pausing.
Ghosts are passable floor, cannot be struck and do not count as card enemies; the saved position, phase and teleport history survive reloads.
On every even accepted arena turn, the Keymaster takes one legal cardinal step strictly farther from the player; if walls, actors or pickups block all such steps, it stays put.
Retreat also runs while incorporeal; turning corporeal relocates an occupied ghost safely before exposing it as an enemy.
Every hit scatters exactly three golden keys to three seeded choices of the 24 tiles on its three-tile square-radius ring; walls and positions leaving the arena are excluded, repeated drops stack and stepping onto a pile collects it.
These keys belong only to the encounter and are distinct from daily entry keys.
Two mimics appear on entry; another spawns every `max(2,8-floor(level/5))` turns, up to six alive.
Their HP is `ceil(max(30,6*ATK)*difficultyMultiplier(level))`; a surviving mimic counters for 6% max HP times that multiplier, less 20% of copied DEF, with minimum 1 damage.
Mimic spawns avoid the boss's three-tile key landing ring and occupied tiles.
Every even accepted arena turn, each existing mimic takes one cardinal step along a shortest route toward the player.
A reverse breadth-first map routes around walls, the boss and other mimics; ID order and reserved landing cells prevent stacking and make reloads deterministic.
A mimic reaching the player triggers the same combat or free-key defeat as bumping it; loss ends further contact actions that turn.
Pursuing mimics may stand over key piles, so the board exposes the enemy first and the pickup remains underneath.
Blocked player inputs and staging steps advance neither movement cadence.
Bumping one with Use keys on consumes one key for an immediate kill with no damage; Save keys retains keys and uses normal repeated attacks.
The toggle is saved, costs no turn and also governs card-controlled combat.
`trialBoard` exposes golden key piles, affordable gold doors and strong-enemy mimics to the ordinary cards, with the real key inventory copied into the planner and HUD.
The arena board uses floor bound 0 so routes and cards can reach the south door at row 0.
`KEYMASTER_DOORS` holds the north/east/south/west wall cells `(12,24)`, `(24,12)`, `(12,0)`, `(0,12)`; a locked door spends no turn without a key.
Opening consumes one golden key and stores one `DoorBurst` with a door index, elapsed milliseconds and an impact receipt.
`advanceKeymasterEffects` advances visible flights independently of player turns and card pause; at 1,100 ms a burst removes exactly one fifth of boss max HP once if the boss is corporeal.
Arrivals during invincibility gather at the moving ghost and keep their unspent impact until reformation.
A nonlethal door impact also scatters keys and triggers a ghost teleport; simultaneous pending impacts therefore wait their turn instead of bypassing invincibility.
The controller pauses flights behind an open modal and caps frame deltas at 100 ms, preventing a hidden-tab catch-up.
Opening and impact saves preserve the receipt; intermediate elapsed time is included in any normal attempt save, and reloading a pending flight resumes its remaining duration.
A door impact can win and settle ordinary per-trial rewards without spending another player turn.
Decoding bounds inventories, arena-sized counted key piles, six unique mimics and four unique door bursts.
The encounter payload records `keymaster.layout:2`; unknown layout revisions are rejected, and current-layout actors and keys cannot occupy cover.
Attempts without that marker validate against the old open chamber before `migrateKeymasterLayout` relocates only newly blocked occupants to nearest legal floor with deterministic row/column tie breaks.
Actor reservations prevent collisions, key piles merge when necessary, and a blocked teleport origin relocates too; HP, turn count, keys, training, progress and door receipts are retained.
The migration marks the new layout so reloads are idempotent and never change ordinary Tower/Delve layouts.
It accepts moving boss/ghost/teleport state and fully arrived but unspent bursts, while rejecting invalid positions, contradictory impact receipts and Light Elemental laser/slime hazards.
Key piles may overlap actors; teleport and reformation prefer clear tiles but fall back to item tiles if a crowded room would otherwise prevent safe relocation.
Progress and reward receipts remain independent per trial ID while sharing the same daily entry allowance and points wallet.

## Rendering and tests

`elemental-art.ts` owns the elemental body, ghost palette and teleport particles; `render.ts` reuses Classic stone, hero, potion and torch art, adds pixel Light Elemental and light slime sprites, and follows the drawn player over 17×17 tiles through `camera.ts`'s `TrialCamera`.
The same Movement transition setting as Delve enables Smooth by default, with Fast, Off and Reduce motion honored live.
Smooth/Fast reuse the Delve's dead zone, critically damped spring, edge margin and eight-step look-ahead; arena bounds allow a four-tile border around 25×25 to keep the player clear of overlaid controls, and staging is centered because it fits entirely inside the view.
Off and Reduce motion retain instant centered movement.
`TrialCamera` changes no logical turn, hero stats or enemy state; room changes and reloads reset its transient position.
The controller passes `usesGameSprites(save)` and Animations into every trial frame, so the live Sprites setting, board-art opt-out and independent Game theme gate agree with the normal Tower renderer.
With the kit enabled, shared `paintTile` draws connected native paving and wall contours over the trial geometry, `paintContents` draws stairs and potions, and `paintHero`/`paintTorch` select the same PNGs and ambient animation options as the main board.
Kit crates draw at their native 24-pixel size, and broken crates retain their native 12-pixel pieces; legacy procedural crates and other old art remain complete off/loading/failure fallbacks.
Hero facing follows trial movement; its optional idle cycle uses `HeroIdleAnimation` and honors Reduce motion.
The Keymaster selects `BoardLook.tier:2` in both staging and arena, reusing Tower II's native limestone and connected rectangular paving.
Its arena skips the darkness mask entirely, keeping the floor, wall cover, pickups and hero fully visible while retaining ghost teleports and red door spirits.
The trial repaints every frame, so late images and settings changes do not need a separate cache invalidation path.
Edge crates reuse `drawCrates` and its splintered-board wreckage; floor torches have small iron stands and leave charred fragments when broken.
Both torch painting and its darkness-mask light source read the same persisted destruction state, so an extinguished torch cannot keep illuminating the room or return on reload.
The Light Elemental arena has no ambient floor light: only torches, glowing enemies, smoldering cracks and the hero's small foothold light reveal it.
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
`tests/trial-navigation.test.ts` covers real routes, per-step hazards, staging transitions, clicked enemy strikes, hybrid priority/resume and paused-card input.
`tests/trial-progression.test.ts` covers shared automatic difficulty, difficulty-weighted Trial Points, receipts across reloads/modes, cap, losses and legacy access decoding.
`npm run test:proving` exercises the three-control picker, arrow-free tile movement, hybrid priority/resume, cards-only input rejection, shared progression, one-time weighted Trial Points, keys/refill, purchases and isolated runs at 320/390/1024 pixels.
The render goldens include staging, elemental, beam, glow, wall-scar, slime-hop, dissolution, light trails, reformation, ghost/reduced-motion and restored-corporeal laser frames.
Five appended sprite-kit frames cover staging, intact edge props, beam damage, extinguished torches and the board-art opt-out; the earlier legacy trial frames remain unchanged.

The appended `manualDestination` render frame covers the gold tile-click marker without changing earlier trial frames.

`keymaster-art.ts` supplies native 24-pixel brass/slate boss and chest-mimic silhouettes with upper-left highlights.
Golden keys and locked doors reuse the current content painters; red doorway pixels follow the elemental transit's staggered curved flight and fading tails, converging into the boss.
Reduce motion uses fewer particles and straight paths without changing the mechanical delay.
Fifteen `keymaster` render frames cover staging, actors, drops, doors, red streams, queued spirits, pixel dissolution/trails, ghost/reduced-motion, pursuit and reformation.
The Light Elemental and other render jobs remain unchanged.
`tests/keymaster.test.ts` checks exact drops, combat choices, all cardinal doors, arrival receipts, deterministic spawns, card categories, south-door routing, decoding and independent progression.
`node tests/keymaster.mjs` checks the real Trial 2 picker, all three controls, actual movement/combat/door damage, reloads, rewards, run isolation and native 320/390/1024-pixel previews.

`tests/keymaster-movement.test.ts` covers teleport immunity and saved ghosts, ten-turn reformation, every-two-turn retreat/pursuit, contact combat, obstacle reservations, wall limits, moving key-drop origins across every floor tile, queued door impacts and crowded-room reformation.

`tests/trial-camera.test.ts` covers default smoothing, dead-zone behavior, native-pixel/room bounds, Fast versus Instant/Reduce motion, room resets, fractional click coordinates and path framing without game-state mutation.
`node tests/trial-camera.mjs` exercises real interpolated movement and clicks during a glide, live Settings controls and saved preferences, card autoplay and 320/390/1024-pixel layouts.

`tests/keymaster-arena.test.ts` checks connected cover geometry, clear doors and edge props, blocked-turn authority, manual detours, mimic pursuit, retreat, teleport/reformation and old-layout migration.
The Keymaster browser flow compares actual floor and cover texels against Tower II tiles to prove the darkness mask is absent, verifies Tower I remains distinct, and captures the lit room at 320/390/1024 pixels.

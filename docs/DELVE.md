# Delve

Delve is one endless, vertically ascending labyrinth. Tower is a compact solved board; Delve is a sprawling navigation problem whose difficulty comes from **character power** and **Automove intelligence** together.

## Modules (`src/delve/`)

| File | Role |
| --- | --- |
| `labyrinth.ts` | Lattice, area ownership, per-area region graph, geometry, depth, theme influence |
| `patterns.ts` | Good / poor / contextual resource situations (reuses Tower's `Gate`/`Reward` vocabulary) |
| `automove.ts` | Observation-limited, upgradeable route evaluator |
| `analyzer.ts` | Structural audit (connectivity, gate bypass, seam rows, pattern mix) |
| `tools/delve-report.ts` | ASCII map + audit: `npm run delve:report -- <seed> <area>` |
| `tools/delve-ai-sim.ts` | Headless Automove comparison across AI levels |

## Topology

- The world is a lattice of chambers, 5 columns wide, endless rows (pitch 6 tiles). Each column's slab gets a small vertical warp, so rows meander without any global tilt.
- Every lattice cell belongs to exactly one **area** (100 depth each). Ownership is decided **per column**: boundary `b` sits at row `18·b + offset(col)`. One column is a **tongue**, where the old area climbs 5 rows higher. Another is a **dip**, where the new area reaches 5 rows lower. The rest wander by up to ±3 rows.
- Each area is grown as its own growing-tree labyrinth (DFS-biased, with turns favoured and shafts broken by side loops). Cells of different areas are never carved together, so the boundary is a **graph cut**, not a wall band. No world row is solid across the map (`seamRows == 0` is tested).
- The only inter-area edge is the **milestone gate**: from the top cell of the gate column, up a one-wide shaft past the area's boss (a strong enemy with twice its HP and ATK) and through a one-way tile, into the next area's entrance. Crossing it turns the tile below into wall, bumps `run.milestone`, clears undo history, and raises `World.floor`.
- The tongue's top cell is always a pocket, since its sideways neighbours belong to the next area. It gets a `FalseAscending*` pattern: a branch that climbs visibly past the gate and dead-ends.

## Depth vs. physical Y

`run.height` is **progression depth**: weighted path distance from the area entrance, normalised so the gate tile sits at 99. Corridor tiles interpolate between their endpoints. A dead-end branch high above the gate is still under 100, and depth never reaches the next hundred until the gate is crossed.

## Themes and enemies

Each node gets an `influence` in `[area−0.49, area+0.49]`. It is pushed toward the next area by graph and physical proximity to the exit and by climbing above the next boundary. It is pulled toward the previous area near the entrance, plus a per-room bias. `themeAt` blends tiles from their owning cell's influence, and the enemy kind (`DELVE_ENEMY_NAMES`) rolls from the same influence, so populations mix around gates and settle once you are past them.

## Patterns

Pockets (tree leaves) receive patterns. Trap weight rises with area, and `minBranch` patterns only go on long branches. Costs are placed only on **verified cut tiles** in a pocket's throat, so they can't be side-stepped. A throat too short for a two-cost pattern re-rolls to a pattern that fits.

Some pockets are entered by a **fork** instead (see `src/tower/forks.ts`, shared with the Tower): the throat is filled back in and two parallel lanes are cut one tile either side of it, each paying a different resource at about the price of the pattern's own costs (a door or a monster, an attack-heavy or a defense-heavy monster, two doors or two monsters…). A fork needs a pocket that holds a reward, a straight throat between two chambers, and solid rock beside both lanes; at most `forksPerArea` pockets per area get one. Every Delve enemy comes from the Delve's enemy curve for its delve (`enemyStats('delve', tier, depth, …)` in `src/enemy-curves.ts`; see `docs/PROGRESSION_AND_DIFFICULTY.md`): the same normal, balanced enemy as the Tower's on each equivalent floor, read at every depth (each depth a tenth of a floor's growth), times its strength (weak ×0.75, strong ×1.5, elite ×3, every stat alike; a boss HP and ATK ×3, twice a strong one's, and DEF ×1.5) and profile (attack-heavy: HP ×0.85, ATK ×1.4; defense-heavy: HP ×1.1, ATK ×0.7, DEF ×1.5), rounded to hundredths. A forked node keeps its `fork` and its `lanes` tiles.

## Guards

After the pockets, `placeGuards` gives each corridor that doesn't lead into a pocket a `guardChance` (0.65) of a guard on its middle corridor tile, outside any chamber, asked for as a normal enemy (the enemy stage deals its strength) and with a random profile, and usually a reward on the corridor tile beside it (`guardRewards`: a potion 55%, an ATK shard 15%, a DEF shard 10%). An area then holds about 64 enemies and 31 potions, near ten Tower floors' 63 and 33, so both modes pay about the same XP for each equivalent floor. Guards are passable costs like any other enemy, so they never change what the labyrinth connects. The area's last stage is the enemy stage (`placeEnemies`, docs/ENEMY_SCHEDULE.md section 3): each of its ten equivalent floors adds enemies for the enemy schedule's count on its own plain floor tiles (never the way in, near the milestone gate or in a fork's lane) and deals its enemies but bosses and fork lanes' the strengths of its shares, from the tower of the delve's number; the region records what it found and added as `enemyCount`.

## Automove tiers (`config.ts` upgrades → `capabilities()`)

| Upgrade | Unlocks |
| --- | --- |
| none | upward bias, nearby unexplored, visible tiles plus visited tiles only |
| `aiMemory` 1/2 | remembers every observed tile · dead-end recognition, weaker upward pull |
| `aiEvaluation` 1–4 | HP cost of fights (as a share of the HP left) · key cost · contextual value (missing HP, key counts) · scarcity |
| `aiLookahead` 1–4 | +4 scouting radius and +2 chained interactions per level |

The evaluator never reads generator labels. It follows a committed route and replans on interactions or newly seen corridors, with a continuity bonus that prevents flip-flopping.

## Tuning

`DELVE_TUNING` in `labyrinth.ts`: `boundaryWander`, `tongue`, `loopChance`, `shaftBreakChance`, `sidewaysBias`, `straightPenalty`, `chamberChance`, `wideChamberChance`, `themeBand`, `forksPerArea`. Fork chances and pricing are in `FORK_TUNING` and `GATE_VALUE` (`src/tower/forks.ts`). Pattern weights are in `choosePattern`. Blue, red and Heart Doors, Wooden Doors and keys follow the Tower's schedules by equivalent floor (`placeQuotaDoors`, `placeWoodenDoors`, `supplyKeys`; `docs/DOOR_AND_KEY_SCHEDULE.md` section 6), measured with `npm run delve:report -- --census`.

Debug: in dev mode, run `delveDebug()` in the console.

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
- The only inter-area edge is the **milestone gate**: from the top cell of the gate column, up through a guarded one-way tile, into the next area's entrance. Crossing it turns the tile below into wall, bumps `run.delveMilestone`, clears undo history, and raises `World.floor`.
- The tongue's top cell is always a pocket, since its sideways neighbours belong to the next area. It gets a `FalseAscending*` pattern: a branch that climbs visibly past the gate and dead-ends.

## Depth vs. physical Y

`run.height` is **progression depth**: weighted path distance from the area entrance, normalised so the gate tile sits at 99. Corridor tiles interpolate between their endpoints. A dead-end branch high above the gate is still under 100, and depth never reaches the next hundred until the gate is crossed.

## Themes and enemies

Each node gets an `influence` in `[area−0.49, area+0.49]`. It is pushed toward the next area by graph and physical proximity to the exit and by climbing above the next boundary. It is pulled toward the previous area near the entrance, plus a per-room bias. `themeAt` blends tiles from their owning cell's influence, and enemy tiers roll from the same influence, so populations mix around gates and settle once you are past them.

## Patterns

Pockets (tree leaves) receive patterns. Trap weight rises with area, and `minBranch` patterns only go on long branches. Costs are placed only on **verified cut tiles** in a pocket's throat, so they can't be side-stepped. A throat too short for a two-cost pattern re-rolls to a pattern that fits.

## Automove tiers (`config.ts` upgrades → `capabilities()`)

| Upgrade | Unlocks |
| --- | --- |
| none | upward bias, nearby unexplored, visible tiles plus visited tiles only |
| `aiMemory` 1/2 | remembers every observed tile · dead-end recognition, weaker upward pull |
| `aiEvaluation` 1–4 | HP cost of fights · key cost · contextual value (missing HP, key counts) · scarcity |
| `aiLookahead` 1–4 | +4 scouting radius and +2 chained interactions per level |

The evaluator never reads generator labels. It follows a committed route and replans on interactions or newly seen corridors, with a continuity bonus that prevents flip-flopping.

## Tuning

`DELVE_TUNING` in `labyrinth.ts`: `boundaryWander`, `tongue`, `loopChance`, `shaftBreakChance`, `sidewaysBias`, `straightPenalty`, `chamberChance`, `wideChamberChance`, `themeBand`, `junctionKeyChance`. Pattern weights are in `choosePattern`.

Debug: in dev mode, run `delveDebug()` in the console.

# Delve

The Delve labyrinth (`src/delve/`): its region stages, schedules by equivalent floor, chunks, Automove and their tests; read with `docs/DELVE.md`.

**Delve** (`src/delve/`, entered via `World` in `delve/world.ts`, built from the run: it reads and writes the run's changes, floor and milestone itself): one endless ascending 30-wide labyrinth with left/right wrap, built per area by `labyrinth.ts` and sliced into 20-row chunks.
`region()` runs its stages in a fixed order on one random stream: lattice, growing tree, loops, corridors, depths and theme influence, pocket patterns, carving, pattern costs (where some pockets with a reward get a fork instead: two parallel lanes beside a straight throat, rolled from the Tower's `forks.ts`), corridor guards (`placeGuards`: an enemy asked as normal, often with a potion or shard beside it, on most corridors not leading into a pocket, so an area holds about as many enemies and potions as ten Tower floors; each such potion may be a percent potion, as the run decides), then the Tower's door and key schedules by equivalent floor (docs/DOOR_AND_KEY_SCHEDULE.md section 6), each delve following the tower of its number: the door stage (`placeQuotaDoors`: each of the area's ten floors rolls its blue, red and Heart Door quota from `towerDoorHundredths`, and each door upgrades or combines with a gate placed so far, its `Slot`: a pocket's throat cost, a corridor guard or a corridor door; stands on a corridor off the way to the milestone gate that no other way round passes; gives a pocket a pattern built round a blue door, `quotaPatterns`; forks a pocket's throat (its lane doors counting 1/k, `forkCredit`); or grows a door run along a throat or corridor (`growRun`; a `Slot`'s `run` tiles); blue and red never on the way to the milestone gate; no ordinary pattern or fork offers them, `withoutQuotaDoors`; the region keeps `doorQuota`, what it rolled and dropped), the wooden share (`placeWoodenDoors`, after yellow runs grow in pockets' throats, a run rolling once) and the keys per lock (`supplyKeys`: pocket keys thinned or junction keys added toward `towerKeyRatio`'s aim, a fork's lane doors counting 1/k, a run each door and a yellow run once; a blue or red key near the entrance on its colour's first floor), and last the enemy stage by equivalent floor (`placeEnemies`, docs/ENEMY_SCHEDULE.md section 3, on its own stream).
`delve/census.ts` (`delveCensus`, `npm run delve:report -- --census`) measures it per equivalent floor as the Tower's census does, and `tests/delve-schedule.test.ts` checks it.
`tests/delve-labyrinth.test.ts` hashes whole regions for a spread of seeds and areas against `tests/fixtures/delve-labyrinth.golden.json`; like the Tower golden, a change there changes saved maps and needs a `LAYOUT_VERSION` bump, so regenerate it with `UPDATE_GOLDEN=1` only when intended.
`World.maintain` keeps only nearby chunks and raises `World.floor` at each milestone gate; terrain below it becomes wall.
Its Automove (`automove.ts`) is observation-limited and upgradeable, distinct from Tower's `src/automation.ts`: each step it marks what it can see, follows its committed route while nothing new appears, and otherwise searches the observed tiles and scores each decision point.
What it has seen is its saved memory (`save.delve.memory`, which `Game` clears when a run enters the labyrinth, a milestone gate seals or the layout changes); the route it committed to and the decisions it last weighed are its `DelvePlan` (`game.delvePlan`), which is never saved.
`tests/delve-automove.test.ts` runs Automove alone at several AI upgrade levels with strong and fragile characters and hashes its choices and reported decisions against `tests/fixtures/delve-automove.golden.json` (checkpoints every 50 steps); regenerate it with `UPDATE_GOLDEN=1` only for an intended Automove change.
See `docs/DELVE.md`.

## Reports and tools

```sh
npm run delve:report -- [seed] [area] [--map]
npm run delve:report -- --census [--tiers 1,2,9] [--floors 1-200] [--band 50] [--seeds 20]   # the same census for the Delve, per equivalent floor
node --experimental-transform-types tools/delve-ai-sim.ts   # headless Automove comparison
```

Torch placement and `tests/world-boards.test.ts`, which covers the Delve `World` too, are in `tower-generation.md`.

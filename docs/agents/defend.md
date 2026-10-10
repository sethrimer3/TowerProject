# Defend

Defend's battle simulation, units, drawing, board pointers, city building, fences and save; read with `docs/DEFEND.md`.

Its battle simulation, `DefendSim` (`defend/sim.ts`), owns the world state and what happens to it (damage, rebuilding, blasts, movement), and steps the units in a fixed order.
Each unit type's decisions live in its own module: `enemies.ts`, `troops.ts` (barracks, swordsmen, archers), `civilians.ts` and `towers.ts`.
`pathing.ts` holds the pure grid A*, the enemies' flow field and the collision test.
`DefendRenderer` (`defend/render.ts`) owns the camera and the order of the drawing passes: `city-layer.ts` paints the cached static city, `lighting.ts` the torchlight and shadows, `battle-art.ts` each frame's damage, scorches, units and effects, `edit-overlay.ts` the building grid and drag overlay, and `structure-art.ts` the building art, banner and palette icons.
All units draw from one seeded random stream, so the step order and each unit's draws decide a replay.
`tests/defend-replay.test.ts` steps fixed cities, upgrade levels, seeds, bombs and demolitions through `update()` and hashes the whole sim state every 5 s against `tests/fixtures/defend-replay.golden.json`, reporting when a run first diverges.
Regenerate it with `UPDATE_GOLDEN=1` only for an intended gameplay change.
On the page (`defend/ui.ts`, `DefendPage`), board pointers go through `board-pointers.ts` (`BoardPointers`), a small state machine: idle, viewing (one pointer pans, two pinch-zoom), or dragging a palette item, structure, keep, city tile or bomb under a ghost icon.
It only turns pointers into board cells; each drag is an `EditSession` (`edit-session.ts`), a pure transaction over the layout it started from: what a press lifts (`EditSession.lift`), the legal tiles and the layout each makes, the overlay shown while held, and the `Drop` a release makes (a bomb's blast point, or the next layout with any refusal message), which the page applies.
`tests/defend-edit-session.test.ts` drives whole drags in Node.
`drag-rules.ts` holds the rules behind it: the layout a drop makes on each tile, its outline, why a tile refuses it (unit-tested in `tests/defend-drag-rules.test.ts`), and which city tiles lift.
`tests/defend-pointer.mjs` (`npm run test:pointer`) plays mouse, wheel and multi-touch gestures on the board and palette in build and battle, and hashes the camera, drag overlay, ghost, layout, bombs, message and palette after each against `tests/fixtures/defend-pointer.golden.json`; as with the render golden, regenerate it with `UPDATE_GOLDEN=1` on the unchanged code before a pointer change.
The city itself comes from `layout.ts` (the player's tiles and structures; `fitLayout` picks each structure's cells) and `citygen.ts` (streets, parks, houses, ponds and wall stones, as a pipeline of stages).
`tests/defend-city.test.ts` hashes seeded random walks of layout edits, their fits and failure reasons, and the cities generated along the way against `tests/fixtures/defend-city.golden.json`; regenerate it with `UPDATE_GOLDEN=1` only for an intended change to city building.
`fences.ts` lays decorative fences along the street sides of parks and snaps them into splinters under walking enemies and blasts, and `progress.ts` holds the saved Defend state, its purchases, and `decodeDefendSave`, which rebuilds the saved layout piece by piece and drops it unless it is well formed, owned and still fits.
`tests/defend-fences-save.test.ts` hashes fence sections, seeded fence runs (trampling, blasts and drawing on a recording canvas), and `decodeDefendSave` over a corpus of real and mutated saves against `tests/fixtures/defend-fences-save.golden.json`; regenerate it with `UPDATE_GOLDEN=1` only for an intended fence or decode change.

The `add-upgrade` skill's `references/panels.md` describes the Armory's upgrades: update it when they change.

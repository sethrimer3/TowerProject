# Lakeside

The lake west of Tower I is an outside area of the same Tower I run, available without opening another tier.
`src/lakeside.ts` defines its fixed shore, dock footprint, fisherman position and collision map (`LakeWorld`, an `OutsideWorld` subclass).
Water, the fisherman and tree trunks are walls; the east path and dock remain connected for every seed.
There are no stairs, Tower arch, trial entrance or mode-swap sign at the lake.

`Game.travelForest` and `canTravelForest` share the lake and ordinary tower side connections between arrows and walked edge transitions.
Entering the lake sets `run.forestArea` to `lake`, and returning east removes it, preserving the original run seed, health, tier, records and progression.
Both directions reuse the existing safe arrival landing and motion settings.
`save/save.ts` accepts the marker only on an outside Tower I run and removes it from Delve runs or invalid locations.

`Game.land` checks entering the dock from a non-dock tile, stops the route and requests the fisherman dialogue.
`ProvingGroundsDialog` consumes the request, checks character level 10, and shows `ui/fisherman-dialog.ts` below that level or the animated `ui/trial-voyage.ts` scene and trials menu otherwise.
The request is not saved; a reload on the dock preserves the hero's position without replaying the greeting.
Below level 10 the exact line is `Come back when you are level 10, traveller.`.
Closing the greeting or returning from trials places the hero at (14,7), facing inland, so tapping the dock boards again.

`render/lakeside.ts` draws native water-panel samples and dock PNGs through the renderer's existing ground cache, then reuses forest trees and draws reeds and the seated fisherman.
The lake skips clearing grass and the clearing-specific tower/cloud height map, retaining rain and storm weather.
Five original palette-matched sprites live in `public/assets/style/lake-*.png`, with editable source in `tools/prepare-lakeside-sprites.py` (Python + Pillow).
Rebuilding the sprites also updates the style manifest; follow it with `npm run sprites:manifest` to refresh the startup inventory.

`tests/lakeside.test.ts` checks travel, collisions, route termination, progression preservation and saves.
`node tests/lakeside.mjs` checks real canvas clicks, dialogue, repeated visits, arrows, reloads and return at phone/desktop widths.
The `lakeside` render and UI golden sections cover the area, dock greeting and return; review images go to `test-results/lakeside/`.

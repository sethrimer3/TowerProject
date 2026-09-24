# DEFEND — city defense

A tower-defense-style simulation where the player lays out a walled city and
holds it against endless waves. Code lives in `src/defend/`.

## Board

- 9 × 13 **tiles**, each subdivided into 7 × 7 **cells** (63 × 91 cells).
  Tiles are the unit the player builds with; cells are the unit the
  procedural city, walls, pathfinding and simulation work in.
- The top tile row is the enemy **spawn lane** — nothing can be built there.
- The board scales to the largest 9:13 size that fits on screen without
  scrolling. Open ground uses the mossy flagstone tiles
  (`public/assets/defend/floor-*.png`), one random variant and rotation per tile.

## Building (before a run)

- The **palette** (left by default, `⇄ Palette` swaps it to the right) lists
  city tiles, barracks, archer towers and watch towers with an `×N` count of
  what is owned but not yet placed; it greys out at `×0`.
- Drag from the palette onto the board. While dragging, every tile that would
  accept the item gets a faint gold outline and every other tile darkens; the
  hovered tile shows exactly where the building will be fitted.
- Placed things can be dragged to another tile, or back onto the palette /
  off the board to pick them up again.
- **City tiles** must touch the city orthogonally (the keep counts as one).
  The player starts with 8 — enough for a 3 × 3 city around the keep. A tile
  can only be lifted if the city stays connected and it holds no buildings.
- **The keep** can be moved onto any other city tile (the two swap) but never
  removed.
- **Barracks** must be inside the city. **Archer towers** and **watch towers**
  may stand inside or outside; outside they sit off-centre in their tile.
- Several structures share a tile while they fit. The game picks each
  structure's exact cells (`fitLayout`): oldest first, never touching another
  structure (there's always room for a street), and every in-city structure
  must still reach the keep's streets.

## The procedural city (`citygen.ts`)

- The **wall** is 2 cells thick and sits just *outside* the city tiles, so
  every city tile keeps its full 7 × 7 interior. The board edge is
  impassable, so no wall is built along it.
- A plaza rings the keep, avenues run to the city edge, every structure gets
  a street to its door, then deep blocks are split by straight streets until
  nothing is more than 2 cells from a road. Some small blocks become parks;
  the rest fills with houses (mostly 2 × 2 to 3 × 3), each touching a street.
- Generation is seeded per save and keyed by position, so the same layout
  always produces the same city.

## A run (`sim.ts`)

- Building is only possible before the run starts. Waves then roll without
  stopping (3 s breather after each) until the keep falls.
- Enemies are tiny squares that move freely (not grid-locked). They follow a
  flow field to the keep where streets are cheap and buildings/walls are
  passable at a cost (they must be smashed first) — so they walk the streets
  but break through when that's much shorter. Houses lure some enemies off
  the road to wreck them (`distraction`); bats fly straight over everything.
- Destruction lasts for the whole run. **Civilians** come out of houses to
  rebuild rubble one cell at a time (walls and structures first); a
  structure only works again once fully rebuilt. They avoid rubble with
  enemies close by and respawn a while after being killed.
- **Barracks** keep up to N swordsmen alive, training a replacement every
  few seconds after one dies. Swordsmen stay inside the walls and fight
  whatever gets in (troops can't pass walls — a palisade gate is a future
  upgrade; troop pathing is plain A* over open cells, so gates only need to
  change what counts as open).
- **Archer towers** shoot the nearest enemy in range. **Watch towers** mark
  enemies in their radius with a gold outline; marked enemies take ×2 damage.
- During a run the palette becomes the **consumables** palette. A **bomb**
  can be dragged onto the field to blast everything nearby.

## Weather and light (`weather.ts`, `lighting.ts`)

- Each run rolls its weather: 30% rain (with a grey, slightly desaturated
  overcast) and 10% night, independently. Rain or night lights the city:
  lanterns hung on house walls, braziers at the keep's corners, a lamp at
  each barracks door, and fires inside archer and watch towers.
- Lights reuse the main game's candle colours, flicker and sway. Each pool
  is baked once with occlusion, so walls and buildings cast shadows; an
  archer tower's fire ignores its own roof but is blocked by its four corner
  pillars, throwing four shadows into the street. Only lights near cells
  that fell or were rebuilt are rebaked, a few per frame.
- Units (soldiers, civilians and ground enemies) cast shadows away from the
  brightest light on their cell, looked up from a per-cell grid made during
  baking — a few batched rects per unit, cheap enough for hundreds.
- Gravel stones on the streets catch the light: a bright lip toward the
  flame, a dark one away from it.
- A light goes out while its building is destroyed and returns when it's rebuilt.
- Struck buildings, walls and the keep flash briefly.

## Economy (`progress.ts`, Armory tab)

- Everything is bought with main-game gold, iron bars and steel bars.
- City elements get more expensive with each one owned. Upgrades are
  universal (they apply to every building of that type) and take effect from
  the next run.
- Reaching a **new best wave** is recorded (`bestWave`). The reward for a
  new record is not defined yet — see `handleEvents` in `ui.ts`.

## Not saved

A run in progress isn't saved; leaving the tab pauses it and reloading ends
it. The layout, purchases, upgrades, bombs and best wave are saved.

`defendDebug(seconds, { rain, night }?)` in the console fast-forwards a
running battle, optionally forcing its weather.

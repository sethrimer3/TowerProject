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
  (`public/assets/defend/floor-*.png`), one random variant per tile, never
  rotated (their baked-in lighting looks wrong turned) and grown 15% to close
  the gaps between them.

## Layout of the page

- One header row, never two. Building: City · Armory · Start the defense on
  the left; best wave and the ⚙ DEFEND settings (palette side, reset zoom) on
  the right. During a battle: Abandon (click twice — it asks "Confirm?") and
  the speed toggle (1× ⇄ 2×, plus 3× once War drums is bought in the
  Armory) on the left; weather, wave, best, keep health and foes on the right.
- The board is sized so the page never scrolls. Scroll-wheel or pinch zooms
  (up to 4×); dragging open ground pans. Messages float over the board's foot.

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
- **Barracks** and **archer barracks** must be inside the city. **Archer**, **cannon** and **watch
  towers** may stand inside or outside; outside they sit off-centre in their tile.
- Several structures share a tile while they fit. The game picks each
  structure's exact cells (`fitLayout`): oldest first, never touching another
  structure (there's always room for a street), and every in-city structure
  must still reach the keep's streets.

## The procedural city (`citygen.ts`)

- The **wall** is 2 cells thick and sits just *outside* the city tiles, so
  every city tile keeps its full 7 × 7 interior. The board edge is
  impassable, so no wall is built along it.
- Wall art is cut from two sprites: each wall cell shows a 16 px window of
  the mossy cap-stone run in `wall-cap.png` (x 38–54, continuing down the
  run), and any stone with open ground or a breach to its south hangs a strip
  of the brick face from `wall-face.png`. Because it is per cell, breaches
  just show rubble with broken edges around them.
- A plaza rings the keep, avenues run to the city edge, every structure gets
  a street to its door, then deep blocks are split by straight streets until
  nothing is more than 2 cells from a road. Some small blocks become parks;
  the rest fills with houses (mostly 2 × 2 to 3 × 3), each touching a street.
- Larger parks get a pond: every park cell whose eight neighbours are all
  park becomes water, drawn as overlapping jittered discs for an irregular,
  natural shore. Ponds block movement but not light.
- About 60% of parks have a thin wooden fence along their street sides,
  with one gap left as a gate (`fences.ts`). Fences are purely visual: an
  enemy walking across a section, or a blast next to it, snaps it into
  splinters that scatter, settle and fade out after 5–10 s.
- Art: medieval roofs (terracotta, brick, timber, thatch, slate, straw)
  with crisp black outlines on whole-pixel edges; when zoomed in, the city
  is repainted at 2–3× resolution so edges stay sharp. The keep has four
  round corner turrets, a courtyard and a hipped slate roof, with a red and
  gold banner rippling in the wind on top.
- Generation is seeded per save and keyed by position, so the same layout
  always produces the same city. `tests/defend-city.test.ts` pins both
  `fitLayout` and `generateCity` against recorded hashes.

## A run (`sim.ts`)

`DefendSim` holds the world and runs each step in a fixed order. Unit
behaviour lives beside it: `enemies.ts`, `troops.ts` (barracks, swordsmen,
archers), `civilians.ts` and `towers.ts` (towers, arrows, shells), with grid
A*, the flow field and collision in `pathing.ts`. A run is deterministic
from its seed; `tests/defend-replay.test.ts` pins it.

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
- **Archer barracks** train archers (same garrison size, drill speed and
  arms upgrades as the swordsmen's barracks). Archers wander random city
  streets and stop to shoot anything within their short sight (3 cells,
  widened by Keen eyes). The pricey one-off Hunter's instinct makes them
  path toward the nearest enemy in the city instead, stopping at bow range.
- **Patrol routes** (Armory) widens how far from their barracks swordsmen
  go after enemies; its last level sends them anywhere inside the city.
- **Cannon towers** fire slowly at the nearest ground enemy (not bats),
  lobbing a shell in an arc that bursts with splash damage (full at the
  centre, 40% at the edge).
- **Explosions** (cannon shells and bombs) are ragged, layered fireballs —
  smoke, flame, white-hot core, flung sparks — that briefly light up their
  surroundings, then leave glowing, branching cracks that cool and fade over
  1–3 s.
- **Friendly fire:** blasts also hurt your swordsmen and civilians (60% of
  the damage) until you buy Gunnery drills (cannons) or Shaped charges
  (bombs) in the Armory.
- **Archer towers** shoot the nearest enemy in range. **Watch towers** mark
  enemies in their radius with a gold outline; marked enemies take ×2 damage.
- During a run the palette becomes the **consumables** palette. A **bomb**
  can be dragged onto the field to blast everything nearby.

## Weather and light (`weather.ts`, `lighting.ts`)

- Battles are always fought under cloud (a light grey overcast), so the
  city's lights are always lit: lanterns hung on house walls, braziers at
  the keep's corners, a lamp at each barracks door, and fires inside archer
  and watch towers. 30% of runs are also rainy for the whole run.
- **Every 10th wave is a boss wave**, with one Warlord per ten waves (a huge,
  crowned brute with its own health bar). Night fades in over ~2.5 s as the
  boss wave starts and lifts once it's cleared; a rainy run becomes night
  rain ("Storm").
- Swordsmen and civilians carry hand torches: small flickering pools that
  move with them, clipped to open ground so they never light a roof.
- Lights reuse the main game's candle colours, flicker and sway. Each pool
  is baked once with occlusion, so walls and buildings cast shadows; an
  archer tower's fire ignores its own roof but is blocked by its four corner
  pillars, throwing four shadows into the street. Only lights near cells
  that fell or were rebuilt are rebaked, a few per frame.
- Units (soldiers, civilians and ground enemies) cast shadows away from the
  brightest light on their cell, looked up from a per-cell grid made during
  baking — a few batched rects per unit, cheap enough for hundreds.
- Light only lands on open ground: roofs and wall tops stay unlit, so the
  flames read as street-level rather than hovering over the buildings.
- Gravel stones on the streets catch the light: a bright lip toward the
  flame, a dark one away from it.
- A light goes out while its building is destroyed and returns when it's rebuilt.
- Struck buildings, walls and the keep flash briefly.

## Drawing (`render.ts` and its passes)

- `DefendRenderer` owns the camera (zoom and pan) and runs each frame's
  passes in order. The city layer (`city-layer.ts`: flagstones, streets,
  parks, ponds, trees, walls, houses and structures, lantern brackets,
  rubble) is painted once into an offscreen canvas, at 2–3× when zoomed in,
  and repainted only when a building falls or is rebuilt, the size or zoom
  band changes, or floor and wall art finishes loading.
- Over it each frame: park fences (`fences.ts`), building damage, unit
  shadows, the overcast and torchlight (`lighting.ts`), the keep's banner,
  scorches, then units, projectiles and effects (`battle-art.ts`), the
  building grid and drag overlay (`edit-overlay.ts`), and rain in screen
  space (`weather.ts`).
- `structure-art.ts` holds the keep, barracks and tower art (shared by the
  city layer and the palette icons), the banner, and the palette colours.
- `npm run test:render` draws seeded Defend scenes (building mode, a rainy
  battle, the night boss wave, a stormy night zoomed in) and the palette
  icons, and compares their pixels to the recorded golden.

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

`defendDebug(seconds, { rain }?)` in the console fast-forwards a running
battle, optionally forcing its weather.

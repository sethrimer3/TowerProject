/** The static city layer for DEFEND: flagstone ground, the spawn lane,
 * gravel streets and their stones, park grass, ponds and trees, walls,
 * houses and structures, lantern brackets and rubble. The renderer paints it
 * once into an offscreen canvas and repaints it only when a building falls or
 * is rebuilt, the size changes, or art finishes loading. */
import { CELL_COUNT, CELLS_H, CELLS_W, SPAWN_ROW, SUB, TILES_H, TILES_W, cellInBounds, cellIndex, hash, hash01 } from "./grid.ts";
import { CellType, type Building, type CityMap } from "./citygen.ts";
import type { Light, Stone } from "./lighting.ts";
import type { DefendSim } from "./sim.ts";
import { OUTLINE, ROAD, ROOFS, paintStructureArt } from "./structure-art.ts";

const ASSET_BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
const floorImages: HTMLImageElement[] = [];
const artListeners = new Set<() => void>();
/** Wall art is cut from two hand-drawn sprites (see paintWall). */
const wallArt: { cap?: HTMLImageElement; face?: HTMLImageElement } = {};
function loadImage(name: string) {
  const img = new Image();
  img.onload = () => artListeners.forEach((f) => f());
  img.src = `${ASSET_BASE}assets/defend/${name}.png`;
  return img;
}
/** Starts loading the floor and wall art (once), calling `repaint` each time
 * an image arrives, since the layer painted without it is only a stand-in. */
export function onCityArtLoaded(repaint: () => void) {
  artListeners.add(repaint);
  if (floorImages.length || typeof Image === "undefined") return;
  for (let i = 1; i <= 4; i++) floorImages.push(loadImage(`floor-${i}`));
  wallArt.cap = loadImage("wall-cap");
  wallArt.face = loadImage("wall-face");
}
const ready = (img?: HTMLImageElement): img is HTMLImageElement => !!img?.complete && !!img.naturalWidth;

/** The mossy flagstone floor tiles (floor-1..4.png) specifically: drawn in
 * their PNG orientation (rotating them made the baked-in lighting look
 * wrong) and grown 15% past their tile so the gaps between them close up. */
const FLOOR_TILE_SCALE = 1.15;

/** Wall sprites, in source pixels. wall-cap.png holds a vertical run of
 * mossy cap stones at x 38–54, lit from the left; each wall cell shows a
 * 16 px window of it, continuing down the run. wall-face.png holds the dark
 * brick face, hung below any wall stone with open ground to its south. */
const CAP = { x: 38, w: 16, y0: 1, span: 62 };
const FACE = { x0: 8, span: 64, y: 44, h: 14 };

const RUBBLE = "#4a443d";
const WALL = "#8e897c";

/** What the city layer is painted from. `px` is canvas pixels per cell. */
export type CityScene = {
  map: CityMap;
  /** The battle, if one is on: buildings it knocked down show as rubble. */
  sim: DefendSim | null;
  lights: readonly Light[];
  stones: readonly Stone[];
};

/** Everything the painters share for one repaint. */
type Paint = {
  c: CanvasRenderingContext2D;
  px: number;
  map: CityMap;
  sim: DefendSim | null;
  /** The cell holds a standing building or wall stone. */
  solid: (i: number) => boolean;
};

/** Paints the whole city onto `c` (sized by the caller) at `px` per cell. */
export function paintCityLayer(c: CanvasRenderingContext2D, px: number, scene: CityScene) {
  const { map, sim } = scene;
  const solid = (i: number) => (sim ? sim.solid[i] === 1 : map.owner[i] >= 0 && map.type[i] !== CellType.ROAD);
  const p: Paint = { c, px, map, sim, solid };
  c.imageSmoothingEnabled = false;
  paintFlagstones(p);
  paintCityGround(p);
  paintRoadStones(p, scene.stones);
  // Ponds, then trees, over the park grass.
  paintWater(p);
  paintTrees(p);
  for (const b of map.buildings) paintBuilding(p, b);
  paintLanternBrackets(p, scene.lights);
  paintRubble(p);
}

/** Ground: the mossy flagstones, one randomly turned tile per board tile,
 * with the spawn lane darkened as hostile ground. */
function paintFlagstones({ c, px }: Paint) {
  const T = px * SUB;
  const { width, height } = c.canvas;
  // Very dark grey shows in the gaps around the flagstone sprites.
  c.fillStyle = "#17181b";
  c.fillRect(0, 0, width, height);
  for (let ty = 0; ty < TILES_H; ty++)
    for (let tx = 0; tx < TILES_W; tx++) {
      const img = floorImages[hash(tx, ty, 3) % 4];
      const x = Math.floor(tx * T),
        y = Math.floor(ty * T),
        s = Math.ceil(T) + 1;
      if (ready(img)) {
        // Mossy floor tiles only: unrotated, grown 15% about their centre.
        const g = s * FLOOR_TILE_SCALE;
        c.drawImage(img, x + (s - g) / 2, y + (s - g) / 2, g, g);
      } else {
        c.fillStyle = "#2c3a26";
        c.fillRect(x, y, s, s);
      }
    }
  const g = c.createLinearGradient(0, 0, 0, T * (SPAWN_ROW + 1));
  g.addColorStop(0, "rgba(40,6,6,0.55)");
  g.addColorStop(1, "rgba(20,0,0,0.25)");
  c.fillStyle = g;
  c.fillRect(0, 0, width, T * (SPAWN_ROW + 1));
}

/** City ground: park grass, and gravel for streets and cleared rubble. */
function paintCityGround(p: Paint) {
  const { map, solid } = p;
  for (let cy = 0; cy < CELLS_H; cy++)
    for (let cx = 0; cx < CELLS_W; cx++) {
      const i = cellIndex(cx, cy);
      const t = map.type[i];
      if (t === CellType.OUT) continue;
      if (t === CellType.PARK || t === CellType.WATER) paintGrass(p, cx, cy);
      else if (t !== CellType.WALL || !solid(i)) paintGravel(p, cx, cy);
    }
}

/** Road (or rubble-coloured) gravel with a fine grit speckle. */
function paintGravel({ c, px, map, solid }: Paint, cx: number, cy: number) {
  const i = cellIndex(cx, cy);
  const x = cx * px,
    y = cy * px;
  c.fillStyle = map.owner[i] >= 0 && !solid(i) ? RUBBLE : ROAD;
  c.fillRect(x, y, px + 0.5, px + 0.5);
  const grit = Math.max(1, px * 0.07);
  for (let k = 0; k < 6; k++) {
    const h = hash01(cx, cy, 60 + k);
    c.fillStyle = h < 0.5 ? "rgba(0,0,0,0.12)" : "rgba(255,240,215,0.07)";
    c.fillRect(x + hash01(cx, cy, 70 + k) * (px - grit), y + hash01(cx, cy, 80 + k) * (px - grit), grit, grit);
  }
}

/** Road stones, with a darker underside so they sit in the gravel. */
function paintRoadStones({ c, px }: Paint, stones: readonly Stone[]) {
  for (const st of stones) {
    const s = Math.max(1, st.s * px);
    const x = st.x * px - s / 2,
      y = st.y * px - s / 2;
    c.fillStyle = "rgba(0,0,0,0.25)";
    c.fillRect(x + s * 0.3, y + s * 0.35, s, s);
    c.fillStyle = st.shade < 0.33 ? "#7a7266" : st.shade < 0.66 ? "#6b645a" : "#857c6d";
    c.fillRect(x, y, s, s);
  }
}

/** Park grass: two greens in soft patches, tufts and the odd flower. */
function paintGrass({ c, px }: Paint, cx: number, cy: number) {
  const x = Math.round(cx * px),
    y = Math.round(cy * px),
    s = Math.round((cx + 1) * px) - x,
    t = Math.round((cy + 1) * px) - y;
  const patch = hash01(Math.floor(cx / 2), Math.floor(cy / 2), 50);
  c.fillStyle = patch < 0.5 ? "#3d5e30" : "#446834";
  c.fillRect(x, y, s, t);
  const d = Math.max(1, Math.round(px * 0.09));
  for (let k = 0; k < 5; k++) {
    const hx = x + Math.floor(hash01(cx, cy, 51, k) * (s - d)),
      hy = y + Math.floor(hash01(cx, cy, 52, k) * (t - d * 2));
    c.fillStyle = k % 2 ? "#2f4b26" : "#56803f";
    c.fillRect(hx, hy, d, d * 2);
  }
  if (hash01(cx, cy, 53) < 0.18) {
    c.fillStyle = ["#e8d57a", "#e6e1d6", "#c96a5a", "#b7a3d6"][hash(cx, cy, 54) % 4];
    c.fillRect(x + Math.floor(hash01(cx, cy, 55) * (s - d)), y + Math.floor(hash01(cx, cy, 56) * (t - d)), d, d);
  }
}

/** Ponds, with irregular natural shores: each water cell contributes a
 * slightly jittered disc, and the union of discs forms the pond. Drawn in
 * passes — outline, muddy bank, reed-dark shallows, open water —
 * then ripples and lily pads. */
function paintWater(p: Paint) {
  const { c, px, map } = p;
  const cells: [number, number][] = [];
  for (let i = 0; i < CELL_COUNT; i++)
    if (map.type[i] === CellType.WATER) cells.push([i % CELLS_W, Math.floor(i / CELLS_W)]);
  if (!cells.length) return;
  const pass = (color: string, scale: number) => {
    c.fillStyle = color;
    c.beginPath();
    for (const [cx, cy] of cells) {
      const x = (cx + 0.5 + (hash01(cx, cy, 66) - 0.5) * 0.3) * px,
        y = (cy + 0.5 + (hash01(cx, cy, 67) - 0.5) * 0.3) * px;
      const r = px * scale * (0.9 + hash01(cx, cy, 68) * 0.25);
      c.moveTo(x + r, y);
      c.arc(x, y, r, 0, Math.PI * 2);
    }
    c.fill();
  };
  pass(OUTLINE, 0.86);
  pass("#3a3524", 0.8);
  pass("#2a4f45", 0.7);
  pass("#2b5d71", 0.6);
  for (const [cx, cy] of cells) paintPondSurface(p, cx, cy);
}

/** A ripple glint and, now and then, a lily pad (some in flower). */
function paintPondSurface({ c, px }: Paint, cx: number, cy: number) {
  const x = cx * px,
    y = cy * px;
  c.fillStyle = "rgba(210,235,240,0.4)";
  const rw = Math.max(2, Math.round(px * 0.34));
  c.fillRect(Math.round(x + px * (0.2 + hash01(cx, cy, 61) * 0.4)), Math.round(y + px * (0.25 + hash01(cx, cy, 62) * 0.5)), rw, 1);
  if (hash01(cx, cy, 63) >= 0.35) return;
  const r = Math.max(1.5, px * 0.15);
  const lx = x + px * (0.25 + hash01(cx, cy, 64) * 0.5),
    ly = y + px * (0.25 + hash01(cx, cy, 65) * 0.5);
  c.fillStyle = "#4f7d3b";
  c.beginPath();
  c.moveTo(lx, ly);
  c.arc(lx, ly, r, 0.5, Math.PI * 2);
  c.closePath();
  c.fill();
  if (hash01(cx, cy, 69) < 0.4) {
    c.fillStyle = "#e9d7e0";
    c.fillRect(Math.round(lx - r * 0.3), Math.round(ly - r * 0.3), Math.max(1, Math.round(px * 0.08)), Math.max(1, Math.round(px * 0.08)));
  }
}

/** Park trees: layered, lit canopies with a black outline and a shadow. */
function paintTrees(p: Paint) {
  for (let cy = 0; cy < CELLS_H; cy++)
    for (let cx = 0; cx < CELLS_W; cx++)
      if (p.map.type[cellIndex(cx, cy)] === CellType.PARK && hash01(cx, cy, 21) <= 0.42) paintTree(p, cx, cy);
}

function paintTree({ c, px }: Paint, cx: number, cy: number) {
  const r = px * (0.3 + hash01(cx, cy, 23) * 0.18);
  const x = (cx + 0.3 + hash01(cx, cy, 24) * 0.4) * px,
    y = (cy + 0.3 + hash01(cx, cy, 25) * 0.4) * px;
  const disc = (fill: string, dx: number, dy: number, radius: number) => {
    c.fillStyle = fill;
    c.beginPath();
    c.arc(x + dx, y + dy, radius, 0, Math.PI * 2);
    c.fill();
  };
  disc("rgba(0,0,0,0.3)", r * 0.35, r * 0.4, r);
  disc(OUTLINE, 0, 0, r + Math.max(1, px * 0.06));
  const dark = hash01(cx, cy, 22) < 0.5;
  disc(dark ? "#284420" : "#335a27", 0, 0, r);
  // Canopy highlights sit up and to the left.
  disc(dark ? "#3b6330" : "#4a7a36", -r * 0.2, -r * 0.22, r * 0.66);
  disc(dark ? "#55864a" : "#679c4e", -r * 0.35, -r * 0.38, r * 0.3);
}

function paintBuilding(p: Paint, b: Building) {
  const { c, px, sim, solid } = p;
  if (b.kind === "wall") {
    if (solid(b.cells[0])) paintWall(p, b.rect.x, b.rect.y);
    return;
  }
  if (sim && !sim.intact(b)) return paintRebuilding(p, b);
  const r = b.rect;
  // Everything snaps to whole pixels so outlines stay crisp.
  const x = Math.round(r.x * px),
    y = Math.round(r.y * px),
    w = Math.round((r.x + r.w) * px) - x,
    h = Math.round((r.y + r.h) * px) - y;
  const gap = Math.max(1, Math.round(px * 0.09));
  // Drop shadow.
  const sh = Math.max(1, Math.round(px * 0.14));
  c.fillStyle = "rgba(0,0,0,0.35)";
  c.fillRect(x + gap + sh, y + gap + sh, w - gap * 2, h - gap * 2);
  if (b.kind === "house") paintHouse(p, b, { x: x + gap, y: y + gap, w: w - gap * 2, h: h - gap * 2 });
  else paintStructureArt(c, b.kind, { x, y, w, h, px });
}

/** Partially rebuilt: finished sections show as fresh timber framing. */
function paintRebuilding({ c, px, solid }: Paint, b: Building) {
  for (const i of b.cells) {
    if (!solid(i)) continue;
    const cx = i % CELLS_W,
      cy = (i - cx) / CELLS_W;
    c.fillStyle = "#9c8356";
    c.fillRect(cx * px + 1, cy * px + 1, px - 2, px - 2);
    c.strokeStyle = "#5b4a2e";
    c.lineWidth = Math.max(1, px * 0.08);
    c.strokeRect(cx * px + 1.5, cy * px + 1.5, px - 3, px - 3);
  }
}

/** A roof inside a black outline: two slopes meeting at a ridge along the
 * long axis, the sunny slope lighter, a crisp dark ridge line, and faint
 * tile courses. `box` is the outline's extent in canvas pixels. */
function paintHouse({ c, px }: Paint, b: Building, box: { x: number; y: number; w: number; h: number }) {
  const line = Math.max(1, Math.round(px * 0.08));
  c.fillStyle = OUTLINE;
  c.fillRect(box.x, box.y, box.w, box.h);
  const ix = box.x + line,
    iy = box.y + line,
    iw = box.w - line * 2,
    ih = box.h - line * 2;
  c.fillStyle = ROOFS[b.variant % ROOFS.length];
  c.fillRect(ix, iy, iw, ih);
  const along = b.rect.w >= b.rect.h;
  c.fillStyle = "rgba(255,240,210,0.14)";
  if (along) c.fillRect(ix, iy, iw, Math.floor(ih / 2));
  else c.fillRect(ix, iy, Math.floor(iw / 2), ih);
  c.fillStyle = "rgba(0,0,0,0.18)";
  const course = Math.max(2, Math.round(px * 0.3));
  if (along) for (let yy = iy + course; yy < iy + ih - 1; yy += course) c.fillRect(ix, yy, iw, 1);
  else for (let xx = ix + course; xx < ix + iw - 1; xx += course) c.fillRect(xx, iy, 1, ih);
  c.fillStyle = OUTLINE;
  if (along) c.fillRect(ix, iy + Math.floor(ih / 2), iw, line);
  else c.fillRect(ix + Math.floor(iw / 2), iy, line, ih);
}

/** One wall stone. Edges and the hanging brick face follow the *standing*
 * wall, so a breach gets proper broken edges. */
function paintWall(p: Paint, cx: number, cy: number) {
  const { c, px, map, solid } = p;
  const x = Math.round(cx * px),
    y = Math.round(cy * px);
  const standing = (dx: number, dy: number) => {
    const nx = cx + dx,
      ny = cy + dy;
    if (!cellInBounds(nx, ny)) return false;
    const i = cellIndex(nx, ny);
    return map.wall[i] === 1 && solid(i);
  };
  if (ready(wallArt.cap)) {
    const sy = CAP.y0 + ((cy * CAP.w + cx * 37) % CAP.span);
    c.drawImage(wallArt.cap, CAP.x, sy, CAP.w, CAP.w, x, y, Math.round((cx + 1) * px) - x, Math.round((cy + 1) * px) - y);
  } else {
    c.fillStyle = WALL;
    c.fillRect(x, y, px + 0.5, px + 0.5);
  }
  paintWallEdges(p, { x, y }, standing);
  if (!standing(0, 1) && cy + 1 < CELLS_H) paintWallFace(p, cx, { x, y });
}

/** Shaded sides and a lit top edge wherever the stone at `at` (canvas
 * pixels) has no standing neighbour. */
function paintWallEdges({ c, px }: Paint, at: { x: number; y: number }, standing: (dx: number, dy: number) => boolean) {
  const { x, y } = at;
  const e = Math.max(1, px * 0.12);
  c.fillStyle = "rgba(0,0,0,0.35)";
  if (!standing(1, 0)) c.fillRect(x + px - e, y, e, px);
  if (!standing(-1, 0)) c.fillRect(x, y, e, px);
  c.fillStyle = "rgba(255,255,255,0.1)";
  if (!standing(0, -1)) c.fillRect(x, y, px, e);
}

/** The wall's south face, seen from above at a slant, hung below the stone
 * in column `cx` whose top-left is `at` (canvas pixels). */
function paintWallFace({ c, px }: Paint, cx: number, { x, y }: { x: number; y: number }) {
  const e = Math.max(1, px * 0.12);
  const h = px * 0.45;
  if (ready(wallArt.face)) {
    const sx = FACE.x0 + ((cx * CAP.w) % FACE.span);
    c.drawImage(wallArt.face, sx, FACE.y, CAP.w, FACE.h, x, y + px, px + 0.5, h);
  } else {
    c.fillStyle = "#3a3a33";
    c.fillRect(x, y + px, px + 0.5, h);
  }
  c.fillStyle = "rgba(0,0,0,0.3)";
  c.fillRect(x, y + px + h - e, px + 0.5, e);
}

/** Lantern brackets on house walls (lit during battles). */
function paintLanternBrackets({ c, px, map, sim }: Paint, lights: readonly Light[]) {
  for (const l of lights) {
    if (l.kind !== "lantern" && l.kind !== "door") continue;
    if (sim && !sim.intact(map.buildings[l.owner])) continue;
    const s = Math.max(2, px * 0.28);
    c.fillStyle = "#2b2622";
    c.fillRect(l.x * px - s / 2, l.y * px - s / 2, s, s);
    c.fillStyle = "#8a7045";
    c.fillRect(l.x * px - s / 4, l.y * px - s / 4, s / 2, s / 2);
  }
}

/** Rubble chunks over the cells of fallen buildings. */
function paintRubble({ c, px, map, solid }: Paint) {
  for (let i = 0; i < map.type.length; i++) {
    if (map.owner[i] < 0 || solid(i)) continue;
    const cx = i % CELLS_W,
      cy = (i - cx) / CELLS_W;
    for (let k = 0; k < 3; k++) {
      c.fillStyle = k === 0 ? "#6b645a" : "#57514a";
      const s = px * (0.14 + hash01(i, k, 41) * 0.16);
      c.fillRect(cx * px + hash01(i, k, 42) * (px - s), cy * px + hash01(i, k, 43) * (px - s), s, s);
    }
  }
}

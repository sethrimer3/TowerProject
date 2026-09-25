import { themeInfluence } from "./delve/labyrinth.ts";
import type { Mode } from "./entities.ts";

// Presentation only: themes never consume the generation RNG or alter tiles.
export const THEMES = [
  { name: "Weathered keep", floor: "#191e28", wall: "#485362", seam: "#242d39", accent: "#a69b83" },
  { name: "Mossbound ruins", floor: "#14291f", wall: "#3f6350", seam: "#21392a", accent: "#82b85b" },
  { name: "Amber catacombs", floor: "#30251a", wall: "#876444", seam: "#483422", accent: "#d4ad72" },
  { name: "Frozen vault", floor: "#162c3a", wall: "#56869c", seam: "#294656", accent: "#b0e8ed" },
  { name: "Ember forge", floor: "#301c20", wall: "#70423d", seam: "#40282c", accent: "#ec9255" },
  { name: "Violet geode", floor: "#271d38", wall: "#65517f", seam: "#392b4b", accent: "#c49de9" },
  { name: "Drowned temple", floor: "#122e30", wall: "#3c7775", seam: "#224748", accent: "#77c9b5" },
  { name: "Fungal hollow", floor: "#302334", wall: "#76566b", seam: "#473448", accent: "#dea5b8" },
  { name: "Obsidian crypt", floor: "#171923", wall: "#37384b", seam: "#242533", accent: "#b57687" },
  { name: "Astral sanctuary", floor: "#242b40", wall: "#626d91", seam: "#363e59", accent: "#e0ce91" },
] as const;

/** Centralized tuning parameters for the procedural dungeon environment rendering. */
export const DUNGEON_ENV_CONFIG = {
  // Density: keeping ~85-92% of floor tiles and ~75-80% of wall tiles clean/empty.
  floorDecorDensityBase: 0.05,
  floorDecorDensityNearWall: 0.10,
  wallDecorDensity: 0.11,
  // Clustering threshold: value noise must exceed this for decorative clusters to appear.
  clusterThreshold: 0.5,
  // Per-block subtle brightness / hue variation (limits: ±3% brightness, ±4% hue shift).
  blockBrightnessJitter: 0.035,
  blockHueJitter: 0.04,
  // Wall 3D lighting & contact shadows.
  wallTopHighlightAlpha: 0.32,
  wallBottomShadowAlpha: 0.4,
  contactShadowAlpha: 0.28,
  contactShadowSideAlpha: 0.18,
  // Tile seam ("grid") opacity — kept low so the grid sits behind gameplay elements.
  floorSeamAlpha: 0.35,
  wallSeamAlpha: 0.55,
  // Multiplier applied to wall base colors so wall faces read as a clearly
  // brighter, more solid material than the floor around them (readability
  // baseline; keep >= 1).
  wallBrightnessBoost: 1.22,
};

export interface TileNeighbors {
  northWall?: boolean;
  southWall?: boolean;
  westWall?: boolean;
  eastWall?: boolean;
}

export function tileRandom(x: number, y: number, seed: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth 2D value noise at two scales makes contiguous lobes and pockets.
function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const smooth = (v: number) => v * v * v * (v * (v * 6 - 15) + 10);
  const u = smooth(x - ix), v = smooth(y - iy);
  const a = tileRandom(ix, iy, seed), b = tileRandom(ix + 1, iy, seed);
  const c = tileRandom(ix, iy + 1, seed), d = tileRandom(ix + 1, iy + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

export function themeAt(mode: Mode, height: number, x: number, y: number, seed: number) {
  if (mode === "tower") {
    const index = Math.floor(Math.max(0, height) / 10) % 10;
    return { from: index, to: index, mix: 0, decor: index };
  }
  const influence = Math.max(0, themeInfluence(seed, x, y) + (noise(x / 7, y / 11, seed) - 0.5) * 0.12);
  const lower = Math.floor(influence), fraction = influence - lower;
  // Area influence is centered on the region's own theme, so only the
  // half-area near each gate mixes with its neighbour.
  const from = lower % 10, to = (lower + 1) % 10;
  const mix = fraction * fraction * (3 - 2 * fraction);
  return { from, to, mix, decor: noise(x / 3, y / 3, seed ^ 0x713f) < mix ? to : from };
}

function parseHex(hex: string): [number, number, number] {
  const num = parseInt(hex.slice(1), 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function color(a: string, b: string, t: number) {
  const [ar, ag, ab] = parseHex(a), [br, bg, bb] = parseHex(b);
  return `rgb(${Math.round(ar * (1 - t) + br * t)},${Math.round(ag * (1 - t) + bg * t)},${Math.round(ab * (1 - t) + bb * t)})`;
}

/** Scales an "rgb(r,g,b)" or "#rrggbb" string's brightness by `factor`, clamped to 255. */
function brighten(rgbOrHex: string, factor: number): string {
  let r: number, g: number, b: number;
  if (rgbOrHex.startsWith("#")) {
    [r, g, b] = parseHex(rgbOrHex);
  } else {
    const m = rgbOrHex.match(/\d+/g)!;
    [r, g, b] = m.map(Number);
  }
  const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v * factor)));
  return `rgb(${clamp(r)},${clamp(g)},${clamp(b)})`;
}

/** Applies very subtle per-block brightness and hue jitter within the unified palette. */
function applyBlockVariation(baseColor: string, x: number, y: number, seed: number): string {
  const [r, g, b] = parseHex(baseColor);
  const rBright = (tileRandom(x, y, seed ^ 0x4a1f) - 0.5) * 2 * DUNGEON_ENV_CONFIG.blockBrightnessJitter;
  const rHue = (tileRandom(x, y, seed ^ 0x9e3b) - 0.5) * 2 * DUNGEON_ENV_CONFIG.blockHueJitter;

  // Subtle shift towards blue/purple or red/amber tone while preserving luminosity
  const nr = Math.min(255, Math.max(0, Math.round(r * (1 + rBright + rHue * 0.4))));
  const ng = Math.min(255, Math.max(0, Math.round(g * (1 + rBright - rHue * 0.3))));
  const nb = Math.min(255, Math.max(0, Math.round(b * (1 + rBright + rHue * 0.6))));
  return `rgb(${nr},${ng},${nb})`;
}

/** One tile of procedural terrain: where it is, which art set applies, and
 * what it is. `empty` floors (nothing standing on them) may carry a detail. */
export type TerrainTile = {
  mode: Mode;
  height: number;
  seed: number;
  x: number;
  y: number;
  wall: boolean;
  empty: boolean;
  neighbors?: TileNeighbors;
};

/** A tile's four colours after theme blending and per-block variation. */
type TerrainInk = { floor: string; wall: string; seam: string; accent: string };

/** Everything a terrain painter reads. */
type Paint = {
  c: CanvasRenderingContext2D;
  tile: TerrainTile;
  ink: TerrainInk;
  /** The theme whose wall style and motif this tile uses. */
  theme: number;
  /** The tile's own roll, which varies each detail. */
  r: number;
};

function inkAt(tile: TerrainTile): { ink: TerrainInk; theme: number } {
  const { x, y, seed } = tile;
  const region = themeAt(tile.mode, tile.height, x, y, seed);
  const a = THEMES[region.from], b = THEMES[region.to];
  const baseInk = (key: keyof TerrainInk) => color(a[key], b[key], region.mix);
  // Subtle per-block brightness & hue variation while staying strictly within the unified palette
  const ink = {
    floor: applyBlockVariation(baseInk("floor"), x, y, seed),
    wall: brighten(applyBlockVariation(baseInk("wall"), x, y, seed), DUNGEON_ENV_CONFIG.wallBrightnessBoost),
    seam: baseInk("seam"),
    accent: baseInk("accent"),
  };
  return { ink, theme: region.decor };
}

function line(c: CanvasRenderingContext2D, ...points: number[]) {
  c.beginPath();
  c.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
  c.stroke();
}

/** Each theme's signature motif, drawn in its accent colour. */
const THEME_MOTIFS: ((c: CanvasRenderingContext2D) => void)[] = [
  // Rubble / cracked block
  (c) => { c.fillRect(4, 16, 4, 3); c.fillRect(11, 18, 3, 2); line(c, 7, 4, 10, 8, 8, 12); },
  // Trailing small vine with 2 leaves
  (c) => { line(c, 5, 2, 7, 10, 5, 18); c.fillRect(8, 7, 3, 2); c.fillRect(2, 13, 3, 2); },
  // Fossil rib fragment
  (c) => { line(c, 6, 16, 15, 7); line(c, 7, 13, 10, 16); line(c, 10, 10, 13, 13); },
  // Icicle / frost point
  (c) => { c.beginPath(); c.moveTo(8, 3); c.lineTo(12, 3); c.lineTo(10, 13); c.fill(); },
  // Ember fissure spark
  (c) => { line(c, 4, 19, 9, 13, 6, 9); c.fillRect(14, 15, 2, 2); },
  // Single crystal spire
  (c) => {
    c.beginPath();
    c.moveTo(8, 19); c.lineTo(7, 10); c.lineTo(10, 6); c.lineTo(12, 18);
    c.closePath(); c.stroke();
  },
  // Water ripple ring
  (c) => { c.beginPath(); c.ellipse(12, 14, 6, 2.5, 0, 0, Math.PI * 2); c.stroke(); },
  // Small fungal cap
  (c) => { c.fillRect(11, 13, 2, 5); c.beginPath(); c.ellipse(12, 13, 4, 2.5, 0, Math.PI, Math.PI * 2); c.fill(); },
  // Carved rune sigil fragment
  (c) => line(c, 8, 5, 14, 5, 11, 11, 14, 17, 8, 17),
  // Star gem glint
  (c) => { line(c, 12, 6, 12, 16); line(c, 7, 11, 17, 11); c.fillRect(11, 10, 2, 2); },
];

/** The restrained procedural detail library, one painter per detail type. */
const DETAILS = {
  // Fine organic fissure line with subtle branch
  crack: ({ c, tile, ink, r }: Paint) => {
    c.strokeStyle = tile.wall ? ink.seam : ink.wall;
    c.lineWidth = 0.8;
    const x1 = 4 + (r * 11) % 6, y1 = 4 + (r * 17) % 5;
    const mx = 10 + (r * 23) % 4, my = 11 + (r * 19) % 3;
    const x2 = 17 + (r * 7) % 4, y2 = 18 + (r * 13) % 4;
    line(c, x1, y1, mx, my, x2, y2);
    if (r > 0.4) line(c, mx, my, mx + 4, my - 3);
  },
  // Clean subtle mortar seam or stone joint
  masonry: ({ c, ink, r }: Paint) => {
    c.strokeStyle = ink.seam;
    c.lineWidth = 0.9;
    const vertical = r > 0.5;
    line(c, ...(vertical ? [12, 3, 12, 21] : [3, 12, 21, 12]));
    if (r > 0.7) line(c, ...(vertical ? [12, 12, 20, 12] : [12, 12, 12, 20]));
  },
  // Chipped stone corner notch with highlight facet
  chip: ({ c, tile, ink }: Paint) => {
    c.fillStyle = ink.seam;
    c.fillRect(3, 3, 4, 3);
    c.fillStyle = tile.wall ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.06)";
    c.fillRect(3, 2, 4, 1);
  },
  // Faint score marks / claw or tool scratches
  scratch: ({ c, tile, ink, r }: Paint) => {
    c.strokeStyle = tile.wall ? ink.accent : ink.wall;
    c.lineWidth = 0.7;
    const sx = 6 + (r * 13) % 8, sy = 6 + (r * 19) % 8;
    line(c, sx, sy, sx + 6, sy + 4);
    line(c, sx + 1, sy + 3, sx + 7, sy + 7);
  },
  // Soft irregular translucent puddle/stain
  stain: ({ c, r }: Paint) => {
    c.fillStyle = "rgba(0, 0, 0, 0.22)";
    c.beginPath();
    c.ellipse(12, 13, 5 + (r * 4) % 3, 3 + (r * 6) % 2, (r * Math.PI), 0, Math.PI * 2);
    c.fill();
  },
  // Sparse 1-3 tiny stone chips/pebbles with tiny contact shadow
  rubble: ({ c, tile, ink, r }: Paint) => {
    const stone = tile.wall ? ink.wall : ink.accent;
    c.fillStyle = "rgba(0, 0, 0, 0.35)";
    c.fillRect(6, 17, 3, 1);
    c.fillRect(14, 18, 4, 1);
    c.fillStyle = stone;
    c.fillRect(6, 15, 3, 2);
    c.fillRect(14, 16, 3, 2);
    if (r > 0.6) {
      c.fillStyle = "rgba(0, 0, 0, 0.3)";
      c.fillRect(10, 19, 2, 1);
      c.fillStyle = stone;
      c.fillRect(10, 18, 2, 1);
    }
  },
  // Signature motif from the current biome theme
  themeSpecial: ({ c, ink, theme }: Paint) => {
    c.strokeStyle = ink.accent;
    c.fillStyle = ink.accent;
    c.lineWidth = 1;
    THEME_MOTIFS[theme]?.(c);
  },
};
type DetailType = keyof typeof DETAILS;
const DETAIL_TYPES = Object.keys(DETAILS) as DetailType[];

// Wall stone faces: clean, restrained block faces in the wall colour.
function brickFace({ c, tile, theme }: Paint) {
  const { x, y, seed } = tile;
  // Small deterministic jitter on the brick seam position so adjacent
  // wall tiles of the same theme don't look like one stamp repeated
  // across the wall (widths stay fixed so tiles never bleed past 24px).
  const jitterX = Math.round((tileRandom(x, y, seed ^ 0x2201) - 0.5) * 2);
  const jitterY = Math.round((tileRandom(x, y, seed ^ 0x2202) - 0.5) * 2);
  const split = (theme === 2 ? 16 : 11) + jitterX;
  const rowSplit = 12 + jitterY;
  // Mortar gaps kept to a thin 1px line so the wall face reads as a
  // solid stone mass rather than dark mortar dominating the tile.
  c.fillRect(1, 1, split - 1, rowSplit - 2);
  c.fillRect(split + 1, 1, 22 - split, rowSplit - 2);
  c.fillRect(1, rowSplit, 6, 22 - rowSplit - 1);
  c.fillRect(9, rowSplit, 14, 22 - rowSplit - 1);
}
function forgePlateFace({ c, ink }: Paint) {
  c.fillRect(2, 2, 20, 19);
  c.strokeStyle = ink.accent;
  c.strokeRect(4, 4, 16, 15);
  for (const xx of [5, 18]) {
    for (const yy of [5, 18]) {
      c.fillStyle = ink.seam;
      c.fillRect(xx, yy, 2, 2);
    }
  }
}
function astralPillarFace({ c, ink }: Paint) {
  c.fillRect(2, 1, 20, 21);
  c.fillStyle = ink.accent;
  c.fillRect(3, 2, 18, 1);
  c.fillRect(3, 20, 18, 1);
  c.fillRect(5, 5, 2, 13);
  c.fillRect(17, 5, 2, 13);
}
function rubbleSlabFace({ c, ink }: Paint) {
  c.beginPath();
  c.moveTo(2, 3); c.lineTo(15, 1); c.lineTo(23, 8);
  c.lineTo(20, 21); c.lineTo(7, 23); c.lineTo(1, 15);
  c.closePath();
  c.fill();
  c.strokeStyle = ink.seam;
  c.beginPath(); c.moveTo(15, 1); c.lineTo(11, 12); c.lineTo(20, 21); c.stroke();
  c.beginPath(); c.moveTo(11, 12); c.lineTo(1, 15); c.stroke();
}
/** Each theme's wall face, by theme index. */
const WALL_FACES = [
  brickFace, brickFace, brickFace, rubbleSlabFace, forgePlateFace,
  rubbleSlabFace, brickFace, rubbleSlabFace, rubbleSlabFace, astralPillarFace,
];

function paintWall(p: Paint) {
  const { c, ink } = p;
  // Wall base and perimeter seam - kept crisp so walls read as a strong silhouette
  c.fillStyle = ink.seam;
  c.fillRect(0, 0, 24, 24);
  c.save();
  c.globalAlpha = DUNGEON_ENV_CONFIG.wallSeamAlpha;
  c.strokeStyle = ink.seam;
  c.lineWidth = 0.9;
  c.strokeRect(0.4, 0.4, 23.2, 23.2);
  c.restore();

  c.fillStyle = ink.wall;
  (WALL_FACES[p.theme] ?? rubbleSlabFace)(p);

  // Subtle wall top-edge lighting & bottom contact bevel
  c.fillStyle = `rgba(255, 255, 255, ${DUNGEON_ENV_CONFIG.wallTopHighlightAlpha})`;
  c.fillRect(1, 1, 22, 1);

  c.fillStyle = `rgba(0, 0, 0, ${DUNGEON_ENV_CONFIG.wallBottomShadowAlpha})`;
  c.fillRect(0, 22, 24, 2);
}

/** Shadows adjacent walls cast onto a floor: which side, how dark, where. */
const CONTACT_SHADOWS: [keyof TileNeighbors, number, [number, number, number, number]][] = [
  ["northWall", DUNGEON_ENV_CONFIG.contactShadowAlpha, [0, 0, 24, 4]],
  ["westWall", DUNGEON_ENV_CONFIG.contactShadowSideAlpha, [0, 0, 3, 24]],
  ["eastWall", DUNGEON_ENV_CONFIG.contactShadowSideAlpha, [21, 0, 3, 24]],
];

function paintFloor({ c, tile, ink }: Paint) {
  // Floor tile base: smooth and calm; seam kept faint so the grid never dominates
  c.fillStyle = ink.floor;
  c.fillRect(0, 0, 24, 24);
  c.save();
  c.globalAlpha = DUNGEON_ENV_CONFIG.floorSeamAlpha;
  c.strokeStyle = ink.seam;
  c.lineWidth = 0.5;
  c.strokeRect(0.25, 0.25, 23.5, 23.5);
  c.restore();

  // Wall contact shadows cast onto floors from adjacent walls (adds depth/dimensionality)
  for (const [side, alpha, [sx, sy, sw, sh]] of CONTACT_SHADOWS) {
    if (!tile.neighbors?.[side]) continue;
    c.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    c.fillRect(sx, sy, sw, sh);
  }
}

const isNearWall = (n?: TileNeighbors) => !!(n && (n.northWall || n.southWall || n.westWall || n.eastWall));

/** Whether this tile gets a detail at all. Keep empty tiles common and
 * cluster decorations intentionally rather than scattering uniformly. */
function decorates(tile: TerrainTile, r: number) {
  if (!tile.wall && !tile.empty) return false;
  // Rubble/cracks favor walls/corners over wide-open paths
  const densityThreshold = tile.wall
    ? DUNGEON_ENV_CONFIG.wallDecorDensity
    : (isNearWall(tile.neighbors) ? DUNGEON_ENV_CONFIG.floorDecorDensityNearWall : DUNGEON_ENV_CONFIG.floorDecorDensityBase);
  // In clusters, threshold is slightly more lenient, but empty tiles still dominate
  const clusterVal = noise(tile.x / 4.5, tile.y / 4.5, tile.seed ^ 0x3c71);
  const isCluster = clusterVal > DUNGEON_ENV_CONFIG.clusterThreshold;
  return r < (isCluster ? densityThreshold : densityThreshold * 0.4);
}

function detailFor(tile: TerrainTile, r: number): DetailType {
  const { x, y, seed } = tile;
  // Deterministically select detail type, avoiding identical markings on adjacent tiles
  const typeAt = (tx: number, ty: number) => Math.floor(tileRandom(tx, ty, seed ^ 0x51ef) * DETAIL_TYPES.length);
  let detailIndex = typeAt(x, y);
  if (detailIndex === typeAt(x - 1, y) || detailIndex === typeAt(x, y - 1)) {
    detailIndex = (detailIndex + 1) % DETAIL_TYPES.length;
  }
  const type = DETAIL_TYPES[detailIndex];
  // If in the open floor walking area, favor subtle cracks/stains/scratches over bulky rubble
  const openFloor = !tile.wall && !isNearWall(tile.neighbors);
  const bulky = type === "rubble" || type === "masonry";
  if (openFloor && bulky) return r > 0.04 ? "stain" : "crack";
  return type;
}

function paintDetail(p: Paint) {
  const { c, tile } = p;
  const { x, y, seed } = tile;
  // Seeded deterministic variation: rotation, mirroring, subtle scale & opacity
  const rotStep = Math.floor(tileRandom(x, y, seed ^ 0x18ac) * 4); // 0, 90, 180, 270 deg
  const mirrorX = tileRandom(x, y, seed ^ 0x762b) > 0.5 ? -1 : 1;
  const mirrorY = tileRandom(x, y, seed ^ 0x3d9a) > 0.5 ? -1 : 1;
  const scale = 0.85 + tileRandom(x, y, seed ^ 0x9321) * 0.25; // 0.85 to 1.10
  const opacity = (tile.wall ? 0.65 : 0.38) + tileRandom(x, y, seed ^ 0xb482) * 0.25;

  c.save();
  // Transform around tile center (12, 12)
  c.translate(12, 12);
  c.rotate((rotStep * Math.PI) / 2);
  c.scale(mirrorX * scale, mirrorY * scale);
  c.translate(-12, -12);
  c.globalAlpha = Math.min(1, Math.max(0.2, opacity));
  DETAILS[detailFor(tile, p.r)](p);
  c.restore();
}

/** Paints one tile of procedural terrain in 24×24 tile space: the wall or
 * floor in its blended theme colours, then (on a few walls and empty floors)
 * one restrained detail. */
export function drawTerrain(c: CanvasRenderingContext2D, tile: TerrainTile) {
  const p: Paint = { c, tile, ...inkAt(tile), r: tileRandom(tile.x, tile.y, tile.seed) };
  if (tile.wall) paintWall(p);
  else paintFloor(p);
  if (decorates(tile, p.r)) paintDetail(p);
}

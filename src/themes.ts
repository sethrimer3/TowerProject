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
  floorDecorDensityBase: 0.08,
  floorDecorDensityNearWall: 0.16,
  wallDecorDensity: 0.18,
  // Clustering threshold: value noise must exceed this for decorative clusters to appear.
  clusterThreshold: 0.44,
  // Per-block subtle brightness / hue variation (limits: ±3% brightness, ±4% hue shift).
  blockBrightnessJitter: 0.035,
  blockHueJitter: 0.04,
  // Wall 3D lighting & contact shadows.
  wallTopHighlightAlpha: 0.18,
  wallBottomShadowAlpha: 0.40,
  contactShadowAlpha: 0.32,
  contactShadowSideAlpha: 0.22,
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
  const warped = Math.max(0, y + (noise(x / 11, y / 23, seed) - 0.5) * 42
    + (noise(x / 4, y / 9, seed ^ 0x517c) - 0.5) * 14);
  // A 16-tile transition straddles each nominal hundred-depth boundary.
  const band = Math.floor((warped + 8) / 100);
  const t = Math.max(0, Math.min(1, (warped - (band * 100 - 8)) / 16));
  const mix = t * t * (3 - 2 * t);
  const from = Math.max(0, band - 1) % 10, to = band % 10;
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

/** Detail types for the restrained procedural detail library. */
type DetailType = "crack" | "masonry" | "chip" | "scratch" | "stain" | "rubble" | "themeSpecial";

function drawDetail(
  c: CanvasRenderingContext2D,
  type: DetailType,
  r: number,
  themeDecorId: number,
  accentColor: string,
  wallColor: string,
  seamColor: string,
  isWall: boolean
) {
  const line = (...points: number[]) => {
    c.beginPath();
    c.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
    c.stroke();
  };

  switch (type) {
    case "crack": {
      // Fine organic fissure line with subtle branch
      c.strokeStyle = isWall ? seamColor : wallColor;
      c.lineWidth = 0.8;
      const x1 = 4 + (r * 11) % 6, y1 = 4 + (r * 17) % 5;
      const mx = 10 + (r * 23) % 4, my = 11 + (r * 19) % 3;
      const x2 = 17 + (r * 7) % 4, y2 = 18 + (r * 13) % 4;
      line(x1, y1, mx, my, x2, y2);
      if (r > 0.4) {
        line(mx, my, mx + 4, my - 3);
      }
      break;
    }
    case "masonry": {
      // Clean subtle mortar seam or stone joint
      c.strokeStyle = seamColor;
      c.lineWidth = 0.9;
      const isVert = r > 0.5;
      if (isVert) {
        line(12, 3, 12, 21);
        if (r > 0.7) line(12, 12, 20, 12);
      } else {
        line(3, 12, 21, 12);
        if (r > 0.7) line(12, 12, 12, 20);
      }
      break;
    }
    case "chip": {
      // Chipped stone corner notch with highlight facet
      c.fillStyle = seamColor;
      c.fillRect(3, 3, 4, 3);
      c.fillStyle = isWall ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.06)";
      c.fillRect(3, 2, 4, 1);
      break;
    }
    case "scratch": {
      // Faint score marks / claw or tool scratches
      c.strokeStyle = isWall ? accentColor : wallColor;
      c.lineWidth = 0.7;
      const sx = 6 + (r * 13) % 8, sy = 6 + (r * 19) % 8;
      line(sx, sy, sx + 6, sy + 4);
      line(sx + 1, sy + 3, sx + 7, sy + 7);
      break;
    }
    case "stain": {
      // Soft irregular translucent puddle/stain
      c.fillStyle = "rgba(0, 0, 0, 0.22)";
      c.beginPath();
      c.ellipse(12, 13, 5 + (r * 4) % 3, 3 + (r * 6) % 2, (r * Math.PI), 0, Math.PI * 2);
      c.fill();
      break;
    }
    case "rubble": {
      // Sparse 1-3 tiny stone chips/pebbles with tiny contact shadow
      c.fillStyle = "rgba(0, 0, 0, 0.35)";
      c.fillRect(6, 17, 3, 1);
      c.fillRect(14, 18, 4, 1);
      c.fillStyle = isWall ? wallColor : accentColor;
      c.fillRect(6, 15, 3, 2);
      c.fillRect(14, 16, 3, 2);
      if (r > 0.6) {
        c.fillStyle = "rgba(0, 0, 0, 0.3)";
        c.fillRect(10, 19, 2, 1);
        c.fillStyle = isWall ? wallColor : accentColor;
        c.fillRect(10, 18, 2, 1);
      }
      break;
    }
    case "themeSpecial": {
      // Signature motif from the current biome theme
      c.strokeStyle = accentColor;
      c.fillStyle = accentColor;
      c.lineWidth = 1;
      switch (themeDecorId) {
        case 0: // Rubble / cracked block
          c.fillRect(4, 16, 4, 3); c.fillRect(11, 18, 3, 2); line(7, 4, 10, 8, 8, 12);
          break;
        case 1: // Trailing small vine with 2 leaves
          line(5, 2, 7, 10, 5, 18);
          c.fillRect(8, 7, 3, 2);
          c.fillRect(2, 13, 3, 2);
          break;
        case 2: // Fossil rib fragment
          line(6, 16, 15, 7);
          line(7, 13, 10, 16);
          line(10, 10, 13, 13);
          break;
        case 3: // Icicle / frost point
          c.beginPath();
          c.moveTo(8, 3); c.lineTo(12, 3); c.lineTo(10, 13); c.fill();
          break;
        case 4: // Ember fissure spark
          line(4, 19, 9, 13, 6, 9);
          c.fillRect(14, 15, 2, 2);
          break;
        case 5: // Single crystal spire
          c.beginPath();
          c.moveTo(8, 19); c.lineTo(7, 10); c.lineTo(10, 6); c.lineTo(12, 18);
          c.closePath(); c.stroke();
          break;
        case 6: // Water ripple ring
          c.beginPath();
          c.ellipse(12, 14, 6, 2.5, 0, 0, Math.PI * 2);
          c.stroke();
          break;
        case 7: // Small fungal cap
          c.fillRect(11, 13, 2, 5);
          c.beginPath();
          c.ellipse(12, 13, 4, 2.5, 0, Math.PI, Math.PI * 2);
          c.fill();
          break;
        case 8: // Carved rune sigil fragment
          line(8, 5, 14, 5, 11, 11, 14, 17, 8, 17);
          break;
        case 9: // Star gem glint
          line(12, 6, 12, 16);
          line(7, 11, 17, 11);
          c.fillRect(11, 10, 2, 2);
          break;
      }
      break;
    }
  }
}

const DETAIL_TYPES: DetailType[] = [
  "crack",
  "masonry",
  "chip",
  "scratch",
  "stain",
  "rubble",
  "themeSpecial",
];

export function drawTerrain(
  c: CanvasRenderingContext2D,
  wall: boolean,
  mode: Mode,
  height: number,
  x: number,
  y: number,
  seed: number,
  empty: boolean,
  neighbors?: TileNeighbors
) {
  const region = themeAt(mode, height, x, y, seed);
  const a = THEMES[region.from], b = THEMES[region.to], themeId = region.decor;
  const baseInk = (key: "floor" | "wall" | "seam" | "accent") => color(a[key], b[key], region.mix);
  
  const rawFloor = baseInk("floor");
  const rawWall = baseInk("wall");
  const rawSeam = baseInk("seam");
  const rawAccent = baseInk("accent");

  // Subtle per-block brightness & hue variation while staying strictly within the unified palette
  const floorColor = applyBlockVariation(rawFloor, x, y, seed);
  const wallColor = applyBlockVariation(rawWall, x, y, seed);
  const seamColor = rawSeam;
  const accentColor = rawAccent;

  const r = tileRandom(x, y, seed);
  const clusterVal = noise(x / 4.5, y / 4.5, seed ^ 0x3c71);

  if (wall) {
    // Wall base and perimeter seam
    c.fillStyle = seamColor;
    c.fillRect(0, 0, 24, 24);
    c.strokeStyle = seamColor;
    c.lineWidth = 0.7;
    c.strokeRect(0.4, 0.4, 23.2, 23.2);

    // Wall stone fill: clean, restrained block faces
    c.fillStyle = wallColor;
    if ([0, 1, 2, 6].includes(themeId)) {
      const split = themeId === 2 ? 16 : 11;
      c.fillRect(1, 1, split - 1, 9);
      c.fillRect(split + 1, 1, 22 - split, 9);
      c.fillRect(1, 12, 6, 10);
      c.fillRect(9, 12, 14, 10);
    } else if (themeId === 4) {
      c.fillRect(2, 2, 20, 19);
      c.strokeStyle = accentColor;
      c.strokeRect(4, 4, 16, 15);
      for (const xx of [5, 18]) {
        for (const yy of [5, 18]) {
          c.fillStyle = seamColor;
          c.fillRect(xx, yy, 2, 2);
        }
      }
    } else if (themeId === 9) {
      c.fillRect(2, 1, 20, 21);
      c.fillStyle = accentColor;
      c.fillRect(3, 2, 18, 1);
      c.fillRect(3, 20, 18, 1);
      c.fillRect(5, 5, 2, 13);
      c.fillRect(17, 5, 2, 13);
    } else {
      c.beginPath();
      c.moveTo(2, 3); c.lineTo(15, 1); c.lineTo(23, 8);
      c.lineTo(20, 21); c.lineTo(7, 23); c.lineTo(1, 15);
      c.closePath();
      c.fill();
      c.strokeStyle = seamColor;
      c.beginPath(); c.moveTo(15, 1); c.lineTo(11, 12); c.lineTo(20, 21); c.stroke();
      c.beginPath(); c.moveTo(11, 12); c.lineTo(1, 15); c.stroke();
    }

    // Subtle wall top-edge lighting & bottom contact bevel
    c.fillStyle = `rgba(255, 255, 255, ${DUNGEON_ENV_CONFIG.wallTopHighlightAlpha})`;
    c.fillRect(1, 1, 22, 1);

    c.fillStyle = `rgba(0, 0, 0, ${DUNGEON_ENV_CONFIG.wallBottomShadowAlpha})`;
    c.fillRect(0, 22, 24, 2);
  } else {
    // Floor tile base: smooth and calm
    c.fillStyle = floorColor;
    c.fillRect(0, 0, 24, 24);
    c.strokeStyle = seamColor;
    c.lineWidth = 0.5;
    c.strokeRect(0.25, 0.25, 23.5, 23.5);

    // Wall contact shadows cast onto floors from adjacent walls (adds depth/dimensionality)
    if (neighbors) {
      if (neighbors.northWall) {
        c.fillStyle = `rgba(0, 0, 0, ${DUNGEON_ENV_CONFIG.contactShadowAlpha})`;
        c.fillRect(0, 0, 24, 4);
      }
      if (neighbors.westWall) {
        c.fillStyle = `rgba(0, 0, 0, ${DUNGEON_ENV_CONFIG.contactShadowSideAlpha})`;
        c.fillRect(0, 0, 3, 24);
      }
      if (neighbors.eastWall) {
        c.fillStyle = `rgba(0, 0, 0, ${DUNGEON_ENV_CONFIG.contactShadowSideAlpha})`;
        c.fillRect(21, 0, 3, 24);
      }
    }
  }

  // --- RESTRAINED DECORATION PASS ---
  // Keep empty tiles common; avoid placing identical marks on adjacent tiles;
  // cluster decorations intentionally rather than scattering uniformly.
  const isNearWall = !!(neighbors && (neighbors.northWall || neighbors.southWall || neighbors.westWall || neighbors.eastWall));
  
  // Rubble/cracks favor walls/corners over wide-open paths
  const densityThreshold = wall
    ? DUNGEON_ENV_CONFIG.wallDecorDensity
    : (isNearWall ? DUNGEON_ENV_CONFIG.floorDecorDensityNearWall : DUNGEON_ENV_CONFIG.floorDecorDensityBase);

  // In clusters, threshold is slightly more lenient, but empty tiles still dominate
  const isCluster = clusterVal > DUNGEON_ENV_CONFIG.clusterThreshold;
  const effectiveThreshold = isCluster ? densityThreshold : densityThreshold * 0.4;

  const canDecorate = (wall || empty) && r < effectiveThreshold;
  if (!canDecorate) return;

  // Deterministically select detail type, ensuring neighbors do not share the exact same marking
  let detailIndex = Math.floor(tileRandom(x, y, seed ^ 0x51ef) * DETAIL_TYPES.length);

  // Avoid placing identical markings on adjacent tiles
  const leftTypeIdx = Math.floor(tileRandom(x - 1, y, seed ^ 0x51ef) * DETAIL_TYPES.length);
  const bottomTypeIdx = Math.floor(tileRandom(x, y - 1, seed ^ 0x51ef) * DETAIL_TYPES.length);
  if (detailIndex === leftTypeIdx || detailIndex === bottomTypeIdx) {
    detailIndex = (detailIndex + 1) % DETAIL_TYPES.length;
  }

  let selectedType = DETAIL_TYPES[detailIndex];

  // If in the open floor walking area, favor subtle cracks/stains/scratches over bulky rubble
  if (!wall && !isNearWall && (selectedType === "rubble" || selectedType === "masonry")) {
    selectedType = r > 0.04 ? "stain" : "crack";
  }

  // Seeded deterministic variation: rotation, mirroring, subtle scale & opacity
  const rotStep = Math.floor(tileRandom(x, y, seed ^ 0x18ac) * 4); // 0, 90, 180, 270 deg
  const mirrorX = tileRandom(x, y, seed ^ 0x762b) > 0.5 ? -1 : 1;
  const mirrorY = tileRandom(x, y, seed ^ 0x3d9a) > 0.5 ? -1 : 1;
  const scale = 0.85 + tileRandom(x, y, seed ^ 0x9321) * 0.25; // 0.85 to 1.10
  const opacity = (wall ? 0.65 : 0.38) + tileRandom(x, y, seed ^ 0xb482) * 0.25;

  c.save();
  // Transform around tile center (12, 12)
  c.translate(12, 12);
  c.rotate((rotStep * Math.PI) / 2);
  c.scale(mirrorX * scale, mirrorY * scale);
  c.translate(-12, -12);

  c.globalAlpha = Math.min(1, Math.max(0.2, opacity));

  drawDetail(
    c,
    selectedType,
    r,
    themeId,
    accentColor,
    wallColor,
    seamColor,
    wall
  );

  c.restore();
}

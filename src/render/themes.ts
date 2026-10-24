import { themeInfluence } from "../delve/labyrinth.ts";
import type { Mode } from "../entities.ts";
import { tileRandom } from "../random.ts";

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

export interface TileNeighbors {
  northWall?: boolean;
  southWall?: boolean;
  westWall?: boolean;
  eastWall?: boolean;
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

export type TerrainTile = {
  mode: Mode;
  tier?: number;
  height: number;
  seed: number;
  x: number;
  y: number;
  wall: boolean;
  empty: boolean;
  neighbors?: TileNeighbors;
};

/** Cardinal neighbors address the native connected-wall atlas. */
export function wallAdjacencyMask(n: Required<TileNeighbors>) {
  return (n.northWall ? 1 : 0) | (n.eastWall ? 2 : 0) | (n.southWall ? 4 : 0) | (n.westWall ? 8 : 0);
}

import type { Point, Torch } from "./entities.ts";

/** Centralized dungeon lighting parameters for fast tuning and consistency. */
export const LIGHTING_CONFIG = {
  /** Global ambient darkness overlay color and opacity.
   * A subtle dark-purple tone that keeps the dungeon fully readable without torches. */
  ambient: {
    color: "#181226", // Dark purple tint
    opacity: 0.34,    // Floor-only darkness pass (walls are excluded entirely, see drawDungeonLightmap); torchlight carves it away
  },
  /** Default torch properties when placed in generation */
  torch: {
    defaultRadius: 5.5, // Light reach in tiles (direct light; bounce light fades within it too)
    defaultIntensity: 0.7,
  },
  /** Candle color ramp for the baked glow, from the bright core (offset 0)
   * to the feathered edge (offset 1). Alpha is the peak for that band. */
  stops: [
    { offset: 0.00, color: "rgba(255, 230, 185, 0.45)" }, // Soft warm amber core
    { offset: 0.20, color: "rgba(245, 205, 150, 0.35)" },
    { offset: 0.45, color: "rgba(220, 160, 95, 0.18)" },
    { offset: 0.70, color: "rgba(180, 115, 60, 0.07)" },
    { offset: 1.00, color: "rgba(140, 75, 30, 0.00)" },  // Feathered out to 0
  ] as const,
  /** Multi-harmonic coherent flicker configuration */
  flicker: {
    /** Overall flicker amplitude (+/- ~3%) */
    amplitude: 0.035,
    /** Harmonics for smooth, coherent, non-repeating organic flicker (no Math.random()) */
    harmonics: [
      { speed: 1 / 480, weight: 0.55, phaseMult: 1.0 },
      { speed: 1 / 230, weight: 0.30, phaseMult: 2.3 },
      { speed: 1 / 110, weight: 0.15, phaseMult: 4.1 },
    ],
  },
  /** Baked torch glow (see torch-light.ts). Computed once per torch, drawn
   * each frame as two cheap image blits. */
  glow: {
    /** Light-field samples per tile; the field is blurred and upscaled smoothly. */
    resolution: 8,
    /** Falloff exponent over the light radius (higher = tighter core). */
    falloffPower: 1.7,
    /** Strength of the light that bends around corners (fraction of direct). */
    bounce: 0.45,
    /** Extra path cost per tile for bounce light, so it dies off around bends. */
    bouncePathScale: 1.25,
    /** Blur radius in tiles: softens occlusion edges into penumbras. */
    softness: 0.55,
    /** Additive warm glow strength. */
    strength: 0.75,
    /** How much of the ambient darkness the light removes at full brightness. */
    carve: 0.95,
    /** Flicker radius wobble relative to intensity flicker. */
    radiusFlicker: 0.6,
  },
  /** Torch-cast shadows from items, enemies, and the player. */
  shadow: {
    /** Peak opacity of a shadow cast right next to a torch. */
    strength: 0.7,
    /** Shadow length (in sprite heights) right beside a torch... */
    minLength: 0.45,
    /** ...growing this much per tile of distance... */
    lengthPerTile: 0.2,
    /** ...up to this cap. */
    maxLength: 1.3,
    color: [8, 6, 16],
  },
  /** Torch bump lighting on floor sprites (see floor-relief.ts). */
  relief: {
    /** Luminance (0-255) above which a sprite pixel counts as raised. */
    heightThreshold: 38,
    /** Relief reach relative to the torch light radius. */
    radiusScale: 0.9,
    /** Distance falloff exponent; higher keeps relief tighter to the flame. */
    falloffPower: 1.3,
    /** Flame height above the floor, in tiles. Larger = flatter look near the torch. */
    torchHeight: 1.1,
    /** Overall relief amount before per-layer strengths. */
    strength: 1.4,
    highlightStrength: 0.55,
    shadowStrength: 0.6,
    /** Grazing factor (0-1) at which the second shadow pixel starts to appear. */
    longShadowStart: 0.85,
    longShadowStrength: 0.6,
    highlightColor: [255, 196, 128],
    shadowColor: [6, 4, 12],
  },
};

/** Computes smooth coherent flicker multiplier for a torch at a given timestamp.
 * Torches have independent pseudo-randomized phases based on their coordinates. */
export function getTorchFlicker(t: Pick<Torch, "x" | "y">, now: number, reduceMotion: boolean): number {
  if (reduceMotion) return 1;
  // High-entropy spatial hash for independent phase
  const phase = ((t.x * 374761393) ^ (t.y * 668265263)) % 10000;
  let wave = 0;
  for (const h of LIGHTING_CONFIG.flicker.harmonics) {
    wave += Math.sin(now * h.speed + phase * h.phaseMult) * h.weight;
  }
  return 1 + wave * LIGHTING_CONFIG.flicker.amplitude;
}

/** Tile-grid visibility-polygon computation for torch light. Walls block
 * light; the result is cached on the torch (see generation.ts) and only
 * recomputed when the torch or nearby geometry changes, never per frame. */
type Segment = [Point, Point];
function raySegmentDistance(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  a: Point,
  b: Point,
): number | null {
  const sx = b.x - a.x,
    sy = b.y - a.y;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((a.x - ox) * sy - (a.y - oy) * sx) / denom;
  const u = ((a.x - ox) * dy - (a.y - oy) * dx) / denom;
  if (t < 0 || u < -1e-6 || u > 1 + 1e-6) return null;
  return t;
}
/** Builds the segments of every wall tile face that borders an open tile
 * within range of the torch (interior wall faces can never be seen, so
 * they're skipped to keep the segment list small). */
function collectSegments(
  ox: number,
  oy: number,
  reach: number,
  isWall: (x: number, y: number) => boolean,
): Segment[] {
  const segments: Segment[] = [];
  const x0 = Math.floor(ox - reach),
    x1 = Math.ceil(ox + reach),
    y0 = Math.floor(oy - reach),
    y1 = Math.ceil(oy + reach);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      if (!isWall(tx, ty)) continue;
      const openN = !isWall(tx, ty + 1),
        openS = !isWall(tx, ty - 1),
        openE = !isWall(tx + 1, ty),
        openW = !isWall(tx - 1, ty);
      if (!openN && !openS && !openE && !openW) continue;
      const l = tx,
        r = tx + 1,
        b = ty,
        t = ty + 1;
      if (openN) segments.push([{ x: l, y: t }, { x: r, y: t }]);
      if (openS) segments.push([{ x: l, y: b }, { x: r, y: b }]);
      if (openE) segments.push([{ x: r, y: b }, { x: r, y: t }]);
      if (openW) segments.push([{ x: l, y: b }, { x: l, y: t }]);
    }
  return segments;
}
export function computeVisibilityPolygon(
  torch: Pick<Torch, "x" | "y" | "lightRadius">,
  isWall: (x: number, y: number) => boolean,
): Point[] {
  const ox = torch.x + 0.5,
    oy = torch.y + 0.5,
    r = torch.lightRadius;
  const segments = collectSegments(ox, oy, r + 1, isWall);
  const angles = new Set<number>();
  const eps = 1e-4;
  for (const [a, b] of segments)
    for (const p of [a, b]) {
      const ang = Math.atan2(p.y - oy, p.x - ox);
      angles.add(ang);
      angles.add(ang + eps);
      angles.add(ang - eps);
    }
  const rays = 40;
  for (let i = 0; i < rays; i++) angles.add((i / rays) * Math.PI * 2 - Math.PI);
  const castRay = (ang: number): Point => {
    const dx = Math.cos(ang),
      dy = Math.sin(ang);
    let best = r;
    for (const [a, b] of segments) {
      const hit = raySegmentDistance(ox, oy, dx, dy, a, b);
      if (hit !== null && hit < best) best = hit;
    }
    return { x: ox + dx * best, y: oy + dy * best };
  };
  return [...angles].sort((a, b) => a - b).map(castRay);
}

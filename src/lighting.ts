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
    /** Overall light intensity flicker amplitude (about +/- 8%) */
    amplitude: 0.08,
    /** Harmonics for smooth, coherent, non-repeating organic flicker (no Math.random()).
     * The fast, light-weighted ones add the quick flutter of a real flame. */
    harmonics: [
      { speed: 1 / 420, weight: 0.35, phaseMult: 1.0 },
      { speed: 1 / 170, weight: 0.3, phaseMult: 2.3 },
      { speed: 1 / 83, weight: 0.2, phaseMult: 4.1 },
      { speed: 1 / 37, weight: 0.15, phaseMult: 6.7 },
    ],
    /** Side-to-side flame sway, in tiles; the light pool, haze, and cast
     * shadows move with it. */
    swayX: 0.09,
    /** Slight up/down bob of the flame's light, in tiles. */
    swayY: 0.035,
    /** Flame sprite stretch amount (+/- fraction of its height). */
    stretch: 0.16,
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
    /** Warm glow strength. The glow is blended as light (soft-light plus a
     * little additive bloom), never laid over the scene like a veil, so the
     * stone keeps its contrast instead of looking foggy. */
    strength: 0.75,
    /** Soft-light share: warms and brightens while keeping dark grout dark. */
    softLight: 1,
    /** Additive share: a touch of emitted bloom near the flame. */
    bloom: 0.3,
    /** How much of the ambient darkness the light removes at full brightness. */
    carve: 0.95,
    /** The warm glow is this much dimmer at the default brightness than at
     * the darkest setting, where torchlight should dominate. */
    brightDim: 0.25,
    /** The glow is baked with the flame nudged this far (tiles) to each side
     * and cross-faded with its lean, so the pool sways while its edges stay
     * pinned to the walls. */
    swayOffset: 0.12,
  },
  /** Low "Brightness" settings: a cool multiply pass over the whole dungeon
   * (walls included) that torchlight lifts back out in warm pools. Scaled by
   * darkness = (100 - brightness) / 80, so 100 is the untouched default. */
  darkness: {
    /** Multiply color at the darkest setting: deep blue-black stone. */
    color: [24, 24, 44],
    /** How strongly torchlight cuts through the darkness. */
    torchLift: 0.95,
    /** A faint cool halo around the hero so the way ahead stays readable. */
    heroHaloRadius: 2.6,
    heroHaloAlpha: 0.42,
    /** Extra vignette at the darkest setting. */
    vignette: 0.35,
  },
  /** Soft glows from things in the dungeon. Each glow has a wide floor
   * falloff; on wall tiles it is brighter but reaches only half as far,
   * so nearby stone catches a bright wash as if lit on its face. */
  objectGlow: {
    enemy: { color: [235, 70, 60], radius: 1.2, strength: 1.05 },
    item: { color: [255, 200, 90], radius: 1.1, strength: 1 },
    /** Doors glow in their lock color; heart doors magenta, steel doors grey.
     * `onTop` is a faint wash of that color over the door sprite itself. */
    door: { radius: 1.2, strength: 1.05, onTop: 0.16, heart: [235, 70, 215], steel: [175, 184, 196] },
    /** Stairs get a smaller version of the hero's cool halo. */
    stairsRadiusScale: 0.6,
    stairsAlphaScale: 1.15,
    /** Wall glow: brightness multiplier and radius fraction. It is drawn
     * wider than tall and nudged upward, so the walls to the left, right,
     * and above an object catch the most light, which reads as depth. */
    wallBoost: 2.2,
    wallRadiusScale: 0.8,
    wallWiden: 1.35,
    wallLift: 0.22,
    /** Glow strength at the darkest setting; it scales with darkness and is
     * zero at the default brightness. Glows lift the darkness layer, so they
     * light the stone (keeping its texture) rather than fogging over it. */
    darkStrength: 1,
    /** A touch of additive bloom on top, for a sense of emitted light. */
    bloom: 0.12,
    /** Gentle breathing of enemy and item glows (fraction of strength). */
    pulse: 0.15,
    /** Doors, stairs, items, and enemies take this fraction of the darkness
     * the stone around them does, so they stay a little easier to read. */
    spriteDarkness: 0.4,
    /** The hero only takes a light touch of the darkness. */
    heroDarkness: 0.25,
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
    /** Extra shadow opacity at the darkest Brightness setting. */
    darkBoost: 0.6,
    /** In the darkness pass, shadows also block that much of the torch's
     * light, so a shadow in a dark room falls to near-black. */
    blockLight: 1,
  },
  /** Torchlight on items, enemies, and the hero: a warm fill that is
   * strongest on the side facing the flame, plus a 1px sheen along the
   * edge pixels that face it. Baked per sprite as four directional masks. */
  spriteLight: {
    color: [255, 208, 150],
    /** Overall strength right beside a torch. */
    strength: 0.6,
    /** Fill brightness on the lit side (the rim is always full strength). */
    fill: 0.42,
    /** Fill ramp exponent across the sprite (higher = tighter to the lit edge). */
    fillCurve: 1.6,
    /** Distance falloff exponent (lower keeps sprites lit further out). */
    falloffPower: 0.7,
    /** Extra strength at the darkest Brightness setting. */
    darkBoost: 0.5,
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
    /** Relief brightness at a steady flame, and how strongly it follows the
     * torch flicker (the flicker itself is only a few percent). */
    flickerBase: 0.78,
    flickerGain: 4.6,
    /** Relief is baked with the light nudged this far (tiles) to each side and
     * cross-faded with the flame's sway, so highlights shimmer back and forth. */
    swayOffset: 0.3,
    highlightColor: [255, 196, 128],
    shadowColor: [6, 4, 12],
  },
};

/** Per-torch phase from its tile, so torches flicker independently. */
function torchPhase(t: Pick<Torch, "x" | "y">) {
  return ((t.x * 374761393) ^ (t.y * 668265263)) % 10000;
}

/** Computes smooth coherent flicker multiplier for a torch at a given timestamp.
 * Torches have independent pseudo-randomized phases based on their coordinates. */
export function getTorchFlicker(t: Pick<Torch, "x" | "y">, now: number, reduceMotion: boolean): number {
  if (reduceMotion) return 1;
  const phase = torchPhase(t);
  let wave = 0;
  for (const h of LIGHTING_CONFIG.flicker.harmonics) {
    wave += Math.sin(now * h.speed + phase * h.phaseMult) * h.weight;
  }
  return 1 + wave * LIGHTING_CONFIG.flicker.amplitude;
}

/** How the flame is moving right now: its sideways lean and bob (in tiles,
 * world y up) and how stretched it is. Rendering shifts the light by the
 * sway and bends the flame sprite by the lean, so both move together. */
export function getTorchSway(t: Pick<Torch, "x" | "y">, now: number, reduceMotion: boolean) {
  if (reduceMotion) return { x: 0, y: 0, stretch: 1 };
  const p = torchPhase(t) * 0.37;
  const cfg = LIGHTING_CONFIG.flicker;
  const lean = Math.sin(now / 310 + p) * 0.6 + Math.sin(now / 127 + p * 1.9) * 0.3 + Math.sin(now / 53 + p * 3.1) * 0.1;
  const bob = Math.sin(now / 190 + p * 1.3) * 0.7 + Math.sin(now / 71 + p * 2.7) * 0.3;
  return { x: lean * cfg.swayX, y: bob * cfg.swayY, stretch: 1 + bob * cfg.stretch };
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

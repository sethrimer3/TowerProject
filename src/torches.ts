import { point, type Point, type Tile, type Torch } from "./entities.ts";
import { tileRandom } from "./random.ts";

/** A torch's light as it is placed. */
export const TORCH_LIGHT = {
  radius: 5.5, // Light reach in tiles (direct light; bounce light fades within it too)
  intensity: 0.7,
};

/** Torch placement tuning: roughly one torch per this many open tiles,
 * never closer together than `minSpacing` tiles. */
export const TORCH_PLACEMENT = { openTilesPerTorch: 30, minSpacing: 4.5, jitter: 0.35 };

/** Picks out-of-the-way torch spots: plain floor tiles tucked into an
 * L-shaped corner (a wall on one vertical and one horizontal side), never in
 * a corridor, never beside a door or stairs, and never pinching a path (the
 * diagonal across the corner stays open). Corners of small rooms score
 * highest; spots are then taken greedily with a minimum spacing. */
export function chooseTorchSpots(cells: Map<string, Tile>, area: TorchArea): [number, number][] {
  const kind: KindAt = (x, y) => cells.get(point(x, y))?.kind ?? "wall";
  let open = 0;
  const candidates: TorchSpot[] = [];
  for (let y = area.yMin; y <= area.yMax; y++)
    for (let x = area.xMin; x <= area.xMax; x++) {
      if (kind(x, y) === "wall") continue;
      open++;
      const score = cornerScore(kind, x, y, area.seed);
      if (score !== null) candidates.push({ x, y, score });
    }
  candidates.sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
  return spaced(candidates, Math.max(1, Math.round(open / TORCH_PLACEMENT.openTilesPerTorch)));
}

/** The window (inclusive) torches go in, and the seed for their jitter. */
export type TorchArea = { xMin: number; xMax: number; yMin: number; yMax: number; seed: number };
type KindAt = (x: number, y: number) => Tile["kind"];
type TorchSpot = { x: number; y: number; score: number };
const BUSY = new Set<Tile["kind"]>(["door", "stairs", "oneway"]);
const directions = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** How good a torch spot (x, y) is, or null when it can't take one: plain
 * floor in a snug corner with nothing busy beside it. */
function cornerScore(kind: KindAt, x: number, y: number, seed: number): number | null {
  if (kind(x, y) !== "floor" || !snugCorner(kind, x, y)) return null;
  if (directions.some(([dx, dy]) => BUSY.has(kind(x + dx, y + dy)))) return null;
  // Smaller spaces read cozier with a torch: count open tiles nearby.
  let nearby = 0;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (kind(x + dx, y + dy) !== "wall") nearby++;
  return 1 - nearby / 49 + tileRandom(x, y, seed ^ 0x70c4) * TORCH_PLACEMENT.jitter;
}

/** An L-shaped corner: a wall on exactly one vertical and one horizontal
 * side, with the diagonal across the corner open. */
function snugCorner(kind: KindAt, x: number, y: number) {
  const wall = (dx: number, dy: number) => kind(x + dx, y + dy) === "wall";
  const n = wall(0, 1), s = wall(0, -1), e = wall(1, 0), w = wall(-1, 0);
  if (n === s || e === w) return false;
  return !wall(e ? -1 : 1, n ? -1 : 1);
}

/** The best `want` spots, taken greedily at least the minimum spacing apart. */
function spaced(candidates: TorchSpot[], want: number) {
  const picked: [number, number][] = [];
  const min = TORCH_PLACEMENT.minSpacing;
  // Squared, so the comparison is exact in every engine (hypot need not be).
  const crowded = (c: TorchSpot) => picked.some(([px, py]) => (px - c.x) * (px - c.x) + (py - c.y) * (py - c.y) < min * min);
  for (const c of candidates) {
    if (picked.length >= want) break;
    if (!crowded(c)) picked.push([c.x, c.y]);
  }
  return picked;
}

/** Places torches (see chooseTorchSpots), then caches each torch's
 * visibility polygon up front so rendering never recomputes it per frame. */
export function placeTorches(cells: Map<string, Tile>, area: TorchArea): Torch[] {
  const isWall = (x: number, y: number) =>
    (cells.get(point(x, y))?.kind ?? "wall") === "wall";
  const torches: Torch[] = chooseTorchSpots(cells, area).map(([x, y]) => ({
    x,
    y,
    lightRadius: TORCH_LIGHT.radius,
    baseIntensity: TORCH_LIGHT.intensity,
    active: true,
  }));
  for (const torch of torches)
    torch.visibilityPolygon = computeVisibilityPolygon(torch, isWall);
  return torches;
}

/** Puts out the lit torch standing on (x, y); false when there is none. */
export function breakTorch(torches: Torch[], x: number, y: number) {
  const torch = torches.find((t) => t.active && t.x === x && t.y === y);
  if (!torch) return false;
  torch.active = false;
  return true;
}

/** Tile-grid visibility-polygon computation for torch light. Walls block
 * light; the result is cached on the torch (see placeTorches) and only
 * recomputed when the torch or nearby geometry changes, never per frame. */
type Segment = [Point, Point];
/** A ray from (ox, oy) along the unit direction (dx, dy). */
type Ray = { ox: number; oy: number; dx: number; dy: number };
/** Whether a hit at `u` along a segment (0 at one end, 1 at the other) lands on it. */
const onSegment = (u: number) => u >= -1e-6 && u <= 1 + 1e-6;
/** How far along the ray it meets the segment, or null when it misses. */
function rayHit({ ox, oy, dx, dy }: Ray, [a, b]: Segment): number | null {
  const sx = b.x - a.x,
    sy = b.y - a.y;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((a.x - ox) * sy - (a.y - oy) * sx) / denom;
  const u = ((a.x - ox) * dy - (a.y - oy) * dx) / denom;
  return t >= 0 && onSegment(u) ? t : null;
}
/** The faces of wall tile (tx, ty) that border an open tile, north, south,
 * east, then west. */
function openFaces(tx: number, ty: number, isWall: (x: number, y: number) => boolean): Segment[] {
  const l = tx,
    r = tx + 1,
    b = ty,
    t = ty + 1;
  const faces: [number, number, Segment][] = [
    [0, 1, [{ x: l, y: t }, { x: r, y: t }]],
    [0, -1, [{ x: l, y: b }, { x: r, y: b }]],
    [1, 0, [{ x: r, y: b }, { x: r, y: t }]],
    [-1, 0, [{ x: l, y: b }, { x: l, y: t }]],
  ];
  return faces.filter(([dx, dy]) => !isWall(tx + dx, ty + dy)).map(([, , face]) => face);
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
  for (let ty = Math.floor(oy - reach); ty <= Math.ceil(oy + reach); ty++)
    for (let tx = Math.floor(ox - reach); tx <= Math.ceil(ox + reach); tx++)
      if (isWall(tx, ty)) segments.push(...openFaces(tx, ty, isWall));
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
    const ray = { ox, oy, dx: Math.cos(ang), dy: Math.sin(ang) };
    let best = r;
    for (const segment of segments) best = Math.min(best, rayHit(ray, segment) ?? best);
    return { x: ox + ray.dx * best, y: oy + ray.dy * best };
  };
  return [...angles].sort((a, b) => a - b).map(castRay);
}

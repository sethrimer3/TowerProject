import type { Point, Torch } from "./entities.ts";
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

import { tileCenter, type FrameContext } from "./render-frame.ts";

type Point = { x: number; y: number };

/** The golden line along a route being walked (or previewed). Its shape is
 * a fixed polyline of tile centers, recomputed only when a walk or preview
 * starts, so it never changes mid-walk. `progress` is a smoothed arclength
 * (in tiles) consumed along it, advanced independently of the hero sprite's
 * own interpolation so the line neither skips a tile at a time nor bends
 * toward the sprite. */
export class RoutePath {
  points: Point[] | null = null;
  progress = 0;
  private goalKey: string | null = null;
  private lastLen = 0;
  private wasLive = false;

  /** Rebuilds the polyline when a new walk/preview starts and eases the
   * consumed length toward the steps already taken. `route` is the walk in
   * progress (it takes priority), `preview` a highlighted destination's path. */
  update(route: Point[], preview: Point[] | null, player: Point, dt: number) {
    const live = route.length > 0,
      source = live ? route : preview;
    if (!source || source.length === 0) {
      this.points = null;
      this.progress = 0;
      this.goalKey = null;
      this.lastLen = 0;
      this.wasLive = live;
      return;
    }
    const goal = source[source.length - 1],
      goalKey = `${goal.x},${goal.y}`,
      // route only ever shrinks by one step at a time while walking, so a
      // length increase (or a flip from preview to live) means this is a
      // freshly (re)confirmed walk and the fixed polyline must be rebuilt.
      isNewWalk =
        !this.points ||
        this.goalKey !== goalKey ||
        (live && source.length > this.lastLen) ||
        (live && !this.wasLive);
    if (isNewWalk) {
      this.points = [{ x: player.x, y: player.y }, ...source];
      this.progress = 0;
      this.goalKey = goalKey;
    }
    this.lastLen = source.length;
    this.wasLive = live;
    const consumed = Math.max(0, this.points!.length - 1 - source.length),
      rate = 1 - Math.exp(-dt * 18);
    this.progress += (consumed - this.progress) * rate;
    if (Math.abs(consumed - this.progress) < 0.01) this.progress = consumed;
  }

  draw(f: FrameContext) {
    const route = this.points;
    if (!route || route.length === 0) return;
    const c = f.c;
    c.save();
    c.lineCap = "round";
    c.lineJoin = "round";

    // Subtle pulsing gold glow
    const pulse = 0.85 + 0.15 * Math.sin(f.now / 200);
    const segments = this.screenSegments(f);
    const drawSegments = () => {
      c.beginPath();
      for (const seg of segments) {
        if (seg.length === 0) continue;
        c.moveTo(seg[0].x, seg[0].y);
        for (let i = 1; i < seg.length; i++) {
          c.lineTo(seg[i].x, seg[i].y);
        }
      }
    };

    // Outer glow pass
    drawSegments();
    c.strokeStyle = `rgba(255, 215, 0, ${0.4 * pulse})`;
    c.lineWidth = Math.max(3, f.s * 0.22);
    c.shadowColor = "#ffd700";
    c.shadowBlur = 8;
    c.stroke();

    // Inner bright core line pass
    drawSegments();
    c.strokeStyle = `rgba(255, 240, 160, ${0.9 * pulse})`;
    c.lineWidth = Math.max(1.5, f.s * 0.1);
    c.shadowBlur = 0;
    c.stroke();

    // Draw a small golden dot at the final destination
    const lastStep = route[route.length - 1];
    const destPt = tileCenter(f, lastStep.x, lastStep.y);
    c.fillStyle = `rgba(255, 225, 100, ${0.95 * pulse})`;
    c.beginPath();
    c.arc(destPt.x, destPt.y, Math.max(2, f.s * 0.12), 0, Math.PI * 2);
    c.fill();

    c.restore();
  }

  /** The route still ahead, trimmed at the smoothed progress, in screen
   * coordinates and split wherever it wraps around the world's edge. The
   * shape of every remaining point is untouched (no bending toward the
   * sprite); only the leading edge slides continuously along the segment
   * it falls within (no per-tile jumps). */
  private screenSegments(f: FrameContext) {
    const route = this.points!;
    const trimmed: Point[] = [];
    let idx = Math.floor(this.progress),
      frac = this.progress - idx;
    if (idx >= route.length - 1) {
      idx = route.length - 1;
      frac = 0;
    }
    const from = route[idx],
      to = route[Math.min(idx + 1, route.length - 1)];
    trimmed.push({ x: from.x + (to.x - from.x) * frac, y: from.y + (to.y - from.y) * frac });
    for (let i = idx + 1; i < route.length; i++) trimmed.push(route[i]);

    const segments: Point[][] = [];
    let current: Point[] = [tileCenter(f, trimmed[0].x, trimmed[0].y)];
    let prevGrid = trimmed[0];
    for (let i = 1; i < trimmed.length; i++) {
      const step = trimmed[i];
      const pt = tileCenter(f, step.x, step.y);
      const isWrap = Math.abs(step.x - prevGrid.x) > 1 || Math.abs(step.y - prevGrid.y) > 1;
      if (isWrap) {
        segments.push(current);
        current = [pt];
      } else current.push(pt);
      prevGrid = step;
    }
    segments.push(current);
    return segments;
  }
}

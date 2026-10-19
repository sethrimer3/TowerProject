/** The Delve's camera: where the view's centre sits, in tiles, as the hero
 * walks. It holds still while the hero moves within a box round the middle
 * (the dead zone), so a step or two and back never pans, and when the hero
 * leaves the box it glides after it with momentum (a critically damped
 * spring), easing in and out instead of following each step. No drawing:
 * the renderer reads `left` and `bottom`. */

type Point = { x: number; y: number };
/** The view's size in tiles and the board's width, which the view stays within. */
export type CameraView = { n: number; width: number };

/** How far the hero's centre may stray from the camera's goal before it
 * pans, in tiles each way: a box 5 tiles across in a 17-tile view. */
export const DEAD_ZONE = 2;
/** Tiles always kept between the hero and the view's edge, however fast it
 * outruns the glide. */
export const EDGE_MARGIN = 3;
/** About how long the glide takes to catch up, in seconds, and with Fast transitions. */
export const GLIDE_SECONDS = 0.35;
export const FAST_GLIDE_SECONDS = 0.18;
/** How quickly the hero's pace is taken up and let go of, in seconds: it
 * rises at once as the hero speeds up, so the glide quickens in time, and
 * falls slowly, over each step's pause and after the hero stops. */
const PACE_RISE_SECONDS = 0.1;
const PACE_FALL_SECONDS = 0.6;
/** The share of the room between the dead zone and the edge margin the
 * glide may trail by: a spring trails a steady walk by speed × glide time,
 * so a quicker pace glides quicker, and the edge margin never has to step in. */
const TRAIL_SHARE = 0.8;

/** One axis of a critically damped spring after `dt` seconds (the form in
 * Game Programming Gems 4, 1.10): smooth in position and speed, never
 * overshooting, stable at any frame time. */
function glide(at: number, speed: number, goal: number, seconds: number, dt: number) {
  const omega = 2 / seconds, e = Math.exp(-omega * dt), offset = at - goal, pull = (speed + omega * offset) * dt;
  return { at: goal + (offset + pull) * e, speed: (speed - omega * pull) * e };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class FollowCamera {
  /** The view's centre now, its speed (tiles a second), and where it is headed. */
  private at: Point = { x: 0, y: 0 };
  private speed: Point = { x: 0, y: 0 };
  private goal: Point = { x: 0, y: 0 };
  private hero: Point = { x: 0, y: 0 };
  /** The hero's average speed along each axis lately (tiles a second). */
  private pace: Point = { x: 0, y: 0 };

  /** Centres the camera on the hero at once, standing still. */
  reset(hero: Point, view: CameraView) {
    this.hero = { ...hero };
    this.pace = { x: 0, y: 0 };
    this.goal = this.within({ ...hero }, view);
    this.at = { ...this.goal };
    this.speed = { x: 0, y: 0 };
  }

  /** Moves the camera for a frame of `dt` seconds, the hero's centre drawn
   * at `hero` (tiles). With `snaps` (motion reduced, transitions off) it
   * stands at its goal at once. */
  update(hero: Point, view: CameraView, dt: number, seconds: number, snaps: boolean) {
    // A jump (round the wrap, a fall, an undo) is no speed to carry on with.
    const speedOf = (d: number) => (dt > 0 && Math.abs(d) < view.n / 2 ? d / dt : 0);
    const heroSpeed = { x: speedOf(hero.x - this.hero.x), y: speedOf(hero.y - this.hero.y) };
    this.hero = { ...hero };
    this.goal = this.within({
      x: clamp(this.goal.x, hero.x - DEAD_ZONE, hero.x + DEAD_ZONE),
      y: clamp(this.goal.y, hero.y - DEAD_ZONE, hero.y + DEAD_ZONE),
    }, view);
    const reach = view.n / 2 - EDGE_MARGIN - 0.5, trail = (reach - DEAD_ZONE) * TRAIL_SHARE;
    for (const axis of ["x", "y"] as const) {
      const pace = Math.abs(heroSpeed[axis]), lag = pace > this.pace[axis] ? PACE_RISE_SECONDS : PACE_FALL_SECONDS;
      this.pace[axis] += (pace - this.pace[axis]) * (1 - Math.exp(-dt / lag));
      if (snaps) {
        this.at[axis] = this.goal[axis];
        this.speed[axis] = 0;
        continue;
      }
      const g = glide(this.at[axis], this.speed[axis], this.goal[axis], Math.min(seconds, trail / Math.max(this.pace[axis], 1e-9)), dt);
      // Never let the hero within EDGE_MARGIN of the edge: held there, the camera moves with it.
      const held = clamp(g.at, hero[axis] - reach, hero[axis] + reach);
      this.at[axis] = held;
      this.speed[axis] = held === g.at ? g.speed : heroSpeed[axis];
    }
    // At the board's edge the camera stops there rather than pressing on.
    const kept = this.within(this.at, view);
    if (kept.x !== this.at.x) this.speed.x = 0;
    if (kept.y !== this.at.y) this.speed.y = 0;
    this.at = kept;
  }
  /** Standing at its goal, no longer moving. */
  settled() {
    const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
    return near(this.at.x, this.goal.x) && near(this.at.y, this.goal.y) && Math.abs(this.speed.x) < 0.05 && Math.abs(this.speed.y) < 0.05;
  }

  /** The view's bottom-left tile, now and once settled. */
  left(view: CameraView) { return this.at.x - view.n / 2; }
  bottom(view: CameraView) { return this.at.y - view.n / 2; }
  restingLeft(view: CameraView) { return this.goal.x - view.n / 2; }
  restingBottom(view: CameraView) { return this.goal.y - view.n / 2; }

  /** Keeps the view's centre where the whole view stays on the board:
   * within its width and never below its first row. */
  private within(p: Point, { n, width }: CameraView): Point {
    return { x: clamp(p.x, n / 2, width - n / 2), y: Math.max(n / 2, p.y) };
  }
}

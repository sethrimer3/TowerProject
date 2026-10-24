/** The Delve's camera: where the view's centre sits, in tiles, as the hero
 * walks. It holds still while the hero moves within a box round the middle
 * (the dead zone), so a step or two and back never pans, and when the hero
 * leaves the box it glides after it with momentum (a critically damped
 * spring), easing in and out instead of following each step.
 * With a path ahead (a tapped walk, Target's or the hand's), the camera
 * frames the hero's next steps instead: it moves as little as it can to keep
 * them in view with the hero, so a trip out and back that fits never pans.
 * No drawing: the renderer reads `left` and `bottom`. */

type Point = { x: number; y: number };
/** View and board dimensions; optional height and padding bound finite
 * rooms while leaving a safe border for overlaid controls. */
export type CameraView = { n: number; width: number; height?: number; padding?: number };

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
/** A move of more than this many tiles in one frame is a leap, not a walk:
 * walking, even at 40 steps a second, moves under a tile a frame. */
export const LEAP_TILES = 1.5;
/** How many of the path's next steps the camera tries to keep in view. */
export const LOOK_AHEAD = 8;
/** Tiles kept between a step ahead and the view's edge, so what lies just
 * past it shows too. */
export const AHEAD_MARGIN = 2;
/** How long the camera keeps framing as if a path were ahead once it ends,
 * in seconds: through the moment between one card reaching its target and
 * the next choosing its path, so the camera doesn't start back to the hero. */
export const PATH_GRACE_SECONDS = 0.6;

/** One axis of a critically damped spring after `dt` seconds (the form in
 * Game Programming Gems 4, 1.10): smooth in position and speed, never
 * overshooting, stable at any frame time. */
function glide(at: number, speed: number, goal: number, seconds: number, dt: number) {
  const omega = 2 / seconds, e = Math.exp(-omega * dt), offset = at - goal, pull = (speed + omega * offset) * dt;
  return { at: goal + (offset + pull) * e, speed: (speed - omega * pull) * e };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The centres of the next `LOOK_AHEAD` tiles of a path from tile `from`,
 * found by adding up each step's move, so a path round the Delve's wrap
 * stays beside the hero rather than jumping to the far side. */
export function pointsAhead(from: Point, path: readonly { dx: number; dy: number }[]): Point[] {
  const out: Point[] = [];
  let x = from.x + 0.5, y = from.y + 0.5;
  for (const step of path.slice(0, LOOK_AHEAD)) {
    x += step.dx;
    y += step.dy;
    out.push({ x, y });
  }
  return out;
}

/** Along one axis, the range of goals that keeps the hero within `slack` of
 * the middle and as many of the points ahead, in order, within `room`: it
 * stops at the first point that won't fit with those before it. */
function framing(hero: number, slack: number, ahead: readonly number[], room: number) {
  let lo = hero - slack, hi = hero + slack;
  for (const p of ahead) {
    const l = Math.max(lo, p - room), h = Math.min(hi, p + room);
    if (l > h) break;
    lo = l;
    hi = h;
  }
  return { lo, hi };
}

export class FollowCamera {
  /** The view's centre now, its speed (tiles a second), and where it is headed. */
  private at: Point = { x: 0, y: 0 };
  private speed: Point = { x: 0, y: 0 };
  private goal: Point = { x: 0, y: 0 };
  private hero: Point = { x: 0, y: 0 };
  /** The hero's average speed along each axis lately (tiles a second). */
  private pace: Point = { x: 0, y: 0 };
  /** Seconds since a path last lay ahead. */
  private sincePath = Infinity;
  /** The hero has leapt (a dash) and the camera hasn't caught up yet. */
  private leaping = false;

  /** Centres the camera on the hero at once, standing still. */
  reset(hero: Point, view: CameraView) {
    this.hero = { ...hero };
    this.pace = { x: 0, y: 0 };
    this.sincePath = Infinity;
    this.leaping = false;
    this.goal = this.within({ ...hero }, view);
    this.at = { ...this.goal };
    this.speed = { x: 0, y: 0 };
  }
  /** The hero is about to stand somewhere else at once (a dash): the camera
   * glides after it at its usual pace, with no rush from the leap's speed and
   * no hold on the hero, which may stand near or past the view's edge for a
   * moment, until it catches up. A move of more than `LEAP_TILES` in one
   * frame counts as a leap without being told. */
  leap() {
    this.leaping = true;
  }

  /** Moves the camera for a frame of `dt` seconds, the hero's centre drawn
   * at `hero` (tiles) and `ahead` the centres of its next steps
   * (`pointsAhead`). With `snaps` (motion reduced, transitions off) it
   * stands at its goal at once. */
  update(hero: Point, view: CameraView, dt: number, seconds: number, snaps: boolean, ahead: readonly Point[] = []) {
    const reach = view.n / 2 - EDGE_MARGIN - 0.5, trail = (reach - DEAD_ZONE) * TRAIL_SHARE;
    // Any jump (a dash, round the wrap) is a leap, and no speed to carry on with.
    if (Math.abs(hero.x - this.hero.x) > LEAP_TILES || Math.abs(hero.y - this.hero.y) > LEAP_TILES) this.leaping = true;
    // A leap is over once the hero is back within the edge margin.
    else if (this.leaping && Math.abs(hero.x - this.at.x) <= reach && Math.abs(hero.y - this.at.y) <= reach) this.leaping = false;
    const speedOf = (d: number) => (dt > 0 && !this.leaping ? d / dt : 0);
    const heroSpeed = { x: speedOf(hero.x - this.hero.x), y: speedOf(hero.y - this.hero.y) };
    this.hero = { ...hero };
    this.sincePath = ahead.length ? 0 : this.sincePath + dt;
    // Framing a path, the hero may stand off the middle, short of the edge
    // margin by a tile so the glide has room; otherwise it keeps to the dead zone.
    const slack = this.sincePath <= PATH_GRACE_SECONDS ? reach - 1 : DEAD_ZONE, room = view.n / 2 - AHEAD_MARGIN - 0.5;
    const x = framing(hero.x, slack, ahead.map((p) => p.x), room), y = framing(hero.y, slack, ahead.map((p) => p.y), room);
    this.goal = this.within({ x: clamp(this.goal.x, x.lo, x.hi), y: clamp(this.goal.y, y.lo, y.hi) }, view);
    for (const axis of ["x", "y"] as const) {
      const pace = Math.abs(heroSpeed[axis]), lag = pace > this.pace[axis] ? PACE_RISE_SECONDS : PACE_FALL_SECONDS;
      this.pace[axis] += (pace - this.pace[axis]) * (1 - Math.exp(-dt / lag));
      if (snaps) {
        this.at[axis] = this.goal[axis];
        this.speed[axis] = 0;
        continue;
      }
      const g = glide(this.at[axis], this.speed[axis], this.goal[axis], Math.min(seconds, trail / Math.max(this.pace[axis], 1e-9)), dt);
      // Walking, never let the hero within EDGE_MARGIN of the edge: held
      // there, the camera moves with it. Through a leap it only glides.
      const held = this.leaping ? g.at : clamp(g.at, hero[axis] - reach, hero[axis] + reach);
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

  /** Keeps the view within the board and its optional border. Rooms
   * smaller than the viewport stay centered. */
  private within(p: Point, { n, width, height, padding=0 }: CameraView): Point {
    const fit = (at: number, size: number) => size < n ? size / 2 : clamp(at, n / 2-padding, size - n / 2+padding);
    return { x: fit(p.x, width), y: height === undefined ? Math.max(n / 2, p.y) : fit(p.y, height) };
  }
}

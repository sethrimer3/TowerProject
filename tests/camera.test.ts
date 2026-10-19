import test from "node:test";
import assert from "node:assert/strict";
import { DEAD_ZONE, EDGE_MARGIN, FollowCamera, GLIDE_SECONDS } from "../src/camera.ts";

const view = { n: 17, width: 30 }, dt = 1 / 60;

/** Walks the hero's drawn centre the way the renderer does: each step at an
 * even pace over 80% of the time between steps, standing still the rest. */
function walk(camera: FollowCamera, from: { x: number; y: number }, steps: [number, number][], perSecond: number, onFrame?: (hero: { x: number; y: number }) => void) {
  const hero = { ...from }, frames = Math.round(1 / perSecond / dt), walking = Math.round(frames * 0.8);
  for (const [dx, dy] of steps) {
    const start = { ...hero };
    for (let f = 1; f <= frames; f++) {
      const k = Math.min(1, f / walking);
      hero.x = start.x + dx * k;
      hero.y = start.y + dy * k;
      camera.update(hero, view, dt, GLIDE_SECONDS, false);
      onFrame?.(hero);
    }
  }
  return hero;
}
const settle = (camera: FollowCamera, hero: { x: number; y: number }) => {
  for (let f = 0; f < 600; f++) camera.update(hero, view, dt, GLIDE_SECONDS, false);
};

test("a step or two and back within the dead zone never pans", () => {
  const camera = new FollowCamera(), start = { x: 15.5, y: 40.5 };
  camera.reset(start, view);
  const left = camera.left(view), bottom = camera.bottom(view);
  walk(camera, start, [[1, 0], [1, 0], [-1, 0], [-1, 0], [0, 1], [0, -1], [-1, 0], [1, 0]], 8, () => {
    assert.equal(camera.left(view), left);
    assert.equal(camera.bottom(view), bottom);
  });
});

test("a steady walk glides with no jolt: the camera's speed changes gradually", () => {
  const camera = new FollowCamera(), start = { x: 15.5, y: 20.5 };
  camera.reset(start, view);
  let last = camera.bottom(view), lastSpeed = 0, worst = 0;
  walk(camera, start, Array.from({ length: 30 }, () => [0, 1]), 10, () => {
    const now = camera.bottom(view), speed = (now - last) / dt;
    worst = Math.max(worst, Math.abs(speed - lastSpeed));
    last = now;
    lastSpeed = speed;
  });
  // The hero walks at 12.5 tiles a second then stops; were the camera to copy
  // it, its speed would jump by that much in a frame.
  assert.ok(worst < 1.5, `speed changed by ${worst} tiles/s in one frame`);
});

test("reversing after a run slows the camera and turns it back without a jump", () => {
  const camera = new FollowCamera(), start = { x: 15.5, y: 20.5 };
  camera.reset(start, view);
  let last = camera.bottom(view), lastSpeed = 0;
  const track = () => {
    const now = camera.bottom(view);
    lastSpeed = (now - last) / dt;
    last = now;
  };
  const hero = walk(camera, start, Array.from({ length: 6 }, () => [0, 1]), 8, track);
  walk(camera, hero, Array.from({ length: 6 }, () => [0, -1]), 8, () => {
    const now = camera.bottom(view), speed = (now - last) / dt;
    assert.ok(Math.abs(speed - lastSpeed) < 2, `a jolt of ${speed - lastSpeed} tiles/s`);
    last = now;
    lastSpeed = speed;
  });
});

test("the hero is never closer than the edge margin to the view's edge, however fast", () => {
  for (const perSecond of [4, 15, 40]) {
    const camera = new FollowCamera(), start = { x: 15.5, y: 20.5 };
    camera.reset(start, view);
    walk(camera, start, Array.from({ length: 40 }, () => [0, 1]), perSecond, (hero) => {
      const fromTop = camera.bottom(view) + view.n - (hero.y + 0.5);
      assert.ok(fromTop >= EDGE_MARGIN - 1e-9, `at ${perSecond}/s the hero came within ${fromTop} tiles of the top`);
    });
  }
});

test("the camera comes to rest with the hero at the dead zone's edge", () => {
  const camera = new FollowCamera(), start = { x: 15.5, y: 20.5 };
  camera.reset(start, view);
  const hero = walk(camera, start, Array.from({ length: 6 }, () => [0, 1]), 6);
  settle(camera, hero);
  assert.ok(camera.settled());
  assert.ok(Math.abs(camera.bottom(view) + view.n / 2 - (hero.y - DEAD_ZONE)) < 1e-6);
  assert.ok(Math.abs(camera.restingBottom(view) - camera.bottom(view)) < 1e-6);
});

test("the view stays on the board: within the labyrinth's width and above its first row", () => {
  const camera = new FollowCamera();
  camera.reset({ x: 1.5, y: 2.5 }, view);
  assert.equal(camera.left(view), 0);
  assert.equal(camera.bottom(view), 0);
  const hero = walk(camera, { x: 1.5, y: 2.5 }, Array.from({ length: 28 }, () => [1, 0]), 12, () => {
    assert.ok(camera.left(view) >= 0 && camera.left(view) <= view.width - view.n);
  });
  settle(camera, hero);
  assert.equal(camera.left(view), view.width - view.n);
});

test("with motion reduced the camera stands at its goal at once", () => {
  const camera = new FollowCamera();
  camera.reset({ x: 15.5, y: 20.5 }, view);
  camera.update({ x: 15.5, y: 26.5 }, view, dt, GLIDE_SECONDS, true);
  assert.equal(camera.bottom(view), camera.restingBottom(view));
  assert.equal(camera.bottom(view) + view.n / 2, 26.5 - DEAD_ZONE);
  assert.ok(camera.settled());
});

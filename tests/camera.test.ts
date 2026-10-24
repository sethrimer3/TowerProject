import test from "node:test";
import assert from "node:assert/strict";
import { AHEAD_MARGIN, DEAD_ZONE, EDGE_MARGIN, FollowCamera, GLIDE_SECONDS, LOOK_AHEAD, pointsAhead } from "../src/render/camera.ts";

const view = { n: 17, width: 30 }, dt = 1 / 60;

test("finite rooms clamp both axes and rooms smaller than the viewport stay centered",()=> {
  const c=new FollowCamera(),room={n:17,width:25,height:25};
  c.reset({x:24.5,y:24.5},room);assert.equal(c.left(room),8);assert.equal(c.bottom(room),8);
  c.update({x:0.5,y:0.5},room,1,GLIDE_SECONDS,true);assert.equal(c.left(room),0);assert.equal(c.bottom(room),0);
  const small={n:17,width:9,height:9};c.reset({x:4.5,y:2.5},small);
  assert.equal(c.left(small),-4);assert.equal(c.bottom(small),-4);
  c.update({x:7.5,y:7.5},small,1,GLIDE_SECONDS,false);assert.equal(c.left(small),-4);assert.equal(c.bottom(small),-4);
  const padded={...room,padding:4};c.reset({x:.5,y:.5},padded);
  assert.equal(c.left(padded),-4);assert.equal(c.bottom(padded),-4);
});

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

type Plan = { steps: [number, number][]; then?: number };
/** Walks plans the way the hand does: each its steps, the renderer seeing
 * the hero's tile already on the step's end and the rest of the plan ahead,
 * then `then` seconds standing with no path before the next plan. */
function walkPlans(camera: FollowCamera, from: { x: number; y: number }, plans: Plan[], perSecond: number, onFrame?: (hero: { x: number; y: number }, ahead: { x: number; y: number }[]) => void) {
  const hero = { x: from.x + 0.5, y: from.y + 0.5 }, tile = { ...from }, frames = Math.round(1 / perSecond / dt), walking = Math.round(frames * 0.8);
  for (const plan of plans) {
    plan.steps.forEach(([dx, dy], i) => {
      const start = { ...hero };
      tile.x += dx;
      tile.y += dy;
      const ahead = pointsAhead(tile, plan.steps.slice(i + 1).map(([dx, dy]) => ({ dx, dy })));
      for (let f = 1; f <= frames; f++) {
        const k = Math.min(1, f / walking);
        hero.x = start.x + dx * k;
        hero.y = start.y + dy * k;
        camera.update(hero, view, dt, GLIDE_SECONDS, false, ahead);
        onFrame?.(hero, ahead);
      }
    });
    for (let f = 0; f < Math.round((plan.then ?? 0) / dt); f++) {
      camera.update(hero, view, dt, GLIDE_SECONDS, false, []);
      onFrame?.(hero, []);
    }
  }
  return hero;
}
const up = (n: number): [number, number][] => Array.from({ length: n }, () => [0, 1]);
const down = (n: number): [number, number][] => Array.from({ length: n }, () => [0, -1]);

test("a path's points come round the wrap beside the hero, and only the next LOOK_AHEAD", () => {
  const path = Array.from({ length: 12 }, () => ({ dx: 1, dy: 0 }));
  const points = pointsAhead({ x: 28, y: 5 }, path);
  assert.equal(points.length, LOOK_AHEAD);
  assert.deepEqual(points.slice(0, 3), [{ x: 29.5, y: 5.5 }, { x: 30.5, y: 5.5 }, { x: 31.5, y: 5.5 }]);
});

test("walking a path, the camera's goal frames the steps ahead with the hero", () => {
  const camera = new FollowCamera(), start = { x: 15, y: 20 };
  camera.reset({ x: 15.5, y: 20.5 }, view);
  const room = view.n / 2 - AHEAD_MARGIN - 0.5;
  walkPlans(camera, start, [{ steps: up(20) }], 6, (hero, ahead) => {
    const goal = camera.restingBottom(view) + view.n / 2;
    for (const p of ahead) assert.ok(Math.abs(p.y - goal) <= room + 1e-9, `a step ahead at ${p.y} lies off the framing of ${goal}`);
    // Far from the path's end, the hero walks up the lower half with the way
    // ahead above it; near the end the camera stops at the end, not past it.
    if (ahead.length === LOOK_AHEAD) assert.ok(goal >= hero.y, "the hero walks up the lower half, the way ahead above it");
  });
});

test("nearing a path's end, the camera stops short of showing past it", () => {
  const camera = new FollowCamera(), start = { x: 15, y: 20 };
  camera.reset({ x: 15.5, y: 20.5 }, view);
  const hero = walkPlans(camera, start, [{ steps: up(14), then: 0.3 }], 6);
  // Where the camera is headed as the hero arrives: a centred view would show 8 rows past.
  const past = camera.restingBottom(view) + view.n - (hero.y + 0.5);
  assert.ok(past <= view.n / 2 - DEAD_ZONE - 0.5 + 1e-9, `the view is headed to show ${past} rows past the end`);
  assert.ok(past >= EDGE_MARGIN - 1e-9);
});

test("a trip out and back pans on the way out, never on the way back", () => {
  const camera = new FollowCamera(), start = { x: 15, y: 20 };
  camera.reset({ x: 15.5, y: 20.5 }, view);
  let back = false, before = 0;
  const hero = walkPlans(camera, start, [{ steps: up(7), then: 0.1 }], 6);
  before = camera.restingBottom(view);
  walkPlans(camera, { x: 15, y: Math.round(hero.y - 0.5) }, [{ steps: down(7) }], 6, () => {
    back = true;
    assert.equal(camera.restingBottom(view), before, "the way back fits: the goal holds");
  });
  assert.ok(back);
  assert.ok(before > camera.restingBottom(view) - 1e-9 && before > 0);
});

test("between one plan's end and the next, the camera holds instead of starting back", () => {
  const camera = new FollowCamera(), start = { x: 15, y: 20 };
  camera.reset({ x: 15.5, y: 20.5 }, view);
  walkPlans(camera, start, [{ steps: up(10), then: 0 }], 6);
  const goal = camera.restingBottom(view);
  walkPlans(camera, { x: 15, y: 30 }, [{ steps: [], then: 0.4 }], 6, () => {
    assert.equal(camera.restingBottom(view), goal);
  });
});

test("standing with no path a while, the camera settles back to the dead zone", () => {
  const camera = new FollowCamera(), start = { x: 15, y: 20 };
  camera.reset({ x: 15.5, y: 20.5 }, view);
  const hero = walkPlans(camera, start, [{ steps: up(12), then: 2 }], 6);
  settle(camera, hero);
  const centre = camera.bottom(view) + view.n / 2;
  assert.ok(Math.abs(hero.y - centre) <= DEAD_ZONE + 1e-6, `the hero stands ${hero.y - centre} tiles from the middle`);
});

/** Runs the camera through dashes, each `tiles` up (down when negative),
 * `gap` seconds apart, then a second to catch up, and returns the most the
 * camera's move in a frame changed from the frame before (a jump shows as a
 * sudden change) and the most it moved in a frame. */
function dashes(list: number[], gap: number, told: boolean) {
  const camera = new FollowCamera();
  camera.reset({ x: 15.5, y: 100.5 }, view);
  const hero = { x: 15.5, y: 100.5 };
  let last = camera.bottom(view), lastMove = 0, sudden = 0, fastest = 0;
  const frame = () => {
    camera.update(hero, view, dt, GLIDE_SECONDS, false);
    const move = camera.bottom(view) - last;
    sudden = Math.max(sudden, Math.abs(move - lastMove));
    fastest = Math.max(fastest, Math.abs(move));
    last = camera.bottom(view);
    lastMove = move;
  };
  for (const tiles of list) {
    if (told) camera.leap();
    hero.y += tiles;
    for (let f = 0; f < Math.round(gap / dt); f++) frame();
  }
  for (let f = 0; f < 60; f++) frame();
  return { camera, hero, sudden, fastest };
}

test("a dash, however long, glides the camera after the hero instead of jumping it", () => {
  for (const tiles of [5, 8, 12, 20, -12]) {
    const { camera, hero, sudden } = dashes([tiles], 0, true);
    assert.ok(sudden < 0.25, `a ${tiles}-tile dash changed the camera's move by ${sudden} tiles in a frame`);
    assert.ok(Math.abs(hero.y - (camera.bottom(view) + view.n / 2)) <= view.n / 2 - EDGE_MARGIN - 0.5 + 1e-6, "caught up, within the margin again");
  }
});

test("repeated long dashes keep the camera gliding, the hero leaving the view for a moment if it must", () => {
  for (const gap of [0.15, 0.3, 0.6]) {
    const { camera, hero, sudden } = dashes([10, 10, 10, 10, 10], gap, true);
    assert.ok(sudden < 0.25, `dashes ${gap}s apart changed the camera's move by ${sudden} tiles in a frame`);
    assert.ok(Math.abs(hero.y - (camera.bottom(view) + view.n / 2)) <= view.n / 2 - EDGE_MARGIN - 0.5 + 1e-6);
  }
  const back = dashes([10, -10, 10, -10], 0.3, true);
  assert.ok(back.sudden < 0.25, `dashes up and down changed the camera's move by ${back.sudden} tiles in a frame`);
});

test("a jump the camera isn't told of is a leap too", () => {
  const { sudden } = dashes([9, 9], 0.3, false);
  assert.ok(sudden < 0.25, `an untold jump changed the camera's move by ${sudden} tiles in a frame`);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { Cinematic, CINEMATIC_IDLE_MS, EXIT_TAP_MS, GEAR_MS, PinchTracker, type CinematicLook } from "../src/ui/cinematic.ts";

/** A Cinematic on a fake clock, with the setting on and the board allowing it. */
function setup(settings: Partial<{ cinematic: boolean; cinematicIdle: boolean; cinematicGems: boolean }> = {}) {
  const state = { now: 0, allowed: true, settings: { cinematic: true, cinematicIdle: false, cinematicGems: false, ...settings }, look: null as CinematicLook | null };
  const cinematic = new Cinematic({
    settings: () => state.settings,
    allowed: () => state.allowed,
    now: () => state.now,
    show: (look) => (state.look = look),
  });
  return { state, cinematic };
}

test("a pinch in enters cinematic mode, and a pinch out leaves it", () => {
  const { state, cinematic } = setup();
  cinematic.pinch("in");
  assert.equal(cinematic.active, true);
  assert.deepEqual(state.look, { active: true, dimmed: false, gear: false, gems: false }, "a pinch never dims the board");
  cinematic.pinch("out");
  assert.equal(cinematic.active, false);
  assert.equal(state.look!.active, false);
});

test("it never enters with the setting off, or where the board doesn't allow it", () => {
  const off = setup({ cinematic: false });
  off.cinematic.pinch("in");
  assert.equal(off.cinematic.active, false);
  const { state, cinematic } = setup();
  state.allowed = false;
  cinematic.pinch("in");
  assert.equal(cinematic.active, false, "the forest, a dialog, a lesson or another page");
});

test("with the idle option it enters, dimmed, after two minutes without input, and input lights it again", () => {
  const { state, cinematic } = setup({ cinematicIdle: true });
  state.now = CINEMATIC_IDLE_MS - 1;
  cinematic.tick();
  assert.equal(cinematic.active, false, "not a moment early");
  cinematic.input();
  state.now += CINEMATIC_IDLE_MS - 1;
  cinematic.tick();
  assert.equal(cinematic.active, false, "input restarts the clock");
  state.now += 1;
  cinematic.tick();
  assert.equal(cinematic.active, true);
  assert.equal(state.look!.dimmed, true);
  cinematic.input();
  assert.equal(cinematic.active, true, "input lights the board but stays in cinematic mode");
  assert.equal(state.look!.dimmed, false);
});

test("without the idle option, idling never enters it", () => {
  const { state, cinematic } = setup();
  state.now = CINEMATIC_IDLE_MS * 10;
  cinematic.tick();
  assert.equal(cinematic.active, false);
});

test("it leaves once the board no longer allows it or the setting goes off", () => {
  const { state, cinematic } = setup();
  cinematic.pinch("in");
  state.allowed = false;
  cinematic.tick();
  assert.equal(cinematic.active, false, "the run ended, the hero fell or a page opened");
  state.allowed = true;
  cinematic.pinch("in");
  state.settings.cinematic = false;
  cinematic.tick();
  assert.equal(cinematic.active, false);
});

test("a tap shows the gear for a while; three quick taps leave", () => {
  const { state, cinematic } = setup();
  cinematic.pinch("in");
  assert.equal(cinematic.tap(), false);
  assert.equal(state.look!.gear, true);
  state.now += GEAR_MS;
  cinematic.tick();
  assert.equal(state.look!.gear, false, "the gear hides again");
  // Taps too far apart start over.
  cinematic.tap();
  state.now += EXIT_TAP_MS + 1;
  cinematic.tap();
  state.now += EXIT_TAP_MS;
  assert.equal(cinematic.tap(), false, "only two in a quick run");
  state.now += EXIT_TAP_MS;
  assert.equal(cinematic.tap(), true);
  assert.equal(cinematic.active, false);
});

test("the Gem button's option shows in the look only while active", () => {
  const { state, cinematic } = setup({ cinematicGems: true });
  cinematic.pinch("in");
  assert.equal(state.look!.gems, true);
  cinematic.exit();
  assert.equal(state.look!.gems, false);
});

test("two fingers drawn together tell one pinch in, and spread apart one pinch out", () => {
  const pinch = new PinchTracker();
  pinch.down(1, 0, 0);
  assert.equal(pinch.move(1, 5, 0), null, "one finger is no pinch");
  pinch.down(2, 100, 0);
  assert.equal(pinch.move(2, 80, 0), null, "a small change is no pinch");
  assert.equal(pinch.move(2, 70, 0), "in");
  assert.equal(pinch.move(2, 40, 0), null, "told once a pinch");
  pinch.up(2);
  pinch.down(3, 50, 0);
  assert.equal(pinch.move(3, 100, 0), "out");
});

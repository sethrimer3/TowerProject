import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { landscapeWorn, WIDE_QUERY } from "../src/ui/layout.ts";
import { decodeSettings, defaultSettings } from "../src/save/settings.ts";

test("landscape is worn only while the setting is on and the window is wide", () => {
  assert.equal(landscapeWorn(true, true), true);
  assert.equal(landscapeWorn(true, false), false);
  assert.equal(landscapeWorn(false, true), false);
  assert.equal(landscapeWorn(false, false), false);
});

test("a new player switches to landscape on wide screens, right-handed", () => {
  const s = defaultSettings();
  assert.equal(s.autoLandscape, true);
  assert.equal(s.hand, "right");
});

test("the layout settings decode, and bad values fall back to their defaults", () => {
  assert.deepEqual([decodeSettings({ autoLandscape: false, hand: "left" })].map((s) => [s.autoLandscape, s.hand]), [[false, "left"]]);
  assert.deepEqual([decodeSettings({ autoLandscape: "no", hand: "middle" })].map((s) => [s.autoLandscape, s.hand]), [[true, "right"]]);
});

test("a wide window means one shaped for the board and the HUD side by side", () => {
  // A phone on its side and a wide desktop window; not a phone upright nor a tablet upright.
  assert.match(WIDE_QUERY, /min-aspect-ratio: 4\/3/);
  assert.match(WIDE_QUERY, /min-width: 640px/);
});

test("every landscape grid has its left-handed mirror", () => {
  const css = readFileSync(new URL("../src/styles/landscape.css", import.meta.url), "utf8");
  const areas = (selector: string) => {
    const at = css.indexOf(`${selector} {`);
    assert.ok(at >= 0, `missing ${selector}`);
    const body = css.slice(at, css.indexOf("}", at));
    return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1].trim().split(/\s+/));
  };
  for (const state of ["", ":has(> nav.in-run)", ":has(> #board:not(.active))"]) {
    const right = areas(`html.layout-landscape .shell${state}`), left = areas(`html.layout-landscape.left-handed .shell${state}`);
    assert.deepEqual(left, right.map((row) => [...row].reverse()), `mirror of ${state || "the forest"}`);
  }
});

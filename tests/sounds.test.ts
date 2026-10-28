import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { BEDS, blendLoop, ONE_SHOTS } from "../src/sound-files.ts";
import { BoardSounds, type BoardCue, type Heard } from "../src/render/board-sounds.ts";
import type { ShownFight } from "../src/shown.ts";
import type { Volley } from "../src/volley.ts";

const ROOT = new URL("../public/assets/sounds/", import.meta.url);

test("every listed sound has its file, and every file is listed", () => {
  const listed = new Set([...Object.values(ONE_SHOTS).flat(), ...Object.values(BEDS)].map((p) => `${p}.mp3`));
  for (const path of listed) assert.ok(existsSync(new URL(path, ROOT)), `missing ${path}`);
  const files = readdirSync(ROOT, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".mp3"))
    .map((d) => `${d.parentPath.slice(ROOT.pathname.length).replace(/^\/|\/$/g, "")}/${d.name}`.replace(/^\//, ""));
  for (const f of files) assert.ok(listed.has(f), `unused ${f}`);
});

test("a cross-faded loop runs from its end into its start without a jump", () => {
  const n = 5000, f = 400, src = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) src[i] = Math.sin((phase += 0.05 + i * 1e-6));
  const len = n - f, dst = src.slice(0, len);
  blendLoop(dst, src, len, f);
  const step = (a: number, b: number) => Math.abs(a - b);
  let worst = 0;
  for (let i = 1; i < len; i++) worst = Math.max(worst, step(dst[i], dst[i - 1]));
  assert.ok(step(dst[0], dst[len - 1]) <= worst + 1e-3);
  assert.equal(dst[f + 10], src[f + 10]);
  assert.ok(step(src[0], src[len - 1]) > worst * 2);
});

const strike = (by: "hero" | "enemy", at: number, hp: number) => ({ by, damage: 3, start: at - 50, at, end: at + 50, hp });
const fight = (start: number, strikes: ReturnType<typeof strike>[]) =>
  ({ from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, bout: { strikes, duration: 0 }, start, hp: 10, summary: false }) as ShownFight;
const quiet: Heard = { fight: null, volley: null, struckDown: [], bombed: null };

function listen() {
  const heard: BoardCue[] = [];
  return { heard, sounds: new BoardSounds((c) => heard.push(c)) };
}

test("a fight's blows sound as they land, and its felling strike a fall", () => {
  const { heard, sounds } = listen();
  sounds.update(quiet, 0);
  const f = fight(1000, [strike("hero", 100, 7), strike("enemy", 300, 7), strike("hero", 500, 0)]);
  sounds.update({ ...quiet, fight: f }, 1000);
  assert.deepEqual(heard, []);
  sounds.update({ ...quiet, fight: f }, 1150);
  assert.deepEqual(heard, ["punch"]);
  sounds.update({ ...quiet, fight: f }, 1350);
  sounds.update({ ...quiet, fight: f }, 1600);
  assert.deepEqual(heard, ["punch", "punch", "punch", "bodyFall"]);
  sounds.update({ ...quiet, fight: f }, 2000);
  assert.equal(heard.length, 4);
});

test("shots sound as they land; the hero struck down and a Bomb sound once", () => {
  const { heard, sounds } = listen();
  sounds.update(quiet, 0);
  const shot = { by: "hero" as const, from: { x: 0, y: 0 }, to: { x: 2, y: 0 }, damage: 4, tick: 50 };
  const volley = { at: 100, ms: 100, shots: [shot, { ...shot, tick: 60, fell: {} }] } as unknown as Volley;
  sounds.update({ ...quiet, volley }, 100);
  assert.deepEqual(heard, []);
  sounds.update({ ...quiet, volley }, 10_000);
  assert.deepEqual(heard, ["arrowHit", "bodyFall"]);
  heard.length = 0;
  const bombed = { at: 10_000 };
  sounds.update({ ...quiet, volley, struckDown: [10_000], bombed }, 10_000);
  sounds.update({ ...quiet, volley, struckDown: [10_000], bombed }, 10_100);
  assert.deepEqual(heard, ["bodyFall", "blast"]);
});

test("what is already on the board as it first shows stays quiet", () => {
  const { heard, sounds } = listen();
  sounds.update({ fight: fight(0, [strike("hero", 100, 0)]), volley: null, struckDown: [50], bombed: { at: 40 } }, 5000);
  assert.deepEqual(heard, []);
});

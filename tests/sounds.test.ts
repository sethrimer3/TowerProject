import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { BEDS, blendLoop, ONE_SHOTS, shotPaths, STYLE_SOUNDS } from "../src/sound-files.ts";
import { BED_KIND, BLACKSMITH_REACH, DOCK_FLOOR, mixLevels, surroundingLevels, type Surroundings } from "../src/ambience.ts";
import { Game, pickupCue } from "../src/state.ts";
import { MISSIONS } from "../src/missions/catalog.ts";
import { playedSave } from "./first-skills.ts";
import { CUE_KIND, nextVariant, SOUND_KINDS, soundEnabledBy, soundOn, type SoundKind } from "../src/sound.ts";
import { SOUND_SETTINGS } from "../src/save/settings.ts";
import { defaults } from "../src/save/save.ts";
import { BoardSounds, type BoardCue, type Heard } from "../src/render/board-sounds.ts";
import type { ShownFight } from "../src/shown.ts";
import type { Volley } from "../src/volley.ts";

const ROOT = new URL("../public/assets/sounds/", import.meta.url);
const ROOT_DIR = fileURLToPath(ROOT);

test("every listed sound has its Ogg file, and every file is listed", () => {
  const styled = Object.values(STYLE_SOUNDS).flatMap((shots) => Object.values(shots ?? {}).flat());
  const listed = new Set([...Object.values(ONE_SHOTS).flat(), ...Object.values(BEDS), ...styled].map((p) => `${p}.ogg`));
  for (const path of listed) assert.ok(existsSync(new URL(path, ROOT)), `missing ${path}`);
  const all = readdirSync(ROOT, { recursive: true, withFileTypes: true }).filter((d) => d.isFile() && d.name !== "SOURCES.md");
  for (const d of all) assert.ok(d.name.endsWith(".ogg"), `not Ogg: ${d.name}`);
  const files = all
    // Each file's path under the sounds folder, with "/" on every OS.
    .map((d) => relative(ROOT_DIR, join(d.parentPath, d.name)).split(sep).join("/"));
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

test("a theme hears the default recordings unless it has its own", () => {
  assert.deepEqual(shotPaths("key"), ONE_SHOTS.key);
  assert.deepEqual(shotPaths("key", "neon"), STYLE_SOUNDS.neon?.key ?? ONE_SHOTS.key);
});

test("the game's own events sound once while fresh, and never once stale", () => {
  const { heard, sounds } = listen();
  sounds.update(quiet, 0);
  sounds.update({ ...quiet, cues: [{ cue: "key", at: 1000 }, { cue: "key", at: 1000 }, { cue: "door2", at: 1000 }] }, 1100);
  assert.deepEqual(heard, ["key", "door2"]);
  sounds.update({ ...quiet, cues: [{ cue: "potion", at: 1000 }] }, 5000);
  assert.deepEqual(heard, ["key", "door2"]);
});

test("Phoenix Spark, a revival and the Slime's and Dragon's bursts sound as they happen", () => {
  const { heard, sounds } = listen();
  const old = { bursts: [{ id: "slime" }], at: 0 };
  sounds.update({ ...quiet, sparkedAt: [10], revivedAt: [20], familiars: old }, 100);
  assert.deepEqual(heard, []);
  sounds.update({ ...quiet, sparkedAt: [10, 500], revivedAt: [20, 550], familiars: { bursts: [{ id: "dragon" }], at: 400 } }, 450);
  assert.deepEqual(heard, ["dragonFire"]);
  sounds.update({ ...quiet, sparkedAt: [10, 500], revivedAt: [20, 550], familiars: { bursts: [{ id: "slime" }], at: 520 } }, 600);
  assert.deepEqual([...heard].sort(), ["angelRevive", "dragonFire", "phoenixSpark", "slimeImpact"]);
});

test("a Thunderbolt zaps as it strikes, in place of an arrow", () => {
  const { heard, sounds } = listen();
  sounds.update(quiet, 0);
  const bolt = { by: "hero" as const, from: { x: 0, y: 0 }, to: { x: 2, y: 0 }, damage: 4, tick: 10, thunderbolt: true as const };
  const volley = { at: 100, ms: 100, shots: [bolt] } as unknown as Volley;
  sounds.update({ ...quiet, volley }, 100);
  sounds.update({ ...quiet, volley }, 10_000);
  assert.deepEqual(heard, ["lightningZap"]);
});

test("the hero's steps sound a footstep, quick ones a run's, and none on a jump or after Auto-Climb", () => {
  const { heard, sounds } = listen();
  const at = (x: number, y: number, footsteps = true, board = "tower:1:true") => ({ ...quiet, hero: { x, y, board, footsteps } });
  sounds.update(at(5, 5), 0);
  sounds.update(at(5, 6), 100);
  sounds.update(at(5, 7), 300);
  sounds.update(at(5, 8), 2000);
  assert.deepEqual(heard, ["step", "run", "step"]);
  heard.length = 0;
  // A new board, a jump across this one, standing still, and Auto-Climb's steps make none.
  sounds.update(at(9, 1, true, "tower:1:false"), 3000);
  sounds.update(at(9, 9, true, "tower:1:false"), 4000);
  sounds.update(at(9, 9, true, "tower:1:false"), 5000);
  sounds.update(at(9, 10, false, "tower:1:false"), 6000);
  assert.deepEqual(heard, []);
});

test("a one-shot's next variant is never the one it played last", () => {
  for (let last = 0; last < 3; last++)
    for (let i = 0; i < 30; i++) {
      const v = nextVariant(3, last, i / 30);
      assert.ok(v >= 0 && v < 3 && v !== last);
    }
  assert.equal(nextVariant(1, 0, 0.9), 0);
  assert.deepEqual([0, 0.5, 0.99].map((r) => nextVariant(8, undefined, r)), [0, 4, 7]);
});

test("each pickup, chest and door has its sound, a door by the keys it takes", () => {
  assert.equal(pickupCue({ kind: "attack" }), "attackShard");
  assert.equal(pickupCue({ kind: "defense" }), "defenseShard");
  assert.equal(pickupCue({ kind: "potion" }), "potion");
  assert.equal(pickupCue({ kind: "key", color: "red" }), "key");
  assert.equal(pickupCue({ kind: "treasure" }), "chestCreak");
  assert.equal(pickupCue({ kind: "door", color: "blue" }), "door1");
  assert.equal(pickupCue({ kind: "door", door: { type: "keys", keys: ["yellow", "blue"], mode: "all" } }), "door2");
  assert.equal(pickupCue({ kind: "door", door: { type: "keys", keys: ["yellow", "blue", "red"], mode: "any" } }), "door1");
  assert.equal(pickupCue({ kind: "door", door: { type: "keys", keys: ["yellow", "blue", "red", "red"], mode: "all" } }), "door3");
  assert.equal(pickupCue({ kind: "door", door: { type: "wood", durability: 5 } }), "door1");
  assert.equal(pickupCue({ kind: "floor" }), null);
});

const forest = (over: Partial<Surroundings> = {}): Surroundings => ({ place: "forest", weather: "sunny", weatherSound: true, hero: { x: 9, y: 4 }, ...over });

test("outside the wind blows with Weather sounds on, and the chimes ring on a windy day", () => {
  assert.deepEqual(surroundingLevels(forest()), { windForest: 1 });
  assert.deepEqual(surroundingLevels(forest({ weather: "storm" })), { windForest: 1, windChimes: 1 });
  assert.deepEqual(surroundingLevels(forest({ weather: "cloudy", weatherSound: false })), {});
  assert.deepEqual(surroundingLevels(forest({ place: "inside" })), {});
  // A calm evening plays its own ambience in place of the wind.
  assert.deepEqual(surroundingLevels(forest({ weather: "evening" })), { evening: 1 });
  assert.deepEqual(surroundingLevels(forest({ weather: "evening", weatherSound: false })), {});
});

test("the Blacksmith is louder the nearer the hero stands, and silent far off", () => {
  const forge = { x: 4, y: 9 };
  const at = (x: number, y: number) => surroundingLevels(forest({ hero: { x, y }, blacksmith: forge })).blacksmith ?? 0;
  assert.equal(at(4, 9), 1);
  assert.ok(at(5, 7) > at(9, 4));
  assert.equal(at(4 + BLACKSMITH_REACH, 9), 0);
  assert.equal(surroundingLevels(forest()).blacksmith, undefined);
});

test("by the lake the music plays, and the dock's water laps louder nearer the fisherman", () => {
  const fisherman = { x: 5, y: 8 };
  const lake = (x: number, y: number) => surroundingLevels(forest({ place: "lake", hero: { x, y }, fisherman }));
  assert.equal(lake(14, 7).meditative, 1);
  assert.ok(lake(6, 8).dockWater! > lake(10, 8).dockWater!);
  assert.ok(lake(10, 8).dockWater! > lake(19, 0).dockWater!);
  assert.equal(lake(19, 19).dockWater, DOCK_FLOOR);
  assert.equal(lake(14, 7).blacksmith, undefined);
});

test("each bed plays at the loudest any part of the game asks", () => {
  assert.deepEqual(mixLevels([{ meditative: 1, dockWater: 0.4 }, { meditative: 0.5 }, {}]), { meditative: 1, dockWater: 0.4 });
  assert.deepEqual(mixLevels([]), {});
});

test("climbing the stairs sounds the steps, and completing a daily mission its sound", () => {
  const g = new Game(playedSave());
  g.newRun({ seed: 7 });
  g.cues = [];
  g.advanceTowerRoom();
  assert.ok(g.cues.some((c) => c.cue === "stoneSteps"));
  g.missions.refresh();
  const mission = g.save.missions.list.find((m) => m.progress < MISSIONS[m.type].target)!;
  g.cues = [];
  g.missions.record(mission.type, MISSIONS[mission.type].target - 1 - mission.progress);
  assert.ok(!g.cues.some((c) => c.cue === "dailyMission"));
  g.missions.record(mission.type, 1);
  assert.deepEqual(g.cues.map((c) => c.cue), ["dailyMission"]);
});

test("each kind of sound answers to its own setting, the lake's music to Music", () => {
  const off = new Set<SoundKind>(["ui", "music"]);
  soundEnabledBy((kind) => !off.has(kind));
  try {
    assert.equal(soundOn("ui"), false);
    assert.equal(soundOn("events"), true);
    assert.equal(soundOn(), true);
    off.clear();
    for (const kind of SOUND_KINDS) off.add(kind);
    assert.equal(soundOn(), false);
  } finally {
    soundEnabledBy(() => true);
  }
  assert.equal(CUE_KIND.knock, "ui");
  assert.equal(CUE_KIND.punch, "events");
  assert.equal(CUE_KIND.gemBankFull, "gemBank");
  assert.equal(CUE_KIND.dailyMission, "notifications");
  assert.equal(BED_KIND.meditative, "music");
  assert.equal(BED_KIND.windForest, "ambience");
  for (const kind of SOUND_KINDS) assert.equal(defaults().settings[SOUND_SETTINGS[kind]], true);
});

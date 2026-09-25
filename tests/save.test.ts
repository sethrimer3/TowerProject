import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { decode, defaults } from "../src/save.ts";

// Characterization corpus for decode(): every field path of several base saves
// is replaced by hostile values, and each decoded result is hashed against a
// golden file. Regenerate (only when a decode behaviour change is intended)
// with UPDATE_GOLDEN=1.
const GOLDEN = new URL("./fixtures/save-decode.golden.json", import.meta.url);

const player = (over: object = {}) => ({
  x: 7, y: 5, hp: 40, maxHp: 50, attack: 12, defense: 4,
  keys: { yellow: 2, blue: 1, red: 0 }, ...over,
});
const run = (over: object = {}) => ({
  seed: 1234, height: 3, floor: 2, kills: 5, treasures: 1, layoutVersion: 7,
  player: player(),
  changes: { "3,4": { kind: "floor" }, "5,6": { kind: "openedChest", tier: "gold" }, "1,1": { kind: "wall" } },
  floors: { "2": { "3,3": { kind: "floor" } } },
  damaged: false, keysSpent: true,
  rewards: [{ x: 3, y: 4, tier: "silver" }, { x: 30, y: 4, tier: "gold" }, { x: 1, y: 2, tier: "bronze" }],
  delveMilestone: 1, delveKnown: { "1,2": true }, delveVisited: { "1,2": 3 },
  ...over,
});
const mode = (extra: object = {}) => ({
  run: run(),
  history: [
    { run: run({ kills: 4 }), best: 3 },
    { run: run({ seed: 999 }), best: 3 },
    { run: run({ layoutVersion: 6 }), best: 3 },
    { run: run({ kills: 3 }), best: 2 },
    { run: run({ kills: 2 }), best: 2 },
  ],
  revival: { earned: 2, snapshot: { run: run({ kills: 1 }), best: 2 } },
  best: 9, reached: 7,
  lootedTiles: { "1234:3,4": true, "1234:2:3,4": true, "bad": true, "-1:-2:-3,-4": true },
  ...extra,
});
const settings = {
  speed: 6, transition: "fast", showArrows: true, spritesOff: true, reduceMotion: true, brightness: 55.4,
  weatherSound: false, decorOff: true, batterySaver: true, autoOffOnDeath: false, oneTapMove: true,
  infoDisplay: "popup", devMode: true,
};
const v3 = () => ({
  version: 3,
  gold: 120.7, xp: 44, provisions: { ...defaults().provisions },
  upgrades: { ...defaults().upgrades, undos: 2, shardUndos: 1, delve: 1 },
  settings,
  tower: {
    ...mode(), shards: 17,
    log: { "3": { earned: ["silver", "gold", "bogus"], claimed: ["gold", "platinum"] }, "x": { earned: ["gold"] }, "4": { earned: "gold" } },
    sectionHp: { "1": 80.5, "2": 0, "0": 50, "x": 9 },
    startSection: 1,
  },
  delve: { ...mode(), essence: 33 },
  materials: { ...defaults().materials },
  equipmentInventory: [{
    id: "e1", slot: "weapon", name: "Blade", metal: "steel",
    flatAttack: 3, flatDefense: 0, flatMaxHp: 0, percentAttack: 0.1, percentDefense: 0, percentMaxHp: 0,
    baseRecipe: [], enhancements: [], createdAt: 1700000000000,
  }],
  equipped: { weapon: "e1", armor: "missing" },
  consumables: { ...defaults().consumables },
});
// Each base mutates only the subtrees where it behaves differently, keeping the
// corpus small: snapshots nested in history/revival reuse the run validator.
const nested = (p: string[]) => {
  const i = p.findIndex((k) => k === "history" || k === "revival");
  return i >= 0 && p.length > i + 3;
};
const under = (...prefixes: string[]) => (p: string[]) => prefixes.some((x) => p.join(".").startsWith(x));
const scope: Record<string, (p: string[]) => boolean> = {
  v3: (p) => !nested(p),
  v2: (p) => p.length === 1,
  v1: (p) => !nested(p),
  outside: under("tower.run"),
  preSkillTrees: under("upgrades", "delve.run", "delve.best", "delve.essence"),
};
const bases: Record<string, () => any> = {
  v3,
  v2: () => ({ ...v3(), version: 2 }),
  v1: () => ({ version: 1, ...mode(), best: 12, essence: 8, upgrades: { undos: 1 }, settings: { showInfoBoxes: false } }),
  outside: () => ({ ...v3(), tower: { ...v3().tower, run: run({ outside: true, height: 0, floor: 0 }) } }),
  preSkillTrees: () => {
    const s = v3();
    delete (s.upgrades as any).delve;
    return { ...s, upgrades: { ...s.upgrades, yellow: 1 } };
  },
};
const HOSTILE: [string, unknown][] = [
  ["delete", undefined], ["null", null], ["neg", -1], ["frac", 2.5], ["huge", 2e9],
  ["str", "x"], ["true", true], ["false", false], ["arr", []], ["obj", {}], ["zero", 0],
];

// Values on either side of each limit decode() enforces, which generic hostile
// values never land on.
const EDGES: [string, unknown[]][] = [
  ["tower.run.player.x", [29, 30]],
  ["tower.run.player.y", [1, 2, 11, 12]],
  ["tower.run.player.hp", [1, 50, 51]],
  ["tower.run.height", [1e9, 1e9 + 1]],
  ["tower.run.delveMilestone", [1.5]],
  ["tower.run.rewards.0.x", [29, 30]],
  ["tower.run.rewards.0.y", [19, 20]],
  ["tower.run.changes.9,9", [{ kind: "openedChest" }, { kind: "openedChest", tier: "wood" }, { kind: "enemy" }]],
  ["tower.run.floors.x", [{}]],
  ["tower.run.delveVisited.x", [1]],
  ["tower.lootedTiles.5:6,7", [true]],
  ["tower.lootedTiles.5:6:7", [true]],
  ["tower.sectionHp.3", [1, 0.5]],
  ["tower.startSection", [2, 0]],
  ["settings.brightness", [19, 20, 100, 101]],
  ["settings.speed", [1, 3, 10, 2]],
  ["settings.transition", ["smooth", "instant", "slow"]],
  ["settings.infoDisplay", ["both", "status", "none", "all"]],
  ["gold", [1e9, 1e9 + 1]],
  ["provisions.heal", [999, 1000]],
  ["upgrades.undos", [0, 5, 99]],
  ["equipmentInventory.0.percentAttack", [10, 11]],
  ["equipmentInventory.0.flatAttack", [9999, 10000]],
  ["equipmentInventory.0.metal", ["iron", "voidsteel", "tin"]],
  ["equipmentInventory.0.id", ["", "x".repeat(100)]],
  ["equipmentInventory.0.baseRecipe", [[{ id: "nope", quantity: 1 }], [{ id: "ironBar", quantity: 1000 }], [{ id: "ironBar", quantity: 999 }]]],
  ["equipped.weapon", ["e2"]],
  ["outside:tower.run.player.y", [11, 12]],
  ["outside:tower.run.floor", [1]],
  ["outside:tower.run.height", [1]],
];

function paths(value: any, prefix: string[] = []): string[][] {
  if (!value || typeof value !== "object") return [prefix];
  const children = Object.keys(value).flatMap((k) => paths(value[k], [...prefix, k]));
  return prefix.length ? [prefix, ...children] : children;
}
function mutate(base: any, path: string[], replacement: unknown, remove: boolean) {
  const copy = structuredClone(base);
  let node = copy;
  for (const k of path.slice(0, -1)) node = node[k];
  const last = path[path.length - 1];
  if (remove) delete node[last];
  else node[last] = replacement;
  return copy;
}
// Key-sorted so a refactor that assigns fields in a different order still matches.
function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
function fingerprint(raw: string | null) {
  const { defend: _defend, ...rest } = decode(raw); // Defend has its own decoder and a random default seed.
  return createHash("sha256").update(canonical(rest)).digest("hex").slice(0, 16);
}
function corpus(): Record<string, string> {
  const out: Record<string, string> = {
    "raw:null": fingerprint(null), "raw:garbage": fingerprint("{not json"), "raw:number": fingerprint("5"),
    "raw:false": fingerprint("false"), "raw:string": fingerprint('"save"'), "raw:array": fingerprint("[1]"),
  };
  for (const version of ["3", "constructor", 4, 0])
    out[`version:${version}`] = fingerprint(JSON.stringify({ ...v3(), version }));
  for (const [spec, values] of EDGES) {
    const [base, path] = spec.includes(":") && !spec.startsWith("tower.lootedTiles") ? spec.split(":") : ["v3", spec];
    for (const value of values)
      out[`edge:${spec}:${JSON.stringify(value)}`] = fingerprint(JSON.stringify(mutate(bases[base](), path.split("."), value, false)));
  }
  for (const [name, make] of Object.entries(bases)) {
    const base = make();
    out[`${name}:base`] = fingerprint(JSON.stringify(base));
    for (const path of paths(base).filter(scope[name]))
      for (const [label, value] of HOSTILE)
        out[`${name}:${path.join(".")}:${label}`] = fingerprint(JSON.stringify(mutate(base, path, value, label === "delete")));
  }
  return out;
}

test("decode matches the characterization corpus", () => {
  const actual = corpus();
  if (process.env.UPDATE_GOLDEN || !existsSync(GOLDEN)) {
    writeFileSync(GOLDEN, JSON.stringify(actual, null, 1) + "\n");
    return;
  }
  const expected = JSON.parse(readFileSync(GOLDEN, "utf8"));
  const changed = Object.keys({ ...expected, ...actual }).filter((k) => expected[k] !== actual[k]);
  assert.deepEqual(changed.slice(0, 20), [], `${changed.length} decode cases changed`);
});

test("decode keeps a valid v3 save's progress and clamps settings", () => {
  const d = decode(JSON.stringify(v3()));
  assert.equal(d.gold, 120);
  assert.equal(d.settings.brightness, 55);
  assert.equal(d.settings.infoDisplay, "popup");
  assert.equal(d.tower.run?.seed, 1234);
  // Capacity is 1 + undos + shardUndos = 4; mismatched seed/layout snapshots drop out.
  assert.equal(d.tower.history.length, 2);
  assert.ok(d.tower.revival);
  assert.deepEqual(Object.keys(d.tower.lootedTiles).sort(), ["-1:-2:-3,-4", "1234:2:3,4", "1234:3,4"]);
  assert.deepEqual(d.tower.log, { "3": { earned: ["silver", "gold"], claimed: ["gold"] } });
  assert.deepEqual(d.tower.sectionHp, { "1": 80 });
  assert.equal(d.tower.startSection, 1);
  assert.deepEqual(d.tower.run?.rewards, [{ x: 3, y: 4, tier: "silver" }]);
  assert.deepEqual(d.equipped, { weapon: "e1" });
});

test("decode migrates v1 saves into the Delve slice and legacy settings", () => {
  const d = decode(JSON.stringify(bases.v1()));
  assert.equal(d.delve.best, 12);
  assert.equal(d.delve.essence, 8);
  assert.equal(d.delve.run?.seed, 1234);
  assert.equal(d.tower.run, null);
  assert.equal(d.settings.infoDisplay, "none");
  assert.equal(d.upgrades.delve, 1);
});

test("decode grants skill-tree access to saves made before skill trees", () => {
  const d = decode(JSON.stringify(bases.preSkillTrees()));
  assert.equal(d.upgrades.delve, 1);
  assert.equal(d.upgrades.legacy, 1);
});

test("a malformed run.floors drops only that run, not the rest of the save", () => {
  const s = v3();
  (s.tower.run as any).floors = null;
  const d = decode(JSON.stringify(s));
  assert.equal(d.tower.run, null);
  assert.equal(d.gold, 120);
  assert.equal(d.delve.run?.seed, 1234);
  assert.equal(d.equipmentInventory.length, 1);
});

test("decode rejects runs that break player invariants", () => {
  for (const bad of [player({ hp: 0 }), player({ hp: 60 }), player({ x: 30 }), player({ keys: { yellow: 1 } })]) {
    const s = v3();
    s.tower.run = run({ player: bad });
    assert.equal(decode(JSON.stringify(s)).tower.run, null);
  }
  const outsideTooHigh = v3();
  outsideTooHigh.tower.run = run({ outside: true, height: 1, floor: 0 });
  assert.equal(decode(JSON.stringify(outsideTooHigh)).tower.run, null);
});

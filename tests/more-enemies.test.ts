import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { UPGRADES } from "../src/config.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { World, delveExtras } from "../src/delve/world.ts";
import { region } from "../src/delve/labyrinth.ts";
import { attachBadge, BADGES, decodeBadges, fitsCard, MAX_COPIES, validRunBadges, type BadgesSave } from "../src/badges.ts";
import { addEnemies, extraEnemies, extrasSeed, type ExtraEnemies, type ExtraFloor } from "../src/more-enemies.ts";
import { point, type Enemy, type Tile } from "../src/entities.ts";

const enemy = (strength: Enemy["strength"]): Enemy => ({ name: strength, hp: 10, attack: 2, defense: 1, tier: 0, strength });
const TILES: Record<string, Tile> = {
  "#": { kind: "wall" }, ".": { kind: "floor" }, R: { kind: "floor" }, D: { kind: "door", color: "yellow" },
  K: { kind: "key", color: "yellow" }, S: { kind: "stairs" },
  E: { kind: "enemy", enemy: enemy("normal") }, W: { kind: "enemy", enemy: enemy("weak") }, B: { kind: "enemy", enemy: enemy("boss") },
};
/** A floor drawn row by row (y down the rows); R is the way in, S the target. */
function board(rows: string[]): ExtraFloor {
  const cells = new Map<string, Tile>(), band: { x: number; y: number }[] = [];
  let root = { x: 0, y: 0 }, target: { x: number; y: number } | null = null;
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    cells.set(point(x, y), TILES[c]!);
    band.push({ x, y });
    if (c === "R") root = { x, y };
    if (c === "S") target = { x, y };
  }));
  return { cells, width: rows[0]!.length, wraps: false, root, target, band, avoid: new Set([point(root.x, root.y)]) };
}
const place = (floor: ExtraFloor, extras: ExtraEnemies, seed = 1) => {
  const placed = new Map<string, Tile>();
  addEnemies(floor, extras, seed, placed);
  return placed;
};

test("More Enemies is a rare floor badge of 30% to 90%", () => {
  const def = BADGES.moreEnemies;
  assert.equal(def.rarity, "rare");
  assert.equal(def.kind, "floor");
  assert.deepEqual(def.values, [30, 40, 50, 60, 70, 80, 90]);
});

test("it sits only on a monster card, and a swap that would put it elsewhere takes it off", () => {
  assert.deepEqual(BADGES.moreEnemies.cards, ["monster", "weakEnemy", "baseEnemy", "strongEnemy", "eliteEnemy", "bossEnemy"]);
  assert.equal(fitsCard("moreEnemies", "door"), false);
  assert.ok(fitsCard("moreEnemies", "bossEnemy"));
  assert.ok(fitsCard("hp", "door"), "other badges sit anywhere");
  const m: BadgesSave = { owned: { moreEnemies: { copies: 1, pick: 0 }, hp: { copies: 1, pick: 0 } }, cards: {}, rng: null };
  assert.equal(attachBadge(m, "moreEnemies", "door"), false);
  assert.deepEqual(m.cards, {});
  assert.ok(attachBadge(m, "moreEnemies", "monster"));
  assert.ok(attachBadge(m, "hp", "door"));
  assert.ok(attachBadge(m, "hp", "monster"));
  assert.deepEqual(m.cards, { monster: "hp" }, "More Enemies can't swap onto DOOR, so it comes off");
  assert.ok(attachBadge(m, "moreEnemies", "weakEnemy"));
  assert.ok(attachBadge(m, "moreEnemies", "monster"));
  assert.deepEqual(m.cards, { monster: "moreEnemies", weakEnemy: "hp" }, "between monster cards it swaps");
  const saved = decodeBadges({ owned: m.owned, cards: { door: "moreEnemies", monster: "hp" } }, UPGRADES);
  assert.deepEqual(saved.cards, { monster: "hp" }, "a save with it on DOOR drops it");
  assert.equal(validRunBadges({ door: { id: "moreEnemies", level: 1, pick: 0 } }), false);
});

test("a run's badges add each strength's percents, MONSTER covering every one", () => {
  assert.equal(extraEnemies(undefined), undefined);
  assert.equal(extraEnemies({ monster: { id: "hp", level: 7, pick: 0 } }), undefined);
  assert.deepEqual(extraEnemies({ bossEnemy: { id: "moreEnemies", level: 1, pick: 0 } }), { boss: 30 });
  assert.deepEqual(
    extraEnemies({ monster: { id: "moreEnemies", level: 1, pick: 0 }, bossEnemy: { id: "moreEnemies", level: 7, pick: 0 } }),
    { weak: 30, normal: 30, strong: 30, elite: 30, boss: 120 },
  );
});

test("each strength gets its count times the percent; a fraction is a chance of one more", () => {
  const open = ["#########", "#R......#", "#.......#", "#..E.E..#", "#.......#", "#....B..#", "#########"];
  assert.equal(place(board(open), { weak: 90 }).size, 0, "none generated, none added");
  const two = place(board(open), { normal: 50 });
  assert.equal(two.size, 1, "2 × 50% is exactly one");
  assert.equal([...two.values()][0]!.enemy!.strength, "normal");
  let extra = 0;
  for (let seed = 0; seed < 1000; seed++) extra += place(board(open), { boss: 30 }, seed).size;
  assert.ok(extra > 250 && extra < 350, `1 boss × 30% adds one about 30% of the time (${extra} in 1000)`);
  const copy = [...place(board(open), { boss: 100 }).values()][0]!;
  assert.deepEqual(copy, { kind: "enemy", enemy: enemy("boss") }, "a copy of the floor's own");
});

test("extras stand in reward rooms' corners behind a gate first, then the core's corners", () => {
  const rows = [
    "#########",
    "#R....#K#",
    "#.....D.#",
    "#.....#.#",
    "#E....###",
    "#########",
  ];
  const first = place(board(rows), { normal: 100 });
  assert.deepEqual([...first.keys()], ["7,3"], "the room behind the door holds the key: its corner");
  const second = place(board(rows), { normal: 200 });
  assert.equal(second.size, 2);
  const core = [...second.keys()][1]!;
  assert.ok(["5,1", "5,4"].includes(core), `then a core corner, never the room's cut tile (${core})`);
});

test("an extra blocks a way only when no other tile is free", () => {
  const side = place(board(["#######", "#R...E#", "###.###", "###.###", "#######"]), { normal: 100 });
  assert.deepEqual([...side.keys()], ["3,3"], "the dead end, not the corridor");
  const corridor = place(board(["######", "#R..E#", "######"]), { normal: 100 });
  assert.equal(corridor.size, 1, "with nothing else free, it stands in the way");
});

test("tiles off the shortest walk to the stairs go first", () => {
  const rows = ["#######", "#R...S#", "#.....#", "#..E..#", "#######"];
  for (let seed = 0; seed < 20; seed++) {
    const [k] = [...place(board(rows), { normal: 100 }, seed).keys()];
    assert.ok(k === "1,3" || k === "5,3", `a bottom corner, off the top row's walk (${k})`);
  }
});

test("a Tower floor with extras is the same floor plus enemies, every time it is built", () => {
  const extras: ExtraEnemies = { weak: 90, normal: 90, strong: 90, elite: 90, boss: 90 };
  let added = 0;
  for (const room of [0, 4, 9, 15, 33]) {
    const plain = new RoomWorld(11, room, {}), more = new RoomWorld(11, room, {}, 0, 1, extras), again = new RoomWorld(11, room, {}, 0, 1, extras);
    for (let y = 0; y < 17; y++)
      for (let x = 0; x < 17; x++) {
        const a = plain.tile(x, y), b = more.tile(x, y);
        assert.deepEqual(again.tile(x, y), b);
        if (JSON.stringify(a) === JSON.stringify(b)) continue;
        assert.equal(a.kind, "floor", "only plain floor takes an extra");
        assert.equal(b.kind, "enemy");
        added++;
      }
  }
  assert.ok(added > 0);
  assert.equal(new RoomWorld(11, 4, {}, 0, 1, {}).tile(8, 1).kind, new RoomWorld(11, 4, {}).tile(8, 1).kind);
});

test("in the Delve each equivalent floor counts its own enemies and takes its own extras", () => {
  const seed = 21, r = region(seed, 0), extras: ExtraEnemies = { normal: 90, weak: 90 };
  const placed = delveExtras(seed, 0, 1, extras);
  assert.ok(placed.size > 0);
  const floorOf = (k: string) => Math.floor((r.metadata.get(k)?.depth ?? 0) / 10);
  for (let f = 0; f < 10; f++) {
    const generated = [...r.cells].filter(([k, t]) => floorOf(k) === f && (t.enemy?.strength === "normal" || t.enemy?.strength === "weak")).length;
    const added = [...placed.keys()].filter((k) => floorOf(k) === f).length;
    assert.ok(added <= Math.ceil(generated * 0.9) + 1, `floor ${f}: ${added} added for ${generated}`);
    for (const k of placed.keys()) assert.equal(r.cells.get(k)?.kind, "floor");
  }
  const plain = new World({ seed, changes: {}, floor: 0, milestone: 0 }), more = new World({ seed, changes: {}, floor: 0, milestone: 0 }, extras);
  let extra = 0;
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < 30; x++) {
      const a = plain.tile(x, y), b = more.tile(x, y);
      if (a.kind !== b.kind) (assert.equal(b.kind, "enemy"), extra++);
    }
  assert.ok(extra > 0);
  assert.notEqual(extrasSeed(seed, 0), extrasSeed(seed, 1));
});

test("a run with the badge on MONSTER climbs floors holding more enemies, kept through a reload", () => {
  const save = defaults();
  save.tutorials.climb = true;
  save.upgrades.cardBadges = 1;
  save.hand = ["stairs", "monster", "heal", "door"];
  save.badges.owned.moreEnemies = { copies: MAX_COPIES, pick: 0 };
  save.badges.cards.monster = "moreEnemies";
  const g = new Game(save);
  g.newRun();
  assert.deepEqual(g.run.badges?.monster, { id: "moreEnemies", level: 7, pick: 0 });
  const count = (w: { tile(x: number, y: number): Tile }) => {
    let n = 0;
    for (let y = 0; y < 17; y++) for (let x = 0; x < 17; x++) if (w.tile(x, y).kind === "enemy") n++;
    return n;
  };
  const plain = new RoomWorld(g.run.seed, 0, {});
  assert.ok(count(g.world) > count(plain), "floor 1 holds more");
  const reloaded = new Game(decode(JSON.stringify(g.save)));
  assert.equal(count(reloaded.world), count(g.world));
  assert.deepEqual(new RoomWorld(g.run.seed, 0, {}, 0, 1, extraEnemies(g.run.badges)).cells, (g.world as RoomWorld).cells);
});

test("Dev mode owns More Enemies at the top level", () => {
  const g = new Game(defaults());
  g.setDevMode(true);
  assert.equal(g.save.badges.owned.moreEnemies?.copies, MAX_COPIES);
});

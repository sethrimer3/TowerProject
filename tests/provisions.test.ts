import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { ENTRANCE_Y } from "../src/outside.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import type { Tile } from "../src/entities.ts";

/** Lays the floor of `g`'s world: open floor at (0, 0) and (1, 0), for the
 * hero to step back and forth on. Undo builds the floor afresh, so a test
 * lays it again after one. */
function lay(g: Game) {
  (g.world as RoomWorld).cells = new Map<string, Tile>([["0,0", { kind: "floor" }], ["1,0", { kind: "floor" }]]);
}
/** A Tower run on seed 7 owning `provisions`, with one undo, the hero at
 * (0, 0) with ATK and DEF 10 and HP 40 of 100. */
function withProvisions(provisions: Partial<Game["save"]["provisions"]>) {
  const s = defaults();
  s.upgrades.inspirationUndos = 1;
  Object.assign(s.provisions, provisions);
  const g = new Game(s);
  g.newRun({ seed: 7 });
  lay(g);
  Object.assign(g.run.player, { x: 0, y: 0, attack: 10, defense: 10, hp: 40, maxHp: 100 });
  return g;
}
/** Takes `n` turns, stepping back and forth. */
function turns(g: Game, n: number) {
  for (let i = 0; i < n; i++) assert.ok(g.move(g.run.player.x === 0 ? 1 : -1, 0));
}
/** Walks the hero from the forest in through the entrance. */
function goInside(g: Game) {
  g.walkTo(g.run.player.x, ENTRANCE_Y);
  for (let i = 0; i < 40 && g.route.length; i++) g.routeStep();
  assert.equal(g.run.outside, false);
}

test("provisions add nothing as a run starts: each one owned is a use the run carries", () => {
  const g = new Game(defaults());
  g.newRun();
  const hero = { ...g.run.player, keys: { ...g.run.player.keys } };
  Object.assign(g.save.provisions, { heal: 2, edge: 1, guard: 1 });
  g.newRun();
  assert.deepEqual({ ...g.run.player, keys: { ...g.run.player.keys } }, hero);
  assert.deepEqual([g.provisionsLeft("heal"), g.provisionsLeft("edge"), g.provisionsLeft("guard")], [2, 1, 1]);
});

test("a Traveler's elixir fills HP to max HP, and none is spent while HP is full", () => {
  assert.equal(withProvisions({}).useProvision("heal"), "unavailable", "none owned");
  const g = withProvisions({ heal: 1 });
  assert.equal(g.useProvision("heal"), "used");
  assert.equal(g.run.player.hp, 100);
  assert.deepEqual([g.lastHeal?.from, g.lastHeal?.to], [40, 100], "the HP bar fills from 40");
  assert.equal(g.provisionsLeft("heal"), 0);
  g.run.player.hp = 50;
  assert.equal(g.useProvision("heal"), "spent");
  const full = withProvisions({ heal: 1 });
  full.run.player.hp = 100;
  assert.equal(full.useProvision("heal"), "full");
  full.run.player.hp = 120; // Overheal above max
  assert.equal(full.useProvision("heal"), "full");
  assert.equal(full.provisionsLeft("heal"), 1, "a refusal costs nothing");
  const forest = withProvisions({ heal: 3 });
  forest.newRun({ outside: true, seed: 1 });
  assert.equal(forest.provisionsLeft("heal"), 3, "the forest shows what the next run carries");
  assert.equal(forest.useProvision("heal"), "unavailable", "and uses none");
});

for (const [id, stat] of [["edge", "attack"], ["guard", "defense"]] as const)
  test(`${id === "edge" ? "a Whetstone" : "an Aegis charm"} raises ${stat} by 20% for 100 turns, and can't be used while one is going on`, () => {
    const g = withProvisions({ [id]: 2 });
    assert.equal(g.useProvision(id), "used");
    assert.equal(g.run.player[stat], 12);
    assert.deepEqual(g.boostOf(id), { amount: 2, turns: 100 });
    assert.equal(g.useProvision(id), "active");
    assert.equal(g.provisionsLeft(id), 1, "a refusal costs nothing");
    turns(g, 99);
    assert.equal(g.run.player[stat], 12, "still on after 99 turns");
    assert.equal(g.boostOf(id)?.turns, 1);
    turns(g, 1);
    assert.equal(g.run.player[stat], 10, "gone after the 100th");
    assert.equal(g.boostOf(id), undefined);
    assert.equal(g.useProvision(id), "used", "and another can go on");
    assert.equal(g.run.player[stat], 12);
  });

test("undo gives no use back and keeps a boost counting down", () => {
  const g = withProvisions({ edge: 1, heal: 1 });
  turns(g, 1);
  assert.equal(g.useProvision("edge"), "used");
  g.run.player.hp = 30;
  assert.equal(g.useProvision("heal"), "used");
  turns(g, 5);
  assert.ok(g.undo());
  lay(g);
  assert.equal(g.provisionsLeft("edge"), 0);
  assert.equal(g.provisionsLeft("heal"), 0);
  assert.equal(g.run.player.attack, 12, "the boost is still on");
  assert.equal(g.boostOf("edge")?.turns, 95, "with the turns it had left");
  assert.equal(g.run.player.hp, 100, "and the heal kept");
});

test("a boost that ran out stays out through undo", () => {
  const g = withProvisions({ guard: 1 });
  g.useProvision("guard");
  turns(g, 100);
  assert.equal(g.run.player.defense, 10);
  assert.ok(g.undo());
  assert.equal(g.run.player.defense, 10, "the turn before it ran out comes back without it");
  assert.equal(g.boostOf("guard"), undefined);
});

test("what a run spent and has going on saves", () => {
  const g = withProvisions({ guard: 1, heal: 1 });
  g.useProvision("guard");
  g.useProvision("heal");
  const run = decode(JSON.stringify(g.save)).tower.run!;
  assert.deepEqual(run.provisionsUsed, { guard: 1, heal: 1 });
  assert.deepEqual(run.boosts, { defense: { amount: 2, turns: 100 } });
});

test("the Gold Key gives a gold key for each owned on the run's first floor, then every 100 floors, a floor skipped past counting", () => {
  const s = defaults();
  s.upgrades.extraKey = 1;
  s.provisions.yellowKey = 2;
  const g = new Game(s);
  g.newRun({ outside: true, seed: 3 });
  const keys = g.run.player.keys.yellow;
  goInside(g);
  assert.equal(g.run.player.keys.yellow, keys + 2, "on floor 1");
  assert.equal(g.run.keyFloor, 0);
  const held = () => g.run.player.keys.yellow;
  let before = held();
  while (g.run.height < 99) {
    g.run.player.keys.yellow = before;
    g.advanceTowerRoom();
  }
  assert.equal(held(), before, "none on floors 2 to 100");
  g.advanceTowerRoom(true);
  assert.equal(g.run.height, 101, "Skip climbs past floor 101");
  assert.ok(held() >= before + 2, "floor 102 gives them");
  assert.equal(g.run.keyFloor, 101, "and the next come 100 floors on from it");
});

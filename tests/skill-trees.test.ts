import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save.ts";
import { Game } from "../src/state.ts";
import { TREES, mapNodes, treeHeight } from "../src/skill-trees.ts";
import { UPGRADES, cost, type UpgradeId } from "../src/config.ts";
import { RESEARCH } from "../src/archives.ts";
test("fresh progression gates Delve, currencies, Courage root, and Legacy", () => {
  const g = new Game(defaults());
  g.save.tower.inspiration = 100;
  g.save.delve.courage = 100;
  g.switchMode("delve");
  assert.equal(g.mode, "tower");
  assert.equal(g.buy("moveSpeed"), false);
  assert.equal(g.buy("delve"), false);
  for (const id of ["handOrdering", "combatStance", "largerHand", "cardHeal", "focus", "delve"] as const) assert.ok(g.buy(id));
  assert.equal(g.save.delve.courage, 100);
  g.switchMode("delve");
  assert.equal(g.mode, "delve");
  assert.equal(g.buy("hp"), false);
  assert.ok(g.buy("moveSpeed"));
  assert.equal(g.save.delve.courage, 99);
  assert.ok(g.buy("hp"));
  assert.equal(g.buy("quality"), false);
  // Movement Speed no longer opens Wayfinding: nothing does yet.
  assert.equal(TREES.find(t => t.id === "wayfinding")!.gate, null);
  assert.equal(g.buy("aiMemory"), false);
  const restored = new Game(decode(JSON.stringify(g.save)));
  assert.equal(restored.save.upgrades.moveSpeed, 1);
  restored.switchMode("delve");
  assert.equal(restored.mode, "delve");
  assert.equal(TREES[1].nodes[0].id, "moveSpeed");
  assert.ok(TREES[0].nodes.every(n => UPGRADES.find(u => u.id === n.id)!.currency === "inspiration"));
  assert.deepEqual(TREES.map(tree => tree.id), ["inspiration", "courage", "wayfinding", "legacy", "wisdom", "renown"]);
  assert.ok(TREES.slice(3).every(tree => tree.nodes.length >= 3));
});
test("Greater Heal, then Recovery, Shroud and Find Potion, come after the Archives, whose research they open", () => {
  const g = new Game(defaults());
  g.save.tower.inspiration = 1000;
  for (const id of ["handOrdering", "combatStance", "largerHand", "cardHeal", "focus"] as const) assert.ok(g.buy(id));
  assert.equal(g.buy("greaterHeal"), false, "the Archives come first");
  assert.ok(g.buy("archives"));
  assert.equal(g.buy("recovery"), false, "Greater Heal comes first");
  let before = g.save.tower.inspiration;
  assert.ok(g.buy("greaterHeal"));
  assert.equal(before - g.save.tower.inspiration, 3);
  before = g.save.tower.inspiration;
  assert.ok(g.buy("recovery"));
  assert.equal(before - g.save.tower.inspiration, 10);
  assert.equal(g.buy("recovery"), false, "one rank");
  before = g.save.tower.inspiration;
  assert.ok(g.buy("findPotion"));
  assert.equal(before - g.save.tower.inspiration, 10);
  const at = (id: string) => TREES[0].nodes.find((n) => n.id === id)!;
  assert.deepEqual([at("greaterHeal").x, at("greaterHeal").y, at("greaterHeal").requires], [86, 106, ["archives"]]);
  assert.deepEqual([at("recovery").x, at("recovery").y, at("recovery").requires], [74, 124, ["greaterHeal"]]);
  assert.deepEqual([at("shroud").x, at("shroud").y, at("shroud").requires], [92, 124, ["greaterHeal"]], "Shroud sits beside Recovery");
  assert.deepEqual([at("findPotion").x, at("findPotion").y, at("findPotion").requires], [74, 142, ["recovery"]], "Find Potion sits below Recovery");
});
test("the hand's skills run to Focus, Gear and Heal off Buildout, Equipment after Focus, and Larger Hand, Buildout and Gear cost 1", () => {
  const at = (id: string) => TREES[0].nodes.find((n) => n.id === id)!;
  assert.deepEqual(["combatStance", "gear", "largerHand", "cardHeal", "focus", "cardGear"].map((id) => at(id).requires),
    [["handOrdering"], ["combatStance"], ["combatStance"], ["combatStance"], ["largerHand"], ["focus"]]);
  assert.deepEqual(["handOrdering", "combatStance", "largerHand", "gear", "focus"].map((id) => cost(id as UpgradeId, 0)), [1, 1, 1, 1, 5]);
  assert.deepEqual(["gear", "cardGear"].map((id) => UPGRADES.find((u) => u.id === id)!.name), ["Gear", "Equipment"]);
  const g = new Game(defaults());
  g.save.tower.inspiration = 100;
  assert.equal(g.buy("cardHeal"), false, "Heal waits for Buildout");
  assert.ok(g.buy("handOrdering") && g.buy("combatStance") && g.buy("cardHeal"));
  assert.equal(g.buy("focus"), false, "Focus waits for Larger Hand");
  assert.ok(g.buy("largerHand"));
  assert.equal(g.buy("cardGear"), false, "Equipment waits for Focus");
  assert.ok(g.buy("focus") && g.buy("cardGear") && g.buy("gear"));
});
test("Training (2) follows Larger Hand, Blue Key (2) the Archives, and Extra Key (1) Movement Speed", () => {
  const node = (id: UpgradeId) => TREES.flatMap((t) => t.nodes.map((n) => ({ ...n, tree: t.id }))).find((n) => n.id === id)!;
  assert.deepEqual(["training", "blueKey", "extraKey"].map((id) => [node(id as UpgradeId).tree, node(id as UpgradeId).requires, cost(id as UpgradeId, 0)]),
    [["inspiration", ["largerHand"], 2], ["inspiration", ["archives"], 2], ["courage", ["moveSpeed"], 1]]);
  assert.equal(UPGRADES.find((u) => u.id === "blueKey")!.card, "blueKey");
  assert.ok(!TREES.some((t) => t.nodes.some((n) => (n.id as string) === "autoPersist")), "Extra Key takes Steadfast wayfinder's place");
});
test("each skill in a tree of unlocks is bought once", () => {
  const unlockTrees = TREES.filter((t) => t.unlocks);
  assert.deepEqual(unlockTrees.map((t) => t.id), ["inspiration"]);
  for (const tree of unlockTrees)
    for (const n of tree.nodes) assert.equal(UPGRADES.find((u) => u.id === n.id)!.max, 1, n.id);
});

test("a tree taller than its view places its nodes on a taller map", () => {
  const inspiration = TREES[0];
  assert.equal(treeHeight(inspiration), 172);
  assert.ok(inspiration.nodes.every((n) => n.y > 0 && n.y < treeHeight(inspiration)), "every node on the map");
  assert.equal(mapNodes(inspiration).find((n) => n.id === "recovery")!.y, (124 * 100) / 172);
  assert.ok(TREES.slice(1).every((t) => treeHeight(t) === 100 && mapNodes(t).every((n, i) => n.y === t.nodes[i].y)), "other trees fit one view");
});
test("older saves retain earned access without unlocking fresh saves", () => {
  const old: any = defaults();
  delete old.upgrades.delve;
  delete old.upgrades.legacy;
  assert.equal(decode(JSON.stringify(old)).upgrades.delve, 0);
  old.upgrades.quality = 2;
  const saved = decode(JSON.stringify(old));
  assert.equal(saved.upgrades.delve, 1);
  assert.equal(saved.upgrades.legacy, 1);
  assert.equal(saved.upgrades.quality, 2);
});
test("Movement Speed opens 1 to 3 steps a second, and each research level one more", () => {
  const g = new Game(defaults());
  g.save.settings.speed = 2;
  assert.equal(g.stepsPerSecond, 3, "unowned, the hand keeps the default speed");
  g.save.upgrades.moveSpeed = 1;
  assert.equal(g.stepsPerSecond, 2);
  g.save.settings.speed = 9;
  assert.equal(g.maxSpeed, 3);
  assert.equal(g.stepsPerSecond, 3, "no faster than research allows");
  g.save.archives.levels.moveSpeed = 4;
  assert.equal(g.stepsPerSecond, 7);
  g.save.archives.levels.moveSpeed = 6;
  assert.equal(g.stepsPerSecond, 9);
  assert.equal(decode(JSON.stringify(g.save)).settings.speed, 9);
  // Priced and timed like Focus Count's first six levels.
  assert.deepEqual(RESEARCH.moveSpeed.levels, RESEARCH.focusCount.levels.slice(0, 6).map((l) => ({ ...l, effect: { ...l.effect, target: "moveSpeed" } })));
  assert.deepEqual(RESEARCH.moveSpeed.requires, [{ upgrade: "moveSpeed" }]);
});
test("Inspiration tree: Heal branches off Buildout, and Larger Hand leads to Focus", () => {
  const node = (id: UpgradeId) => TREES[0].nodes.find((n) => n.id === id)!;
  assert.deepEqual(node("cardHeal").requires, ["combatStance"]);
  assert.deepEqual(node("focus").requires, ["largerHand"]);
  const g = new Game(defaults());
  g.save.tower.inspiration = 100;
  for (const id of ["handOrdering", "combatStance", "largerHand", "focus"] as const) assert.ok(g.buy(id), id);
  assert.ok(!g.save.upgrades.cardHeal);
});
test("Faster Trainers sits beside Blue Key off the Archives, costs 2 and opens its research", () => {
  const node = TREES[0].nodes.find((n) => n.id === "fasterTrainers")!;
  assert.deepEqual([node.x, node.y, node.requires], [62, 106, ["archives"]]);
  assert.equal(cost("fasterTrainers", 0), 2);
  assert.deepEqual(RESEARCH.fasterTrainers.requires, [{ upgrade: "fasterTrainers" }]);
  // No two nodes of a row overlap.
  const rows = new Map<number, number[]>();
  for (const n of TREES[0].nodes) rows.set(n.y, [...(rows.get(n.y) ?? []), n.x]);
  for (const [y, xs] of rows) assert.equal(new Set(xs).size, xs.length, `row ${y}`);
});

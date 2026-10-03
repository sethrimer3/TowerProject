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
  for (const id of ["handOrdering", "combatStance", "largerHand", "archives", "delve"] as const) assert.ok(g.buy(id));
  assert.equal(g.save.delve.courage, 100);
  g.switchMode("delve");
  assert.equal(g.mode, "delve");
  assert.equal(g.buy("pathfinder"), false);
  assert.ok(g.buy("moveSpeed"));
  assert.equal(g.save.delve.courage, 99);
  assert.equal(g.showsRoutes, false, "no route preview before Pathfinder");
  assert.ok(g.buy("pathfinder"));
  assert.equal(g.save.delve.courage, 98, "Pathfinder costs 1 Courage");
  assert.ok(g.showsRoutes);
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
test("Greater Heal, then Recovery, Shroud and Find Potion, come after Into the depths, past the Archives, whose research they open", () => {
  const g = new Game(defaults());
  g.save.tower.inspiration = 1000;
  for (const id of ["handOrdering", "combatStance", "largerHand"] as const) assert.ok(g.buy(id));
  assert.equal(g.buy("greaterHeal"), false, "the Archives come first");
  assert.ok(g.buy("archives"));
  assert.equal(g.buy("greaterHeal"), false, "then Into the depths");
  assert.ok(g.buy("delve"));
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
  assert.deepEqual([at("greaterHeal").x, at("greaterHeal").y, at("greaterHeal").requires], [74, 106, ["delve"]]);
  assert.deepEqual([at("recovery").x, at("recovery").y, at("recovery").requires], [62, 124, ["greaterHeal"]]);
  assert.deepEqual([at("shroud").x, at("shroud").y, at("shroud").requires], [86, 124, ["greaterHeal"]], "Shroud sits beside Recovery");
  assert.deepEqual([at("findPotion").x, at("findPotion").y, at("findPotion").requires], [62, 142, ["recovery"]], "Find Potion sits below Recovery");
});
test("the hand's skills run to the Archives, Gear and Training off Buildout, Equipment after Gear, On the Job then Heal below Training, and Larger Hand, Buildout, Training, On the Job and Gear cost 1", () => {
  const at = (id: string) => TREES[0].nodes.find((n) => n.id === id)!;
  assert.deepEqual(["combatStance", "training", "onTheJob", "cardHeal", "gear", "largerHand", "archives", "cardGear"].map((id) => at(id).requires),
    [["handOrdering"], ["combatStance"], ["training"], ["onTheJob"], ["combatStance"], ["combatStance"], ["largerHand"], ["gear"]]);
  assert.ok(at("training").x > at("combatStance").x && at("training").y === at("combatStance").y, "Training sits right of Buildout");
  assert.ok(at("onTheJob").x === at("training").x && at("onTheJob").y > at("training").y, "On the Job sits below Training");
  assert.ok(at("cardHeal").x === at("onTheJob").x && at("cardHeal").y > at("onTheJob").y, "Heal sits below On the Job");
  assert.ok(at("gear").x < at("combatStance").x && at("gear").y === at("combatStance").y, "Gear sits left of Buildout");
  assert.ok(at("cardGear").x === at("gear").x && at("cardGear").y > at("gear").y, "Equipment sits under Gear");
  assert.deepEqual(["handOrdering", "combatStance", "training", "onTheJob", "largerHand", "gear", "archives"].map((id) => cost(id as UpgradeId, 0)), [1, 1, 1, 1, 1, 1, 5]);
  assert.deepEqual(["gear", "cardGear", "onTheJob"].map((id) => UPGRADES.find((u) => u.id === id)!.name), ["Gear", "Equipment", "On the Job"]);
  const g = new Game(defaults());
  g.save.tower.inspiration = 100;
  assert.ok(g.buy("handOrdering") && g.buy("combatStance"));
  assert.equal(g.buy("onTheJob"), false, "On the Job waits for Training");
  assert.equal(g.buy("cardHeal"), false, "Heal waits for On the Job");
  assert.ok(g.buy("training") && g.buy("onTheJob") && g.buy("cardHeal"));
  assert.equal(g.buy("archives"), false, "the Archives wait for Larger Hand");
  assert.equal(g.buy("cardGear"), false, "Equipment waits for Gear");
  assert.ok(g.buy("gear") && g.buy("cardGear"));
  assert.ok(g.buy("largerHand") && g.buy("archives"));
});
test("Training (1) follows Buildout, Blue Key (2) the Archives, and Extra Key (1) Movement Speed", () => {
  const node = (id: UpgradeId) => TREES.flatMap((t) => t.nodes.map((n) => ({ ...n, tree: t.id }))).find((n) => n.id === id)!;
  assert.deepEqual(["training", "blueKey", "extraKey"].map((id) => [node(id as UpgradeId).tree, node(id as UpgradeId).requires, cost(id as UpgradeId, 0)]),
    [["inspiration", ["combatStance"], 1], ["inspiration", ["archives"], 2], ["courage", ["moveSpeed"], 1]]);
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
test("Inspiration tree: Heal follows On the Job, Larger Hand leads to the Archives (5), and Into the Depths follows them", () => {
  const node = (id: UpgradeId) => TREES[0].nodes.find((n) => n.id === id)!;
  assert.deepEqual(node("cardHeal").requires, ["onTheJob"]);
  assert.deepEqual([node("archives").x, node("archives").y, node("archives").requires], [50, 66, ["largerHand"]]);
  assert.deepEqual([node("delve").x, node("delve").y, node("delve").requires], [50, 88, ["archives"]]);
  assert.deepEqual(node("inspirationUndos").requires, ["archives"]);
  assert.equal(cost("archives", 0), 5);
  const g = new Game(defaults());
  g.save.tower.inspiration = 100;
  for (const id of ["handOrdering", "combatStance", "largerHand", "archives", "delve"] as const) assert.ok(g.buy(id), id);
  assert.ok(!g.save.upgrades.cardHeal);
});
test("Focus (5 Courage) takes Tempered Edge's place in the Courage tree, which is gone", () => {
  const courage = TREES.find((t) => t.id === "courage")!;
  const focus = courage.nodes.find((n) => n.id === "focus")!;
  assert.deepEqual([focus.x, focus.y, focus.requires], [50, 34, ["moveSpeed"]]);
  assert.ok(!TREES[0].nodes.some((n) => n.id === "focus"), "no longer in the Inspiration tree");
  assert.ok(!UPGRADES.some((u) => (u.id as string) === "attack"), "Tempered Edge is gone");
  assert.deepEqual([UPGRADES.find((u) => u.id === "focus")!.currency, cost("focus", 0)], ["courage", 5]);
  assert.deepEqual(courage.nodes.find((n) => n.id === "legacy")!.requires, ["focus", "undos"]);
});
test("Faster Trainers sits right of Into the depths off the Archives, costs 2 and opens its research", () => {
  const at = (id: string) => TREES[0].nodes.find((n) => n.id === id)!;
  const node = at("fasterTrainers");
  assert.deepEqual([node.x, node.y, node.requires], [80, 88, ["archives"]]);
  assert.deepEqual([at("blueKey").x, at("blueKey").y], [20, 66], "Blue Key sits left of the Archives");
  assert.deepEqual([at("spareChange").x, at("spareChange").y, at("spareChange").requires], [26, 106, ["delve"]], "Spare Change follows Into the depths");
  assert.equal(cost("fasterTrainers", 0), 2);
  assert.deepEqual(RESEARCH.fasterTrainers.requires, [{ upgrade: "fasterTrainers" }]);
  // No two nodes of a row overlap.
  const rows = new Map<number, number[]>();
  for (const n of TREES[0].nodes) rows.set(n.y, [...(rows.get(n.y) ?? []), n.x]);
  for (const [y, xs] of rows) assert.equal(new Set(xs).size, xs.length, `row ${y}`);
});

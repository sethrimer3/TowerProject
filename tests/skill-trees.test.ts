import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save.ts";
import { Game } from "../src/state.ts";
import { TREES, columnGap, mapNodes, treeHeight } from "../src/skill-trees.ts";
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
  for (const id of ["combatStance", "buildout", "trainers", "critical", "archives", "delve"] as const) assert.ok(g.buy(id));
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
test("Shroud, then Greater Heal, then Recovery, Regen Research and Find Potion, come after Into the depths, past the Archives, whose research they open", () => {
  const g = new Game(defaults());
  g.save.tower.inspiration = 1000;
  for (const id of ["combatStance", "buildout", "trainers", "critical"] as const) assert.ok(g.buy(id));
  assert.equal(g.buy("shroud"), false, "the Archives come first");
  assert.ok(g.buy("archives"));
  assert.equal(g.buy("shroud"), false, "then Into the depths");
  assert.ok(g.buy("delve"));
  assert.equal(g.buy("greaterHeal"), false, "Shroud comes first");
  let before = g.save.tower.inspiration;
  assert.ok(g.buy("shroud"));
  assert.equal(before - g.save.tower.inspiration, 2);
  assert.equal(g.buy("recovery"), false, "then Greater Heal");
  assert.equal(g.buy("regenResearch"), false, "Greater Heal comes first");
  before = g.save.tower.inspiration;
  assert.ok(g.buy("greaterHeal"));
  assert.equal(before - g.save.tower.inspiration, 3);
  before = g.save.tower.inspiration;
  assert.ok(g.buy("regenResearch"));
  assert.equal(before - g.save.tower.inspiration, 10);
  before = g.save.tower.inspiration;
  assert.ok(g.buy("recovery"));
  assert.equal(before - g.save.tower.inspiration, 10);
  assert.equal(g.buy("recovery"), false, "one rank");
  before = g.save.tower.inspiration;
  assert.ok(g.buy("findPotion"));
  assert.equal(before - g.save.tower.inspiration, 10);
  const at = (id: string) => TREES[0].nodes.find((n) => n.id === id)!;
  assert.deepEqual([at("shroud").x, at("shroud").y, at("shroud").requires], [74, 142, ["delve"]]);
  assert.deepEqual([at("greaterHeal").x, at("greaterHeal").y, at("greaterHeal").requires], [80, 160, ["shroud"]], "Greater Heal sits between Shroud and Recovery and Regen Research");
  assert.deepEqual([at("recovery").x, at("recovery").y, at("recovery").requires], [70, 178, ["greaterHeal"]]);
  assert.deepEqual([at("regenResearch").x, at("regenResearch").y, at("regenResearch").requires], [90, 178, ["greaterHeal"]], "Regen Research sits beside Recovery");
  assert.deepEqual([at("revive").x, at("revive").y, at("revive").requires], [90, 196, ["regenResearch"]], "Revive sits below Regen Research");
  assert.deepEqual([at("findPotion").x, at("findPotion").y, at("findPotion").requires], [70, 196, ["recovery"]], "Find Potion sits below Recovery");
  assert.deepEqual([at("buyQuantity").x, at("buyQuantity").y, at("buyQuantity").requires], [50, 160, ["lifesteal"]], "Buy Quantity sits under Lifesteal");
  assert.deepEqual([at("lifesteal").x, at("lifesteal").y, at("lifesteal").requires], [50, 142, ["delve"]], "Lifesteal sits where Key Siphon did, under Into the depths");
  assert.deepEqual([at("keySiphon").x, at("keySiphon").y, at("keySiphon").requires], [50, 178, ["buyQuantity"]], "Key Siphon sits under Buy Quantity");
  assert.deepEqual(at("cardYellowDoor").requires, ["keySiphon"], "the cards hang from Key Siphon");
});
test("the hand's skills run Buildout, Trainers, Critical to the Archives, Gear and On the Job off Buildout, ATK Up then DEF Up after Gear, Regen then Heal below On the Job, Larger Hand sits by itself to Critical's right, and Buildout, Trainers, On the Job and Gear cost 1 (Critical 2)", () => {
  const at = (id: string) => TREES[0].nodes.find((n) => n.id === id)!;
  assert.deepEqual(["buildout", "trainers", "critical", "archives", "onTheJob", "regen", "cardHeal", "gear", "cardAtkUp", "cardDefUp"].map((id) => at(id).requires),
    [["combatStance"], ["buildout"], ["trainers"], ["critical"], ["buildout"], ["onTheJob"], ["regen"], ["buildout"], ["gear"], ["cardAtkUp"]]);
  assert.deepEqual(["buildout", "trainers", "critical", "archives"].map((id) => [at(id).x, at(id).y]), [[50, 30], [50, 48], [50, 84], [50, 102]], "down the middle, Critical a row lower for room");
  assert.deepEqual([at("largerHand").x, at("largerHand").y, at("largerHand").requires], [80, 84, ["trainers"]], "Larger Hand stands right of Critical, alone");
  assert.deepEqual([at("critPrediction").x, at("critPrediction").y, at("critPrediction").requires], [30, 84, ["critical"]], "Critical Prediction stands left of Critical");
  assert.ok(!TREES[0].nodes.some((n) => n.requires.includes("largerHand")), "nothing waits for Larger Hand");
  assert.ok(at("onTheJob").x > at("buildout").x && at("onTheJob").y === at("buildout").y, "On the Job sits right of Buildout");
  assert.ok(at("regen").x === at("onTheJob").x && at("regen").y > at("onTheJob").y, "Regen sits below On the Job");
  assert.ok(at("cardHeal").x === at("regen").x && at("cardHeal").y > at("regen").y, "Heal sits below Regen");
  assert.ok(at("gear").x < at("buildout").x && at("gear").y === at("buildout").y, "Gear sits left of Buildout");
  assert.ok(at("cardAtkUp").x === at("gear").x && at("cardAtkUp").y > at("gear").y, "ATK Up sits under Gear");
  assert.ok(at("cardDefUp").x === at("cardAtkUp").x && at("cardDefUp").y > at("cardAtkUp").y, "DEF Up sits under ATK Up");
  assert.deepEqual(["cardAtkUp", "cardDefUp"].map((id) => cost(id as UpgradeId, 0)), [5, 5]);
  assert.deepEqual(["combatStance", "buildout", "trainers", "onTheJob", "largerHand", "gear", "critical", "archives"].map((id) => cost(id as UpgradeId, 0)), [1, 1, 1, 1, 1, 1, 2, 5]);
  assert.deepEqual(["gear", "cardAtkUp", "cardDefUp", "onTheJob"].map((id) => UPGRADES.find((u) => u.id === id)!.name), ["Gear", "ATK Up", "DEF Up", "On the Job"]);
  const g = new Game(defaults());
  g.save.tower.inspiration = 100;
  assert.ok(g.buy("combatStance") && g.buy("buildout"));
  assert.equal(g.buy("critical"), false, "Critical waits for Trainers");
  assert.equal(g.buy("largerHand"), false, "Larger Hand waits for Trainers");
  assert.equal(g.buy("cardHeal"), false, "Heal waits for Regen");
  assert.ok(g.buy("onTheJob") && g.buy("regen") && g.buy("cardHeal"), "On the Job needs only Buildout");
  assert.equal(g.buy("archives"), false, "the Archives wait for Critical");
  assert.equal(g.buy("cardAtkUp"), false, "ATK Up waits for Gear");
  assert.equal(g.buy("cardDefUp"), false, "DEF Up waits for ATK Up");
  assert.ok(g.buy("gear") && g.buy("cardAtkUp") && g.buy("cardDefUp"));
  assert.ok(g.buy("trainers") && g.buy("critical") && g.buy("archives") && g.buy("largerHand"));
});
test("Trainers (1) follows Buildout, Blue Key (2) the Archives, and Extra Key (1) Movement Speed", () => {
  const node = (id: UpgradeId) => TREES.flatMap((t) => t.nodes.map((n) => ({ ...n, tree: t.id }))).find((n) => n.id === id)!;
  assert.deepEqual(["trainers", "cardBlueKey", "extraKey"].map((id) => [node(id as UpgradeId).tree, node(id as UpgradeId).requires, cost(id as UpgradeId, 0)]),
    [["inspiration", ["buildout"], 1], ["inspiration", ["archives"], 2], ["courage", ["moveSpeed"], 1]]);
  assert.equal(UPGRADES.find((u) => u.id === "cardBlueKey")!.card, "blueKey");
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
  assert.equal(treeHeight(inspiration), 316);
  assert.ok(inspiration.nodes.every((n) => n.y > 0 && n.y < treeHeight(inspiration)), "every node on the map");
  assert.equal(mapNodes(inspiration).find((n) => n.id === "recovery")!.y, (178 * 100) / 316);
  assert.equal(treeHeight(TREES.find((t) => t.id === "courage")!), 198);
  assert.ok(TREES.slice(2).every((t) => treeHeight(t) === 100 && mapNodes(t).every((n, i) => n.y === t.nodes[i].y)), "other trees fit one view");
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
test("Movement Speed research lets the run's arrows go one step a second faster a level", () => {
  const g = new Game(defaults());
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
test("Inspiration tree: Heal follows Regen, Critical leads to the Archives (5), and Into the Depths follows them", () => {
  const node = (id: UpgradeId) => TREES[0].nodes.find((n) => n.id === id)!;
  assert.deepEqual(node("cardHeal").requires, ["regen"]);
  assert.deepEqual([node("archives").x, node("archives").y, node("archives").requires], [50, 102, ["critical"]]);
  assert.deepEqual([node("delve").x, node("delve").y, node("delve").requires], [50, 124, ["archives"]]);
  assert.deepEqual(node("inspirationUndos").requires, ["archives"]);
  assert.equal(cost("archives", 0), 5);
  const g = new Game(defaults());
  g.save.tower.inspiration = 100;
  for (const id of ["combatStance", "buildout", "trainers", "critical", "archives", "delve"] as const) assert.ok(g.buy(id), id);
  assert.ok(!g.save.upgrades.cardHeal);
});
test("Focus (5 Courage) takes Tempered Edge's place in the Courage tree, which is gone", () => {
  const courage = TREES.find((t) => t.id === "courage")!;
  const focus = courage.nodes.find((n) => n.id === "focus")!;
  assert.deepEqual([focus.x, focus.y, focus.requires], [50, 34, ["moveSpeed"]]);
  assert.ok(!TREES[0].nodes.some((n) => n.id === "focus"), "no longer in the Inspiration tree");
  assert.ok(!UPGRADES.some((u) => (u.id as string) === "attack"), "Tempered Edge is gone");
  assert.deepEqual([UPGRADES.find((u) => u.id === "focus")!.currency, cost("focus", 0)], ["courage", 5]);
});
test("Echoes of time leads nowhere; the research skills (10 Courage each) take An enduring legacy's place under Focus", () => {
  const courage = TREES.find((t) => t.id === "courage")!;
  const at = (id: string) => courage.nodes.find((n) => n.id === id)!;
  assert.ok(!courage.nodes.some((n) => n.requires.includes("undos")), "nothing below Echoes of time");
  assert.ok(!TREES.some((t) => t.nodes.some((n) => n.id === "legacy")), "An enduring legacy is no node");
  assert.deepEqual([at("findYellowKey").x, at("findYellowKey").y, at("findYellowKey").requires], [50, 87, ["focus"]]);
  assert.deepEqual(at("keyEfficiency").requires, ["findYellowKey"]);
  assert.deepEqual(at("interest").requires, ["keyEfficiency"]);
  assert.deepEqual([at("maxInterest").x < at("interest").x, at("maxInterest").requires], [true, ["interest"]]);
  assert.deepEqual([at("mug").x > at("interest").x, at("mug").requires], [true, ["interest"]]);
  for (const id of ["findYellowKey", "keyEfficiency", "interest", "maxInterest", "mug"] as const) {
    const row = UPGRADES.find((u) => u.id === id)!;
    assert.deepEqual([row.currency, row.max, cost(id, 0)], ["courage", 1, 10], id);
  }
  assert.deepEqual([UPGRADES.find((u) => u.id === "undos")!.max, cost("undos", 0)], [1, 5]);
});
test("Faster Trainers sits right of Into the depths off the Archives, costs 2 and opens its research", () => {
  const at = (id: string) => TREES[0].nodes.find((n) => n.id === id)!;
  const node = at("fasterTrainers");
  assert.deepEqual([node.x, node.y, node.requires], [80, 124, ["archives"]]);
  assert.deepEqual([at("cardBlueKey").x, at("cardBlueKey").y], [20, 102], "Blue Key sits below DEF Up");
  assert.deepEqual([at("pocketMoney").x, at("pocketMoney").y, at("pocketMoney").requires], [20, 142, ["delve"]], "Pocket Money follows Into the depths");
  assert.deepEqual([at("spareChange").x, at("spareChange").y, at("spareChange").requires], [20, 160, ["pocketMoney"]], "Spare Change follows Pocket Money");
  assert.equal(cost("fasterTrainers", 0), 2);
  assert.deepEqual(RESEARCH.fasterTrainers.requires, [{ upgrade: "fasterTrainers" }]);
  // No two nodes of a row overlap.
  const rows = new Map<number, number[]>();
  for (const n of TREES[0].nodes) rows.set(n.y, [...(rows.get(n.y) ?? []), n.x]);
  for (const [y, xs] of rows) assert.equal(new Set(xs).size, xs.length, `row ${y}`);
});
test("a run that earned Inspiration puts a dot on the Inspiration tab in the forest while a skill there can be bought", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true, seed: 1 });
  assert.ok(g.enterRun());
  g.finish("Ascent ended");
  assert.equal(g.save.treeNotices.inspiration, false, "a run that earned none");
  assert.ok(g.enterRun());
  g.save.tower.runCurrency = 1;
  g.save.tower.inspiration = 1;
  assert.equal(g.treeWaiting("inspiration"), false, "not inside a run");
  g.finish("Ascent ended");
  assert.deepEqual(g.save.treeNotices, { inspiration: true, courage: false });
  assert.ok(g.run.outside && g.treeWaiting("inspiration"), "Combat Stance costs 1");
  g.save.tower.inspiration = 0;
  assert.equal(g.treeWaiting("inspiration"), false, "nothing affordable");
  g.save.tower.inspiration = 1;
  assert.ok(g.buy("combatStance"));
  assert.equal(g.treeWaiting("inspiration"), false, "spent");
  assert.ok(decode(JSON.stringify(g.save)).treeNotices.inspiration, "kept until the tree is shown");
});
test("a Delve run that earned Courage puts a dot on the Courage tab in the forest once the tree is open and a skill there can be bought", () => {
  const g = new Game(defaults());
  g.save.upgrades.delve = 1;
  g.switchMode("delve");
  g.newRun({ outside: true, seed: 2 });
  assert.ok(g.enterRun());
  g.save.delve.runCurrency = 3;
  g.save.delve.courage = 1;
  assert.equal(g.treeWaiting("courage"), false, "not inside a run");
  g.finish("Delve run ended");
  assert.deepEqual(g.save.treeNotices, { inspiration: false, courage: true });
  assert.ok(g.run.outside && g.treeWaiting("courage"), "Movement Speed costs 1");
  g.save.delve.courage = 0;
  assert.equal(g.treeWaiting("courage"), false, "nothing affordable");
  g.save.delve.courage = 1;
  g.save.upgrades.delve = 0;
  assert.equal(g.treeWaiting("courage"), false, "the tree is locked");
  g.save.upgrades.delve = 1;
  assert.ok(g.buy("moveSpeed"));
  assert.equal(g.treeWaiting("courage"), false, "spent");
  assert.ok(decode(JSON.stringify(g.save)).treeNotices.courage, "kept until the tree is shown");
});

test("a tree's column gap is the least distance across between two nodes in one row", () => {
  const tree = (id: string) => TREES.find(t => t.id === id)!;
  assert.equal(columnGap(tree("inspiration")), 20, "its five-across rows");
  assert.equal(columnGap(tree("courage")), 28);
  assert.equal(columnGap({ ...tree("courage"), nodes: [tree("courage").nodes[0]] }), 100, "no row holds two");
});

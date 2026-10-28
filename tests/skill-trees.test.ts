import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import { TREES, columnGap, mapNodes, skillAvailable, skillHidden, treeHeight } from "../src/progression/skill-trees.ts";
import { LIMIT_BREAKS, TRAINING } from "../src/progression/training.ts";
import { UPGRADES, cost, type UpgradeId } from "../src/progression/upgrades.ts";
import { RESEARCH } from "../src/progression/archives.ts";
import { GOLD_SHOP } from "../src/economy/provisions.ts";
import { provisionOpen } from "../src/progression/loadout.ts";
test("fresh progression gates Delve, currencies, Breakthrough root, and Legacy", () => {
  const g = new Game(defaults());
  g.save.tower.inspiration = 100;
  g.save.breakthrough = 100;
  assert.equal(g.canSwapForest, false, "the Delve waits on a tournament");
  assert.equal(g.skills.buy("moveSpeed"), false);
  assert.equal(g.skills.buy("breakthrough"), false);
  for (const id of ["cardDoorKey", "cardEnemy", "autoClimb", "combatStance", "buildout", "trainers", "largerHand", "shroud", "critical", "breakthrough"] as const) assert.ok(g.skills.buy(id));
  assert.equal(g.save.breakthrough, 100);
  g.switchMode("delve");
  assert.equal(g.mode, "delve");
  assert.equal(g.skills.buy("moveSpeed"), false, "Quest for Knowledge comes first");
  assert.ok(g.skills.buy("questForKnowledge"));
  assert.equal(g.save.breakthrough, 99, "Quest for Knowledge costs 1 Breakthrough");
  assert.equal(g.skills.buy("pathToWealth"), false);
  assert.ok(g.skills.buy("moveSpeed"));
  assert.equal(g.save.breakthrough, 98);
  assert.ok(g.skills.buy("pathToWealth"));
  assert.equal(g.save.breakthrough, 97, "Path to Wealth costs 1 Breakthrough");
  assert.ok(g.skills.buy("physician"));
  assert.equal(g.save.breakthrough, 96, "Physician costs 1 Breakthrough");
  assert.equal(g.skills.buy("quality"), false);
  // Movement Speed no longer opens Wayfinding: nothing does yet.
  assert.equal(TREES.find(t => t.id === "wayfinding")!.gate, null);
  assert.equal(g.skills.buy("aiMemory"), false);
  const restored = new Game(decode(JSON.stringify(g.save)));
  assert.equal(restored.save.upgrades.moveSpeed, 1);
  restored.switchMode("delve");
  assert.equal(restored.mode, "delve");
  assert.deepEqual(TREES[1].nodes.slice(0, 2).map((n) => [n.id, n.x, n.y, n.requires]), [["questForKnowledge", 50, 10, ["breakthrough"]], ["moveSpeed", 50, 34, ["questForKnowledge"]]], "Movement Speed under Quest for Knowledge");
  assert.deepEqual(TREES[0].nodes.filter(n => UPGRADES.find(u => u.id === n.id)!.currency !== "inspiration").map(n => n.id), ["interest", "maxInterest", "mug", "findYellowKey", "keyEfficiency"], "Breakthrough points pay only for the research skills moved here");
  assert.deepEqual(TREES.map(tree => tree.id), ["inspiration", "breakthrough", "wayfinding", "legacy", "wisdom", "renown"]);
  assert.ok(TREES.slice(3).every(tree => tree.nodes.length >= 3));
});
test("Shroud follows Trainers and Larger Hand, ahead of Critical; Greater Heal, then Recovery, Regen Research and Find Potion, come after Breakthrough and the Archives, whose research they open", () => {
  const g = new Game(defaults());
  g.save.tower.inspiration = 1000;
  g.save.upgrades.questForKnowledge = 1;
  for (const id of ["cardDoorKey", "cardEnemy", "autoClimb", "combatStance", "buildout"] as const) assert.ok(g.skills.buy(id));
  assert.equal(g.skills.buy("shroud"), false, "Trainers come first");
  assert.ok(g.skills.buy("trainers"));
  assert.equal(g.skills.buy("shroud"), false, "then Larger Hand");
  assert.ok(g.skills.buy("largerHand"));
  assert.equal(g.skills.buy("critical"), false, "Critical waits for Shroud");
  let before = g.save.tower.inspiration;
  assert.ok(g.skills.buy("shroud"));
  assert.equal(before - g.save.tower.inspiration, 2);
  assert.ok(g.skills.buy("critical") && g.skills.buy("breakthrough"));
  assert.equal(g.skills.buy("greaterHeal"), false, "the Archives come first");
  assert.ok(g.skills.buy("archives"));
  assert.equal(g.skills.buy("greaterHeal"), false, "then Physician reveals it");
  g.save.upgrades.physician = 1;
  assert.equal(g.skills.buy("recovery"), false, "then Greater Heal");
  assert.equal(g.skills.buy("regenResearch"), false, "Greater Heal comes first");
  before = g.save.tower.inspiration;
  assert.ok(g.skills.buy("greaterHeal"));
  assert.equal(before - g.save.tower.inspiration, 3);
  before = g.save.tower.inspiration;
  assert.ok(g.skills.buy("regenResearch"));
  assert.equal(before - g.save.tower.inspiration, 10);
  before = g.save.tower.inspiration;
  assert.ok(g.skills.buy("recovery"));
  assert.equal(before - g.save.tower.inspiration, 10);
  assert.equal(g.skills.buy("recovery"), false, "one rank");
  before = g.save.tower.inspiration;
  assert.ok(g.skills.buy("findPotion"));
  assert.equal(before - g.save.tower.inspiration, 10);
  const at = (id: string) => TREES[0].nodes.find((n) => n.id === id)!;
  assert.deepEqual([at("shroud").x, at("shroud").y, at("shroud").requires], [50, 138, ["largerHand"]], "Shroud sits between Larger Hand and Critical");
  assert.deepEqual([at("critical").y, at("critical").requires], [156, ["shroud"]]);
  assert.deepEqual([at("greaterHeal").x, at("greaterHeal").y, at("greaterHeal").requires], [80, 214, ["archives"]], "Greater Heal sits a row under the Archives, above Recovery and Regen Research");
  assert.deepEqual([at("recovery").x, at("recovery").y, at("recovery").requires], [70, 232, ["greaterHeal"]]);
  assert.deepEqual([at("regenResearch").x, at("regenResearch").y, at("regenResearch").requires], [90, 232, ["greaterHeal"]], "Regen Research sits beside Recovery");
  assert.deepEqual([at("parry").x, at("parry").y, at("parry").requires], [90, 250, ["regenResearch"]], "Parry sits below Regen Research");
  assert.deepEqual([at("revive").x, at("revive").y, at("revive").requires], [90, 268, ["parry"]], "Revive sits below Parry");
  assert.deepEqual([at("findPotion").x, at("findPotion").y, at("findPotion").requires], [70, 250, ["recovery"]], "Find Potion sits below Recovery");
  assert.deepEqual([at("buyQuantity").x, at("buyQuantity").y, at("buyQuantity").requires], [50, 232, ["lifesteal"]], "Buy Quantity sits under Lifesteal");
  assert.deepEqual([at("lifesteal").x, at("lifesteal").y, at("lifesteal").requires], [50, 214, ["archives"]], "Lifesteal sits under the Archives");
  assert.deepEqual([at("thorns").x, at("thorns").y, at("thorns").requires], [50, 358, ["buyQuantity"]], "Thorns sits under Buy Quantity, beside Torch and Floor Skip Reward");
  assert.deepEqual([at("findYellowKey").x, at("findYellowKey").y, at("findYellowKey").requires, at("findYellowKey").reveal], [50, 376, ["thorns"], "keyMastery"], "Find Gold Key sits under Thorns, revealed by Key Mastery");
  assert.deepEqual([at("keyEfficiency").y, at("keyEfficiency").requires], [394, ["findYellowKey"]], "Key Efficiency sits under Find Gold Key");
  assert.deepEqual([at("keySiphon").x, at("keySiphon").y, at("keySiphon").requires], [50, 412, ["keyEfficiency"]], "GK Siphon sits under Key Efficiency");
  assert.deepEqual([at("cardYellowDoor").y, at("cardYellowDoor").requires], [484, ["keySiphon"]], "the door cards hang from GK Siphon");
  for (const [id, x, reveal] of [["blueSiphon", 30, "cardMastery"], ["findYellowKey", 50, "keyMastery"], ["cardWeakEnemy", 70, "beastMastery"]] as const)
    assert.deepEqual([at(id).x, at(id).y, at(id).requires, at(id).reveal], [x, 376, ["thorns"], reveal], `${id} under Thorns, revealed by ${reveal}`);
});
test("the hand's skills run Buildout, Trainers, Larger Hand, Shroud, Critical to Breakthrough, then the Archives with Gold Key then Blue Key left of them, ATK Up off Trainers then DEF Up under it with their provisions to their left, On the Job off Trainers with Regen below it and Heal and the elixir under that, and Buildout, Trainers and On the Job cost 1 (Critical 2)", () => {
  const at = (id: string) => TREES[0].nodes.find((n) => n.id === id)!;
  assert.deepEqual(["buildout", "trainers", "largerHand", "shroud", "critical", "breakthrough", "archives", "onTheJob", "regen", "cardHeal", "elixirProvision", "cardYellowKey", "cardBlueKey", "cardAtkUp", "whetstoneProvision", "cardDefUp", "aegisProvision"].map((id) => at(id).requires),
    [["combatStance"], ["buildout"], ["trainers"], ["largerHand"], ["shroud"], ["critical"], ["breakthrough"], ["trainers"], ["onTheJob"], ["regen"], ["regen"], ["archives"], ["cardYellowKey"], ["trainers"], ["cardAtkUp"], ["cardAtkUp"], ["cardDefUp"]]);
  assert.deepEqual(["cardYellowKey", "cardBlueKey", "cardAtkUp", "whetstoneProvision", "cardDefUp", "aegisProvision"].map((id) => [at(id).x, at(id).y]), [[30, 196], [10, 196], [30, 102], [10, 102], [30, 120], [10, 120]], "Gold Key left of the Archives and Blue Key left of it, ATK Up left of Trainers and DEF Up under it, each provision to its left");
  assert.deepEqual(["onTheJob", "regen", "cardHeal", "elixirProvision"].map((id) => [at(id).x, at(id).y]), [[80, 102], [80, 120], [70, 138], [90, 138]], "On the Job right of Trainers, Regen under it, Heal and the elixir either side under Regen");
  assert.deepEqual(["buildout", "trainers", "largerHand", "shroud", "critical", "breakthrough", "archives"].map((id) => [at(id).x, at(id).y]), [[50, 84], [50, 102], [50, 120], [50, 138], [50, 156], [50, 174], [50, 196]], "down the middle, Larger Hand between Trainers and Shroud");
  assert.deepEqual([at("critPrediction").x, at("critPrediction").y, at("critPrediction").requires], [30, 156, ["critical"]], "Critical Prediction stands left of Critical");
  assert.ok(at("onTheJob").x > at("trainers").x && at("onTheJob").y === at("trainers").y, "On the Job sits right of Trainers");
  assert.ok(at("regen").x === at("onTheJob").x && at("regen").y > at("onTheJob").y, "Regen sits below On the Job");
  assert.ok(at("cardYellowKey").x < at("archives").x && at("cardYellowKey").y === at("archives").y, "Gold Key sits left of the Archives");
  assert.equal(at("cardYellowKey").reveal, "archives", "the Archives reveal Gold Key");
  assert.ok(at("cardAtkUp").x < at("trainers").x && at("cardAtkUp").y === at("trainers").y, "ATK Up sits left of Trainers");
  assert.ok(at("cardDefUp").x === at("cardAtkUp").x && at("cardDefUp").y > at("cardAtkUp").y, "DEF Up sits under ATK Up");
  assert.deepEqual(["cardYellowKey", "cardAtkUp", "cardDefUp"].map((id) => cost(id as UpgradeId, 0)), [3, 5, 5]);
  assert.deepEqual(at("combatStance").requires, ["autoClimb"], "Combat Stance follows the first skills");
  assert.deepEqual(["combatStance", "buildout", "trainers", "onTheJob", "largerHand", "critical", "archives"].map((id) => cost(id as UpgradeId, 0)), [1, 1, 1, 1, 1, 2, 5]);
  assert.deepEqual(["cardAtkUp", "cardDefUp", "onTheJob"].map((id) => UPGRADES.find((u) => u.id === id)!.name), ["ATK Up", "DEF Up", "On the Job"]);
  const g = new Game(defaults());
  g.save.tower.inspiration = 100;
  for (const id of ["cardDoorKey", "cardEnemy", "autoClimb"] as const) assert.ok(g.skills.buy(id));
  assert.ok(g.skills.buy("combatStance") && g.skills.buy("buildout"));
  assert.equal(g.skills.buy("critical"), false, "Critical waits for Trainers and Shroud");
  assert.equal(g.skills.buy("largerHand"), false, "Larger Hand waits for Trainers");
  assert.equal(g.skills.buy("cardHeal"), false, "Heal waits for Regen");
  assert.equal(g.skills.buy("onTheJob"), false, "On the Job waits for Trainers");
  assert.equal(g.skills.buy("breakthrough"), false, "Breakthrough waits for Critical");
  assert.equal(g.skills.buy("cardDefUp"), false, "DEF Up waits for ATK Up");
  assert.equal(g.skills.buy("cardAtkUp"), false, "ATK Up waits for Trainers");
  assert.equal(g.skills.buy("whetstoneProvision"), false, "the Whetstone waits for ATK Up");
  assert.ok(g.skills.buy("trainers") && g.skills.buy("cardAtkUp") && g.skills.buy("cardDefUp"));
  assert.ok(g.skills.buy("onTheJob") && g.skills.buy("regen") && g.skills.buy("cardHeal"), "On the Job needs only Trainers");
  assert.ok(g.skills.buy("elixirProvision") && g.skills.buy("whetstoneProvision") && g.skills.buy("aegisProvision"));
  assert.ok(g.skills.buy("largerHand") && g.skills.buy("shroud") && g.skills.buy("critical") && g.skills.buy("breakthrough"));
  assert.equal(g.skills.buy("archives"), false, "the Archives stay hidden until Quest for Knowledge");
  assert.equal(g.skills.buy("cardYellowKey"), false, "Gold Key waits for the Archives");
  g.save.upgrades.questForKnowledge = 1;
  assert.ok(g.skills.buy("archives"));
  assert.equal(g.skills.buy("cardBlueKey"), false, "Blue Key waits for Gold Key");
  assert.ok(g.skills.buy("cardYellowKey") && g.skills.buy("cardBlueKey"));
});
test("Trainers (1) follows Buildout, Blue Key (5) Gold Key, and Extra Key (1) Movement Speed", () => {
  const node = (id: UpgradeId) => TREES.flatMap((t) => t.nodes.map((n) => ({ ...n, tree: t.id }))).find((n) => n.id === id)!;
  assert.deepEqual(["trainers", "cardBlueKey", "extraKey"].map((id) => [node(id as UpgradeId).tree, node(id as UpgradeId).requires, cost(id as UpgradeId, 0)]),
    [["inspiration", ["buildout"], 1], ["inspiration", ["cardYellowKey"], 5], ["breakthrough", ["moveSpeed"], 1]]);
  assert.equal(UPGRADES.find((u) => u.id === "cardBlueKey")!.card, "blueKey");
  assert.ok(!TREES.some((t) => t.nodes.some((n) => (n.id as string) === "autoPersist")), "Extra Key takes Steadfast wayfinder's place");
});
test("each skill in a tree of unlocks is bought once", () => {
  const unlockTrees = TREES.filter((t) => t.unlocks);
  assert.deepEqual(unlockTrees.map((t) => t.id), ["inspiration", "breakthrough"]);
  for (const tree of unlockTrees)
    for (const n of tree.nodes) assert.equal(UPGRADES.find((u) => u.id === n.id)!.max, 1, n.id);
});

test("a tree taller than its view places its nodes on a taller map", () => {
  const inspiration = TREES[0];
  assert.equal(treeHeight(inspiration), 498);
  assert.ok(inspiration.nodes.every((n) => n.y > 0 && n.y < treeHeight(inspiration)), "every node on the map");
  assert.equal(mapNodes(inspiration).find((n) => n.id === "recovery")!.y, (232 * 100) / 498);
  assert.equal(treeHeight(TREES.find((t) => t.id === "breakthrough")!), 440);
  assert.ok(TREES.slice(2).every((t) => treeHeight(t) === 100 && mapNodes(t).every((n, i) => n.y === t.nodes[i].y)), "other trees fit one view");
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
  // Priced and timed like Undo Count's first six levels.
  assert.deepEqual(RESEARCH.moveSpeed.levels, RESEARCH.undoCount.levels.slice(0, 6).map((l) => ({ ...l, effect: { ...l.effect, target: "moveSpeed" } })));
  assert.deepEqual(RESEARCH.moveSpeed.requires, [{ upgrade: "moveSpeed" }]);
});
test("Inspiration tree: Heal follows Regen, Critical leads to Breakthrough, and the Archives (5) follow it", () => {
  const node = (id: UpgradeId) => TREES[0].nodes.find((n) => n.id === id)!;
  assert.deepEqual(node("cardHeal").requires, ["regen"]);
  assert.deepEqual([node("breakthrough").x, node("breakthrough").y, node("breakthrough").requires], [50, 174, ["critical"]]);
  assert.deepEqual([node("archives").x, node("archives").y, node("archives").requires, node("archives").reveal], [50, 196, ["breakthrough"], "questForKnowledge"]);
  assert.equal(cost("archives", 0), 5);
  const g = new Game(defaults());
  g.save.tower.inspiration = 100;
  for (const id of ["cardDoorKey", "cardEnemy", "autoClimb", "combatStance", "buildout", "trainers", "largerHand", "shroud", "critical", "breakthrough"] as const) assert.ok(g.skills.buy(id), id);
  g.save.upgrades.questForKnowledge = 1;
  assert.ok(g.skills.buy("archives"));
  assert.ok(!g.save.upgrades.cardHeal);
});

test("the Archives and everything under them stay hidden, unbuyable, until Quest for Knowledge (1 Breakthrough) reveals them", () => {
  const upgrades = { ...defaults().upgrades, trainers: 1 };
  const below = new Set<UpgradeId>(["archives"]);
  for (let grew = true; grew;) {
    grew = false;
    for (const n of TREES[0].nodes) if (!below.has(n.id) && n.requires.some((r) => below.has(r))) { below.add(n.id); grew = true; }
  }
  assert.ok(["pocketMoney", "lifesteal", "greaterHeal", "keySiphon", "cardRedKey"].every((id) => below.has(id as UpgradeId)));
  for (const n of TREES[0].nodes) assert.equal(skillHidden(n.id, upgrades), below.has(n.id), n.id);
  for (const n of TREES[0].nodes) for (const r of n.requires) upgrades[r] = 1;
  for (const id of below) upgrades[id] = 0;
  assert.ok([...below].every((id) => !skillAvailable(id, upgrades)), "hidden, whatever is owned");
  upgrades.questForKnowledge = upgrades.pathToWealth = upgrades.physician = upgrades.keyMastery = upgrades.moreWealth = upgrades.cardMastery = upgrades.beastMastery = 1;
  assert.deepEqual(TREES[0].nodes.filter((n) => skillHidden(n.id, upgrades)).map((n) => n.id), ["cardYellowKey", "cardBlueKey"], "all revealed but Gold Key and Blue Key, which the Archives reveal");
  assert.ok(skillAvailable("archives", upgrades));
  upgrades.archives = 1;
  assert.ok(TREES[0].nodes.every((n) => !skillHidden(n.id, upgrades)), "all revealed");
  const quest = UPGRADES.find((u) => u.id === "questForKnowledge")!;
  assert.deepEqual([quest.name, quest.description, quest.currency, cost("questForKnowledge", 0)], ["Quest for Knowledge", "Discover hidden archives to research new skills", "breakthrough", 1]);
});

test("a new game's Inspiration tree shows its first skills down to Trainers, and Trainers reveals the paths after it", () => {
  const upgrades = { ...defaults().upgrades }, first = ["cardDoorKey", "cardEnemy", "autoClimb", "combatStance", "buildout", "trainers"];
  assert.deepEqual(TREES[0].nodes.filter((n) => !skillHidden(n.id, upgrades)).map((n) => n.id), first);
  assert.deepEqual(TREES[0].nodes.filter((n) => n.reveal === "trainers").map((n) => n.id), ["largerHand", "onTheJob", "cardAtkUp"], "the skills straight after Trainers");
  for (const id of first) upgrades[id as UpgradeId] = 1;
  for (const id of ["largerHand", "onTheJob", "cardAtkUp", "shroud", "regen", "cardDefUp", "breakthrough"] as const) assert.ok(!skillHidden(id, upgrades), `${id} revealed`);
  assert.ok(skillHidden("archives", upgrades), "the Archives still wait on Quest for Knowledge");
  assert.ok(skillAvailable("largerHand", upgrades));
});
test("Bombs (5 Inspiration) stands left of Critical Prediction in the Inspiration tree, Focus and Refocus are gone, and it opens the Bomb provision", () => {
  const bombs = TREES[0].nodes.find((n) => n.id === "bombs")!;
  assert.deepEqual([bombs.x, bombs.y, bombs.requires], [10, 156, ["critPrediction"]]);
  assert.ok(!TREES.find((t) => t.id === "breakthrough")!.nodes.some((n) => n.id === "bombs"), "no longer in the Breakthrough tree");
  assert.ok(!TREES.some((t) => t.nodes.some((n) => ["focus", "refocus"].includes(n.id))), "Focus and Refocus are gone");
  assert.ok(!UPGRADES.some((u) => ["attack", "focus", "refocus"].includes(u.id)), "Tempered Edge, Focus and Refocus are gone");
  assert.deepEqual([UPGRADES.find((u) => u.id === "bombs")!.currency, cost("bombs", 0)], ["inspiration", 5]);
  assert.equal(GOLD_SHOP.find((p) => p.id === "bomb")!.requires, "bombs");
  const save = defaults();
  assert.equal(provisionOpen(save, "bomb"), false, "no Bombs on sale before the skill");
  save.upgrades.bombs = 1;
  assert.ok(provisionOpen(save, "bomb"));
});
test("Manual Hand (1 Breakthrough) follows Echoes of time under More Wealth; Key Mastery (1) under Overheal under Physician reveals Find Gold Key and Key Efficiency, now in the Inspiration tree (10 each), and Card and Beast Mastery split off under it", () => {
  const breakthrough = TREES.find((t) => t.id === "breakthrough")!;
  const at = (id: string) => breakthrough.nodes.find((n) => n.id === id)!;
  assert.deepEqual(["inspirationUndos", "undos", "manualHand"].map((id) => [at(id).x, at(id).y, at(id).requires]), [[18, 111, ["moreWealth"]], [18, 137, ["inspirationUndos"]], [18, 163, ["undos"]]], "Rehearsed steps, Echoes of time and Manual Hand straight down under More Wealth");
  assert.deepEqual([at("moreWealth").x, at("moreWealth").y, at("moreWealth").requires], [18, 85, ["pathToWealth"]], "More Wealth under Path to Wealth");
  assert.deepEqual([at("overheal").x, at("overheal").y, at("overheal").requires], [50, 85, ["physician"]], "Overheal between Physician and Key Mastery");
  assert.deepEqual([at("keyMastery").x, at("keyMastery").y, at("keyMastery").requires], [50, 111, ["overheal"]]);
  assert.ok(["cardMastery", "beastMastery"].every((id) => at(id).y > at("keyMastery").y && at(id).requires.join() === "keyMastery"), "the Masteries split off under Key Mastery");
  assert.ok(at("cardBadges").x > 56 && at("cardBadges").y > 85, "Badges moved down and right");
  const inspiration = (id: string) => TREES[0].nodes.find((n) => n.id === id)!;
  assert.deepEqual([inspiration("interest").x, inspiration("interest").y, inspiration("interest").requires, inspiration("interest").reveal], [20, 304, ["freeTraining"], "moreWealth"], "Interest under Free Training, revealed by More Wealth");
  assert.deepEqual(["maxInterest", "mug", "cardChest"].map((id) => [inspiration(id).x, inspiration(id).y, inspiration(id).requires]), [[10, 322, ["interest"]], [30, 322, ["interest"]], [20, 340, ["interest"]]], "Max Interest and Mug either side under Interest, Chest two rows under it");
  assert.deepEqual(["cardTorch", "floorSkipReward"].map((id) => [inspiration(id).y, inspiration(id).requires]), [[358, ["cardChest"]], [358, ["cardChest"]]], "Torch and Floor Skip Reward under Chest");
  assert.ok(!breakthrough.nodes.some((n) => ["findYellowKey", "keyEfficiency", "interest", "maxInterest", "mug"].includes(n.id)), "moved to the Inspiration tree");
  assert.ok(!TREES.some((t) => t.nodes.some((n) => n.id === "legacy")), "An enduring legacy is no node");
  for (const id of ["keyMastery", "manualHand", "moreWealth", "cardMastery", "beastMastery"] as const) assert.deepEqual([UPGRADES.find((u) => u.id === id)!.currency, cost(id, 0)], ["breakthrough", 1], id);
  for (const id of ["findYellowKey", "keyEfficiency", "interest", "maxInterest", "mug"] as const) {
    const row = UPGRADES.find((u) => u.id === id)!;
    assert.deepEqual([row.currency, row.max, cost(id, 0)], ["breakthrough", 1, 10], id);
  }
  assert.deepEqual([UPGRADES.find((u) => u.id === "undos")!.max, cost("undos", 0)], [1, 5]);
  const upgrades = { ...defaults().upgrades, trainers: 1, questForKnowledge: 1, pathToWealth: 1, physician: 1 };
  for (const id of ["findYellowKey", "keyEfficiency", "keySiphon", "cardYellowDoor"] as const) assert.ok(skillHidden(id, upgrades), `${id} hidden`);
  upgrades.keyMastery = 1;
  for (const id of ["findYellowKey", "keyEfficiency", "keySiphon", "cardYellowDoor"] as const) assert.ok(!skillHidden(id, upgrades), `${id} revealed`);
});
test("Faster Trainers sits right of Critical, off it, costs 2 and opens its research", () => {
  const at = (id: string) => TREES[0].nodes.find((n) => n.id === id)!;
  const node = at("fasterTrainers");
  assert.deepEqual([node.x, node.y, node.requires], [70, 156, ["critical"]]);
  assert.deepEqual([at("pocketMoney").x, at("pocketMoney").y, at("pocketMoney").requires], [20, 214, ["archives"]], "Pocket Money follows the Archives");
  assert.deepEqual([at("spareChange").x, at("spareChange").y, at("spareChange").requires], [20, 232, ["pocketMoney"]], "Spare Change follows Pocket Money");
  assert.equal(cost("fasterTrainers", 0), 2);
  assert.deepEqual(RESEARCH.fasterTrainers.requires, [{ upgrade: "fasterTrainers" }]);
  // No two nodes of a row overlap.
  const rows = new Map<number, number[]>();
  for (const n of TREES[0].nodes) rows.set(n.y, [...(rows.get(n.y) ?? []), n.x]);
  for (const [y, xs] of rows) assert.equal(new Set(xs).size, xs.length, `row ${y}`);
});
test("Free Training sits under Wishing Well, costs 10 and opens the three Free Upgrade rows", () => {
  const node = TREES[0].nodes.find((n) => n.id === "freeTraining")!;
  assert.deepEqual([node.x, node.y, node.requires], [20, 286, ["wishingWell"]]);
  assert.equal(cost("freeTraining", 0), 10);
  assert.deepEqual(["lifesteal", "pocketMoney", "wealthy", "loot", "wishingWell"].map((id) => cost(id as UpgradeId, 0)), [5, 3, 3, 3, 3]);
  const rows = TRAINING.filter((t) => "requires" in t && t.requires === "freeTraining");
  assert.deepEqual(rows.map((t) => [t.name, t.group]), [["Free Offense Up", "utility"], ["Free Defense Up", "utility"], ["Free Utility Up", "utility"]]);
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
  assert.equal(g.notices.waiting("inspiration"), false, "not inside a run");
  g.finish("Ascent ended");
  assert.deepEqual(g.save.treeNotices, { inspiration: true, breakthrough: false });
  assert.ok(g.run.outside && g.notices.waiting("inspiration"), "Door & Key costs 1");
  g.save.tower.inspiration = 0;
  assert.equal(g.notices.waiting("inspiration"), false, "nothing affordable");
  g.save.tower.inspiration = 1;
  assert.ok(g.skills.buy("cardDoorKey"));
  assert.equal(g.notices.waiting("inspiration"), false, "spent");
  assert.ok(decode(JSON.stringify(g.save)).treeNotices.inspiration, "kept until the tree is shown");
});
test("a Tower Goal claimed pays a Breakthrough point and puts a dot on the Breakthrough tab in the forest once the tree is open and a skill there can be bought", () => {
  const g = new Game(defaults());
  g.save.upgrades.trainers = g.save.upgrades.breakthrough = 1;
  g.save.tower.reached = 20;
  assert.equal(g.notices.waiting("breakthrough"), false, "not inside a run");
  g.newRun({ outside: true, seed: 2 });
  assert.ok(g.claimGoal(1, 10, false));
  assert.equal(g.save.breakthrough, 1, "one point a Goal");
  assert.deepEqual(g.save.treeNotices, { inspiration: false, breakthrough: true });
  assert.ok(g.run.outside && g.notices.waiting("breakthrough"), "Quest for Knowledge costs 1");
  g.save.breakthrough = 0;
  assert.equal(g.notices.waiting("breakthrough"), false, "nothing affordable");
  g.save.breakthrough = 1;
  g.save.upgrades.breakthrough = 0;
  assert.equal(g.notices.waiting("breakthrough"), false, "the tree is locked");
  g.save.upgrades.breakthrough = 1;
  assert.ok(g.skills.buy("questForKnowledge"));
  assert.equal(g.notices.waiting("breakthrough"), false, "spent");
  assert.ok(decode(JSON.stringify(g.save)).treeNotices.breakthrough, "kept until the tree is shown");
});

test("a tree's column gap is the least distance across between two nodes in one row", () => {
  const tree = (id: string) => TREES.find(t => t.id === id)!;
  assert.equal(columnGap(tree("inspiration")), 20, "its five-across rows");
  assert.equal(columnGap(tree("breakthrough")), 20);
  assert.equal(columnGap({ ...tree("breakthrough"), nodes: [tree("breakthrough").nodes[0]] }), 100, "no row holds two");
});

test("Limit Break 1 to 10 (5 Breakthrough each) run straight down under Ignore More, each needing the one before", () => {
  const nodes = TREES.find((t) => t.id === "breakthrough")!.nodes, base = nodes.find((n) => n.id === "ignoreMore")!;
  LIMIT_BREAKS.forEach((id, i) => {
    const n = nodes.find((m) => m.id === id)!;
    assert.deepEqual([n.x, n.y, n.requires], [base.x, base.y + 24 * (i + 1), [i ? LIMIT_BREAKS[i - 1] : "ignoreMore"]], id);
    assert.deepEqual([UPGRADES.find((u) => u.id === id)!.currency, cost(id, 0)], ["breakthrough", 5], id);
  });
});

test("the Inspiration tree opens with Door & Key, Enemy and Auto-Climb down the middle, 1 Inspiration each, Combat Stance under them", () => {
  const at = (id: string) => TREES[0].nodes.find((n) => n.id === id)!;
  assert.deepEqual(TREES[0].nodes.slice(0, 3).map((n) => [n.id, n.x, n.y, n.requires]),
    [["cardDoorKey", 50, 12, []], ["cardEnemy", 50, 30, ["cardDoorKey"]], ["autoClimb", 50, 48, ["cardEnemy"]]]);
  assert.deepEqual([at("combatStance").y, at("combatStance").requires], [66, ["autoClimb"]]);
  assert.ok(TREES[0].nodes.slice(3).every((n) => n.y >= 66), "everything else three rows down");
  assert.deepEqual(["cardDoorKey", "cardEnemy", "autoClimb"].map((id) => cost(id as UpgradeId, 0)), [1, 1, 1]);
  assert.deepEqual(["cardDoorKey", "cardEnemy", "autoClimb"].map((id) => UPGRADES.find((u) => u.id === id)!.name), ["Door & Key", "Enemy", "Auto-Climb"]);
});

test("Path to Wealth and Physician (1 Breakthrough each) take Pathfinder's and Bombs' places and reveal Pocket Money's and Greater Heal's sides of the Inspiration tree", () => {
  const breakthrough = TREES.find((t) => t.id === "breakthrough")!;
  const at = (id: string) => breakthrough.nodes.find((n) => n.id === id)!;
  assert.deepEqual([at("pathToWealth").x, at("pathToWealth").y, at("pathToWealth").requires], [18, 58, ["moveSpeed"]]);
  assert.deepEqual([at("physician").x, at("physician").y, at("physician").requires], [50, 58, ["moveSpeed"]]);
  assert.ok(!UPGRADES.some((u) => (u.id as string) === "pathfinder"), "Pathfinder is gone");
  for (const id of ["pathToWealth", "physician"] as const) assert.deepEqual([UPGRADES.find((u) => u.id === id)!.currency, cost(id, 0)], ["breakthrough", 1], id);
  const upgrades = { ...defaults().upgrades, trainers: 1, questForKnowledge: 1 };
  const sides = { pathToWealth: ["pocketMoney", "spareChange", "wealthy", "loot", "wishingWell", "freeTraining"], physician: ["greaterHeal", "recovery", "findPotion", "regenResearch", "parry", "revive"] } as const;
  for (const ids of Object.values(sides)) for (const id of ids) assert.ok(skillHidden(id, upgrades), `${id} hidden`);
  assert.ok(!skillHidden("lifesteal", upgrades), "the middle path shows with the Archives");
  upgrades.pathToWealth = 1;
  for (const id of sides.pathToWealth) assert.ok(!skillHidden(id, upgrades), `${id} revealed`);
  for (const id of sides.physician) assert.ok(skillHidden(id, upgrades), `${id} still hidden`);
  upgrades.physician = 1;
  for (const id of sides.physician) assert.ok(!skillHidden(id, upgrades), `${id} revealed`);
});

test("a save from before Path to Wealth and Physician keeps what it owns in view", () => {
  const raw = JSON.parse(JSON.stringify(defaults()));
  Object.assign(raw.upgrades, { pathfinder: 1, greaterHeal: 1 });
  const save = decode(JSON.stringify(raw));
  assert.deepEqual([save.upgrades.pathToWealth, save.upgrades.physician], [1, 1]);
  assert.deepEqual([decode(JSON.stringify(defaults())).upgrades.pathToWealth, decode(JSON.stringify(defaults())).upgrades.physician], [0, 0]);
});

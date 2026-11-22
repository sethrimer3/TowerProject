import test from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save/save.ts";
import { codexCategories, costToReach, enemiesKnown, GENERAL_TOPICS, type CodexSource } from "../src/codex/codex.ts";
import { decodeCodex, defaultCodex, noteDiscoveries } from "../src/codex/discovery.ts";
import { CARD_BRIEFS, ARCANUM_BRIEFS, FAMILIAR_BRIEFS, STRENGTH_BRIEFS, TRAIT_BRIEFS } from "../src/codex/briefs.ts";
import { cost } from "../src/progression/upgrades.ts";
import { TREES } from "../src/progression/skill-trees.ts";

const source = (over: Partial<CodexSource> = {}): CodexSource => ({ save: defaults(), inside: false, tournament: false, events: false, held: [], ...over });
const entries = (src: CodexSource) => codexCategories(src).flatMap((c) => c.sections.flatMap((s) => s.entries.map((e) => ({ category: c.id, ...e }))));

test("a new profile opens only the categories it has reached", () => {
  const open = codexCategories(source()).filter((c) => c.open).map((c) => c.id);
  assert.deepEqual(open, ["general", "currencies", "elements", "cards", "enemies", "combat"]);
});

test("Access to Everything opens every category and reveals every entry, saving nothing", () => {
  const src = source();
  src.save.settings.accessAll = true;
  const before = JSON.stringify(src.save);
  assert.ok(codexCategories(src).every((c) => c.open));
  assert.deepEqual(entries(src).filter((e) => e.hidden), []);
  assert.equal(JSON.stringify(src.save), before);
});

test("a hidden entry tells nothing about what it hides", () => {
  for (const e of entries(source()).filter((x) => x.hidden)) {
    assert.equal(e.name, "???");
    assert.equal(e.brief, "");
    assert.equal(e.facts, undefined);
    assert.equal(e.link, undefined);
  }
});

test("briefs stay brief", () => {
  for (const [id, brief] of Object.entries({ ...CARD_BRIEFS, ...ARCANUM_BRIEFS, ...FAMILIAR_BRIEFS, ...STRENGTH_BRIEFS, ...TRAIT_BRIEFS }))
    assert.ok(brief.length <= 70, `${id}: ${brief.length} characters`);
});

test("Familiars show as ??? until Events open, then each with its levels once hatched", () => {
  const category = (src: CodexSource) => codexCategories(src).find((c) => c.id === "familiars")!;
  const shut = category(source());
  assert.equal(shut.open, false);
  assert.ok(shut.sections[0]!.entries.length === 5 && shut.sections[0]!.entries.every((e) => e.hidden));
  const src = source({ events: true });
  src.save.familiars.dragon = { levels: [1, 0, 0, 0] };
  const [dragon, slime] = category(src).sections[0]!.entries;
  assert.deepEqual(dragon!.facts![0], ["Damage (level 1)", "×14.5"]);
  assert.equal(slime!.facts, undefined);
  assert.ok(slime!.lines!.includes("Not hatched yet."));
});

test("General has a topic for every major experience, each its own id", () => {
  const ids = GENERAL_TOPICS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ["tower", "floors", "cards", "ascension", "keys", "goals", "towers", "delve", "proving", "events", "relics", "shop", "dailyGems", "progress"]) assert.ok(ids.includes(id), id);
});

test("links to forest-only pages can't be followed inside a climb; the Shop's can", () => {
  const inside = codexCategories(source({ inside: true }));
  const general = inside.find((c) => c.id === "general")!.sections[0]!.entries;
  assert.equal(general.find((e) => e.id === "goals")!.link!.open, false);
  assert.equal(general.find((e) => e.id === "shop")!.link!.open, true);
  assert.deepEqual(general.find((e) => e.id === "dailyGems")!.link!.to, { page: "shop", offer: "dailyGems" });
  const deck = inside.find((c) => c.id === "cards")!;
  assert.equal(deck.links[0]!.open, false);
});

test("the cost to reach a skill counts it and every skill above it not yet owned", () => {
  const save = defaults(), levels = save.upgrades;
  // Auto-Climb needs Enemy, which needs Door & Key.
  assert.equal(costToReach("autoClimb", levels), cost("autoClimb", 0) + cost("cardEnemy", 0) + cost("cardDoorKey", 0));
  levels.cardDoorKey = 1;
  assert.equal(costToReach("autoClimb", levels), cost("autoClimb", 0) + cost("cardEnemy", 0));
  // A skill needing two others counts the skills they share only once.
  for (const node of TREES.flatMap((t) => t.nodes)) assert.ok(costToReach(node.id, levels) >= (levels[node.id] ? 0 : cost(node.id, levels[node.id])), node.id);
});

test("a skill tree sorts every node into exactly one of its groups", () => {
  const save = defaults();
  save.profile.earned.inspiration = 1;
  const tree = codexCategories(source({ save })).find((c) => c.id === "inspiration")!;
  const all = tree.sections.flatMap((s) => s.entries.map((e) => e.id));
  const nodes = TREES.find((t) => t.id === "inspiration")!.nodes.map((n) => n.id);
  assert.deepEqual([...all].sort(), [...nodes].sort());
  assert.ok(tree.sections.find((s) => s.id === "available")!.entries.some((e) => e.id === "cardDoorKey"));
});

test("a card ready to ascend is called out, with a link to the Deck that names its Rubies", () => {
  const save = defaults();
  save.cardXp.stairs = 1e9;
  const stairs = codexCategories(source({ save })).find((c) => c.id === "cards")!.sections[0]!.entries.find((e) => e.id === "stairs")!;
  assert.equal(stairs.ready, true);
  assert.deepEqual(stairs.link!.to, { page: "deck", card: "stairs" });
  assert.ok(stairs.link!.rubies! > 0);
});

test("enemy kinds are known once a tower that can roll them is open", () => {
  const save = defaults();
  const first = enemiesKnown(save);
  assert.ok(first.strengths.has("normal") && first.strengths.has("boss"));
  assert.ok(!first.strengths.has("greaterBoss"));
  assert.ok(!first.traits.has("fast"), "Fast enemies start in Tower II");
  save.tower.tiersOpen = 2;
  assert.ok(enemiesKnown(save).traits.has("fast"));
  save.profile.earned.cells = 1;
  assert.ok(enemiesKnown(save).strengths.has("greaterBoss"));
});

test("the Codex remembers arcana offered or lent, and Uniques owned, after they go", () => {
  const save = defaults();
  save.arcana.offer = ["voidwell"];
  save.equipment.items.push({ id: "1", def: "raptorBlade", rarity: "epic", level: 0, slots: [] });
  save.equipment.items.push({ id: "2", def: "knightsSword", rarity: "common", level: 0, slots: [] });
  assert.equal(noteDiscoveries(save.codex, save, ["phantasm"]), true);
  assert.deepEqual(save.codex, { arcana: ["phantasm", "voidwell"], uniques: ["raptorBlade"] });
  save.arcana.offer = [];
  save.equipment.items = [];
  assert.equal(noteDiscoveries(save.codex, save), false);
  const arcana = codexCategories(source({ save })).find((c) => c.id === "arcana")!.sections[0]!.entries;
  assert.equal(arcana.find((e) => e.id === "voidwell")!.hidden, undefined);
  assert.equal(arcana.find((e) => e.id === "overseer")!.hidden, true);
});

test("the Codex's save decodes defensively and round-trips", () => {
  assert.deepEqual(decodeCodex(undefined), defaultCodex());
  assert.deepEqual(decodeCodex({ arcana: ["voidwell", "nope", "phantasm", "voidwell"], uniques: ["raptorBlade", "knightsSword", 3, "raptorBlade"] }),
    { arcana: ["phantasm", "voidwell"], uniques: ["raptorBlade"] });
  const save = defaults();
  save.codex = { arcana: ["overseer"], uniques: ["soulReaper"] };
  assert.deepEqual(decode(JSON.stringify(save)).codex, save.codex);
});

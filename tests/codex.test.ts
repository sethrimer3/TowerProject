import test from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save/save.ts";
import { codexCategories, costToReach, enemiesKnown, GENERAL_TOPICS, type CodexSource } from "../src/codex/codex.ts";
import { decodeCodex, defaultCodex, noteDiscoveries } from "../src/codex/discovery.ts";
import { CARD_BRIEFS, ARCANUM_BRIEFS, FAMILIAR_BRIEFS, STRENGTH_BRIEFS, TRAIT_BRIEFS, UNDEAD_BRIEFS } from "../src/codex/briefs.ts";
import { readdirSync, readFileSync } from "node:fs";
import { cost, UPGRADES } from "../src/progression/upgrades.ts";
import { researchBoost, type ResearchId } from "../src/progression/archives.ts";
import { rarityRank } from "../src/cards/rarity.ts";
import { CARD_IDS } from "../src/cards/cards.ts";
import { powersOf } from "../src/cards/powers.ts";
import { levelIn, powersShownTo } from "../src/cards/levels.ts";
import { cardPowersHtml } from "../src/ui/card-power-view.ts";
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
  for (const [id, brief] of Object.entries({ ...CARD_BRIEFS, ...ARCANUM_BRIEFS, ...FAMILIAR_BRIEFS, ...STRENGTH_BRIEFS, ...TRAIT_BRIEFS, ...UNDEAD_BRIEFS }))
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

const entry = (src: CodexSource, category: string, id: string) => entries(src).find((e) => e.category === category && e.id === id)!;

test("currencies, Training and research show their one stat after the name, with nothing to expand", () => {
  const save = defaults();
  save.gold = 1234.9;
  save.training.hp = 3;
  save.archives.levels.potionHp = 2;
  const src = source({ save });
  assert.equal(entry(src, "currencies", "gold").status, "(Have 1,234)", "never rounded up");
  assert.equal(entry(src, "currencies", "silver").status, undefined, "Silver is a climb's alone");
  assert.equal(entry({ ...src, inside: true, silver: 56 }, "currencies", "silver").status, "(Have 56)");
  assert.match(entry(src, "training", "hp").status!, /^Rank 3 \(\+\d+\)$/);
  assert.equal(entry(src, "training", "attack").status, "Rank 0");
  assert.equal(entry(src, "archives", "potionHp").status, "Rank 2 (+40%)");
  assert.equal(entry(src, "inspiration", "cardDoorKey").status, "(Cost 1 Inspiration)");
  for (const e of entries(src))
    if (["currencies", "inspiration", "breakthrough", "archives", "training"].includes(e.category)) assert.equal(e.facts, undefined, `${e.category}/${e.id}`);
});

test("research boosts read as what the levels add, or what they open", () => {
  const boost = (id: ResearchId, level: number) => {
    const save = defaults();
    save.archives.levels[id] = level;
    return researchBoost(save.archives, id);
  };
  assert.equal(boost("researchCostDiscount", 3), "−0.9%");
  assert.equal(boost("overseerZap", 1), "−1 turn");
  assert.equal(boost("goldenFloorMultiplier", 3), "+0.3×");
  assert.equal(boost("buyQuantity", 1), "x5");
  assert.equal(boost("noteTaking", 1), "Open");
});

test("the Inspiration and Breakthrough trees' skills have no ranks to show", () => {
  for (const node of TREES.filter((t) => t.id === "inspiration" || t.id === "breakthrough").flatMap((t) => t.nodes))
    assert.equal(UPGRADES.find((u) => u.id === node.id)!.max, 1, node.id);
});

test("an owned card shows powers only up to the next rarity, or every one with Access to Everything", () => {
  const save = defaults(), src = source({ save });
  const upTo = () => entry(src, "cards", "stairs").card!.upTo;
  assert.equal(upTo(), rarityRank("common"));
  save.cardXp.stairs = 1e9;
  assert.equal(upTo(), rarityRank("uncommon"));
  save.cardAscension.stairs = 1;
  assert.equal(upTo(), rarityRank("rare"), "ascending reveals the next");
  save.settings.accessAll = true;
  assert.equal(upTo(), rarityRank("mythic"));
});

test("the powers list, the Deck's and the Codex's, draws none above the next rarity without Access to Everything", () => {
  for (const id of CARD_IDS) for (const ascended of [0, 1, 3, 5]) for (const accessAll of [false, true]) {
    const save = defaults();
    save.settings.accessAll = accessAll;
    if (ascended) {
      save.cardXp[id] = 1e9;
      save.cardAscension[id] = ascended;
    }
    const powers = powersOf(id), most = powersShownTo(save, id);
    const shown = cardPowersHtml(id, levelIn(save, id).level, most).split('<li class="card-power ').length - 1;
    // A new card's next rarity is Common, rank 1; each ascension's is one past the rarity reached.
    const next = ascended ? ascended + 2 : 1;
    const expected = accessAll ? powers.length : powers.filter((power) => rarityRank(power.rarity) <= next).length;
    assert.equal(shown, expected, `${id}, ascended ${ascended}, access ${accessAll}`);
  }
});

test("Tower Elements pictures the doors, ends with Heart Doors and keeps the Greater Boss for the Torch card", () => {
  const save = defaults(), src = source({ save });
  const list = () => codexCategories(src).find((c) => c.id === "elements")!.sections[0]!.entries;
  assert.equal(list().at(-1)!.id, "heartDoor");
  assert.deepEqual(entry(src, "elements", "goldKey").beside, { kind: "door", id: "yellow" });
  assert.ok(!list().some((e) => e.id === "steelDoor"), "generation places no Steel Doors");
  assert.equal(entry(src, "elements", "multiDoor").hidden, true, "not before red keys are known");
  assert.doesNotMatch(entry(src, "elements", "torch").brief, /Greater Boss/);
  save.upgrades.cardTorch = 1;
  assert.match(entry(src, "elements", "torch").brief, /Greater Boss/);
  save.tower.best = 101;
  assert.equal(entry(src, "elements", "multiDoor").brief, "Some doors require multiple key types to open.");
});

test("How to progress lists its tips", () => {
  assert.equal(entry(source(), "general", "progress").tips!.length, 6);
});

test("the stylesheets hold no control characters, as an escape read as octal leaves", () => {
  const dir = new URL("../src/styles/", import.meta.url);
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".css")))
    assert.doesNotMatch(readFileSync(new URL(file, dir), "utf8"), /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/, file);
});

test("the Codex's save decodes defensively and round-trips", () => {
  assert.deepEqual(decodeCodex(undefined), defaultCodex());
  assert.deepEqual(decodeCodex({ arcana: ["voidwell", "nope", "phantasm", "voidwell"], uniques: ["raptorBlade", "knightsSword", 3, "raptorBlade"] }),
    { arcana: ["phantasm", "voidwell"], uniques: ["raptorBlade"] });
  const save = defaults();
  save.codex = { arcana: ["overseer"], uniques: ["soulReaper"] };
  assert.deepEqual(decode(JSON.stringify(save)).codex, save.codex);
});

test("the Catacombs open with Reveal Catacombs, each undead shown once a hall it can stand in is reached", () => {
  const category = (src: CodexSource) => codexCategories(src).find((c) => c.id === "catacombs")!;
  const undead = (src: CodexSource) => category(src).sections.find((x) => x.id === "undead")!.entries;
  assert.equal(category(source()).open, false);
  const src = source();
  src.save.upgrades.catacombs = 1;
  assert.equal(category(src).open, true);
  assert.ok(undead(src).every((e) => e.hidden), "no hall reached yet");
  src.save.catacombs.best = { 1: 3, 2: 12 };
  assert.deepEqual(undead(src).map((e) => e.hidden ? "???" : e.name), ["Wisp", "Ghost", "Skeleton", "???", "???", "???", "???"]);
  const skeleton = undead(src)[2]!;
  assert.deepEqual(skeleton.facts, [["Rarity", "Rare"], ["MHP", "550"], ["MAtk", "10"], ["MDef", "12"], ["MXP", "7"], ["First hall", "11"]]);
  // Spirit and Ingots join the Currencies once the Catacombs are open.
  src.save.catacombs.spirit.rare = 4;
  const held = codexCategories(src).find((c) => c.id === "currencies")!.sections[0]!.entries;
  assert.equal(held.find((e) => e.id === "spirit-rare")!.status, "(Have 4)");
  assert.ok(held.some((e) => e.id === "ingot-nickel" && !e.hidden));
  assert.ok(codexCategories(source()).find((c) => c.id === "currencies")!.sections[0]!.entries.filter((e) => e.id.startsWith("spirit-")).every((e) => e.hidden));
});

test("the Story tells Training once Trainers is owned and the Archives once the Archives are, the thoughts in italics", () => {
  const story = (save = defaults()) => codexCategories(source({ save })).find((c) => c.id === "story")!;
  const ids = (save = defaults()) => story(save).sections.map((s) => s.id);
  assert.ok(!story().open);
  const save = defaults();
  save.tutorials.chamber = true;
  assert.deepEqual(ids(save), ["intro"]);
  save.upgrades.trainers = 1;
  assert.deepEqual(ids(save), ["intro", "training"]);
  save.upgrades.archives = 1;
  assert.deepEqual(ids(save), ["intro", "training", "archives"]);
  const training = story(save).sections.find((s) => s.id === "training")!.prose!;
  assert.ok(training.some((p) => p.startsWith("<em>\"I appreciate not dying")));
});

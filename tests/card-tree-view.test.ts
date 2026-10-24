import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD_IDS } from "../src/cards.ts";
import { CARD_TREES, type CardOpened, type CardTreeLevels } from "../src/card-trees.ts";
import { cardTreeCardHtml, cardTreeGraph, cardTreeHelpHtml, cardTreeListHtml, cardTreeNodeHelpHtml, nodeLabel, nodeName, ROOT, statChange, statText, type TreeLevels } from "../src/ui/card-tree-view.ts";
import { layout, trailAim } from "../src/ui/upgrade-graph.ts";

const TREES = CARD_IDS.filter((id) => CARD_TREES[id]);
/** A tree's levels spent and opened. */
const at = (levels: CardTreeLevels = {}, opened: CardOpened = {}): TreeLevels => ({ levels, opened });

test("every tree's graph roots at the card, every node on a parent in it", () => {
  for (const card of TREES) {
    const nodes = cardTreeGraph(card, at());
    assert.equal(nodes[0].id, ROOT);
    assert.equal(nodes.length, CARD_TREES[card]!.length + 1);
    const ids = new Set(nodes.map((n) => n.id));
    for (const n of nodes.slice(1)) assert.ok(ids.has(n.parent!), `${card}.${n.id}`);
  }
  const without = CARD_IDS.find((id) => !CARD_TREES[id]);
  if (without) assert.deepEqual(cardTreeGraph(without, at()), []);
});

test("a node is next while it takes points, owned once it holds every level opened, locked behind its parent or sealed until a card buy opens it", () => {
  const state = (tree: TreeLevels, id: string) => cardTreeGraph("stairs", tree).find((n) => n.id === id)!.state;
  assert.equal(state(at(), "floorGold"), "next");
  assert.equal(state(at(), "floorHealGold"), "locked", "sealed");
  assert.equal(state(at({ stairs: { floorGold: 5 } }), "floorHealGold"), "locked", "still sealed");
  assert.equal(state(at({ stairs: { floorGold: 3 } }, { stairs: { floorHealGold: 1 } }), "floorHealGold"), "locked");
  assert.equal(state(at({ stairs: { floorGold: 5 } }), "floorGold"), "owned");
  assert.equal(state(at({ stairs: { floorGold: 5 } }, { stairs: { floorGold: 1 } }), "floorGold"), "next", "a common buy opened a sixth level");
  assert.equal(state(at({ stairs: { floorGold: 5 } }, { stairs: { floorHealGold: 1 } }), "floorHealGold"), "next");
  const spare = cardTreeGraph("stairs", at({ stairs: { floorGold: 3 } })).find((n) => n.id === "floorGold")!;
  assert.equal(spare.tag, "Spare Change");
  assert.match(spare.face, /3\/5/);
  assert.match(spare.cls!, /r-common/);
  assert.doesNotMatch(spare.cls!, /\bup\b/);
  assert.match(spare.label!, /^Spare Change, common: level 3 of 5, available\. Gives \+6% Spare Change Gold/);
  const sealed = cardTreeGraph("stairs", at()).find((n) => n.id === "overhealMax")!;
  assert.equal(sealed.cls, "sealed", "no rarity shown");
  assert.equal(sealed.tag, undefined, "no name");
  assert.match(sealed.face, /ct-sealed-mark[^>]*>\?</, "only a ?");
  assert.doesNotMatch(sealed.face, /ct-icon|ct-fill/);
  assert.equal(sealed.label, "Sealed upgrade: a card buy opens it.");
  const legendary = cardTreeGraph("stairs", at({}, { stairs: { overhealMax: 1 } })).find((n) => n.id === "overhealMax")!;
  assert.match(legendary.cls!, /r-legendary/, "opened, it shows past a rare node still sealed");
  assert.match(legendary.face, /ct-holo/, "the legendary node's holographic icon");
  assert.match(legendary.label!, /^Overheal Max, legendary: level 0 of 1, locked/);
  const raised = cardTreeGraph("stairs", at({}, { stairs: { floorGold: 2, goldBonus: 1 } }));
  assert.match(raised.find((n) => n.id === "floorGold")!.cls!, /r-common up/, "raised by card buys: green");
  assert.match(raised.find((n) => n.id === "floorGold")!.face, /☆/, "with a hollow star");
  assert.match(raised.find((n) => n.id === "goldBonus")!.face, /★★/, "rare: two stars");
  assert.match(raised[0].cls!, /root r-rare/, "the card at the root looks rare");
});

test("every node has a name and says what its levels give", () => {
  for (const card of TREES)
    for (const node of CARD_TREES[card]!) {
      assert.ok(nodeName(card, node).length > 2, `${card}.${node.id}`);
      for (const line of statText(node, node.max)) assert.doesNotMatch(line, /undefined|NaN/);
    }
  const stairs = CARD_TREES.stairs!;
  assert.equal(nodeName("stairs", stairs.find((n) => n.id === "floorHealSilver")!), "Floor Heal II");
  assert.deepEqual(statText(stairs.find((n) => n.id === "floorGold")!, 3), ["+6% Spare Change Gold on each floor"]);
  assert.deepEqual(statText(stairs.find((n) => n.id === "stairSkip")!, 2), ["2% chance the Tower's stairs climb two floors"]);
  assert.deepEqual(statText(CARD_TREES.chest!.find((n) => n.id === "supplyChance")!, 3), ["+0.6% Supply Chest chance"]);
});

test("a node's card offers to buy a level with a point while it can, says why not otherwise, and the root's is behind the ? button", () => {
  const html = cardTreeCardHtml("atkUp", at(), "shard", 2, null);
  assert.match(html, /<span class="ug-card-action"><button type="button" class="ug-buy" data-ct-raise aria-label="Buy a level with a card point"[^>]*>Buy <small>2 left<\/small><\/button><button [^>]*data-ct-info/, "Buy in the head, beside the name, then the ?");
  assert.match(html, /Common<\/span> · <span class="ct-state next">Available · Level 0 \/ 5/, "rarity, state and level on one line");
  assert.doesNotMatch(html, /Holds|Each level|ct-pips|ct-bar/, "the rest is behind the ?");
  const none = cardTreeCardHtml("atkUp", at(), "shard", 0, null);
  assert.match(none, /data-ct-raise disabled[^>]*>Buy</, "no points left: Buy greys, without saying why");
  assert.doesNotMatch(none, /ug-locked/);
  assert.match(cardTreeCardHtml("atkUp", at(), "shard", 3, "Points are spent in the forest."), /data-ct-raise disabled[\s\S]*<p class="ug-locked">Points are spent in the forest\./);
  assert.match(cardTreeCardHtml("atkUp", at({ atkUp: { shard: 5 } }), "shard", 0, null), /Full/);
  assert.equal(cardTreeCardHtml("stairs", at(), "stairSkip", 0, null), "", "a sealed node shows no details");
  assert.equal(cardTreeCardHtml("atkUp", at(), ROOT, 4, null), "");
  assert.match(cardTreeHelpHtml("atkUp", 4), /<b>4<\/b> points to spend on 10 upgrades/);
  const help = cardTreeNodeHelpHtml("stairs", at(), "floorSilver", "No card points left.");
  assert.match(help, /^<p class="ug-locked">No card points left\.<\/p><p>Each level: \+2% Wishing Well Silver on each floor\.<\/p><p>Holds 5 of up to 10 levels: a common card buy opens one more\.<\/p>$/);
  assert.doesNotMatch(cardTreeNodeHelpHtml("stairs", at(), "floorSilver", null), /ug-locked/);
  assert.equal(cardTreeNodeHelpHtml("stairs", at(), "stairSkip", null), "", "a sealed node keeps what it is hidden");
});

test("a node's details give each stat in a few words, its amount now → with the next level", () => {
  const box = (text: string, next = false) => `<span class="training-box${next ? " next" : ""}">${text}</span>`;
  const arrow = `<span class="training-arrow" aria-hidden="true">→</span>`;
  const stairs = CARD_TREES.stairs!, silver = stairs.find((n) => n.id === "floorSilver")!;
  assert.equal(statChange(silver, 0, 5), `<p class="ct-change"><span class="ct-target">Wishing Well:</span>${box("0%")}${arrow}${box("+2%", true)}</p>`);
  assert.equal(statChange(silver, 2, 5), `<p class="ct-change"><span class="ct-target">Wishing Well:</span>${box("+4%")}${arrow}${box("+6%", true)}</p>`);
  assert.equal(statChange(silver, 5, 5), `<p class="ct-change"><span class="ct-target">Wishing Well:</span>${box("+10%")}</p>`, "full: no next level");
  assert.match(statChange(stairs.find((n) => n.id === "stairSkip")!, 1, 2), /Stair Skip chance:<\/span><span class="training-box">1%</, "a chance unsigned");
  assert.match(cardTreeCardHtml("stairs", at({ stairs: { floorGold: 2 } }), "floorGold", 4, null), /Spare Change:<\/span><span class="training-box">\+4%<\/span>.*\+6%/);
  // Every stat of every node has its words and reads its amount.
  for (const card of TREES)
    for (const node of CARD_TREES[card]!) {
      const line = statChange(node, 1, 2);
      assert.equal(line.match(/class="ct-change"/g)!.length, Object.keys(node.stats).length, `${card}.${node.id}`);
      assert.doesNotMatch(line, /undefined|NaN|>:/, `${card}.${node.id}`);
    }
});

test("the graph's layout stands every node apart, tracks above the card", () => {
  for (const card of TREES) {
    const spots = layout(cardTreeGraph(card, at()));
    const seen = new Set([...spots.values()].map(([x, y]) => `${x},${y}`));
    assert.equal(seen.size, spots.size, card);
    for (const [id, [, y]] of spots) if (id !== ROOT) assert.ok(y < 0, `${card}.${id}`);
  }
  assert.deepEqual(trailAim({ side: false, i: 2, n: 3 }, { side: false, i: 0, n: 3 }, false), [132, -74]);
});

test("the list shows every upgrade with its rarity and state in words, and Buy only where a point can go", () => {
  const why = (id: string) => (id === "goldBonus" ? "Fill Floor Heal first." : null);
  const html = cardTreeListHtml("stairs", at({ stairs: { floorGold: 5 } }, { stairs: { floorHealGold: 1, goldBonus: 1 } }), "floorGold", why);
  assert.equal(html.match(/class="ct-row /g)!.length, CARD_TREES.stairs!.length);
  assert.match(html, /data-ct-raise="goldBonus" disabled/);
  assert.match(html, /Fill Floor Heal first\./);
  assert.match(html, /ct-row owned r-common picked/);
  assert.match(html, /Rare · Locked · 0\/1/);
  assert.equal(html.match(/<b>Sealed upgrade<\/b>/g)!.length, 6, "the six still sealed show nothing of what they are");
  assert.doesNotMatch(html, /Overheal Max|Stair Skip|Legendary/);
  assert.doesNotMatch(html, /data-ct-raise="floorGold"/);
  assert.match(nodeLabel("atkUp", at(), CARD_TREES.atkUp![0], "No points."), /level 0 of 5, available\. Gives nothing yet\. No points\./);
  assert.doesNotMatch(html, /ct-pips|ct-bar/, "a row's level is its count alone");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD_IDS } from "../src/cards.ts";
import { CARD_TREES, type CardOpened, type CardTreeLevels } from "../src/card-trees.ts";
import { cardTreeCardHtml, cardTreeGraph, cardTreeHelpHtml, cardTreeListHtml, levelPips, nodeLabel, nodeName, ROOT, statText, type TreeLevels } from "../src/ui/card-tree-view.ts";
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
  assert.deepEqual(statText(stairs.find((n) => n.id === "floorGold")!, 3), ["+6% Spare Change Gold on each floor new to the run"]);
  assert.deepEqual(statText(stairs.find((n) => n.id === "stairSkip")!, 2), ["2% chance the Tower's stairs climb two floors"]);
  assert.deepEqual(statText(CARD_TREES.chest!.find((n) => n.id === "supply")!, 3), ["+0.6% Supply Chest chance"]);
});

test("a node's card offers to buy a level with a point while it can, says why not otherwise, and the root's is behind the ? button", () => {
  const html = cardTreeCardHtml("key", at(), "keyFind", 2, null);
  assert.match(html, /<span class="ug-card-action"><button type="button" class="ug-buy" data-ct-raise aria-label="Buy a level with a card point"[^>]*>Buy <small>2 left/, "Buy in the head, beside the name");
  assert.match(html, /Common<\/span> · <span class="ct-state next">Available · Level 0 \/ 4/, "rarity, state and level on one line");
  assert.match(html, /Holds 4 of up to 10 levels: a common card buy opens one more\./);
  const refused = cardTreeCardHtml("key", at(), "keyFind", 0, "No card points left.");
  assert.match(refused, /data-ct-raise disabled[^>]*>Buy</);
  assert.match(refused, /No card points left\./);
  assert.match(cardTreeCardHtml("key", at({ key: { keyFind: 4 } }), "keyFind", 0, null), /Full/);
  assert.equal(cardTreeCardHtml("stairs", at(), "stairSkip", 0, null), "", "a sealed node shows no details");
  assert.equal(cardTreeCardHtml("key", at(), ROOT, 4, null), "");
  assert.match(cardTreeHelpHtml("key", 4), /<b>4<\/b> points to spend on 3 upgrades/);
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
  assert.match(nodeLabel("key", at(), CARD_TREES.key![0], "No points."), /level 0 of 4, available\. Gives nothing yet\. No points\./);
  assert.equal(levelPips(2, 3).match(/class="on"/g)!.length, 2);
  assert.match(levelPips(4, 25), /width:16%/);
});

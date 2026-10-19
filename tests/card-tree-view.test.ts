import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD_IDS } from "../src/cards.ts";
import { CARD_TREES, type CardTreeLevels } from "../src/card-trees.ts";
import { cardTreeCardHtml, cardTreeGraph, cardTreeListHtml, levelPips, nodeLabel, nodeName, ROOT, statText } from "../src/ui/card-tree-view.ts";
import { layout, trailAim } from "../src/ui/upgrade-graph.ts";

const TREES = CARD_IDS.filter((id) => CARD_TREES[id]);

test("every tree's graph roots at the card, every node on a parent in it", () => {
  for (const card of TREES) {
    const nodes = cardTreeGraph(card, {});
    assert.equal(nodes[0].id, ROOT);
    assert.equal(nodes.length, CARD_TREES[card]!.length + 1);
    const ids = new Set(nodes.map((n) => n.id));
    for (const n of nodes.slice(1)) assert.ok(ids.has(n.parent!), `${card}.${n.id}`);
  }
  const without = CARD_IDS.find((id) => !CARD_TREES[id]);
  if (without) assert.deepEqual(cardTreeGraph(without, {}), []);
});

test("a node is next while it takes points, owned once full, locked behind an unfilled one", () => {
  const state = (levels: CardTreeLevels, id: string) => cardTreeGraph("stairs", levels).find((n) => n.id === id)!.state;
  assert.equal(state({}, "floorPay"), "next");
  assert.equal(state({}, "goldBonus"), "locked");
  assert.equal(state({ stairs: { floorPay: 3 } }, "goldBonus"), "locked");
  assert.equal(state({ stairs: { floorPay: 5 } }, "floorPay"), "owned");
  assert.equal(state({ stairs: { floorPay: 5 } }, "goldBonus"), "next");
  const floorPay = cardTreeGraph("stairs", { stairs: { floorPay: 3 } }).find((n) => n.id === "floorPay")!;
  assert.equal(floorPay.tag, "Floor Pay");
  assert.match(floorPay.face, /3\/5/);
  assert.match(floorPay.label!, /^Floor Pay: level 3 of 5, available\. Gives \+30% Spare Change Gold/);
});

test("every node has a name and says what its levels give", () => {
  for (const card of TREES)
    for (const node of CARD_TREES[card]!) {
      assert.ok(nodeName(card, node).length > 2, `${card}.${node.id}`);
      for (const line of statText(node, node.levels)) assert.doesNotMatch(line, /undefined|NaN/);
    }
  const stairs = CARD_TREES.stairs!;
  assert.equal(nodeName("stairs", stairs.find((n) => n.id === "floorHeal2")!), "Floor Heal II");
  assert.deepEqual(statText(stairs.find((n) => n.id === "floorPay")!, 3), ["+30% Spare Change Gold on each floor new to the run", "+30% Wishing Well Silver on each floor new to the run"]);
  assert.deepEqual(statText(CARD_TREES.chest!.find((n) => n.id === "supply")!, 3), ["+0.6% Supply Chest chance"]);
});

test("a node's card offers a point while it can take one, and says why not otherwise", () => {
  const html = cardTreeCardHtml("key", {}, "keyFind", 2, null);
  assert.match(html, /data-ct-raise(?! disabled)/);
  assert.match(html, /Level 0 \/ 10/);
  const refused = cardTreeCardHtml("key", {}, "keyFind", 0, "No card points left.");
  assert.match(refused, /data-ct-raise disabled/);
  assert.match(cardTreeCardHtml("key", { key: { keyFind: 10 } }, "keyFind", 0, null), /Full/);
  assert.match(cardTreeCardHtml("key", {}, ROOT, 4, null), /4 points to spend/);
});

test("the graph's layout stands every node apart, tracks above the card", () => {
  for (const card of TREES) {
    const at = layout(cardTreeGraph(card, {}));
    const spots = new Set([...at.values()].map(([x, y]) => `${x},${y}`));
    assert.equal(spots.size, at.size, card);
    for (const [id, [, y]] of at) if (id !== ROOT) assert.ok(y < 0, `${card}.${id}`);
  }
  assert.deepEqual(trailAim({ side: false, i: 2, n: 3 }, { side: false, i: 0, n: 3 }, false), [132, -74]);
});

test("the list shows every upgrade with its state in words, and Spend only where a point can go", () => {
  const why = (id: string) => (id === "goldBonus" ? "Fill Floor Pay first." : null);
  const html = cardTreeListHtml("stairs", { stairs: { floorPay: 5 } }, "floorPay", why);
  assert.equal(html.match(/class="ct-row /g)!.length, CARD_TREES.stairs!.length);
  assert.match(html, /data-ct-raise="goldBonus" disabled/);
  assert.match(html, /Fill Floor Pay first\./);
  assert.match(html, /ct-row owned picked/);
  assert.doesNotMatch(html, /data-ct-raise="floorPay"/);
  assert.match(nodeLabel("key", {}, CARD_TREES.key![0], "No points."), /level 0 of 10, available\. Gives nothing yet\. No points\./);
  assert.equal(levelPips(2, 3).match(/class="on"/g)!.length, 2);
  assert.match(levelPips(4, 25), /width:16%/);
});

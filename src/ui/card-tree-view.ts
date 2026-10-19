/** A card's tree as the player meets it: its nodes for the living graph
 * (`cardTreeGraph`, drawn by `upgrade-graph.ts`), what each node does in
 * words (`nodeName`, `statText`), and the card of the node picked in it
 * (`cardTreeCardHtml`). The tree itself comes from `card-trees.ts`. */
import { CARDS, type CardId } from "../cards.ts";
import { CARD_TREES, nodeLevel, nodeOpen, treeNode, type CardTreeLevels, type CardTreeNode, type TreeStat } from "../card-trees.ts";
import { snap } from "../exact.ts";
import { cardArt, cellIcon, itemSprite, uiSprite, type UiSprite } from "./dom.ts";
import type { GraphNode } from "./upgrade-graph.ts";

/** The id of a tree's root node: the card itself. */
export const ROOT = "card";

/** What each stat is called, as a node's name. */
const STAT_NAMES: Record<TreeStat, string> = {
  floorGold: "Spare Change", floorSilver: "Wishing Well", goldBonus: "Gold Bonus", silverBonus: "Silver Bonus",
  freeOffense: "Free Offense", freeDefense: "Free Defense", freeUtility: "Free Utility",
  floorHeal: "Floor Heal", overheal: "Overheal", percentPotions: "Percent Potions", potionHeal: "Potion Heal", potionMaxHp: "Potion Vigor",
  doorCost: "Door Cost", doorGold: "Door Gold", keyFind: "Key Find", keyGold: "Key Gold",
  foeAttack: "Attack", foeDefense: "Defense", foeGold: "Bounty", moreEnemies: "More Enemies",
  attackShard: "Sharper Shards", defenseShard: "Sturdier Shards", attackShardGold: "Shard Gold", defenseShardGold: "Shard Gold",
  bossAttack: "Boss Attack", bossDefense: "Boss Defense", bossShroud: "Boss Shroud", bossGold: "Boss Bounty", bossCells: "Boss Cells",
  chestGold: "Chest Gold", supplyChance: "Supply Chests", equipmentChance: "Equipment Chests",
};

/** Names of nodes raising more than one stat, short enough to sit under them. */
const NODE_NAMES: Record<string, string> = { "stairs.floorPay": "Floor Pay" };

/** What `n` of each stat does, a line. */
const STAT_TEXT: Record<TreeStat, (n: string) => string> = {
  floorGold: (n) => `+${n}% Spare Change Gold on each floor new to the run`,
  floorSilver: (n) => `+${n}% Wishing Well Silver on each floor new to the run`,
  goldBonus: (n) => `+${n}% Gold Bonus`,
  silverBonus: (n) => `+${n}% Silver Bonus`,
  freeOffense: (n) => `+${n}% Free Offense Upgrade chance`,
  freeDefense: (n) => `+${n}% Free Defense Upgrade chance`,
  freeUtility: (n) => `+${n}% Free Utility Upgrade chance`,
  floorHeal: (n) => `Heals ${n}% of max HP on each floor new to the run`,
  overheal: (n) => `+${n}% Overheal ceiling (once Overheal is owned)`,
  percentPotions: (n) => `+${n}% chance each potion is a percent potion`,
  potionHeal: (n) => `+${n}% HP from every potion`,
  potionMaxHp: (n) => `+${n}% max HP for the run each time a potion is reached`,
  doorCost: (n) => `−${n}% cost of every door`,
  doorGold: (n) => `+${n}% Gold from doors`,
  keyFind: (n) => `+${n}% more each key of every colour`,
  keyGold: (n) => `+${n}% Gold from each key`,
  foeAttack: (n) => `+${n}% ATK against every enemy`,
  foeDefense: (n) => `+${n}% DEF against every enemy`,
  foeGold: (n) => `+${n}% Gold from every kill`,
  moreEnemies: (n) => `+${n}% more enemies on each floor`,
  attackShard: (n) => `+${n}% from each ATK shard`,
  defenseShard: (n) => `+${n}% from each DEF shard`,
  attackShardGold: (n) => `+${n} Gold from each ATK shard`,
  defenseShardGold: (n) => `+${n} Gold from each DEF shard`,
  bossAttack: (n) => `+${n}% ATK against a Greater Boss`,
  bossDefense: (n) => `+${n}% DEF against a Greater Boss`,
  bossShroud: (n) => `+${n}% shroud against a Greater Boss`,
  bossGold: (n) => `+${n}% Gold from a Greater Boss`,
  bossCells: (n) => `+${n} Cell${n === "1" ? "" : "s"} from each Greater Boss`,
  chestGold: (n) => `+${n}% Gold from treasure chests`,
  supplyChance: (n) => `+${n}% Supply Chest chance`,
  equipmentChance: (n) => `+${n}% Equipment Chest chance`,
};

/** Each stat's icon on its node. */
const ui = (name: UiSprite) => () => uiSprite(name);
const silver = () => uiSprite("gold", "ui-sprite silver-sprite");
const STAT_ICONS: Record<TreeStat, () => string> = {
  floorGold: ui("gold"), floorSilver: silver, goldBonus: ui("gold"), silverBonus: silver,
  freeOffense: ui("attack"), freeDefense: ui("defense"), freeUtility: ui("arrow-up"),
  floorHeal: ui("health"), overheal: ui("health"), percentPotions: () => itemSprite("potion_percent"), potionHeal: () => itemSprite("potion_flat"), potionMaxHp: ui("health"),
  doorCost: () => itemSprite("key_red"), doorGold: ui("gold"), keyFind: () => itemSprite("key_yellow"), keyGold: ui("gold"),
  foeAttack: ui("attack"), foeDefense: ui("defense"), foeGold: ui("gold"), moreEnemies: ui("upgrades"),
  attackShard: () => itemSprite("upgrade_attack"), defenseShard: () => itemSprite("upgrade_defense"), attackShardGold: ui("gold"), defenseShardGold: ui("gold"),
  bossAttack: ui("attack"), bossDefense: ui("defense"), bossShroud: ui("log"), bossGold: ui("gold"), bossCells: () => cellIcon(),
  chestGold: () => itemSprite("chest_treasure"), supplyChance: () => itemSprite("chest_silver"), equipmentChance: () => itemSprite("chest_gold"),
};

const ROMAN = ["", "", " II", " III", " IV", " V"];
/** A number as a node shows it: whole, or to two places at most. */
const amount = (n: number) => snap(n).toLocaleString("en-US", { maximumFractionDigits: 2 });

/** The stats node `node` raises, first first. */
const statsOf = (node: CardTreeNode) => Object.entries(node.stats) as [TreeStat, number][];

/** Node `node`'s name: its first stat's (STAIRS' floor pay names both), a
 * numeral after it for a later node raising the same stat on its track. */
export function nodeName(card: CardId, node: CardTreeNode) {
  const stats = statsOf(node);
  const base = NODE_NAMES[`${card}.${node.id}`] ?? (stats.length > 1 ? stats.map(([s]) => STAT_NAMES[s]).join(" & ") : STAT_NAMES[stats[0][0]]);
  const same = (CARD_TREES[card] ?? []).filter((n) => statsOf(n)[0]?.[0] === stats[0][0]);
  return `${base}${same.length > 1 ? ROMAN[same.indexOf(node) + 1] ?? "" : ""}`;
}

/** What `level` levels of `node` give, a line a stat. */
export function statText(node: CardTreeNode, level: number) {
  return statsOf(node).map(([stat, each]) => STAT_TEXT[stat](amount(each * level)));
}

/** A node's state in the graph: full (`owned`), taking points now (`next`),
 * or waiting on the node before it (`locked`). */
export function nodeState(levels: CardTreeLevels, card: CardId, node: CardTreeNode): GraphNode["state"] {
  if (nodeLevel(levels, card, node.id) >= node.levels) return "owned";
  return nodeOpen(levels, card, node) ? "next" : "locked";
}

/** A node's state in words, for screen readers and the list. */
const STATE_WORDS: Record<GraphNode["state"], string> = { owned: "full", next: "available", locked: "locked" };

/** The pips of a node's levels, filled up to `level` (a bar for more than ten). */
export function levelPips(level: number, levels: number) {
  if (levels > 10) return `<span class="ct-bar" aria-hidden="true"><i style="width:${(level / levels) * 100}%"></i></span>`;
  return `<span class="ct-pips" aria-hidden="true">${Array.from({ length: levels }, (_, i) => `<i${i < level ? ` class="on"` : ""}></i>`).join("")}</span>`;
}

/** What a node is, its level and state, and what it gives now, in one
 * line for a screen reader (`why`: why it can't take a point, if so). */
export function nodeLabel(card: CardId, levels: CardTreeLevels, node: CardTreeNode, why: string | null = null) {
  const level = nodeLevel(levels, card, node.id), state = nodeState(levels, card, node);
  const now = level ? statText(node, level).join(", ") : "nothing yet";
  return `${nodeName(card, node)}: level ${level} of ${node.levels}, ${STATE_WORDS[state]}. Gives ${now}.${why && state !== "owned" ? ` ${why}` : ""}`;
}

/** Card `card`'s tree as the graph draws it: the card at the root, every
 * track growing up from it, each node its stat's icon over a fill of its
 * levels, its count in the corner and its name under it (empty for a card
 * without a tree). `why` says why a node can't take a point, for its label. */
export function cardTreeGraph(card: CardId, levels: CardTreeLevels, why: (id: string) => string | null = () => null): GraphNode[] {
  const nodes = CARD_TREES[card];
  if (!nodes) return [];
  const root: GraphNode = { id: ROOT, state: "owned", face: cardArt(card, CARDS[card].name), cls: "root", label: `${CARDS[card].name}: the card, root of its tree` };
  return [root, ...nodes.map((node): GraphNode => {
    const level = nodeLevel(levels, card, node.id), state = nodeState(levels, card, node);
    return {
      id: node.id, parent: node.after ?? ROOT, state,
      face: `<span class="ct-icon">${STAT_ICONS[statsOf(node)[0][0]]()}</span><span class="ct-fill" aria-hidden="true"><i style="width:${(level / node.levels) * 100}%"></i></span><b aria-hidden="true">${level}/${node.levels}</b>`,
      tag: nodeName(card, node),
      label: nodeLabel(card, levels, node, why(node.id)),
    };
  })];
}

/** The details for node `id` of `card`'s tree: what it is, its levels,
 * what each level gives, what it gives now and with the next, and the
 * button that spends a point on it, with why not when it can't (`refusal`,
 * in words). The root's tell how the tree works. */
export function cardTreeCardHtml(card: CardId, levels: CardTreeLevels, id: string, left: number, refusal: string | null): string {
  if (id === ROOT || !treeNode(card, id)) {
    const n = CARD_TREES[card]?.length ?? 0;
    return `<div class="ug-card-head"><span class="ct-detail-icon ct-detail-card">${cardArt(card, CARDS[card].name)}</span><div><b>${CARDS[card].name}</b><small>${left} point${left === 1 ? "" : "s"} to spend on ${n} upgrades</small></div></div>`
      + `<p class="ug-hint">Each card level earns a point. Upgrades open from the card upward, each once the one below it is full, and count while the card is in the run's hand. Choose one to see what it does.</p>`;
  }
  const node = treeNode(card, id)!, level = nodeLevel(levels, card, id), state = nodeState(levels, card, node);
  const now = level ? statText(node, level) : ["Nothing yet"];
  const next = level < node.levels ? statText(node, level + 1) : null;
  const parent = node.after ? treeNode(card, node.after) : undefined;
  const foot = state === "owned"
    ? `<b class="ug-owned">Full: every level filled</b>`
    : refusal
      ? `<span class="ug-locked">${refusal}</span><button type="button" class="ug-buy" data-ct-raise disabled>Spend a point</button>`
      : `<button type="button" class="ug-buy" data-ct-raise>Spend a point <small>${left} left</small></button><small class="ug-again">or choose it again</small>`;
  return `<div class="ug-card-head"><span class="ct-detail-icon">${STAT_ICONS[statsOf(node)[0][0]]()}</span><div><b>${nodeName(card, node)}</b><small class="ct-state ${state}">${capital(STATE_WORDS[state])} · Level ${level} / ${node.levels}</small></div></div>`
    + levelPips(level, node.levels)
    + `<p class="ct-each">Each level: ${statText(node, 1).join("; ")}.</p>`
    + `<dl class="ct-compare"><dt>Now</dt><dd>${now.join("<br>")}</dd>${next ? `<dt>Next level</dt><dd class="ct-next">${next.join("<br>")}</dd>` : ""}</dl>`
    + (parent && state === "locked" ? `<p class="ug-locked">Opens once ${nodeName(card, parent)} is full.</p>` : "")
    + `<div class="ug-card-foot">${foot}</div>`;
}

const capital = (w: string) => w[0].toUpperCase() + w.slice(1);

/** The tree as a list, for reading at a glance: each upgrade a row in tree
 * order (one after another indented under it) with its icon, name, state,
 * levels, what it gives now and next, and its Spend button; `why` says why
 * an upgrade can't take a point (null when it can). */
export function cardTreeListHtml(card: CardId, levels: CardTreeLevels, picked: string, why: (id: string) => string | null): string {
  const nodes = CARD_TREES[card] ?? [];
  const depth = (node: CardTreeNode): number => (node.after ? 1 + depth(treeNode(card, node.after)!) : 0);
  const rows = nodes.map((node) => {
    const level = nodeLevel(levels, card, node.id), state = nodeState(levels, card, node), refusal = why(node.id);
    const next = level < node.levels ? statText(node, level + 1).join("; ") : "";
    const action = state === "owned"
      ? `<span class="ug-owned">Full</span>`
      : `<button type="button" class="ug-buy" data-ct-raise="${node.id}"${refusal ? " disabled" : ""} aria-label="Spend a point on ${nodeName(card, node)}">Spend</button>`;
    return `<li class="ct-row ${state}${node.id === picked ? " picked" : ""}" style="--depth:${depth(node)}">`
      + `<button type="button" class="ct-row-main" data-ct-pick="${node.id}" aria-label="${nodeLabel(card, levels, node, refusal)}">`
      + `<span class="ct-detail-icon">${STAT_ICONS[statsOf(node)[0][0]]()}</span>`
      + `<span class="ct-row-text"><b>${nodeName(card, node)}</b><small class="ct-state ${state}">${capital(STATE_WORDS[state])} · ${level}/${node.levels}</small>${levelPips(level, node.levels)}`
      + `<small>${level ? statText(node, level).join("; ") : "Nothing yet"}${next ? ` <span class="ct-next">→ ${next}</span>` : ""}</small>`
      + (refusal && state !== "owned" ? `<small class="ug-locked">${refusal}</small>` : "")
      + `</span></button>${action}</li>`;
  });
  return `<ul class="ct-list" aria-label="Upgrades">${rows.join("")}</ul>`;
}

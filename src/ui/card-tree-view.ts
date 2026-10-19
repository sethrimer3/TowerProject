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
  const base = stats.length > 1 ? stats.map(([s]) => STAT_NAMES[s]).join(" & ") : STAT_NAMES[stats[0][0]];
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

/** Card `card`'s tree as the graph draws it: the card at the root, every
 * track growing up from it (empty for a card without a tree). */
export function cardTreeGraph(card: CardId, levels: CardTreeLevels): GraphNode[] {
  const nodes = CARD_TREES[card];
  if (!nodes) return [];
  const root: GraphNode = { id: ROOT, state: "owned", face: cardArt(card, CARDS[card].name), cls: "root", label: CARDS[card].name };
  return [root, ...nodes.map((node): GraphNode => {
    const level = nodeLevel(levels, card, node.id), state = nodeState(levels, card, node);
    return {
      id: node.id, parent: node.after ?? ROOT, state,
      face: `<span class="ct-icon">${STAT_ICONS[statsOf(node)[0][0]]()}</span>`,
      tag: `${level}/${node.levels}`,
      label: `${nodeName(card, node)}, ${level} of ${node.levels}`,
    };
  })];
}

/** What tapping the picked node again does, when it does anything. */
const AGAIN = `<small class="ug-again">Tap it again to spend a point</small>`;

/** The card for node `id` of `card`'s tree: what it is, what it gives now
 * and with another level, its level, and the button that spends a point
 * on it, with why not when it can't (`refusal`, the desk's words). */
export function cardTreeCardHtml(card: CardId, levels: CardTreeLevels, id: string, left: number, refusal: string | null): string {
  if (id === ROOT || !treeNode(card, id)) {
    const n = CARD_TREES[card]?.length ?? 0;
    return `<div class="ug-card-head"><b>${CARDS[card].name}</b><small>${left} point${left === 1 ? "" : "s"} to spend</small></div>`
      + `<p>Each level of the card gives a card point; each point fills a level of one of its ${n} upgrades. A track's first upgrade takes points at once, and each one after it once the one before is full.</p>`
      + `<p class="ug-stats">The bonuses count while the run's hand holds this card.</p>`
      + `<p class="ug-hint">Tap an upgrade to see what it does.</p>`;
  }
  const node = treeNode(card, id)!, level = nodeLevel(levels, card, id), state = nodeState(levels, card, node);
  const now = level ? statText(node, level).join(" · ") : "Nothing yet";
  const next = level < node.levels ? statText(node, level + 1).join(" · ") : "";
  const parent = node.after ? treeNode(card, node.after) : undefined;
  const each = statText(node, 1).join(" · ");
  const foot = state === "owned"
    ? `<b class="ug-owned">Full</b>`
    : refusal
      ? `<span class="ug-locked">${refusal}</span><button type="button" class="ug-buy" data-ct-raise disabled>Spend a point</button>`
      : `<button type="button" class="ug-buy" data-ct-raise>Spend a point · ${left} left</button>${AGAIN}`;
  return `<div class="ug-card-head"><b>${nodeName(card, node)}</b><small>Level ${level} / ${node.levels}</small></div>`
    + `<p>Each level: ${each}.${parent && state === "locked" ? ` Opens once ${nodeName(card, parent)} is full.` : ""}</p>`
    + `<p class="ug-stats">Now: ${now}${next ? `<br>Next level: ${next}` : ""}</p>`
    + `<div class="ug-card-foot">${foot}</div>`;
}

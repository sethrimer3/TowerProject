/** A card's tree as the player meets it: its nodes for the living graph
 * (`cardTreeGraph`, drawn by `upgrade-graph.ts`), what each node does in
 * words (`nodeName`, `statText`), and the card of the node picked in it
 * (`cardTreeCardHtml`). The tree itself comes from `card-trees.ts`. */
import { CARDS, type CardId } from "../cards.ts";
import { CARD_TREES, cardLook, nodeCap, nodeLevel, nodeOpen, opensAt, treeNode, type CardOpened, type CardTreeLevels, type CardTreeNode, type TreeStat } from "../card-trees.ts";
import { CARD_RARITY_NAMES, type CardRarity } from "../card-rarity.ts";
import { rarityFrameHtml, rarityStarsHtml } from "./card-level-marks.ts";
import { snap } from "../exact.ts";
import { cardArt, cellIcon, itemSprite, uiSprite, type UiSprite } from "./dom.ts";
import type { GraphNode } from "./upgrade-graph.ts";

/** The id of a tree's root node: the card itself. */
export const ROOT = "card";

/** What each stat is called, as a node's name. */
const STAT_NAMES: Record<TreeStat, string> = {
  floorGold: "Spare Change", floorSilver: "Wishing Well", goldBonus: "Gold Bonus", silverBonus: "Silver Bonus",
  freeOffense: "Free Offense", freeDefense: "Free Defense", freeUtility: "Free Utility", freeDefenseChance: "Free Defense", freeUtilityChance: "Free Utility",
  floorHeal: "Floor Heal", overhealMax: "Overheal Max", stairSkip: "Stair Skip", percentPotions: "Percent Potions", potionHeal: "Potion Heal", potionMaxHp: "Potion Vigor",
  potionSilver: "Potion Silver", regen: "Regen", shroud: "Shroud", parry: "Parry",
  doorCost: "Door Cost", doorGold: "Door Gold", doorSilver: "Door Silver", doorHeal: "Door Heal",
  skeletonKey: "Skeleton Key", locksmith: "Locksmith", masterKey: "Master Key", doorChest: "Door Chest", keyFind: "Key Find", keyGold: "Key Gold",
  foeAttack: "Attack", foeDefense: "Defense", foeGold: "Bounty", moreEnemies: "More Enemies",
  attackShard: "Sharper Shards", defenseShard: "Sturdier Shards", attackShardGold: "Shard Gold", defenseShardGold: "Shard Gold",
  bossAttack: "Boss Attack", bossDefense: "Boss Defense", bossShroud: "Boss Shroud", bossGold: "Boss Bounty", bossCells: "Boss Cells",
  chestGold: "Chest Gold", supplyChance: "Supply Chests", equipmentChance: "Equipment Chests",
};

/** Names of nodes raising more than one stat, short enough to sit under them. */
const NODE_NAMES: Record<string, string> = {};

/** What `n` of each stat does, a line. */
const STAT_TEXT: Record<TreeStat, (n: string) => string> = {
  floorGold: (n) => `+${n}% Spare Change Gold on each floor new to the run`,
  floorSilver: (n) => `+${n}% Wishing Well Silver on each floor new to the run`,
  goldBonus: (n) => `+${n}% Gold Bonus`,
  silverBonus: (n) => `+${n}% Silver Bonus`,
  freeOffense: (n) => `+${n}% Free Offense Upgrade chance`,
  freeDefense: (n) => `+${n}% Free Defense Upgrade chance`,
  freeUtility: (n) => `+${n}% Free Utility Upgrade chance`,
  freeDefenseChance: (n) => `+${n}% Free Defense Upgrade chance, trained or not`,
  freeUtilityChance: (n) => `+${n}% Free Utility Upgrade chance, trained or not`,
  floorHeal: (n) => `Heals ${n}% of max HP on each floor new to the run`,
  overhealMax: (n) => `+${n}% of max HP on the Overheal ceiling, Overheal owned or not`,
  stairSkip: (n) => `${n}% chance the Tower's stairs climb two floors`,
  percentPotions: (n) => `+${n}% chance each potion is a percent potion`,
  potionHeal: (n) => `+${n}% HP from every potion`,
  potionMaxHp: (n) => `+${n}% max HP for the run each time a potion is reached`,
  potionSilver: (n) => `+${n} Silver from each potion`,
  regen: (n) => `+${n}% Regen`,
  shroud: (n) => `+${n}% shroud against every enemy`,
  parry: (n) => `+${n}% Parry, owned or not`,
  doorCost: (n) => `−${n}% of each key every door takes`,
  doorGold: (n) => `+${n}% Gold from doors`,
  doorSilver: (n) => `+${n} Silver from each door opened`,
  doorHeal: (n) => `Heals ${n}% of max HP on opening each door`,
  skeletonKey: (n) => `${n}% chance each colour door on a floor is a Wooden Door`,
  locksmith: (n) => `${n}% chance each door of two or three colours loses its rarest lock`,
  masterKey: (n) => `${n}% chance a door opens for nothing: no keys, no HP`,
  doorChest: (n) => `${n}% chance an opened door leaves a treasure chest`,
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
  freeOffense: ui("attack"), freeDefense: ui("defense"), freeUtility: ui("arrow-up"), freeDefenseChance: ui("defense"), freeUtilityChance: ui("arrow-up"),
  potionSilver: silver, regen: ui("health"), shroud: ui("log"), parry: ui("defense"),
  floorHeal: ui("health"), overhealMax: ui("health"), stairSkip: ui("arrow-up"), percentPotions: () => itemSprite("potion_percent"), potionHeal: () => itemSprite("potion_flat"), potionMaxHp: ui("health"),
  doorCost: () => itemSprite("key_red"), doorGold: ui("gold"), doorSilver: silver, doorHeal: ui("health"),
  skeletonKey: () => itemSprite("key_yellow"), locksmith: () => itemSprite("key_blue"), masterKey: () => itemSprite("key_red"), doorChest: () => itemSprite("chest_treasure_open"), keyFind: () => itemSprite("key_yellow"), keyGold: ui("gold"),
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

/** Node `node`'s name: its first stat's, a numeral after it for a later
 * node raising the same stat on its tree. */
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

/** What a card's tree reads: the levels spent on it, and those card buys
 * opened on it. */
export type TreeLevels = { levels: CardTreeLevels; opened: CardOpened };

/** A node's state in the graph: holding every level opened on it
 * (`owned`), taking points now (`next`), or waiting on the node before it
 * or on a card buy of its rarity to open it (`locked`). */
export function nodeState({ levels, opened }: TreeLevels, card: CardId, node: CardTreeNode): GraphNode["state"] {
  const cap = nodeCap(opened, card, node);
  if (cap && nodeLevel(levels, card, node.id) >= cap) return "owned";
  return nodeOpen(levels, opened, card, node) ? "next" : "locked";
}

/** A node's state in words, for screen readers and the list. */
const STATE_WORDS: Record<GraphNode["state"], string> = { owned: "full", next: "available", locked: "locked" };
const article = (rarity: CardRarity) => (rarity === "uncommon" || rarity === "epic" ? "an" : "a");
/** A sealed node, in words: what it is stays hidden until a card buy opens it. */
const SEALED_WORDS = "Sealed upgrade: a card buy opens it";
/** A sealed node's face: a ? and nothing else, so what it is stays hidden. */
const SEALED_FACE = `<span class="ct-sealed-mark" aria-hidden="true">?</span>`;

/** The pips of a node's levels, filled up to `level` (a bar for more than ten). */
export function levelPips(level: number, levels: number) {
  if (levels > 10) return `<span class="ct-bar" aria-hidden="true"><i style="width:${(level / levels) * 100}%"></i></span>`;
  return `<span class="ct-pips" aria-hidden="true">${Array.from({ length: levels }, (_, i) => `<i${i < level ? ` class="on"` : ""}></i>`).join("")}</span>`;
}

/** Node `node`'s look for its rarity: its rarity, and whether card buys
 * raised it past the levels it started with (a common node then wears
 * green and a hollow star). */
const lookOf = (opened: CardOpened, card: CardId, node: CardTreeNode) => ({ rarity: node.rarity, upgraded: node.levels > 0 && nodeCap(opened, card, node) > node.levels });
/** Whether no card buy has opened node `node` yet: it shows nothing of what it is. */
const sealed = (tree: TreeLevels, card: CardId, node: CardTreeNode) => !nodeCap(tree.opened, card, node);

/** What a node is, its rarity, level and state, and what it gives now, in
 * one line for a screen reader (`why`: why it can't take a point, if so);
 * a sealed node says only that it is sealed. */
export function nodeLabel(card: CardId, tree: TreeLevels, node: CardTreeNode, why: string | null = null) {
  if (sealed(tree, card, node)) return `${SEALED_WORDS}.`;
  const level = nodeLevel(tree.levels, card, node.id), cap = nodeCap(tree.opened, card, node), state = nodeState(tree, card, node);
  const now = level ? statText(node, level).join(", ") : "nothing yet";
  return `${nodeName(card, node)}, ${CARD_RARITY_NAMES[node.rarity].toLowerCase()}: level ${level} of ${cap}, ${STATE_WORDS[state]}. Gives ${now}.${why && state !== "owned" ? ` ${why}` : ""}`;
}

/** A node's icon: its first stat's, and on a legendary node, three copies
 * of it in shifted hues drifting on cycles of their own over a black
 * ground, flashing behind them when they line up. */
function nodeIcon(node: CardTreeNode) {
  const icon = STAT_ICONS[statsOf(node)[0][0]]();
  if (node.rarity !== "legendary") return `<span class="ct-icon">${icon}</span>`;
  return `<span class="ct-icon ct-holo"><span class="ct-holo-flash" aria-hidden="true"></span>${[1, 2, 3].map((i) => `<span class="ct-holo-${i}" aria-hidden="true">${icon}</span>`).join("")}</span>`;
}

/** Card `card`'s tree as the graph draws it: the card at the root in its
 * rarity's frame, every track growing up from it, each node in its
 * rarity's frame with its stars, its stat's icon over a fill of its
 * levels, its count in the corner and its name under it (empty for a card
 * without a tree). A sealed node is an empty frame with a ?: no icon,
 * rarity, count or name until a card buy opens it. `why` says why a node can't take a
 * point, for its label. */
export function cardTreeGraph(card: CardId, tree: TreeLevels, why: (id: string) => string | null = () => null): GraphNode[] {
  const nodes = CARD_TREES[card];
  if (!nodes) return [];
  const look = cardLook(tree.opened, card);
  const root: GraphNode = {
    id: ROOT, state: "owned", face: cardArt(card, CARDS[card].name) + rarityFrameHtml(look.rarity, look.upgraded) + rarityStarsHtml(look.rarity, look.upgraded),
    cls: `root r-${look.rarity}`, label: `${CARDS[card].name}, ${CARD_RARITY_NAMES[look.rarity].toLowerCase()}: the card, root of its tree`,
  };
  return [root, ...nodes.map((node): GraphNode => {
    if (sealed(tree, card, node)) return { id: node.id, parent: node.after ?? ROOT, state: "locked", face: SEALED_FACE, cls: "sealed", label: nodeLabel(card, tree, node) };
    const level = nodeLevel(tree.levels, card, node.id), cap = nodeCap(tree.opened, card, node), state = nodeState(tree, card, node), { rarity, upgraded } = lookOf(tree.opened, card, node);
    return {
      id: node.id, parent: node.after ?? ROOT, state,
      face: nodeIcon(node) + rarityStarsHtml(rarity, upgraded)
        + `<span class="ct-fill" aria-hidden="true"><i style="width:${(level / cap) * 100}%"></i></span><b aria-hidden="true">${level}/${cap}</b>`,
      tag: nodeName(card, node),
      cls: `r-${rarity}${upgraded ? " up" : ""}`,
      label: nodeLabel(card, tree, node, why(node.id)),
    };
  })];
}

/** How a card's tree works, behind the tree's ? button. */
export function cardTreeHelpHtml(card: CardId, left: number) {
  const n = CARD_TREES[card]?.length ?? 0;
  return `<p>${CARDS[card].name} has <b>${left}</b> point${left === 1 ? "" : "s"} to spend on ${n} upgrades.</p>`
    + `<p>Each card level earns a point. Upgrades open from the card upward, each once the one below it holds enough levels, and count while the card is in the run's hand. Choose one to see what it does.</p>`
    + `<p>Buying cards on the Deck page raises a card's max level and the levels its upgrades hold, and opens its sealed upgrades: uncommon, rare, epic and legendary, each opened by a card buy of its rarity.</p>`;
}

/** The details for node `id` of `card`'s tree: a head with its icon, its
 * name, one line of its rarity, state and level, and at its right the
 * button that buys a level with a card point (or Full); then why it can't
 * (`refusal`, in words), its levels, what each gives, now and with the
 * next, and how many card buys can still open. Nothing for the root (how
 * the tree works is behind the ? button) or a sealed node. */
export function cardTreeCardHtml(card: CardId, tree: TreeLevels, id: string, left: number, refusal: string | null): string {
  const node = treeNode(card, id);
  if (id === ROOT || !node || sealed(tree, card, node)) return "";
  const level = nodeLevel(tree.levels, card, id), cap = nodeCap(tree.opened, card, node), state = nodeState(tree, card, node), { rarity, upgraded } = lookOf(tree.opened, card, node);
  const now = level ? statText(node, level) : ["Nothing yet"];
  const next = level < cap ? statText(node, level + 1) : null;
  const parent = node.after ? treeNode(card, node.after) : undefined;
  const action = state === "owned"
    ? `<b class="ug-owned">Full</b>`
    : `<button type="button" class="ug-buy" data-ct-raise${refusal ? " disabled" : ""} aria-label="Buy a level with a card point" title="${refusal ? "" : "Or choose the upgrade again"}">Buy${refusal ? "" : ` <small>${left} left</small>`}</button>`;
  const room = `Holds ${cap} of up to ${node.max} levels${cap < node.max ? `: ${article(rarity)} ${CARD_RARITY_NAMES[rarity].toLowerCase()} card buy opens one more` : ""}.`;
  return `<div class="ug-card-head"><span class="ct-detail-icon r-${rarity}">${nodeIcon(node)}</span>`
    + `<div><b>${nodeName(card, node)}</b><small class="ct-meta"><span class="ct-rarity r-${rarity}">${rarityStarsHtml(rarity, upgraded)}${CARD_RARITY_NAMES[rarity]}</span> · <span class="ct-state ${state}">${capital(STATE_WORDS[state])} · Level ${level} / ${cap}</span></small></div>`
    + `<span class="ug-card-action">${action}</span></div>`
    + (refusal && state !== "owned" ? `<p class="ug-locked">${refusal}</p>` : "")
    + (parent && state === "locked" ? `<p class="ug-locked">Opens once ${nodeName(card, parent)} holds ${opensAt(parent)} level${opensAt(parent) === 1 ? "" : "s"}.</p>` : "")
    + levelPips(level, cap)
    + `<p class="ct-each">Each level: ${statText(node, 1).join("; ")}.</p>`
    + `<dl class="ct-compare"><dt>Now</dt><dd>${now.join("<br>")}</dd>${next ? `<dt>Next level</dt><dd class="ct-next">${next.join("<br>")}</dd>` : ""}</dl>`
    + `<p class="ct-room">${room}</p>`;
}

const capital = (w: string) => w[0].toUpperCase() + w.slice(1);

/** The tree as a list, for reading at a glance: each upgrade a row in tree
 * order (one after another indented under it) with its icon, name,
 * rarity, state, levels, what it gives now and next, and its Buy button
 * (a sealed one only says it is sealed); `why` says why an upgrade can't
 * take a point (null when it can). */
export function cardTreeListHtml(card: CardId, tree: TreeLevels, picked: string, why: (id: string) => string | null): string {
  const nodes = CARD_TREES[card] ?? [];
  const depth = (node: CardTreeNode): number => (node.after ? 1 + depth(treeNode(card, node.after)!) : 0);
  const rows = nodes.map((node) => {
    const at = `style="--depth:${depth(node)}"`;
    if (sealed(tree, card, node))
      return `<li class="ct-row locked sealed${node.id === picked ? " picked" : ""}" ${at}><button type="button" class="ct-row-main" data-ct-pick="${node.id}" aria-label="${nodeLabel(card, tree, node)}">`
        + `<span class="ct-detail-icon">${SEALED_FACE}</span><span class="ct-row-text"><b>Sealed upgrade</b><small>A card buy opens it</small></span></button></li>`;
    const level = nodeLevel(tree.levels, card, node.id), cap = nodeCap(tree.opened, card, node), state = nodeState(tree, card, node), refusal = why(node.id);
    const { rarity, upgraded } = lookOf(tree.opened, card, node);
    const next = level < cap ? statText(node, level + 1).join("; ") : "";
    const action = state === "owned"
      ? `<span class="ug-owned">Full</span>`
      : `<button type="button" class="ug-buy" data-ct-raise="${node.id}"${refusal ? " disabled" : ""} aria-label="Buy a level of ${nodeName(card, node)} with a card point">Buy</button>`;
    return `<li class="ct-row ${state} r-${rarity}${node.id === picked ? " picked" : ""}" ${at}>`
      + `<button type="button" class="ct-row-main" data-ct-pick="${node.id}" aria-label="${nodeLabel(card, tree, node, refusal)}">`
      + `<span class="ct-detail-icon r-${rarity}">${nodeIcon(node)}</span>`
      + `<span class="ct-row-text"><b>${nodeName(card, node)}</b><small class="ct-state ${state}">${rarityStarsHtml(rarity, upgraded)}${CARD_RARITY_NAMES[rarity]} · ${capital(STATE_WORDS[state])} · ${level}/${cap}</small>${levelPips(level, cap)}`
      + `<small>${level ? statText(node, level).join("; ") : "Nothing yet"}${next ? ` <span class="ct-next">→ ${next}</span>` : ""}</small>`
      + (refusal && state !== "owned" ? `<small class="ug-locked">${refusal}</small>` : "")
      + `</span></button>${action}</li>`;
  });
  return `<ul class="ct-list" aria-label="Upgrades">${rows.join("")}</ul>`;
}

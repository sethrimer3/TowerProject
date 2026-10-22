/** Card buys: cards bought with Gems, each a draw that opens one more
 * level on a card's tree (card-trees.ts), so the card's max level rises by
 * one. A draw rolls a rarity (`CARD_RARITY_WEIGHTS`), then picks a card of
 * the deck with room in that rarity, and opens a level of that rarity on
 * it: a node of that rarity no buy has opened yet first (at one level), and
 * once every one is open, one more level on one of them. With no card of
 * the deck left with room in it, the draw picks any card with a level left
 * to open, which takes the next rarer it has room in (or, with none rarer,
 * the rarest commoner). Draws carry on one stream
 * saved with the profile, seeded once when the profile is made, never
 * rewound, so a purchase can't be redrawn by reloading. */
import { CARD_IDS, type CardId } from "./cards.ts";
import { CARD_RARITIES, CARD_RARITY_WEIGHTS, rarityRank, type CardRarity } from "./card-rarity.ts";
import { CARD_TREES, cardLook, cardMaxLevel, nodeCap, type CardOpened, type CardTreeNode } from "./card-trees.ts";
import { isRecord, wholeIn } from "./decode.ts";
import { random } from "./random.ts";

/** Where the card buys' stream stands (null until the profile seeds it),
 * and the levels they opened on each card's tree. */
export type CardBuysSave = { rng: number | null; opened: CardOpened };
export const defaultCardBuys = (): CardBuysSave => ({ rng: null, opened: {} });

/** The Gems one card buy costs, and ten bought at once. */
export const CARD_BUY_GEMS = { 1: 20, 10: 200 } as const;
export type CardBuyCount = keyof typeof CARD_BUY_GEMS;

/** The levels card buys can still open on node `node` of `card`. */
const nodeRoom = (opened: CardOpened, card: CardId, node: CardTreeNode) => node.max - nodeCap(opened, card, node);
/** The levels card buys can still open on `card`'s nodes of `rarity`
 * (every rarity's without one). */
export const roomIn = (opened: CardOpened, card: CardId, rarity?: CardRarity) =>
  (CARD_TREES[card] ?? []).reduce((sum, node) => sum + (rarity && node.rarity !== rarity ? 0 : nodeRoom(opened, card, node)), 0);
/** How many card buys `cards` (the deck's) can still take: every level
 * left to open on their trees. */
export const buysLeft = (opened: CardOpened, cards: readonly CardId[]) => cards.reduce((sum, card) => sum + roomIn(opened, card), 0);

/** One card buy: the card it went to, the rarity it opened, the node and
 * how many levels that node holds now (`cap`), whether the buy opened the
 * node (`fresh`), and the card's max level and look before and after. */
export type CardBuy = {
  card: CardId; rarity: CardRarity; node: string; cap: number; fresh: boolean;
  maxLevel: { before: number; after: number };
  look: { before: CardRarity; after: CardRarity };
};

/** The rarity a card buy rolled. */
function rollRarity(rng: () => number): CardRarity {
  let roll = rng() * CARD_RARITIES.reduce((n, r) => n + CARD_RARITY_WEIGHTS[r], 0);
  return CARD_RARITIES.find((r) => (roll -= CARD_RARITY_WEIGHTS[r]) < 0) ?? "common";
}

/** The rarity a buy that rolled `rolled` opens on `card`: the rolled one
 * while it has room, else the next rarer with room, else the rarest
 * commoner with room. */
export function rarityOn(opened: CardOpened, card: CardId, rolled: CardRarity): CardRarity | null {
  const open = CARD_RARITIES.filter((r) => roomIn(opened, card, r) > 0);
  if (open.includes(rolled)) return rolled;
  return open.find((r) => rarityRank(r) > rarityRank(rolled)) ?? open.at(-1) ?? null;
}

/** One card buy among `cards`, opening its level in `m`; null once no
 * card has a level left to open. `rng` gives three numbers: the rarity,
 * the card (among those with room in the rarity, else among all with
 * room) and the node. */
export function buyOne(m: CardBuysSave, cards: readonly CardId[], rng: () => number): CardBuy | null {
  const pool = cards.filter((card) => roomIn(m.opened, card) > 0);
  if (!pool.length) return null;
  const rolled = rollRarity(rng);
  const fits = pool.filter((card) => roomIn(m.opened, card, rolled) > 0), from = fits.length ? fits : pool;
  const card = from[Math.min(from.length - 1, Math.floor(rng() * from.length))];
  const rarity = rarityOn(m.opened, card, rolled)!;
  const nodes = (CARD_TREES[card] ?? []).filter((n) => n.rarity === rarity);
  const sealed = nodes.filter((n) => !nodeCap(m.opened, card, n));
  const among = sealed.length ? sealed : nodes.filter((n) => nodeRoom(m.opened, card, n) > 0);
  const node = among[Math.min(among.length - 1, Math.floor(rng() * among.length))];
  const before = { maxLevel: cardMaxLevel(m.opened, card), look: cardLook(m.opened, card).rarity };
  const levels = (m.opened[card] ??= {});
  levels[node.id] = (levels[node.id] ?? 0) + 1;
  return {
    card, rarity, node: node.id, cap: nodeCap(m.opened, card, node), fresh: sealed.length > 0,
    maxLevel: { before: before.maxLevel, after: cardMaxLevel(m.opened, card) },
    look: { before: before.look, after: cardLook(m.opened, card).rarity },
  };
}

/** mulberry32's step: each number drawn moves the state on by this much. */
const STEP = 0x6d2b79f5;
/** Seeds the card buys' stream once, from `seed`: a profile's own, for
 * the life of the profile. */
export function seedCardBuys(m: CardBuysSave, seed: () => number) {
  m.rng ??= Math.floor(seed() * 4294967296);
}
/** Up to `count` card buys among `cards`, carrying on the saved stream
 * (seeding it from `seed` if the profile hasn't yet) and saving where it
 * stands after. */
export function buyCards(m: CardBuysSave, cards: readonly CardId[], count: number, seed: () => number): CardBuy[] {
  seedCardBuys(m, seed);
  const state = m.rng!, rng = random(state);
  let used = 0;
  const counted = () => (used++, rng());
  const buys: CardBuy[] = [];
  for (let i = 0; i < count; i++) {
    const buy = buyOne(m, cards, counted);
    if (!buy) break;
    buys.push(buy);
  }
  m.rng = (state + Math.imul(used, STEP)) >>> 0;
  return buys;
}

/** A saved `cardBuys`: the stream's state, and the levels opened on known
 * nodes of known cards, each whole and no more than the node has room for. */
export function decodeCardBuys(raw: unknown): CardBuysSave {
  const m = defaultCardBuys();
  if (!isRecord(raw)) return m;
  if (wholeIn(raw.rng, 0, 4294967295)) m.rng = raw.rng;
  if (!isRecord(raw.opened)) return m;
  for (const card of CARD_IDS) {
    const saved = raw.opened[card], nodes = CARD_TREES[card];
    if (!isRecord(saved) || !nodes) continue;
    const kept: Record<string, number> = {};
    for (const node of nodes) if (wholeIn(saved[node.id], 1, node.max - node.levels)) kept[node.id] = saved[node.id] as number;
    if (Object.keys(kept).length) m.opened[card] = kept;
  }
  return m;
}

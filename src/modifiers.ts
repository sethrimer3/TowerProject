import { CARD_IDS, deckCards, type CardId } from "./cards.ts";
import type { UpgradeId } from "./config.ts";
import { isRecord, wholeIn } from "./decode.ts";
import { random } from "./random.ts";

// Card modifiers: tokens bought with Gems and attached to cards, each
// changing what its card does when it activates (reaches its target, or
// acts where the hero stands). This module holds what is data and pure
// rule: the stock, the levels copies reach, the draw, and which card holds
// which token. The game reads them in `state.ts` (activation) and
// `cards.ts` (gates and targeting).

export type ModifierRarity = "common" | "rare" | "epic";
/** How each rarity is drawn, against the others with a modifier left to draw. */
export const RARITY_WEIGHTS: Record<ModifierRarity, number> = { common: 70, rare: 27, epic: 3 };

/** What a modifier does: `reward`s pay on activation, `gate`s let the card
 * act only while their condition holds (a Focus overrides them), and the
 * rest (`aim`) change which target the card picks. */
export type ModifierKind = "reward" | "gate" | "aim";

type ModifierDef = {
  name: string;
  rarity: ModifierRarity;
  kind: ModifierKind;
  /** The token's symbol and its colour. */
  glyph: string;
  color: string;
  /** The modifier's value at each level, 1 to 7. A gate's are the
   * thresholds the player chooses among: level L opens the first L. */
  values: readonly number[];
  /** What it does with value `v`, as the player reads it. */
  text: (v: number) => string;
  /** The upgrade that adds it to the draw pool; absent for the stock ones. */
  unlock?: UpgradeId;
};

const LEVELS = [1, 2, 3, 4, 5, 6, 7];
const SQUARES = [1, 4, 9, 16, 25, 36, 49];
const KEY_LIMITS = [10, 8, 6, 4, 3, 2, 1];
const COOLDOWNS = [7, 6, 5, 4, 3, 2, 1];
const every = (n: number) => (n === 1 ? "every floor" : `once every ${n} floors`);

/** Every card modifier, in the order the Modifiers box lists them. */
export const MODIFIERS = {
  hp: { name: "HP", rarity: "common", kind: "reward", glyph: "♥", color: "#ff6b6b", values: SQUARES, text: (v) => `Gain ${v} HP each time the card activates.` },
  silverTouch: { name: "Silver Touch", rarity: "common", kind: "reward", glyph: "◉", color: "#d6dde6", values: LEVELS, text: (v) => `Gain ${v} Silver each time the card activates (Silver bonuses apply).` },
  goldback: { name: "Goldback", rarity: "common", kind: "reward", glyph: "⇥", color: "#f5c542", values: LEVELS, text: (v) => `On the last card in the hand, gain ${v} Gold each time it activates (Gold bonuses apply).` },
  xp: { name: "XP", rarity: "common", kind: "reward", glyph: "✧", color: "#9be86f", values: SQUARES, text: (v) => `Gain ${v} XP each time the card activates, rising with the floor like a kill's XP.` },
  hpGate: { name: "HP <", rarity: "common", kind: "gate", glyph: "♡", color: "#ff9b8a", values: [100, 90, 75, 50, 35, 20, 5], text: (v) => `The card acts only while HP is below ${v}% of max HP.` },
  hpPercent: { name: "HP %", rarity: "rare", kind: "reward", glyph: "♥", color: "#ff4fa3", values: LEVELS, text: (v) => `Gain ${v}% of max HP each time the card activates.` },
  goldTouch: { name: "Gold Touch", rarity: "rare", kind: "reward", glyph: "◉", color: "#ffc93c", values: LEVELS, text: (v) => `Gain ${v} Gold each time the card activates (Gold bonuses apply).` },
  yellowGate: { name: "YK <", rarity: "rare", kind: "gate", glyph: "⚿", color: "#f2d24b", values: KEY_LIMITS, text: (v) => `The card acts only while you hold fewer than ${v} yellow keys.` },
  blueGate: { name: "BK <", rarity: "rare", kind: "gate", glyph: "⚿", color: "#5aa9ff", values: KEY_LIMITS, text: (v) => `The card acts only while you hold fewer than ${v} blue keys.` },
  redGate: { name: "RK <", rarity: "epic", kind: "gate", glyph: "⚿", color: "#ff5a5a", values: KEY_LIMITS, text: (v) => `The card acts only while you hold fewer than ${v} red keys.` },
  stairward: { name: "Stairward", rarity: "epic", kind: "aim", glyph: "⇡", color: "#7fe0ff", values: COOLDOWNS, text: (v) => `Picks the target nearest the stairs (in the Delve, the highest) rather than the nearest to you; works ${every(v)}.` },
  skipOpen: { name: "Skip Open Nodes", rarity: "epic", kind: "aim", glyph: "⤳", color: "#c08bff", values: COOLDOWNS, text: (v) => `Skips, and marks, any door or monster that opens no new ground, for the rest of the floor; works ${every(v)}.` },
  charge: { name: "Charge", rarity: "epic", kind: "aim", glyph: "»", color: "#ff9a3c", values: LEVELS, text: (v) => `The card's path may charge through up to ${v} monster${v === 1 ? "" : "s"} or door${v === 1 ? "" : "s"} you can open on the way to its target.` },
} as const satisfies Record<string, ModifierDef>;
export type ModifierId = keyof typeof MODIFIERS;
export const MODIFIER_IDS = Object.keys(MODIFIERS) as ModifierId[];
export const modifierDef = (id: ModifierId): ModifierDef => MODIFIERS[id];

/** The copies each level past the first takes, levels 2 to 7. The copy that
 * opens level 1 counts toward level 2's. */
export const COPIES_FOR_LEVEL = [3, 5, 8, 12, 20, 32] as const;
export const MAX_MODIFIER_LEVEL = COPIES_FOR_LEVEL.length + 1;
/** The copies that reach each level from 2 up: 3, 8, 16, 28, 48, 80. */
const COPIES_TO = COPIES_FOR_LEVEL.map((_, i) => COPIES_FOR_LEVEL.slice(0, i + 1).reduce((a, b) => a + b, 0));
/** The copies that reach the top level. */
export const MAX_COPIES = COPIES_TO[COPIES_TO.length - 1];

/** The level `copies` copies reach: 0 with none. */
export function modifierLevel(copies: number) {
  if (copies <= 0) return 0;
  return 1 + COPIES_TO.filter((n) => copies >= n).length;
}
/** Progress toward the next level: copies gathered at this level and the
 * copies it takes, or null at the top level (or with none). */
export function levelProgress(copies: number): { have: number; need: number } | null {
  const level = modifierLevel(copies);
  if (level === 0 || level >= MAX_MODIFIER_LEVEL) return null;
  const from = level === 1 ? 0 : COPIES_TO[level - 2];
  return { have: copies - from, need: COPIES_FOR_LEVEL[level - 1] };
}

/** One owned modifier: the copies drawn (its level follows from them) and,
 * for a gate, which of its opened thresholds the player chose. */
export type OwnedModifier = { copies: number; pick: number };
/** What the profile keeps of card modifiers. */
export type ModifiersSave = {
  owned: Partial<Record<ModifierId, OwnedModifier>>;
  /** Which modifier each card holds: one each, and each modifier on one
   * card at most. */
  cards: Partial<Record<CardId, ModifierId>>;
  /** Where the draws' stream stands, so every purchase carries on the same
   * sequence (a reload can't draw again); null until the first draw seeds it. */
  rng: number | null;
};
export const defaultModifiers = (): ModifiersSave => ({ owned: {}, cards: {}, rng: null });

/** The modifier's level as owned (0 when not). */
export const ownedLevel = (m: ModifiersSave, id: ModifierId) => modifierLevel(m.owned[id]?.copies ?? 0);

/** The value a gate checks against: the threshold the player picked among
 * those its level opened. Others: their value at their level. */
export function modifierValue(id: ModifierId, level: number, pick = 0) {
  const values = MODIFIERS[id].values;
  if (MODIFIERS[id].kind === "gate") return values[Math.max(0, Math.min(pick, level - 1))];
  return values[Math.max(0, Math.min(level, values.length) - 1)];
}

/** Whether `id` can still be drawn: in the pool (its unlock owned, if it
 * has one) and below the top level. */
export function drawable(m: ModifiersSave, id: ModifierId, upgrades: Record<UpgradeId, number>) {
  const unlock = modifierDef(id).unlock;
  return (!unlock || upgrades[unlock] > 0) && (m.owned[id]?.copies ?? 0) < MAX_COPIES;
}
/** How many more copies the pool holds before every modifier in it is at
 * the top level. */
export function copiesLeft(m: ModifiersSave, upgrades: Record<UpgradeId, number>) {
  return MODIFIER_IDS.filter((id) => drawable(m, id, upgrades)).reduce((n, id) => n + MAX_COPIES - (m.owned[id]?.copies ?? 0), 0);
}

/** One modifier drawn: which, and its copies before and after. */
export type ModifierDraw = { id: ModifierId; before: number; after: number };

/** Draws one modifier from the pool, by rarity (each rarity's weight shared
 * among the rarities that still have one to draw), then evenly among that
 * rarity's; null once the pool is empty. `rng` gives the two numbers. */
export function drawOne(m: ModifiersSave, upgrades: Record<UpgradeId, number>, rng: () => number): ModifierDraw | null {
  const open = MODIFIER_IDS.filter((id) => drawable(m, id, upgrades));
  if (!open.length) return null;
  const rarities = (Object.keys(RARITY_WEIGHTS) as ModifierRarity[]).filter((r) => open.some((id) => MODIFIERS[id].rarity === r));
  let roll = rng() * rarities.reduce((n, r) => n + RARITY_WEIGHTS[r], 0);
  const rarity = rarities.find((r) => (roll -= RARITY_WEIGHTS[r]) < 0) ?? rarities[rarities.length - 1];
  const among = open.filter((id) => MODIFIERS[id].rarity === rarity);
  const id = among[Math.min(among.length - 1, Math.floor(rng() * among.length))];
  const before = m.owned[id]?.copies ?? 0;
  m.owned[id] = { copies: before + 1, pick: m.owned[id]?.pick ?? 0 };
  return { id, before, after: before + 1 };
}

/** mulberry32's step: each draw moves the state on by this much. */
const STEP = 0x6d2b79f5;
/** Draws up to `count` modifiers, carrying on the saved stream (seeding it
 * from `seed` the first time) and saving where it stands after. */
export function drawModifiers(m: ModifiersSave, upgrades: Record<UpgradeId, number>, count: number, seed: () => number): ModifierDraw[] {
  const state = m.rng ?? Math.floor(seed() * 4294967296);
  const rng = random(state);
  let used = 0;
  const counted = () => (used++, rng());
  const draws: ModifierDraw[] = [];
  for (let i = 0; i < count; i++) {
    const draw = drawOne(m, upgrades, counted);
    if (!draw) break;
    draws.push(draw);
  }
  m.rng = (state + Math.imul(used, STEP)) >>> 0;
  return draws;
}

/** The card holding modifier `id`, if any. */
export const cardWith = (m: ModifiersSave, id: ModifierId) =>
  (Object.keys(m.cards) as CardId[]).find((card) => m.cards[card] === id);

/** Attaches `id` to `card`. The token leaves any card it was on; a token
 * already on `card` swaps over to that card, or comes off when `id` was
 * on none. */
export function attachModifier(m: ModifiersSave, id: ModifierId, card: CardId) {
  const from = cardWith(m, id), there = m.cards[card];
  if (from === card) return;
  m.cards[card] = id;
  if (!from) return;
  if (there) m.cards[from] = there;
  else delete m.cards[from];
}
/** Takes modifier `id` off its card. */
export function detachModifier(m: ModifiersSave, id: ModifierId) {
  const card = cardWith(m, id);
  if (!card) return false;
  delete m.cards[card];
  return true;
}

/** A modifier on a card in a run: which, its level, and a gate's pick,
 * fixed as the run goes inside. */
export type RunModifier = { id: ModifierId; level: number; pick: number };
/** The modifiers on the hand's cards, as a run going inside takes them. */
export function runModifiers(m: ModifiersSave, hand: readonly CardId[]): Partial<Record<CardId, RunModifier>> {
  const out: Partial<Record<CardId, RunModifier>> = {};
  for (const card of hand) {
    const id = m.cards[card], owned = id && m.owned[id];
    if (id && owned) out[card] = { id, level: modifierLevel(owned.copies), pick: owned.pick };
  }
  return out;
}

/** A run's modifiers: known cards, each holding a known modifier at a
 * level it can have. */
export const validRunModifiers = (v: unknown) =>
  isRecord(v) && Object.entries(v).every(([card, r]) =>
    CARD_IDS.includes(card as CardId) && isRecord(r) && MODIFIER_IDS.includes(r.id) &&
    wholeIn(r.level, 1, MAX_MODIFIER_LEVEL) && wholeIn(r.pick, 0, MAX_MODIFIER_LEVEL - 1));

/** The saved modifiers: known ones with a whole count of copies (at most the
 * top level's) and a pick their level has opened; cards holding owned
 * modifiers, each on one card, among the cards the player owns. */
export function decodeModifiers(raw: unknown, upgrades: Record<UpgradeId, number>): ModifiersSave {
  const m = defaultModifiers();
  if (!isRecord(raw)) return m;
  if (isRecord(raw.owned)) for (const id of MODIFIER_IDS) {
    const o = raw.owned[id];
    if (!isRecord(o) || !wholeIn(o.copies, 1, MAX_COPIES)) continue;
    const level = modifierLevel(o.copies);
    m.owned[id] = { copies: o.copies, pick: wholeIn(o.pick, 0, level - 1) ? o.pick : 0 };
  }
  const owned = deckCards(upgrades);
  if (isRecord(raw.cards)) for (const card of owned) {
    const id = raw.cards[card];
    if (MODIFIER_IDS.includes(id) && m.owned[id as ModifierId] && !cardWith(m, id)) m.cards[card] = id;
  }
  if (wholeIn(raw.rng, 0, 4294967295)) m.rng = raw.rng;
  return m;
}

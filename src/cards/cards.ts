import { point, type Tile, type KeyColor } from "../entities.ts";
import { litTorches, takesSomething, type Position } from "../board.ts";
import type { Step } from "../pathfinding.ts";
import { doorCost, doorDiscount, doorId, doorKeyScale, keyNeed, drainsHp, isYellowDoor, woodToll, doorRule, type DoorDiscounts, type DoorKind } from "../doors.ts";
import { impervious } from "../combat.ts";
import { snap } from "../exact.ts";
import { UPGRADES, type UpgradeId } from "../progression/upgrades.ts";
import type { TrainingId } from "../progression/training.ts";
import type { DelveRun } from "../runs.ts";
import type { EnemyStrength, Mode } from "../entities.ts";
import type { Save } from "../save/shape.ts";
import { goalUnlocked, type GoalUnlock } from "../goals.ts";
import { arrowDamage, enemiesWithin } from "../enemies/ranged.ts";
import { FOE_ATTACK, FOE_GOLD, isFoeCard, type FoeCard } from "./foe-cards.ts";

/** What a card gives, on top of where it moves the hero, for as long as the
 * run's hand holds it, whichever card leads the hero there. */
export type CardBonus = {
  /** Each key of `color` picked up off the floor is worth `percent` more,
   * and pays `gold` more Pickup Gold (raised by Gold Bonus as its own is). */
  key?: { color: KeyColor; percent: number; gold: number };
  /** Each treasure chest opened has a `supply` percent chance of being a
   * Supply Chest, and an `equipment` percent chance of being an Equipment
   * Chest (one roll for both, once Equipment is open). */
  chest?: { supply: number; equipment: number };
  /** The Archer's arrows strike with `attack` percent more Shot ATK
   * (multiplying each arrow's ATK) and charge `speed` percent faster
   * (multiplying Attack Speed). */
  shot?: { attack: number; speed: number };
  /** The Archer's arrows strike bosses and Greater Bosses with `attack`
   * percent more ATK, added to the Shot ATK (multiplying each such arrow's
   * ATK); fights are untouched. */
  boss?: { attack: number };
  /** The hero strikes the enemies an enemy card covers (`FOE_CARDS`) with
   * `attack` percent more ATK, and each one's kill drops `gold` percent more
   * Gold, multiplying every other Gold bonus. */
  foe?: { attack: number; gold: number };
  /** Each door of `kind` costs `percent` less (`DoorDiscounts`): its keys,
   * and the HP it drains or breaking it takes, each its own factor beside
   * Key Efficiency, Heart Door Resilience and a badge's scale. */
  door?: { kind: DoorKind; percent: number };
};
type CardDef = { name: string; text: string; bonus?: CardBonus };

/** What each enemy card but ENEMY gives against the enemies it covers. */
const FOE = { foe: { attack: FOE_ATTACK, gold: FOE_GOLD } } as const;
/** The percent less each door card's doors cost. */
export const DOOR_CARD_DISCOUNT = 5;

/** Every card a hand can hold: its name, what it moves the hero toward,
 * and any bonus it gives while held (`bonus`). */
export const CARDS = {
  stairs: { name: "Stairs", text: "Move toward the stairs up (in the Delve, the highest open tile it can reach, above any row reached this run)." },
  heal: { name: "Heal", text: "Move toward the closest healing potion." },
  door: { name: "Door", text: "Move toward the closest door you hold the keys for, or a Wooden Door you can break down." },
  key: { name: "Key", text: "Move toward the closest key of any colour." },
  yellowKey: { name: "Gold Key", text: "Move toward the closest gold key.", bonus: { key: { color: "yellow", percent: 5, gold: 1 } } },
  blueKey: { name: "Blue Key", text: "Move toward the closest blue key.", bonus: { key: { color: "blue", percent: 5, gold: 2 } } },
  monster: { name: "Enemy", text: "Move toward the closest enemy." },
  atkUp: { name: "ATK Up", text: "Move toward the closest ATK pickup." },
  defUp: { name: "DEF Up", text: "Move toward the closest DEF pickup." },
  keySiphon: { name: "GK Siphon", text: "Trade Max HP training levels for a gold key, without moving, for the rest of the run. The first use takes 1 level and each use after takes 1 more (2, then 3…). Skipped without enough levels left." },
  yellowDoor: { name: "Gold Door", text: "Move toward the closest gold door, while you hold a gold key.", bonus: { door: { kind: "yellow", percent: DOOR_CARD_DISCOUNT } } },
  heartDoor: { name: "Heart Door", text: "Move toward the closest Heart Door.", bonus: { door: { kind: "heart", percent: DOOR_CARD_DISCOUNT } } },
  weakEnemy: { name: "Weak Enemy", text: "Move toward the closest weak enemy.", bonus: FOE },
  baseEnemy: { name: "Base Enemy", text: "Move toward the closest enemy that is neither weak, strong, elite nor a boss.", bonus: FOE },
  strongEnemy: { name: "Strong Enemy", text: "Move toward the closest strong enemy.", bonus: FOE },
  eliteEnemy: { name: "Elite Enemy", text: "Move toward the closest elite enemy.", bonus: FOE },
  bossEnemy: { name: "Boss Enemy", text: "Move toward the closest boss or Greater Boss.", bonus: FOE },
  nonBossEnemy: { name: "Non-Boss Enemy", text: "Move toward the closest enemy that is not a boss or Greater Boss.", bonus: FOE },
  fastEnemy: { name: "Fast Enemy", text: "Move toward the closest Fast enemy.", bonus: FOE },
  chest: { name: "Chest", text: "Move toward the closest closed chest: a treasure chest or an area reward chest.", bonus: { chest: { supply: 1.5, equipment: 0.5 } } },
  blueSiphon: { name: "BK Siphon", text: "Trade DEF training levels for a blue key, without moving, for the rest of the run. The first use takes 1 level and each use after takes 1 more (2, then 3…). Skipped without enough levels left." },
  blueTrader: { name: "BK Trader", text: "Trade 3 gold keys for a blue key, without moving. Skipped with fewer than 3 gold keys." },
  keyToHp: { name: "GK to HP", text: "Trade a gold key for 10% of your max HP, without moving. Skipped without a gold key, or while you are missing less than 10% of your max HP." },
  redKey: { name: "Red Key", text: "Move toward the closest red key.", bonus: { key: { color: "red", percent: 5, gold: 3 } } },
  redSiphon: { name: "RK Siphon", text: "Trade ATK training levels for a red key, without moving, for the rest of the run. The first use takes 1 level and each use after takes 1 more (2, then 3…). Skipped without enough levels left." },
  torch: { name: "Torch", text: "Move toward the closest lit torch, putting it out." },
  woodenDoor: { name: "Wooden Door", text: "Move toward the closest Wooden Door you hold a key for, or can break down and survive.", bonus: { door: { kind: "wood", percent: DOOR_CARD_DISCOUNT } } },
  flyingEnemy: { name: "Flying Enemy", text: "Move toward the closest Flying enemy your arrows can hurt, stopping once one is within your Attack Range, and wait there while one is.", bonus: { shot: { attack: 5, speed: 5 }, ...FOE } },
  archer: { name: "Archer", text: "Never moves you. While it is in your hand, you fire arrows at the closest enemy within your Attack Range, and your Archer training can be raised with Silver in the run.", bonus: { boss: { attack: 5 } } },
} as const;
export type CardId = keyof typeof CARDS;
export const CARD_IDS = Object.keys(CARDS) as CardId[];
/** The siphon cards: the training row each drains for the rest of the run,
 * and the key it gives for them. */
export const SIPHONS = {
  keySiphon: { row: "hp", color: "yellow" },
  blueSiphon: { row: "defense", color: "blue" },
  redSiphon: { row: "attack", color: "red" },
} as const satisfies Partial<Record<CardId, { row: TrainingId; color: KeyColor }>>;
export type SiphonCard = keyof typeof SIPHONS;
export const isSiphon = (id: CardId): id is SiphonCard => id in SIPHONS;
/** BK TRADER's price: the gold keys it trades for one blue key. */
export const TRADER_YELLOW_KEYS = 3;
/** GK TO HP's heal: this percent of max HP for one gold key. */
export const KEY_TO_HP_PERCENT = 10;
/** What card `id` does, as the player is told: STAIRS says how it climbs
 * in the Delve only once Into the depths is owned. */
export function cardText(id: CardId, upgrades: Record<UpgradeId, number>): string {
  return id === "stairs" && !upgrades.delve ? "Move toward the stairs up." : CARDS[id].text;
}
/** What card `id` gives while held, if anything (`CardBonus`). */
export const cardBonus = (id: CardId): CardBonus | undefined => (CARDS[id] as CardDef).bonus;
/** A card bonus's lines as the player reads them, each with its tone: a
 * Supply Chest's chance light blue, an Equipment Chest's purple, the rarer. */
export function cardBonusLines(id: CardId): { text: string; tone: "plain" | "supply" | "equipment" }[] {
  const bonus = cardBonus(id), key = bonus?.key, chest = bonus?.chest, shot = bonus?.shot, boss = bonus?.boss, foe = bonus?.foe, door = bonus?.door;
  // "Weak Enemy" covers Weak Enemies.
  const foes = CARDS[id].name.replace(/Enemy$/, "Enemies");
  return [
    ...(boss ? [{ text: `+${boss.attack}% Shot ATK for Bosses`, tone: "plain" as const }] : []),
    ...(shot ? [{ text: `+${shot.attack}% Shot ATK`, tone: "plain" as const }, { text: `+${shot.speed}% Attack Speed`, tone: "plain" as const }] : []),
    ...(key ? [{ text: `+${key.percent}% ${CARDS[`${key.color}Key`].name}s`, tone: "plain" as const }, { text: `+${key.gold} Gold a key`, tone: "plain" as const }] : []),
    ...(chest ? [{ text: `${chest.supply}% Supplies`, tone: "supply" as const }, { text: `${chest.equipment}% Equipment`, tone: "equipment" as const }] : []),
    ...(foe ? [{ text: `+${foe.attack}% ATK vs ${foes}`, tone: "plain" as const }, { text: `+${foe.gold}% Gold from ${foes}`, tone: "plain" as const }] : []),
    ...(door ? [{ text: `−${door.percent}% ${CARDS[id].name} cost`, tone: "plain" as const }] : []),
  ];
}
/** A card bonus's lines as one line of plain text, for a tooltip ("" for none). */
export const cardBonusText = (id: CardId) => cardBonusLines(id).map((l) => l.text).join(" · ");
/** What the cards of `hand` give while held, added up: for each key colour
 * the percent more each key is worth and the Gold it pays more, a
 * treasure chest's chances, in percent, of being a Supply or Equipment
 * Chest, the percent more Shot ATK and Attack Speed the arrows have, the
 * percent more ATK the arrows strike bosses with, each enemy card's
 * ATK and Gold percents against the enemies it covers (`foe`, by card), and
 * the percent less each kind of door costs (`doors`). */
export function handBonus(hand: readonly CardId[]) {
  const keys: Partial<Record<KeyColor, { percent: number; gold: number }>> = {};
  const chest = { supply: 0, equipment: 0 }, shot = { attack: 0, speed: 0 };
  const foe: Partial<Record<FoeCard, { attack: number; gold: number }>> = {};
  const doors: DoorDiscounts = {};
  let boss = 0;
  for (const id of new Set(hand)) {
    const bonus = cardBonus(id);
    if (bonus?.foe && isFoeCard(id)) foe[id] = { ...bonus.foe };
    if (bonus?.door) doors[bonus.door.kind] = (doors[bonus.door.kind] ?? 0) + bonus.door.percent;
    if (bonus?.boss) boss += bonus.boss.attack;
    if (bonus?.shot) {
      shot.attack += bonus.shot.attack;
      shot.speed += bonus.shot.speed;
    }
    if (bonus?.key) {
      const k = (keys[bonus.key.color] ??= { percent: 0, gold: 0 });
      k.percent += bonus.key.percent;
      k.gold += bonus.key.gold;
    }
    if (bonus?.chest) {
      chest.supply = snap(chest.supply + bonus.chest.supply);
      chest.equipment = snap(chest.equipment + bonus.chest.equipment);
    }
  }
  return { keys, chest, shot: { ...shot, boss }, foe, doors };
}
export type HandBonus = ReturnType<typeof handBonus>;

/** How many cards a hand holds before Larger Hand, and at most, with
 * Larger Hand's slot and every slot bought with Gems. */
export const BASE_HAND_SLOTS = 4;
/** What each hand slot bought with Gems costs, in order (Larger Hand opens
 * them). */
export const HAND_SLOT_GEMS = [
  50, 100, 200, 300, 400, 500, 600, 750, 1000, 1200, 1400, 1600, 1800, 2500, 3500, 4500, 5500, 6500, 7500, 8500, 10000,
] as const;
export const MAX_HAND_SLOTS = BASE_HAND_SLOTS + 1 + HAND_SLOT_GEMS.length;
/** How many cards the player's hand holds: the base, one more with Larger
 * Hand, and each slot bought with Gems. */
export const handSlots = (save: { upgrades: Record<UpgradeId, number>; handSlots: number }) =>
  BASE_HAND_SLOTS + (save.upgrades.largerHand ? 1 + save.handSlots : 0);
/** The Gems the next hand slot costs, or null when there is none to buy
 * (Larger Hand not owned, or every slot bought). */
export const nextHandSlotGems = (save: { upgrades: Record<UpgradeId, number>; handSlots: number }) =>
  save.upgrades.largerHand ? HAND_SLOT_GEMS[save.handSlots] ?? null : null;
/** The hand a new profile starts with, in priority order: its whole deck.
 * HEAL, GOLD KEY, ATK UP, DEF UP and BLUE KEY are earned from the Inspiration tree. */
export const BASE_HAND: readonly CardId[] = ["stairs", "door", "key", "monster"];
/** The cards a Goal adds to the deck once claimed (goals.ts). */
export const GOAL_CARDS: Partial<Record<GoalUnlock, CardId>> = { archerCard: "archer", flyingEnemyCard: "flyingEnemy" };
/** Whether `hand` makes the hero an Archer: it holds ARCHER, so its arrows
 * fly and its Archer training rows can be raised in the run. */
export const shootsWith = (hand: readonly CardId[]) => hand.includes("archer");
/** The cards the player owns, in `CARDS` order: the base hand's, each card
 * whose upgrade is owned, and each card whose Goal is claimed (`goals`;
 * none without). A hand holds any of them, but always STAIRS. */
export function deckCards(upgrades: Record<UpgradeId, number>, goals?: Pick<Save, "goals">["goals"]): CardId[] {
  const earned = UPGRADES.flatMap((u) => ("card" in u && upgrades[u.id] ? [u.card as CardId] : []));
  if (goals) for (const [unlock, card] of Object.entries(GOAL_CARDS)) if (goalUnlocked({ goals }, unlock as GoalUnlock)) earned.push(card);
  return CARD_IDS.filter((id) => BASE_HAND.includes(id) || earned.includes(id));
}
/** The card an upgrade adds to the deck, if any. */
export const upgradeCard = (id: UpgradeId): CardId | undefined => {
  const u = UPGRADES.find((u) => u.id === id);
  return u && "card" in u ? (u.card as CardId) : undefined;
};

/** `hand` with the card at `from` moved to slot `to`, each card between
 * the two shifting one slot over to make room. */
export function moveCard(hand: readonly CardId[], from: number, to: number): CardId[] {
  const next = [...hand];
  const [card] = next.splice(from, 1);
  next.splice(to, 0, card);
  return next;
}

/** A link between two cards side by side in the hand (Card Groups): the
 * left card, then the right. Cards joined by links form a group, whose
 * cards share one priority. */
export type CardLink = readonly [CardId, CardId];
const joins = (links: readonly CardLink[], a: CardId, b: CardId | undefined) => links.some(([l, r]) => l === a && r === b);
/** For each card of `hand`, whether a link joins it to the card after it. */
export const linkedToNext = (hand: readonly CardId[], links: readonly CardLink[]) => hand.map((id, i) => joins(links, id, hand[i + 1]));
/** The links that still join cards side by side in `hand`, left to right:
 * a link breaks once either card moves out of place. */
export const keptLinks = (hand: readonly CardId[], links: readonly CardLink[]): CardLink[] =>
  hand.flatMap((id, i): CardLink[] => (joins(links, id, hand[i + 1]) ? [[id, hand[i + 1]!]] : []));
/** `links` with the cards in slots `i` and `i + 1` of `hand` linked, or
 * unlinked when they were. */
export function toggleLink(hand: readonly CardId[], links: readonly CardLink[], i: number): CardLink[] {
  const kept = keptLinks(hand, links), a = hand[i]!, b = hand[i + 1]!;
  return joins(kept, a, b) ? kept.filter(([l, r]) => l !== a || r !== b) : keptLinks(hand, [...kept, [a, b]]);
}

/** `hand` with deck card `id` dropped on slot `slot` of a hand of `slots`:
 * with room, it goes into that slot (or after the last card, for an empty
 * slot), each card from there sliding one slot later; in a full hand it
 * takes the slot's place, the card there going back to the deck. Null when
 * that card is STAIRS, which never leaves. */
export function placeCard(hand: readonly CardId[], id: CardId, slot: number, slots: number): CardId[] | null {
  const next = [...hand];
  if (hand.length < slots) {
    next.splice(Math.min(slot, hand.length), 0, id);
    return next;
  }
  if (hand[slot] === "stairs") return null;
  next[slot] = id;
  return next;
}

/** The card that moves the hero and the path it committed to: the steps
 * still to take, the last one onto its target. A card that acts where the
 * hero stands (`IN_PLACE`) plans no steps. */
export type CardPlan = { card: number; path: Step[] };
/** Cards that act where the hero stands, a turn with no step, rather than
 * moving toward a target: the siphons and the key trades. */
export const IN_PLACE = new Set<CardId>(["keySiphon", "blueSiphon", "redSiphon", "blueTrader", "keyToHp"]);
/** What a card's badge changes about planning it (cards/badges.ts), as
 * `HandAt.cardRules` gives it: nothing when absent. */
export type CardRules = {
  /** A gate whose condition doesn't hold: the card can't act. A Focus
   * overrides it. */
  closed?: boolean;
  /** Stairward: of the card's targets, the one with the shortest walk on
   * to the stairs (in the Delve, the highest), the closest of those. */
  stairward?: boolean;
  /** Skip Open Nodes: the tiles already passed over on this floor, and
   * where to report each door or monster newly passed over. */
  skipOpen?: { skipped: ReadonlySet<string>; skip: (x: number, y: number) => void };
  /** Charge: how many monsters and doors the path may go through. */
  charge?: number;
  /** Effective and Dampen: what the target's effect is multiplied by, so
   * the DOOR card wants only doors whose scaled keys are held. */
  scale?: number;
  /** Deprioritize: the card passes over the target it would pick,
   * reporting it to be marked with a ?, and doesn't act this time. */
  deprioritize?: (x: number, y: number) => void;
  /** Deprioritize with the hand stuck: the ! tiles the card heads for,
   * the closest first, by any path. */
  bang?: ReadonlySet<string>;
};
/** Where the hand plans from: the board and the run, whether a card that
 * acts in place can act now (none can when this is absent), and what each
 * card's badge changes (`cardRules`). */
export type HandAt = Position & {
  canAct?: (card: CardId) => boolean;
  cardRules?: (card: CardId) => CardRules | undefined;
  /** Tiles marked with a ? (Deprioritize): no card's path crosses or ends
   * on them. */
  marked?: ReadonlySet<string>;
  /** Tiles Ignore marked: no card's path, nor Target's, ever crosses or
   * ends on them. */
  ignored?: ReadonlySet<string>;
  /** How much of a key each key colour a door takes costs, in tenths of a
   * percent (Key Efficiency research), 1,000 when absent: the door cards
   * want a door the keys held pay for at that cost. */
  keyCost?: number;
  /** The percent less each kind of door costs, from the door cards held
   * (`handBonus`): the door cards want a door at that cost too. */
  doorOff?: DoorDiscounts;
  /** For each card of the hand, whether it is linked to the next (Card
   * Groups, `linkedToNext`): the cards of a group share one priority. */
  links?: readonly boolean[];
  /** How far the Archer's arrows reach, in hundredths of a tile, and the
   * board's wrap (its width in the Delve, else 0): FLYING ENEMY plans by
   * them. Absent while the hero can't shoot, when that card can't act. */
  shotReach?: { range: number; wrap: number };
};

/** What each key the door `tile` takes costs a card heading for it: Key
 * Efficiency times the card's Effective or Dampen times the door cards held. */
const keyScale = (at: HandAt, tile: Tile, rules?: CardRules) =>
  doorKeyScale(tile, ((rules?.scale ?? 1) * (at.keyCost ?? 1000)) / 1000, at.doorOff);
/** What the HP breaking the Wooden Door `tile` takes is multiplied by: the
 * card's Effective or Dampen times WOODEN DOOR's, when held. */
const tollScale = (at: HandAt, tile: Tile, rules?: CardRules) => snap((rules?.scale ?? 1) * doorDiscount(tile, at.doorOff).toll);

/** Tiles a card's path may cross on the way to its target, taking what
 * lies there: open floor and every item. Walls, doors, monsters and stairs
 * block it, though any of them can be the target itself. */
const CROSSABLE = new Set<Tile["kind"]>(["floor", "openedChest", "oneway", "key", "potion", "attack", "defense", "treasure", "reward"]);
/** The most tiles a search walks: far more than a Tower floor or a Delve
 * area (at most 30 by 170) holds, so it only ever stops a search that
 * would otherwise run on up an endless board. */
const MOST_WALKED = 20_000;

/** A tile the search reached, and the step onto it from the tile before. */
type Reached = { x: number; y: number; tile: Tile; dx: number; dy: number; from: Reached | null };

/** The steps from the hero to `r`, the last one onto it. */
function pathTo(r: Reached): Step[] {
  const path: Step[] = [];
  for (let at: Reached | null = r; at?.from; at = at.from) path.push({ x: at.x, y: at.y, dx: at.dx, dy: at.dy });
  return path.reverse();
}

/** Whether `card` wants the tile, from where the hero stands. The Delve's
 * STAIRS card is decided over the whole search instead (`climb`). */
function wants(card: CardId, r: Reached, at: HandAt, rules?: CardRules): boolean {
  return WANTS[card](r.tile, at, rules, r);
}
/** A monster that can be fought, of one of `strengths` (any, without): an
 * impervious monster can't be fought at all, so it is never a target. */
const fightable = (strengths?: readonly EnemyStrength[]) => (t: Tile, at: Position) =>
  t.kind === "enemy" && (!strengths || strengths.includes(t.enemy!.strength)) && !impervious(at.run.player, t.enemy!);
const never = () => false;

/** Whether the hero can pay for the whole door run that the door at `r`
 * begins: it and each door of the same kind beside the one before, in
 * turn, each key spent at `keyScale` of a key and a Wooden Door broken down
 * for its toll (`tollScale`) as it goes. A door alone is a run of one. So a
 * card heads for a run only when it can open every door of it, never
 * spending keys on a run it would stop partway through. */
function paysRun(at: HandAt, r: Reached, rules?: CardRules): boolean {
  const id = doorId(r.tile), seen = new Set([point(r.x, r.y)]);
  const player = { ...at.run.player, keys: { ...at.run.player.keys } };
  // The doors of a run are all one kind, so cost alike.
  const scale = keyScale(at, r.tile, rules), toll = tollScale(at, r.tile, rules);
  for (let x = r.x, y = r.y, tile = r.tile; ;) {
    const cost = doorCost(tile, player, scale, toll);
    if (cost === null) return false;
    for (const c of cost) player.keys[c] = snap(player.keys[c] - keyNeed(scale, c));
    const rule = doorRule(tile);
    if (rule.type === "wood" && !cost.length && player.hp !== undefined) player.hp = snap(player.hp - woodToll(rule, toll));
    const next = DIRECTIONS.map(([dx, dy]) => at.world.step(x, y, dx, dy))
      .find((p) => p && !seen.has(point(p.x, p.y)) && at.world.tile(p.x, p.y).kind === "door" && doorId(at.world.tile(p.x, p.y)) === id);
    if (!next) return true;
    seen.add(point(next.x, next.y));
    x = next.x, y = next.y, tile = at.world.tile(x, y);
  }
}
const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const WANTS: Record<CardId, (t: Tile, at: HandAt, rules: CardRules | undefined, r: Reached) => boolean> = {
  stairs: (t) => t.kind === "stairs",
  heal: (t) => t.kind === "potion",
  // A door that opens: the keys held pay for it, a Heart Door, or a Wooden
  // Door the hero can break down and survive.
  door: (t, at, rules, r) => t.kind === "door" && paysRun(at, r, rules),
  key: (t) => t.kind === "key",
  yellowKey: (t) => t.kind === "key" && t.color === "yellow",
  blueKey: (t) => t.kind === "key" && t.color === "blue",
  monster: fightable(),
  atkUp: (t) => t.kind === "attack",
  defUp: (t) => t.kind === "defense",
  keySiphon: never,
  // A single gold door only (a Wooden Door is DOOR's), one the gold keys
  // held pay for.
  yellowDoor: (t, at, rules, r) => t.kind === "door" && isYellowDoor(t) && paysRun(at, r, rules),
  // A Heart Door, or a keyed door that drains HP too while its keys are held.
  heartDoor: (t, at, rules, r) => t.kind === "door" && drainsHp(doorRule(t)) && paysRun(at, r, rules),
  weakEnemy: fightable(["weak"]),
  baseEnemy: fightable(["normal"]),
  strongEnemy: fightable(["strong"]),
  eliteEnemy: fightable(["elite"]),
  bossEnemy: fightable(["boss", "greaterBoss"]),
  nonBossEnemy: fightable(["weak", "normal", "strong", "elite"]),
  fastEnemy: (t, at) => fightable()(t, at) && !!t.enemy!.fast,
  // Planned apart (`flyerPlan`): it stops once a Flying enemy is in reach.
  flyingEnemy: never,
  // Never moves the hero: it only makes it an Archer while held.
  archer: never,
  chest: (t) => t.kind === "treasure" || t.kind === "reward",
  blueSiphon: never,
  blueTrader: never,
  keyToHp: never,
  redKey: (t) => t.kind === "key" && t.color === "red",
  redSiphon: never,
  torch: (_t, at, _rules, r) => litTorches(at.world).has(point(r.x, r.y)),
  // A Wooden Door the keys held pay for, or one the hero can break down and survive.
  woodenDoor: (t, at, rules, r) => t.kind === "door" && doorId(t) === "wood" && paysRun(at, r, rules),
};

const NONE: ReadonlySet<string> = new Set();

/** The first card in `hand` that can act: one with a target the hero can
 * reach, and the shortest path to its closest target, or one that acts in
 * place and can now (`canAct`), with no path; null when no card can. It looks
 * only at the floor the hero stands on: stairs up end a path, and stairs
 * down are never crossed or a target. A card's badge may close it (a
 * gate) or change its target (`cardRules`). With `only`, it plans that
 * card alone (a Focus), whatever its gate. Linked cards (`links`, Card
 * Groups) are tried as one: of the targets each card of the group would
 * take, the hand heads for the closest (a card acting in place the
 * closest of all), the earlier card's of those tied. */
export function planHand(at: HandAt, hand: readonly CardId[], mode: Mode, only?: number): CardPlan | null {
  const ignored = at.ignored ?? NONE, marked = new Set([...(at.marked ?? NONE), ...ignored]);
  let reached = search(at, marked);
  /** Card `card`'s plan alone, or null when it can't act. */
  const planCard = (card: number): CardPlan | null => {
    const rules = at.cardRules?.(hand[card]);
    if (only === undefined && rules?.closed) return null;
    if (rules?.bang) {
      // The hand is stuck: the card heads for the closest ! by any way.
      const bang = rules.bang;
      const target = search(at, ignored).find((r) => bang.has(point(r.x, r.y)));
      return target ? { card, path: pathTo(target) } : null;
    }
    if (IN_PLACE.has(hand[card])) return at.canAct?.(hand[card]) ? { card, path: [] } : null;
    if (hand[card] === "flyingEnemy") return flyerPlan(at, card, reached);
    const target = targetOf(at, hand[card], mode, rules?.charge ? chargeSearch(at, rules.charge, marked) : reached, reached, rules);
    if (target && rules?.deprioritize) {
      // Passed over and marked: the cards after it go round it too.
      rules.deprioritize(target.x, target.y);
      marked.add(point(target.x, target.y));
      reached = search(at, marked);
      return null;
    }
    return target ? { card, path: pathTo(target) } : null;
  };
  if (only !== undefined) return only < hand.length ? planCard(only) : null;
  let best: CardPlan | null = null;
  for (let card = 0; card < hand.length; card++) {
    const plan = planCard(card);
    if (plan && (!best || plan.path.length < best.path.length)) best = plan;
    // A group's last card (or a card on its own) ends the choice.
    if (best && !at.links?.[card]) return best;
  }
  return best;
}

/** FLYING ENEMY's plan (card `card` of the hand): while a Flying enemy its
 * arrows can hurt is within the Archer's reach, a turn waiting where the
 * hero stands (no path); otherwise the way toward the closest such enemy
 * the hero can walk under (`reached`, the plain search), cut short at the
 * first tile from which one is within reach. Null while the hero can't
 * shoot (`shotReach` absent) or no such enemy is in reach of its walk. */
function flyerPlan(at: HandAt, card: number, reached: Reached[]): CardPlan | null {
  const reach = at.shotReach;
  if (!reach) return null;
  const p = at.run.player, hurts = (t: Tile) => !!t.flyer && arrowDamage(p, t.flyer) > 0;
  const inReach = (x: number, y: number) => enemiesWithin(at.world, { x, y }, reach.range, reach.wrap).some((e) => e.tile.enemy.flying && hurts({ kind: "floor", flyer: e.tile.enemy }));
  if (inReach(p.x, p.y)) return { card, path: [] };
  const target = reached.find((r) => hurts(r.tile));
  if (!target) return null;
  const path = pathTo(target), stop = path.findIndex((s) => inReach(s.x, s.y));
  return { card, path: stop < 0 ? path : path.slice(0, stop + 1) };
}

/** Target's path to (x, y): the shortest over crossable tiles, round the
 * tiles Ignore marked, its last step onto the tile, whatever stands there
 * (a monster is fought, a door opened); null when the hero can't reach it
 * or stands on it. */
export function planTarget(at: HandAt, x: number, y: number): Step[] | null {
  const target = search(at, at.ignored ?? NONE).find((r) => r.x === x && r.y === y);
  return target ? pathTo(target) : null;
}

/** Whether Target can follow the rest of the path it committed to: it
 * starts where the hero stands, every step but the last still lands on a
 * crossable tile not ignored (a monster can appear on the way, as a
 * Greater Boss does), and the tile at its end is no wall. Far cheaper than
 * a search, so Target plans again only when the board has changed under
 * its path. */
export function stillOpen(at: HandAt, path: readonly Step[]): boolean {
  const { world, run } = at, ignored = at.ignored ?? NONE, first = path[0];
  const to = first && world.step(run.player.x, run.player.y, first.dx, first.dy);
  if (!to || to.x !== first.x || to.y !== first.y) return false;
  for (let i = 0; i < path.length - 1; i++) {
    const { x, y } = path[i];
    if (!CROSSABLE.has(world.tile(x, y).kind) || ignored.has(point(x, y))) return false;
  }
  const end = path[path.length - 1];
  return world.tile(end.x, end.y).kind !== "wall";
}

/** Card `id`'s target among the tiles `pool` reached (closest first): the
 * closest it wants, or as its badge picks. `reached` is the plain search,
 * which tells Skip Open Nodes what ground is already open. */
function targetOf(at: HandAt, id: CardId, mode: Mode, pool: Reached[], reached: Reached[], rules?: CardRules) {
  if (id === "stairs" && mode === "delve") return climb(at, pool);
  if (!rules?.stairward && !rules?.skipOpen) return pool.find((r) => wants(id, r, at, rules));
  let targets = pool.filter((r) => wants(id, r, at, rules));
  if (rules.skipOpen) {
    const open = openGround(at, reached);
    targets = targets.filter((r) => !passesOver(at, r, open, rules.skipOpen!));
  }
  if (!rules.stairward || targets.length < 2) return targets[0];
  return mode === "delve" ? highest(targets) : nearestStairs(at, targets);
}

/** The ground the hero can already reach: every tile the plain search
 * `reached`, and where the hero stands. */
function openGround(at: Position, reached: Reached[]) {
  const open = new Set(reached.map((t) => point(t.x, t.y)));
  open.add(point(at.run.player.x, at.run.player.y));
  return open;
}

/** Skip Open Nodes: whether the door or monster at `r` is passed over:
 * one skipped before on this floor, or one that opens no new ground (every
 * open tile beside it is in `open`, from `openGround`), which it reports. */
function passesOver(at: Position, r: Reached, open: ReadonlySet<string>, skip: NonNullable<CardRules["skipOpen"]>) {
  if (r.tile.kind !== "door" && r.tile.kind !== "enemy") return false;
  if (skip.skipped.has(point(r.x, r.y))) return true;
  for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
    const next = at.world.step(r.x, r.y, dx, dy);
    if (next && at.world.tile(next.x, next.y).kind !== "wall" && !open.has(point(next.x, next.y))) return false;
  }
  skip.skip(r.x, r.y);
  return true;
}

/** The highest of `targets`, the closest of those tied. */
const highest = (targets: Reached[]) => targets.reduce((best, r) => (r.y > best.y ? r : best));

/** Of `targets`, the one with the shortest walk on to the stairs up over
 * every tile but walls, the closest to the hero of those tied; the closest
 * when the floor has no stairs. */
function nearestStairs(at: Position, targets: Reached[]) {
  const stairs = [...walkAll(at, at.run.player).keys()].find((k) => {
    const [x, y] = k.split(",").map(Number);
    return at.world.tile(x, y).kind === "stairs";
  });
  if (!stairs) return targets[0];
  const [x, y] = stairs.split(",").map(Number), away = walkAll(at, { x, y });
  const left = (r: Reached) => away.get(point(r.x, r.y)) ?? Infinity;
  return targets.reduce((best, r) => (left(r) < left(best) ? r : best));
}

/** How many steps each tile but walls lies from `start`, walking over them
 * all (doors and monsters too), by `point`. With `until`, it stops once
 * every tile there is reached, since in the Delve the walk would otherwise
 * carry on through each milestone gate into the areas above. */
export function walkAll(at: Position, start: { x: number; y: number }, until?: readonly string[]) {
  const away = new Map([[point(start.x, start.y), 0]]), walk = [start];
  for (let i = 0; i < walk.length && i < MOST_WALKED; i++) {
    if (until?.every((k) => away.has(k))) break;
    const from = walk[i], d = away.get(point(from.x, from.y))!;
    for (const [dx, dy] of DIRECTIONS) {
      const next = at.world.step(from.x, from.y, dx, dy);
      if (!next || next.y < at.world.floor || away.has(point(next.x, next.y)) || at.world.tile(next.x, next.y).kind === "wall") continue;
      away.set(point(next.x, next.y), d + 1);
      walk.push(next);
    }
  }
  return away;
}

/** The Delve's STAIRS target: the highest crossable tile the hero can
 * reach above every row it has reached this run, the closest of those tied
 * for highest, however far from the view. A row it has stood on before is
 * no climb. */
function climb(at: Position, reached: Reached[]): Reached | undefined {
  const p = at.run.player, top = Math.max(p.y, (at.run as DelveRun).top ?? p.y);
  let best: Reached | undefined;
  for (const r of reached)
    if (CROSSABLE.has(r.tile.kind) && r.y > top && (!best || r.y > best.y)) best = r;
  return best;
}

/** Breadth-first search from the hero over crossable tiles. Returns every
 * tile reached, closest first, each with the shortest path to it, and of
 * those the one stepping on the fewest tiles that hold something (items,
 * chests and lit torches: `takesSomething`), so the hand's paths go round
 * what other cards aim at unless no equally short way does; a tile that
 * isn't crossable is reached but never walked through, and a tile marked
 * with a ? is neither. */
function search(at: Position, marked: ReadonlySet<string>): Reached[] {
  const { world, run } = at, p = run.player, lit = litTorches(world);
  type Walked = { r: Reached; depth: number; items: number };
  const first: Walked = { r: { x: p.x, y: p.y, tile: world.tile(p.x, p.y), dx: 0, dy: 0, from: null }, depth: 0, items: 0 };
  const seen = new Map([[point(p.x, p.y), first]]);
  const walk: Walked[] = [first];
  const reached: Reached[] = [];
  for (let i = 0; i < walk.length && i < MOST_WALKED; i++) {
    const { r: from, depth, items } = walk[i];
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
      const dest = world.step(from.x, from.y, dx, dy);
      if (!dest || dest.y < world.floor) continue;
      const tile = world.tile(dest.x, dest.y);
      if (tile.kind === "wall") continue;
      const k = point(dest.x, dest.y), taken = items + (takesSomething(tile, dest.x, dest.y, lit) ? 1 : 0);
      if (marked.has(k)) continue;
      const known = seen.get(k);
      if (known) {
        // Not walked on from yet (the walk goes a whole depth at a time),
        // so a path as short taking less can still replace its own.
        if (known.depth === depth + 1 && taken < known.items) Object.assign(known.r, { dx, dy, from }), (known.items = taken);
        continue;
      }
      const next: Walked = { r: { ...dest, tile, dx, dy, from }, depth: depth + 1, items: taken };
      seen.set(k, next);
      reached.push(next.r);
      if (CROSSABLE.has(tile.kind)) walk.push(next);
    }
  }
  return reached;
}

/** Whether Charge's path may go through `t`: a monster that can be fought
 * (lethal or not) or a door the hero holds the keys for. */
function chargeable(t: Tile, at: HandAt) {
  if (t.kind === "enemy") return !impervious(at.run.player, t.enemy!);
  return t.kind === "door" && doorCost(t, at.run.player, keyScale(at, t), tollScale(at, t)) !== null;
}

/** The search as Charge makes it: breadth-first over crossable tiles and
 * through up to `charge` monsters and doors (`chargeable`) on the way.
 * Each tile is reached once, by its shortest path, however many it charges
 * through; a tile is walked on from once per count of charges spent, so a
 * longer path that spent fewer can still go further. */
function chargeSearch(at: HandAt, charge: number, marked: ReadonlySet<string>): Reached[] {
  const { world, run } = at, p = run.player;
  const walked = new Set([`0|${point(p.x, p.y)}`]), seen = new Set([point(p.x, p.y)]);
  const walk: { r: Reached; spent: number }[] = [{ r: { x: p.x, y: p.y, tile: world.tile(p.x, p.y), dx: 0, dy: 0, from: null }, spent: 0 }];
  const reached: Reached[] = [];
  for (let i = 0; i < walk.length && i < MOST_WALKED; i++) {
    const { r: from, spent } = walk[i];
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
      const dest = world.step(from.x, from.y, dx, dy);
      if (!dest || dest.y < world.floor) continue;
      const tile = world.tile(dest.x, dest.y);
      if (tile.kind === "wall") continue;
      const k = point(dest.x, dest.y), next = { ...dest, tile, dx, dy, from };
      if (marked.has(k)) continue;
      if (!seen.has(k)) {
        seen.add(k);
        reached.push(next);
      }
      const cost = CROSSABLE.has(tile.kind) ? spent : chargeable(tile, at) ? spent + 1 : Infinity;
      if (cost > charge || walked.has(`${cost}|${k}`)) continue;
      walked.add(`${cost}|${k}`);
      walk.push({ r: next, spent: cost });
    }
  }
  return reached;
}


/** Why a tile stops the hand: Ignore marked it; a card that would take it
 * is held back by its badge (a gate, or Deprioritize resting), or passes
 * it over by its badge's rule; the keys held don't open the door (or run
 * out partway through its door run); the hero's strikes can't hurt the
 * monster; or no card in the hand takes it at all. */
export type BlockReason = "ignored" | "held" | "passed" | "keys" | "doorRun" | "impervious" | "noCard";
/** Something the hand doesn't get past: where it stands, the walk to it,
 * and why, with the card concerned for `held` and `passed`. */
export type Blocker = { x: number; y: number; tile: Tile; steps: number; why: BlockReason; card?: CardId };
/** What stops a hand that can't act (`explainStuck`): the blockers, closest
 * first. */
export type StuckReport = { blockers: Blocker[] };

/** Why `hand` can't act, walking the ground the hand's search walks: each
 * door, monster, stairs up and ignored tile at its edge that has more
 * ground beyond it (the stairs always count), with the
 * reason no card in the hand gets past it. */
export function explainStuck(at: HandAt, hand: readonly CardId[]): StuckReport {
  const { world, run } = at, p = run.player, ignored = at.ignored ?? NONE;
  const steps = new Map([[point(p.x, p.y), 0]]), walk = [{ x: p.x, y: p.y }];
  const edge: Omit<Blocker, "why">[] = [];
  for (let i = 0; i < walk.length && i < MOST_WALKED; i++) {
    const from = walk[i], d = steps.get(point(from.x, from.y))!;
    for (const [dx, dy] of DIRECTIONS) {
      const dest = world.step(from.x, from.y, dx, dy);
      if (!dest || dest.y < world.floor) continue;
      const k = point(dest.x, dest.y), tile = world.tile(dest.x, dest.y);
      if (steps.has(k) || tile.kind === "wall") continue;
      steps.set(k, d + 1);
      if (CROSSABLE.has(tile.kind) && !ignored.has(k)) walk.push(dest);
      else edge.push({ x: dest.x, y: dest.y, tile, steps: d + 1 });
    }
  }
  // Only what has ground beyond it blocks the way: a door between two
  // stretches already open, or a monster in a dead end, holds nothing back.
  const beyond = (e: Omit<Blocker, "why">) => e.tile.kind === "stairs" || DIRECTIONS.some(([dx, dy]) => {
    const next = world.step(e.x, e.y, dx, dy);
    return !!next && !steps.has(point(next.x, next.y)) && world.tile(next.x, next.y).kind !== "wall";
  });
  return { blockers: edge.filter(beyond).map((e) => ({ ...e, ...blockReason(at, e, hand, ignored) })) };
}

/** Why no card in `hand` gets past the tile `e`. */
function blockReason(at: HandAt, e: Omit<Blocker, "why">, hand: readonly CardId[], ignored: ReadonlySet<string>): Pick<Blocker, "why" | "card"> {
  if (ignored.has(point(e.x, e.y))) return { why: "ignored" };
  const r: Reached = { ...e, dx: 0, dy: 0, from: null }, player = at.run.player;
  const card = hand.find((id) => !IN_PLACE.has(id) && wants(id, r, at, at.cardRules?.(id)));
  if (card) return { why: at.cardRules?.(card)?.closed ? "held" : "passed", card };
  if (e.tile.kind === "door") {
    if (doorCost(e.tile, player, keyScale(at, e.tile), tollScale(at, e.tile)) === null) return { why: "keys" };
    if (!paysRun(at, r)) return { why: "doorRun" };
  }
  if (e.tile.kind === "enemy" && impervious(player, e.tile.enemy!)) return { why: "impervious" };
  return { why: "noCard" };
}

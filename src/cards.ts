import { point, type Tile } from "./entities.ts";
import { litTorches, takesSomething, type Position } from "./board.ts";
import type { Step } from "./pathfinding.ts";
import { doorCost, doorId, doorRule } from "./doors.ts";
import { predict } from "./combat.ts";
import { snap } from "./exact.ts";
import { UPGRADES, VIEWPORT_TILES, type KeyColor, type TrainingId, type UpgradeId } from "./config.ts";
import type { DelveRun, EnemyStrength, Mode } from "./entities.ts";

/** Every card a hand can hold: its name and what it moves the hero toward. */
export const CARDS = {
  stairs: { name: "Stairs", text: "Move toward the stairs up (in the Delve, the highest open tile in view, above any row reached this run)." },
  heal: { name: "Heal", text: "Move toward the closest healing potion." },
  door: { name: "Door", text: "Move toward the closest door you hold the keys for." },
  yellowKey: { name: "Yellow Key", text: "Move toward the closest yellow key." },
  blueKey: { name: "Blue Key", text: "Move toward the closest blue key." },
  monster: { name: "Monster", text: "Move toward the closest monster." },
  atkUp: { name: "ATK Up", text: "Move toward the closest ATK pickup." },
  defUp: { name: "DEF Up", text: "Move toward the closest DEF pickup." },
  keySiphon: { name: "Key Siphon", text: "Trade Max HP training levels for a yellow key, without moving, for the rest of the run. The first use takes 1 level and each use after takes 1 more (2, then 3…). Skipped without enough levels left." },
  yellowDoor: { name: "Yellow Door", text: "Move toward the closest yellow door, while you hold a yellow key." },
  heartDoor: { name: "Heart Door", text: "Move toward the closest Heart Door." },
  weakEnemy: { name: "Weak Enemy", text: "Move toward the closest weak enemy." },
  baseEnemy: { name: "Base Enemy", text: "Move toward the closest enemy that is neither weak, strong, elite nor a boss." },
  strongEnemy: { name: "Strong Enemy", text: "Move toward the closest strong enemy." },
  eliteEnemy: { name: "Elite Enemy", text: "Move toward the closest elite enemy." },
  bossEnemy: { name: "Boss Enemy", text: "Move toward the closest boss or Greater Boss." },
  chest: { name: "Chest", text: "Move toward the closest closed chest: a treasure chest or an area reward chest." },
  blueSiphon: { name: "BK Siphon", text: "Trade DEF training levels for a blue key, without moving, for the rest of the run. The first use takes 1 level and each use after takes 1 more (2, then 3…). Skipped without enough levels left." },
  blueTrader: { name: "BK Trader", text: "Trade 3 yellow keys for a blue key, without moving. Skipped with fewer than 3 yellow keys." },
  keyToHp: { name: "YK to HP", text: "Trade a yellow key for 10% of your max HP, without moving. Skipped without a yellow key, or while you are missing less than 10% of your max HP." },
  redKey: { name: "Red Key", text: "Move toward the closest red key." },
  redSiphon: { name: "RK Siphon", text: "Trade ATK training levels for a red key, without moving, for the rest of the run. The first use takes 1 level and each use after takes 1 more (2, then 3…). Skipped without enough levels left." },
  torch: { name: "Torch", text: "Move toward the closest lit torch, putting it out." },
  steelDoor: { name: "Steel Door", text: "Move toward the closest Steel Door, while you hold a key it takes." },
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
/** BK TRADER's price: the yellow keys it trades for one blue key. */
export const TRADER_YELLOW_KEYS = 3;
/** YK TO HP's heal: this percent of max HP for one yellow key. */
export const KEY_TO_HP_PERCENT = 10;
/** What card `id` does, as the player is told: STAIRS says how it climbs
 * in the Delve only once Into the depths is owned. */
export function cardText(id: CardId, upgrades: Record<UpgradeId, number>): string {
  return id === "stairs" && !upgrades.delve ? "Move toward the stairs up." : CARDS[id].text;
}

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
 * HEAL, ATK UP, DEF UP and BLUE KEY are earned from the Inspiration tree. */
export const BASE_HAND: readonly CardId[] = ["stairs", "door", "yellowKey", "monster"];
/** The cards the player owns, in `CARDS` order: the base hand's, and each
 * card whose upgrade is owned. A hand holds any of them, but always STAIRS. */
export function deckCards(upgrades: Record<UpgradeId, number>): CardId[] {
  const earned = UPGRADES.flatMap((u) => ("card" in u && upgrades[u.id] ? [u.card as CardId] : []));
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
/** What a card's badge changes about planning it (badges.ts), as
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
};

/** What each key a door takes costs a card heading for it: Key Efficiency
 * times the card's Effective or Dampen. */
const keyScale = (at: HandAt, rules?: CardRules) => snap(((rules?.scale ?? 1) * (at.keyCost ?? 1000)) / 1000);

/** Tiles a card's path may cross on the way to its target, taking what
 * lies there: open floor and every item. Walls, doors, monsters and stairs
 * block it, though any of them can be the target itself. */
const CROSSABLE = new Set<Tile["kind"]>(["floor", "openedChest", "oneway", "key", "potion", "attack", "defense", "treasure", "reward"]);
/** How many rows above and below the hero the search looks. */
const REACH = 40;
/** The highest row the Delve's STAIRS card may climb to: the top of the view. */
const VIEW_ABOVE = Math.floor(VIEWPORT_TILES / 2);

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
  t.kind === "enemy" && (!strengths || strengths.includes(t.enemy!.strength)) && !predict(at.run.player, t.enemy!).impervious;
const never = () => false;
const WANTS: Record<CardId, (t: Tile, at: HandAt, rules: CardRules | undefined, r: Reached) => boolean> = {
  stairs: (t) => t.kind === "stairs",
  heal: (t) => t.kind === "potion",
  door: (t, at, rules) => t.kind === "door" && doorCost(t, at.run.player, keyScale(at, rules)) !== null,
  yellowKey: (t) => t.kind === "key" && t.color === "yellow",
  blueKey: (t) => t.kind === "key" && t.color === "blue",
  monster: fightable(),
  atkUp: (t) => t.kind === "attack",
  defUp: (t) => t.kind === "defense",
  keySiphon: never,
  // A single yellow door only (a Steel Door is DOOR's), one the yellow keys
  // held pay for.
  yellowDoor: (t, at, rules) => {
    if (t.kind !== "door") return false;
    const rule = doorRule(t);
    return rule.type === "keys" && rule.mode === "all" && rule.keys.length === 1 && rule.keys[0] === "yellow" && doorCost(t, at.run.player, keyScale(at, rules)) !== null;
  },
  heartDoor: (t) => t.kind === "door" && doorRule(t).type === "fullHp",
  weakEnemy: fightable(["weak"]),
  baseEnemy: fightable(["normal"]),
  strongEnemy: fightable(["strong"]),
  eliteEnemy: fightable(["elite"]),
  bossEnemy: fightable(["boss", "greaterBoss"]),
  chest: (t) => t.kind === "treasure" || t.kind === "reward",
  blueSiphon: never,
  blueTrader: never,
  keyToHp: never,
  redKey: (t) => t.kind === "key" && t.color === "red",
  redSiphon: never,
  torch: (_t, at, _rules, r) => !!at.world.torches?.some((torch) => torch.active && torch.x === r.x && torch.y === r.y),
  // A Steel Door (any one key opens it), one the keys held pay for.
  steelDoor: (t, at, rules) => t.kind === "door" && doorId(t) === "steel" && doorCost(t, at.run.player, keyScale(at, rules)) !== null,
};

const NONE: ReadonlySet<string> = new Set();

/** The first card in `hand` that can act: one with a target the hero can
 * reach, and the shortest path to its closest target, or one that acts in
 * place and can now (`canAct`), with no path; null when no card can. It looks
 * only at the floor the hero stands on: stairs up end a path, and stairs
 * down are never crossed or a target. A card's badge may close it (a
 * gate) or change its target (`cardRules`). With `only`, it plans that
 * card alone (a Focus), whatever its gate. */
export function planHand(at: HandAt, hand: readonly CardId[], mode: Mode, only?: number): CardPlan | null {
  const ignored = at.ignored ?? NONE, marked = new Set([...(at.marked ?? NONE), ...ignored]);
  let reached = search(at, marked);
  for (let card = 0; card < hand.length; card++) {
    if (only !== undefined && card !== only) continue;
    const rules = at.cardRules?.(hand[card]);
    if (only === undefined && rules?.closed) continue;
    if (rules?.bang) {
      // The hand is stuck: the card heads for the closest ! by any way.
      const bang = rules.bang;
      const target = search(at, ignored).find((r) => bang.has(point(r.x, r.y)));
      if (target) return { card, path: pathTo(target) };
      continue;
    }
    if (IN_PLACE.has(hand[card])) {
      if (at.canAct?.(hand[card])) return { card, path: [] };
      continue;
    }
    const target = targetOf(at, hand[card], mode, rules?.charge ? chargeSearch(at, rules.charge, marked) : reached, reached, rules);
    if (target && rules?.deprioritize) {
      // Passed over and marked: the cards after it go round it too.
      rules.deprioritize(target.x, target.y);
      marked.add(point(target.x, target.y));
      reached = search(at, marked);
      continue;
    }
    if (target) return { card, path: pathTo(target) };
  }
  return null;
}

/** Target's path to (x, y): the shortest over crossable tiles, round the
 * tiles Ignore marked, its last step onto the tile, whatever stands there
 * (a monster is fought, a door opened); null when the hero can't reach it
 * or stands on it. */
export function planTarget(at: HandAt, x: number, y: number): Step[] | null {
  const target = search(at, at.ignored ?? NONE).find((r) => r.x === x && r.y === y);
  return target ? pathTo(target) : null;
}

/** Card `id`'s target among the tiles `pool` reached (closest first): the
 * closest it wants, or as its badge picks. `reached` is the plain search,
 * which tells Skip Open Nodes what ground is already open. */
function targetOf(at: HandAt, id: CardId, mode: Mode, pool: Reached[], reached: Reached[], rules?: CardRules) {
  if (id === "stairs" && mode === "delve") return climb(at, pool);
  if (!rules?.stairward && !rules?.skipOpen) return pool.find((r) => wants(id, r, at, rules));
  let targets = pool.filter((r) => wants(id, r, at, rules));
  if (rules.skipOpen) targets = targets.filter((r) => !passesOver(at, r, reached, rules.skipOpen!));
  if (!rules.stairward || targets.length < 2) return targets[0];
  return mode === "delve" ? highest(targets) : nearestStairs(at, targets);
}

/** Skip Open Nodes: whether the door or monster at `r` is passed over:
 * one skipped before on this floor, or one that opens no new ground (every
 * open tile beside it the hero can already reach), which it reports. */
function passesOver(at: Position, r: Reached, reached: Reached[], skip: NonNullable<CardRules["skipOpen"]>) {
  if (r.tile.kind !== "door" && r.tile.kind !== "enemy") return false;
  if (skip.skipped.has(point(r.x, r.y))) return true;
  const open = new Set(reached.map((t) => point(t.x, t.y)));
  open.add(point(at.run.player.x, at.run.player.y));
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
 * when the floor has no stairs in reach. */
function nearestStairs(at: Position, targets: Reached[]) {
  const stairs = stairsIn(at);
  if (!stairs) return targets[0];
  const away = new Map([[point(stairs.x, stairs.y), 0]]), walk = [stairs];
  for (let i = 0; i < walk.length; i++) {
    const from = walk[i], d = away.get(point(from.x, from.y))!;
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
      const next = at.world.step(from.x, from.y, dx, dy);
      if (!next || !inReach(at, next.y) || away.has(point(next.x, next.y)) || at.world.tile(next.x, next.y).kind === "wall") continue;
      away.set(point(next.x, next.y), d + 1);
      walk.push(next);
    }
  }
  const left = (r: Reached) => away.get(point(r.x, r.y)) ?? Infinity;
  return targets.reduce((best, r) => (left(r) < left(best) ? r : best));
}

/** The stairs up within the hand's reach, if any. */
function stairsIn(at: Position) {
  const p = at.run.player;
  for (let y = Math.max(at.world.floor, p.y - REACH); y <= p.y + REACH; y++)
    for (let x = 0; x < at.world.width; x++) if (at.world.tile(x, y).kind === "stairs") return { x, y };
  return null;
}

/** The Delve's STAIRS target: the highest crossable tile in view above
 * every row the hero has reached this run, the closest of those tied for
 * highest. A row it has stood on before is no climb. */
function climb(at: Position, reached: Reached[]): Reached | undefined {
  const p = at.run.player, top = Math.max(p.y, (at.run as DelveRun).top ?? p.y);
  let best: Reached | undefined;
  for (const r of reached)
    if (CROSSABLE.has(r.tile.kind) && r.y > top && r.y <= p.y + VIEW_ABOVE && (!best || r.y > best.y)) best = r;
  return best;
}

/** Whether row `y` is within the hand's reach of the hero, and not below
 * the board's floor. */
function inReach({ world, run }: Position, y: number) {
  const p = run.player;
  return y >= Math.max(world.floor, p.y - REACH) && y <= p.y + REACH;
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
  for (let i = 0; i < walk.length; i++) {
    const { r: from, depth, items } = walk[i];
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
      const dest = world.step(from.x, from.y, dx, dy);
      if (!dest || !inReach(at, dest.y)) continue;
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
  if (t.kind === "enemy") return !predict(at.run.player, t.enemy!).impervious;
  return t.kind === "door" && doorCost(t, at.run.player, keyScale(at)) !== null;
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
  for (let i = 0; i < walk.length; i++) {
    const { r: from, spent } = walk[i];
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
      const dest = world.step(from.x, from.y, dx, dy);
      if (!dest || !inReach(at, dest.y)) continue;
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

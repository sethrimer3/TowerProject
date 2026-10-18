import { BADGES, badgeOn, badgesOn, badgeValue, type RunBadge } from "./badges.ts";
import type { Board } from "./board.ts";
import type { DoorDiscounts } from "./doors.ts";
import { KEY_TO_HP_PERCENT, SIPHONS, TRADER_YELLOW_KEYS, isSiphon, linkedToNext, walkAll, type CardId, type CardRules, type HandAt, type SiphonCard } from "./cards.ts";
import type { Mode } from "./entities.ts";
import type { Run } from "./runs.ts";
import type { Save } from "./save-shape.ts";
import { snap } from "./exact.ts";
import { MODES, type ModeProfile } from "./modes.ts";
import { drawAt } from "./random.ts";
import { boughtInRun } from "./run-training.ts";

/** Mixed into the run seed to start Skip's stream of rolls. */
const SKIP_SALT = 0x5c1b7;

/** What the hand rules read from the game, each time (an erase replaces
 * the save, and undo or a mode change the run): the save, the active run
 * and its board, the mode, the hand, Key Efficiency's cost and the door
 * cards' discounts. */
export interface HandHost {
  readonly save: Save;
  readonly run: Run;
  readonly world: Board;
  readonly mode: Mode;
  readonly hand: readonly CardId[];
  readonly keyCost: number;
  /** The percent less each kind of door costs (`HandAt.doorOff`). */
  readonly doorOff?: DoorDiscounts;
  /** How far the Archer's arrows reach, and the wrap (`HandAt.shotReach`). */
  readonly shotReach?: { range: number; wrap: number };
}

/** What the hand's cards may do now (the hand rules): their badges' rules
 * and the marks and cooldowns they keep by floor, Skip's stream of rolls,
 * the tiles Ignore marked, and whether a card that acts in place can act.
 * It is where the hand plans from (`HandAt`): `planHand`, `planTarget` and
 * `explainStuck` take it. Everything it keeps lives in the run, so undo and
 * reloads keep it; inside the forest no badge has a rule. */
export class HandRules implements HandAt {
  constructor(private readonly host: HandHost) {}

  get world() {
    return this.host.world;
  }
  get run() {
    return this.host.run;
  }
  get keyCost() {
    return this.host.keyCost;
  }
  get doorOff() {
    return this.host.doorOff;
  }
  get shotReach() {
    return this.host.shotReach;
  }
  /** For each card of the hand, whether it is linked to the next (Card
   * Groups): the run's links, or in the forest the saved ones. */
  get links(): readonly boolean[] {
    const run = this.run;
    return linkedToNext(this.host.hand, run.hand ? run.links ?? [] : this.host.save.cardLinks);
  }
  /** The floor card badges count by: the Tower floor, or the Delve's
   * equivalent floor where the hero stands. */
  get floor() {
    const rules: ModeProfile = MODES[this.host.mode];
    return rules.equivalentFloor(rules.progressAt(this.run, this.run.player.y));
  }

  /** What card `card`'s badges change about planning it (`planHand`
   * asks), each badge's rules together: a gate closes it while its
   * condition fails (any one closed closes it), and Stairward and Skip Open
   * Nodes count only on floors they aren't cooling down on. */
  cardRules(card: CardId): CardRules | undefined {
    if (this.run.outside) return undefined;
    let rules: CardRules | undefined;
    for (const badge of badgesOn(this.run.badges, card)) {
      const r = this.badgeRules(card, badge);
      if (!r) continue;
      const closed = rules?.closed || r.closed;
      rules = { ...rules, ...r };
      if (closed) rules.closed = true;
    }
    return rules;
  }
  /** What one of card `card`'s badges changes about planning it. */
  private badgeRules(card: CardId, badge: RunBadge): CardRules | undefined {
    const v = badgeValue(badge.id, badge.level, badge.pick), p = this.run.player;
    switch (badge.id) {
      case "hpGate": return { closed: !(p.hp < snap((p.maxHp * v) / 100)) };
      case "yellowGate": return { closed: !(p.keys.yellow < v) };
      case "blueGate": return { closed: !(p.keys.blue < v) };
      case "redGate": return { closed: !(p.keys.red < v) };
      case "yellowAtLeast": return { closed: !(p.keys.yellow >= v) };
      case "blueAtLeast": return { closed: !(p.keys.blue >= v) };
      case "redAtLeast": return { closed: !(p.keys.red >= v) };
      case "stairward": return this.cooled("stairward", v) ? { stairward: true } : undefined;
      case "skipOpen": return this.cooled("skipOpen", v) ? { skipOpen: { skipped: new Set(this.skipMarks), skip: (x, y) => this.skipTile(x, y) } } : undefined;
      case "charge": return { charge: v };
      case "effective": case "dampen": return { scale: this.scaleOf(card) };
      case "deprioritize": {
        const m = this.floorMarks;
        if (m.bangs.length) return { bang: new Set(m.bangs) };
        return m.made < v ? { deprioritize: (x, y) => this.markTile(x, y) } : { closed: true };
      }
      default: return undefined;
    }
  }
  /** Whether card `id`'s committed path is dropped because its gate badge
   * (HP <, YK ≥, …) no longer holds: walking on, Regen may have lifted HP
   * past an HP < limit. A focused card ignores its gate. */
  gateShut(id: CardId) {
    if (id === this.run.focused || !badgesOn(this.run.badges, id).some((b) => BADGES[b.id].kind === "gate")) return false;
    return !!this.cardRules(id)?.closed;
  }
  /** What card `card`'s Effective or Dampen multiplies its target's effect
   * by when it activates: 1 with neither. */
  scaleOf(card: CardId) {
    const badge = badgesOn(this.run.badges, card).find((b) => BADGES[b.id].kind === "scale");
    if (!badge || this.run.outside) return 1;
    const v = badgeValue(badge.id, badge.level, badge.pick);
    return (100 + (badge.id === "effective" ? v : -v)) / 100;
  }

  /** Whether Skip on card `card` rolls for its target at (x, y): never for
   * a boss, the Delve's STAIRS card's climb (no stairs), a torch (no tile
   * to vanish), or FLYING ENEMY (its path ends short of its target). */
  rollsSkip(card: CardId, x: number, y: number) {
    if (!badgeOn(this.run.badges, card, "skip") || this.run.outside || card === "torch" || card === "flyingEnemy") return false;
    const t = this.world.tile(x, y);
    if (t.kind === "enemy" && (t.enemy!.strength === "boss" || t.enemy!.strength === "greaterBoss")) return false;
    return card !== "stairs" || t.kind === "stairs";
  }
  /** Whether Skip's next roll falls under card `card`'s chance: the next
   * number of its own stream, started from the run seed (the floors' seed),
   * so a run of the same seed played the same way skips the same targets.
   * The roll isn't spent until `skipRolled`. */
  skipHits(card: CardId) {
    const badge = badgeOn(this.run.badges, card, "skip")!;
    return drawAt(this.run.seed ^ SKIP_SALT, this.run.skipRolls ?? 0) < badgeValue(badge.id, badge.level, badge.pick) / 100;
  }
  /** Skip's roll is spent: the stream moves on (`run.skipRolls` counts
   * those drawn). */
  skipRolled() {
    this.run.skipRolls = (this.run.skipRolls ?? 0) + 1;
  }

  /** Deprioritize's marks on this floor: none yet on a floor it hasn't
   * marked. */
  private get floorMarks() {
    const m = this.run.marks, floor = this.floor;
    return m && !this.run.outside && m.floor === floor ? m : { floor, made: 0, tiles: [] as string[], bangs: [] as string[] };
  }
  /** Deprioritize passes over (x, y): marked ? for the rest of the floor. */
  private markTile(x: number, y: number) {
    const m = (this.run.marks = this.floorMarks), k = `${x},${y}`;
    if (!m.tiles.includes(k)) m.tiles.push(k);
    m.made++;
  }
  /** The tiles marked ? on this floor, which no card's path crosses
   * (`planHand` reads it). */
  get marked(): ReadonlySet<string> {
    return new Set(this.floorMarks.tiles);
  }
  /** The ? and ! marks on this floor, for the board. */
  get badgeMarks() {
    const m = this.floorMarks;
    return { asked: m.tiles, bangs: m.bangs };
  }
  /** The hand is stuck: the ? nearest the hero by walk becomes !, which
   * Deprioritize's card heads for. False with none left to raise. */
  raiseBang() {
    const m = this.floorMarks;
    if (!m.tiles.length) return false;
    const away = walkAll(this, this.run.player, m.tiles);
    const far = (t: string) => away.get(t) ?? Infinity;
    const k = m.tiles.reduce((best, t) => (far(t) < far(best) ? t : best));
    this.run.marks = { ...m, tiles: m.tiles.filter((t) => t !== k), bangs: [...m.bangs, k] };
    return true;
  }
  /** Stepping on a marked tile clears its mark. */
  unmark(x: number, y: number) {
    const m = this.run.marks, k = `${x},${y}`;
    if (!m || (!m.tiles.includes(k) && !m.bangs.includes(k))) return;
    this.run.marks = { ...m, tiles: m.tiles.filter((t) => t !== k), bangs: m.bangs.filter((t) => t !== k) };
  }
  /** Whether card `id` rests greyed out for the rest of the floor:
   * Deprioritize with every mark made and no ! to head for. */
  cardResting(id: CardId) {
    const badge = badgeOn(this.run.badges, id, "deprioritize");
    if (!badge || this.run.outside) return false;
    const m = this.floorMarks;
    return !m.bangs.length && m.made >= badgeValue(badge.id, badge.level, badge.pick);
  }

  /** Whether a cooling-down badge works on this floor: never used, used
   * on this floor already, or `every` floors on from the last it worked on. */
  private cooled(kind: "stairward" | "skipOpen", every: number) {
    const last = this.run.badgeFloors?.[kind], floor = this.floor;
    return last === undefined || last === floor || floor - last >= every;
  }
  /** A cooling-down badge works on this floor: it rests from here. */
  private markUsed(kind: "stairward" | "skipOpen") {
    (this.run.badgeFloors ??= {})[kind] = this.floor;
  }
  /** A new plan for card `id` under Stairward counts as its use. */
  coolDown(id: CardId) {
    if (badgeOn(this.run.badges, id, "stairward") && this.cardRules(id)?.stairward) this.markUsed("stairward");
  }
  /** The doors and monsters Skip Open Nodes passed over on this floor, as
   * points, for the planner and the board's marks. */
  get skipMarks(): string[] {
    const skipped = this.run.skipped;
    return skipped && !this.run.outside && skipped.floor === this.floor ? skipped.tiles : [];
  }
  /** Skip Open Nodes passes over (x, y) for the rest of the floor. */
  private skipTile(x: number, y: number) {
    const floor = this.floor;
    if (this.run.skipped?.floor !== floor) this.run.skipped = { floor, tiles: [] };
    const k = `${x},${y}`;
    if (!this.run.skipped.tiles.includes(k)) this.run.skipped.tiles.push(k);
    this.markUsed("skipOpen");
  }

  /** The tiles Ignore marked on this floor, which no card's path nor
   * Target's crosses (`planHand` reads it). */
  get ignored(): ReadonlySet<string> {
    const m = this.run.ignored;
    return new Set(m && !this.run.outside && m.floor === this.floor ? m.tiles : []);
  }
  /** Ignore marks (x, y) for the rest of the floor; false for a tile it
   * can't take: a wall, the hero's own, or one already ignored. */
  ignore(x: number, y: number) {
    const p = this.run.player, k = `${x},${y}`;
    if (this.world.tile(x, y).kind === "wall" || (p.x === x && p.y === y) || this.ignored.has(k)) return false;
    const floor = this.floor;
    if (this.run.ignored?.floor !== floor) this.run.ignored = { floor, tiles: [] };
    this.run.ignored.tiles.push(k);
    return true;
  }

  /** Whether a card that acts in place can act now (`planHand` asks),
   * inside a run only: a siphon while enough of its training levels are
   * left for its next use, BK TRADER while 3 yellow keys are held, and YK TO
   * HP while a yellow key is held and its whole heal would land. */
  canAct(card: CardId) {
    if (this.run.outside) return false;
    const p = this.run.player;
    if (isSiphon(card)) return this.siphonLevel(card) >= this.siphonCost(card);
    if (card === "blueTrader") return p.keys.yellow >= TRADER_YELLOW_KEYS;
    if (card === "keyToHp") return p.keys.yellow >= 1 && snap(p.maxHp - p.hp) >= this.keyHeal();
    return false;
  }
  /** Times card `card`, one that acts in place, has acted this run. */
  cardUses(card: CardId) {
    return this.run.cardUses?.[card] ?? 0;
  }
  /** YK TO HP's heal: 10% of max HP. */
  keyHeal() {
    return snap((this.run.player.maxHp * KEY_TO_HP_PERCENT) / 100);
  }
  /** The run's training level of the row siphon `card` drains (Max HP for
   * YK SIPHON, DEF for BK SIPHON, ATK for RK SIPHON): the hero's own ranks
   * and those bought with Silver this run, less the levels it siphoned (1
   * for the first use, 2 for the second, and so on); 0 outside a run. */
  siphonLevel(card: SiphonCard) {
    if (this.run.outside) return 0;
    const uses = this.cardUses(card), row = SIPHONS[card].row;
    return this.host.save.training[row] + boughtInRun(this.run, row) - (uses * (uses + 1)) / 2;
  }
  /** The training levels siphon `card`'s next use takes: one more than the
   * last. */
  siphonCost(card: SiphonCard) {
    return this.cardUses(card) + 1;
  }
}

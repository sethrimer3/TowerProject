/** A turn's volley (docs/agents/movement-and-combat.md): once a turn inside
 * a run is taken, its shots play out over it a tick (a hundredth of the
 * turn) at a time, the hero walking its step from the tile it left to the
 * one it took. Each tick the Archer, its arrow ready, shoots the closest
 * enemy in its range, then each Ranged enemy whose cooldown is ready and
 * that the hero is within reach of shoots the hero, closest first. A shot
 * lands the tick it fires, so an enemy an arrow fells shoots no more that
 * turn, and the shot that fells the hero ends it. A shot the hero lives
 * through costs its shooter the hero's thorns, which may fell it. The rules of one shot
 * live in enemies/ranged.ts; this module plays a whole turn of them, in order, on
 * the board, and says what happened. `Game` decides whether a turn has a
 * volley at all and applies the outcome (the hero's HP, kill pay, a fall). */
import type { Board } from "./board.ts";
import type { ByFoe, Enemy, Player } from "./entities.ts";
import type { Save } from "./save-shape.ts";
import { critAgainst, facing, guaranteedCrits, isBoss, stealCeiling, thornDamage } from "./combat.ts";
import { critRule } from "./progression/loadout.ts";
import { foeAttack } from "./cards/foe-cards.ts";
import { trainedAmount } from "./config.ts";
import { researched } from "./progression/archives.ts";
import { archerClock, archerState, archerTick, arrowBoost, arrowDamage, arrowRange, charged, enemiesWithin, FOE_REACH, foeGain, foeOn, foeShotCost, foeTickGain, held, reachTicks, shoots, shotDamage, spent, TURN_TICKS, type InReach, type Volleys } from "./enemies/ranged.ts";
import { tileRandom } from "./random.ts";
import { snap } from "./exact.ts";

/** Salts the run seed for the Archer's critical rolls apart from a fight's. */
const ARROW_SALT = 0xa770e;
const MULTISHOT_SALT = 0x3a17c;
const RAPID_FIRE_SALT = 0x5f1d3;

/** One shot of a turn's volley, as the board shows it: a Ranged enemy's
 * at the hero, or the Archer's arrow at an enemy, flying `from` → `to`
 * (the arrow from where the hero stood as it fired, mid-step perhaps; the
 * enemy's shot to the tile the hero's step ends on), the tick of the turn
 * it fired (`tick`, 1 to `TURN_TICKS`), and what it did when it landed: the
 * damage that got through (and the shroud's share, a critical arrow's
 * applications, the HP an arrow's Lifesteal restored, what the hero's
 * thorns cost an enemy's shooter), for an arrow (or a shot's thorns) the
 * enemy's HP before and after it out of its full HP, and the enemy it
 * felled (`fell`), which the board keeps showing until the shot lands. */
export type Shot = { by: "hero" | "enemy"; from: { x: number; y: number }; to: { x: number; y: number }; damage: number; tick: number; shrouded?: number; crit?: number; charge?: number; healed?: number; thorns?: number; before?: number; hp?: number; full?: number; fell?: Enemy };
/** Where `shot`'s target stands: the hero's tile for an enemy's shot (whose
 * thorns cost the shooter, at `from`), the enemy's for an arrow. */
export const enemyOf = (shot: Shot) => (shot.by === "enemy" ? shot.from : shot.to);
/** A turn's shots, the turn shown from `at` (performance time) for `ms`:
 * each shot leaves its tick's share of the way through the turn and flies
 * `SHOT_FLIGHT` of a turn, so the last may land as the next turn begins. */
export type Volley = { at: number; ms: number; shots: Shot[] };
export const SHOT_FLIGHT = 0.5;
/** When `shot` of `volley` leaves its shooter, and when it lands. */
export const leavesAt = (volley: Volley, shot: Shot) => volley.at + (volley.ms * shot.tick) / TURN_TICKS;
export const landsAt = (volley: Volley, shot: Shot) => leavesAt(volley, shot) + volley.ms * SHOT_FLIGHT;
/** Whether every shot of `volley` has landed by `now`. */
export const volleyOver = (volley: Volley, now: number) => volley.shots.every((s) => now >= landsAt(volley, s));

/** What a turn's volley plays on: the board (its enemies wounded and
 * cleared as arrows land), whether its columns wrap (`wrap`, its width, or
 * 0), the equivalent floor (from 1) an enemy at (x, y) stands on, the hero
 * as the turn ends and the tile it began on (`from`; absent, it stood
 * still), the run's seed and volley state as the turn begins (`turn`
 * already counted), whether the hero is an Archer, the ranks and research
 * its arrows read (and the card trees' percents on Crit % and Crit x,
 * `cardCrit`), and the percent more Shot ATK and Attack Speed the
 * hand's cards give while held, and the percent more ATK their arrows
 * strike a boss or Greater Boss with (`handBonus` in cards/cards.ts), each with
 * the card trees' added, and the trees' percent more Attack Range for the
 * arrows (`range`) and Charged Shot (`charge`, and the enemy cards' by
 * card against theirs, `foeCharge`); none when absent. */
export type VolleyTurn = {
  board: Pick<Board, "tile" | "clear" | "wound">;
  wrap: number;
  floorOf: (x: number, y: number) => number;
  hero: Player;
  from?: { x: number; y: number };
  seed: number;
  volleys: Volleys;
  archer: boolean;
  ranks: Pick<Save, "upgrades" | "training" | "archives">;
  cardCrit?: { chance: number; factor: number };
  handShot?: { attack: number; speed: number; boss?: number; range?: number; charge?: number; foeCharge?: ByFoe };
};
/** An enemy an arrow felled, or the thorns of its own shot (`thorns`):
 * where, whether it fell to its first wound (an instakill), and the
 * arrow's critical applications. */
export type VolleyKill = { enemy: Enemy; at: { x: number; y: number }; instakill: boolean; crits: number; thorns?: true };
/** What a turn's volley did: the run's volley state after it, the shots in
 * the order they fired, the hero's HP after them, whether a Ranged enemy's
 * shot got through (`hurt`), the enemy whose shot felled the hero (the
 * turn then ends at that tick), and the enemies the arrows and thorns
 * felled, in order. */
export type VolleyOutcome = { volleys: Volleys; shots: Shot[]; hp: number; hurt: boolean; fell?: Enemy; kills: VolleyKill[] };

/** The hero's walk over the turn: the tile it starts from and its step;
 * none when it stood still or came farther than a step (a dash, a floor's
 * stairs), which counts as standing all turn on the tile it took. */
type Walk = { x: number; y: number; ux: number; uy: number };
/** A pair of ticks, first to last, both counted. */
type Span = { first: number; last: number };
/** An enemy the turn's shots may reach: its tile, its offset from where the
 * hero starts (`dx`, `dy`, round the wrap), and the ticks the hero is
 * within the Archer's reach of it (`arrows`) and within its own (`shots`). */
type Near = { x: number; y: number; dx: number; dy: number; arrows?: Span; shots?: Span };
/** A Ranged or Flying enemy the hero comes within reach of, its cooldown
 * running a tick at a time. */
type Shooter = { near: Near; key: string; charge: number | undefined; gain: number; cost: number };

/** A column difference the short way round a board `wrap` wide (0: none). */
const shortWay = (dx: number, wrap: number) => (wrap && Math.abs(dx) > wrap / 2 ? dx - Math.sign(dx) * wrap : dx);
const within = (tick: number, span: Span | undefined) => !!span && tick >= span.first && tick <= span.last;

function walkOf({ hero, from, wrap }: VolleyTurn): Walk {
  const still = { x: hero.x, y: hero.y, ux: 0, uy: 0 };
  if (!from) return still;
  const ux = shortWay(hero.x - from.x, wrap), uy = hero.y - from.y;
  return Math.abs(ux) > 1 || Math.abs(uy) > 1 ? still : { x: from.x, y: from.y, ux, uy };
}

/** Plays a turn's volley, tick by tick: the Archer's arrows, then the
 * Ranged enemies' shots, until one fells the hero. Edits the board's
 * enemies as its arrows and thorns wound and fell them; changes nothing
 * else it is given. */
export function volleyTurn(turn: VolleyTurn): VolleyOutcome {
  const { board, wrap, floorOf } = turn, hero = { ...turn.hero }, v: Volleys = { ...turn.volleys }, shots: Shot[] = [], kills: VolleyKill[] = [];
  const range = trainedAmount(turn.ranks, "attackRange"), reach = arrowRange(range, turn.handShot?.range), walk = walkOf(turn);
  /** The hero's squared distance to `n` at `tick`, in hundredths of a tile. */
  const distance = (n: Near, tick: number) => {
    const x = 100 * n.dx + walk.ux * tick, y = 100 * n.dy + walk.uy * tick;
    return x * x + y * y;
  };
  // Everything the turn's shots may reach, from anywhere along the step, found once.
  const near: Near[] = enemiesWithin(board, walk, reach + (walk.ux || walk.uy ? 150 : 0), wrap).map(({ x, y }) => {
    const dx = shortWay(walk.x - x, wrap), dy = walk.y - y;
    const arrows = reachTicks(dx, dy, walk.ux, walk.uy, reach * reach), shots = reachTicks(dx, dy, walk.ux, walk.uy, FOE_REACH.limit(range), FOE_REACH.scale);
    return { x, y, dx, dy, ...(arrows ? { arrows } : {}), ...(shots ? { shots } : {}) };
  });
  /** `n` as it stands at `tick`, if an enemy is still there. */
  const standing = (n: Near, tick: number): InReach | undefined => {
    const t = board.tile(n.x, n.y), enemy = t.kind === "enemy" && t.enemy ? t.enemy : t.flyer;
    return enemy ? { x: n.x, y: n.y, tile: t.enemy === enemy ? (t as InReach["tile"]) : { ...t, enemy }, d2: distance(n, tick) / 10_000 } : undefined;
  };
  const shooterAt = (x: number, y: number) => {
    const foe = foeOn(board.tile(x, y));
    return foe && shoots(foe) ? foe : undefined;
  };
  const byDistance = (a: InReach, b: InReach) => a.d2 - b.d2 || a.y - b.y || a.x - b.x;

  // Shooters the hero comes within reach of charge a tick at a time; the
  // rest charge a whole turn at once, and a charge whose tile no longer
  // holds a shooter is dropped.
  const foes: Record<string, number> = {}, shooters: Shooter[] = [], watched = new Set<string>();
  for (const n of near) {
    const foe = n.shots && shooterAt(n.x, n.y);
    if (!foe) continue;
    const key = `${n.x},${n.y}`;
    watched.add(key);
    shooters.push({ near: n, key, charge: v.foes?.[key], gain: foeTickGain(foe), cost: foeShotCost(floorOf(n.x, n.y)) });
  }
  for (const [key, charge] of Object.entries(v.foes ?? {})) {
    if (watched.has(key)) continue;
    const [x, y] = key.split(",").map(Number) as [number, number], foe = shooterAt(x, y);
    const kept = foe && held(charged(charge, foeGain(foe)), foeShotCost(floorOf(x, y)));
    if (kept !== undefined) foes[key] = kept;
  }

  const archer = turn.archer ? arrows(turn, hero, v, shots, kills, (tick) => near.filter((n) => within(tick, n.arrows)).map((n) => standing(n, tick)).filter((e): e is InReach => !!e).sort(byDistance), (tick) => heroAt(walk, tick, wrap)) : undefined;
  let fell: Enemy | undefined, hurt = false;
  for (let tick = 1; tick <= TURN_TICKS && !fell; tick++) {
    archer?.tick(tick);
    // Then each shooter whose cooldown is ready this tick, closest first.
    const firing: { s: Shooter; e: InReach }[] = [];
    for (const s of shooters) {
      if (s.charge !== undefined) {
        s.charge += s.gain;
        if (s.charge < s.cost) continue;
      }
      const e = within(tick, s.near.shots) ? standing(s.near, tick) : undefined;
      if (e && shoots(e.tile.enemy)) firing.push({ s, e });
      // Ready and waiting: it banks nothing more.
      else s.charge = undefined;
    }
    firing.sort((a, b) => byDistance(a.e, b.e));
    for (const { s, e } of firing) {
      if (fell) {
        s.charge = undefined;
        continue;
      }
      const { damage, shrouded } = shotDamage(hero, e.tile.enemy);
      s.charge = spent(s.charge, s.cost);
      hero.hp = snap(Math.max(0, hero.hp - damage));
      const shot: Shot = { by: "enemy", from: { x: e.x, y: e.y }, to: { x: hero.x, y: hero.y }, damage, tick, ...(shrouded ? { shrouded } : {}) };
      shots.push(shot);
      if (damage > 0) hurt = true;
      if (!hero.hp) fell = e.tile.enemy;
      else {
        const kill = thornsOf(board, hero, e, shot);
        if (kill) kills.push(kill);
      }
    }
  }
  archer?.end();
  for (const s of shooters) if (s.charge !== undefined && shooterAt(s.near.x, s.near.y)) foes[s.key] = s.charge;
  if (Object.keys(foes).length) v.foes = foes;
  else delete v.foes;
  return { volleys: v, shots, hp: hero.hp, hurt, ...(fell ? { fell } : {}), kills };
}

/** Thorns: a shot the hero lived through costs its shooter `e` the hero's
 * thorns, a share of its full HP (wounds and all), as a fight's strike
 * does; they wound it, or clear it from the board and return it as a kill.
 * Recorded on the `shot`, for the board's numbers and HP bar. */
function thornsOf(board: VolleyTurn["board"], hero: Player, { x, y, tile }: InReach, shot: Shot): VolleyKill | undefined {
  const enemy = tile.enemy, full = snap(enemy.hp + (tile.wound ?? 0)), thorns = thornDamage(hero, { ...enemy, fullHp: full });
  if (!thorns) return undefined;
  const left = snap(Math.max(0, enemy.hp - thorns));
  Object.assign(shot, { thorns, before: enemy.hp, hp: left, full });
  if (left > 0) {
    board.wound?.(x, y, thorns);
    return undefined;
  }
  board.clear(x, y);
  shot.fell = enemy;
  return { enemy, at: { x, y }, instakill: false, crits: 0, thorns: true };
}

/** Where the hero stands at `tick` along its walk (between tiles mid-step),
 * its column round the wrap. */
function heroAt(w: Walk, tick: number, wrap: number) {
  const x = w.x + (w.ux * tick) / TURN_TICKS;
  return { x: wrap ? ((x % wrap) + wrap) % wrap : x, y: w.y + (w.uy * tick) / TURN_TICKS };
}

/** The Archer's turn, run a tick at a time (`archerTick`): each time its
 * arrow is ready it shoots the closest enemy within its range (`inReach`,
 * as it stands that tick) that an arrow can hurt, from where the hero
 * stands then (`at`), its ATK raised by ATK / m for the distance and by
 * Charged Shot for the turns it waited (`arrowBoost`; the trees' Charge
 * Shot raising its percent, theirs against the enemy aimed at), and by the
 * hand's Shot ATK, and its boss bonus when it aims at a boss. A multishot fires
 * the same charge at up to Multishot Targets of the closest enemies it can
 * hurt, each arrow with the first's Charged Shot, its own ATK / m and its
 * own critical roll. A shot fired while Rapid Fire isn't may start it, for
 * Rapid Fire Duration from that moment, so the turn may fire more than
 * once. A ready arrow with no target waits for one, counting the turn
 * toward Charged Shot once that is researched. `end` keeps the clock. */
function arrows(turn: VolleyTurn, p: Player, v: Volleys, shots: Shot[], kills: VolleyKill[], inReach: (tick: number) => InReach[], at: (tick: number) => { x: number; y: number }) {
  const { ranks } = turn, perTile = trainedAmount(ranks, "attackPerTile"), percent = researched(ranks.archives, "chargedShotPercent");
  const shotAtk = turn.handShot?.attack ?? 0, bossAtk = turn.handShot?.boss ?? 0, base = trainedAmount(ranks, "attackSpeed");
  const speed = turn.handShot?.speed ? snap(base * (1 + turn.handShot.speed / 100)) : base;
  const charge = turn.handShot?.charge ?? 0, foeCharge = turn.handShot?.foeCharge;
  // The trees' Charge Shot, ARCHER's and the enemy cards' covering the target, one card factor.
  const charging = ({ tile }: InReach) => {
    const more = snap(charge + foeAttack(foeCharge, tile.enemy));
    return more ? snap((percent * (100 + more)) / 100) : percent;
  };
  const boost = (e: InReach) => arrowBoost(perTile, e.d2, charging(e), v.waited ?? 0);
  // The cards' Shot ATK adds to the enemy cards' ATK, one factor for the hand.
  const cards = ({ tile }: InReach) => shotAtk + (isBoss(tile.enemy) ? bossAtk : 0);
  const hurts = (e: InReach) => arrowDamage(p, e.tile.enemy, 0, 1, boost(e), cards(e)) > 0;
  // A fixed number per run, turn, shot of the turn (the first keeping the
  // turn's own roll) and the hero's tile, for `salt`.
  const shotRoll = (salt: number, shot: number) => tileRandom(p.x, p.y, (turn.seed ^ salt ^ Math.imul(v.turn, 0x85ebca6b) ^ Math.imul(shot, 0xc2b2ae35)) | 0);
  const multishot = (shot: number) => {
    const chance = trainedAmount(ranks, "multishotChance");
    return chance > 0 && shotRoll(MULTISHOT_SALT, shot) * 10_000 < chance;
  };
  const rapidFire = (shot: number) => {
    const chance = trainedAmount(ranks, "rapidFireChance");
    return chance > 0 && shotRoll(RAPID_FIRE_SALT, shot) * 10_000 < chance ? trainedAmount(ranks, "rapidFireDuration") : 0;
  };
  const crit = critRule(ranks, turn.cardCrit), clock = archerState({ charge: v.hero, rapid: v.rapid });
  let fired = 0;
  const shoot = (rapid: boolean, tick: number) => {
    const reach = inReach(tick), target = reach.find(hurts);
    if (!target) return false;
    const shot = fired++, from = at(tick);
    const targets = multishot(shot) ? reach.filter(hurts).slice(0, trainedAmount(ranks, "multishotTargets")) : [target];
    for (const t of targets) {
      const kill = arrow(turn, p, from, tick, t, crit, shot, boost(t), cards(t), snap(charging(t) * (v.waited ?? 0)), shots);
      if (kill) kills.push(kill);
    }
    delete v.waited;
    return rapid ? 0 : rapidFire(shot);
  };
  return {
    tick: (tick: number) => archerTick(clock, speed, tick, shoot),
    end() {
      const kept = archerClock(clock);
      if (kept.charge === undefined) delete v.hero;
      else v.hero = kept.charge;
      if (kept.rapid === undefined) delete v.rapid;
      else v.rapid = kept.rapid;
      if (clock.charge === undefined && percent > 0) v.waited = (v.waited ?? 0) + 1;
    },
  };
}

/** The Archer's arrow `shot` of the turn, fired from `from` at `tick`,
 * lands on its target: one strike's damage, its ATK multiplied by `boost`
 * and critical rolls counted, healing by Lifesteal; it wounds the enemy, or
 * clears it from the board and is returned as a kill. An arrow with a
 * `charge` (the percent Charged Shot added to its ATK) above 0 carries it,
 * for its glow and gold outline. */
function arrow({ board, seed, volleys }: VolleyTurn, p: Player, from: { x: number; y: number }, tick: number, { x, y, tile }: InReach, crit: ReturnType<typeof critRule>, shot: number, boost: number, cards: number, charge: number, shots: Shot[]): VolleyKill | undefined {
  const enemy = tile.enemy;
  let applications = 0;
  crit = critAgainst(crit, p, enemy);
  if (crit) {
    const sure = guaranteedCrits(crit.chance), rest = snap(crit.chance - 100 * sure);
    applications = sure + (tileRandom(x, y, (seed ^ ARROW_SALT ^ Math.imul(volleys.turn, 0x85ebca6b) ^ Math.imul(shot, 0xc2b2ae35)) | 0) * 100 < rest ? 1 : 0);
  }
  const damage = arrowDamage(p, enemy, applications, crit?.factor ?? 1, boost, cards), left = snap(Math.max(0, enemy.hp - damage));
  const healed = p.lifesteal ? snap(Math.min(stealCeiling(facing(p, enemy)) - p.hp, (damage * p.lifesteal) / 100)) : 0;
  if (healed > 0) p.hp = snap(p.hp + healed);
  const landed: Shot = { by: "hero", from, to: { x, y }, damage, tick, ...(applications ? { crit: applications } : {}), ...(charge > 0 ? { charge } : {}), ...(healed > 0 ? { healed } : {}),
    before: enemy.hp, hp: left, full: snap(enemy.hp + (tile.wound ?? 0)) };
  shots.push(landed);
  if (left > 0) {
    board.wound?.(x, y, damage);
    return undefined;
  }
  board.clear(x, y);
  landed.fell = enemy;
  // One arrow felling an unwounded enemy is an instakill, as Mug pays it.
  return { enemy, at: { x, y }, instakill: !tile.wound, crits: applications };
}

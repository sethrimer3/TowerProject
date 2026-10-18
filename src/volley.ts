/** A turn's volley (docs/agents/movement-and-combat.md): at the end of a
 * turn inside a run, each Ranged enemy within reach whose cooldown is ready
 * shoots the hero where it now stands, then the Archer, its arrow ready,
 * shoots the closest enemy in its range. The rules of one shot live in
 * ranged.ts; this module plays a whole turn of them, in order, on the
 * board, and says what happened. `Game` decides whether a turn has a volley
 * at all and applies the outcome (the hero's HP, kill pay, a fall). */
import type { Board } from "./board.ts";
import type { Enemy, Player } from "./entities.ts";
import type { Save } from "./save-shape.ts";
import { guaranteedCrits, isBoss } from "./combat.ts";
import { critRule } from "./loadout.ts";
import { trainedAmount } from "./config.ts";
import { researched } from "./archives.ts";
import { ARCHER_TICKS, archerTurn, arrowBoost, arrowDamage, charged, enemiesWithin, FOE_GAIN, foeOn, foeRange, foeShotCost, held, ready, shoots, shotDamage, spent, type InReach, type Volleys } from "./ranged.ts";
import { tileRandom } from "./random.ts";
import { snap } from "./exact.ts";

/** Salts the run seed for the Archer's critical rolls apart from a fight's. */
const ARROW_SALT = 0xa770e;
const MULTISHOT_SALT = 0x3a17c;
const RAPID_FIRE_SALT = 0x5f1d3;

/** One shot of a turn's volley, as the board shows it: a
 * Ranged enemy's at the hero, or the Archer's arrow at an enemy, flying
 * `from` → `to`, and what it did when it landed: the damage that got through
 * (and the shroud's share, a critical arrow's applications, the HP an
 * arrow's Lifesteal restored), and for an arrow the enemy's HP before and
 * after it out of its full HP. When the Archer fires more than once in a
 * turn (Rapid Fire), each of its arrows has a `lead`, how far into the
 * turn it fired (0 to 1), and flies half the flight from that share of its
 * first half, so they leave one after another. */
export type Shot = { by: "hero" | "enemy"; from: { x: number; y: number }; to: { x: number; y: number }; damage: number; shrouded?: number; crit?: number; charge?: number; healed?: number; before?: number; hp?: number; full?: number; lead?: number };
/** A turn's shots, flying from `at` (performance time) for `flight` ms. */
export type Volley = { at: number; flight: number; shots: Shot[] };

/** What a turn's volley plays on: the board (its enemies wounded and
 * cleared as arrows land), whether its columns wrap (`wrap`, its width, or
 * 0), the equivalent floor (from 1) an enemy at (x, y) stands on, the hero,
 * the run's seed and volley state as the turn begins (`turn` already
 * counted), whether the hero is an Archer, the ranks and research its
 * arrows read, and the percent more Shot ATK and Attack Speed the hand's
 * cards give while held, and the percent more ATK their arrows strike a
 * boss or Greater Boss with (`handBonus` in cards.ts; none when absent). */
export type VolleyTurn = {
  board: Pick<Board, "tile" | "clear" | "wound">;
  wrap: number;
  floorOf: (x: number, y: number) => number;
  hero: Player;
  seed: number;
  volleys: Volleys;
  archer: boolean;
  ranks: Pick<Save, "upgrades" | "training" | "archives">;
  handShot?: { attack: number; speed: number; boss?: number };
};
/** An enemy an arrow felled: where, whether it fell to its first wound
 * (an instakill), and the arrow's critical applications. */
export type VolleyKill = { enemy: Enemy; at: { x: number; y: number }; instakill: boolean; crits: number };
/** What a turn's volley did: the run's volley state after it, the shots in
 * the order they landed, the hero's HP after them, whether a Ranged
 * enemy's shot got through (`hurt`), the enemy whose shot felled the hero
 * (the Archer then doesn't shoot), and the enemies the arrows felled, in
 * order. */
export type VolleyOutcome = { volleys: Volleys; shots: Shot[]; hp: number; hurt: boolean; fell?: Enemy; kills: VolleyKill[] };

/** Plays a turn's volley: the Ranged enemies' shots, then, unless one
 * felled the hero, the Archer's arrows. Edits the board's enemies as its
 * arrows wound and fell them; changes nothing else it is given. */
export function volleyTurn(turn: VolleyTurn): VolleyOutcome {
  const hero = { ...turn.hero }, v: Volleys = { ...turn.volleys }, shots: Shot[] = [], range = trainedAmount(turn.ranks, "attackRange");
  const { fell, hurt } = foesShoot(turn, hero, v, shots, range);
  const kills = fell || !turn.archer ? [] : loose(turn, hero, v, shots, range);
  return { volleys: v, shots, hp: hero.hp, hurt, ...(fell ? { fell } : {}), kills };
}

/** Each Ranged or Flying enemy's cooldown runs a turn, and those within
 * reach that are ready shoot the hero, closest first, until one fells it. */
function foesShoot({ board, wrap, floorOf }: VolleyTurn, p: Player, v: Volleys, shots: Shot[], range: number) {
  const foes = { ...v.foes }, costs = new Map<string, number>();
  for (const k of Object.keys(foes)) {
    const [x, y] = k.split(",").map(Number) as [number, number];
    const foe = foeOn(board.tile(x, y));
    if (foe && shoots(foe)) foes[k] = charged(foes[k], FOE_GAIN)!;
    else delete foes[k];
  }
  let fell: Enemy | undefined, hurt = false;
  for (const { x, y, tile } of enemiesWithin(board, p, foeRange(range), wrap)) {
    if (!shoots(tile.enemy)) continue;
    const k = `${x},${y}`, cost = foeShotCost(floorOf(x, y));
    costs.set(k, cost);
    if (!ready(foes[k], cost)) continue;
    const { damage, shrouded } = shotDamage(p, tile.enemy);
    foes[k] = spent(foes[k], cost);
    p.hp = snap(Math.max(0, p.hp - damage));
    shots.push({ by: "enemy", from: { x, y }, to: { x: p.x, y: p.y }, damage, ...(shrouded ? { shrouded } : {}) });
    if (damage > 0) hurt = true;
    if (!p.hp) {
      fell = tile.enemy;
      break;
    }
  }
  // A shooter that didn't shoot waits full once it is ready.
  for (const k of Object.keys(foes)) {
    const [x, y] = k.split(",").map(Number) as [number, number];
    const kept = held(foes[k], costs.get(k) ?? foeShotCost(floorOf(x, y)));
    if (kept === undefined) delete foes[k];
    else foes[k] = kept;
  }
  if (Object.keys(foes).length) v.foes = foes;
  else delete v.foes;
  return { fell, hurt };
}

/** The Archer's cooldown runs a turn (`archerTurn`), and each time it is
 * ready it shoots the closest enemy within its range that an arrow can
 * hurt, its ATK raised by ATK / m for the distance and by Charged Shot
 * for the turns it waited (`arrowBoost`), and by the hand's Shot ATK, and
 * its boss bonus when it aims at a boss. A multishot fires
 * the same charge at up to Multishot Targets of the closest enemies it can
 * hurt, each arrow with the first's Charged Shot, its own ATK / m and
 * its own critical roll. A shot fired while Rapid Fire isn't may start it,
 * for Rapid Fire Duration from that moment, so the turn
 * may fire more than once. A ready arrow with no target waits for one,
 * counting the turn toward Charged Shot once that is researched. */
function loose(turn: VolleyTurn, p: Player, v: Volleys, shots: Shot[], range: number) {
  const { board, wrap, ranks } = turn, perTile = trainedAmount(ranks, "attackPerTile"), percent = researched(ranks.archives, "chargedShotPercent");
  const shotAtk = turn.handShot?.attack ?? 0, bossAtk = turn.handShot?.boss ?? 0, speed = trainedAmount(ranks, "attackSpeed");
  const boost = ({ d2 }: InReach) => arrowBoost(perTile, d2, percent, v.waited ?? 0);
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
  const kills: VolleyKill[] = [], crit = critRule(ranks), first = shots.length;
  let fired = 0;
  const { clock, idle } = archerTurn({ charge: v.hero, rapid: v.rapid }, turn.handShot?.speed ? snap(speed * (1 + turn.handShot.speed / 100)) : speed, (rapid, tick) => {
    const inReach = enemiesWithin(board, p, range, wrap), target = inReach.find(hurts);
    if (!target) return false;
    const shot = fired++, from = shots.length;
    const targets = multishot(shot) ? inReach.filter(hurts).slice(0, trainedAmount(ranks, "multishotTargets")) : [target];
    for (const t of targets) {
      const kill = arrow(turn, p, t, crit, shot, boost(t), cards(t), percent * (v.waited ?? 0), shots);
      if (kill) kills.push(kill);
    }
    for (let i = from; i < shots.length; i++) shots[i]!.lead = tick / ARCHER_TICKS;
    delete v.waited;
    return rapid ? 0 : rapidFire(shot);
  });
  // A turn of one shot flies as ever.
  if (fired < 2) for (let i = first; i < shots.length; i++) delete shots[i]!.lead;
  if (clock.charge === undefined) delete v.hero;
  else v.hero = clock.charge;
  if (clock.rapid === undefined) delete v.rapid;
  else v.rapid = clock.rapid;
  if (idle && percent > 0) v.waited = (v.waited ?? 0) + 1;
  return kills;
}

/** The Archer's arrow `shot` of the turn lands on its target: one strike's
 * damage, its ATK multiplied by `boost` and critical rolls counted,
 * healing by Lifesteal; it wounds the enemy, or clears it from the board
 * and is returned as a kill. An arrow with a `charge` (the percent Charged
 * Shot added to its ATK) above 0 carries it, for its glow and gold outline. */
function arrow({ board, seed, volleys }: VolleyTurn, p: Player, { x, y, tile }: InReach, crit: ReturnType<typeof critRule>, shot: number, boost: number, cards: number, charge: number, shots: Shot[]): VolleyKill | undefined {
  const enemy = tile.enemy;
  let applications = 0;
  if (crit) {
    const sure = guaranteedCrits(crit.chance), rest = snap(crit.chance - 100 * sure);
    applications = sure + (tileRandom(x, y, (seed ^ ARROW_SALT ^ Math.imul(volleys.turn, 0x85ebca6b) ^ Math.imul(shot, 0xc2b2ae35)) | 0) * 100 < rest ? 1 : 0);
  }
  const damage = arrowDamage(p, enemy, applications, crit?.factor ?? 1, boost, cards), left = snap(Math.max(0, enemy.hp - damage));
  const healed = p.lifesteal ? snap(Math.min(p.maxHp - p.hp, (damage * p.lifesteal) / 100)) : 0;
  if (healed > 0) p.hp = snap(p.hp + healed);
  shots.push({ by: "hero", from: { x: p.x, y: p.y }, to: { x, y }, damage, ...(applications ? { crit: applications } : {}), ...(charge > 0 ? { charge } : {}), ...(healed > 0 ? { healed } : {}),
    before: enemy.hp, hp: left, full: snap(enemy.hp + (tile.wound ?? 0)) });
  if (left > 0) {
    board.wound?.(x, y, damage);
    return undefined;
  }
  board.clear(x, y);
  // One arrow felling an unwounded enemy is an instakill, as Mug pays it.
  return { enemy, at: { x, y }, instakill: !tile.wound, crits: applications };
}

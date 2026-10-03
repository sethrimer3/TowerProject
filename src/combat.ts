import type { Enemy, Player } from "./entities.ts";
import { snap } from "./exact.ts";

export type CombatPrediction = {
  impervious: boolean;
  hit: number;
  turns: number;
  damage: number;
  survivable: boolean;
  requiredAttack: number;
};

export function predict(player: Player, enemy: Enemy): CombatPrediction {
  const hit = snap(player.attack - enemy.defense);
  if (hit <= 0) {
    return {
      impervious: true,
      hit: 0,
      turns: Infinity,
      damage: Infinity,
      survivable: false,
      requiredAttack: snap(enemy.defense - player.attack + 1),
    };
  }
  // Snapped, so 10.2 HP against strikes of 1.02 takes 10, as it does played out.
  const turns = Math.ceil(snap(enemy.hp / hit));
  // The shroud takes the first of it, whichever strikes that falls on.
  const damage = snap(Math.max(0, damageTaken(enemy.attack, player.defense, turns - 1) - (player.shroud ?? 0)));
  return {
    impervious: false,
    hit,
    turns,
    damage,
    survivable: player.hp > damage,
    requiredAttack: 0,
  };
}

/** Attack Lore: the fewest whole points of ATK more that defeat `enemy` in
 * one hit fewer, or null when one hit does already (or none can). Taking
 * `turns − 1` hits needs each to deal at least HP / (turns − 1), so that
 * much over the enemy's DEF, rounded up; then checked against `predict`,
 * which snaps as the fight does. */
export function attackForFewerHits(player: Player, enemy: Enemy): number | null {
  const { impervious, turns } = predict(player, enemy);
  if (impervious || turns <= 1) return null;
  const fewer = (more: number) => predict({ ...player, attack: snap(player.attack + more) }, enemy).turns < turns;
  let more = Math.max(1, Math.ceil(snap(enemy.hp / (turns - 1) + enemy.defense - player.attack)));
  while (more > 1 && fewer(more - 1)) more--;
  while (!fewer(more)) more++;
  return more;
}

/** The enemy's ATK in the next round: after every round it rises by 1% of
 * its ATK (rounded down), and by at least 1, so no DEF holds it off forever
 * and no fight drags on without end. */
export function raisedAttack(attack: number) {
  return snap(attack + Math.max(1, Math.floor(attack / 100)));
}

/** What the enemy's strikes back cost the hero over `strikes` rounds, starting
 * at `attack` and rising each round. Past what any HP could survive it is
 * Infinity, so a fight with a million rounds is summed in a few thousand. */
function damageTaken(attack: number, defense: number, strikes: number) {
  let damage = 0;
  for (let i = 0; i < strikes && damage <= Number.MAX_SAFE_INTEGER; i++, attack = raisedAttack(attack)) {
    damage = snap(damage + Math.max(0, attack - defense));
  }
  return damage > Number.MAX_SAFE_INTEGER ? Infinity : damage;
}

/** How long each strike of a fight played out round by round takes: the first
 * round's two strikes take the longest, each later round is quicker, down to
 * the fastest pace. */
export const FIRST_STRIKE_MS = 250;
export const STRIKE_SPEEDUP = 0.9;
export const FASTEST_STRIKE_MS = 50;

/** How long a revival's golden fire and its "REVIVED" text last; a fight
 * shown in summary rounds begins its next round once it is over. */
export const REVIVE_MS = 1400;

/** One strike of a fight: who struck, for how much, when it swings (`start`
 * to `end`, in ms from the fight's start) and lands (`at`), and the HP the
 * struck side has left. Of an enemy's strike, the shroud takes what it can
 * (`shrouded`), and `damage` is what gets through to the hero. A strike
 * that would have felled the hero but revived it (`revived`) leaves it at
 * full HP. */
export type Strike = { by: "hero" | "enemy"; damage: number; shrouded?: number; revived?: true; start: number; at: number; end: number; hp: number };
export type Bout = { strikes: Strike[]; duration: number };
/** Whether the enemy's strike numbered `strike` (from 0) in a fight, which
 * would fell the hero, revives it instead (the Revive skill). */
export type Revival = (strike: number) => boolean;

/** The rounds `predict` sums up, one strike at a time: the hero strikes first,
 * then the enemy (its ATK rising after each round, the shroud taking its
 * strikes until it is spent), until one of them falls. Ends with the same HP
 * as the prediction (or at 0 in a fight the hero loses), unless `revives`
 * raises the hero at full HP from a strike that would fell it: the fight
 * then goes on from the next round, the enemy as it was. */
export function bout(player: Player, enemy: Enemy, revives?: Revival): Bout {
  if (snap(player.attack - enemy.defense) <= 0) return { strikes: [], duration: 0 };
  return play([], player, enemy, { enemyHp: enemy.hp, heroHp: player.hp, shroud: player.shroud ?? 0, attack: enemy.attack, t: 0, ms: FIRST_STRIKE_MS, enemyStrikes: 0, enemyNext: false }, revives);
}

/** Where a fight stands before its next strike: each side's HP, what is
 * left of the shroud, the enemy's ATK, when the strike swings and how long
 * it takes, the enemy's strikes so far, and whose strike it is. */
type BoutState = { enemyHp: number; heroHp: number; shroud: number; attack: number; t: number; ms: number; enemyStrikes: number; enemyNext: boolean };

/** Plays a fight on from `state`, after the strikes already in `strikes`. */
function play(strikes: Strike[], player: Player, enemy: Enemy, state: BoutState, revives?: Revival): Bout {
  const hit = snap(player.attack - enemy.defense);
  let { enemyHp, heroHp, shroud, attack, t, ms, enemyStrikes, enemyNext } = state;
  const strike = (by: Strike["by"], damage: number, hp: number, shrouded = 0, revived = false) => {
    strikes.push({ by, damage, ...(shrouded ? { shrouded } : {}), ...(revived ? { revived: true as const } : {}), start: t, at: t + ms / 2, end: t + ms, hp });
    t += ms;
  };
  for (;;) {
    if (!enemyNext) {
      enemyHp = snap(Math.max(0, enemyHp - hit));
      strike("hero", hit, enemyHp);
      if (!enemyHp) break;
    }
    enemyNext = false;
    const struck = snap(Math.max(0, attack - player.defense)), shrouded = Math.min(shroud, struck), taken = snap(struck - shrouded);
    shroud = snap(shroud - shrouded);
    heroHp = snap(Math.max(0, heroHp - taken));
    const revived = !heroHp && !!revives?.(enemyStrikes);
    if (revived) heroHp = player.maxHp;
    enemyStrikes++;
    strike("enemy", taken, heroHp, shrouded, revived);
    if (!heroHp) break;
    attack = raisedAttack(attack);
    ms = Math.max(FASTEST_STRIKE_MS, ms * STRIKE_SPEEDUP);
  }
  return { strikes, duration: t };
}

/** The fight played on with the hero's stats changed mid-fight (training
 * bought in a run): the strikes before `from` stand as they were, and from
 * strike `from` on the hero fights as `player`, whose `hp` and `shroud`
 * are what the hero has left at that point. */
export function resume(fight: Bout, from: number, player: Player, enemy: Enemy, revives?: Revival): Bout {
  const kept = fight.strikes.slice(0, from), next = fight.strikes[from];
  if (!next) return { strikes: kept, duration: fight.duration };
  let enemyHp = enemy.hp, attack = enemy.attack, ms = FIRST_STRIKE_MS, enemyStrikes = 0;
  for (const s of kept) {
    if (s.by === "hero") {
      enemyHp = s.hp;
      continue;
    }
    enemyStrikes++;
    attack = raisedAttack(attack);
    ms = Math.max(FASTEST_STRIKE_MS, ms * STRIKE_SPEEDUP);
  }
  const state = { enemyHp, heroHp: player.hp, shroud: player.shroud ?? 0, attack, t: next.start, ms, enemyStrikes, enemyNext: next.by === "enemy" };
  return play(kept, player, enemy, state, revives);
}

/** A fight settled at once (Animate fights off), shown as summary rounds:
 * each holds the hero's strikes as one strike and the enemy's as another,
 * landing together. A revival ends a round, and the next begins `gap` ms
 * later, once its fire has burned out. */
export function summarize(fight: Bout, gap: number): Bout {
  const strikes: Strike[] = [];
  let t = 0, round: Round = {};
  for (const s of fight.strikes) {
    round = withStrike(round, s, t);
    if (s.by === "hero" || !s.revived) continue;
    strikes.push(...roundStrikes(round));
    round = {};
    t += gap;
  }
  strikes.push(...roundStrikes(round));
  return { strikes, duration: strikes.at(-1)?.at ?? 0 };
}

/** A summary round so far: the hero's strikes as one, the enemy's as another. */
type Round = { hero?: Strike; enemy?: Strike };
const roundStrikes = ({ hero, enemy }: Round) => [hero, enemy].filter((s): s is Strike => !!s);

/** `round` with strike `s` added to its side's, landing at `t`. */
function withStrike(round: Round, s: Strike, t: number): Round {
  const at = { start: t, at: t, end: t };
  if (s.by === "hero") return { ...round, hero: { by: "hero", damage: snap((round.hero?.damage ?? 0) + s.damage), hp: s.hp, ...at } };
  const prev = round.enemy, shrouded = snap((prev?.shrouded ?? 0) + (s.shrouded ?? 0));
  return { ...round, enemy: { by: "enemy", damage: snap((prev?.damage ?? 0) + s.damage), ...(shrouded ? { shrouded } : {}), ...(s.revived ? { revived: true as const } : {}), hp: s.hp, ...at } };
}

/** The hero's HP once the fight is over, from `hp` at its start. */
export const heroHpAfter = (fight: Bout, hp: number) => heroHpDuring(fight, hp, Infinity);
/** When each of the fight's revivals lands, in ms from its start. */
export const revivals = (fight: Bout) => fight.strikes.filter((s) => s.revived).map((s) => s.at);

/** The hero's HP `elapsed` ms into a fight that began at `hp`. */
export function heroHpDuring(fight: Bout, hp: number, elapsed: number) {
  for (const s of fight.strikes) if (s.by === "enemy" && s.at <= elapsed) hp = s.hp;
  return hp;
}

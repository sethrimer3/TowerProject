import type { Enemy, Player } from "./entities.ts";
import { snap } from "./exact.ts";

export type CombatPrediction = {
  impervious: boolean;
  hit: number;
  turns: number;
  damage: number;
  survivable: boolean;
  requiredAttack: number;
  /** The hero's HP once the fight is over, when Lifesteal is in play (its
   * heals counted as the fight goes, up to max HP): `damage` is then the
   * HP lost net of them, and this the exact ending a step resolves to. */
  hpAfter?: number;
};

/** The ATK the hero strikes `enemy` with: its own, raised against a boss
 * or Greater Boss by the percent its equipment gives (`bossAttack`). */
export function attackAgainst(player: Player, enemy: Enemy) {
  const boss = enemy.strength === "boss" || enemy.strength === "greaterBoss";
  return boss && player.bossAttack ? snap((player.attack * (100 + player.bossAttack)) / 100) : player.attack;
}
/** The DEF `enemy` holds against the hero: its own, less the percent the
 * hero's equipment pierces (`pierce`). */
export function defenseAgainst(player: Player, enemy: Enemy) {
  return player.pierce ? snap((enemy.defense * (100 - player.pierce)) / 100) : enemy.defense;
}
/** The hero's critical strikes: each strike is critical with `chance` percent
 * (100 or more: that many applications are certain, and the rest rolls for
 * one more), and every application adds `factor` − 1 times the hero's ATK to
 * the strike, so one application multiplies it by `factor`. */
export type CritRule = { chance: number; factor: number };
/** What a strike with `applications` critical applications multiplies ATK by. */
export const critMultiplier = (factor: number, applications: number) => (applications ? snap(1 + applications * (factor - 1)) : 1);
/** The hero's critical rolls in one fight: the `factor` and how many
 * applications strike number `strike` (from 0, the hero's own) has. */
export type Crits = { factor: number; applications: (strike: number) => number };
/** How many applications of its critical factor `chance` percent always lands. */
export const guaranteedCrits = (chance: number) => Math.floor(chance / 100);
/** `player` striking with the applications `crit` is certain to land: its
 * own when it has none. The worst a fight can go for the hero. */
export function atWorst(player: Player, crit?: CritRule): Player {
  const k = crit ? guaranteedCrits(crit.chance) : 0;
  return k ? { ...player, attack: snap(player.attack * critMultiplier(crit!.factor, k)) } : player;
}
/** What each of the hero's strikes takes off `enemy`'s HP (0 or less: none),
 * its ATK multiplied by `multiplier` (a critical strike's). */
const heroHit = (player: Player, enemy: Enemy, multiplier = 1) => {
  const attack = attackAgainst(player, enemy);
  return snap((multiplier === 1 ? attack : snap(attack * multiplier)) - defenseAgainst(player, enemy));
};
/** Whether the hero's strikes can't hurt `enemy` at all (`predict`'s
 * `impervious`), without working out the rest of the fight. */
export const impervious = (player: Player, enemy: Enemy) => heroHit(player, enemy) <= 0;

export function predict(player: Player, enemy: Enemy): CombatPrediction {
  const hit = heroHit(player, enemy);
  if (hit <= 0) {
    return {
      impervious: true,
      hit: 0,
      turns: Infinity,
      damage: Infinity,
      survivable: false,
      requiredAttack: snap(defenseAgainst(player, enemy) - attackAgainst(player, enemy) + 1),
    };
  }
  // Snapped, so 10.2 HP against strikes of 1.02 takes 10, as it does played out.
  const turns = Math.ceil(snap(enemy.hp / hit));
  if (player.lifesteal) {
    const hpAfter = lifestealEnding(player, enemy, hit);
    if (hpAfter !== null) return { impervious: false, hit, turns, damage: snap(Math.max(0, player.hp - hpAfter)), survivable: true, requiredAttack: 0, hpAfter };
  }
  // The shroud takes the first of it, whichever strikes that falls on.
  const damage = snap(Math.max(0, damageTaken(enemy.attack, player.defense, turns - 1) - (player.shroud ?? 0)));
  return {
    impervious: false,
    hit,
    turns,
    damage,
    survivable: player.hp > damage && !player.lifesteal,
    requiredAttack: 0,
  };
}

/** What each strike's damage restores of the hero's HP (Lifesteal), the
 * share of it in percent. */
const lifestealHeal = (player: Player, dealt: number) => snap((dealt * (player.lifesteal ?? 0)) / 100);

/** The hero's HP when a fight against `enemy` ends, the hero's strikes each
 * dealing `hit` and healing by its Lifesteal as they land (before the
 * enemy's reply, up to max HP), or null when the enemy fells it first. It
 * plays the rounds as `bout` does, so the two end alike. */
function lifestealEnding(player: Player, enemy: Enemy, hit: number) {
  let hp = player.hp, enemyHp = enemy.hp, attack = enemy.attack, shroud = player.shroud ?? 0;
  for (;;) {
    const dealt = Math.min(hit, enemyHp);
    enemyHp = snap(Math.max(0, enemyHp - hit));
    hp = snap(Math.min(player.maxHp, hp + lifestealHeal(player, dealt)));
    if (!enemyHp) return hp;
    const struck = snap(Math.max(0, attack - player.defense)), shrouded = Math.min(shroud, struck);
    shroud = snap(shroud - shrouded);
    hp = snap(Math.max(0, hp - snap(struck - shrouded)));
    if (!hp) return null;
    attack = raisedAttack(attack);
  }
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
  let more = Math.max(1, Math.ceil(snap(enemy.hp / (turns - 1) + defenseAgainst(player, enemy) - player.attack)));
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
export function damageTaken(attack: number, defense: number, strikes: number) {
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
 * full HP. A critical hero strike carries the applications of the
 * critical factor it landed (`crit`), and one that heals the hero
 * (Lifesteal) the hero's HP after it (`heroHp`) and the HP it restored
 * (`healed`; in a summary round, what the round gave the hero net of the
 * damage it took, on whichever strike lands last). */
export type Strike = { by: "hero" | "enemy"; damage: number; crit?: number; heroHp?: number; healed?: number; shrouded?: number; revived?: true; start: number; at: number; end: number; hp: number };
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
export function bout(player: Player, enemy: Enemy, revives?: Revival, crits?: Crits): Bout {
  if (heroHit(player, enemy) <= 0) return { strikes: [], duration: 0 };
  return play([], { player, enemy, revives, crits }, { enemyHp: enemy.hp, heroHp: player.hp, shroud: player.shroud ?? 0, attack: enemy.attack, t: 0, ms: FIRST_STRIKE_MS, enemyStrikes: 0, heroStrikes: 0, enemyNext: false });
}

/** Where a fight stands before its next strike: each side's HP, what is
 * left of the shroud, the enemy's ATK, when the strike swings and how long
 * it takes, the enemy's strikes so far, and whose strike it is. */
type BoutState = { enemyHp: number; heroHp: number; shroud: number; attack: number; t: number; ms: number; enemyStrikes: number; heroStrikes: number; enemyNext: boolean };

/** A strike before it is timed. */
type Blow = Omit<Strike, "start" | "at" | "end">;

/** The two sides of a fight, and whether a strike that would fell the
 * hero revives it instead, and the hero's critical strikes. */
export type Fighters = { player: Player; enemy: Enemy; revives?: Revival; crits?: Crits };

/** Plays a fight on from `state`, after the strikes already in `strikes`. */
function play(strikes: Strike[], { player, enemy, revives, crits }: Fighters, state: BoutState): Bout {
  const hit = heroHit(player, enemy), s = { ...state };
  // Each strike keeps its fields in the same order: its blow, its timing, then the HP left.
  const strike = ({ hp, ...blow }: Blow) => {
    strikes.push({ ...blow, start: s.t, at: s.t + s.ms / 2, end: s.t + s.ms, hp });
    s.t += s.ms;
  };
  for (;;) {
    if (!s.enemyNext) {
      const applications = crits?.applications(s.heroStrikes) ?? 0, struck = applications ? heroHit(player, enemy, critMultiplier(crits!.factor, applications)) : hit;
      s.heroStrikes++;
      const dealt = Math.min(struck, s.enemyHp), healed = player.lifesteal ? snap(Math.min(player.maxHp, s.heroHp + lifestealHeal(player, dealt))) : s.heroHp;
      const heals = healed !== s.heroHp, gained = snap(healed - s.heroHp);
      s.heroHp = healed;
      s.enemyHp = snap(Math.max(0, s.enemyHp - struck));
      strike({ by: "hero", damage: struck, ...(applications ? { crit: applications } : {}), ...(heals ? { heroHp: healed, healed: gained } : {}), hp: s.enemyHp });
      if (!s.enemyHp) break;
    }
    s.enemyNext = false;
    strike(enemyBlow(s, player, revives));
    if (!s.heroHp) break;
    s.attack = raisedAttack(s.attack);
    s.ms = Math.max(FASTEST_STRIKE_MS, s.ms * STRIKE_SPEEDUP);
  }
  return { strikes, duration: s.t };
}

/** The enemy strikes the hero in `s`: the shroud takes what it can, the
 * rest comes off the hero's HP, and a strike that would fell the hero may
 * revive it at full HP. */
function enemyBlow(s: BoutState, player: Player, revives?: Revival): Blow {
  const struck = snap(Math.max(0, s.attack - player.defense)), shrouded = Math.min(s.shroud, struck), taken = snap(struck - shrouded);
  s.shroud = snap(s.shroud - shrouded);
  s.heroHp = snap(Math.max(0, s.heroHp - taken));
  const revived = !s.heroHp && !!revives?.(s.enemyStrikes);
  if (revived) s.heroHp = player.maxHp;
  s.enemyStrikes++;
  return { by: "enemy", damage: taken, ...(shrouded ? { shrouded } : {}), ...(revived ? { revived: true as const } : {}), hp: s.heroHp };
}

/** The fight played on with the hero's stats changed mid-fight (training
 * bought in a run): the strikes before `from` stand as they were, and from
 * strike `from` on the hero fights as `player`, whose `hp` and `shroud`
 * are what the hero has left at that point. */
export function resume(fight: Bout, from: number, fighters: Fighters): Bout {
  const { player, enemy } = fighters;
  const kept = fight.strikes.slice(0, from), next = fight.strikes[from];
  if (!next) return { strikes: kept, duration: fight.duration };
  let enemyHp = enemy.hp, attack = enemy.attack, ms = FIRST_STRIKE_MS, enemyStrikes = 0, heroStrikes = 0;
  for (const s of kept) {
    if (s.by === "hero") {
      enemyHp = s.hp;
      heroStrikes++;
      continue;
    }
    enemyStrikes++;
    attack = raisedAttack(attack);
    ms = Math.max(FASTEST_STRIKE_MS, ms * STRIKE_SPEEDUP);
  }
  const state = { enemyHp, heroHp: player.hp, shroud: player.shroud ?? 0, attack, t: next.start, ms, enemyStrikes, heroStrikes, enemyNext: next.by === "enemy" };
  return play(kept, fighters, state);
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
const roundStrikes = ({ hero, enemy }: Round): Strike[] => {
  const heal = hero?.healed ?? 0;
  if (!hero || !heal) return [hero, enemy].filter((s): s is Strike => !!s);
  // What the hero healed (Lifesteal) folds into what it took, so a round
  // shows its net: the loss, or, when the heals outdid it, the gain, which
  // rides on the round's last strike.
  const taken = enemy?.damage ?? 0, { healed: _, ...plain } = hero;
  if (heal <= taken) return [plain, { ...enemy!, damage: snap(taken - heal) }];
  const net = snap(heal - taken);
  return enemy ? [plain, { ...enemy, damage: 0, healed: net }] : [{ ...hero, healed: net }];
};

/** `round` with strike `s` added to its side's, landing at `t`. */
function withStrike(round: Round, s: Strike, t: number): Round {
  const at = { start: t, at: t, end: t };
  if (s.by === "hero") {
    const crit = (round.hero?.crit ?? 0) + (s.crit ?? 0);
    // A heal comes after the enemy's strikes already in the round, so the HP the round ends on is the healed one.
    const healed = snap((round.hero?.healed ?? 0) + (s.healed ?? 0));
    const heroHp = s.heroHp ?? round.hero?.heroHp, enemy = s.heroHp !== undefined && round.enemy ? { ...round.enemy, hp: s.heroHp } : round.enemy;
    return { ...round, ...(enemy ? { enemy } : {}), hero: { by: "hero", damage: snap((round.hero?.damage ?? 0) + s.damage), ...(crit ? { crit } : {}), ...(heroHp !== undefined ? { heroHp } : {}), ...(healed ? { healed } : {}), hp: s.hp, ...at } };
  }
  const prev = round.enemy, shrouded = snap((prev?.shrouded ?? 0) + (s.shrouded ?? 0));
  return { ...round, enemy: { by: "enemy", damage: snap((prev?.damage ?? 0) + s.damage), ...(shrouded ? { shrouded } : {}), ...(s.revived ? { revived: true as const } : {}), hp: s.hp, ...at } };
}

/** The hero's HP once the fight is over, from `hp` at its start. */
export const heroHpAfter = (fight: Bout, hp: number) => heroHpDuring(fight, hp, Infinity);
/** When each of the fight's revivals lands, in ms from its start. */
export const revivals = (fight: Bout) => fight.strikes.filter((s) => s.revived).map((s) => s.at);

/** The hero's HP `elapsed` ms into a fight that began at `hp`. */
export function heroHpDuring(fight: Bout, hp: number, elapsed: number) {
  for (const s of fight.strikes) {
    if (s.at > elapsed) continue;
    if (s.by === "enemy") hp = s.hp;
    else if (s.heroHp !== undefined) hp = s.heroHp;
  }
  return hp;
}

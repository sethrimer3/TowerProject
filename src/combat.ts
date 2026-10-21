import type { Enemy, Player } from "./entities.ts";
import { eitherChance, snap } from "./exact.ts";
import { foeAttack } from "./foe-cards.ts";

/** `hp` after a heal of `n` that stops at `ceiling` (max HP, or the
 * Overheal ceiling for a heal that overheals): a heal never lowers HP that
 * Overheal holds above it. */
export const healUpTo = (hp: number, n: number, ceiling: number) => (hp >= ceiling ? hp : snap(Math.min(ceiling, hp + n)));

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
  /** The fight ends on an enemy strike, its thorns felling the enemy: the
   * hero takes `turns` strikes, not `turns` − 1. */
  thornKill?: true;
  /** The enemy is Fast and strikes first: the hero takes one strike more. */
  fast?: true;
};
/** The enemy strikes a predicted fight's hero takes. */
export const replies = (r: CombatPrediction) => r.turns - 1 + (r.thornKill ? 1 : 0) + (r.fast ? 1 : 0);
/** Whether the hero's first strike wins the fight, the enemy never striking. */
export const instakill = (r: CombatPrediction) => r.turns === 1 && !r.thornKill && !r.fast;

/** The ATK the hero strikes `enemy` with: its own, raised against a boss
 * or Greater Boss by the percent its equipment gives (`bossAttack`), then
 * by the hand's cards' percents added into one factor: the enemy cards
 * covering it (`foeAttack`) and `cards` more (an arrow's Shot ATK). Each
 * kind of source sums its own bonuses; the kinds multiply. */
export function attackAgainst(player: Player, enemy: Enemy, cards = 0) {
  const boss = isBoss(enemy) ? (player.bossAttack ?? 0) : 0, card = foeAttack(player.foeAttack, enemy) + cards;
  const geared = boss ? snap((player.attack * (100 + boss)) / 100) : player.attack;
  return card ? snap((geared * (100 + card)) / 100) : geared;
}
export const isBoss = (enemy: Enemy) => enemy.strength === "boss" || enemy.strength === "greaterBoss";
/** `player` as it stands against `enemy`: its DEF and shroud raised by the
 * card trees' percents covering it (`foeDefense`, `foeShroud`), each added
 * into one card factor; itself when none does. Fights and enemy shots take
 * the hero through it. */
export function facing(player: Player, enemy: Enemy): Player {
  const defense = foeAttack(player.foeDefense, enemy), shroud = foeAttack(player.foeShroud, enemy);
  if (!defense && !(shroud && player.shroud)) return player;
  return {
    ...player,
    ...(defense ? { defense: snap((player.defense * (100 + defense)) / 100) } : {}),
    ...(shroud && player.shroud ? { shroud: snap((player.shroud * (100 + shroud)) / 100) } : {}),
  };
}
/** Thorns: what each of `enemy`'s strikes costs it, the hero's Thorn Damage
 * percent of its max HP (its HP as the fight starts, or before the arrows
 * that wounded it, `fullHp`), half against a boss or Greater Boss. DEF
 * takes nothing off it. */
export function thornDamage(player: Player, enemy: Enemy) {
  const thorns = player.thorns ?? 0;
  return thorns ? snap(((enemy.fullHp ?? enemy.hp) * thorns) / (isBoss(enemy) ? 200 : 100)) : 0;
}
/** The most a parry can cut a strike's damage, in percent, whatever trains
 * or researches Parry %. */
export const PARRY_CAP = 98;
/** Parry: the percent every enemy strike's damage is cut by (Parry %, and
 * HEAL's tree's cutting what that leaves), at most `PARRY_CAP`. A hero
 * with any Parry % parries every strike, so every prediction counts it. */
export const parryCut = (player: Player) => Math.min(eitherChance(player.parry ?? 0, player.cardParry ?? 0), PARRY_CAP);
/** What an enemy strike of `attack` ATK does to the hero before the shroud
 * and Lifesteal: its ATK less DEF, cut by `cut` percent when parried. */
export function struckDamage(attack: number, defense: number, cut: number) {
  const damage = snap(Math.max(0, attack - defense));
  return cut ? snap((damage * (100 - cut)) / 100) : damage;
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
/** `damage` past `enemy`'s DEF (0 or less: none) as it lands: cut by the
 * percent a Shielded enemy's bubble guards it with (shielded.ts), as a
 * parry cuts the enemy's. The cut never stops a strike that gets past DEF. */
export const guarded = (damage: number, enemy: Enemy) => (enemy.guard && damage > 0 ? snap((damage * (100 - enemy.guard)) / 100) : damage);
/** What each of the hero's strikes takes off `enemy`'s HP (0 or less: none),
 * its ATK multiplied by `multiplier` (a critical strike's). */
const heroHit = (player: Player, enemy: Enemy, multiplier = 1) => {
  const attack = attackAgainst(player, enemy);
  return guarded(snap((multiplier === 1 ? attack : snap(attack * multiplier)) - defenseAgainst(player, enemy)), enemy);
};
/** Whether the hero's strikes can't hurt `enemy` at all (`predict`'s
 * `impervious`), without working out the rest of the fight. */
export const impervious = (player: Player, enemy: Enemy) => heroHit(player, enemy) <= 0;

/** Rounds a prediction plays out one by one before estimating the rest
 * (`predict`'s `played`): the Damage Visual labels, drawn every frame, play
 * this many and extrapolate longer fights. */
export const PLAYED_ROUNDS = 50;

/** What a fight against `enemy` costs `player`. Past `played` rounds (all of
 * them unless given) the rest of the fight is estimated, not played out:
 * close, but not the exact ending a step resolves to. */
export function predict(player: Player, enemy: Enemy, played = Infinity): CombatPrediction {
  player = facing(player, enemy);
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
  // Thorns end a fight within 200 rounds, so it is always played out; a
  // parry cuts every strike.
  const thorn = thornDamage(player, enemy), cut = parryCut(player), fast = !!enemy.fast;
  if (thorn) played = Infinity;
  // Snapped, so 10.2 HP against strikes of 1.02 takes 10, as it does played out.
  const { turns, strikes, thornKill } = thorn ? thornRounds(enemy.hp, hit, thorn, fast) : { turns: Math.ceil(snap(enemy.hp / hit)), strikes: NaN, thornKill: false };
  const ended = { ...(thornKill ? { thornKill: true as const } : {}), ...(fast ? { fast: true as const } : {}) };
  if (player.lifesteal) {
    const hpAfter = lifestealEnding(player, enemy, hit, played, thorn, cut);
    if (hpAfter !== null) return { impervious: false, hit, turns, damage: snap(Math.max(0, player.hp - hpAfter)), survivable: true, requiredAttack: 0, hpAfter, ...ended };
  }
  // The shroud takes the first of it, whichever strikes that falls on.
  const damage = snap(Math.max(0, damageTaken(enemy.attack, player.defense, thorn ? strikes : turns - 1 + (fast ? 1 : 0), played, cut) - (player.shroud ?? 0)));
  return {
    impervious: false,
    hit,
    turns,
    damage,
    survivable: player.hp > damage && !player.lifesteal,
    requiredAttack: 0,
    ...ended,
  };
}

/** How a fight with thorns ends, the hero's strikes each dealing `hit` and
 * each of the enemy's costing it `thorn`, played as `bout` plays them (a
 * `fast` enemy striking first): the hero's strikes (`turns`), the enemy's
 * (`strikes`), and whether the enemy's thorns felled it. */
function thornRounds(hp: number, hit: number, thorn: number, fast = false) {
  const opening = fast ? 1 : 0;
  // Thorns never take a whole enemy's HP, so the opening strike's leave it standing.
  if (fast) hp = snap(Math.max(0, hp - thorn));
  for (let turns = 1; ; turns++) {
    hp = snap(Math.max(0, hp - hit));
    if (!hp) return { turns, strikes: turns - 1 + opening, thornKill: false };
    hp = snap(Math.max(0, hp - thorn));
    if (!hp) return { turns, strikes: turns + opening, thornKill: true };
  }
}

/** The HP a predicted fight costs `player`, net of Lifesteal's heals:
 * below 0 when the fight heals the hero more than it hurts. */
export const netDamage = (player: Player, r: CombatPrediction) => (r.hpAfter !== undefined ? snap(player.hp - r.hpAfter) : r.damage);

/** What each strike's damage restores of the hero's HP (Lifesteal), the
 * share of it in percent: the strike's whole damage, however little HP the
 * enemy had left. */
export const lifestealHeal = (player: Player, dealt: number) => snap((dealt * (player.lifesteal ?? 0)) / 100);

/** The hero's HP when a fight against `enemy` ends, the hero's strikes each
 * dealing `hit` and healing by its Lifesteal as they land (before the
 * enemy's reply, up to max HP), or null when the enemy fells it first. It
 * plays the rounds as `bout` does (a Fast enemy's opening strike healing
 * nothing), so the two end alike, and past `played` rounds estimates the
 * rest (`lifestealEstimate`). */
function lifestealEnding(player: Player, enemy: Enemy, hit: number, played = Infinity, thorn = 0, cut = 0) {
  let hp = player.hp, enemyHp = enemy.hp, attack = enemy.attack, shroud = player.shroud ?? 0;
  // The enemy's strike, then its thorns and its ATK rising: false once the hero falls.
  const reply = () => {
    const struck = struckDamage(attack, player.defense, cut), shrouded = Math.min(shroud, struck);
    shroud = snap(shroud - shrouded);
    hp = snap(Math.max(0, hp - snap(struck - shrouded)));
    if (!hp) return false;
    if (thorn) enemyHp = snap(Math.max(0, enemyHp - thorn));
    attack = raisedAttack(attack);
    return true;
  };
  if (enemy.fast && !reply()) return null;
  for (let round = 0; ; round++) {
    if (round >= played && enemyHp > hit) return lifestealEstimate(player, { hp, enemyHp, attack, shroud }, hit, cut);
    enemyHp = snap(Math.max(0, enemyHp - hit));
    hp = healUpTo(hp, lifestealHeal(player, hit), player.maxHp);
    if (!enemyHp) return hp;
    if (!reply()) return null;
    if (!enemyHp) return hp;
  }
}

/** Attack Lore: the fewest whole points of ATK more that defeat `enemy` in
 * one hit fewer, or null when one hit does already (or none can). Taking
 * `turns − 1` hits needs each to deal at least HP / (turns − 1), so that
 * much over the enemy's DEF (more under a bubble's guard), rounded up;
 * then checked against `predict`, which snaps as the fight does. */
export function attackForFewerHits(player: Player, enemy: Enemy): number | null {
  const { impervious, turns } = predict(player, enemy);
  if (impervious || turns <= 1) return null;
  const fewer = (more: number) => predict({ ...player, attack: snap(player.attack + more) }, enemy).turns < turns;
  const each = enemy.guard ? (enemy.hp * 100) / ((turns - 1) * (100 - enemy.guard)) : enemy.hp / (turns - 1);
  let more = Math.max(1, Math.ceil(snap(each + defenseAgainst(player, enemy) - player.attack)));
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
 * at `attack` and rising each round, each cut by `cut` percent (a
 * parry). Past what any HP could survive it is
 * Infinity, so a fight with a million rounds is summed in a few thousand.
 * Past `played` strikes the rest are estimated (`estimatedDamage`). */
export function damageTaken(attack: number, defense: number, strikes: number, played = Infinity, cut = 0) {
  let damage = 0, i = 0;
  for (; i < strikes && i < played && damage <= Number.MAX_SAFE_INTEGER; i++, attack = raisedAttack(attack)) {
    damage = snap(damage + struckDamage(attack, defense, cut));
  }
  if (i < strikes && damage <= Number.MAX_SAFE_INTEGER) damage += parriedEstimate(attack, defense, strikes - i, cut);
  return damage > Number.MAX_SAFE_INTEGER ? Infinity : damage;
}

// Estimating a long fight. `raisedAttack` adds exactly 1 a round below 200
// ATK; from there it adds 1% rounded down, on average half a point short of
// 1%, so ATK − 50 grows about 1% a round. Each sum below is then a closed
// form, however long the fight. Only predictions shown (the Damage Visual
// labels) estimate; drawing may use Math freely, so these use ** and log.
const STEADY_FROM = 200;
const GROWTH = 1.01;
const ANCHOR = 50;
/** Of `n` rounds from `attack`, how many are spent below `STEADY_FROM`. */
const linearRounds = (attack: number, n: number) => Math.min(n, Math.max(0, Math.ceil(STEADY_FROM - attack)));
/** The enemy's ATK `n` rounds on from `attack`, estimated. */
export function attackAfter(attack: number, n: number) {
  const linear = linearRounds(attack, n);
  attack += linear;
  return n > linear ? (attack - ANCHOR) * GROWTH ** (n - linear) + ANCHOR : attack;
}
/** The rounds from `attack` before the enemy's ATK first exceeds `above`, estimated. */
export function roundsUntilAbove(attack: number, above: number) {
  if (attack > above) return 0;
  if (above < STEADY_FROM) return Math.floor(above - attack) + 1;
  const linear = linearRounds(attack, Infinity);
  return linear + Math.max(0, Math.ceil(Math.log((above - ANCHOR) / (attack + linear - ANCHOR)) / Math.log(GROWTH)));
}
/** The enemy's ATK summed over `n` rounds from `attack`, estimated. */
function attackSum(attack: number, n: number) {
  const linear = linearRounds(attack, n), rest = n - linear;
  const sum = linear * attack + (linear * (linear - 1)) / 2;
  return rest ? sum + ((attack + linear - ANCHOR) * (GROWTH ** rest - 1)) / (GROWTH - 1) + ANCHOR * rest : sum;
}
/** What `n` enemy strikes from `attack` cost the hero against `defense`, estimated. */
export function estimatedDamage(attack: number, defense: number, n: number) {
  const idle = roundsUntilAbove(attack, defense);
  return idle >= n ? 0 : attackSum(attackAfter(attack, idle), n - idle) - (n - idle) * defense;
}

/** `estimatedDamage` with every strike's damage cut by `cut` percent. */
export function parriedEstimate(attack: number, defense: number, n: number, cut = 0) {
  const damage = estimatedDamage(attack, defense, n);
  return cut ? (damage * (100 - cut)) / 100 : damage;
}

/** A Lifesteal fight's ending estimated from part way through it (`at`:
 * the hero's HP, the enemy's, its ATK and the shroud left, the hero to
 * strike next): while the enemy's strikes take less than a heal restores,
 * the hero's HP climbs toward max HP less the latest strike; after that it
 * only falls. Null when it falls to 0 before the enemy does. */
function lifestealEstimate(player: Player, at: { hp: number; enemyHp: number; attack: number; shroud: number }, hit: number, cut = 0) {
  // A strike cut by a parry takes f × (ATK − DEF), f the share of its damage left.
  const f = (100 - cut) / 100, strikes = Math.ceil(at.enemyHp / hit), replies = strikes - 1, defense = player.defense;
  const heal = lifestealHeal(player, hit);
  const climbing = Math.min(replies, roundsUntilAbove(at.attack, defense + heal / f));
  let shroud = at.shroud;
  const absorb = (damage: number) => {
    const taken = Math.min(shroud, damage);
    shroud -= taken;
    return damage - taken;
  };
  const early = absorb(f * estimatedDamage(at.attack, defense, climbing));
  const ceiling = player.maxHp - Math.max(0, f * (attackAfter(at.attack, climbing - 1) - defense));
  let hp = climbing ? Math.min(Math.max(at.hp, ceiling), at.hp + climbing * heal - early) : at.hp;
  hp -= absorb(f * estimatedDamage(attackAfter(at.attack, climbing), defense, replies - climbing)) - (replies - climbing) * heal;
  return hp <= 0 ? null : hp >= player.maxHp ? snap(hp) : snap(Math.min(player.maxHp, hp + heal));
}

/** How long each strike of a fight played out round by round takes: the first
 * round's two strikes take the longest, each later round is quicker, down to
 * the fastest pace. */
export const FIRST_STRIKE_MS = 250;
export const STRIKE_SPEEDUP = 0.9;
export const FASTEST_STRIKE_MS = 50;

/** How long a revival's golden fire and its "REVIVED" text last. */
export const REVIVE_MS = 1400;
/** How long the skull over a hero struck down burns: the defeat dialog
 * opens once it is over, and a revival's fire begins then. */
export const DEFEAT_MS = 2500;
/** How long a fight waits after a strike that revives the hero: the skull,
 * then the revival's fire, before its next strike (or summary round). */
export const REVIVE_PAUSE_MS = DEFEAT_MS + REVIVE_MS;

/** One strike of a fight: who struck, for how much, when it swings (`start`
 * to `end`, in ms from the fight's start) and lands (`at`), and the HP the
 * struck side has left. Of an enemy's strike, the shroud takes what it can
 * (`shrouded`), and `damage` is what gets through to the hero. A strike
 * that would have felled the hero but revived it (`revived`) leaves it at
 * full HP. A critical hero strike carries the applications of the
 * critical factor it landed (`crit`), and one that heals the hero
 * (Lifesteal) the hero's HP after it (`heroHp`) and the HP it restored
 * (`healed`; in a summary round, what the round gave the hero net of the
 * damage it took, on whichever strike lands last). An enemy strike the hero
 * parried (`parried`, its damage cut) makes the hero give way a little as it
 * lands, and one the hero lives through costs the enemy its thorns
 * (`thorns`), leaving it `thornHp`. */
export type Strike = { by: "hero" | "enemy"; damage: number; crit?: number; heroHp?: number; healed?: number; shrouded?: number; revived?: true; parried?: true; thorns?: number; thornHp?: number; start: number; at: number; end: number; hp: number };
export type Bout = { strikes: Strike[]; duration: number };
/** Whether the enemy's strike numbered `strike` (from 0) in a fight, which
 * would fell the hero, revives it instead (the Revive skill). */
export type Revival = (strike: number) => boolean;

/** The rounds `predict` sums up, one strike at a time: the hero strikes first
 * (a Fast enemy before it, once, fast-enemies.ts),
 * then the enemy (its ATK rising after each round, the shroud taking its
 * strikes until it is spent, its thorns costing it after each strike the
 * hero lives through), until one of them falls. Ends with the same HP as
 * the prediction (or at 0 in a fight the hero loses), unless `revives`
 * raises the hero at full HP from a strike that would fell it: the fight
 * then goes on from the next round, the enemy as it was, once the skull
 * and the revival's fire are over (`REVIVE_PAUSE_MS`). A hero with Parry %
 * parries every strike. */
export function bout(player: Player, enemy: Enemy, revives?: Revival, crits?: Crits): Bout {
  if (heroHit(player, enemy) <= 0) return { strikes: [], duration: 0 };
  player = facing(player, enemy);
  return play([], { player, enemy, revives, crits }, { enemyHp: enemy.hp, heroHp: player.hp, shroud: player.shroud ?? 0, attack: enemy.attack, t: 0, ms: FIRST_STRIKE_MS, enemyStrikes: 0, heroStrikes: 0, enemyNext: !!enemy.fast });
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
  const hit = heroHit(player, enemy), thorn = thornDamage(player, enemy), s = { ...state };
  // Each strike keeps its fields in the same order: its blow, its timing, then the HP left.
  const strike = ({ hp, ...blow }: Blow) => {
    strikes.push({ ...blow, start: s.t, at: s.t + s.ms / 2, end: s.t + s.ms, hp });
    s.t += s.ms;
  };
  for (;;) {
    if (!s.enemyNext) {
      const applications = crits?.applications(s.heroStrikes) ?? 0, struck = applications ? heroHit(player, enemy, critMultiplier(crits!.factor, applications)) : hit;
      s.heroStrikes++;
      const healed = player.lifesteal ? healUpTo(s.heroHp, lifestealHeal(player, struck), player.maxHp) : s.heroHp;
      const heals = healed !== s.heroHp, gained = snap(healed - s.heroHp);
      s.heroHp = healed;
      s.enemyHp = snap(Math.max(0, s.enemyHp - struck));
      strike({ by: "hero", damage: struck, ...(applications ? { crit: applications } : {}), ...(heals ? { heroHp: healed, healed: gained } : {}), hp: s.enemyHp });
      if (!s.enemyHp) break;
    }
    s.enemyNext = false;
    const blow = enemyBlow(s, player, thorn, revives);
    strike(blow);
    if (blow.revived) s.t += REVIVE_PAUSE_MS;
    if (!s.heroHp || !s.enemyHp) break;
    s.attack = raisedAttack(s.attack);
    s.ms = Math.max(FASTEST_STRIKE_MS, s.ms * STRIKE_SPEEDUP);
  }
  return { strikes, duration: s.t };
}

/** The enemy strikes the hero in `s`: a parried strike's damage is cut, the
 * shroud takes what it can, the rest comes off the hero's HP, and a strike
 * that would fell the hero may revive it at full HP. A strike the hero
 * lives through costs the enemy `thorn` HP. */
function enemyBlow(s: BoutState, player: Player, thorn: number, revives?: Revival): Blow {
  const cut = parryCut(player), parried = cut > 0;
  const struck = struckDamage(s.attack, player.defense, cut), shrouded = Math.min(s.shroud, struck), taken = snap(struck - shrouded);
  s.shroud = snap(s.shroud - shrouded);
  s.heroHp = snap(Math.max(0, s.heroHp - taken));
  const revived = !s.heroHp && !!revives?.(s.enemyStrikes);
  if (revived) s.heroHp = player.maxHp;
  s.enemyStrikes++;
  const thorns = thorn && s.heroHp ? thorn : 0;
  if (thorns) s.enemyHp = snap(Math.max(0, s.enemyHp - thorns));
  return { by: "enemy", damage: taken, ...(shrouded ? { shrouded } : {}), ...(revived ? { revived: true as const } : {}), ...(parried ? { parried: true as const } : {}), ...(thorns ? { thorns, thornHp: s.enemyHp } : {}), hp: s.heroHp };
}

/** The fight played on with the hero's stats changed mid-fight (training
 * bought in a run): the strikes before `from` stand as they were, and from
 * strike `from` on the hero fights as `player`, whose `hp` and `shroud`
 * are what the hero has left at that point. */
export function resume(fight: Bout, from: number, fighters: Fighters): Bout {
  // The shroud given is what is left of the one the fight began with
  // (already raised against this enemy), so only DEF is raised again.
  const { enemy } = fighters, player = { ...fighters.player, defense: facing({ ...fighters.player, shroud: 0 }, enemy).defense };
  fighters = { ...fighters, player };
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
    if (s.thornHp !== undefined) enemyHp = s.thornHp;
    attack = raisedAttack(attack);
    ms = Math.max(FASTEST_STRIKE_MS, ms * STRIKE_SPEEDUP);
  }
  const state = { enemyHp, heroHp: player.hp, shroud: player.shroud ?? 0, attack, t: next.start, ms, enemyStrikes, heroStrikes, enemyNext: next.by === "enemy" };
  return play(kept, fighters, state);
}

/** A fight settled at once (Animate fights off), shown as summary rounds:
 * each holds the hero's strikes as one strike and the enemy's as another,
 * landing together. A revival ends a round, and the next begins `gap` ms
 * later, once its skull and fire are over. */
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
  // A summary round shows no parries, only the damage they left.
  const prev = round.enemy, shrouded = snap((prev?.shrouded ?? 0) + (s.shrouded ?? 0)), thorns = snap((prev?.thorns ?? 0) + (s.thorns ?? 0)), thornHp = s.thornHp ?? prev?.thornHp;
  return { ...round, enemy: { by: "enemy", damage: snap((prev?.damage ?? 0) + s.damage), ...(shrouded ? { shrouded } : {}), ...(s.revived ? { revived: true as const } : {}), ...(thorns ? { thorns, thornHp } : {}), hp: s.hp, ...at } };
}

/** The hero's HP once the fight is over, from `hp` at its start. */
export const heroHpAfter = (fight: Bout, hp: number) => heroHpDuring(fight, hp, Infinity);
/** When each of the fight's revivals lands (its skull rising, its fire
 * following `DEFEAT_MS` later), in ms from its start. */
export const revivals = (fight: Bout) => fight.strikes.filter((s) => s.revived).map((s) => s.at);

/** The hero's HP `elapsed` ms into a fight that began at `hp`: none while
 * the skull of a strike that revives it burns. */
export function heroHpDuring(fight: Bout, hp: number, elapsed: number) {
  for (const s of fight.strikes) {
    if (s.at > elapsed) continue;
    if (s.by === "enemy") hp = s.revived && elapsed < s.at + DEFEAT_MS ? 0 : s.hp;
    else if (s.heroHp !== undefined) hp = s.heroHp;
  }
  return hp;
}

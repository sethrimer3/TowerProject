import { snap } from "./exact.ts";
import { atWorst, healUpTo, predict, type CombatPrediction, type CritRule } from "./combat.ts";
import { doorCost, doorDiscount, doorRule, drainsHp, woodToll, type DoorDiscounts } from "./doors.ts";
import type { Player, Tile, KeyColor } from "./entities.ts";

/** What stepping onto each pickup grants. The single source for the move
 * itself, route previews, the inspect panel, and Automove's planning. */
export const POTION_HEAL = 35;
/** What an ATK or DEF shard raises its stat by in the first tier; a later
 * tier's shards carry their own `amount` (`tierShard`). */
export const SHARD = 1;
/** What the ATK or DEF shard `tile` raises its stat by. */
export const shardGain = (tile: Tile) => tile.amount ?? SHARD;
/** The HP a Heart Door leaves the hero. */
export const HEART_DOOR_HP = 1;

export type StepBlocked =
  | { blocked: "wall" }
  | { blocked: "locked" }
  | { blocked: "impervious"; combat: CombatPrediction };
export type StepEffect = {
  blocked?: undefined;
  /** The player after the step's fight, door, or pickup. Always a fresh
   * object (keys included), so resolving never mutates the input. A lethal
   * fight leaves hp at 0; check `combat.survivable`. */
  player: Player;
  /** Enemies only. */
  combat: CombatPrediction | null;
  /** Doors only: the keys the door consumes (empty for Heart Doors). */
  keysSpent: KeyColor[];
  /** Potions only: HP actually restored (capped at max HP, or above it
   * by Overheal). */
  healed: number;
  /** Doors and keys: how much of a key each key colour took or gave, when
   * a badge's scale or a held key card's bonus made it other than 1. */
  keyAmount?: number;
  /** Enemies only, under a badge's scale: the damage added to the fight's
   * (or, below 0, given back) once it is over. */
  extraDamage?: number;
  /** Enemies only: the scale the fight was taken under, which its Silver,
   * Gold and XP are multiplied by too. */
  scale?: number;
};
export type StepOutcome = StepBlocked | StepEffect;

/** What upgrades change about stepping, read at the moment of the step so
 * a research level completed mid-run counts at once: the percent of its HP
 * a potion restores (Potion HP research), what a percent potion restores
 * beyond its HP, in hundredths of a percent of max HP (Recovery and
 * Potion % training), and the HP the step regains (Regen: none in the
 * forest, or on the tiles a Dash crosses after its first step). */
export type StepRules = {
  potionHeal: number;
  percentPotion: number;
  /** The percent more HP every potion restores, from HEAL's tree (a card
   * factor on top of Potion HP and a percent potion's share); none when
   * absent. */
  potionCard?: number;
  regen: number;
  /** Effective and Dampen, on the step that activates their card: what the
   * target's effect is multiplied by (1.05 is 5% stronger). */
  scale?: number;
  /** How far potions may heal above max HP (Overheal training), as a
   * multiple of max HP in thousandths: 1,000 (none above) when absent. */
  overheal?: number;
  /** The percent of max HP the hero regains after each fight it wins
   * (equipment), before the step's Regen. */
  victoryHeal?: number;
  /** The percent of its toll a Heart Door drains (Heart Door Resilience
   * research), 100 when absent. */
  heartToll?: number;
  /** How much of a key each key colour a door takes costs, in tenths of a
   * percent (Key Efficiency research), 1,000 when absent. */
  keyCost?: number;
  /** The percent less each kind of door costs, from the door cards the
   * run's hand holds (`handBonus`), none when absent. */
  doorOff?: DoorDiscounts;
  /** The percent more a key of each colour picked up is worth, from the
   * key cards the run's hand holds (`handBonus`), none when absent. */
  keyFind?: Partial<Record<KeyColor, number>>;
  /** The percent of its stat an ATK or DEF shard gives (Shard ATK and
   * Shard DEF research), 100 when absent. */
  shardAttack?: number;
  shardDefense?: number;
  /** The hero's critical strikes (Critical): resolving a fight counts only
   * the applications it is certain to land (chance of 100% or more), the
   * worst it can go; `Game` plays the real rolls out over it. */
  crit?: CritRule;
};
export const BASE_RULES: StepRules = { potionHeal: 100, percentPotion: 0, regen: 0 };
/** What the ATK or DEF shard `tile` raises its stat by under `rules`, rounded. */
export const shardStat = (tile: Tile, rules: StepRules) =>
  snap((shardGain(tile) * ((tile.kind === "attack" ? rules.shardAttack : rules.shardDefense) ?? 100)) / 100);
/** The HP a potion of `amount` restores under `rules`, rounded. */
export const potionHeal = (amount: number, rules: StepRules) => snap((amount * rules.potionHeal) / 100);
/** The HP the potion `tile` restores to a hero of `maxHp` under `rules`
 * (before a badge's scale, and before the HP the hero lacks caps it): a
 * percent (red) potion its HP, which Potion HP leaves alone, and a share of
 * max HP; then HEAL's tree raises either (`potionCard`). */
export const potionRestores = (tile: Tile, maxHp: number, rules: StepRules) => {
  const amount = tile.amount ?? POTION_HEAL;
  const heal = tile.color === "red" ? snap(amount + (maxHp * rules.percentPotion) / 10000) : potionHeal(amount, rules);
  return rules.potionCard ? snap((heal * (100 + rules.potionCard)) / 100) : heal;
};

/** The most HP a hero of `maxHp` may hold under `rules`: its max HP, times
 * its Overheal once owned. Potions, YK to HP and badge heals heal up to
 * it; every other heal stops at max HP. */
export const hpCeiling = (maxHp: number, rules: Pick<StepRules, "overheal">) =>
  rules.overheal && rules.overheal > 1000 ? snap((maxHp * rules.overheal) / 1000) : maxHp;

/** Resolves stepping onto `tile` with stats `player`: whether the step is
 * possible, and the player's stats afterwards. Pure: movement, previews, and
 * AI planning all apply the same rules without touching game state. */
export function resolveStep(player: Player, tile: Tile, rules: StepRules = BASE_RULES): StepOutcome {
  if (tile.kind === "wall") return { blocked: "wall" };
  const scale = rules.scale ?? 1, scaled = (n: number) => (scale === 1 ? n : snap(n * scale));
  const next: Player = { ...player, keys: { ...player.keys } };
  const effect: StepEffect = { player: next, combat: null, keysSpent: [], healed: 0 };
  switch (tile.kind) {
    case "enemy": {
      const combat = predict(atWorst(player, rules.crit), tile.enemy!);
      if (combat.impervious) return { blocked: "impervious", combat };
      // The fight plays out as predicted; a scale adds to (or gives back)
      // its damage once it is over, which can fell the hero.
      const damage = scaled(combat.damage);
      // With Lifesteal the fight ends on the HP `predict` worked out, heals
      // counted; a scale's extra damage comes off that.
      const left = combat.hpAfter === undefined ? snap(next.hp - damage) : snap(combat.hpAfter - (damage - combat.damage));
      next.hp = healAfterVictory(snap(Math.max(0, left)), next.maxHp, rules);
      effect.combat = scale === 1 ? combat : { ...combat, survivable: next.hp > 0 };
      if (scale !== 1) Object.assign(effect, { extraDamage: snap(damage - combat.damage), scale });
      break;
    }
    case "door": {
      // Key Efficiency makes each key the door takes cost less, on top of
      // a badge's scale, and a door card held makes its doors cost less
      // again (each its own factor).
      const off = doorDiscount(tile, rules.doorOff);
      const keyScale = snap((scale * (rules.keyCost ?? 1000) * off.keys) / 1000), tollScale = snap(scale * off.toll);
      const cost = doorCost(tile, player, keyScale, tollScale);
      if (cost === null) return { blocked: "locked" };
      for (const color of cost) next.keys[color] = snap(next.keys[color] - keyScale);
      const rule = doorRule(tile);
      // A Wooden Door broken without a key takes its durability in HP,
      // under the badge's scale and WOODEN DOOR's; DEF doesn't reduce it.
      if (rule.type === "wood" && !cost.length) next.hp = snap(next.hp - woodToll(rule, tollScale));
      // A Heart Door's toll, all but 1 HP, shrinks under a weaker scale and
      // never grows past it; Heart Door Resilience and HEART DOOR shrink it
      // by their percents.
      if (drainsHp(rule)) {
        const toll = snap((next.hp - HEART_DOOR_HP) * Math.min(1, scale) * off.toll * (rules.heartToll ?? 100) / 100);
        next.hp = Math.min(next.hp, snap(next.hp - toll));
      }
      effect.keysSpent = cost;
      if (keyScale !== 1 && cost.length) effect.keyAmount = keyScale;
      break;
    }
    case "key": {
      const found = rules.keyFind?.[tile.color!] ?? 0, amount = found ? snap((scaled(1) * (100 + found)) / 100) : scaled(1);
      next.keys[tile.color!] = snap(next.keys[tile.color!] + amount);
      if (amount !== 1) effect.keyAmount = amount;
      break;
    }
    case "potion": {
      const heal = scaled(potionRestores(tile, next.maxHp, rules));
      effect.healed = snap(healUpTo(next.hp, heal, hpCeiling(next.maxHp, rules)) - next.hp);
      next.hp = snap(next.hp + effect.healed);
      break;
    }
    case "attack":
      next.attack = snap(next.attack + scaled(shardStat(tile, rules)));
      break;
    case "defense":
      next.defense = snap(next.defense + scaled(shardStat(tile, rules)));
      break;
  }
  // Regen comes after the step's fight, door or pickup.
  next.hp = regenerate(next.hp, next.maxHp, rules);
  return effect;
}

/** `hp` after a won fight's victory heal under `rules` (a share of
 * `maxHp`, up to it); a fallen hero (0 HP) regains nothing. */
export const healAfterVictory = (hp: number, maxHp: number, rules: StepRules) =>
  rules.victoryHeal && hp > 0 && hp < maxHp ? snap(Math.min(maxHp, hp + (maxHp * rules.victoryHeal) / 100)) : hp;

/** `hp` after a step's Regen under `rules`, up to `maxHp`; a fallen hero
 * (0 HP) regains nothing. */
export const regenerate = (hp: number, maxHp: number, rules: StepRules) =>
  rules.regen && hp > 0 && hp < maxHp ? snap(Math.min(maxHp, hp + rules.regen)) : hp;

/** A fight the player would not survive. */
export const isLethal = (effect: StepEffect) => !!effect.combat && !effect.combat.survivable;

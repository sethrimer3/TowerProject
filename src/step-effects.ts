import { snap } from "./exact.ts";
import { predict, type CombatPrediction } from "./combat.ts";
import { doorCost, doorRule } from "./doors.ts";
import type { KeyColor } from "./config.ts";
import type { Player, Tile } from "./entities.ts";

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
  /** Potions only: HP actually restored (capped at max HP). */
  healed: number;
  /** Doors and keys: how much of a key each key colour took or gave, when
   * a badge's scale made it other than 1. */
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
 * forest, or on the tiles a Rush crosses after its first step). */
export type StepRules = {
  potionHeal: number;
  percentPotion: number;
  regen: number;
  /** Effective and Dampen, on the step that activates their card: what the
   * target's effect is multiplied by (1.05 is 5% stronger). */
  scale?: number;
  /** The percent of max HP the hero regains after each fight it wins
   * (equipment), before the step's Regen. */
  victoryHeal?: number;
};
export const BASE_RULES: StepRules = { potionHeal: 100, percentPotion: 0, regen: 0 };
/** The HP a potion of `amount` restores under `rules`, rounded. */
export const potionHeal = (amount: number, rules: StepRules) => snap((amount * rules.potionHeal) / 100);

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
      const combat = predict(player, tile.enemy!);
      if (combat.impervious) return { blocked: "impervious", combat };
      // The fight plays out as predicted; a scale adds to (or gives back)
      // its damage once it is over, which can fell the hero.
      const damage = scaled(combat.damage);
      next.hp = healAfterVictory(snap(Math.max(0, next.hp - damage)), next.maxHp, rules);
      effect.combat = scale === 1 ? combat : { ...combat, survivable: next.hp > 0 };
      if (scale !== 1) Object.assign(effect, { extraDamage: snap(damage - combat.damage), scale });
      break;
    }
    case "door": {
      const cost = doorCost(tile, player, scale);
      if (cost === null) return { blocked: "locked" };
      for (const color of cost) next.keys[color] = snap(next.keys[color] - scaled(1));
      // A Heart Door's toll, all but 1 HP, shrinks under a weaker scale and
      // never grows past it.
      if (doorRule(tile).type === "fullHp") next.hp = Math.min(next.hp, snap(next.hp - (next.hp - HEART_DOOR_HP) * Math.min(1, scale)));
      effect.keysSpent = cost;
      if (scale !== 1 && cost.length) effect.keyAmount = scaled(1);
      break;
    }
    case "key":
      next.keys[tile.color!] = snap(next.keys[tile.color!] + scaled(1));
      if (scale !== 1) effect.keyAmount = scaled(1);
      break;
    case "potion": {
      // A percent (red) potion restores its HP, which Potion HP leaves alone,
      // and a share of max HP.
      const amount = tile.amount ?? POTION_HEAL;
      const heal = scaled(tile.color === "red" ? snap(amount + (next.maxHp * rules.percentPotion) / 10000) : potionHeal(amount, rules));
      effect.healed = snap(Math.min(next.maxHp - next.hp, heal));
      next.hp = snap(next.hp + effect.healed);
      break;
    }
    case "attack":
      next.attack = snap(next.attack + scaled(shardGain(tile)));
      break;
    case "defense":
      next.defense = snap(next.defense + scaled(shardGain(tile)));
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

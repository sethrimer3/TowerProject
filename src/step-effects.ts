import { predict, type CombatPrediction } from "./combat.ts";
import { doorCost } from "./doors.ts";
import type { KeyColor } from "./config.ts";
import type { Player, Tile } from "./entities.ts";

/** What stepping onto each pickup grants. The single source for the move
 * itself, route previews, the inspect panel, and Automove's planning. */
export const POTION_HEAL = 35;
export const ATTACK_SHARD = 2;
export const DEFENSE_SHARD = 1;

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
};
export type StepOutcome = StepBlocked | StepEffect;

/** Resolves stepping onto `tile` with stats `player`: whether the step is
 * possible, and the player's stats afterwards. Pure: movement, previews, and
 * AI planning all apply the same rules without touching game state. */
export function resolveStep(player: Player, tile: Tile): StepOutcome {
  if (tile.kind === "wall") return { blocked: "wall" };
  const next: Player = { ...player, keys: { ...player.keys } };
  const effect: StepEffect = { player: next, combat: null, keysSpent: [], healed: 0 };
  switch (tile.kind) {
    case "enemy": {
      const combat = predict(player, tile.enemy!);
      if (combat.impervious) return { blocked: "impervious", combat };
      next.hp = Math.max(0, next.hp - combat.damage);
      effect.combat = combat;
      break;
    }
    case "door": {
      const cost = doorCost(tile, player);
      if (cost === null) return { blocked: "locked" };
      for (const color of cost) next.keys[color]--;
      effect.keysSpent = cost;
      break;
    }
    case "key":
      next.keys[tile.color!]++;
      break;
    case "potion":
      effect.healed = Math.min(next.maxHp - next.hp, tile.amount ?? POTION_HEAL);
      next.hp += effect.healed;
      break;
    case "attack":
      next.attack += ATTACK_SHARD;
      break;
    case "defense":
      next.defense += DEFENSE_SHARD;
      break;
  }
  return effect;
}

/** A fight the player would not survive. */
export const isLethal = (effect: StepEffect) => !!effect.combat && !effect.combat.survivable;

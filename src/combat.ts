import type { Enemy, Player } from "./entities.ts";

export type CombatPrediction = {
  impervious: boolean;
  hit: number;
  turns: number;
  damage: number;
  survivable: boolean;
  requiredAttack: number;
};

export function predict(player: Player, enemy: Enemy): CombatPrediction {
  const hit = player.attack - enemy.defense;
  if (hit <= 0) {
    return {
      impervious: true,
      hit: 0,
      turns: Infinity,
      damage: Infinity,
      survivable: false,
      requiredAttack: enemy.defense - player.attack + 1,
    };
  }
  const turns = Math.ceil(enemy.hp / hit);
  const damage = Math.max(0, enemy.attack - player.defense) * (turns - 1);
  return {
    impervious: false,
    hit,
    turns,
    damage,
    survivable: player.hp > damage,
    requiredAttack: 0,
  };
}

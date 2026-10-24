import type { BoonId } from "../shrines.ts";

/** Native 24-pixel subjects in the generated atlas's measured cell order. */
export const BOON_SPRITES = {
  maxHp: "boon-max-hp", attack: "boon-attack", gold: "boon-gold", shroud: "boon-shroud",
  silver: "boon-silver", regen: "boon-regen", interest: "boon-interest", freeUp: "boon-free-up",
  parry: "boon-parry", floorReq: "boon-floor-req", playSpeed: "boon-play-speed", attackBossHp: "boon-attack-boss-hp",
  goldMaxHp: "boon-gold-max-hp", enemyHpRegen: "boon-enemy-hp-regen", enemyAttack: "boon-enemy-attack", floorSilver: "boon-floor-silver",
  regenMaxHp: "boon-regen-max-hp", bossHp: "boon-boss-hp", lifesteal: "boon-lifesteal", fastSecond: "boon-fast-second",
} satisfies Record<BoonId, string>;
export const SHRINE_CONTROL_SPRITES = ["shrine-count", "shrine-grip", "shrine-auto", "shrine-ban"] as const;

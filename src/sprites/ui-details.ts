import type { GoalUnlock } from "../goals.ts";

/** Measured atlas order, shared by the authoring tool and coverage tests. */
export const UI_DETAIL_SPRITES = [
  "goal-warp", "goal-warp-loot", "goal-training-discount", "goal-card-groups",
  "goal-attack-range", "goal-attack-speed", "goal-attack-per-tile", "goal-charged-shot",
  "goal-multishot", "goal-rapid-fire", "goal-badge-slots", "goal-shard-attack",
  "goal-shard-defense", "goal-note-taking", "goal-damage-prediction", "goal-combat-forecast",
  "goal-attack-lore", "goal-parry", "goal-equipment", "goal-damage-visual",
  "goal-relative-damage", "ui-copy", "ui-skeleton-key", "ui-ward",
] as const;

export const UI_ORNAMENT_SPRITES = ["ui-menu", "ui-seal", "ui-mastered", "ui-revive", "ui-sign", "ui-link", "ui-duplicate", "ui-crown"] as const;

/** Every Goal reward has a matching PNG, including existing kit subjects. */
export const GOAL_SPRITES = {
  flyingEnemyCard: "card-flyingEnemy", archerCard: "card-archer", superCriticalResearch: "badge-star",
  warpLoot: "goal-warp-loot", trainingDiscount: "goal-training-discount", cardGroups: "goal-card-groups",
  attackRange: "goal-attack-range", attackSpeed: "goal-attack-speed", attackPerTile: "goal-attack-per-tile",
  chargedShot: "goal-charged-shot", multishot: "goal-multishot", rapidFire: "goal-rapid-fire",
  shrines: "shrine", firstBoonChoice: "shrine", improveTradeoffs: "shrine", autoPickBoons: "shrine",
  boonOptions: "shrine", banBoons: "shrine", autoPickRanking: "shrine",
  badgeSlots: "goal-badge-slots", shardAttack: "goal-shard-attack", shardDefense: "goal-shard-defense",
  noteTaking: "goal-note-taking", tournament: "trophy", events: "event", researchSpeed: "hourglass",
  damagePrediction: "goal-damage-prediction", combatForecast: "goal-combat-forecast", attackLore: "goal-attack-lore",
  warp: "goal-warp", parryPercent: "goal-parry", equipment: "goal-equipment",
  damageVisual: "goal-damage-visual", relativeDamageColor: "goal-relative-damage",
} satisfies Record<GoalUnlock, string>;

import { ENEMY_ARCHETYPES, TOWER_SCALING, type EnemyArchetype } from "./config.ts";

export function getTowerEnemy(room: number, rng: () => number, forceArchetype?: EnemyArchetype) {
  const hpBase = TOWER_SCALING.hp(room);
  const atkBase = TOWER_SCALING.attack(room);
  const defBase = TOWER_SCALING.defense(room);

  const archetypes: EnemyArchetype[] = ["weak", "balanced", "tank", "brute", "glassCannon", "guardian"];
  const archetype = forceArchetype || archetypes[Math.floor(rng() * archetypes.length)];
  const mult = ENEMY_ARCHETYPES[archetype];

  // Random names based on archetype
  const names = {
    weak: ["Goblin", "Slime", "Bat"],
    balanced: ["Orc", "Skeleton", "Thief"],
    tank: ["Golem", "Armored Knight", "Stone Warden"],
    brute: ["Troll", "Ogre", "Berserker"],
    glassCannon: ["Mage", "Assassin", "Cultist"],
    guardian: ["Gargoyle", "Demon", "Dragon Whelp"]
  };
  const name = names[archetype][Math.floor(rng() * names[archetype].length)];

  return {
    name,
    hp: Math.max(1, Math.floor(hpBase * mult.hp)),
    attack: Math.max(0, Math.floor(atkBase * mult.attack)),
    defense: Math.max(0, Math.floor(defBase * mult.defense)),
    tier: 1 // visual/legacy tier
  };
}

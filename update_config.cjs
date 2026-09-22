const fs = require('fs');
let code = fs.readFileSync('src/config.ts', 'utf8');

const archetypeCode = `
export type EnemyArchetype = "weak" | "balanced" | "tank" | "brute" | "glassCannon" | "guardian";
export const ENEMY_ARCHETYPES: Record<EnemyArchetype, { hp: number, attack: number, defense: number }> = {
  weak: { hp: 0.7, attack: 0.75, defense: 0.7 },
  balanced: { hp: 1.0, attack: 1.0, defense: 1.0 },
  tank: { hp: 1.2, attack: 0.8, defense: 1.3 },
  brute: { hp: 1.1, attack: 1.3, defense: 0.75 },
  glassCannon: { hp: 0.75, attack: 1.45, defense: 0.55 },
  guardian: { hp: 1.25, attack: 1.1, defense: 1.1 },
};

export const TOWER_SCALING = {
  hp: (r: number) => 20 + 3.0 * r + 0.12 * r * r,
  attack: (r: number) => 6 + 0.95 * r + 0.006 * r * r,
  defense: (r: number) => 2 + 1.35 * r + 0.012 * r * r,
};
`;

code = code + '\n' + archetypeCode;
// also update TOWER_LAYOUT_VERSION if it exists, or just leave it to generation.ts
fs.writeFileSync('src/config.ts', code);

import type { Enemy, EnemyStrength } from "./entities.ts";

/** Avenging Angel's ranks, one more a research level: weak, standard,
 * strong, elite, then the bosses (a Greater Boss too). */
export const SMITE_RANKS: readonly (readonly EnemyStrength[])[] = [["weak"], ["normal"], ["strong"], ["elite"], ["boss", "greaterBoss"]];
/** The ranks' names as the Archives show them. */
const RANK_NAMES = ["Weak", "Standard", "Strong", "Elite", "Boss"];
/** What Avenging Angel at `level` smites, as the Archives show it. */
export const smittenText = (level: number) => (level > 0 ? RANK_NAMES.slice(0, level).join(", ") : "None");
/** Whether Avenging Angel at `level` smites `enemy` when Angel Wings raises
 * the hero. */
export const smites = (level: number, enemy: Pick<Enemy, "strength">) => SMITE_RANKS.slice(0, level).some((ranks) => ranks.includes(enemy.strength));
/** An enemy Avenging Angel smote: where it stood, what it was (the board
 * has already let it go, so its slash draws it) and when (performance.now()). */
export type Smitten = { x: number; y: number; enemy: Enemy; at: number };

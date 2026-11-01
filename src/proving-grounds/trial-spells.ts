import type { ArcanaRun } from "../arcana/arcana.ts";
import type { LifespringRun, LifespringStep } from "../arcana/lifespring.ts";
import { beamFactor, type Beams } from "../arcana/overseer.ts";
import type { Spot } from "./arena.ts";
import type { TrialState } from "./trial.ts";

// What a trial attempt holds of the hero's arcana (docs/agents/arcana.md).
// `session.ts` fills `spells` from the Arcana desk before each turn; the rest
// of the trial reads only these.

/** The arcana held and on, as the desk gives them. */
export type TrialSpells = {
  ricochet?: { boost: number; rebounds: number; chance: number };
  thunderbolt?: { boost: number; bolts: number; turns: number };
  /** `reach`: the field's, in hundredths of a tile. */
  lifespring?: { hp: number; waves: number; turns: number; reach: number };
  beams?: Pick<Beams, "count" | "width" | "bonus">;
  /** Whether Overseer is held, on or off: its beams turn on either way. */
  overseer: boolean;
};
/** An arcanum's strike of the last turn, for the board to show. */
export type TrialStrike = { kind: "ricochet" | "thunderbolt" | "lifespring"; from: Spot; to: Spot; damage: number; tick: number };
/** The attempt's arcana: its toggles, cooldowns and bolts, the turns Overseer's
 * beams have turned, and Lifespring's state and the Effect Waves it has fired
 * (`springWaves`), saved with it; `spells`, what strikes this turn, `struck`, what
 * the hero's step strikes, `strikes` and `springStep`, what Lifespring did last turn, aren't saved. */
export type TrialArcana = { run: ArcanaRun; beamTurns: number; lifespring?: LifespringRun; springWaves?: number; spells?: TrialSpells; struck?: Spot & { foe: object }; strikes?: TrialStrike[]; springStep?: LifespringStep };

/** The hero's ATK on a hit at `at`: Overseer's beams as the turn begins multiply it. */
export function heroAttackOn(s: TrialState, at: Spot) {
  const a = s.arcana, beams = a?.spells?.beams;
  return beams ? s.player.attack * beamFactor({ ...beams, turns: a.beamTurns }, 0, at.x - s.player.x, at.y - s.player.y) : s.player.attack;
}

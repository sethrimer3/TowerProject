import { boltTargets, chargeBolts, decodeArcanaRun, settleBolts, tickCooldowns } from "../arcana/arcana.ts";
import { TURN_TICKS } from "../enemies/ranged.ts";
import { tileRandom } from "../random.ts";
import { isRecord, wholeIn } from "../save/decode.ts";
import { activeBossParts, effectiveBossDef } from "./boss-variants.ts";
import { difficultyMultiplier, TRIALS } from "./catalog.ts";
import { same, type Spot } from "./arena.ts";
import type { TrialState } from "./trial.ts";
import { heroAttackOn, type TrialArcana, type TrialStrike } from "./trial-spells.ts";

// The arcana's turn in a trial (docs/agents/arcana.md). A hit from an arcanum
// only wounds: it never makes a boss teleport, drop keys or pop coins, and draws
// no counter. A boss gone incorporeal can't be struck.

const TRIAL_RICOCHET_SALT = 0x71c0d;

/** What an arcanum can strike: its tile, its DEF, what a hit does to it, and
 * the saved thing it is (`foe`), which may move off the tile as a turn goes on. */
type Target = Spot & { foe: object; defense: number; take: (damage: number) => void };

/** The boss fell to an arcanum: the same ending each encounter gives its last hit. */
function win(s: TrialState) {
  s.status = "won";
  s.playing = false;
  s.slimes = [];
  s.elemental.incorporeal = false;
  if (s.keymaster) s.keymaster.mimics = [];
  if (s.bossVariant) s.bossVariant.minions = [];
}

/** Everything standing in the arena an arcanum can strike. */
function targets(s: TrialState): Target[] {
  if (s.room !== "arena" || s.status !== "active") return [];
  const out: Target[] = [], v = s.bossVariant, k = s.keymaster;
  if (!s.elemental.incorporeal && s.bossHp > 0) out.push({ x: s.elemental.x, y: s.elemental.y, foe: s.elemental, defense: effectiveBossDef(s), take(damage) {
    if (v) v.damageThisRun += Math.min(s.bossHp, damage);
    s.bossHp = Math.max(0, s.bossHp - damage);
    if (!s.bossHp) win(s);
  } });
  for (const slime of s.slimes) out.push({ x: slime.x, y: slime.y, foe: slime, defense: 0, take() { s.slimes = s.slimes.filter((o) => o !== slime); } });
  for (const mimic of k?.mimics ?? []) out.push({ x: mimic.x, y: mimic.y, foe: mimic, defense: 0, take(damage) {
    mimic.hp = Math.max(0, mimic.hp - damage);
    if (!mimic.hp) k!.mimics = k!.mimics.filter((o) => o !== mimic);
  } });
  if (!v) return out;
  for (const part of activeBossParts(v)) out.push({ x: part.x, y: part.y, foe: part, defense: part.defense, take(damage) {
    v.damageThisRun += Math.min(part.hp, damage);
    part.hp = Math.max(0, part.hp - damage);
  } });
  for (const minion of v.minions) out.push({ x: minion.x, y: minion.y, foe: minion, defense: minion.defense, take(damage) {
    minion.hp = Math.max(0, minion.hp - damage);
    if (minion.hp) return;
    v.minions = v.minions.filter((o) => o !== minion);
    // A minion's kill pays its Silver, as the hero's does (`roundFightMinion`).
    s.purchases ??= { silver: 0, training: {} };
    s.purchases.silver += Math.max(10, Math.round(15 * difficultyMultiplier(s.level)));
  } });
  return out;
}

/** The hero's step at (x, y): whether it strikes something, for Ricochet Shot. */
export function noteStrike(s: TrialState, x: number, y: number) {
  const a = s.arcana;
  if (!a?.spells?.ricochet) return;
  delete a.struck;
  const hit = targets(s).find((t) => same(t, { x, y }));
  if (hit) a.struck = { x, y, foe: hit.foe };
}

/** An arcanum's hit on `t`: its share of ATK, Overseer's beams and all, less its DEF. At least 1, as the hero's own hits. */
function strike(s: TrialState, t: Target, boost: number, kind: TrialStrike["kind"], from: Spot, tick: number, strikes: TrialStrike[]) {
  const damage = Math.max(1, Math.round(heroAttackOn(s, t) * boost - t.defense));
  t.take(damage);
  strikes.push({ kind, from, to: { x: t.x, y: t.y }, damage, tick });
}

/** The arcana's part of a turn the attempt just spent: a Ricochet Shot off the
 * hero's hit, the cooldowns running on, Thunderbolt's bolts, then the beams
 * turning. An ended attempt does none of it. */
export function trialArcanaTurn<O extends { message: string }>(s: TrialState, outcome: O): O {
  const a = s.arcana, spells = a?.spells;
  if (!a || !spells) return outcome;
  const strikes: TrialStrike[] = [], struck = a.struck;
  delete a.struck;
  if (s.status !== "active") return outcome;
  const { ricochet, thunderbolt } = spells;
  if (ricochet && struck && tileRandom(struck.x, struck.y, (s.seed ^ TRIAL_RICOCHET_SALT ^ Math.imul(s.steps, 0x85ebca6b)) | 0) * 100 < ricochet.chance) {
    const d2 = (t: Spot) => (t.x - struck.x) * (t.x - struck.x) + (t.y - struck.y) * (t.y - struck.y);
    const near = targets(s).filter((t) => t.foe !== struck.foe).sort((p, q) => d2(p) - d2(q) || p.y - q.y || p.x - q.x).slice(0, ricochet.rebounds);
    for (const t of near) if (s.status === "active") strike(s, t, ricochet.boost, "ricochet", { x: struck.x, y: struck.y }, 0, strikes);
  }
  const fired = tickCooldowns(thunderbolt ? [{ id: "thunderbolt", turns: thunderbolt.turns }] : [], a.run.timers).length > 0;
  if (thunderbolt && s.status === "active") {
    const { bolts, strike: turn } = chargeBolts(a.run, thunderbolt.bolts, fired);
    if (bolts) {
      const chosen = boltTargets(targets(s), bolts, s.seed, turn);
      chosen.forEach((t, i) => {
        if (s.status !== "active") return;
        strike(s, t, thunderbolt.boost, "thunderbolt", t, 1 + Math.floor((i * (TURN_TICKS - 1)) / chosen.length), strikes);
      });
      settleBolts(a.run, targets(s).length ? bolts - chosen.length : 0);
    }
  }
  if (spells.overseer) a.beamTurns++;
  a.strikes = strikes;
  if (s.status !== "active") return { ...outcome, message: `Trial complete — ${TRIALS[s.trialId].name} falls to your Arcana.` };
  return strikes.length && !outcome.message ? { ...outcome, message: `Your Arcana strike ${strikes.length} ${strikes.length === 1 ? "time" : "times"}.` } : outcome;
}

/** The saved arcana of an attempt, if it has any. */
export function decodeTrialArcana(raw: unknown): TrialArcana | undefined {
  if (!isRecord(raw)) return undefined;
  return { run: decodeArcanaRun(raw.run), beamTurns: wholeIn(raw.beamTurns, 0, 1e9) ? (raw.beamTurns as number) : 0 };
}

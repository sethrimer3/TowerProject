import { boltTargets, chargeBolts, decodeArcanaRun, settleBolts, tickCooldowns } from "../arcana/arcana.ts";
import { fieldHit, lifespringEffects, springAmplify, stepLifespring, validLifespring } from "../arcana/lifespring.ts";
import { ghostDirection, ghostOffset, inBlast, loseGhost, stepPhantasm, touchesTile, validPhantasm } from "../arcana/phantasm.ts";
import { stepDilation, validDilation } from "../arcana/time-dilation.ts";
import { TURN_TICKS } from "../enemies/ranged.ts";
import { tileRandom } from "../random.ts";
import { finite, isRecord, wholeIn } from "../save/decode.ts";
import { activeBossParts, effectiveBossDef } from "./boss-variants.ts";
import { difficultyMultiplier, TRIALS } from "./catalog.ts";
import { same, type Spot } from "./arena.ts";
import type { TrialState } from "./trial.ts";
import { heroAttackOn, type TrialArcana, type TrialSpells, type TrialStrike } from "./trial-spells.ts";

// The arcana's turn in a trial (docs/agents/arcana.md). A hit from an arcanum
// only wounds: it never makes a boss teleport, drop keys or pop coins, and draws
// no counter. A boss gone incorporeal can't be struck.

const TRIAL_RICOCHET_SALT = 0x71c0d;

/** What an arcanum can strike: its tile, its HP and DEF, what a hit does to it, and
 * the saved thing it is (`foe`), which may move off the tile as a turn goes on. */
type Target = Spot & { foe: object; hp: number; defense: number; take: (damage: number) => void };

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
  if (!s.elemental.incorporeal && s.bossHp > 0) out.push({ x: s.elemental.x, y: s.elemental.y, foe: s.elemental, hp: s.bossHp, defense: effectiveBossDef(s), take(damage) {
    if (v) v.damageThisRun += Math.min(s.bossHp, damage);
    s.bossHp = Math.max(0, s.bossHp - damage);
    if (!s.bossHp) win(s);
  } });
  for (const slime of s.slimes) out.push({ x: slime.x, y: slime.y, foe: slime, hp: 1, defense: 0, take() { s.slimes = s.slimes.filter((o) => o !== slime); } });
  for (const mimic of k?.mimics ?? []) out.push({ x: mimic.x, y: mimic.y, foe: mimic, hp: mimic.hp, defense: 0, take(damage) {
    mimic.hp = Math.max(0, mimic.hp - damage);
    if (!mimic.hp) k!.mimics = k!.mimics.filter((o) => o !== mimic);
  } });
  if (!v) return out;
  for (const part of activeBossParts(v)) out.push({ x: part.x, y: part.y, foe: part, hp: part.hp, defense: part.defense, take(damage) {
    v.damageThisRun += Math.min(part.hp, damage);
    part.hp = Math.max(0, part.hp - damage);
  } });
  for (const minion of v.minions) out.push({ x: minion.x, y: minion.y, foe: minion, hp: minion.hp, defense: minion.defense, take(damage) {
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

/** Lifespring's part of a turn: its cooldown, its Effect Wave or its field forming,
 * then the field on what stands in it, closest first. Every wave counts for
 * everything in the arena, even what came after it, and nothing there pays a
 * kill, so its Gold, Cell and Health Bonuses find nothing to raise. */
function lifespringTurn(s: TrialState, a: NonNullable<TrialState["arcana"]>, { hp, waves, turns, reach }: NonNullable<TrialSpells["lifespring"]>, strikes: TrialStrike[]) {
  const spring = (a.lifespring ??= {}), hero = s.player;
  a.springStep = stepLifespring(spring, { waves, turns, amount: hp * hero.attack });
  if (a.springStep.wave) a.springWaves = (a.springWaves ?? 0) + 1;
  const d2 = (t: Spot) => (t.x - hero.x) * (t.x - hero.x) + (t.y - hero.y) * (t.y - hero.y);
  const rate = springAmplify(lifespringEffects(s).amplify, a.springWaves ?? 0);
  const near = targets(s).filter((t) => d2(t) * 10_000 <= reach * reach).sort((p, q) => d2(p) - d2(q) || p.y - q.y || p.x - q.x);
  for (const t of near) {
    if (!spring.pool || s.status !== "active") break;
    const hit = fieldHit(spring.pool, t.hp, rate), damage = Math.round(hit.damage);
    if (hit.pool) spring.pool = hit.pool;
    else delete spring.pool;
    if (!damage) continue;
    t.take(damage);
    strikes.push({ kind: "lifespring", from: { x: t.x, y: t.y }, to: { x: t.x, y: t.y }, damage, tick: TURN_TICKS });
  }
}

/** Phantasm's part of a turn: the ring turning, its cooldown and the ghosts it
 * brings back, then each ghost on what it touches as the turn ends, a trial's turn
 * having no ticks. */
function phantasmTurn(s: TrialState, a: NonNullable<TrialState["arcana"]>, rule: NonNullable<TrialSpells["phantasm"]>, strikes: TrialStrike[]) {
  const ghosts = (a.phantasm ??= {}), hero = s.player;
  stepPhantasm(ghosts, rule);
  const ring = ghosts.ring;
  for (const slot of ghosts.ghosts ?? []) {
    if (s.status !== "active") return;
    const off = ghostOffset(ghostDirection(ghosts.turns! - 1, slot, ring!, rule.spin, TURN_TICKS)), at = { x: hero.x + off.x, y: hero.y + off.y };
    const near = targets(s);
    if (!near.some((t) => touchesTile(t.x - at.x, t.y - at.y))) continue;
    loseGhost(ghosts, slot);
    for (const t of near.filter((t) => touchesTile(t.x - at.x, t.y - at.y) || inBlast(t.x - at.x, t.y - at.y, rule.blast)))
      if (s.status === "active") strike(s, t, rule.boost, "phantasm", at, TURN_TICKS, strikes);
  }
}

/** The arcana's part of a turn the attempt just spent: a Ricochet Shot off the
 * hero's hit, the cooldowns running on, Thunderbolt's bolts, Lifespring, Phantasm, Time
 * Dilation's field, which holds back what comes next turn, then the beams turning.
 * An ended attempt does none of it. */
export function trialArcanaTurn<O extends { message: string }>(s: TrialState, outcome: O): O {
  const a = s.arcana, spells = a?.spells;
  if (!a || !spells) return outcome;
  const strikes: TrialStrike[] = [], struck = a.struck;
  delete a.struck;
  if (s.status !== "active") return outcome;
  const { ricochet, thunderbolt, lifespring } = spells;
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
  if (lifespring && s.status === "active") lifespringTurn(s, a, lifespring, strikes);
  if (spells.phantasm && s.status === "active") phantasmTurn(s, a, spells.phantasm, strikes);
  if (spells.timeDilation && s.status === "active") stepDilation((a.dilation ??= {}), spells.timeDilation);
  if (spells.overseer) a.beamTurns++;
  a.strikes = strikes;
  if (s.status !== "active") return { ...outcome, message: `Trial complete — ${TRIALS[s.trialId].name} falls to your Arcana.` };
  return strikes.length && !outcome.message ? { ...outcome, message: `Your Arcana strike ${strikes.length} ${strikes.length === 1 ? "time" : "times"}.` } : outcome;
}

/** The most foes' tallies an attempt keeps: more than ever stand at once, and spent ones linger. */
const MOST_TALLIES = 1000;
const tally = (v: unknown) => finite(v, 100) && (v as number) > 0;
/** The saved tallies of Time Dilation's field, if any are worth keeping. */
function decodeTallies(raw: unknown) {
  if (!isRecord(raw)) return {};
  const kept = Object.entries(raw).filter(([, v]) => tally(v)).slice(0, MOST_TALLIES);
  return kept.length ? { tallies: Object.fromEntries(kept) as Record<string, number> } : {};
}
/** How far its field has held back the saved boss clocks, if at all. */
function decodeLag(raw: unknown) {
  if (!isRecord(raw)) return {};
  const lag = { ...(finite(raw.boss, 1e12) && raw.boss > 0 ? { boss: raw.boss as number } : {}), ...(finite(raw.turret, 1e12) && raw.turret > 0 ? { turret: raw.turret as number } : {}) };
  return Object.keys(lag).length ? { lag } : {};
}

/** The saved arcana of an attempt, if it has any. */
export function decodeTrialArcana(raw: unknown): TrialArcana | undefined {
  if (!isRecord(raw)) return undefined;
  return { run: decodeArcanaRun(raw.run), beamTurns: wholeIn(raw.beamTurns, 0, 1e9) ? (raw.beamTurns as number) : 0,
    ...(validLifespring(raw.lifespring) && Object.keys(raw.lifespring).length ? { lifespring: raw.lifespring } : {}), ...(wholeIn(raw.springWaves, 1, 1e9) ? { springWaves: raw.springWaves as number } : {}),
    ...(validDilation(raw.dilation) && Object.keys(raw.dilation).length ? { dilation: raw.dilation } : {}), ...decodeTallies(raw.tallies), ...decodeLag(raw.lag),
    ...(validPhantasm(raw.phantasm) && Object.keys(raw.phantasm).length ? { phantasm: raw.phantasm } : {}) };
}

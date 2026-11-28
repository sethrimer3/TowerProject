// What rises off a trial's board, and what it sounds like, as a run's do
// (docs/agents/proving-grounds.md): each strike's and bite's number, a
// potion's heal, each pickup rising from its tile, and the run's fight and
// pickup sounds. A trial saves turns, not what they showed, so this reads
// each new turn against the last and raises what changed.
// Presentation only: it reads the trial and never changes it.
import { BoardPopups, type PopupFrame } from "../render/board-popups.ts";
import { THUNDERBOLT_FALL_MS } from "../volley.ts";
import { playAfter, type Cue } from "../sound.ts";
import { activeBossParts } from "./boss-variants.ts";
import type { Tile } from "../entities.ts";
import type { TrialStrike } from "./trial-spells.ts";
import type { TrialState } from "./trial.ts";

/** The undead or foe strikes back this long after the hero's strike (ms), as a Catacomb round's. */
const STRIKE_BACK_MS = 220;
/** A shot reaches the hero this far into a round's 380 ms (ms). */
const SHOT_LANDS_MS = 300;
/** Each Thunderbolt of a turn waits its share of this before it falls (ms), as the trial draws it. */
const BOLT_STAGGER_MS = 160;

type Spot = { x: number; y: number };
const at = (p: Spot) => `${p.x},${p.y}`;
/** Which spell animations the Settings hide: their numbers then stay hidden too. */
export type HiddenStrikes = Partial<Record<TrialStrike["kind"], boolean>>;

/** What the last turn left, to read the next against. */
type Seen = {
  state: TrialState;
  steps: number;
  hero: Spot;
  hp: number;
  round: number;
  strikes: TrialStrike[] | undefined;
  keys: number;
  mimics: Map<number, Spot & { hp: number }>;
  slimes: Map<number, Spot>;
  pickups: Map<number, Spot & { kind: string; amount: number }>;
  drops: Map<string, number>;
  consumed: Set<string>;
};

function seen(s: TrialState): Seen {
  return {
    state: s, steps: s.steps, hero: { x: s.player.x, y: s.player.y }, hp: s.player.hp, round: s.bossVariant?.lastRound?.step ?? -1, strikes: s.arcana?.strikes, keys: s.keymaster?.keys ?? 0,
    mimics: new Map((s.keymaster?.mimics ?? []).map((m) => [m.id, { x: m.x, y: m.y, hp: m.hp }])),
    slimes: new Map(s.slimes.map((p) => [p.id, { x: p.x, y: p.y }])),
    pickups: new Map((s.bossVariant?.pickups ?? []).map((p) => [p.id, { x: p.x, y: p.y, kind: p.kind, amount: p.amount }])),
    drops: new Map((s.keymaster?.drops ?? []).map((d) => [at(d), d.count])),
    consumed: new Set(s.consumed),
  };
}

/** A floor pickup's tile, as a run draws it rising; null for coins, which rise as their coin. */
const pickupTile = (kind: string, amount: number): Tile | null =>
  kind === "attack" || kind === "defense" ? { kind, amount } : kind === "potion" ? { kind: "potion", color: "red" } : null;
const PICKUP_CUES: Partial<Record<string, Cue>> = { attack: "attackShard", defense: "defenseShard", potion: "potion" };

export class TrialFx {
  private popups = new BoardPopups();
  private last: Seen | null = null;

  /** `cue` plays a sound, `delay` ms from now: the game's own unless a test listens instead. */
  constructor(private cue: (cue: Cue, delay?: number) => void = playAfter) {}

  /** Which numbers the Settings show: a run's rows. */
  settings(shown: { hitNumbers: boolean; hpGains: boolean; enemyBars: boolean }) {
    this.popups.settings(shown);
  }

  /** Reads trial `s` at `now`: a new attempt starts afresh; a new turn raises what it did. */
  observe(s: TrialState, now: number, hidden: HiddenStrikes = {}) {
    const last = this.last;
    if (!last || last.state !== s) {
      this.popups.clear();
      this.last = seen(s);
      return;
    }
    if (s.arcana?.strikes !== last.strikes) this.strikes(s.arcana?.strikes ?? [], now, hidden);
    if (s.steps === last.steps && s.player.hp === last.hp && (s.bossVariant?.lastRound?.step ?? -1) === last.round) {
      last.strikes = s.arcana?.strikes;
      return;
    }
    this.turn(last, s, now);
    this.last = seen(s);
  }

  /** The spells that struck this turn: each one's number as it lands, a Thunderbolt's after it falls, with its sound. */
  private strikes(strikes: TrialStrike[], now: number, hidden: HiddenStrikes) {
    for (const strike of strikes) {
      if (hidden[strike.kind]) continue;
      const delay = strike.kind === "thunderbolt" ? (strike.tick / 100) * BOLT_STAGGER_MS + THUNDERBOLT_FALL_MS : 0;
      this.popups.hit(strike.to, strike.damage, "hero", now + delay);
      if (strike.kind === "thunderbolt" && !strike.splash) this.cue("lightningZap", delay);
      if (strike.kind === "ricochet") this.cue("arrowHit");
    }
  }

  /** One turn's changes, from `was` to `s`. */
  private turn(was: Seen, s: TrialState, now: number) {
    const hero = s.player;
    let taken = 0;
    // A round of combat (a boss, a part, a minion): the hero's strike, then the foe's or its shots.
    const round = s.bossVariant?.lastRound;
    if (round && round.step !== was.round) {
      if (round.heroDamage > 0) {
        this.popups.hit(round.to, round.heroDamage, "hero", now);
        this.cue("punch");
      }
      const melee = round.enemyDamage - round.shots.reduce((sum, shot) => sum + shot.damage, 0);
      if (melee > 0) {
        this.popups.hit(round.from, melee, "enemy", now + STRIKE_BACK_MS);
        this.cue("punch", STRIKE_BACK_MS);
      }
      for (const shot of round.shots) {
        this.popups.hit(shot.to, shot.damage, "enemy", now + SHOT_LANDS_MS);
        this.cue("arrowHit", SHOT_LANDS_MS);
      }
      taken += round.enemyDamage;
      if (round.heroDamage > 0 && !standing(s, round.to)) this.cue("bodyFall");
    }
    // The Keymaster's mimics beside the hero: struck, beaten, or opened with a key (those cleared by a win are not).
    const mimics = new Map((s.keymaster?.mimics ?? []).map((m) => [m.id, m]));
    for (const [id, m] of was.mimics) {
      if (Math.abs(m.x - was.hero.x) + Math.abs(m.y - was.hero.y) > 1) continue;
      const now_ = mimics.get(id), struck = m.hp - (now_?.hp ?? 0);
      if (now_ && struck <= 0) continue;
      const unlocked = !now_ && (s.keymaster?.keys ?? 0) < was.keys;
      if (!unlocked) {
        this.popups.hit(m, struck, "hero", now);
        this.cue("punch");
      } else this.cue("key");
      if (!now_) this.cue("bodyFall");
    }
    // A light slime the hero walked into disperses.
    for (const [id, p] of was.slimes) if (!s.slimes.some((q) => q.id === id) && hero.x === p.x && hero.y === p.y) this.cue("punch");
    // Pickups rise from their tiles: shards, potions and coins, the arena's potions and the Keymaster's keys.
    const pickups = new Set((s.bossVariant?.pickups ?? []).map((p) => p.id));
    for (const [id, p] of was.pickups) {
      if (pickups.has(id) || hero.x !== p.x || hero.y !== p.y) continue;
      const tile = pickupTile(p.kind, p.amount), cue = PICKUP_CUES[p.kind];
      this.popups.reward({ x: p.x, y: p.y, text: `+${p.amount}`, art: tile ? { tile } : { coin: p.kind === "gold" ? "gold" : "silver" } }, now);
      if (cue) this.cue(cue);
    }
    for (const k of s.consumed) if (!was.consumed.has(k)) {
      const [x, y] = k.split(",").map(Number) as [number, number];
      this.popups.reward({ x, y, text: "Potion", art: { tile: { kind: "potion", color: "red" } } }, now);
      this.cue("potion");
    }
    const drops = new Map((s.keymaster?.drops ?? []).map((d) => [at(d), d.count]));
    for (const [k, count] of was.drops) if ((drops.get(k) ?? 0) < count && k === at(hero)) {
      this.popups.reward({ x: hero.x, y: hero.y, text: "Key", art: { tile: { kind: "key", color: "yellow" } } }, now);
      this.cue("key");
    }
    // The hero's HP: what a round didn't already raise (a bite, a slime, a beam), or a heal.
    const change = hero.hp - was.hp;
    if (change < 0 && -change - taken >= 1) this.popups.hit(hero, -change - taken, "enemy", now);
    if (change > 0) this.popups.potionHeal(hero, change, now);
  }

  /** Draws what is rising, over the view `left`, `bottom` of `n` tiles `s` wide. */
  draw(frame: PopupFrame) {
    this.popups.expire(frame.now);
    this.popups.draw(frame);
  }
}

/** Whether a foe still stands on `p`: the boss, a part or a minion. */
function standing(s: TrialState, p: Spot) {
  const v = s.bossVariant;
  if (s.bossHp > 0 && s.elemental.x === p.x && s.elemental.y === p.y) return true;
  return !!v && (activeBossParts(v).some((q) => q.x === p.x && q.y === p.y) || v.minions.some((q) => q.x === p.x && q.y === p.y));
}


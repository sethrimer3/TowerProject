// What rises off a trial's board, and what it sounds like, as a run's do
// (docs/agents/proving-grounds.md): each strike's and bite's number, a struck
// foe's HP bar, a potion's heal, each pickup rising from its tile, how far the
// hero and its foe lean into a strike, and the run's fight, pickup, footstep
// and stair sounds. A trial saves turns, not what they showed, so this reads
// each new turn against the last and raises what changed.
// Presentation only: it reads the trial and never changes it.
import { BoardPopups, type PopupFrame } from "../render/board-popups.ts";
import { THUNDERBOLT_FALL_MS } from "../volley.ts";
import { playAfter, type Cue } from "../sound.ts";
import { RUN_GAP_MS } from "../render/board-sounds.ts";
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
/** A strike's lean: out and back over this long (ms), as far as a run's (tiles). */
const LUNGE_MS = 200, LUNGE = 0.3;
/** How far a strike leans `t` ms after it swings, in tiles. */
const lunge = (t: number) => (t >= 0 && t < LUNGE_MS ? LUNGE * Math.sin((Math.PI * t) / LUNGE_MS) : 0);

type Spot = { x: number; y: number };
/** A strike being drawn: the hero on `from` swinging at the foe on `to` at
 * `at`, and the foe answering `answer` ms later (never, once it has fallen). */
type Strike = { from: Spot; to: Spot; at: number; answer: number | null };
/** A foe's HP, to drain its bar from when it is struck. */
type Foe = Spot & { hp: number; full: number };
const at = (p: Spot) => `${p.x},${p.y}`;
/** Which spell animations the Settings hide: their numbers then stay hidden too. */
export type HiddenStrikes = Partial<Record<TrialStrike["kind"], boolean>>;

/** What the last turn left, to read the next against. */
type Seen = {
  state: TrialState;
  room: TrialState["room"];
  status: TrialState["status"];
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
  /** Each foe standing (the boss, mimics, parts, minions), by its key. */
  foes: Map<string, Foe>;
};

function seen(s: TrialState): Seen {
  return {
    state: s, room: s.room, status: s.status, steps: s.steps, hero: { x: s.player.x, y: s.player.y }, hp: s.player.hp, round: s.bossVariant?.lastRound?.step ?? -1, strikes: s.arcana?.strikes, keys: s.keymaster?.keys ?? 0,
    mimics: new Map((s.keymaster?.mimics ?? []).map((m) => [m.id, { x: m.x, y: m.y, hp: m.hp }])),
    slimes: new Map(s.slimes.map((p) => [p.id, { x: p.x, y: p.y }])),
    pickups: new Map((s.bossVariant?.pickups ?? []).map((p) => [p.id, { x: p.x, y: p.y, kind: p.kind, amount: p.amount }])),
    drops: new Map((s.keymaster?.drops ?? []).map((d) => [at(d), d.count])),
    consumed: new Set(s.consumed),
    foes: foes(s),
  };
}

/** The foes standing in `s`'s arena by key, as the trial's Shock marks them. */
function foes(s: TrialState): Map<string, Foe> {
  const v = s.bossVariant, out = new Map<string, Foe>();
  if (s.room !== "arena") return out;
  if (s.status !== "won") out.set("boss", { x: s.elemental.x, y: s.elemental.y, hp: s.bossHp, full: s.bossMaxHp });
  for (const m of s.keymaster?.mimics ?? []) out.set(`mimic:${m.id}`, { x: m.x, y: m.y, hp: m.hp, full: m.maxHp });
  if (v) for (const p of activeBossParts(v)) out.set(`part:${p.id}`, { x: p.x, y: p.y, hp: p.hp, full: p.maxHp });
  for (const m of v?.minions ?? []) out.set(`minion:${m.id}`, { x: m.x, y: m.y, hp: m.hp, full: m.maxHp });
  return out;
}

/** A floor pickup's tile, as a run draws it rising; null for coins, which rise as their coin. */
const pickupTile = (kind: string, amount: number): Tile | null =>
  kind === "attack" || kind === "defense" ? { kind, amount } : kind === "potion" ? { kind: "potion", color: "red" } : null;
const PICKUP_CUES: Partial<Record<string, Cue>> = { attack: "attackShard", defense: "defenseShard", potion: "potion" };

export class TrialFx {
  private popups = new BoardPopups();
  private last: Seen | null = null;
  /** The strike being drawn, for its lean. */
  private strike: Strike | null = null;
  /** When the hero last stepped, to tell a walk's footsteps from a run's. */
  private steppedAt = -Infinity;

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
      this.strike = null;
      this.last = seen(s);
      return;
    }
    if (s.arcana?.strikes !== last.strikes) this.strikes(s.arcana?.strikes ?? [], now, hidden);
    if (s.steps === last.steps && s.player.hp === last.hp && s.room === last.room && s.player.x === last.hero.x && s.player.y === last.hero.y && (s.bossVariant?.lastRound?.step ?? -1) === last.round) {
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

  /** How far the hero and the foe it strikes lean at `now`: each toward the
   * other as its blow lands, the foe's tile named so only it moves. */
  lean(now: number, reduceMotion: boolean): { hero: { dx: number; dy: number }; foe: (Spot & { dx: number; dy: number }) | null } {
    const k = this.strike;
    if (!k || reduceMotion) return { hero: { dx: 0, dy: 0 }, foe: null };
    const dx = Math.sign(k.to.x - k.from.x), dy = Math.sign(k.to.y - k.from.y), out = lunge(now - k.at), back = k.answer === null ? 0 : lunge(now - k.at - k.answer);
    return { hero: { dx: dx * out, dy: dy * out }, foe: back ? { x: k.to.x, y: k.to.y, dx: -dx * back, dy: -dy * back } : null };
  }

  /** One turn's changes, from `was` to `s`. */
  private turn(was: Seen, s: TrialState, now: number) {
    const hero = s.player;
    let taken = 0;
    // Up the staging room's stairs into the arena, and each step of a walk the player leads, as a run's.
    if (s.room !== was.room) this.cue("stoneSteps");
    else if (Math.abs(hero.x - was.hero.x) + Math.abs(hero.y - was.hero.y) === 1 && (s.mode === "manual" || !s.playing)) {
      this.cue(now - this.steppedAt < RUN_GAP_MS ? "run" : "step");
      this.steppedAt = now;
    }
    // Each foe struck shows its HP bar draining, as a run's arrows' do.
    const after = foes(s);
    for (const [k, f] of was.foes) {
      const left = after.get(k)?.hp ?? 0;
      if (left < f.hp) this.popups.bar(f, f.hp, left, f.full, now);
    }
    // The Light Elemental or Keymaster struck by the hero stepping into it (or by the Keymaster's spirits), less what the spells took.
    const boss = was.foes.get("boss");
    if (boss && !s.bossVariant) {
      const spells = (s.arcana?.strikes !== was.strikes ? s.arcana?.strikes ?? [] : [])
        .filter((k) => (k.to.x === boss.x && k.to.y === boss.y) || (k.to.x === s.elemental.x && k.to.y === s.elemental.y))
        .reduce((sum, k) => sum + k.damage, 0);
      const struck = boss.hp - s.bossHp - spells;
      const bumped = hero.x === was.hero.x && hero.y === was.hero.y && Math.abs(boss.x - hero.x) + Math.abs(boss.y - hero.y) === 1;
      if (struck >= 1) {
        this.popups.hit(boss, struck, "hero", now);
        if (bumped) {
          this.cue("punch");
          const lost = was.hp - hero.hp, answered = s.status === "active" && lost > 0;
          this.strike = { from: was.hero, to: boss, at: now, answer: answered ? STRIKE_BACK_MS : null };
          if (answered) {
            this.popups.hit(hero, lost, "enemy", now + STRIKE_BACK_MS);
            this.cue("punch", STRIKE_BACK_MS);
            taken += lost;
          }
        }
      }
    }
    if (was.status === "active" && s.status === "won") this.cue("bodyFall");
    // A round of combat (a boss, a part, a minion): the hero's strike, then the foe's or its shots.
    const round = s.bossVariant?.lastRound;
    if (round && round.step !== was.round) {
      const melee = round.enemyDamage - round.shots.reduce((sum, shot) => sum + shot.damage, 0);
      if (round.heroDamage > 0) {
        this.popups.hit(round.to, round.heroDamage, "hero", now);
        this.cue("punch");
        this.strike = { from: round.from, to: round.to, at: now, answer: melee > 0 ? STRIKE_BACK_MS : null };
      }
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
        this.strike = { from: was.hero, to: m, at: now, answer: null };
      } else this.cue("key");
      if (!now_) this.cue("bodyFall");
    }
    // A light slime the hero walked into disperses.
    for (const [id, p] of was.slimes) if (!s.slimes.some((q) => q.id === id) && hero.x === p.x && hero.y === p.y) this.cue("punch");
    // Pickups rise from their tiles: shards, potions and coins, the arena's potions and the Keymaster's keys.
    // A shard rises as its amount beside it; a potion raises no sprite, only
    // its heal over the hero (below), as a run's does.
    const change = hero.hp - was.hp;
    const pickups = new Set((s.bossVariant?.pickups ?? []).map((p) => p.id));
    for (const [id, p] of was.pickups) {
      if (pickups.has(id) || hero.x !== p.x || hero.y !== p.y) continue;
      const tile = pickupTile(p.kind, p.amount), cue = PICKUP_CUES[p.kind];
      if (p.kind !== "potion") this.popups.reward({ x: p.x, y: p.y, text: `+${p.amount}`, art: tile ? { tile } : { coin: p.kind === "gold" ? "gold" : "silver" } }, now);
      if (cue) this.cue(cue);
    }
    for (const k of s.consumed) if (!was.consumed.has(k)) this.cue("potion");
    const drops = new Map((s.keymaster?.drops ?? []).map((d) => [at(d), d.count]));
    for (const [k, count] of was.drops) if ((drops.get(k) ?? 0) < count && k === at(hero)) {
      this.popups.reward({ x: hero.x, y: hero.y, text: "Key", art: { tile: { kind: "key", color: "yellow" } } }, now);
      this.cue("key");
    }
    // The hero's HP: what a round didn't already raise (a bite, a slime, a beam), or a heal.
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


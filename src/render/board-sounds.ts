import type { GameCue, ShownFight } from "../shown.ts";
import { landsAt, type Volley } from "../volley.ts";

/** The board's recorded sounds: what `BoardSounds` asks `sound.ts` to play. */
export type BoardCue = "punch" | "arrowHit" | "bodyFall" | "blast" | "phoenixSpark" | "slimeImpact" | GameCue;

/** How old (ms) a game event's sound may be and still play: older ones
 * happened while the board wasn't showing. */
export const CUE_STALE_MS = 400;

/** What the board hears each frame: the fight showing, the latest volley,
 * the moments the hero was struck down, the last Bomb, the moments Phoenix
 * Spark shrugged off a defeating hit, the familiars' latest bursts, and the
 * game's own events' sounds (`Game.cues`), taken from the game. */
export type Heard = {
  fight: ShownFight | null;
  volley: Volley | null;
  struckDown: readonly number[];
  bombed: { at: number } | null;
  sparkedAt?: readonly number[];
  familiars?: { bursts: readonly { id: string }[]; at: number } | null;
  cues?: readonly { cue: GameCue; at: number }[];
};

/** Plays the board's events as they land, presentation only, the way
 * `BoardPopups` raises their numbers: each fight strike a blow (and a fall
 * once it fells the enemy, by a strike or its thorns), each shot an arrow
 * striking (and a fall when it fells its target), the hero struck down a
 * fall, each Bomb a blast, each Phoenix Spark its own sound, the Slime's
 * burst its impact, and the game's events (pickups, doors, Gems…) as they
 * happen, each sound once however many asked for it at once. Nothing
 * already over when it is first heard plays, so opening the game replays
 * nothing. */
export class BoardSounds {
  private fight: ShownFight | null = null;
  private landed = 0;
  private volley: Volley | null = null;
  /** The volley's sounds still to come, by when each lands. */
  private queued: { at: number; cue: BoardCue }[] = [];
  /** The falls and sparks still to come, which a new volley leaves alone. */
  private timed: { at: number; cue: BoardCue }[] = [];
  private downTo = -Infinity;
  private sparkTo = -Infinity;
  private bombed: { at: number } | null = null;
  private familiars: Heard["familiars"] = null;
  private started = false;

  constructor(private play: (cue: BoardCue) => void) {}

  update(heard: Heard, now: number) {
    if (!this.started) {
      // Whatever is on the board as it first shows has already happened.
      this.started = true;
      this.bombed = heard.bombed;
      this.downTo = Math.max(-Infinity, ...heard.struckDown);
      this.sparkTo = Math.max(-Infinity, ...(heard.sparkedAt ?? []));
      this.familiars = heard.familiars ?? null;
    }
    this.strikes(heard.fight, now);
    this.shots(heard.volley, now);
    const down = Math.max(-Infinity, ...heard.struckDown);
    if (down > this.downTo) {
      this.downTo = down;
      this.soon(down, "bodyFall", now);
    }
    const spark = Math.max(-Infinity, ...(heard.sparkedAt ?? []));
    if (spark > this.sparkTo) {
      this.sparkTo = spark;
      this.soon(spark, "phoenixSpark", now);
    }
    if (heard.bombed !== this.bombed) {
      this.bombed = heard.bombed;
      if (heard.bombed) this.play("blast");
    }
    const familiars = heard.familiars ?? null;
    if (familiars !== this.familiars) {
      this.familiars = familiars;
      if (familiars?.bursts.some((b) => b.id === "slime")) this.soon(familiars.at, "slimeImpact", now);
    }
    const events = new Set<BoardCue>();
    for (const { cue, at } of heard.cues ?? []) if (now - at <= CUE_STALE_MS) events.add(cue);
    for (const cue of events) this.play(cue);
    const due = [...this.queued, ...this.timed].filter((q) => q.at <= now);
    if (due.length) {
      this.queued = this.queued.filter((q) => q.at > now);
      this.timed = this.timed.filter((q) => q.at > now);
      for (const cue of new Set(due.map((q) => q.cue))) this.play(cue);
    }
  }

  /** Plays `cue` now if `at` has come, or keeps it for then. */
  private soon(at: number, cue: BoardCue, now: number) {
    if (at <= now) this.play(cue);
    else this.timed.push({ at, cue });
  }

  private strikes(fight: ShownFight | null, now: number) {
    if (fight !== this.fight) {
      this.fight = fight;
      // A fight first heard part way through plays only what is still to land.
      this.landed = fight ? fight.bout.strikes.filter((s) => fight.start + s.at <= now - 100).length : 0;
    }
    if (!fight) return;
    const strikes = fight.bout.strikes;
    let blow = false, fell = false;
    while (this.landed < strikes.length && fight.start + strikes[this.landed].at <= now) {
      const s = strikes[this.landed++];
      blow = true;
      if ((s.by === "hero" && !s.hp) || s.thornHp === 0) fell = true;
    }
    if (blow) this.play("punch");
    if (fell) this.play("bodyFall");
  }

  private shots(volley: Volley | null, now: number) {
    if (volley === this.volley) return;
    this.volley = volley;
    this.queued = [];
    if (!volley) return;
    for (const s of volley.shots) {
      const at = landsAt(volley, s);
      if (at < now - 100) continue;
      this.queued.push({ at, cue: "arrowHit" });
      if (s.fell) this.queued.push({ at, cue: "bodyFall" });
    }
  }
}

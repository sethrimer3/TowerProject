import type { ShownFight } from "../shown.ts";
import { landsAt, type Volley } from "../volley.ts";

/** The board's recorded sounds: what `BoardSounds` asks `sound.ts` to play. */
export type BoardCue = "punch" | "arrowHit" | "bodyFall" | "blast";

/** What the board hears each frame: the fight showing, the latest volley,
 * the moments the hero was struck down and the last Bomb. */
export type Heard = {
  fight: ShownFight | null;
  volley: Volley | null;
  struckDown: readonly number[];
  bombed: { at: number } | null;
};

/** Plays the board's events as they land, presentation only, the way
 * `BoardPopups` raises their numbers: each fight strike a blow (and a fall
 * once it fells the enemy, by a strike or its thorns), each shot an arrow
 * striking (and a fall when it fells its target), the hero struck down a
 * fall, and each Bomb a blast. Nothing already over when it is first heard
 * plays, so opening the game or undoing replays nothing. */
export class BoardSounds {
  private fight: ShownFight | null = null;
  private landed = 0;
  private volley: Volley | null = null;
  /** The volley's sounds still to come, by when each lands. */
  private queued: { at: number; cue: BoardCue }[] = [];
  private downTo = -Infinity;
  private bombed: { at: number } | null = null;
  private started = false;

  constructor(private play: (cue: BoardCue) => void) {}

  update(heard: Heard, now: number) {
    if (!this.started) {
      // Whatever is on the board as it first shows has already happened.
      this.started = true;
      this.bombed = heard.bombed;
      this.downTo = Math.max(-Infinity, ...heard.struckDown);
    }
    this.strikes(heard.fight, now);
    this.shots(heard.volley, now);
    const down = Math.max(-Infinity, ...heard.struckDown);
    if (down > this.downTo) {
      this.downTo = down;
      if (down <= now) this.play("bodyFall");
      else this.queued.push({ at: down, cue: "bodyFall" });
    }
    if (heard.bombed !== this.bombed) {
      this.bombed = heard.bombed;
      if (heard.bombed) this.play("blast");
    }
    const due = this.queued.filter((q) => q.at <= now);
    if (due.length) {
      this.queued = this.queued.filter((q) => q.at > now);
      for (const cue of new Set(due.map((q) => q.cue))) this.play(cue);
    }
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
    this.queued = this.queued.filter((q) => q.cue === "bodyFall" && q.at === this.downTo);
    if (!volley) return;
    for (const s of volley.shots) {
      const at = landsAt(volley, s);
      if (at < now - 100) continue;
      this.queued.push({ at, cue: "arrowHit" });
      if (s.fell) this.queued.push({ at, cue: "bodyFall" });
    }
  }
}

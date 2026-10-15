/** Cinematic mode: inside a run, every control, stat and bar gives way to
 * the board alone. Entered by pinching the board in (fingers drawn
 * together), or after `CINEMATIC_IDLE_MS` without input (dimmed, against
 * screen burn-in); left by pinching out, a quick run of taps, Escape, the
 * gear a single tap shows, or anything that takes the board away (a page,
 * a dialog, the run's end) or pauses the hand. Never saved: a reload shows
 * the whole UI. */

/** How long without input before the idle option enters it. */
export const CINEMATIC_IDLE_MS = 120_000;
/** A pinch counts once the fingers' spread falls below (in) or rises above
 * (out) this share of where it started. */
export const PINCH_IN = 0.7;
export const PINCH_OUT = 1.4;
/** This many taps, each within `EXIT_TAP_MS` of the one before, leave it. */
export const EXIT_TAPS = 3;
export const EXIT_TAP_MS = 600;
/** How long the gear a single tap shows stays. */
export const GEAR_MS = 3000;

export type CinematicLook = { active: boolean; dimmed: boolean; gear: boolean; gems: boolean };

export type CinematicHost = {
  /** The player's settings for it. */
  settings(): { cinematic: boolean; cinematicIdle: boolean; cinematicGems: boolean };
  /** It may show: the board's page is open inside a run with the hand
   * playing (a paused hand waits on the player, whose play button cinematic
   * mode hides), with no dialog and no board lesson waiting on the player. */
  allowed(): boolean;
  /** Milliseconds, on the game's clock. */
  now(): number;
  /** Shows `look` on the page. */
  show(look: CinematicLook): void;
};

export class Cinematic {
  active = false;
  /** Entered by idling: the board dims until the next input. */
  dimmed = false;
  private lastInput: number;
  private gearUntil = 0;
  /** When the taps of the current run of quick taps landed. */
  private taps: number[] = [];

  constructor(private host: CinematicHost) {
    this.lastInput = host.now();
  }

  /** Enters it, if the setting is on and the board allows; true if it did. */
  enter(reason: "pinch" | "idle") {
    if (this.active || !this.host.settings().cinematic || !this.host.allowed()) return false;
    this.active = true;
    this.dimmed = reason === "idle";
    this.gearUntil = 0;
    this.taps = [];
    this.show();
    return true;
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    this.dimmed = false;
    this.gearUntil = 0;
    this.taps = [];
    this.show();
  }

  /** Any input (a press, a key, the wheel): restarts the idle clock and
   * lights a dimmed board again. */
  input() {
    this.lastInput = this.host.now();
    if (!this.dimmed) return;
    this.dimmed = false;
    this.show();
  }

  /** A tap on the screen while it shows (not one that collected a Gem):
   * the first shows the gear, a quick run of them leaves. Returns whether
   * it left. */
  tap() {
    if (!this.active) return false;
    const now = this.host.now();
    if (this.taps.length && now - this.taps[this.taps.length - 1] > EXIT_TAP_MS) this.taps = [];
    this.taps.push(now);
    if (this.taps.length >= EXIT_TAPS) {
      this.exit();
      return true;
    }
    this.gearUntil = now + GEAR_MS;
    this.show();
    return false;
  }

  /** A pinch on the board: in enters, out leaves. */
  pinch(direction: "in" | "out") {
    if (direction === "in") this.enter("pinch");
    else this.exit();
  }

  /** Once a second: leaves once the board no longer allows it (or the
   * setting is off), hides the gear once its time is up, and enters after
   * the idle time with the idle option on. */
  tick() {
    const now = this.host.now(), settings = this.host.settings();
    if (this.active) {
      if (!settings.cinematic || !this.host.allowed()) return this.exit();
      if (this.gearUntil && now >= this.gearUntil) {
        this.gearUntil = 0;
        this.show();
      }
      return;
    }
    if (settings.cinematicIdle && now - this.lastInput >= CINEMATIC_IDLE_MS) this.enter("idle");
  }

  get gearShown() {
    return this.active && this.gearUntil > 0;
  }

  /** Shows the look again, as when the Gems setting changed. */
  show() {
    this.host.show({ active: this.active, dimmed: this.dimmed, gear: this.gearShown, gems: this.active && this.host.settings().cinematicGems });
  }
}

/** The pointers held on the board, telling a two-finger pinch in or out.
 * Each pinch is told once: after that it waits for a finger to lift. */
export class PinchTracker {
  private points = new Map<number, { x: number; y: number }>();
  private start = 0;
  private told = false;

  get count() {
    return this.points.size;
  }

  down(id: number, x: number, y: number) {
    this.points.set(id, { x, y });
    if (this.points.size === 2) {
      this.start = this.spread();
      this.told = false;
    }
  }

  /** A pointer moved: "in" or "out" the moment a pinch passes its mark. */
  move(id: number, x: number, y: number): "in" | "out" | null {
    if (!this.points.has(id)) return null;
    this.points.set(id, { x, y });
    if (this.points.size !== 2 || this.told || this.start <= 0) return null;
    const ratio = this.spread() / this.start;
    const direction = ratio <= PINCH_IN ? "in" : ratio >= PINCH_OUT ? "out" : null;
    if (direction) this.told = true;
    return direction;
  }

  up(id: number) {
    this.points.delete(id);
    if (this.points.size < 2) this.start = 0;
  }

  private spread() {
    const [a, b] = [...this.points.values()];
    return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
  }
}

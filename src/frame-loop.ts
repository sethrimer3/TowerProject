import type { Game } from "./state.ts";
import type { Renderer } from "./render/rendering.ts";
import { isBoard, type Tab } from "./ui/app.ts";

export type FrameLoopHost = {
  game: Game;
  renderer: Renderer;
  modal: HTMLDialogElement;
  tab(): Tab;
  /** A separate encounter may own the shared board for this frame. */
  boardFrame?(time: number): boolean;
  /** Redraws the skill tree's particles while the Upgrades page shows. */
  upgradesFrame(time: number): void;
  /** Moves the tab's countdowns on as each shows another second, and
   * redraws the Training tab's particles, while the Research page shows. */
  researchFrame(time: number): void;
  update(): void;
  /** Once a second: completes research the clock has reached and ticks the
   * Archives' countdowns. */
  archivesTick(): void;
  /** Refreshes only the HP readouts, as a fight's strikes land. */
  vitals(): void;
  /** Moves on the purse's Gold and Silver while they count up. */
  purse(time: number): void;
  /** Keeps the tile highlight on its tile as the camera moves, and shows
   * Free Training's levels as they are given. */
  highlight(): void;
  save(): void;
};

/** Whether a page has asked the hand never to take its turns, playing or
 * not (`globalThis.__handHeld`): the UI snapshot suite, so pressing play
 * or a card's Focus changes the HUD but never moves the board under a
 * snapshot. */
const handHeld = () => !!(globalThis as { __handHeld?: boolean }).__handHeld;

/** Runs `part` of a frame, reporting an error it throws instead of
 * letting it end the frame. */
function guard(part: () => void) {
  try {
    part();
  } catch (e) {
    console.error(e);
  }
}

/** Walked routes advance one tile per this many ms. */
const ROUTE_STEP_MS = 130;
/** The walk in through the forest's entrance takes a turn per this many ms. */
const WALK_IN_TURN_MS = 260;
/** Battery saver: a frame at most every this many ms while anything on the
 * board moves or a step is due (about 15 a second)... */
const BATTERY_BUSY_MS = 66;
/** ...and every this many ms while all is still. A press or a change to the
 * game asks for the next frame at once. */
const BATTERY_IDLE_MS = 400;
const AUTOSAVE_MS = 10000;
const ARCHIVES_TICK_MS = 1000;

/** The requestAnimationFrame loop: draws the visible page, plays fights
 * out, walks queued routes, runs Automove at its chosen speed, and
 * autosaves. */
export class FrameLoop {
  private lastAuto = 0;
  private lastRoute = 0;
  private lastSave = 0;
  private lastArchives = 0;
  /** Battery saver's wait for the next frame, while one is pending. */
  private waiting: ReturnType<typeof setTimeout> | null = null;

  constructor(private host: FrameLoopHost) {}

  start() {
    requestAnimationFrame(this.frame);
    if (typeof window !== "undefined") for (const type of ["pointerdown", "pointerup", "keydown", "wheel"]) window.addEventListener(type, () => this.wake(), { passive: true });
  }

  /** Battery saver: draws the next frame now rather than after its wait,
   * as the player presses something or the game changes. */
  wake() {
    if (this.waiting === null) return;
    clearTimeout(this.waiting);
    this.waiting = null;
    requestAnimationFrame(this.frame);
  }

  /** Asks for the next frame: at the screen's own rate, or with Battery
   * saver on, after a wait (shorter while the board moves). */
  private next() {
    const wait = this.batteryWait();
    if (!wait) return void requestAnimationFrame(this.frame);
    this.waiting = setTimeout(() => {
      this.waiting = null;
      requestAnimationFrame(this.frame);
    }, wait);
  }

  /** How long Battery saver waits before the next frame, or 0 while it is off. */
  private batteryWait() {
    const { game, renderer } = this.host;
    if (!game.save.settings.batterySaver) return 0;
    const now = performance.now();
    const busy = !renderer.isIdle(now) || game.route.length > 0 || (game.auto && !game.paused) || !!game.fights.encounter || !!game.walkIn || !!game.forestArrival;
    return busy ? BATTERY_BUSY_MS : BATTERY_IDLE_MS;
  }

  /** Restarts Automove's step timer, e.g. when the page becomes visible
   * again, so it does not take a burst of catch-up steps. */
  resetAutoTimer() {
    this.lastAuto = performance.now();
  }

  /** Each frame's parts run apart, and the next frame is asked for first,
   * so an error in one part (reported to the console) never stops the
   * others, or the loop itself: research and training still complete, and
   * the game still saves. */
  private frame = (time: number) => {
    try {
      this.next();
    } catch (e) {
      console.error(e);
      requestAnimationFrame(this.frame);
    }
    const { host } = this, tab = host.tab();
    if (!document.hidden) {
      if (tab === "upgrades") guard(() => host.upgradesFrame(time));
      if (tab === "research") guard(() => host.researchFrame(time));
      if (isBoard(tab)) {
        guard(() => this.boardFrame(time));
        guard(() => host.purse(time));
        guard(() => host.highlight());
      }
    }
    // Off the board (or hidden), the forest's wind dies away.
    if (document.hidden || !isBoard(tab)) guard(() => host.renderer.hush?.());
    if (time - this.lastArchives > ARCHIVES_TICK_MS) {
      this.lastArchives = time;
      guard(() => host.archivesTick());
    }
    if (time - this.lastSave > AUTOSAVE_MS) {
      this.lastSave = time;
      guard(() => host.save());
    }
  };

  private boardFrame(time: number) {
    if(this.host.boardFrame?.(time))return;
    const game = this.host.game;
    this.host.renderer.draw(time);
    if (game.fights.encounter) this.playFight(time);
    if (game.forestArrival) {
      if (this.canAct() && game.forestArrivalFrame(time)) this.host.update();
      return;
    }
    if (game.walkIn) {
      // Once the hero is gone, the walk in waits only on the view closing in.
      const due = game.walkIn.stage === "gone" || time - this.lastRoute > WALK_IN_TURN_MS;
      if (due && this.canAct() && game.walkInTurn(time)) {
        this.lastRoute = time;
        this.host.update();
      }
      return;
    }
    if (game.route.length && this.due(time, this.lastRoute, ROUTE_STEP_MS)) {
      this.lastRoute = time;
      game.routeStep();
      this.host.update();
    }
    if (game.auto && !handHeld() && this.due(time, this.lastAuto, 1000 / game.moveRate)) {
      this.lastAuto = time;
      game.autoTurn();
      this.host.update();
    }
  }

  /** Shows the HP the fight's strikes have left, and settles the fight once
   * its last strike is done. */
  private playFight(time: number) {
    const fight = this.host.game.fights.encounter!;
    if (time < fight.start + fight.bout.duration) return this.host.vitals();
    this.host.game.fights.finish();
    this.host.update();
  }

  /** A step may run: the interval since the last one has passed and the game is live. */
  private due(time: number, last: number, interval: number) {
    return this.canAct() && time - last > interval;
  }

  /** Steps only run while the game is live: not paused, held by a lesson,
   * finished, in a fight still playing out, or behind a dialog. */
  private canAct() {
    const { game, modal } = this.host;
    return !game.paused && !game.lessonHolds && !game.fallen && !game.fights.encounter && !modal.open;
  }
}

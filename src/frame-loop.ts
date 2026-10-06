import type { Game } from "./state.ts";
import type { Renderer } from "./rendering.ts";
import { isBoard, type Tab } from "./ui/app.ts";

export type FrameLoopHost = {
  game: Game;
  renderer: Renderer;
  modal: HTMLDialogElement;
  tab(): Tab;
  /** Redraws the skill tree's particles while the Upgrades page shows. */
  upgradesFrame(time: number): void;
  /** Redraws the Training tab's particles while the Research page shows. */
  researchFrame(time: number): void;
  /** Advances the Defend battle while its page shows. */
  defendFrame(time: number): void;
  update(): void;
  /** Once a second: completes research the clock has reached and ticks the
   * Archives' countdowns. */
  archivesTick(): void;
  /** Refreshes only the HP readouts, as a fight's strikes land. */
  vitals(): void;
  /** Moves on the purse's Gold and Silver while they count up. */
  purse(time: number): void;
  /** Keeps the tile highlight on its tile as the camera moves. */
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
/** Battery saver: while nothing moves, draw at most every this many ms. */
const IDLE_FRAME_MS = 30;
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
  private lastBoardDraw = -Infinity;

  constructor(private host: FrameLoopHost) {}

  start() {
    requestAnimationFrame(this.frame);
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
    requestAnimationFrame(this.frame);
    const { host } = this, tab = host.tab();
    if (!document.hidden) {
      if (tab === "upgrades") guard(() => host.upgradesFrame(time));
      if (tab === "research") guard(() => host.researchFrame(time));
      if (isBoard(tab)) {
        guard(() => this.boardFrame(time));
        guard(() => host.purse(time));
        guard(() => host.highlight());
      }
      if (tab === "defend" && !host.modal.open) guard(() => host.defendFrame(time));
    }
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
    const game = this.host.game;
    if (!this.batterySaverSkips(time)) {
      this.host.renderer.draw(time);
      this.lastBoardDraw = time;
    }
    if (game.encounter) this.playFight(time);
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
    const fight = this.host.game.encounter!;
    if (time < fight.start + fight.bout.duration) return this.host.vitals();
    this.host.game.finishEncounter();
    this.host.update();
  }

  /** Battery saver: while nothing on the board moves, skip every other frame. */
  private batterySaverSkips(time: number) {
    const { game, renderer } = this.host;
    return game.save.settings.batterySaver && time - this.lastBoardDraw < IDLE_FRAME_MS && renderer.isIdle(time);
  }

  /** A step may run: the interval since the last one has passed and the game is live. */
  private due(time: number, last: number, interval: number) {
    return this.canAct() && time - last > interval;
  }

  /** Steps only run while the game is live: not paused, finished, in a
   * fight still playing out, or behind a dialog. */
  private canAct() {
    const { game, modal } = this.host;
    return !game.paused && !game.fallen && !game.encounter && !modal.open;
  }
}

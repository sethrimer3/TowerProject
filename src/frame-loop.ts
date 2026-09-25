import { chooseStep } from "./automation.ts";
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
  /** Advances the Defend battle while its page shows. */
  defendFrame(time: number): void;
  update(): void;
  save(): void;
};

/** Walked routes advance one tile per this many ms. */
const ROUTE_STEP_MS = 130;
/** Battery saver: while nothing moves, draw at most every this many ms. */
const IDLE_FRAME_MS = 30;
const AUTOSAVE_MS = 10000;

/** The requestAnimationFrame loop: draws the visible page, walks queued
 * routes, runs Automove at its chosen speed, and autosaves. */
export class FrameLoop {
  private lastAuto = 0;
  private lastRoute = 0;
  private lastSave = 0;
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

  private frame = (time: number) => {
    const { host } = this, tab = host.tab();
    if (!document.hidden) {
      if (tab === "upgrades") host.upgradesFrame(time);
      if (isBoard(tab)) this.boardFrame(time);
      if (tab === "defend" && !host.modal.open) host.defendFrame(time);
    }
    if (time - this.lastSave > AUTOSAVE_MS) {
      host.save();
      this.lastSave = time;
    }
    requestAnimationFrame(this.frame);
  };

  private boardFrame(time: number) {
    const game = this.host.game;
    if (!this.batterySaverSkips(time)) {
      this.host.renderer.draw(time);
      this.lastBoardDraw = time;
    }
    if (game.route.length && this.due(time, this.lastRoute, ROUTE_STEP_MS)) {
      this.lastRoute = time;
      game.routeStep();
      this.host.update();
    }
    if (game.auto && this.due(time, this.lastAuto, 1000 / game.save.settings.speed)) {
      this.lastAuto = time;
      this.autoStep();
    }
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

  /** Steps only run while the game is live: not paused, finished, or behind a dialog. */
  private canAct() {
    const { game, modal } = this.host;
    return !game.paused && !game.summary && !modal.open;
  }

  private autoStep() {
    const game = this.host.game;
    const step = chooseStep(game);
    if (step) {
      game.move(step.dx, step.dy, false);
      game.message = step.label;
    } else game.message = "Waiting · no safe route. Explore or retire this ascent.";
    this.host.update();
  }
}

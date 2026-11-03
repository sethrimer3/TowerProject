import { ART, LoadingWall, WICK, paintSconce } from "./loading-wall.ts";
import { loadingRoom, paintRoom, type Room } from "./loading-room.ts";

/** The fewest milliseconds the whole room takes to build, so a cached load
 * still shows it come together smoothly. */
const MIN_BUILD_MS = 1800;
/** How long the finished room stays up before the game shows. */
const SETTLE_MS = 250;
/** Build time the room may reach before the game is ready: the last pieces
 * (the hero walking in) wait for it. */
const BEFORE_READY = 0.9;

/** The boot screen, from Tower Defense's: a stone wall lit by a torch, the
 * loading text, and under it a little tower room building itself as the
 * game loads. It owns its animation, independent of the game's frame loop,
 * and never consumes a game random stream or changes a player's save. */
export class LoadingScreen {
  private readonly wall: LoadingWall;
  private readonly torch: HTMLCanvasElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly room: Room;
  /** Build time shown, and the furthest the loading so far allows. */
  private shown = 0;
  private target = 0;
  private last = performance.now();
  private doneAt = 0;
  private frame = 0;
  private ready = false;
  private finish: (() => void) | null = null;

  constructor(private root: HTMLElement, private reduced: () => boolean, seed = Date.now()) {
    this.wall = new LoadingWall(root.querySelector<HTMLCanvasElement>(".loading-stones")!);
    this.torch = root.querySelector<HTMLCanvasElement>(".loading-torch")!;
    this.canvas = root.querySelector<HTMLCanvasElement>(".loading-room")!;
    this.room = loadingRoom(Math.imul(seed ^ (seed / 4294967296), 2654435761));
    this.draw();
  }

  /** How far the loading has come, in [0, 1]: the room builds no further. */
  progress(share: number) {
    this.target = Math.max(this.target, Math.min(1, share) * BEFORE_READY);
  }

  private draw = () => {
    const now = Date.now(), reduced = this.reduced();
    const base = this.root.getBoundingClientRect(), torch = this.torch.getBoundingClientRect();
    paintSconce(this.torch, now, reduced);
    // Match the actual wick, and light the stone's bevels.
    this.wall.draw(now, [{ x: torch.left - base.left + WICK.x * ART, y: torch.top - base.top + WICK.y * ART }], reduced);
    const time = performance.now();
    // Resume gently after synchronous initialization or a backgrounded tab.
    const dt = Math.min(50, time - this.last);
    this.last = time;
    const goal = this.ready ? 1 : this.target;
    // Follow the loading's progress, never faster than `MIN_BUILD_MS` allows.
    this.shown = reduced ? goal : Math.min(goal, this.shown + dt / MIN_BUILD_MS);
    paintRoom(this.canvas, this.room, this.shown);
    if (this.ready && this.shown >= 1) {
      this.doneAt ||= time;
      if (reduced || time - this.doneAt >= SETTLE_MS) {
        this.finish?.();
        return;
      }
    }
    this.frame = requestAnimationFrame(this.draw);
  };

  /** Finish the room once the game is ready, then uncover it. */
  complete(): Promise<void> {
    return new Promise(resolve => {
      this.finish = () => {
        cancelAnimationFrame(this.frame);
        resolve();
      };
      this.ready = true;
    });
  }

  /** Stops the animation, for a failed load. */
  stop() {
    cancelAnimationFrame(this.frame);
  }
}

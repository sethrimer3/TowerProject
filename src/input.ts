import type { Game } from "./state.ts";
import type { Renderer } from "./render/rendering.ts";
import { PinchTracker } from "./ui/cinematic.ts";

/** Cinematic mode as the board's input sees it: a pinch (or Ctrl and the
 * wheel) enters or leaves it, and while it shows a swipe never moves. */
export type PinchTarget = { readonly active: boolean; pinch(direction: "in" | "out"): void };

export function bindInput(
  game: Game,
  renderer: Renderer,
  onTap: (x: number, y: number) => void,
  changed: () => void,
  isTower: () => boolean,
  cinematic: PinchTarget,
) {
  const active = () => isTower() && !document.querySelector("dialog[open]");
  // Swipes and the keyboard step the hero only in Dev mode; otherwise the
  // forest is walked by taps, and the hand moves the hero inside a run.
  const manual = (dx: number, dy: number) => {
    if (!game.save.settings.devMode) return;
    game.stepManually(dx, dy);
    changed();
  };
  const dirs: Record<string, number[]> = {
    ArrowUp: [0, 1],
    w: [0, 1],
    ArrowDown: [0, -1],
    s: [0, -1],
    ArrowLeft: [-1, 0],
    a: [-1, 0],
    ArrowRight: [1, 0],
    d: [1, 0],
  };
  window.addEventListener("keydown", (e) => {
    if (
      !active() ||
      /INPUT|SELECT|BUTTON/.test((e.target as HTMLElement).tagName)
    )
      return;
    const d = dirs[e.key];
    if (d) {
      e.preventDefault();
      manual(d[0], d[1]);
    }
  });
  let gesture: { id: number; x: number; y: number } | null = null;
  const canvas = renderer.canvas, pinch = new PinchTracker();
  canvas.addEventListener("pointerdown", (e) => {
    if (!active()) return;
    e.preventDefault();
    pinch.down(e.pointerId, e.clientX, e.clientY);
    canvas.setPointerCapture(e.pointerId);
    // A second finger makes it a pinch: the first's tap or swipe is dropped.
    if (pinch.count > 1) gesture = null;
    else if (e.isPrimary) gesture = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener("pointermove", (e) => {
    const direction = pinch.move(e.pointerId, e.clientX, e.clientY);
    if (direction && active()) cinematic.pinch(direction);
  });
  canvas.addEventListener("pointerup", (e) => {
    pinch.up(e.pointerId);
    if (!gesture || gesture.id !== e.pointerId) return;
    const start = gesture;
    gesture = null;
    if (canvas.hasPointerCapture(e.pointerId))
      canvas.releasePointerCapture(e.pointerId);
    if (!active()) return;
    e.preventDefault();
    const dx = e.clientX - start.x,
      dy = e.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= 20) {
      if (cinematic.active) return;
      if (Math.abs(dx) > Math.abs(dy)) manual(Math.sign(dx), 0);
      else manual(0, -Math.sign(dy));
      return;
    }
    const r = canvas.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX >= r.right ||
      e.clientY < r.top ||
      e.clientY >= r.bottom
    )
      return;
    const tile = renderer.position(e.clientX, e.clientY);
    onTap(tile.x, tile.y);
    changed();
  });
  canvas.addEventListener("pointercancel", (e) => {
    pinch.up(e.pointerId);
    gesture = null;
  });
  // Ctrl and the wheel (a trackpad's pinch) stand in for two fingers.
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey || !active()) return;
      e.preventDefault();
      cinematic.pinch(e.deltaY > 0 ? "in" : "out");
    },
    { passive: false },
  );
}

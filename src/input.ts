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
  // A drag on the zoomed board pans it (render/dev-zoom.ts) instead of a tap or swipe.
  let gesture: { id: number; x: number; y: number; lastX: number; lastY: number; panned: boolean } | null = null;
  const canvas = renderer.canvas, pinch = new PinchTracker();
  // A pinch zooms the board about the fingers (render/dev-zoom.ts) instead
  // of entering Cinematic mode, which idling still enters.
  let zoomTo: ((scale: number, x: number, y: number) => void) | null = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (!active()) return;
    e.preventDefault();
    pinch.down(e.pointerId, e.clientX, e.clientY);
    canvas.setPointerCapture(e.pointerId);
    // A second finger makes it a pinch: the first's tap or swipe is dropped.
    if (pinch.count > 1) {
      gesture = null;
      const mid = pinch.midpoint;
      zoomTo = pinch.count === 2 && mid ? renderer.zoomPinch(mid.x, mid.y) : zoomTo;
    } else if (e.isPrimary) gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, panned: false };
  });
  canvas.addEventListener("pointermove", (e) => {
    const direction = pinch.move(e.pointerId, e.clientX, e.clientY);
    if (zoomTo) {
      const ratio = pinch.spreadRatio, mid = pinch.midpoint;
      if (ratio !== null && mid && active()) zoomTo(ratio, mid.x, mid.y);
      return;
    }
    if (gesture && gesture.id === e.pointerId && renderer.zoomed && active()) {
      if (!gesture.panned && Math.max(Math.abs(e.clientX - gesture.x), Math.abs(e.clientY - gesture.y)) >= 6) gesture.panned = true;
      if (gesture.panned) renderer.panBy(e.clientX - gesture.lastX, e.clientY - gesture.lastY);
      gesture.lastX = e.clientX;
      gesture.lastY = e.clientY;
    }
    if (direction && active()) cinematic.pinch(direction);
  });
  canvas.addEventListener("pointerup", (e) => {
    pinch.up(e.pointerId);
    if (pinch.count < 2) zoomTo = null;
    if (!gesture || gesture.id !== e.pointerId) return;
    const start = gesture;
    gesture = null;
    if (canvas.hasPointerCapture(e.pointerId))
      canvas.releasePointerCapture(e.pointerId);
    if (!active() || start.panned) return;
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
    if (pinch.count < 2) zoomTo = null;
    gesture = null;
  });
  // The wheel zooms the board a step a notch about the pointer, gathering a
  // trackpad's small turns (and its pinch, Ctrl and the wheel) into notches.
  let turned = 0;
  // In Battery saver Ctrl and the wheel (a trackpad's pinch) stand in for two fingers.
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (renderer.zoomable && active()) {
        e.preventDefault();
        const notch = e.ctrlKey ? 10 : 40;
        turned += e.deltaMode ? e.deltaY * 40 : e.deltaY;
        while (Math.abs(turned) >= notch) {
          renderer.zoomStep(turned < 0 ? 1 : -1, e.clientX, e.clientY);
          turned -= Math.sign(turned) * notch;
        }
        changed();
        return;
      }
      if (!e.ctrlKey || !active()) return;
      e.preventDefault();
      cinematic.pinch(e.deltaY > 0 ? "in" : "out");
    },
    { passive: false },
  );
}

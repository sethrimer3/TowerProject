import type { Game } from "./state.ts";
import type { Renderer } from "./rendering.ts";
export function bindInput(
  game: Game,
  renderer: Renderer,
  onTap: (x: number, y: number) => void,
  changed: () => void,
  isTower: () => boolean,
) {
  const active = () => isTower() && !document.querySelector("dialog[open]");
  const manual = (dx: number, dy: number) => {
    game.route = [];
    game.auto = false;
    game.move(dx, dy, true);
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
  const canvas = renderer.canvas;
  canvas.addEventListener("pointerdown", (e) => {
    if (!active() || !e.isPrimary) return;
    e.preventDefault();
    gesture = { id: e.pointerId, x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointerup", (e) => {
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
  canvas.addEventListener("pointercancel", () => (gesture = null));
  document.querySelectorAll<HTMLButtonElement>("[data-move]").forEach(
    (b) =>
      (b.onclick = () => {
        const [dx, dy] = b.dataset.move!.split(",").map(Number);
        manual(dx, dy);
      }),
  );
}

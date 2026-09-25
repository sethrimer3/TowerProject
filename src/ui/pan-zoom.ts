import { clamp } from "./dom.ts";

export type View = { x: number; y: number; scale: number };
export type PanZoomEvents = {
  /** A press and release that did not drag, on `target`. */
  tap(target: HTMLElement | null): void;
  /** A drag moved the view (fired on every move once dragging). */
  pan(): void;
  /** The mouse wheel zoomed the view. */
  zoom(): void;
};

const MIN_SCALE = 0.75, MAX_SCALE = 2.5, DRAG_SLOP = 4;

/** Drag-to-pan, pinch- and wheel-to-zoom for `map` inside `viewport`,
 * writing into `view` (which the caller keeps, so the view survives
 * re-renders). A content smaller than the viewport stays centred. */
export function bindPanZoom(viewport: HTMLElement, map: HTMLElement, view: View, on: PanZoomEvents) {
  const apply = () => {
    const width = viewport.clientWidth,
      height = viewport.clientHeight,
      scaledWidth = width * view.scale,
      scaledHeight = height * view.scale;
    view.x = scaledWidth <= width ? (width - scaledWidth) / 2 : clamp(view.x, width - scaledWidth, 0);
    view.y = scaledHeight <= height ? (height - scaledHeight) / 2 : clamp(view.y, height - scaledHeight, 0);
    map.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.scale})`;
  };
  const pointers = new Map<number, { x: number; y: number }>();
  let dragging = false, moved = false, downTarget: HTMLElement | null = null;
  let start = { x: 0, y: 0, viewX: 0, viewY: 0 }, pinchStartDist = 0, pinchStartScale = 1;
  const spread = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const pinch = () => {
    if (pinchStartDist <= 0) return;
    view.scale = clamp(pinchStartScale * (spread() / pinchStartDist), MIN_SCALE, MAX_SCALE);
    apply();
  };
  const drag = (e: PointerEvent) => {
    const dx = e.clientX - start.x,
      dy = e.clientY - start.y;
    if (Math.abs(dx) > DRAG_SLOP || Math.abs(dy) > DRAG_SLOP) moved = true;
    if (!moved) return;
    view.x = start.viewX + dx;
    view.y = start.viewY + dy;
    apply();
    on.pan();
  };
  viewport.onpointerdown = (e) => {
    viewport.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragging = true;
      moved = false;
      start = { x: e.clientX, y: e.clientY, viewX: view.x, viewY: view.y };
      downTarget = e.target as HTMLElement;
    } else if (pointers.size === 2) {
      dragging = false;
      pinchStartDist = spread();
      pinchStartScale = view.scale;
    }
  };
  viewport.onpointermove = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) pinch();
    else if (dragging) drag(e);
  };
  const end = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStartDist = 0;
    if (pointers.size > 0) return;
    const tapped = dragging && !moved;
    dragging = false;
    if (tapped) on.tap(downTarget);
  };
  viewport.onpointerup = end;
  viewport.onpointercancel = end;
  viewport.onwheel = (e) => {
    e.preventDefault();
    const rect = viewport.getBoundingClientRect(),
      cx = e.clientX - rect.left,
      cy = e.clientY - rect.top,
      prevScale = view.scale,
      newScale = clamp(prevScale * (e.deltaY < 0 ? 1.1 : 0.9), MIN_SCALE, MAX_SCALE);
    view.x = cx - (cx - view.x) * (newScale / prevScale);
    view.y = cy - (cy - view.y) * (newScale / prevScale);
    view.scale = newScale;
    apply();
    on.zoom();
  };
  apply();
}

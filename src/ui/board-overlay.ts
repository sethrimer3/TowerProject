import type { Game, RouteEffects } from "../state.ts";
import type { Renderer } from "../rendering.ts";
import { el } from "./dom.ts";
import { routeTotalLines, tileInfo, tileInfoLine } from "./tile-info.ts";

/** The board's tap feedback: a highlighted tile, its inspect box, and the
 * route totals box. A first tap on a tile previews it (and the route there);
 * tapping it again, or any tap with "Move with one tap" on, walks there. */
export class BoardOverlay {
  private highlighted: { x: number; y: number } | null = null;
  private fadeTimer: ReturnType<typeof setTimeout> | undefined;
  private inspectVisible = false;
  private routeVisible = false;
  private routeEffects: RouteEffects | null = null;

  constructor(private game: Game, private renderer: Renderer) {}

  tap(x: number, y: number) {
    if (this.game.save.settings.oneTapMove || this.isHighlighted({ x, y })) {
      this.hide();
      this.game.walkTo(x, y);
    } else this.preview(x, y);
  }

  /** Re-renders the open boxes after the board changed under them. */
  refresh() {
    if (!this.highlighted) return;
    if (this.inspectVisible) this.showInspect(this.highlighted.x, this.highlighted.y);
    if (this.routeVisible && this.routeEffects) this.showRoute(this.routeEffects);
  }

  /** Clears the highlight once the player reaches the highlighted tile. */
  clearIfAt(p: { x: number; y: number }) {
    if (this.isHighlighted(p)) this.hide();
  }

  /** The highlighted tile's info as one line, when the status row shows it. */
  statusLine(): string | null {
    if (!this.highlighted || !this.shows("status")) return null;
    return tileInfoLine(tileInfo(this.game, this.highlighted.x, this.highlighted.y));
  }

  /** Removes the highlight, both boxes and the route preview. */
  hide() {
    this.highlighted = null;
    this.renderer.previewRoute = null;
    this.hideInspect();
    this.hideRoute();
    this.routeEffects = null;
    const glow = el("tile-highlight");
    if (glow.hidden) return;
    glow.classList.remove("active");
    glow.classList.add("fade-out");
    clearTimeout(this.fadeTimer);
    this.fadeTimer = setTimeout(() => {
      glow.hidden = true;
      glow.classList.remove("fade-out");
    }, 300);
  }

  hideInspect() {
    el("inspect-box").hidden = true;
    this.inspectVisible = false;
  }

  /** Highlights the tile, shows its info and the route there, and draws
   * the route preview on the board. */
  private preview(x: number, y: number) {
    this.highlight(x, y);
    const popup = this.shows("popup");
    if (popup) this.showInspect(x, y);
    else this.hideInspect();
    const route = this.game.previewRoute(x, y);
    this.renderer.previewRoute = route?.length ? route.map((s) => ({ x: s.x, y: s.y })) : null;
    const effects = popup && route ? this.game.previewRouteEffects(route) : null;
    if (effects) this.showRoute(effects);
    else this.hideRoute();
    this.routeEffects = effects;
  }

  private isHighlighted(p: { x: number; y: number }) {
    return !!this.highlighted && this.highlighted.x === p.x && this.highlighted.y === p.y;
  }

  /** Whether the "Tile info display" setting includes the popup or the status line. */
  private shows(where: "popup" | "status") {
    const infoDisplay = this.game.save.settings.infoDisplay ?? "both";
    return infoDisplay === where || infoDisplay === "both";
  }

  /** Where tile (x, y) sits inside the board frame, in CSS pixels. */
  private tileRect(x: number, y: number) {
    const r = this.renderer,
      frameRect = el("board-frame").getBoundingClientRect(),
      canvasRect = r.canvas.getBoundingClientRect(),
      s = r.size;
    return {
      left: canvasRect.left - frameRect.left + (x - r.left) * s,
      top: canvasRect.top - frameRect.top + (r.density - 1 - (y - r.bottom)) * s,
      s,
      frameRect,
    };
  }

  private highlight(x: number, y: number) {
    this.highlighted = { x, y };
    const { left, top, s } = this.tileRect(x, y),
      glow = el("tile-highlight");
    clearTimeout(this.fadeTimer);
    glow.style.left = `${left}px`;
    glow.style.top = `${top}px`;
    glow.style.width = `${s}px`;
    glow.style.height = `${s}px`;
    glow.hidden = false;
    glow.classList.remove("fade-out");
    glow.classList.add("active");
  }

  /** Above the tile, or below it when there is no room above. */
  private showInspect(x: number, y: number) {
    const d = tileInfo(this.game, x, y),
      box = el("inspect-box");
    box.innerHTML = `<b style="color:${d.color}">${d.title}</b><div>${d.body}</div>`;
    box.hidden = false;
    this.inspectVisible = true;
    const { left: tileLeft, top: tileTop, s, frameRect } = this.tileRect(x, y),
      boxRect = box.getBoundingClientRect();
    let left = tileLeft + s / 2 - boxRect.width / 2;
    left = Math.max(4, Math.min(frameRect.width - boxRect.width - 4, left));
    let top = tileTop - boxRect.height - 8;
    if (top < 4) top = Math.min(frameRect.height - boxRect.height - 4, tileTop + s + 8);
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
  }

  /** Just below the inspect box, or above it when there is no room below. */
  private showRoute(effects: RouteEffects) {
    const lines = routeTotalLines(effects);
    const box = el("route-box");
    if (!lines.length) {
      box.hidden = true;
      this.routeVisible = false;
      return;
    }
    box.innerHTML = `<b>Route totals</b><div>${lines.join("<br>")}</div>`;
    box.hidden = false;
    this.routeVisible = true;
    const inspectBox = el("inspect-box"),
      frameRect = el("board-frame").getBoundingClientRect(),
      inspectTop = parseFloat(inspectBox.style.top) || 0,
      inspectLeft = parseFloat(inspectBox.style.left) || 0,
      inspectHeight = inspectBox.getBoundingClientRect().height,
      routeRect = box.getBoundingClientRect();
    const left = Math.max(4, Math.min(frameRect.width - routeRect.width - 4, inspectLeft));
    let top = inspectTop + inspectHeight + 6;
    if (top + routeRect.height > frameRect.height - 4) top = inspectTop - routeRect.height - 6;
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
  }

  private hideRoute() {
    el("route-box").hidden = true;
    this.routeVisible = false;
  }
}

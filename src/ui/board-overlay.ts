import { MODES } from "../modes.ts";
import type { Game, RouteEffects } from "../state.ts";
import type { Step } from "../pathfinding.ts";
import type { Renderer } from "../rendering.ts";
import { el } from "./dom.ts";
import { routeTotalLines, tileInfo, tileInfoLine } from "./tile-info.ts";

/** The board's tap feedback: a highlighted tile, its inspect box, and the
 * route totals box. A first tap on a tile previews it (and the route there);
 * tapping it again, or any tap with "Move with one tap" on, walks there. */
export class BoardOverlay {
  private highlighted: { x: number; y: number } | null = null;
  /** The board the highlighted tile is on (`boardKey`). */
  private highlightedOn = "";
  private fadeTimer: ReturnType<typeof setTimeout> | undefined;
  private inspectVisible = false;
  private routeVisible = false;
  private routeEffects: RouteEffects | null = null;
  /** The previewed route's tiles, to total again when the hero changes. */
  private route: Step[] | null = null;
  /** Where the highlight was last placed (`track`), and whether on screen. */
  private placed = "";

  /** `blacksmith` opens the Equipment screen (the forest's Blacksmith tapped). */
  constructor(private game: Game, private renderer: Renderer, private blacksmith: () => void = () => {}) {}

  tap(x: number, y: number) {
    // A Gem is collected wherever the hero stands.
    if (this.game.gemFinder.collectAt(x, y)) {
      this.hide();
      return;
    }
    if (this.game.atBlacksmith(x, y)) {
      this.hide();
      this.blacksmith();
      return;
    }
    if (this.game.save.settings.oneTapMove || this.isHighlighted({ x, y })) {
      this.hide();
      this.game.walkTo(x, y);
    } else this.preview(x, y);
  }

  /** Re-renders the open boxes after the board changed under them. With
   * `retrained` (a run training purchase, the hero standing where it was),
   * the route's totals are worked out again for the hero's new stats, as
   * the inspect box's forecast is. */
  refresh(retrained = false) {
    if (!this.highlighted) return;
    if (this.inspectVisible) this.showInspect(this.highlighted.x, this.highlighted.y);
    if (retrained && this.routeEffects && this.route) this.routeEffects = this.game.previewRouteEffects(this.route) ?? this.routeEffects;
    if (this.routeVisible && this.routeEffects) this.showRoute(this.routeEffects);
    this.placed = "";
    this.track();
  }

  /** Keeps the highlight and its boxes on the highlighted tile as the
   * camera moves (the Delve's follows the hero), hiding them while the
   * tile is off the board and showing them again once it is back. Run each
   * board frame; it does nothing while nothing moved. */
  track() {
    if (!this.highlighted) return;
    const { x, y } = this.highlighted, r = this.renderer, n = r.density;
    const onScreen = x + 0.5 >= r.left && x + 0.5 <= r.left + n && y + 0.5 >= r.bottom && y + 0.5 <= r.bottom + n;
    const { left, top, s } = this.tileRect(x, y);
    const key = `${onScreen}:${left.toFixed(1)}:${top.toFixed(1)}:${s}`;
    if (key === this.placed) return;
    this.placed = key;
    const visibility = onScreen ? "" : "hidden";
    const glow = el("tile-highlight");
    glow.style.visibility = visibility;
    el("inspect-box").style.visibility = visibility;
    el("route-box").style.visibility = visibility;
    if (!onScreen) return;
    this.placeGlow(left, top, s);
    if (this.inspectVisible) this.placeInspect(x, y);
    if (this.routeVisible) this.placeRoute();
  }

  /** Clears the highlight once the player reaches the highlighted tile, or
   * stands on another board (a new Tower floor, run or mode), where it
   * means nothing. */
  clearIfAt(p: { x: number; y: number }) {
    if (this.isHighlighted(p) || (this.highlighted && this.highlightedOn !== this.boardKey())) this.hide();
  }

  /** Names the board the hero stands on: the mode, the run, outside or in,
   * and the Tower floor. */
  private boardKey() {
    const { mode, run } = this.game;
    return `${mode}:${run.seed}:${run.outside ? "out" : mode === "tower" ? run.height : "in"}`;
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
    this.route = null;
    this.placed = "";
    const glow = el("tile-highlight");
    el("inspect-box").style.visibility = "";
    el("route-box").style.visibility = "";
    if (glow.hidden || glow.style.visibility === "hidden") {
      glow.style.visibility = "";
      glow.hidden = true;
      return;
    }
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

  /** Highlights the tile and shows its info; with Pathfinder, also the
   * route there, drawn on the board, and its totals. */
  private preview(x: number, y: number) {
    this.highlight(x, y);
    const popup = this.shows("popup");
    if (popup) this.showInspect(x, y);
    else this.hideInspect();
    const route = this.game.showsRoutes ? this.game.previewRoute(x, y) : null;
    this.renderer.previewRoute = route?.length ? route.map((s) => ({ x: s.x, y: s.y })) : null;
    const effects = popup && route ? this.game.previewRouteEffects(route) : null;
    if (effects) this.showRoute(effects);
    else this.hideRoute();
    this.routeEffects = effects;
    this.route = route?.length ? route : null;
    this.placed = "";
    this.track();
  }

  private isHighlighted(p: { x: number; y: number }) {
    return !!this.highlighted && this.highlighted.x === p.x && this.highlighted.y === p.y;
  }

  /** Whether the "Tile info display" setting includes the popup or the status line. */
  private shows(where: "popup" | "status") {
    const infoDisplay = this.game.save.settings.infoDisplay;
    return infoDisplay === where || infoDisplay === "both";
  }

  /** Where tile (x, y) sits inside the board frame, in CSS pixels. */
  /** Keeps the forest's sign (shown by the HUD) standing just above the
   * foot of the path, where walking swaps forests, its arrow pointing down
   * at it; run each board frame. */
  placeSign() {
    const sign = el("forest-sign");
    if (sign.hidden) return;
    // Its foot on the row above the path's last tile, clear of the status line.
    const { left, top, s } = this.tileRect(MODES[this.game.mode].entranceX, 1);
    const key = `${left.toFixed(1)}:${top.toFixed(1)}:${s}`;
    if (sign.dataset.placed === key) return;
    sign.dataset.placed = key;
    sign.style.left = `${left + s / 2}px`;
    sign.style.top = `${top}px`;
    sign.style.setProperty("--tile", `${s}px`);
  }

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
    this.highlightedOn = this.boardKey();
    const { left, top, s } = this.tileRect(x, y),
      glow = el("tile-highlight");
    clearTimeout(this.fadeTimer);
    this.placeGlow(left, top, s);
    glow.hidden = false;
    glow.classList.remove("fade-out");
    glow.classList.add("active");
  }

  private placeGlow(left: number, top: number, s: number) {
    const glow = el("tile-highlight");
    glow.style.left = `${left}px`;
    glow.style.top = `${top}px`;
    glow.style.width = `${s}px`;
    glow.style.height = `${s}px`;
  }

  private showInspect(x: number, y: number) {
    const d = tileInfo(this.game, x, y),
      box = el("inspect-box");
    box.innerHTML = `<b style="color:${d.color}">${d.title}</b><div>${d.body}</div>`;
    box.hidden = false;
    this.inspectVisible = true;
    this.placeInspect(x, y);
  }

  /** Above the tile, or below it when there is no room above. */
  private placeInspect(x: number, y: number) {
    const box = el("inspect-box");
    const { left: tileLeft, top: tileTop, s, frameRect } = this.tileRect(x, y),
      boxRect = box.getBoundingClientRect();
    let left = tileLeft + s / 2 - boxRect.width / 2;
    left = Math.max(4, Math.min(frameRect.width - boxRect.width - 4, left));
    let top = tileTop - boxRect.height - 8;
    if (top < 4) top = Math.min(frameRect.height - boxRect.height - 4, tileTop + s + 8);
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
  }

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
    this.placeRoute();
  }

  /** Just below the inspect box, or above it when there is no room below. */
  private placeRoute() {
    const box = el("route-box");
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

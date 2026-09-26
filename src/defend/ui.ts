/** The DEFEND page: a City tab (palette + board) and an Armory tab (buy
 * city elements, bombs and universal upgrades with main-game currency).
 *
 * Build phase: drag city elements from the palette onto gold-outlined
 * tiles; drag placed ones around, or back to the palette to pick them up.
 * Once the defense starts, the palette becomes the consumables palette and
 * waves roll in without stopping until the keep falls. */
import {
  BOMB_PRICE,
  BOMB_RADIUS,
  SPEED3_PRICE,
  PALETTE_ITEMS,
  STRUCTURES,
  UPGRADES,
  purchasePrice,
  upgradePrice,
  type PaletteItem,
  type Price,
} from "./catalog.ts";
import { CELLS_W, SUB, TILES_H, TILES_W } from "./grid.ts";
import { fitLayout, removeCityTile, removeStructure, type Layout } from "./layout.ts";
import { generateCity, type CityMap } from "./citygen.ts";
import { DefendSim } from "./sim.ts";
import { DefendRenderer } from "./render.ts";
import type { Overlay } from "./edit-overlay.ts";
import { paintIcon, type IconItem } from "./structure-art.ts";
import { BoardPointers, eventCell, type DragPointer, type DragSession } from "./board-pointers.ts";
import { dropGhost, legalLayouts, liftsCityTile, refusal, type Drag } from "./drag-rules.ts";
import { NIGHT_FADE_SECONDS, isBossWave, rollWeather, skyLabel, type Weather } from "./weather.ts";
import { available, buyBomb, buyItem, buySpeed3, buyUpgrade, canAfford, type DefendSave, type Wallet } from "./progress.ts";

export type DefendHost = {
  save(): DefendSave;
  wallet(): Wallet;
  setWallet(w: Wallet): void;
  persist(): void;
  reduceMotion(): boolean;
  devMode(): boolean;
};

const ITEM_NAMES: Record<PaletteItem, string> = {
  cityTile: "City tile",
  barracks: STRUCTURES.barracks.name,
  archerBarracks: STRUCTURES.archerBarracks.name,
  archerTower: STRUCTURES.archerTower.name,
  cannonTower: STRUCTURES.cannonTower.name,
  watchTower: STRUCTURES.watchTower.name,
};

const plural = (name: string) => (name.endsWith("s") ? name : `${name}s`);
/** Released off the board, or over the palette. */
const offBoard = (p: DragPointer) => !p.overBoard || p.overPalette;

export class DefendPage {
  private host: DefendHost;
  private root: HTMLElement;
  private tab: "city" | "armory" = "city";
  private phase: "build" | "sim" | "over" = "build";
  private map: CityMap | null = null;
  private mapLayout: Layout | null = null;
  private sim: DefendSim | null = null;
  private renderer: DefendRenderer | null = null;
  private pointers = new BoardPointers({
    renderer: () => this.renderer,
    pickUp: (e) => this.pickUp(e),
    drop: (session) => this.drop(session),
  });
  private lastTime = 0;
  private message = "";
  private messageT = 0;
  private newRecord = 0;
  private built = false;
  private weather: Weather | null = null;
  /** How far night has fallen (0–1); it follows boss waves. */
  private night = 0;
  /** Abandon needs a second click within a few seconds. */
  private abandonArmed = 0;
  private settingsOpen = false;

  constructor(root: HTMLElement, host: DefendHost) {
    this.root = root;
    this.host = host;
    window.addEventListener("resize", () => this.layoutBoard());
  }

  /** Called when the DEFEND tab is shown (or its data changed elsewhere). */
  show() {
    if (!this.built) this.build();
    this.renderChrome();
    this.relayout();
  }

  /** Called every animation frame while the tab is visible. */
  frame(time: number) {
    const dt = this.lastTime ? (time - this.lastTime) / 1000 : 0;
    this.lastTime = time;
    if (!this.built || this.tab !== "city") return;
    if (this.sim && this.phase === "sim") {
      this.sim.update(dt);
      this.handleEvents();
    }
    this.fadeNight(dt);
    if (this.messageT > 0) {
      this.messageT -= dt;
      if (this.messageT <= 0) this.setMessage("");
    }
    this.draw();
    if (this.phase === "sim") this.updateHud();
  }

  /** Developer aid: advance the running defense by `seconds` at once,
   * optionally forcing the weather. */
  fastForward(seconds: number, weather?: Weather) {
    if (!this.sim || this.phase !== "sim") return;
    if (weather) this.weather = weather;
    for (let t = 0; t < seconds && this.phase === "sim"; t += 0.25) {
      this.sim.update(0.25 / this.sim.speed);
      this.handleEvents();
      this.fadeNight(0.25);
    }
    this.draw();
    this.updateHud();
  }

  /** Night falls while a boss wave is being fought and lifts once it's won. */
  private fadeNight(dt: number) {
    const sim = this.sim;
    const fighting = !!sim && this.phase !== "build" && isBossWave(sim.wave) && (sim.spawnQueue.length > 0 || sim.enemies.length > 0 || this.phase === "over");
    const target = fighting ? 1 : 0;
    const step = dt / NIGHT_FADE_SECONDS;
    this.night = target > this.night ? Math.min(target, this.night + step) : Math.max(target, this.night - step);
  }

  /** Pause bookkeeping when the tab is hidden, so time doesn't jump. */
  pause() {
    this.lastTime = 0;
    this.pointers.end();
  }

  private get save() {
    return this.host.save();
  }

  // ── DOM ───────────────────────────────────────────────────────────────
  private build() {
    this.built = true;
    this.root.innerHTML = `
      <div class="defend-head">
        <div class="defend-left" id="defend-left"></div>
        <div class="defend-hud" id="defend-hud"></div>
        <button class="defend-cog" id="defend-cog" aria-label="Defend settings" aria-expanded="false">⚙</button>
        <div class="defend-settings" id="defend-settings" hidden></div>
      </div>
      <div class="defend-city" id="defend-city">
        <div class="defend-stage" id="defend-stage">
          <div class="defend-palette" id="defend-palette"></div>
          <div class="defend-board" id="defend-board"><canvas id="defend-canvas" aria-label="City defense board. Scroll or pinch to zoom, drag to pan."></canvas>
            <div class="defend-banner" id="defend-banner" hidden></div>
            <div class="defend-message" id="defend-message" aria-live="polite"></div></div>
        </div>
      </div>
      <div class="defend-armory" id="defend-armory" hidden></div>`;
    this.renderer = new DefendRenderer(this.root.querySelector("#defend-canvas")!);
    const canvas = this.renderer.canvas;
    canvas.addEventListener("pointerdown", (e) => this.pointers.down(e));
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.renderer!.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
      },
      { passive: false },
    );
    const cog = this.root.querySelector<HTMLButtonElement>("#defend-cog")!;
    cog.onclick = (e) => {
      e.stopPropagation();
      this.settingsOpen = !this.settingsOpen;
      this.renderSettings();
    };
    document.addEventListener("click", (e) => {
      if (this.settingsOpen && !(e.target as HTMLElement).closest?.("#defend-settings, #defend-cog")) {
        this.settingsOpen = false;
        this.renderSettings();
      }
    });
  }

  private renderChrome() {
    this.root.querySelector<HTMLElement>("#defend-city")!.hidden = this.tab !== "city";
    this.root.querySelector<HTMLElement>("#defend-armory")!.hidden = this.tab !== "armory";
    this.root.querySelector("#defend-stage")!.classList.toggle("palette-right", this.save.paletteSide === "right");
    this.renderControls();
    this.renderPalette();
    this.renderSettings();
    this.updateHud();
    if (this.tab === "armory") this.renderArmory();
  }

  /** The single row of controls on the left of the header. */
  private renderControls() {
    const el = this.root.querySelector<HTMLElement>("#defend-left")!;
    if (this.phase === "build") {
      el.innerHTML = `<button data-dtab="city" aria-pressed="${this.tab === "city"}">City</button>
        <button data-dtab="armory" aria-pressed="${this.tab === "armory"}">Armory</button>
        <button class="defend-go" id="defend-start">Start the defense</button>`;
      el.querySelectorAll<HTMLButtonElement>("[data-dtab]").forEach((b) => {
        b.onclick = () => {
          this.tab = b.dataset.dtab as "city" | "armory";
          this.renderChrome();
          this.relayout();
        };
      });
      el.querySelector<HTMLButtonElement>("#defend-start")!.onclick = () => {
        this.tab = "city";
        this.startRun();
        this.relayout();
      };
    } else if (this.phase === "sim") {
      const armed = performance.now() < this.abandonArmed;
      el.innerHTML = `<button id="defend-abandon" class="defend-danger ${armed ? "armed" : ""}">${armed ? "Confirm?" : "Abandon"}</button>
        <button id="defend-speed" title="Battle speed">${this.sim?.speed ?? 1}×</button>`;
      el.querySelector<HTMLButtonElement>("#defend-abandon")!.onclick = () => {
        if (performance.now() < this.abandonArmed) {
          this.abandonArmed = 0;
          this.endRun();
          return;
        }
        this.abandonArmed = performance.now() + 3000;
        this.renderControls();
        setTimeout(() => this.phase === "sim" && this.renderControls(), 3050);
      };
      el.querySelector<HTMLButtonElement>("#defend-speed")!.onclick = () => {
        if (!this.sim) return;
        const top = this.save.speed3 ? 3 : 2;
        this.sim.speed = this.sim.speed >= top ? 1 : this.sim.speed + 1;
        this.renderControls();
      };
    } else {
      el.innerHTML = `<button class="defend-go" id="defend-rebuild">Rebuild the city</button>`;
      el.querySelector<HTMLButtonElement>("#defend-rebuild")!.onclick = () => {
        this.phase = "build";
        this.sim = null;
        this.map = null;
        this.weather = null;
        this.night = 0;
        this.hideBanner();
        this.renderChrome();
      };
    }
  }

  /** DEFEND-only settings, behind the cog. */
  private renderSettings() {
    const el = this.root.querySelector<HTMLElement>("#defend-settings");
    const cog = this.root.querySelector<HTMLButtonElement>("#defend-cog");
    if (!el || !cog) return;
    el.hidden = !this.settingsOpen;
    cog.setAttribute("aria-expanded", String(this.settingsOpen));
    if (!this.settingsOpen) return;
    const side = this.save.paletteSide;
    el.innerHTML = `<small>DEFEND SETTINGS</small>
      <div class="defend-setting"><span>Palette side</span><span class="defend-seg">
        <button data-side="left" aria-pressed="${side === "left"}">Left</button><button data-side="right" aria-pressed="${side === "right"}">Right</button></span></div>
      <div class="defend-setting"><span>Board view</span><button id="defend-reset-view">Reset zoom</button></div>
      <p class="hint">Scroll or pinch to zoom; drag open ground to pan.</p>`;
    el.querySelectorAll<HTMLButtonElement>("[data-side]").forEach((b) => {
      b.onclick = () => {
        this.save.paletteSide = b.dataset.side as "left" | "right";
        this.host.persist();
        this.renderChrome();
      };
    });
    el.querySelector<HTMLButtonElement>("#defend-reset-view")!.onclick = () => this.renderer?.resetCam();
  }

  private renderPalette() {
    const el = this.root.querySelector<HTMLElement>("#defend-palette")!;
    const s = this.save;
    const entries: { id: string; name: string; count: number; icon: IconItem }[] =
      this.phase === "build"
        ? PALETTE_ITEMS.map((item) => ({ id: item, name: ITEM_NAMES[item], count: available(s, item), icon: item }))
        : [{ id: "bomb", name: "Bomb", count: s.bombs, icon: "bomb" }];
    el.innerHTML =
      `<small class="defend-palette-title">${this.phase === "build" ? "BUILD" : "ITEMS"}</small>` +
      entries
        .map(
          (e) =>
            `<button class="defend-item ${e.count ? "" : "empty"}" data-item="${e.id}" title="${e.name}" aria-label="${e.name}, ${e.count} left">
              <canvas width="48" height="48" data-icon="${e.icon}"></canvas><span>${e.name}</span><b>×${e.count}</b></button>`,
        )
        .join("");
    el.querySelectorAll<HTMLCanvasElement>("canvas[data-icon]").forEach((c) => paintIcon(c, c.dataset.icon as IconItem));
    el.querySelectorAll<HTMLButtonElement>("[data-item]").forEach((b) => {
      b.onpointerdown = (e) => this.pressPalette(b.dataset.item!, e);
    });
  }

  /** A press on palette entry `id` picks up one of it, if any are left. */
  private pressPalette(id: string, e: PointerEvent) {
    if (e.button !== 0) return;
    if (id === "bomb") return this.pressBomb(e);
    const item = id as PaletteItem;
    if (!available(this.save, item)) return this.setMessage(`No ${plural(ITEM_NAMES[item].toLowerCase())} left — buy more in the Armory.`);
    this.beginDrag({ from: "palette", item }, e);
  }

  private pressBomb(e: PointerEvent) {
    if (!this.save.bombs || this.phase !== "sim") return this.setMessage("No bombs left — buy more in the Armory.");
    this.beginDrag({ from: "bomb" }, e);
  }

  private updateHud() {
    const el = this.root.querySelector<HTMLElement>("#defend-hud");
    if (!el) return;
    const best = this.save.bestWave;
    if (this.phase === "build" || !this.sim) {
      const html = `<span>Best wave <b>${best}</b></span>`;
      if (el.innerHTML !== html) el.innerHTML = html;
      return;
    }
    const sim = this.sim;
    const hp = Math.max(0, sim.keepHp()),
      max = sim.keepMaxHp();
    const sky = this.weather ? skyLabel(this.weather, this.night) : "";
    // data-drop: the order pieces are left out when the row gets crowded.
    const html = `${sky ? `<span class="defend-sky" data-drop="1">${sky}</span>` : ""}<span>Wave <b>${sim.wave}</b></span><span class="defend-best" data-drop="2">Best <b>${best}</b></span><span class="defend-keep" title="Keep ${Math.ceil(hp)} / ${max}"><small data-drop="3">Keep</small><i><em style="width:${(hp / max) * 100}%"></em></i></span><span class="defend-foes"><small data-drop="4">Foes </small><b>${sim.enemies.length + sim.spawnQueue.length}</b></span>`;
    if (el.innerHTML !== html) {
      el.innerHTML = html;
      this.fitHud();
    }
  }

  /** Never clip the status row: when it doesn't fit, drop whole pieces
   * (weather, best, then labels) until it does. */
  private fitHud() {
    const el = this.root.querySelector<HTMLElement>("#defend-hud");
    if (!el) return;
    const pieces = Array.from(el.querySelectorAll<HTMLElement>("[data-drop]")).sort((a, b) => Number(a.dataset.drop) - Number(b.dataset.drop));
    for (const p of pieces) p.hidden = false;
    for (const p of pieces) {
      if (el.scrollWidth <= el.clientWidth + 1) break;
      p.hidden = true;
    }
  }

  private setMessage(text: string, seconds = 3) {
    this.message = text;
    this.messageT = text ? seconds : 0;
    const el = this.root.querySelector<HTMLElement>("#defend-message");
    if (el) el.textContent = text;
  }

  private showBanner(html: string) {
    const b = this.root.querySelector<HTMLElement>("#defend-banner")!;
    b.innerHTML = html;
    b.hidden = false;
  }
  private hideBanner() {
    const b = this.root.querySelector<HTMLElement>("#defend-banner");
    if (b) b.hidden = true;
  }

  /** Fit the board to the space left on screen: 9:13, as big as possible
   * without the page ever scrolling. */
  private layoutBoard() {
    if (!this.renderer) return;
    this.fitHud();
    if (this.tab === "armory") return this.layoutArmory();
    const stage = this.root.querySelector<HTMLElement>("#defend-stage")!;
    const palette = this.root.querySelector<HTMLElement>("#defend-palette")!;
    const boardEl = this.root.querySelector<HTMLElement>("#defend-board")!;
    if (!stage.offsetParent) return;
    const top = boardEl.getBoundingClientRect().top + window.scrollY;
    const availH = window.innerHeight - top - this.navHeight() - 16;
    // The palette never sets the page height: it's capped to the board and
    // scrolls on its own when it holds more than fits.
    palette.style.maxHeight = `${Math.max(60, availH)}px`;
    const availW = stage.clientWidth - palette.offsetWidth - 10;
    let width = Math.max(120, Math.floor(Math.min(availW, (availH * TILES_W) / TILES_H)));
    this.renderer.resize(width);
    palette.style.maxHeight = `${boardEl.offsetHeight}px`;
    // Whatever padding the page adds, shrink until nothing overflows.
    const over = document.documentElement.scrollHeight - window.innerHeight;
    if (over > 0) {
      width = Math.max(120, Math.floor(width - (over * TILES_W) / TILES_H) - 1);
      this.renderer.resize(width);
      palette.style.maxHeight = `${boardEl.offsetHeight}px`;
    }
    this.draw();
  }

  /** Lay out now, and again next frame once the new DOM has settled. */
  private relayout() {
    this.layoutBoard();
    requestAnimationFrame(() => this.layoutBoard());
  }

  /** The Armory list scrolls inside its own panel, so the page doesn't. */
  private layoutArmory() {
    const el = this.root.querySelector<HTMLElement>("#defend-armory")!;
    if (!el.offsetParent) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    el.style.maxHeight = `${Math.max(120, window.innerHeight - top - this.navHeight() - 16)}px`;
  }

  private navHeight() {
    return document.querySelector("nav")?.getBoundingClientRect().height ?? 80;
  }

  // ── Map & phases ──────────────────────────────────────────────────────
  private currentMap(): CityMap {
    const layout = this.save.layout;
    if (!this.map || this.mapLayout !== layout) {
      const fit = fitLayout(layout);
      if (!fit.ok) throw new Error(fit.reason);
      this.map = generateCity(fit, this.save.seed);
      this.mapLayout = layout;
    }
    return this.map;
  }

  private startRun() {
    // A fresh city every run; upgrades bought mid-run apply next time.
    this.map = null;
    const map = this.currentMap();
    this.sim = new DefendSim(map, { ...this.save.levels }, (Math.random() * 2 ** 31) | 0);
    this.phase = "sim";
    this.newRecord = 0;
    this.weather = rollWeather();
    this.night = 0;
    this.renderChrome();
    const sky = this.weather.rain ? "Rain rolls in. " : "";
    this.setMessage(`${sky}Here they come! Drag a bomb onto the field to thin the horde.`, 4);
  }

  private endRun() {
    if (!this.sim) return;
    this.phase = "over";
    const wave = this.sim.wave;
    const cleared = Math.max(0, wave - 1);
    this.showBanner(
      `<strong>The keep has fallen</strong><span>Fell during wave ${wave} · best ${this.save.bestWave}</span>${
        this.newRecord ? `<em>New record this run: wave ${this.newRecord}</em>` : cleared < this.save.bestWave ? `<em>Strengthen the city in the Armory and try again.</em>` : ""
      }`,
    );
    this.renderChrome();
  }

  private handleEvents() {
    const sim = this.sim!;
    for (const ev of sim.events.splice(0)) {
      if (ev.type === "waveCleared") {
        if (ev.wave > this.save.bestWave) {
          this.save.bestWave = ev.wave;
          this.newRecord = ev.wave;
          // Record rewards are not defined yet; this is where they will land.
          this.host.persist();
          this.setMessage(`New record — wave ${ev.wave} survived!`, 3);
        } else this.setMessage(`Wave ${ev.wave} cleared.`, 2);
      } else if (ev.type === "waveStart") {
        if (isBossWave(ev.wave)) this.setMessage(`Boss wave ${ev.wave}! Night falls as ${ev.wave > 10 ? `${ev.wave / 10} warlords approach` : "a warlord approaches"}…`, 4);
        else if (!this.message) this.setMessage(`Wave ${ev.wave}`, 1.5);
      } else if (ev.type === "lost") this.endRun();
    }
  }

  private draw() {
    if (!this.renderer || !this.renderer.canvas.width) return;
    const map = this.sim ? this.sim.map : this.currentMap();
    this.renderer.draw(map, this.sim, this.overlay(), {
      grid: this.phase === "build",
      weather: this.weather,
      night: this.night,
      now: performance.now(),
      reduceMotion: this.host.reduceMotion(),
    });
  }

  // ── Dragging ──────────────────────────────────────────────────────────
  private overlay(): Overlay | null {
    const s = this.pointers.session;
    if (!s || !s.moved) return null;
    if (s.drag.from === "bomb")
      return s.pointer.overBoard ? { legal: new Set(), hover: null, ghost: null, bomb: { x: s.pointer.cellX, y: s.pointer.cellY, r: BOMB_RADIUS } } : null;
    const legal = new Set(s.legal.keys());
    const hover = s.pointer.overBoard ? s.hover : null;
    let ghost: Overlay["ghost"] = null;
    if (hover && s.legal.has(hover)) ghost = dropGhost(s.drag, s.legal.get(hover)!, hover);
    // Show the full-board highlight only while over the board.
    return { legal, hover, ghost };
  }

  private beginDrag(d: Drag, e: PointerEvent) {
    this.pointers.begin(d, d.from === "bomb" ? new Map() : legalLayouts(d, this.save.layout), e);
  }

  /** Start dragging whatever buildable thing is under the pointer. Only the
   * build phase picks things up; in battle a press moves the view. */
  private pickUp(e: PointerEvent): boolean {
    if (this.phase !== "build") return false;
    const map = this.currentMap();
    const { cx, cy, inside } = eventCell(this.renderer!, e);
    if (!inside) return false;
    const drag = this.liftable(map, cx, cy);
    if (drag) this.beginDrag(drag, e);
    return !!drag;
  }

  /** What a press on cell (cx, cy) lifts: the keep, a structure, or an empty
   * city tile. */
  private liftable(map: CityMap, cx: number, cy: number): Drag | null {
    const owner = map.owner[cy * CELLS_W + cx];
    const b = owner >= 0 ? map.buildings[owner] : null;
    const layout = this.save.layout;
    if (b?.kind === "keep") return { from: "keep" };
    const s = b?.structureUid ? layout.structures.find((p) => p.uid === b.structureUid) : undefined;
    if (s) return { from: "structure", uid: s.uid, kind: s.kind };
    const tile = { tx: Math.floor(cx / SUB), ty: Math.floor(cy / SUB) };
    return liftsCityTile(layout, tile) ? { from: "cityTile", tile } : null;
  }

  /** A released drag: a bomb goes off where it lands; a city element takes
   * the legal tile under it, or goes back to the palette off the board. */
  private drop(session: DragSession) {
    if (session.drag.from === "bomb") this.dropBomb(session.pointer);
    else this.dropBuilding(session);
  }

  private dropBomb(at: DragPointer) {
    const s = this.save;
    if (!at.overBoard || !this.bombsLive()) return;
    this.sim!.dropBomb(at.cellX, at.cellY);
    s.bombs--;
    this.host.persist();
    this.renderPalette();
  }

  /** Whether a bomb can go off: in battle, with one left. */
  private bombsLive() {
    return !!this.sim && this.phase === "sim" && this.save.bombs > 0;
  }

  private dropBuilding({ drag: d, legal, moved, pointer, hover }: DragSession) {
    const s = this.save;
    const at = pointer.overBoard ? hover : null;
    const target = at ? legal.get(at) : undefined;
    if (target) {
      s.layout = target;
    } else if (offBoard(pointer)) {
      this.returnToPalette(d, moved);
    } else if (moved && hover) {
      this.setMessage(refusal(d, s.layout, hover));
    }
    if (s.layout !== this.mapLayout) this.host.persist();
    this.renderPalette();
  }

  /** Dropped off the board: pick the element back up into the palette. */
  private returnToPalette(d: Drag, moved: boolean) {
    const s = this.save;
    if (d.from === "structure") s.layout = removeStructure(s.layout, d.uid);
    else if (d.from === "cityTile") {
      const r = removeCityTile(s.layout, d.tile.tx, d.tile.ty);
      if (r) s.layout = r.layout;
    } else if (d.from === "keep" && moved) this.setMessage("The keep can be moved, but never removed.");
  }

  // ── Armory ────────────────────────────────────────────────────────────
  private renderArmory() {
    const el = this.root.querySelector<HTMLElement>("#defend-armory")!;
    const s = this.save;
    const w = this.host.wallet();
    const price = (p: Price) =>
      [`${p.gold} gold`, p.ironBar ? `${p.ironBar} iron` : "", p.steelBar ? `${p.steelBar} steel` : ""].filter(Boolean).join(" · ");
    const items = PALETTE_ITEMS.map((item) => {
      const p = purchasePrice(item, s.owned[item]);
      const desc = item === "cityTile" ? "Expands the city limits. New tiles must touch the city; the wall moves out to enclose them." : STRUCTURES[item].description;
      return `<article class="card defend-card"><canvas width="48" height="48" data-icon="${item}"></canvas><div><small>OWNED ${s.owned[item]} · IN PALETTE ${available(s, item)}</small><h3>${ITEM_NAMES[item]}</h3><p>${desc}</p></div>
        <button data-buy="${item}" ${canAfford(w, p) ? "" : "disabled"}>Buy · ${price(p)}</button></article>`;
    }).join("");
    const bomb = `<article class="card defend-card"><canvas width="48" height="48" data-icon="bomb"></canvas><div><small>OWNED ${s.bombs}</small><h3>Bomb</h3><p>Drag onto the battlefield mid-defense to blast everything within ${BOMB_RADIUS.toFixed(0)} cells — your own people too, until you buy Shaped charges.</p></div>
      <button data-buy-bomb ${canAfford(w, BOMB_PRICE) ? "" : "disabled"}>Buy · ${price(BOMB_PRICE)}</button></article>`;
    const speed = `<article class="card defend-card"><div><small>${s.speed3 ? "UNLOCKED" : "ONE-TIME UNLOCK"}</small><h3>War drums</h3><p>Adds 3× to the battle speed button.</p></div>
      <button data-buy-speed3 ${s.speed3 || !canAfford(w, SPEED3_PRICE) ? "disabled" : ""}>${s.speed3 ? "Owned" : `Buy · ${price(SPEED3_PRICE)}`}</button></article>`;
    const groups = [...new Set(UPGRADES.map((u) => u.group))];
    const upgrades = groups
      .map(
        (g) =>
          `<h4>${g}</h4>` +
          UPGRADES.filter((u) => u.group === g)
            .map((u) => {
              const lvl = s.levels[u.id];
              const maxed = lvl >= u.maxLevel;
              const p = u.price ? u.price(lvl) : upgradePrice(lvl);
              return `<article class="card defend-card defend-upgrade"><div><small>LEVEL ${lvl} / ${u.maxLevel}</small><h3>${u.name}</h3><p>${u.describe(lvl)}${maxed ? "" : ` → <b>${u.describe(lvl + 1)}</b>`}</p></div>
                <button data-upgrade="${u.id}" ${maxed || !canAfford(w, p) ? "disabled" : ""}>${maxed ? "Maxed" : `Upgrade · ${price(p)}`}</button></article>`;
            })
            .join(""),
      )
      .join("");
    const balance = (amount: number) => this.host.devMode() ? "∞" : amount;
    el.innerHTML = `<p class="hint defend-wallet">Spend what you earn in the tower. <b>${balance(w.gold)}</b> gold · <b>${balance(w.ironBar)}</b> iron bars · <b>${balance(w.steelBar)}</b> steel bars${this.phase === "sim" ? " · upgrades apply from the next defense" : ""}</p>
      <h3 class="defend-section">City elements</h3>${items}
      <h3 class="defend-section">Consumables</h3>${bomb}
      <h3 class="defend-section">Battle</h3>${speed}
      <h3 class="defend-section">Upgrades</h3><p class="hint">Upgrades apply to every building of that type.</p>${upgrades}`;
    el.querySelectorAll<HTMLCanvasElement>("canvas[data-icon]").forEach((c) => paintIcon(c, c.dataset.icon as IconItem));
    const commit = (ok: boolean) => {
      if (!ok) return;
      this.host.setWallet(w);
      this.host.persist();
      this.renderArmory();
    };
    el.querySelectorAll<HTMLButtonElement>("[data-buy]").forEach((b) => (b.onclick = () => commit(buyItem(s, w, b.dataset.buy as PaletteItem))));
    el.querySelector<HTMLButtonElement>("[data-buy-bomb]")!.onclick = () => commit(buyBomb(s, w));
    el.querySelector<HTMLButtonElement>("[data-buy-speed3]")!.onclick = () => commit(buySpeed3(s, w));
    el.querySelectorAll<HTMLButtonElement>("[data-upgrade]").forEach((b) => (b.onclick = () => commit(buyUpgrade(s, w, b.dataset.upgrade as (typeof UPGRADES)[number]["id"]))));
  }
}

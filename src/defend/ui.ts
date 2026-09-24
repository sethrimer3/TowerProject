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
  PALETTE_ITEMS,
  STRUCTURES,
  UPGRADES,
  purchasePrice,
  upgradePrice,
  type PaletteItem,
  type Price,
  type StructureKind,
} from "./catalog.ts";
import { CELLS_W, SUB, TILES_H, TILES_W, tileKey, type Rect, type TilePos } from "./grid.ts";
import {
  cityTileSet,
  fitLayout,
  moveCityTile,
  moveKeep,
  moveStructure,
  placeCityTile,
  placeStructure,
  removeCityTile,
  removeStructure,
  type Layout,
  type PlacedKind,
} from "./layout.ts";
import { generateCity, type CityMap } from "./citygen.ts";
import { DefendSim } from "./sim.ts";
import { DefendRenderer, paintIcon, type Overlay } from "./render.ts";
import { rollWeather, type Weather } from "./weather.ts";
import { available, buyBomb, buyItem, buyUpgrade, canAfford, type DefendSave, type Wallet } from "./progress.ts";

export type DefendHost = {
  save(): DefendSave;
  wallet(): Wallet;
  setWallet(w: Wallet): void;
  persist(): void;
  reduceMotion(): boolean;
};

type Drag =
  | { from: "palette"; item: PaletteItem }
  | { from: "structure"; uid: number; kind: PlacedKind }
  | { from: "cityTile"; tile: TilePos }
  | { from: "keep" }
  | { from: "bomb" };

const ITEM_NAMES: Record<PaletteItem, string> = {
  cityTile: "City tile",
  barracks: STRUCTURES.barracks.name,
  archerTower: STRUCTURES.archerTower.name,
  watchTower: STRUCTURES.watchTower.name,
};

const plural = (name: string) => (name.endsWith("s") ? name : `${name}s`);

export class DefendPage {
  private host: DefendHost;
  private root: HTMLElement;
  private tab: "city" | "armory" = "city";
  private phase: "build" | "sim" | "over" = "build";
  private map: CityMap | null = null;
  private mapLayout: Layout | null = null;
  private sim: DefendSim | null = null;
  private renderer: DefendRenderer | null = null;
  private drag: Drag | null = null;
  private dragMoved = false;
  private legal = new Map<string, Layout>();
  private hover: string | null = null;
  private pointer = { x: 0, y: 0, cellX: 0, cellY: 0, overBoard: false, overPalette: false };
  private ghostEl: HTMLCanvasElement | null = null;
  private lastTime = 0;
  private message = "";
  private messageT = 0;
  private newRecord = 0;
  private built = false;
  private weather: Weather | null = null;

  constructor(root: HTMLElement, host: DefendHost) {
    this.root = root;
    this.host = host;
    window.addEventListener("resize", () => this.layoutBoard());
    window.addEventListener("pointermove", (e) => this.onPointerMove(e));
    window.addEventListener("pointerup", (e) => this.onPointerUp(e));
    window.addEventListener("pointercancel", () => this.endDrag());
  }

  /** Called when the DEFEND tab is shown (or its data changed elsewhere). */
  show() {
    if (!this.built) this.build();
    this.renderChrome();
    requestAnimationFrame(() => this.layoutBoard());
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
    }
    this.draw();
    this.updateHud();
  }

  /** Pause bookkeeping when the tab is hidden, so time doesn't jump. */
  pause() {
    this.lastTime = 0;
    this.endDrag();
  }

  private get save() {
    return this.host.save();
  }

  // ── DOM ───────────────────────────────────────────────────────────────
  private build() {
    this.built = true;
    this.root.innerHTML = `
      <div class="defend-head">
        <div class="defend-tabs" role="tablist">
          <button data-dtab="city" role="tab">City</button>
          <button data-dtab="armory" role="tab">Armory</button>
        </div>
        <div class="defend-hud" id="defend-hud"></div>
      </div>
      <div class="defend-city" id="defend-city">
        <div class="defend-controls" id="defend-controls"></div>
        <div class="defend-stage" id="defend-stage">
          <div class="defend-palette" id="defend-palette"></div>
          <div class="defend-board" id="defend-board"><canvas id="defend-canvas" aria-label="City defense board"></canvas>
            <div class="defend-banner" id="defend-banner" hidden></div></div>
        </div>
        <div class="defend-message" id="defend-message" aria-live="polite"></div>
      </div>
      <div class="defend-armory" id="defend-armory" hidden></div>`;
    this.renderer = new DefendRenderer(this.root.querySelector("#defend-canvas")!);
    this.root.querySelectorAll<HTMLButtonElement>("[data-dtab]").forEach((b) => {
      b.onclick = () => {
        this.tab = b.dataset.dtab as "city" | "armory";
        this.renderChrome();
        requestAnimationFrame(() => this.layoutBoard());
      };
    });
    const canvas = this.renderer.canvas;
    canvas.addEventListener("pointerdown", (e) => this.onBoardPointerDown(e));
  }

  private renderChrome() {
    this.root.querySelectorAll<HTMLButtonElement>("[data-dtab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.dtab === this.tab)));
    this.root.querySelector<HTMLElement>("#defend-city")!.hidden = this.tab !== "city";
    this.root.querySelector<HTMLElement>("#defend-armory")!.hidden = this.tab !== "armory";
    this.root.querySelector("#defend-stage")!.classList.toggle("palette-right", this.save.paletteSide === "right");
    this.renderControls();
    this.renderPalette();
    this.updateHud();
    if (this.tab === "armory") this.renderArmory();
  }

  private renderControls() {
    const el = this.root.querySelector<HTMLElement>("#defend-controls")!;
    if (this.phase === "build") {
      el.innerHTML = `<button class="defend-go" id="defend-start">Start the defense</button>
        <button id="defend-swap" title="Move the palette to the other side">⇄ Palette</button>`;
      el.querySelector<HTMLButtonElement>("#defend-start")!.onclick = () => this.startRun();
    } else if (this.phase === "sim") {
      const speed = this.sim?.speed ?? 1;
      el.innerHTML = `${[1, 2, 3].map((s) => `<button data-speed="${s}" aria-pressed="${s === speed}">${s}×</button>`).join("")}
        <button id="defend-swap" title="Move the palette to the other side">⇄ Palette</button>
        <button id="defend-abandon" class="defend-danger">Abandon</button>`;
      el.querySelectorAll<HTMLButtonElement>("[data-speed]").forEach((b) => {
        b.onclick = () => {
          if (this.sim) this.sim.speed = Number(b.dataset.speed);
          this.renderControls();
        };
      });
      el.querySelector<HTMLButtonElement>("#defend-abandon")!.onclick = () => this.endRun();
    } else {
      el.innerHTML = `<button class="defend-go" id="defend-rebuild">Rebuild the city</button>`;
      el.querySelector<HTMLButtonElement>("#defend-rebuild")!.onclick = () => {
        this.phase = "build";
        this.sim = null;
        this.map = null;
        this.weather = null;
        this.hideBanner();
        this.renderChrome();
      };
    }
    const swap = el.querySelector<HTMLButtonElement>("#defend-swap");
    if (swap)
      swap.onclick = () => {
        this.save.paletteSide = this.save.paletteSide === "left" ? "right" : "left";
        this.host.persist();
        this.renderChrome();
      };
  }

  private renderPalette() {
    const el = this.root.querySelector<HTMLElement>("#defend-palette")!;
    const s = this.save;
    const entries: { id: string; name: string; count: number; icon: StructureKind | "cityTile" | "bomb" }[] =
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
        .join("") +
      (this.phase === "build" ? `<small class="defend-palette-hint">Drag here to pick up</small>` : "");
    el.querySelectorAll<HTMLCanvasElement>("canvas[data-icon]").forEach((c) => paintIcon(c, c.dataset.icon as StructureKind | "cityTile" | "bomb"));
    el.querySelectorAll<HTMLButtonElement>("[data-item]").forEach((b) => {
      b.onpointerdown = (e) => {
        const id = b.dataset.item!;
        if (e.button !== 0) return;
        if (id === "bomb") {
          if (!this.save.bombs || this.phase !== "sim") return this.setMessage("No bombs left — buy more in the Armory.");
          this.beginDrag({ from: "bomb" }, e);
        } else {
          const item = id as PaletteItem;
          if (!available(this.save, item)) return this.setMessage(`No ${plural(ITEM_NAMES[item].toLowerCase())} left — buy more in the Armory.`);
          this.beginDrag({ from: "palette", item }, e);
        }
      };
    });
  }

  private updateHud() {
    const el = this.root.querySelector<HTMLElement>("#defend-hud");
    if (!el) return;
    const best = this.save.bestWave;
    if (this.phase === "build" || !this.sim) {
      el.innerHTML = `<span>Best wave <b>${best}</b></span>`;
      return;
    }
    const sim = this.sim;
    const hp = Math.max(0, sim.keepHp()),
      max = sim.keepMaxHp();
    const sky = this.weather ? (this.weather.night ? (this.weather.rain ? "Storm" : "Night") : this.weather.rain ? "Rain" : "") : "";
    const html = `${sky ? `<span class="defend-sky">${sky}</span>` : ""}<span>Wave <b>${sim.wave}</b></span><span>Best <b>${best}</b></span>
      <span class="defend-keep">Keep <i><em style="width:${(hp / max) * 100}%"></em></i> <b>${Math.ceil(hp)}</b></span>
      <span>Foes <b>${sim.enemies.length + sim.spawnQueue.length}</b></span>`;
    if (el.innerHTML !== html) el.innerHTML = html;
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
   * without scrolling. */
  private layoutBoard() {
    if (!this.renderer || this.tab !== "city") return;
    const stage = this.root.querySelector<HTMLElement>("#defend-stage")!;
    const palette = this.root.querySelector<HTMLElement>("#defend-palette")!;
    const boardEl = this.root.querySelector<HTMLElement>("#defend-board")!;
    if (!stage.offsetParent) return;
    const top = boardEl.getBoundingClientRect().top;
    const nav = document.querySelector("nav")?.getBoundingClientRect().height ?? 80;
    const message = 26;
    const availH = window.innerHeight - top - nav - message - 12;
    const availW = stage.clientWidth - palette.offsetWidth - 10;
    const width = Math.max(120, Math.floor(Math.min(availW, (availH * TILES_W) / TILES_H)));
    this.renderer.resize(width);
    this.draw();
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
    this.renderChrome();
    const sky = this.weather.night && this.weather.rain ? "A stormy night falls. " : this.weather.night ? "Night falls over the city. " : this.weather.rain ? "Rain rolls in. " : "";
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
        if (!this.message) this.setMessage(`Wave ${ev.wave}`, 1.5);
      } else if (ev.type === "lost") this.endRun();
    }
  }

  private draw() {
    if (!this.renderer || !this.renderer.canvas.width) return;
    const map = this.sim ? this.sim.map : this.currentMap();
    this.renderer.draw(map, this.sim, this.overlay(), {
      grid: this.phase === "build",
      weather: this.weather,
      now: performance.now(),
      reduceMotion: this.host.reduceMotion(),
    });
  }

  // ── Dragging ──────────────────────────────────────────────────────────
  private overlay(): Overlay | null {
    if (!this.drag || !this.dragMoved) return null;
    if (this.drag.from === "bomb")
      return this.pointer.overBoard ? { legal: new Set(), hover: null, ghost: null, bomb: { x: this.pointer.cellX, y: this.pointer.cellY, r: BOMB_RADIUS } } : null;
    const legal = new Set(this.legal.keys());
    const hover = this.pointer.overBoard ? this.hover : null;
    let ghost: Overlay["ghost"] = null;
    if (hover && this.legal.has(hover)) ghost = this.ghostFor(this.legal.get(hover)!, hover);
    // Show the full-board highlight only while over the board.
    return { legal, hover, ghost };
  }

  private ghostFor(layout: Layout, key: string): Overlay["ghost"] {
    const d = this.drag!;
    const [tx, ty] = key.split(",").map(Number);
    if ((d.from === "palette" && d.item === "cityTile") || d.from === "cityTile")
      return { rect: { x: tx * SUB, y: ty * SUB, w: SUB, h: SUB }, kind: "cityTile" };
    const fit = fitLayout(layout);
    if (!fit.ok) return null;
    const uid = d.from === "structure" ? d.uid : d.from === "keep" ? 0 : layout.nextUid - 1;
    const f = fit.structures.find((s) => s.uid === uid);
    return f ? { rect: f.rect as Rect, kind: f.kind } : null;
  }

  private beginDrag(d: Drag, e: PointerEvent) {
    e.preventDefault();
    this.drag = d;
    this.dragMoved = false;
    this.legal = d.from === "bomb" ? new Map() : this.computeLegal(d);
    const icon =
      d.from === "bomb" ? "bomb"
      : d.from === "palette" ? d.item
      : d.from === "structure" ? d.kind
      : d.from === "keep" ? "keep"
      : "cityTile";
    const g = document.createElement("canvas");
    g.width = g.height = 48;
    g.className = "defend-drag-ghost";
    paintIcon(g, icon as StructureKind | "cityTile" | "bomb");
    document.body.appendChild(g);
    this.ghostEl = g;
    this.onPointerMove(e);
  }

  private computeLegal(d: Drag): Map<string, Layout> {
    const layout = this.save.layout;
    const out = new Map<string, Layout>();
    for (let ty = 0; ty < TILES_H; ty++)
      for (let tx = 0; tx < TILES_W; tx++) {
        let next: Layout | null = null;
        if (d.from === "palette") next = d.item === "cityTile" ? placeCityTile(layout, tx, ty) : placeStructure(layout, d.item, tx, ty);
        else if (d.from === "structure") next = moveStructure(layout, d.uid, tx, ty);
        else if (d.from === "cityTile") next = tx === d.tile.tx && ty === d.tile.ty ? layout : moveCityTile(layout, d.tile, { tx, ty });
        else if (d.from === "keep") next = tx === layout.keep.tx && ty === layout.keep.ty ? layout : moveKeep(layout, tx, ty);
        if (next) out.set(tileKey(tx, ty), next);
      }
    return out;
  }

  private onBoardPointerDown(e: PointerEvent) {
    if (e.button !== 0 || this.phase !== "build") return;
    const map = this.currentMap();
    const { cx, cy } = this.eventCell(e);
    const i = cy * CELLS_W + cx;
    const owner = map.owner[i];
    const b = owner >= 0 ? map.buildings[owner] : null;
    const layout = this.save.layout;
    if (b?.kind === "keep") return this.beginDrag({ from: "keep" }, e);
    if (b?.structureUid) {
      const s = layout.structures.find((p) => p.uid === b.structureUid);
      if (s) return this.beginDrag({ from: "structure", uid: s.uid, kind: s.kind }, e);
    }
    const tile = { tx: Math.floor(cx / SUB), ty: Math.floor(cy / SUB) };
    const key = tileKey(tile.tx, tile.ty);
    if (layout.cityTiles.includes(key)) {
      if (layout.structures.some((s) => s.tx === tile.tx && s.ty === tile.ty))
        return this.setMessage("Move the buildings off this tile before moving the tile itself.");
      if (!removeCityTile(layout, tile.tx, tile.ty)) return this.setMessage("That tile holds the city together — it can't be lifted.");
      return this.beginDrag({ from: "cityTile", tile }, e);
    }
  }

  private eventCell(e: PointerEvent) {
    const r = this.renderer!.canvas.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * CELLS_W;
    const fy = ((e.clientY - r.top) / r.height) * (TILES_H * SUB);
    return { cx: Math.max(0, Math.min(CELLS_W - 1, Math.floor(fx))), cy: Math.max(0, Math.min(TILES_H * SUB - 1, Math.floor(fy))), fx, fy, inside: fx >= 0 && fy >= 0 && fx < CELLS_W && fy < TILES_H * SUB };
  }

  private onPointerMove(e: PointerEvent) {
    if (!this.drag || !this.renderer) return;
    this.dragMoved = true;
    const c = this.eventCell(e);
    this.pointer = {
      x: e.clientX,
      y: e.clientY,
      cellX: c.fx,
      cellY: c.fy,
      overBoard: c.inside,
      overPalette: !!(document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest?.("#defend-palette"),
    };
    this.hover = c.inside ? tileKey(Math.floor(c.cx / SUB), Math.floor(c.cy / SUB)) : null;
    if (this.ghostEl) {
      this.ghostEl.style.left = `${e.clientX}px`;
      this.ghostEl.style.top = `${e.clientY}px`;
    }
  }

  private onPointerUp(e: PointerEvent) {
    if (!this.drag) return;
    this.onPointerMove(e);
    const d = this.drag;
    const s = this.save;
    if (d.from === "bomb") {
      if (this.pointer.overBoard && this.sim && this.phase === "sim" && s.bombs > 0) {
        this.sim.dropBomb(this.pointer.cellX, this.pointer.cellY);
        s.bombs--;
        this.host.persist();
        this.renderPalette();
      }
      return this.endDrag();
    }
    const target = this.pointer.overBoard && this.hover ? this.legal.get(this.hover) : undefined;
    if (target) {
      s.layout = target;
    } else if (!this.pointer.overBoard || this.pointer.overPalette) {
      // Dropped off the board: pick the element back up into the palette.
      if (d.from === "structure") s.layout = removeStructure(s.layout, d.uid);
      else if (d.from === "cityTile") {
        const r = removeCityTile(s.layout, d.tile.tx, d.tile.ty);
        if (r) s.layout = r.layout;
      } else if (d.from === "keep" && this.dragMoved) this.setMessage("The keep can be moved, but never removed.");
    } else if (this.dragMoved && this.hover) {
      const reason = this.illegalReason(d, this.hover);
      if (reason) this.setMessage(reason);
    }
    if (s.layout !== this.mapLayout) this.host.persist();
    this.endDrag();
    this.renderPalette();
  }

  private illegalReason(d: Drag, key: string): string {
    const [tx, ty] = key.split(",").map(Number);
    if (ty === 0) return "Nothing can be built on the top row — that's where the enemy gathers.";
    const inCity = cityTileSet(this.save.layout).has(key);
    if (d.from === "palette" && d.item === "cityTile") return inCity ? "That tile is already part of the city." : "City tiles must touch the city along an edge.";
    if (d.from === "keep") return "The keep can only move onto another city tile.";
    if (d.from === "cityTile") return "City tiles must touch the city along an edge.";
    const kind = d.from === "palette" ? d.item : d.from === "structure" ? d.kind : null;
    if (kind && kind !== "cityTile" && !inCity && !STRUCTURES[kind].outsideOk) return `The ${STRUCTURES[kind].name.toLowerCase()} must go inside the city limits.`;
    return "There isn't room for that there.";
  }

  private endDrag() {
    this.drag = null;
    this.dragMoved = false;
    this.legal = new Map();
    this.hover = null;
    this.ghostEl?.remove();
    this.ghostEl = null;
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
    const bomb = `<article class="card defend-card"><canvas width="48" height="48" data-icon="bomb"></canvas><div><small>OWNED ${s.bombs}</small><h3>Bomb</h3><p>Drag onto the battlefield mid-defense to blast every enemy within ${BOMB_RADIUS.toFixed(0)} cells.</p></div>
      <button data-buy-bomb ${canAfford(w, BOMB_PRICE) ? "" : "disabled"}>Buy · ${price(BOMB_PRICE)}</button></article>`;
    const groups = [...new Set(UPGRADES.map((u) => u.group))];
    const upgrades = groups
      .map(
        (g) =>
          `<h4>${g}</h4>` +
          UPGRADES.filter((u) => u.group === g)
            .map((u) => {
              const lvl = s.levels[u.id];
              const maxed = lvl >= u.maxLevel;
              const p = upgradePrice(lvl);
              return `<article class="card defend-card defend-upgrade"><div><small>LEVEL ${lvl} / ${u.maxLevel}</small><h3>${u.name}</h3><p>${u.describe(lvl)}${maxed ? "" : ` → <b>${u.describe(lvl + 1)}</b>`}</p></div>
                <button data-upgrade="${u.id}" ${maxed || !canAfford(w, p) ? "disabled" : ""}>${maxed ? "Maxed" : `Upgrade · ${price(p)}`}</button></article>`;
            })
            .join(""),
      )
      .join("");
    el.innerHTML = `<p class="hint defend-wallet">Spend what you earn in the tower. <b>${w.gold}</b> gold · <b>${w.ironBar}</b> iron bars · <b>${w.steelBar}</b> steel bars${this.phase === "sim" ? " · upgrades apply from the next defense" : ""}</p>
      <h3 class="defend-section">City elements</h3>${items}
      <h3 class="defend-section">Consumables</h3>${bomb}
      <h3 class="defend-section">Upgrades</h3><p class="hint">Upgrades apply to every building of that type.</p>${upgrades}`;
    el.querySelectorAll<HTMLCanvasElement>("canvas[data-icon]").forEach((c) => paintIcon(c, c.dataset.icon as StructureKind | "cityTile" | "bomb"));
    const commit = (ok: boolean) => {
      if (!ok) return;
      this.host.setWallet(w);
      this.host.persist();
      this.renderArmory();
    };
    el.querySelectorAll<HTMLButtonElement>("[data-buy]").forEach((b) => (b.onclick = () => commit(buyItem(s, w, b.dataset.buy as PaletteItem))));
    el.querySelector<HTMLButtonElement>("[data-buy-bomb]")!.onclick = () => commit(buyBomb(s, w));
    el.querySelectorAll<HTMLButtonElement>("[data-upgrade]").forEach((b) => (b.onclick = () => commit(buyUpgrade(s, w, b.dataset.upgrade as (typeof UPGRADES)[number]["id"]))));
  }
}

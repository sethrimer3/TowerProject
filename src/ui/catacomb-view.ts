// The Catacomb screen (docs/CATACOMBS.md, step 4): while open it owns the
// board, as a Proving Grounds trial does, so the Tower or Delve run behind it
// waits; the HUD shows the Magician; Switch Back returns to the run. The
// Catacombs' turns run on the wall clock whether it shows or not (`frame`).
import type { AppContext } from "./app.ts";
import { closeRunMenu } from "./run-menu.ts";
import { cellIcon, clockIcon, el, pointsIcon, spiritIcon, text, uiSprite } from "./dom.ts";
import { catacombOddsHtml } from "./catacomb-odds.ts";
import { CatacombMenus } from "./catacomb-menus.ts";
import { shortStat } from "./hud.ts";
import { CatacombBoard } from "../render/catacomb-board.ts";
import { CatacombPlayer, type CatacombStep } from "../catacombs/player.ts";
import { setHaste } from "../catacombs/clock.ts";
import { HASTES, type Haste } from "../catacombs/state.ts";
import { magician, magicLevel, mxpForLevel, pointsEarned, pointsSpent } from "../catacombs/magic.ts";
import { tapCrosshair, takePotion, type TapEvent } from "../catacombs/taps.ts";
import { pendingLesson, UNLOCK_NAMES, type TapUnlock } from "../catacombs/abilities.ts";
import { CORRIDOR_ROW, HALL_SIZE, SLOT_XS } from "../catacombs/hall.ts";
import { SPIRIT_RARITIES, UNDEAD, undeadStats, type SpiritRarity } from "../catacombs/catalog.ts";
import type { TurnEvent } from "../catacombs/turn.ts";
import { catacombTileInfo, plainTile } from "./catacomb-tile-info.ts";
import { tierNumeral } from "../tiers.ts";
import { shortAmount, whole } from "../whole.ts";
import { usesGameSprites } from "../sprites/style.ts";

/** The bank's seconds as the clock shows them: 45s, 12m 05s, 3h 12m. */
export function bankTime(seconds: number) {
  const s = Math.floor(seconds), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h.toLocaleString("en-US")}h ${String(m).padStart(2, "0")}m` : m ? `${m}m ${String(r).padStart(2, "0")}s` : `${r}s`;
}

/** What the status line says of a tap. */
export function tapLine(event: TapEvent, slotName: string) {
  if (event.kind === "potion") return `A potion: +${event.mhp.toLocaleString("en-US")} MHP.`;
  const what = event.gold ? "A gold crosshair" : "A crosshair";
  return event.killed ? `${what} banishes the ${slotName}.` : `${what} strikes the ${slotName}${event.crit ? ", critically" : ""}.`;
}

/** What the status line says of a turn. */
export function turnLine(event: TurnEvent | null, slotName: (slot: number) => string) {
  if (!event) return "The Magician gathers strength.";
  switch (event.kind) {
    case "dash": return "The Magician dashes on.";
    case "round": return event.killed ? `The ${slotName(event.slot)} is banished.`
      : event.heroHit === 0 ? `The ${slotName(event.slot)} shrugs off the spell.`
      : event.barrage ? "An Arcane Barrage strikes every undead." : event.crit ? `A critical spell strikes the ${slotName(event.slot)}.` : `The Magician strikes the ${slotName(event.slot)}.`;
    case "pickup": return event.target.kind === "lore" ? "Lore found." : `${event.target.ingot[0]!.toUpperCase()}${event.target.ingot.slice(1)} found.`;
    case "descend": return `Down to Hall ${event.hall.toLocaleString("en-US")}.`;
    case "fall": case "restart": return event.kind === "restart" && event.stalemate ? "Neither side can harm the other. Back to Hall 1." : "The Magician falls, and wakes at Hall 1.";
  }
}

/** The lesson each tap unlock teaches once Unlock Ability opens it, dismissed by a tap on its note. */
export const CATACOMB_LESSONS: Record<TapUnlock, string> = {
  potion: "Reveal health potions. Do yourself a favor: tap to collect them and restore your life.",
  zap: "Target random enemies with a lightning attack. Tap foes in the crosshairs to zap them!",
};

/** How long a tapped plain tile's box shows before it is gone (2 s, then
 * a second's fade: a run's `tile-info-fade`). */
const PLAIN_TILE_MS = 3000;
/** The line a restart flashes over the hall, and how long it shows (its fade
 * over the last half second is `catacomb-flash-fade` in `style.css`). */
const RESTART_LINE = "The hero rises and tries again...", RESTART_FLASH_MS = 2500;

/** The haste select's words for a haste. */
export const hasteLabel = (h: Haste) => (h === 0 ? "×0 (Pause)" : `×${h}`);

/** The six Spirits the HUD shows: Common to Mythic, or Uncommon to
 * Ancestral once any Ancestral Spirit is held. */
export function shownSpirits(spirit: Record<SpiritRarity, number>): SpiritRarity[] {
  return spirit.ancestral > 0 ? SPIRIT_RARITIES.slice(1) : SPIRIT_RARITIES.slice(0, 6);
}

/** The HUD's Spirit grid: each shown Spirit's icon and amount. */
export const spiritGridHtml = (spirit: Record<SpiritRarity, number>) => shownSpirits(spirit)
  .map((r) => `<span role="listitem" title="${r[0]!.toUpperCase()}${r.slice(1)} Spirit: ${Math.floor(spirit[r]).toLocaleString("en-US")}">${spiritIcon(r)}<b>${shortAmount(Math.floor(spirit[r]))}</b></span>`).join("");

export class CatacombView {
  private board = new CatacombBoard(el("world") as HTMLCanvasElement);
  private player = new CatacombPlayer();
  private last: TurnEvent | null = null;
  /** The tile whose box shows, kept up to date each turn; null for none. */
  private inspected: { x: number; y: number } | null = null;
  private plainTimer = 0;
  /** Hides the restart line once it has faded. */
  private flashTimer = 0;
  /** Stats, Spirit, Forge and Academy, under the board. A point moved shows at once and counts from the next turn. */
  private menus = new CatacombMenus(() => this.c, () => { this.decorate(); this.ctx.save(); });
  active = false;

  constructor(private ctx: AppContext, private hideOverlay: () => void) {
    // While open, the board's taps and the game's keys are the Catacomb's: none reach the run behind it.
    const canvas = el("world");
    for (const type of ["pointerdown", "pointerup", "click"] as const)
      canvas.addEventListener(type, (e) => {
        if (!this.active) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (type === "pointerdown") this.tap(e as PointerEvent);
      }, true);
    window.addEventListener("keydown", (e) => {
      if (!this.active || ctx.modal.open || (e.target as Element | null)?.closest?.("input,select,textarea")) return;
      e.stopImmediatePropagation();
      if (e.key === "Escape") this.close();
    }, true);
    document.addEventListener("click", (e) => {
      if (this.active && (e.target as Element | null)?.closest?.("#base-enemy")) { e.stopImmediatePropagation(); this.toggleOdds(); }
    }, true);
  }

  private get c() {
    return this.ctx.game.save.catacombs;
  }

  /** Opens the screen on the run under way. */
  open() {
    if (!this.c.run || this.active) return;
    closeRunMenu();
    this.hideOverlay();
    document.querySelector(".enemy-odds-layer")?.remove();
    this.build();
    this.active = true;
    this.board.reset();
    this.board.turn(this.c.run, null, performance.now(), this.ctx.game.save.settings.reduceMotion);
    document.documentElement.classList.add("catacombs");
    this.ctx.update();
  }

  /** Switch Back: the screen closes and the run behind it plays on. */
  close() {
    if (!this.active) return;
    this.active = false;
    this.hideInspect();
    clearTimeout(this.flashTimer);
    const flash = document.getElementById("catacomb-flash");
    if (flash) flash.hidden = true;
    document.querySelector(".catacomb-lesson")?.remove();
    // Nobody watches a paused Catacomb: it plays on, or spends the bank at its haste.
    this.unpause();
    document.documentElement.classList.remove("catacombs");
    document.querySelector(".catacomb-odds-layer")?.remove();
    this.menus.close();
    // The board's heading and the HUD are the run's again.
    delete el("board").dataset.heading;
    this.ctx.update();
  }

  /** Each frame, on every page: takes the turns due; while open, draws them
   * and refreshes the HUD. Returns whether it owns the board this frame. */
  frame(now: number) {
    // Paused when the app last closed: it plays on while not watched.
    if (!this.active && this.c.clock.haste === 0) this.unpause();
    const step = this.player.step(this.ctx.game.save, this.ctx.game.clock(), now);
    if (step && this.active) this.stepped(step, now);
    return this.active;
  }

  /** Plays a paused clock on at ×1. */
  private unpause() {
    if (this.c.clock.haste !== 0) return;
    setHaste(this.c.clock, 1);
    this.player.resetHaste();
    this.ctx.save();
  }

  /** Draws the hall (the frame loop's `boardFrame`). */
  draw(now: number) {
    const run = this.c.run;
    if (!this.active || !run) return false;
    const settings = this.ctx.game.save.settings;
    // A run's rows of the Settings: hit numbers, HP gains and enemy HP bars.
    this.board.settings(settings);
    this.board.draw(run, this.c.number, now, settings.reduceMotion, usesGameSprites(this.ctx.game.save), settings.enemyBars);
    return true;
  }

  /** A tap on the hall: a crosshair (on its undead, or the wall above or
   * below it) takes its free hit; a potion is drunk. No turn passes. The
   * tile's box shows what stands there, as a run's inspect box does (an
   * undead's for its crosshair's tap); a second tap on it puts it away. */
  private tap(e: PointerEvent) {
    const run = this.c.run, box = el("world").getBoundingClientRect();
    if (!run || !box.width || !box.height) return;
    const x = Math.floor(((e.clientX - box.left) / box.width) * HALL_SIZE), y = Math.floor(((e.clientY - box.top) / box.height) * HALL_SIZE);
    if (x < 0 || y < 0 || x >= HALL_SIZE || y >= HALL_SIZE) return;
    const slot = (SLOT_XS as readonly number[]).indexOf(x), onSlot = slot >= 0 && Math.abs(y - CORRIDOR_ROW) <= 1;
    const name = slot >= 0 ? UNDEAD[run.slots[slot]?.id ?? "wisp"].name : "";
    const event = onSlot ? tapCrosshair(this.c, slot) : takePotion(this.c, x, y);
    // A crosshair's undead, standing or just banished, is what the box shows.
    const at = onSlot && (event || run.slots[slot]) ? { x, y: CORRIDOR_ROW } : { x, y };
    if (event) {
      this.board.tapped(event, performance.now(), run.hero);
      if (event.kind === "potion" || event.killed) this.hideInspect();
      else {
        this.inspected = at;
        this.showInspect(true);
      }
      this.decorate();
      text("message", tapLine(event, name));
      this.ctx.save();
      return;
    }
    if (this.inspected && this.inspected.x === at.x && this.inspected.y === at.y) return this.hideInspect();
    this.inspected = at;
    this.showInspect(true);
  }

  /** Shows the inspected tile's box over it, or below it with no room above
   * (`place`), or, each turn, writes what it says now; a plain tile's fades
   * after a moment, as a run's does. */
  private showInspect(place = false) {
    const at = this.inspected, box = el("catacomb-inspect"), glow = el("catacomb-highlight");
    const info = at && catacombTileInfo(this.c, at.x, at.y);
    if (!at || !info) return this.hideInspect();
    // An undead banished, or a pickup taken, since the tap: nothing left to show.
    if (!place && plainTile(info) && !box.classList.contains("fading")) return this.hideInspect();
    const html = `<b style="color:${info.color}">${info.title}</b><div>${info.body}</div>`;
    if (box.innerHTML !== html) box.innerHTML = html;
    if (!place) return;
    box.hidden = glow.hidden = false;
    const frame = el("board-frame").getBoundingClientRect(), world = el("world").getBoundingClientRect(), s = world.width / HALL_SIZE;
    const left = world.left - frame.left + at.x * s, top = world.top - frame.top + at.y * s, size = box.getBoundingClientRect();
    Object.assign(glow.style, { left: `${left}px`, top: `${top}px`, width: `${s}px`, height: `${s}px` });
    let boxTop = top - size.height - 8;
    if (boxTop < 4) boxTop = Math.min(frame.height - size.height - 4, top + s + 8);
    box.style.left = `${Math.max(4, Math.min(frame.width - size.width - 4, left + s / 2 - size.width / 2))}px`;
    box.style.top = `${boxTop}px`;
    const plain = plainTile(info);
    for (const piece of [box, glow]) {
      piece.classList.remove("fading");
      void piece.offsetWidth;
      piece.classList.toggle("fading", plain);
    }
    clearTimeout(this.plainTimer);
    if (plain) this.plainTimer = window.setTimeout(() => this.hideInspect(), PLAIN_TILE_MS);
  }

  private hideInspect() {
    clearTimeout(this.plainTimer);
    this.inspected = null;
    const box = document.getElementById("catacomb-inspect"), glow = document.getElementById("catacomb-highlight");
    if (box) box.hidden = true;
    if (glow) glow.hidden = true;
  }

  private stepped(step: CatacombStep, now: number) {
    const turns = step.due.real + step.due.hasted;
    if (turns > 0) {
      this.last = step.last;
      this.board.turn(this.c.run!, step.last, now, this.ctx.game.save.settings.reduceMotion);
    }
    if (step.gains.restarts > 0) this.flashRestart();
    if (turns > 0 || step.due.banked > 0 || step.due.slowed) this.decorate();
  }

  /** A restart's line, flashed over the hall's upper part as a run flashes
   * its free levels: shown, then fading (`catacomb-flash` in `style.css`). */
  private flashRestart() {
    const box = document.getElementById("catacomb-flash") ?? el("board-frame").appendChild(Object.assign(document.createElement("div"), { id: "catacomb-flash", className: "catacomb-flash" }));
    box.setAttribute("role", "status");
    box.textContent = RESTART_LINE;
    box.hidden = false;
    // Replays the fade from the start when another restart comes before it ends.
    box.classList.remove("showing");
    void box.offsetWidth;
    box.classList.add("showing");
    clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => { box.hidden = true; }, RESTART_FLASH_MS);
  }

  /** The Catacomb's own pieces of the HUD, made once: Lore in the purse, the
   * magic skill points by the level, Switch Back, the bank. */
  private build() {
    this.menus.mount();
    this.menus.lore = () => this.ctx.game.save.cells;
    if (el("catacomb-bank")) return;
    document.querySelector(".purse")!.insertAdjacentHTML("beforeend",
      `<span class="catacomb-lore-stat catacomb-only" title="Lore Fragments: kept between climbs">${cellIcon()} <b id="catacomb-lore"></b></span>`);
    document.querySelector(".portrait-top")!.insertAdjacentHTML("beforeend", `<span id="magic-points" class="magic-points catacomb-only" title="Magic skill points to spend">${pointsIcon("points-icon magic-points-icon")}<b></b></span>`);
    // The Spirit held, in the Gold bonus's place: two columns of three.
    el("gold-bonus").insertAdjacentHTML("afterend", `<div id="catacomb-spirit" class="catacomb-spirit catacomb-only" role="list" aria-label="Spirit held"></div>`);
    el("run-shop").insertAdjacentHTML("beforebegin",
      `<button id="switch-back" class="mini-action switch-back catacomb-only" aria-label="Switch back to where you were" title="Switch Back"><span class="mini-icon">${uiSprite("arrow-left", "ui-sprite switch-back-icon")}</span><small>SWITCH BACK</small></button>`);
    el("switch-back").onclick = () => this.close();
    el("board-frame").insertAdjacentHTML("beforeend",
      `<div id="catacomb-highlight" class="tile-highlight active catacomb-only" hidden></div><div id="catacomb-inspect" class="inspect-box catacomb-inspect catacomb-only" hidden></div>` +
      `<div id="catacomb-bank" class="catacomb-bank catacomb-only" title="Banked seconds: each hasted turn spends one, and each paused second adds one">${clockIcon()}<b id="catacomb-bank-time"></b>` +
      `<select id="catacomb-haste" aria-label="Turns a second">${HASTES.map((h) => `<option value="${h}">${hasteLabel(h)}</option>`).join("")}</select></div>`);
    const haste = el("catacomb-haste") as HTMLSelectElement;
    haste.onchange = () => {
      setHaste(this.c.clock, Number(haste.value) as Haste);
      this.player.resetHaste();
      this.decorate();
      this.ctx.save();
    };
  }

  /** Puts the Magician on the HUD over what the run's renderers wrote (the
   * host calls it after each HUD refresh, and each turn). */
  decorate() {
    const run = this.c.run;
    if (!this.active || !run) return;
    const c = this.c, save = this.ctx.game.save, hero = magician(c), number = c.number;
    text("catacomb-lore", shortAmount(whole(save.cells)));
    // MHP, MAtk and MDef in the HP, ATK and DEF slots.
    text("hp", `${shortAmount(whole(run.hero.mhp))} / ${shortAmount(hero.mhp)}`);
    el("hp").parentElement!.title = `MHP: ${whole(run.hero.mhp).toLocaleString("en-US")} / ${hero.mhp.toLocaleString("en-US")}`;
    el("health").style.width = `${(100 * run.hero.mhp) / hero.mhp}%`;
    text("attack", shortAmount(hero.matk));
    el("attack").parentElement!.title = `MAtk: ${hero.matk.toLocaleString("en-US")}`;
    text("defense", shortAmount(hero.mdef));
    el("defense").parentElement!.title = `MDef: ${hero.mdef.toLocaleString("en-US")}`;
    // The Magic level, its MXP and the points to spend.
    const level = magicLevel(c.mxp), from = mxpForLevel(level), need = mxpForLevel(level + 1) - from, free = pointsEarned(c.mxp) - pointsSpent(c.points);
    text("hero-class", "MAGICIAN");
    text("level", String(level));
    el("xp-fill").style.width = `${(100 * (c.mxp - from)) / need}%`;
    el("xp").title = `${(c.mxp - from).toLocaleString("en-US")}/${need.toLocaleString("en-US")} MXP to Magic level ${level + 1}`;
    el("magic-points").querySelector("b")!.textContent = String(free);
    el("magic-points").hidden = free < 1;
    // The hall, as the floor is shown in a climb.
    text("height-tier", `CATACOMB ${tierNumeral(number)}`);
    text("height-label", "HALL");
    text("height", run.hall.toLocaleString("en-US"));
    el("height").parentElement!.title = `Deepest hall in Catacomb ${tierNumeral(number)}: ${(c.best[number] ?? run.hall).toLocaleString("en-US")}`;
    // The Spirit held in the Gold bonus's place (the Lore bonus is in the undead table), the Wisp here in the base enemy's.
    el("gold-bonus-divider").hidden = false;
    const spirit = spiritGridHtml(c.spirit);
    if (el("catacomb-spirit").innerHTML !== spirit) el("catacomb-spirit").innerHTML = spirit;
    const wisp = undeadStats("wisp", "normal", run.hall, number);
    el("base-enemy").hidden = el("base-enemy-divider").hidden = false;
    text("base-enemy-atk", shortStat(wisp.matk));
    text("base-enemy-def", shortStat(wisp.mdef));
    text("base-enemy-hp", shortStat(wisp.mhp));
    el("base-enemy").title = "A Wisp here: MAtk, MDef and MHP. Tap for every undead this hall can hold";
    // The board's heading and the status line.
    text("board-title", "THE CATACOMBS");
    text("board-subtitle", `CATACOMB ${tierNumeral(number)} · HALL ${run.hall.toLocaleString("en-US")}`);
    el("board").dataset.heading = "catacombs";
    text("message", c.clock.haste === 0 ? "Paused. Each second goes to the bank." : turnLine(this.last, (slot) => UNDEAD[run.slots[slot]?.id ?? "wisp"].name));
    // The bank and the haste, always there: pausing banks seconds even with none to spend.
    const haste = el("catacomb-haste") as HTMLSelectElement;
    text("catacomb-bank-time", bankTime(c.clock.bank));
    if (haste.value !== String(c.clock.haste)) haste.value = String(c.clock.haste);
    this.refreshOdds();
    this.showInspect();
    this.menus.render();
    this.showLesson();
  }

  /** The waiting tap unlock's lesson (`pendingLesson`), a run's board
   * lesson's note over the hall; a tap on it dismisses it for good. */
  private showLesson() {
    const lesson = pendingLesson(this.c), frame = el("board-frame");
    let note = frame.querySelector<HTMLElement>(".catacomb-lesson");
    if (note && note.dataset.lesson !== lesson) note.remove(), note = null;
    if (!lesson || note) return;
    frame.insertAdjacentHTML("beforeend", `<button type="button" class="board-tip dismissable catacomb-lesson" data-lesson="${lesson}">` +
      `<b>${UNLOCK_NAMES[lesson]} unlocked.</b><p>${CATACOMB_LESSONS[lesson]}</p><small>Tap to dismiss</small></button>`);
    frame.querySelector<HTMLElement>(".catacomb-lesson")!.onclick = () => {
      if (!this.c.taught.includes(lesson)) this.c.taught.push(lesson);
      this.ctx.save();
      this.showLesson();
    };
  }

  private toggleOdds() {
    const open = document.querySelector(".catacomb-odds-layer");
    if (open) return open.remove();
    const run = this.c.run;
    if (!run) return;
    const layer = document.createElement("div");
    layer.className = "enemy-odds-layer catacomb-odds-layer";
    layer.innerHTML = `<div class="enemy-odds-box catacomb-odds" role="dialog" aria-label="Undead in this hall" data-hall="${run.hall}">${catacombOddsHtml(run.hall, this.c.number)}</div>`;
    layer.onclick = (e) => {
      const target = e.target as Element;
      if (target === layer || target.closest(".enemy-odds-x")) layer.remove();
    };
    (document.querySelector("#app") ?? document.body).append(layer);
  }

  /** The open table follows the hero down to each new hall. */
  private refreshOdds() {
    const box = document.querySelector<HTMLElement>(".catacomb-odds"), run = this.c.run;
    if (!box || !run || box.dataset.hall === String(run.hall)) return;
    box.dataset.hall = String(run.hall);
    box.innerHTML = catacombOddsHtml(run.hall, this.c.number);
  }
}

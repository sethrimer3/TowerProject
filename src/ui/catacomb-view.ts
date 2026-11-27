// The Catacomb screen (docs/CATACOMBS.md, step 4): while open it owns the
// board, as a Proving Grounds trial does, so the Tower or Delve run behind it
// waits; the HUD shows the Magician; Switch Back returns to the run. The
// Catacombs' turns run on the wall clock whether it shows or not (`frame`).
import type { AppContext } from "./app.ts";
import { closeRunMenu } from "./run-menu.ts";
import { cellIcon, clockIcon, el, pointsIcon, text } from "./dom.ts";
import { catacombOddsHtml } from "./catacomb-odds.ts";
import { CatacombMenus } from "./catacomb-menus.ts";
import { shortStat } from "./hud.ts";
import { CatacombBoard } from "../render/catacomb-board.ts";
import { CatacombPlayer, type CatacombStep } from "../catacombs/player.ts";
import { setHaste } from "../catacombs/clock.ts";
import { HASTES, type Haste } from "../catacombs/state.ts";
import { heroStats, magicLevel, mxpForLevel, pointsEarned, pointsSpent } from "../catacombs/magic.ts";
import { loreBonus, UNDEAD, undeadStats } from "../catacombs/catalog.ts";
import type { TurnEvent } from "../catacombs/turn.ts";
import { tierNumeral } from "../tiers.ts";
import { shortAmount, whole } from "../whole.ts";
import { usesGameSprites } from "../sprites/style.ts";

/** The bank's seconds as the clock shows them: 45s, 12m 05s, 3h 12m. */
export function bankTime(seconds: number) {
  const s = Math.floor(seconds), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h.toLocaleString("en-US")}h ${String(m).padStart(2, "0")}m` : m ? `${m}m ${String(r).padStart(2, "0")}s` : `${r}s`;
}

/** What the status line says of a turn. */
export function turnLine(event: TurnEvent | null, slotName: (slot: number) => string) {
  if (!event) return "The Magician gathers strength.";
  switch (event.kind) {
    case "dash": return "The Magician dashes on.";
    case "round": return event.killed ? `The ${slotName(event.slot)} is banished.`
      : event.heroHit === 0 ? `The ${slotName(event.slot)} shrugs off the spell.` : `The Magician strikes the ${slotName(event.slot)}.`;
    case "pickup": return event.target.kind === "lore" ? "Lore found." : `${event.target.ingot[0]!.toUpperCase()}${event.target.ingot.slice(1)} found.`;
    case "descend": return `Down to Hall ${event.hall.toLocaleString("en-US")}.`;
    case "fall": case "restart": return event.kind === "restart" && event.stalemate ? "Neither side can harm the other. Back to Hall 1." : "The Magician falls, and wakes at Hall 1.";
  }
}

export class CatacombView {
  private board = new CatacombBoard(el("world") as HTMLCanvasElement);
  private player = new CatacombPlayer();
  private last: TurnEvent | null = null;
  /** Stats, Spirit, Forge and Academy, under the board. A point moved shows at once and counts from the next turn. */
  private menus = new CatacombMenus(() => this.c, () => { this.decorate(); this.ctx.save(); });
  active = false;

  constructor(private ctx: AppContext, private hideOverlay: () => void) {
    // While open, the board's taps and the game's keys are the Catacomb's: none reach the run behind it.
    const canvas = el("world");
    for (const type of ["pointerdown", "pointerup", "click"] as const)
      canvas.addEventListener(type, (e) => { if (this.active) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
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
    const step = this.player.step(this.ctx.game.save, this.ctx.game.clock(), now);
    if (step && this.active) this.stepped(step, now);
    return this.active;
  }

  /** Draws the hall (the frame loop's `boardFrame`). */
  draw(now: number) {
    const run = this.c.run;
    if (!this.active || !run) return false;
    this.board.draw(run, this.c.number, now, this.ctx.game.save.settings.reduceMotion, usesGameSprites(this.ctx.game.save));
    return true;
  }

  private stepped(step: CatacombStep, now: number) {
    const turns = step.due.real + step.due.hasted;
    if (turns > 0) {
      this.last = step.last;
      this.board.turn(this.c.run!, step.last, now, this.ctx.game.save.settings.reduceMotion);
    }
    if (turns > 0 || step.due.banked > 0 || step.due.slowed) this.decorate();
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
    el("gold-bonus").insertAdjacentHTML("afterbegin", `<span class="catacomb-only">${cellIcon()}</span>`);
    el("run-shop").insertAdjacentHTML("beforebegin",
      `<button id="switch-back" class="mini-action switch-back catacomb-only" aria-label="Switch back to where you were" title="Switch Back"><small>SWITCH BACK</small></button>`);
    el("switch-back").onclick = () => this.close();
    el("board-frame").insertAdjacentHTML("beforeend",
      `<div id="catacomb-bank" class="catacomb-bank catacomb-only" hidden title="Banked seconds: each hasted turn spends one">${clockIcon()}<b id="catacomb-bank-time"></b>` +
      `<select id="catacomb-haste" aria-label="Turns a second">${HASTES.map((h) => `<option value="${h}">×${h}</option>`).join("")}</select></div>`);
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
    const c = this.c, save = this.ctx.game.save, hero = heroStats(c.points), number = c.number;
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
    // The Lore bonus in the Gold bonus's place, the Wisp here in the base enemy's.
    el("gold-bonus").hidden = el("gold-bonus-divider").hidden = false;
    text("gold-bonus-val", `×${loreBonus(number)}`);
    el("gold-bonus").title = el("gold-bonus").ariaLabel = `Lore bonus: ×${loreBonus(number)}, Tower ${tierNumeral(number)}'s Gold bonus`;
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
    text("message", turnLine(this.last, (slot) => UNDEAD[run.slots[slot]?.id ?? "wisp"].name));
    // The bank, while it holds a second.
    const bank = el("catacomb-bank"), haste = el("catacomb-haste") as HTMLSelectElement;
    bank.hidden = c.clock.bank < 1 && c.clock.haste === 1;
    text("catacomb-bank-time", bankTime(c.clock.bank));
    if (haste.value !== String(c.clock.haste)) haste.value = String(c.clock.haste);
    this.refreshOdds();
    this.menus.render();
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

import {
  RESEARCH, RESEARCH_CATEGORIES, RESEARCH_IDS, RESEARCH_TARGETS, activeSlot, cannotSwitch, describe, duration, jobProgress, price as researchPrice,
  maxLevel, missing, nextArchivistPrice, nextLevel, research, researchCompleted, researchLevel, researched, status, withNextLevel,
  type ArchivesSave, type ArchivistSlot, type ResearchCategory, type ResearchId, type ResearchRequirement, type ResearchTarget,
} from "../archives.ts";
import { UPGRADES } from "../config.ts";
import type { Save } from "../save-shape.ts";
import { loadout } from "../loadout.ts";
import { unlockAt } from "../goals.ts";
import { tierNumeral } from "../tiers.ts";
import type { AppContext } from "./app.ts";
import { currencyAmount, priceAmount, shortAmount } from "./hud.ts";
import { cellIcon, el, gemCount, gemIcon, redoIcon, uiSprite } from "./dom.ts";
import { whole } from "../whole.ts";
import { RUSH_EFFICIENCY_TENTHS, rushEfficiencyText } from "../training-jobs.ts";
import { SPEED_UP_FACTORS, SPEED_UP_HOURS, jobAt, type SpeedUpFactor, type SpeedUpHours } from "../speed-ups.ts";
import { askForGems, helpButton, showHelp } from "./dialogs.ts";
import { startArchivesAmbient } from "./archives-ambient.ts";

/** `ms` as the largest two units: "2d 4h", "7h 41m", "12m 5s", "3s". */
export function formatDuration(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const parts: [number, string][] = [[Math.floor(s / 86400), "d"], [Math.floor(s / 3600) % 24, "h"], [Math.floor(s / 60) % 60, "m"], [s % 60, "s"]];
  const first = parts.findIndex(([n]) => n > 0);
  if (first < 0) return "0s";
  return parts.slice(first, first + 2).filter(([n]) => n > 0).map(([n, unit]) => `${n}${unit}`).join(" ");
}
/** `ms` to the second, every unit from the largest down: "2d 4h 0m 5s",
 * "7h 41m 12s", "3s"; an archivist's countdown. */
export function formatCountdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const parts: [number, string][] = [[Math.floor(s / 86400), "d"], [Math.floor(s / 3600) % 24, "h"], [Math.floor(s / 60) % 60, "m"], [s % 60, "s"]];
  const first = parts.findIndex(([n]) => n > 0);
  return parts.slice(first < 0 ? 3 : first).map(([n, unit]) => `${n}${unit}`).join(" ");
}
/** The real ms until `slot`'s countdown next shows another second at `now`:
 * sooner by its Speed Up's factor while that lasts; undefined when idle. */
export function nextCountdownIn(slot: ArchivistSlot, now: number) {
  const job = jobAt(slot, now);
  if (!job) return undefined;
  const factor = slot.speedUp && now < slot.speedUp.endsAt ? slot.speedUp.factor : 1;
  return toNextSecond(job.completesAt - now) / factor;
}
/** The time until a countdown with `left` ms to go falls past its next
 * whole second (a second once it is done), at the normal rate. */
export const toNextSecond = (left: number) => left > 0 ? left - (Math.ceil(left / 1000) - 1) * 1000 : 1000;
/** Countdowns move on at most this often (ms): ten times a second, a move
 * showing more than a second gone when time runs faster than that. */
export const COUNTDOWN_MIN_MS = 100;
/** A timestamp as local "YYYY-MM-DD HH:MM". */
const formatDate = (at: number) => {
  const d = new Date(at), two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
};
/** `target`'s total with the Archives as `archives`, as the game reads it:
 * Undo Count from the loadout's own undos, the rest from their base. */
const targetValue = (save: Save, target: ResearchTarget, archives: ArchivesSave) =>
  target === "undoCapacity" ? loadout({ ...save, archives }).undoCapacity : researched(archives, target);
const requirementText =(r: ResearchRequirement) =>
  "upgrade" in r ? UPGRADES.find((u) => u.id === r.upgrade)!.name
  : "anyUpgrade" in r ? r.anyUpgrade.map((id) => UPGRADES.find((u) => u.id === id)!.name).join(" or ")
  : "research" in r ? `${RESEARCH[r.research as ResearchId].name} level ${r.level}`
  : "goalUnlock" in r ? `Tower ${tierNumeral(unlockAt(r.goalUnlock).tower)}'s floor ${unlockAt(r.goalUnlock).floor} Goal`
  : `Hero level ${r.playerLevel}`;

/** A tab's rush efficiency at its heading's top-left corner: "+1.5% to
 * Rush" for each of its `maxed` items maxed, which take that much off the
 * Gems of `rushing`; nothing before any is. */
export function rushEfficiencyHtml(maxed: number, rushing: string) {
  if (maxed <= 0) return "";
  const title = `${maxed} maxed: the Gems for ${rushing} are divided by ${(1000 + RUSH_EFFICIENCY_TENTHS * maxed) / 1000}`;
  return `<span class="rush-efficiency" title="${title}">${rushEfficiencyText(maxed)}</span>`;
}

/** The Upgrades page's Archives tab: the archivists, one a row, each busy
 * one with what it is researching, and a History button opening the
 * research completed. Pressing an archivist opens Select Research for it:
 * the research it can start and the research completed, each in a gold box
 * (searchable, filtered by category, and once any is completed a Hide
 * Completed box hiding those), an X to go
 * back without choosing, and each Research button starting that research
 * and going back. For a busy archivist the list shows its research too,
 * and choosing another asks to switch to it. */
export class ArchivesPanel {
  private category: "all" | ResearchCategory = "all";
  private search = "";
  /** Whether Select Research leaves out the research completed. */
  private hideCompleted = false;
  /** The archivist Select Research is choosing for, or null on the
   * archivists' view. */
  private picking: number | null = null;
  /** What that archivist was researching when Select Research opened. */
  private pickedFrom: ResearchId | undefined;
  /** The Speed Up dialog's choice, kept between openings. */
  private speedUpChoice: { factor: SpeedUpFactor; hours: SpeedUpHours; queued: boolean } = { factor: 1.5, hours: 1, queued: false };

  constructor(private ctx: AppContext, private rerender: () => void) {}

  /** Back to the archivists, as when the tab is left. */
  reset() {
    this.picking = null;
  }

  html() {
    const save = this.ctx.game.save;
    // An archivist set to other work since (auto-continue, Dev mode) needs no choice.
    const job = this.picking === null ? undefined : save.archives.slots[this.picking]?.job;
    if (job && job.research !== this.pickedFrom) this.picking = null;
    // The currencies bar above shows the Gold research costs.
    if (this.picking !== null) return this.pickHtml(this.picking);
    return `<section class="archives"><canvas class="archives-ambient" aria-hidden="true"></canvas><header class="tree-heading">${rushEfficiencyHtml(researchCompleted(save), "rushing research")}<h3>Archives${helpButton("How the Archives work", "research-help")}</h3><div class="research-corner">${this.cellsHtml()}<button id="research-history-open" class="research-history-open">History</button></div></header>
      <div class="archivists" role="list" aria-label="Archivists">${this.archivistsHtml()}</div></section>`;
  }

  /** Select Research for archivist `slot`: the filters over the list, and
   * the X that goes back. */
  private pickHtml(slot: number) {
    const options = <T extends string>(entries: [T, string][], chosen: T) =>
      entries.map(([id, name]) => `<option value="${id}" ${id === chosen ? "selected" : ""}>${name}</option>`).join("");
    const categories: ["all" | ResearchCategory, string][] = [["all", "All categories"], ...Object.entries(RESEARCH_CATEGORIES) as [ResearchCategory, string][]];
    return `<section class="archives picking"><header class="tree-heading"><h3>Select Research</h3><small class="research-pick-for">ARCHIVIST ${slot + 1}</small><button id="research-pick-close" class="research-pick-close" aria-label="Back to the archivists without choosing" title="Back">✕</button></header>
      <div class="research-filters">
        <input type="search" id="research-search" placeholder="Search research" aria-label="Search research" value="${this.search.replace(/"/g, "&quot;")}">
        <select id="research-category" aria-label="Category">${options(categories, this.category)}</select>${this.anyCompleted() ? `<label class="research-hide-done"><input type="checkbox" id="research-hide-done" ${this.hideCompleted ? "checked" : ""}> Hide Completed</label>` : ""}
      </div>
      <div class="research-list" id="research-list" role="list" aria-label="Research">${this.listHtml()}</div></section>`;
  }

  bind() {
    const game = this.ctx.game;
    const act = (done: boolean) => {
      if (!done) return;
      this.ctx.update();
      this.rerender();
    };
    if (this.picking !== null) return this.bindPick();
    const ambient = document.querySelector<HTMLCanvasElement>(".archives-ambient");
    if (ambient) startArchivesAmbient(ambient, () => game.save.archives.slots.some((s) => s.job));
    el("research-help").onclick = () => this.showHelp();
    document.querySelectorAll<HTMLElement>("[data-pick]").forEach((a) => (a.onclick = (e) => {
      // The auto-continue box and a busy archivist's buttons keep their own presses.
      if ((e.target as Element).closest("label, input, [data-rush], [data-finish], [data-speed-up]")) return;
      this.picking = Number(a.dataset.pick);
      this.pickedFrom = game.save.archives.slots[this.picking]?.job?.research;
      this.rerender();
    }));
    document.querySelectorAll<HTMLButtonElement>("[data-hire]").forEach((b) => (b.onclick = () => this.hire(act)));
    document.querySelectorAll<HTMLButtonElement>("[data-finish]").forEach((b) => (b.onclick = () => act(game.research.finishNow(Number(b.dataset.finish)).length > 0)));
    document.querySelectorAll<HTMLButtonElement>("[data-rush]").forEach((b) => (b.onclick = () => {
      const slot = Number(b.dataset.rush);
      if (this.rushShort(slot)) return askForGems(this.ctx);
      act(game.research.rush(slot).length > 0);
    }));
    document.querySelectorAll<HTMLButtonElement>("[data-speed-up]").forEach((b) => (b.onclick = () => this.showSpeedUp(Number(b.dataset.speedUp))));
    document.querySelectorAll<HTMLInputElement>("[data-auto]").forEach((box) => (box.onchange = () => {
      game.research.setAutoContinue(Number(box.dataset.auto), box.checked);
      this.ctx.save();
    }));
    el("research-history-open").onclick = () => this.showHistory();
  }

  private bindPick() {
    el("research-pick-close").onclick = () => {
      this.picking = null;
      this.rerender();
    };
    el("research-search").oninput = (e) => {
      this.search = (e.target as HTMLInputElement).value;
      this.refreshList();
    };
    el("research-category").onchange = (e) => {
      this.category = (e.target as HTMLSelectElement).value as ResearchCategory;
      this.refreshList();
    };
    const hide = document.getElementById("research-hide-done") as HTMLInputElement | null;
    if (hide) hide.onchange = () => {
      this.hideCompleted = hide.checked;
      this.refreshList();
    };
    this.bindList();
  }

  /** Moves each busy archivist's bar, countdown and Speed Up on; a
   * completion, or a Speed Up begun or ended, redraws the tab. */
  tick(completed: boolean) {
    const slots = this.ctx.game.save.archives.slots;
    const speedUpChanged = slots.some((s, i) => !!(s.job && s.speedUp) !== !!document.querySelector(`[data-speed-left="${i}"]`));
    if (completed || speedUpChanged) return this.rerender();
    this.moveOn();
  }

  /** The real ms until an archivist's countdown next shows another second:
   * a second, or a Speed Up's share of one; the page moves them on then. */
  nextCountdownIn() {
    const now = this.ctx.game.clock();
    return Math.min(1000, ...this.ctx.game.save.archives.slots.map((s) => nextCountdownIn(s, now) ?? 1000));
  }

  /** Moves each busy archivist's bar, countdown and Speed Up on. */
  moveOn() {
    const slots = this.ctx.game.save.archives.slots, now = this.ctx.game.clock();
    slots.forEach((slot, i) => {
      const job = jobAt(slot, now), fill = document.querySelector<HTMLElement>(`[data-progress="${i}"]`);
      if (!job || !fill) return;
      fill.style.width = `${(jobProgress(job, now) * 100).toFixed(2)}%`;
      const left = document.querySelector(`[data-countdown="${i}"]`);
      if (left) left.textContent = formatCountdown(job.completesAt - now);
      const speed = document.querySelector(`[data-speed-left="${i}"]`);
      if (speed && slot.speedUp) speed.textContent = formatDuration(slot.speedUp.endsAt - now);
      const rush = document.querySelector<HTMLButtonElement>(`[data-rush="${i}"]`), gems = document.querySelector(`[data-rush-gems="${i}"]`);
      rush?.classList.toggle("short", this.rushShort(i));
      if (gems) gems.textContent = String(this.ctx.game.research.rushGems(i));
    });
  }

  private refreshList() {
    el("research-list").innerHTML = this.listHtml();
    this.bindList();
  }
  private bindList() {
    const game = this.ctx.game;
    const done = (ok: boolean) => {
      if (!ok) return;
      this.picking = null;
      this.ctx.update();
      this.rerender();
    };
    document.querySelectorAll<HTMLButtonElement>("[data-about]").forEach((b) => (b.onclick = () => this.showAbout(b.dataset.about as ResearchId)));
    document.querySelectorAll<HTMLButtonElement>("[data-research]").forEach((b) => (b.onclick = () => {
      const slot = this.picking, id = b.dataset.research as ResearchId;
      if (slot === null) return;
      const job = game.save.archives.slots[slot]?.job;
      if (!job) return done(game.research.start(slot, id));
      const from = RESEARCH[job.research].name, to = RESEARCH[id].name;
      this.ctx.confirm(
        { title: "Switch research?", body: `Archivist ${slot + 1} stops ${from} and starts ${to}. ${from}'s Gold comes back, and the time spent on it is kept for later.`, label: `Switch to ${to}`, cancel: "Cancel" },
        () => done(game.research.switchTo(slot, id)),
      );
    }));
  }

  /** Whether the Gems held fall short of rushing archivist `slot`'s research. */
  private rushShort(slot: number) {
    const game = this.ctx.game;
    return !game.free && game.save.gems < game.research.rushGems(slot);
  }
  /** The Rush button that completes archivist `slot`'s research at once,
   * for one Gem per ten minutes left, rounded up. */
  private rushHtml(slot: number) {
    const gems = this.ctx.game.research.rushGems(slot), short = this.rushShort(slot);
    return `<button class="archivist-rush${short ? " short" : ""}" data-rush="${slot}" aria-label="Rush: complete this research now for ${gemCount(gems)}" title="${short ? `Needs ${gemCount(gems)}` : `Complete now for ${gemCount(gems)}`}">Rush · ${gemIcon()} <b data-rush-gems="${slot}">${gems}</b></button>`;
  }

  /** Whether the Cells and Speed Ups show: once any Cells have been found. */
  private get cellsShown() {
    return this.ctx.game.save.profile.earned.cells > 0;
  }

  /** The Cells held, beside the History button, once any have been found. */
  private cellsHtml() {
    if (!this.cellsShown) return "";
    const cells = whole(this.ctx.game.save.cells);
    return `<span class="research-cells" title="Cells: ${cells.toLocaleString("en-US")}" aria-label="${cells.toLocaleString("en-US")} Cells">${cellIcon()}<b>${shortAmount(cells)}</b></span>`;
  }

  /** Archivist `slot`'s Speed Up in progress, its factor and time left in
   * green, then the button opening the Speed Up dialog (once any Cells
   * have been found). */
  private speedUpHtml(slot: number) {
    const s = this.ctx.game.save.archives.slots[slot]?.speedUp, now = this.ctx.game.clock();
    const active = s ? `<span class="archivist-speed" title="Speed Up in progress">${s.factor}x <span data-speed-left="${slot}">${formatDuration(s.endsAt - now)}</span></span>` : "";
    if (!this.cellsShown) return active;
    return `${active}<button class="archivist-speed-up" data-speed-up="${slot}" aria-label="Speed Up: use Cells to speed up this research" title="Use Cells to speed up research">Speed Up ${cellIcon()}</button>`;
  }

  /** The Speed Up dialog for archivist `slot`: how long and how fast, the
   * Cells held over what that costs, whether to buy it again as it ends,
   * and Speed Up. While one is in progress it shows that one, and only its
   * Queue box can change; queued, the options choose the Speed Up bought as
   * it ends, which Next Speed Up keeps (paid then). */
  private showSpeedUp(slot: number) {
    const game = this.ctx.game, modal = this.ctx.modal, a = game.save.archives;
    /** The next Speed Up being chosen while a queued one is in progress. */
    let next: { factor: SpeedUpFactor; hours: SpeedUpHours } | undefined;
    const draw = () => {
      const s = a.slots[slot], job = s?.job;
      if (!job) return modal.close();
      const active = s.speedUp, queuing = !!active?.queued, queuedNow = active?.next ?? active;
      if (!queuing) next = undefined;
      else next ??= { factor: queuedNow!.factor, hours: queuedNow!.hours };
      const choice = !active ? this.speedUpChoice : next ? { ...next, queued: true } : { factor: active.factor, hours: active.hours, queued: false };
      const cells = game.research.speedUpCells(choice.factor, choice.hours), held = whole(game.save.cells), short = !game.free && game.save.cells < cells;
      // Queued, the choice is already what is queued until another is picked.
      const unchanged = !!next && next.factor === queuedNow!.factor && next.hours === queuedNow!.hours;
      const option = (kind: "hours" | "factor", value: number, label: string) =>
        `<button class="speed-up-option${choice[kind] === value ? " chosen" : ""}" data-${kind}="${value}" aria-pressed="${choice[kind] === value}" ${active && !queuing ? "disabled" : ""}>${label}</button>`;
      const confirm = queuing
        ? `<button id="speed-up-confirm" ${unchanged ? "disabled" : ""} aria-label="Next Speed Up: ${choice.factor}x for ${choice.hours} hours, ${cells.toLocaleString("en-US")} Cells as this one ends">Next Speed Up · ${cellIcon()} <b>${shortAmount(cells, 1000)}</b></button>`
        : `<button id="speed-up-confirm" ${active || short ? "disabled" : ""} aria-label="Speed Up for ${cells.toLocaleString("en-US")} Cells">Speed Up · ${cellIcon()} <b>${shortAmount(cells, 1000)}</b></button>`;
      modal.innerHTML = `<div class="speed-up"><button id="speed-up-close" class="dialog-x" aria-label="Close" title="Close">✕</button>
        <h2>Speed Up</h2><p class="speed-up-what">${RESEARCH[job.research].name} · level ${job.level}</p><p>Use cells to speed up research</p>
        <div class="speed-up-options" role="group" aria-label="How long">${SPEED_UP_HOURS.map((h) => option("hours", h, `${h}h`)).join("")}</div>
        <div class="speed-up-options" role="group" aria-label="How fast">${SPEED_UP_FACTORS.map((f) => option("factor", f, `${f}x`)).join("")}</div>
        <p class="speed-up-choice">${queuing ? "Next: " : ""}${choice.factor}x ${choice.hours}h</p>
        <p class="speed-up-cells${short ? " short" : ""}" aria-label="${held.toLocaleString("en-US")} Cells held, ${cells.toLocaleString("en-US")} needed">${shortAmount(held, 1000)}/${shortAmount(cells, 1000)} ${cellIcon()}</p>
        <label class="speed-up-queue"><input type="checkbox" id="speed-up-queue" ${choice.queued ? "checked" : ""}> Queue Speed Up</label>
        <div class="dialog-actions"><button id="speed-up-close-button">Close</button>${confirm}</div>
        ${active ? `<p class="speed-up-busy">SPEED UP IN PROGRESS · ${active.factor}x ${active.hours}h</p>` : ""}</div>`;
      el("speed-up-close").onclick = el("speed-up-close-button").onclick = () => modal.close();
      modal.querySelectorAll<HTMLButtonElement>("[data-hours]").forEach((b) => (b.onclick = () => {
        const hours = Number(b.dataset.hours) as SpeedUpHours;
        if (next) next.hours = hours;
        else this.speedUpChoice.hours = hours;
        draw();
      }));
      modal.querySelectorAll<HTMLButtonElement>("[data-factor]").forEach((b) => (b.onclick = () => {
        const factor = Number(b.dataset.factor) as SpeedUpFactor;
        if (next) next.factor = factor;
        else this.speedUpChoice.factor = factor;
        draw();
      }));
      (el("speed-up-queue") as HTMLInputElement).onchange = (e) => {
        const on = (e.target as HTMLInputElement).checked;
        // In progress, the box changes that Speed Up; otherwise the choice.
        if (!active) this.speedUpChoice.queued = on;
        else {
          game.research.setSpeedUpQueued(slot, on);
          this.ctx.save();
          draw();
        }
      };
      el("speed-up-confirm").onclick = () => {
        if (next) {
          if (!game.research.queueNextSpeedUp(slot, next.factor, next.hours)) return;
          this.ctx.save();
          modal.close();
          return this.rerender();
        }
        if (!game.research.speedUp(slot, choice.factor, choice.hours, choice.queued)) return;
        modal.close();
        this.ctx.update();
        this.rerender();
      };
    };
    draw();
    modal.showModal();
  }

  /** Whether the Gems held fall short of the next archivist. */
  private hireShort() {
    const game = this.ctx.game, price = nextArchivistPrice(game.save.archives);
    return price !== undefined && !game.free && game.save.gems < price;
  }
  /** Asks before spending Gems on the next archivist, or offers the Shop
   * when too few are held. */
  private hire(act: (done: boolean) => void) {
    const game = this.ctx.game, price = nextArchivistPrice(game.save.archives);
    if (price === undefined) return;
    if (this.hireShort()) return askForGems(this.ctx);
    this.ctx.confirm(
      { title: "Hire an archivist?", body: `Spend ${gemIcon()} <b>${price}</b> on one more archivist: one more research runs at once.`, label: `Hire · ${gemIcon()} <b>${price}</b>`, cancel: "Cancel" },
      () => act(game.research.hire()),
    );
  }

  /** How the Archives work: the text the tab keeps off its rows. */
  private showHelp() {
    const p = (text: string) => `<p>${text}</p>`;
    showHelp(this.ctx, "UPGRADES", "Archives",
      p("Archivists research projects whose effects last between runs. Pick an idle archivist to choose its research; each level costs Gold and takes time.") +
      p("Research goes on while you play or are away. Each archivist works on one project at a time; Gems hire more.") +
      p(`Auto-continue (${redoIcon("redo-icon help-redo")}) starts the project's next level as soon as one completes, when the Gold is there. Research once begun can only be switched to another project, which gives its Gold back and keeps the time spent for later; Gems finish a level at once.`) +
      (this.cellsShown ? p(`Speed Up (${cellIcon("cell-icon help-cell")}) spends Cells, which Greater Bosses drop (more on later towers), to make an archivist research faster for a while; Queue buys it again as it ends, while the Cells are there.`) : "") +
      p("History lists every level completed."));
  }

  /** Project `id`'s description, kept off its row, and its level and what
   * its levels so far give. */
  private showAbout(id: ResearchId) {
    const save = this.ctx.game.save, a = save.archives, def = research(id), target = def.levels[0].effect.target;
    const now = `Level ${researchLevel(a, id)} / ${maxLevel(id, save.upgrades)} · ${RESEARCH_TARGETS[target].name}: ${RESEARCH_TARGETS[target].shown(targetValue(save, target, a))}`;
    showHelp(this.ctx, "ARCHIVES", def.name, `<p>${describe(a, id)}</p><p class="research-about-now">${now}</p>`);
  }

  /** Each hired archivist, busy (a bar, the time left) or idle, then
   * the next one to hire. */
  private archivistsHtml() {
    const game = this.ctx.game, a = game.save.archives, now = game.clock();
    const price = nextArchivistPrice(a);
    // The hired archivists, then the next one for hire, if any; none beyond it.
    return Array.from({ length: a.slots.length + (price === undefined ? 0 : 1) }, (_, i) => {
      const slot = a.slots[i], title = `<small>ARCHIVIST ${i + 1}</small>`;
      if (!slot)
        return `<article class="archivist hire" role="listitem">${title}<button class="archivist-hire${this.hireShort() ? " short" : ""}" data-hire aria-label="Hire an archivist for ${price} Gems" title="${this.hireShort() ? `Needs ${price} Gems` : "One more research runs at once"}">Hire · ${gemIcon()} <b>${price}</b></button></article>`;
      const auto = `<label class="archivist-auto" title="Auto-continue: start the project's next level as soon as one completes"><input type="checkbox" data-auto="${i}" ${slot.autoContinue ? "checked" : ""} aria-label="Auto-continue archivist ${i + 1}: start the project's next level as soon as one completes">${redoIcon()}</label>`;
      const job = slot.job;
      // An idle archivist's Speed Up waits for its next research.
      const paused = slot.speedUp ? `<span class="archivist-speed paused" title="Speed Up paused until this archivist researches again">${slot.speedUp.factor}x ${formatDuration(slot.speedUp.endsAt - slot.speedUp.appliedUntil)} · paused</span>` : "";
      if (!job) return `<article class="archivist idle" role="listitem" data-pick="${i}"><div class="archivist-head">${title}<div class="archivist-actions">${paused}${auto}</div></div><button class="archivist-pick" aria-label="Select research for archivist ${i + 1}">Idle · Select research</button></article>`;
      const def = RESEARCH[job.research], shown = jobAt(slot, now)!, done = jobProgress(shown, now);
      const finish = game.save.settings.devMode ? `<button data-finish="${i}">Finish now</button>` : "";
      return `<article class="archivist busy" role="listitem" data-pick="${i}" title="Select research: switch this archivist to other research"><div class="archivist-head"><div class="archivist-who">${title}<b>${def.name} · level ${job.level}</b></div><div class="archivist-actions">${auto}${this.rushHtml(i)}${finish}</div></div>
        <div class="research-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(done * 100)}"><i data-progress="${i}" style="width:${(done * 100).toFixed(2)}%"></i></div>
        <div class="archivist-line">${this.changeHtml(job.research)}<p class="archivist-time"><span data-countdown="${i}" title="Time left">${formatCountdown(shown.completesAt - now)}</span>${this.speedUpHtml(i)}</p></div></article>`;
    }).join("");
  }

  /** What the level being researched changes, as before → after, to sit
   * below its archivist's bar; nothing once the project is complete. */
  private changeHtml(id: ResearchId) {
    const save = this.ctx.game.save, a = save.archives, next = nextLevel(a, id, save.upgrades);
    if (!next) return "";
    const target = next.effect.target, shown = (archives: ArchivesSave) => RESEARCH_TARGETS[target].shown(targetValue(save, target, archives));
    return `<span class="archivist-change"><span class="training-box">${shown(a)}</span><span class="training-arrow" aria-hidden="true">→</span><span class="training-box next">${shown(withNextLevel(a, id))}</span></span>`;
  }

  /** Whether any project is at its most levels, shown in a gold box. */
  private anyCompleted() {
    const save = this.ctx.game.save;
    return RESEARCH_IDS.some((id) => status(save, id) === "completed");
  }

  /** Whether project `id` is listed: one an archivist can start, or one
   * completed unless Hide Completed is checked (Dev mode lists those still
   * locked too), in the chosen category and the search. */
  private matches(id: ResearchId) {
    const save = this.ctx.game.save, def = research(id), state = status(save, id), words = this.search.trim().toLowerCase();
    // A busy archivist's own research shows among the choices.
    const own = state === "active" && this.picking !== null && activeSlot(save.archives, id) === this.picking;
    return (state === "available" || own || (state === "completed" && !this.hideCompleted) || (state === "locked" && save.settings.devMode)) &&
      (this.category === "all" || def.categories.includes(this.category)) &&
      (!words || `${def.name} ${describe(save.archives, id)}`.toLowerCase().includes(words));
  }

  /** The listed projects grouped under a heading per category, each by its
   * first category, the groups in `RESEARCH_CATEGORIES` order. */
  private listHtml() {
    const ids = RESEARCH_IDS.filter((id) => this.matches(id));
    if (!ids.length) return `<p class="research-empty">No research matches.</p>`;
    return (Object.entries(RESEARCH_CATEGORIES) as [ResearchCategory, string][]).map(([category, name]) => {
      const group = ids.filter((id) => research(id).categories[0] === category);
      return group.length ? `<h4 class="research-group">${name}</h4>${group.map((id) => this.researchHtml(id)).join("")}` : "";
    }).join("");
  }

  /** One project, kept short so more fit in view: its name, the ? that
   * opens its description, and its level on one line, then what its next
   * level gives, and what it
   * takes beside the button to start it: with progress kept, only the time
   * left, in pale green. */
  private researchHtml(id: ResearchId) {
    const save = this.ctx.game.save, a = save.archives, def = research(id);
    const level = researchLevel(a, id), next = nextLevel(a, id, save.upgrades), state = status(save, id);
    let detail = "", price = "", action: string;
    if (next) {
      const ms = duration(a, next), share = a.progress[id] ?? 0;
      const target = next.effect.target, shown = (archives: ArchivesSave) => RESEARCH_TARGETS[target].shown(targetValue(save, target, archives));
      // The Research button shows the Gold; without it, the price does.
      const gold = state === "available" ? "" : `${uiSprite("gold", "stat-sprite")} ${priceAmount(researchPrice(a, next))} · `;
      detail = `<span class="research-target">${RESEARCH_TARGETS[target].name}:</span><span class="training-box">${shown(a)}</span><span class="training-arrow" aria-hidden="true">→</span><span class="training-box next">${shown(withNextLevel(a, id))}</span>`;
      const time = share
        ? `<span class="research-time kept" title="Progress kept: ${formatDuration(share * ms)} of ${formatDuration(ms)} done">${formatDuration((1 - share) * ms)}</span>`
        : formatDuration(ms);
      price = `<span class="research-price">${gold}${time}</span>`;
    }
    if (state === "active") action = `<span class="research-state">Researching</span>`;
    else if (state === "completed") action = `<span class="research-state">Complete</span>`;
    else if (state === "locked") action = `<span class="research-state">Requires ${missing(save, id).map(requirementText).join(" + ")}</span>`;
    else {
      const why = this.picking === null ? "Choose an archivist first." : cannotSwitch(save, this.picking, id);
      action = `<button data-research="${id}" aria-label="Research ${def.name} for ${currencyAmount(researchPrice(a, next!))} Gold" ${why ? `disabled title="${why}"` : ""}><span class="research-gold">${uiSprite("gold", "stat-sprite")} ${priceAmount(researchPrice(a, next!))}</span></button>`;
    }
    return `<article class="research ${state}" role="listitem"><div class="research-head"><b>${def.name}</b><button class="tree-help research-about" data-about="${id}" aria-label="About ${def.name}" title="About ${def.name}">?</button><small>LEVEL ${level} / ${maxLevel(id, save.upgrades)}</small></div>
      <div class="research-next">${detail}<span class="research-action">${price}${action}</span></div></article>`;
  }

  /** The research completed lately, newest first, in a scrolling dialog. */
  private showHistory() {
    const modal = this.ctx.modal;
    modal.innerHTML = `<small>ARCHIVES</small><h2>Research history</h2>${this.historyHtml()}<div class="dialog-actions"><button id="research-history-close">Close</button></div>`;
    el("research-history-close").onclick = () => modal.close();
    modal.showModal();
  }
  private historyHtml() {
    const history = this.ctx.game.save.archives.history;
    if (!history.length) return `<p class="research-empty">No research completed yet.</p>`;
    return `<ol class="research-history">${[...history].reverse().map((r) =>
      `<li><time>${formatDate(r.at)}</time> ${RESEARCH[r.research].name} level ${r.level}</li>`).join("")}</ol>`;
  }
}

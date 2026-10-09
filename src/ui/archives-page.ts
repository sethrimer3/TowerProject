import {
  RESEARCH, RESEARCH_CATEGORIES, RESEARCH_IDS, RESEARCH_TARGETS, activeSlot, cannotSwitch, duration, jobProgress, price as researchPrice,
  maxLevel, missing, nextArchivistPrice, nextLevel, research, researchLevel, researched, status, withNextLevel,
  type ArchivesSave, type ResearchCategory, type ResearchId, type ResearchRequirement, type ResearchTarget,
} from "../archives.ts";
import { UPGRADES } from "../config.ts";
import type { Save } from "../entities.ts";
import { loadout } from "../loadout.ts";
import { unlockAt } from "../goals.ts";
import { tierNumeral } from "../tiers.ts";
import type { AppContext } from "./app.ts";
import { currencyAmount } from "./hud.ts";
import { el, gemCount, gemIcon, uiSprite } from "./dom.ts";
import { askForGems, helpButton, showHelp } from "./dialogs.ts";

/** `ms` as the largest two units: "2d 4h", "7h 41m", "12m 5s", "3s". */
export function formatDuration(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const parts: [number, string][] = [[Math.floor(s / 86400), "d"], [Math.floor(s / 3600) % 24, "h"], [Math.floor(s / 60) % 60, "m"], [s % 60, "s"]];
  const first = parts.findIndex(([n]) => n > 0);
  if (first < 0) return "0s";
  return parts.slice(first, first + 2).filter(([n]) => n > 0).map(([n, unit]) => `${n}${unit}`).join(" ");
}
/** A timestamp as local "YYYY-MM-DD HH:MM". */
const formatDate = (at: number) => {
  const d = new Date(at), two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
};
/** `target`'s total with the Archives as `archives`, as the game reads it:
 * Undo Count from the loadout's own undos, the rest from their base. */
const targetValue = (save: Save, target: ResearchTarget, archives: ArchivesSave) =>
  target === "undoCapacity" ? loadout({ ...save, archives }).undoCapacity : researched(archives, target, RESEARCH_TARGETS[target].base);
const requirementText =(r: ResearchRequirement) =>
  "upgrade" in r ? UPGRADES.find((u) => u.id === r.upgrade)!.name
  : "anyUpgrade" in r ? r.anyUpgrade.map((id) => UPGRADES.find((u) => u.id === id)!.name).join(" or ")
  : "research" in r ? `${RESEARCH[r.research as ResearchId].name} level ${r.level}`
  : "goalUnlock" in r ? `Tower ${tierNumeral(unlockAt(r.goalUnlock).tower)}'s floor ${unlockAt(r.goalUnlock).floor} Goal`
  : `Hero level ${r.playerLevel}`;

/** The Upgrades page's Archives tab: the archivists, one a row, each busy
 * one with what it is researching, and a History button opening the
 * research completed. Pressing an archivist opens Select Research for it:
 * the research it can start (searchable, filtered by category), an X to go
 * back without choosing, and each Research button starting that research
 * and going back. For a busy archivist the list shows its research too,
 * and choosing another asks to switch to it. */
export class ArchivesPanel {
  private category: "all" | ResearchCategory = "all";
  private search = "";
  /** The archivist Select Research is choosing for, or null on the
   * archivists' view. */
  private picking: number | null = null;
  /** What that archivist was researching when Select Research opened. */
  private pickedFrom: ResearchId | undefined;

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
    return `<section class="archives"><header class="tree-heading"><h3>Archives${helpButton("How the Archives work", "research-help")}</h3><button id="research-history-open" class="research-history-open">History</button></header>
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
        <select id="research-category" aria-label="Category">${options(categories, this.category)}</select>
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
    el("research-help").onclick = () => this.showHelp();
    document.querySelectorAll<HTMLElement>("[data-pick]").forEach((a) => (a.onclick = (e) => {
      // The auto-continue box and a busy archivist's buttons keep their own presses.
      if ((e.target as Element).closest("label, input, [data-stop], [data-rush], [data-finish]")) return;
      this.picking = Number(a.dataset.pick);
      this.pickedFrom = game.save.archives.slots[this.picking]?.job?.research;
      this.rerender();
    }));
    document.querySelectorAll<HTMLButtonElement>("[data-hire]").forEach((b) => (b.onclick = () => this.hire(act)));
    document.querySelectorAll<HTMLButtonElement>("[data-stop]").forEach((b) => (b.onclick = () => act(game.research.cancel(Number(b.dataset.stop)))));
    document.querySelectorAll<HTMLButtonElement>("[data-finish]").forEach((b) => (b.onclick = () => act(game.research.finishNow(Number(b.dataset.finish)).length > 0)));
    document.querySelectorAll<HTMLButtonElement>("[data-rush]").forEach((b) => (b.onclick = () => {
      const slot = Number(b.dataset.rush);
      if (this.rushShort(slot)) return askForGems(this.ctx);
      act(game.research.rush(slot).length > 0);
    }));
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
    this.bindList();
  }

  /** Moves each busy archivist's bar and countdown on; a completion
   * redraws the tab. */
  tick(completed: boolean) {
    if (completed) return this.rerender();
    const now = this.ctx.game.clock();
    this.ctx.game.save.archives.slots.forEach((slot, i) => {
      const job = slot.job, fill = document.querySelector<HTMLElement>(`[data-progress="${i}"]`);
      if (!job || !fill) return;
      fill.style.width = `${(jobProgress(job, now) * 100).toFixed(2)}%`;
      const left = document.querySelector(`[data-countdown="${i}"]`);
      if (left) left.textContent = `${formatDuration(job.completesAt - now)} left`;
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
      { title: "Hire an archivist?", body: `Spend ${price} Gems on one more archivist: one more research runs at once.`, label: `Hire · ${price} Gems`, cancel: "Cancel" },
      () => act(game.research.hire()),
    );
  }

  /** How the Archives work: the text the tab keeps off its rows. */
  private showHelp() {
    const p = (text: string) => `<p>${text}</p>`;
    showHelp(this.ctx, "UPGRADES", "Archives",
      p("Archivists research projects whose effects last between runs. Pick an idle archivist to choose its research; each level costs Gold and takes time.") +
      p("Research goes on while you play or are away. Each archivist works on one project at a time; Gems hire more.") +
      p("Auto-continue starts the project's next level as soon as one completes, when the Gold is there. Stop gives the Gold back and keeps the time spent for later; Gems finish a level at once.") +
      p("History lists every level completed."));
  }

  /** Each hired archivist, busy (a bar, the time left, Stop) or idle, then
   * the next one to hire. */
  private archivistsHtml() {
    const game = this.ctx.game, a = game.save.archives, now = game.clock();
    const price = nextArchivistPrice(a);
    // The hired archivists, then the next one for hire, if any; none beyond it.
    return Array.from({ length: a.slots.length + (price === undefined ? 0 : 1) }, (_, i) => {
      const slot = a.slots[i], title = `<small>ARCHIVIST ${i + 1}</small>`;
      if (!slot)
        return `<article class="archivist hire" role="listitem">${title}<button class="archivist-hire${this.hireShort() ? " short" : ""}" data-hire aria-label="Hire an archivist for ${price} Gems" title="${this.hireShort() ? `Needs ${price} Gems` : "One more research runs at once"}">Hire · ${gemIcon()} <b>${price}</b></button></article>`;
      const auto = `<label class="archivist-auto"><input type="checkbox" data-auto="${i}" ${slot.autoContinue ? "checked" : ""}> Auto-continue</label>`;
      const job = slot.job;
      if (!job) return `<article class="archivist idle" role="listitem" data-pick="${i}">${title}<button class="archivist-pick" aria-label="Select research for archivist ${i + 1}">Idle · Select research</button>${auto}</article>`;
      const def = RESEARCH[job.research], done = jobProgress(job, now);
      const finish = game.save.settings.devMode ? `<button data-finish="${i}">Finish now</button>` : "";
      return `<article class="archivist busy" role="listitem" data-pick="${i}" title="Select research: switch this archivist to other research">${title}<b>${def.name} · level ${job.level}</b>
        <div class="research-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(done * 100)}"><i data-progress="${i}" style="width:${(done * 100).toFixed(2)}%"></i></div>
        <p><span data-countdown="${i}">${formatDuration(job.completesAt - now)} left</span></p>
        <div class="archivist-actions">${auto}<button data-stop="${i}" title="Stop: the Gold comes back, and the time spent is kept for later">Stop</button>${this.rushHtml(i)}${finish}</div></article>`;
    }).join("");
  }

  /** Whether project `id` is listed: one an archivist can start (Dev mode
   * lists those still locked too), in the chosen category and the search. */
  private matches(id: ResearchId) {
    const save = this.ctx.game.save, def = research(id), state = status(save, id), words = this.search.trim().toLowerCase();
    // A busy archivist's own research shows among the choices.
    const own = state === "active" && this.picking !== null && activeSlot(save.archives, id) === this.picking;
    return (state === "available" || own || (state === "locked" && save.settings.devMode)) &&
      (this.category === "all" || def.categories.includes(this.category)) &&
      (!words || `${def.name} ${def.description}`.toLowerCase().includes(words));
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

  /** One project, kept short so more fit in view: its name and level on
   * one line, its description, then what its next level gives, and what it
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
      const gold = state === "available" ? "" : `${uiSprite("gold", "stat-sprite")} ${currencyAmount(researchPrice(a, next))} · `;
      detail = `<span class="research-target">${RESEARCH_TARGETS[target].name}:</span><span class="training-box">${shown(a)}</span><span class="training-arrow" aria-hidden="true">→</span><span class="training-box next">${shown(withNextLevel(a, id))}</span>`;
      const time = share
        ? `<span class="research-time kept" title="Progress kept: ${formatDuration(share * ms)} of ${formatDuration(ms)} done">${formatDuration((1 - share) * ms)}</span>`
        : formatDuration(ms);
      price = `<span class="research-price">${gold}${time}</span>`;
    }
    if (state === "active") action = `<span class="research-state">Researching</span>`;
    else if (state === "locked") action = `<span class="research-state">Requires ${missing(save, id).map(requirementText).join(" + ")}</span>`;
    else {
      const why = this.picking === null ? "Choose an archivist first." : cannotSwitch(save, this.picking, id);
      action = `<button data-research="${id}" ${why ? `disabled title="${why}"` : ""}>Research · ${uiSprite("gold", "stat-sprite")} ${currencyAmount(researchPrice(a, next!))}</button>`;
    }
    return `<article class="research ${state}" role="listitem"><div class="research-head"><b>${def.name}</b><small>LEVEL ${level} / ${maxLevel(id, save.upgrades)}</small></div>
      <p>${def.description}</p><div class="research-next">${detail}<span class="research-action">${price}${action}</span></div></article>`;
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

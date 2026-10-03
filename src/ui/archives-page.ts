import {
  ARCHIVISTS, RESEARCH, RESEARCH_CATEGORIES, RESEARCH_IDS, RESEARCH_TARGETS, activeSlot, cannotStart, duration, jobProgress,
  missing, nextArchivistPrice, nextLevel, research, researchLevel, researched, status, withNextLevel,
  type ArchivesSave, type ResearchCategory, type ResearchId, type ResearchRequirement, type ResearchStatus, type ResearchTarget,
} from "../archives.ts";
import { UPGRADES } from "../config.ts";
import type { Save } from "../entities.ts";
import { loadout } from "../loadout.ts";
import type { AppContext } from "./app.ts";
import { currencyAmount, devAmount } from "./hud.ts";
import { el, gemIcon, uiSprite } from "./dom.ts";
import { askForGems } from "./dialogs.ts";

/** The status filter's choices; Locked only in Dev mode, the one place
 * research not yet unlocked is listed. */
const STATUS_FILTERS: Record<"all" | ResearchStatus, string> = {
  all: "All research", available: "Available", active: "Researching", completed: "Completed", locked: "Locked",
};

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
  : "research" in r ? `${RESEARCH[r.research as ResearchId].name} level ${r.level}`
  : `Hero level ${r.playerLevel}`;

/** The Upgrades page's Archives tab: the archivists and what each is
 * researching, the research library (searchable, filtered by category and
 * status), and the history of completed research. */
export class ArchivesPanel {
  private category: "all" | ResearchCategory = "all";
  private search = "";
  private shown: "all" | ResearchStatus = "all";

  constructor(private ctx: AppContext, private rerender: () => void) {}

  html() {
    const save = this.ctx.game.save;
    const options = <T extends string>(entries: [T, string][], chosen: T) =>
      entries.map(([id, name]) => `<option value="${id}" ${id === chosen ? "selected" : ""}>${name}</option>`).join("");
    const categories: ["all" | ResearchCategory, string][] = [["all", "All categories"], ...Object.entries(RESEARCH_CATEGORIES) as [ResearchCategory, string][]];
    const statuses = (Object.entries(STATUS_FILTERS) as ["all" | ResearchStatus, string][]).filter(([id]) => id !== "locked" || save.settings.devMode);
    return `<section class="archives"><header class="tree-heading"><h3>Archives</h3></header>
      <p class="archives-gold">${uiSprite("gold", "stat-sprite")} <b>${devAmount(this.ctx.game, save.gold)}</b> Gold <small>· research goes on while you play or are away</small></p>
      <div class="archivists" role="list" aria-label="Archivists">${this.archivistsHtml()}</div>
      <div class="research-filters">
        <input type="search" id="research-search" placeholder="Search research" aria-label="Search research" value="${this.search.replace(/"/g, "&quot;")}">
        <select id="research-category" aria-label="Category">${options(categories, this.category)}</select>
        <select id="research-status" aria-label="Status">${options(statuses, this.shown)}</select>
      </div>
      <div class="research-list" id="research-list" role="list" aria-label="Research">${this.listHtml()}</div>
      <h4 class="research-history-title">History</h4>${this.historyHtml()}</section>`;
  }

  bind() {
    const game = this.ctx.game;
    const act = (done: boolean) => {
      if (!done) return;
      this.ctx.update();
      this.rerender();
    };
    document.querySelectorAll<HTMLButtonElement>("[data-hire]").forEach((b) => (b.onclick = () => this.hire(act)));
    document.querySelectorAll<HTMLButtonElement>("[data-stop]").forEach((b) => (b.onclick = () => act(game.research.cancel(Number(b.dataset.stop)))));
    document.querySelectorAll<HTMLButtonElement>("[data-finish]").forEach((b) => (b.onclick = () => act(game.research.finishNow(Number(b.dataset.finish)).length > 0)));
    document.querySelectorAll<HTMLInputElement>("[data-auto]").forEach((box) => (box.onchange = () => {
      game.research.setAutoContinue(Number(box.dataset.auto), box.checked);
      this.ctx.save();
    }));
    el("research-search").oninput = (e) => {
      this.search = (e.target as HTMLInputElement).value;
      this.refreshList();
    };
    el("research-category").onchange = (e) => {
      this.category = (e.target as HTMLSelectElement).value as ResearchCategory;
      this.refreshList();
    };
    el("research-status").onchange = (e) => {
      this.shown = (e.target as HTMLSelectElement).value as ResearchStatus;
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
    });
  }

  private refreshList() {
    el("research-list").innerHTML = this.listHtml();
    this.bindList();
  }
  private bindList() {
    const game = this.ctx.game;
    document.querySelectorAll<HTMLButtonElement>("[data-research]").forEach((b) => (b.onclick = () => {
      const slot = game.save.archives.slots.findIndex((s) => !s.job);
      if (slot >= 0 && game.research.start(slot, b.dataset.research as ResearchId)) {
        this.ctx.update();
        this.rerender();
      }
    }));
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

  /** Each archivist slot: busy (a bar, the time left, Stop), idle, the next
   * one to hire, or locked beyond it. */
  private archivistsHtml() {
    const game = this.ctx.game, a = game.save.archives, now = game.clock();
    const price = nextArchivistPrice(a);
    return Array.from({ length: ARCHIVISTS.maximum }, (_, i) => {
      const slot = a.slots[i], title = `<small>ARCHIVIST ${i + 1}</small>`;
      if (!slot) {
        if (i === a.slots.length && price !== undefined)
          return `<article class="archivist hire" role="listitem">${title}<button class="archivist-hire${this.hireShort() ? " short" : ""}" data-hire aria-label="Hire an archivist for ${price} Gems" title="${this.hireShort() ? `Needs ${price} Gems` : "One more research runs at once"}">Hire · ${gemIcon()} <b>${price}</b></button></article>`;
        return `<article class="archivist locked" role="listitem">${title}<p>Locked</p></article>`;
      }
      const auto = `<label class="archivist-auto"><input type="checkbox" data-auto="${i}" ${slot.autoContinue ? "checked" : ""}> Auto-continue</label>`;
      const job = slot.job;
      if (!job) return `<article class="archivist idle" role="listitem">${title}<p>Idle · choose research below</p>${auto}</article>`;
      const def = RESEARCH[job.research], done = jobProgress(job, now);
      const finish = game.save.settings.devMode ? `<button data-finish="${i}">Finish now</button>` : "";
      return `<article class="archivist busy" role="listitem">${title}<b>${def.name} · level ${job.level}</b>
        <div class="research-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(done * 100)}"><i data-progress="${i}" style="width:${(done * 100).toFixed(2)}%"></i></div>
        <p><span data-countdown="${i}">${formatDuration(job.completesAt - now)} left</span></p>
        <div class="archivist-actions">${auto}<button data-stop="${i}" title="Stop: the Gold comes back, and the time spent is kept for later">Stop</button>${finish}</div></article>`;
    }).join("");
  }

  /** Whether project `id` is listed: unlocked (or Dev mode, which lists
   * everything), and in the chosen category and status and the search. */
  private matches(id: ResearchId) {
    const save = this.ctx.game.save, def = research(id), state = status(save, id), words = this.search.trim().toLowerCase();
    return (state !== "locked" || save.settings.devMode) &&
      (this.category === "all" || def.categories.includes(this.category)) &&
      (this.shown === "all" || state === this.shown) &&
      (!words || `${def.name} ${def.description}`.toLowerCase().includes(words));
  }

  private listHtml() {
    const ids = RESEARCH_IDS.filter((id) => this.matches(id));
    return ids.length ? ids.map((id) => this.researchHtml(id)).join("") : `<p class="research-empty">No research matches.</p>`;
  }

  /** One project: its level, what its next level costs, takes and gives,
   * any progress kept, and the button to start it. */
  private researchHtml(id: ResearchId) {
    const save = this.ctx.game.save, a = save.archives, def = research(id);
    const level = researchLevel(a, id), next = nextLevel(a, id), state = status(save, id);
    const tags = def.categories.map((c) => `<span class="research-tag">${RESEARCH_CATEGORIES[c]}</span>`).join("");
    let detail = "", action: string;
    if (next) {
      const ms = duration(a, next), kept = a.progress[id];
      const target = next.effect.target, shown = (archives: ArchivesSave) => RESEARCH_TARGETS[target].shown(targetValue(save, target, archives));
      detail = `<div class="research-next"><span class="training-box">${shown(a)}</span><span class="training-arrow" aria-hidden="true">→</span><span class="training-box next">${shown(withNextLevel(a, id))}</span>` +
        `<span class="research-price">${uiSprite("gold", "stat-sprite")} ${currencyAmount(next.gold)} · ${formatDuration(ms)}</span></div>` +
        (kept ? `<p class="research-kept">Progress kept: ${formatDuration(kept * ms)} of ${formatDuration(ms)}</p>` : "");
    }
    if (state === "completed") action = `<span class="research-state">Complete</span>`;
    else if (state === "active") action = `<span class="research-state">Archivist ${activeSlot(a, id) + 1}</span>`;
    else if (state === "locked") action = `<span class="research-state">Requires ${missing(save, id).map(requirementText).join(" + ")}</span>`;
    else {
      const slot = a.slots.findIndex((s) => !s.job);
      const why = slot < 0 ? "Every archivist is busy." : cannotStart(save, slot, id);
      action = `<button data-research="${id}" ${why ? `disabled title="${why}"` : ""}>Research · ${uiSprite("gold", "stat-sprite")} ${currencyAmount(next!.gold)}</button>`;
    }
    return `<article class="research ${state}" role="listitem"><div class="research-head"><b>${def.name}</b><small>LEVEL ${level} / ${def.levels.length}</small></div>
      <div class="research-tags">${tags}</div><p>${def.description}</p>${detail}<div class="research-action">${action}</div></article>`;
  }

  private historyHtml() {
    const history = this.ctx.game.save.archives.history;
    if (!history.length) return `<p class="research-empty">No research completed yet.</p>`;
    return `<ol class="research-history">${[...history].reverse().map((r) =>
      `<li><time>${formatDate(r.at)}</time> ${RESEARCH[r.research].name} level ${r.level} completed</li>`).join("")}</ol>`;
  }
}

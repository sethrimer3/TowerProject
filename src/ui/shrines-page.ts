import { boonIcon } from "./boon-icon.ts";
import { kitIcon } from "../sprite-kit.ts";
import { researched } from "../archives.ts";
import { BOON_IDS, STANDARD_BOONS, bans, boon, boonLabel, type BoonId } from "../shrines.ts";
import type { AppContext } from "./app.ts";
import { el } from "./dom.ts";

/** The Shrine Boons page (shrines.ts), opened from the forest's menu once
 * Shrines are researched; its X returns to the page that opened it. What
 * it sets is kept between runs and can be changed only in the forest:
 * the First Boon Choice (a standard boon to head a run's first offer), the
 * boons banned (as many as Ban Boons research allows) and Auto Pick's
 * ranking, every boon in a list dragged (or moved by its arrows) into
 * order, the rows Auto Pick Ranking research counts lit, banned boons kept
 * at the bottom in red. Each part shows once its research is done. */
export class ShrinesPage {
  private from = "";

  constructor(private ctx: AppContext) {}

  open(from: string) {
    this.from = from;
    this.render();
  }

  private get save() {
    return this.ctx.game.save;
  }

  /** Every boon in Auto Pick's order: the ranking, then the rest, banned
   * ones last. */
  private order(): BoonId[] {
    const banned = bans(this.save), ranking = this.save.shrines.ranking;
    const open = [...ranking, ...BOON_IDS.filter((id) => !ranking.includes(id))].filter((id) => !banned.includes(id));
    return [...open, ...banned];
  }

  render() {
    const save = this.save, a = save.archives;
    const first = researched(a, "firstBoonChoice") > 0, banMax = researched(a, "boonBans"), rankMax = researched(a, "boonRanks");
    const label = (id: BoonId) => boonLabel(id, save);
    const parts: string[] = [];
    if (first) {
      parts.push(`<section class="shrine-part"><h3>First Boon Choice</h3><p class="hint">Heads every run's first offer.</p>` +
        `<div class="boon-first-choice">${save.shrines.firstChoice ? `<span class="boon-first-preview">${boonIcon(save.shrines.firstChoice)}</span>` : ""}<select id="first-boon" aria-label="First Boon Choice"><option value="">None</option>${STANDARD_BOONS.map((id) =>
          `<option value="${id}"${save.shrines.firstChoice === id ? " selected" : ""}>${label(id)}</option>`).join("")}</select></div></section>`);
    }
    if (banMax) {
      const banned = bans(save);
      parts.push(`<section class="shrine-part"><h3>Ban Boons <small>${banned.length} / ${banMax}</small></h3><p class="hint">A banned boon is never offered.</p>` +
        `<div class="boon-bans">${BOON_IDS.map((id) => {
          const on = banned.includes(id), full = !on && banned.length >= banMax;
          return `<label class="boon-ban ${boon(id).kind}${on ? " banned" : ""}"><input type="checkbox" data-ban="${id}"${on ? " checked" : ""}${full ? " disabled" : ""}>${boonIcon(id)}<span class="boon-ban-name">${label(id)}</span>${on ? kitIcon("shrine-ban", "", "shrine-control-icon") : ""}</label>`;
        }).join("")}</div></section>`);
    }
    if (rankMax) {
      const order = this.order(), banned = bans(save);
      let lit = 0;
      parts.push(`<section class="shrine-part"><h3>Auto Pick Ranking <small>${Math.min(rankMax, order.length - banned.length)} ranked</small></h3>` +
        `<p class="hint">Auto Pick takes the highest lit boon offered, or else the top one. Drag to reorder.</p>` +
        `<ol class="boon-ranking" id="boon-ranking">${order.map((id, i) => {
          const isBanned = banned.includes(id), counted = !isBanned && lit++ < rankMax;
          return `<li class="boon-rank ${boon(id).kind}${counted ? " ranked" : ""}${isBanned ? " banned" : ""}" data-rank="${id}">` +
            (isBanned ? `<span class="rank-grip" aria-hidden="true"></span>` : `<span class="rank-grip" aria-hidden="true">${kitIcon("shrine-grip", "⋮⋮", "shrine-grip-icon")}</span>`) +
            `${boonIcon(id)}<span class="rank-name">${label(id)}</span>` +
            (isBanned ? "" : `<button class="rank-move" data-up="${i}" aria-label="Move up"${i === 0 ? " disabled" : ""}>${kitIcon("arrow-up", "▲", "rank-arrow-icon")}</button><button class="rank-move" data-down="${i}" aria-label="Move down"${i >= order.length - banned.length - 1 ? " disabled" : ""}>${kitIcon("arrow-down", "▼", "rank-arrow-icon")}</button>`) +
            `</li>`;
        }).join("")}</ol></section>`);
    }
    if (!parts.length) parts.push(`<p class="hint">Research First Boon Choice, Ban Boons or Auto Pick Ranking in the Archives to set them here.</p>`);
    el("shrines").innerHTML =
      `<button class="missions-close" id="shrines-close" aria-label="Close" title="Close">${kitIcon("close", "✕", "shrine-close-icon")}</button>` +
      `<div class="page-title"><small>BETWEEN RUNS</small><h2>Shrine Boons</h2></div>` +
      (this.ctx.game.run.outside ? "" : `<p class="hint">Return to the forest to change these.</p>`) + parts.join("");
    el("shrines-close").onclick = () => this.ctx.navigate(this.from || "board");
    this.wire();
  }

  private changed() {
    this.ctx.save();
    this.render();
  }

  private wire() {
    const page = el("shrines"), shrine = this.ctx.game.shrine;
    const first = page.querySelector<HTMLSelectElement>("#first-boon");
    if (first) first.onchange = () => {
      shrine.setFirstChoice((first.value || undefined) as BoonId | undefined);
      this.changed();
    };
    const banMax = researched(this.save.archives, "boonBans");
    page.querySelectorAll<HTMLInputElement>("[data-ban]").forEach((box) => (box.onchange = () => {
      shrine.toggleBan(box.dataset.ban as BoonId, banMax);
      this.changed();
    }));
    const order = this.order(), open = order.slice(0, order.length - bans(this.save).length);
    const move = (from: number, to: number) => {
      const next = [...open];
      next.splice(to, 0, ...next.splice(from, 1));
      shrine.setRanking(next);
      this.changed();
    };
    page.querySelectorAll<HTMLButtonElement>("[data-up]").forEach((b) => (b.onclick = () => move(Number(b.dataset.up), Number(b.dataset.up) - 1)));
    page.querySelectorAll<HTMLButtonElement>("[data-down]").forEach((b) => (b.onclick = () => move(Number(b.dataset.down), Number(b.dataset.down) + 1)));
    const list = page.querySelector<HTMLOListElement>("#boon-ranking");
    if (list) this.dragRows(list, open.length, move);
  }

  /** Dragging a ranked row by its grip moves it among the first `rows`
   * (never below a banned one), the others making room as it goes. */
  private dragRows(list: HTMLOListElement, rows: number, move: (from: number, to: number) => void) {
    const items = Array.from(list.querySelectorAll<HTMLLIElement>("li")).slice(0, rows);
    items.forEach((li, from) => {
      const grip = li.querySelector<HTMLElement>(".rank-grip")!;
      grip.onpointerdown = (down) => {
        down.preventDefault();
        grip.setPointerCapture(down.pointerId);
        const heights = items.map((i) => i.getBoundingClientRect());
        let to = from;
        li.classList.add("dragging");
        grip.onpointermove = (e) => {
          li.style.transform = `translateY(${e.clientY - down.clientY}px)`;
          to = heights.findIndex((r) => e.clientY < r.bottom);
          if (to < 0) to = rows - 1;
          items.forEach((other, i) => other.classList.toggle("drop-here", i === to && i !== from));
        };
        grip.onpointerup = grip.onpointercancel = () => {
          grip.onpointermove = grip.onpointerup = grip.onpointercancel = null;
          li.classList.remove("dragging");
          li.style.transform = "";
          if (to !== from) move(from, to);
          else items.forEach((other) => other.classList.remove("drop-here"));
        };
      };
    });
  }
}

import { TOWER_SECTION } from "../config.ts";
import type { AppContext } from "./app.ts";
import { displayedProgress, el, itemSprite, uiSprite } from "./dom.ts";
import { devAmount } from "./hud.ts";

/** The modal dialogs opened from the HUD, all sharing `ctx.modal`. */

export type ConfirmPrompt = { title: string; body: string; label: string };

/** Asks the player to confirm `action`; `label` names the confirm button. */
export function confirmAction(ctx: AppContext, { title, body, label }: ConfirmPrompt, action: () => void) {
  const modal = ctx.modal;
  modal.innerHTML = `<small>THE HOLLOW SPIRE</small><h2>${title}</h2><p>${body}</p><div class="dialog-actions"><button id="cancel">Keep climbing</button><button id="confirm">${label}</button></div>`;
  modal.showModal();
  el("cancel").onclick = () => modal.close();
  el("confirm").onclick = () => {
    modal.close();
    action();
  };
}

/** Starts the next run in the forest clearing, with the camera reset onto it. */
export function returnToForest(ctx: AppContext) {
  const { game, renderer } = ctx;
  game.summary = null;
  renderer.bottom = 0;
  renderer.playerX = game.run.player.x;
  renderer.playerY = 0;
  game.message = "Follow the forest path to the entrance.";
  ctx.navigate(game.mode);
}

/** Watches for a finished run: fades in from black after a death, then shows
 * the summary (or, after an Automove death, goes straight back outside). */
export class RunEnd {
  private deathFaded = false;
  private fadeOverlay = document.createElement("div");

  constructor(private ctx: AppContext) {
    this.fadeOverlay.className = "fade-overlay";
    document.body.appendChild(this.fadeOverlay);
  }

  check() {
    const s = this.ctx.game.summary;
    if (!s) {
      this.deathFaded = false;
      return;
    }
    if (s.dead && !this.deathFaded) {
      this.deathFaded = true;
      this.fadeInFromBlack();
    }
    if (s.dead && s.autoDeath) returnToForest(this.ctx);
    else this.showSummary();
  }

  private fadeInFromBlack() {
    const overlay = this.fadeOverlay;
    overlay.classList.add("active");
    requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.remove("active")));
  }

  private showSummary() {
    const ctx = this.ctx, { game, modal } = ctx;
    const s = game.summary!,
      currencyName = game.mode === "delve" ? "COURAGE" : "INSPIRATION",
      heightName = game.mode === "tower" ? "ROOMS" : "HEIGHT";
    if (modal.open) return;
    const saved = devAmount(game, game.mode === "tower" ? game.save.tower.shards : game.save.delve.essence);
    const revive = game.save[game.mode].revival
      ? `<p>Revive is available until your next move. ${currencyName[0]}${currencyName.slice(1).toLowerCase()} is awarded if you continue.</p><button class="wide" id="revive-now">Revive</button>`
      : "";
    modal.innerHTML = `<span class="summary-icon">${uiSprite("automove")}</span><small>${s.reason.toUpperCase()}</small><h2>The tower remembers.</h2><p>Your milestone and clear rewards are already saved.</p><div class="summary-stats"><div><strong>${displayedProgress(s.height)}</strong>${heightName}</div><div><strong>${s.kills}</strong>VICTORIES</div><div><strong>${saved}</strong>${currencyName} SAVED</div></div>${s.record ? "" : `<p class="hint">Milestone rewards were credited as you reached them. Clear rewards are kept.</p>`}${revive}<button class="wide" id="again">${s.dead ? `Return to the forest` : "Begin another ascent →"}</button>`;
    modal.showModal();
    const reviveButton = document.querySelector<HTMLButtonElement>("#revive-now");
    if (reviveButton)
      reviveButton.onclick = () => {
        modal.close();
        game.undo();
        ctx.navigate(game.mode);
      };
    el("again").onclick = () => {
      modal.close();
      if (s.dead) return returnToForest(ctx);
      game.summary = null;
      game.newRun(true);
      ctx.renderer.bottom = 0;
      ctx.renderer.playerX = game.run.player.x;
      ctx.renderer.playerY = 0;
      game.message = "Follow the forest path to the entrance.";
      ctx.navigate(game.mode);
    };
  }
}

export function showAutoSettings(ctx: AppContext) {
  const { game, modal } = ctx;
  if (modal.open) return;
  const owned = !!game.save.upgrades.autoPersist;
  modal.innerHTML = `<span class="summary-icon">${uiSprite("settings")}</span><small>WAYFINDER</small><h2>Automove settings</h2><label class="setting">Turn off upon death<input type="checkbox" id="auto-off-death" ${game.save.settings.autoOffOnDeath !== false ? "checked" : ""} ${owned ? "" : "disabled"}></label><p class="hint">${owned ? "Disable to keep the wayfinder moving after you fall in battle." : "Research Steadfast wayfinder in the Courage tree to configure this."}</p><div class="dialog-actions"><button id="auto-settings-close">Close</button></div>`;
  modal.showModal();
  el("auto-settings-close").onclick = () => modal.close();
  const cb = document.querySelector<HTMLInputElement>("#auto-off-death");
  if (cb)
    cb.onchange = () => {
      game.save.settings.autoOffOnDeath = cb.checked;
      ctx.save();
    };
}

const LOG_PAGE = 25;

/** The Tower's adventure log: records, clear tiers, and floors 25 at a time. */
export function showLog(ctx: AppContext) {
  const { game, modal } = ctx;
  if (game.mode !== "tower") return;
  let page = 0;
  const floorRecord = (floor: number) => {
    const record = game.save.tower.log[floor];
    const tiers = record?.earned.length
      ? record.earned.map(t => `<span class="${t}">${itemSprite(`chest_${t}` as "chest_silver" | "chest_gold" | "chest_platinum", "log-sprite")}${t[0].toUpperCase() + t.slice(1)}${record.claimed.includes(t) ? " ✓" : " · chest"}</span>`).join(" · ")
      : "Reached";
    return `<div class="floor-record"><b>Floor ${displayedProgress(floor)}</b><span>${tiers}</span></div>`;
  };
  const render = () => {
    const highest = game.save.tower.reached;
    const start = Math.max(0, highest - page * LOG_PAGE);
    const floors = Array.from({ length: Math.min(LOG_PAGE, start + 1) }, (_, i) => start - i);
    modal.innerHTML = `<small>WAYFARER’S RECORD</small><h2>Adventure log</h2>
      <div class="summary-stats"><div><strong>${displayedProgress(highest)}</strong>HIGHEST FLOOR</div><div><strong>${displayedProgress(game.save.delve.reached)}</strong>DEEPEST DEPTH</div></div>
      <p>${devAmount(game, game.save.tower.shards)} Inspiration · ${devAmount(game, game.save.delve.essence)} Courage</p>
      <p class="hint">+1 Inspiration per new height. +1 Courage at each new 10-depth milestone. Revisits never pay again.</p>
      <div class="clear-legend"><p class="silver">${itemSprite("chest_silver", "log-sprite")} Silver · all doors opened and enemies defeated.</p><p class="gold">${itemSprite("chest_gold", "log-sprite")} Gold · Silver with no damage taken anywhere in the ascent.</p><p class="platinum">${itemSprite("chest_platinum", "log-sprite")} Platinum · Gold with no keys spent on that floor.</p><p class="diamond">Diamond · future challenge, not yet available.</p></div>
      <p class="hint">Each clear tier earns +1 Inspiration once per floor. Uncollected chests are claimed when you leave.</p>
      <div class="floor-log">${floors.map(floorRecord).join("")}</div><div class="dialog-actions"><button id="log-newer" ${page === 0 ? "disabled" : ""}>Higher</button><button id="log-older" ${start < LOG_PAGE ? "disabled" : ""}>Lower</button><button id="log-close">Close</button></div>`;
    el("log-newer").onclick = () => { page--; render(); };
    el("log-older").onclick = () => { page++; render(); };
    el("log-close").onclick = () => modal.close();
  };
  render();
  modal.showModal();
}

/** Picks which Tower section (10 floors) the next ascent starts from. */
export function showSectionPicker(ctx: AppContext) {
  const { game, modal } = ctx;
  if (game.mode !== "tower") return;
  const render = () => {
    const tower = game.save.tower,
      maxHp = tower.run?.player.maxHp ?? game.combatStats().maxHp,
      current = game.startSection(),
      unlocked = Object.keys(tower.sectionHp).map(Number),
      // Every unlocked section, plus the next one as a locked goal.
      count = Math.max(0, ...unlocked) + 2,
      inside = !!tower.run && !tower.run.outside;
    const option = (s: number) => {
      const first = s * TOWER_SECTION + 1,
        open = game.sectionUnlocked(s),
        hp = s === 0 ? `${maxHp} HP · full` : open ? `${tower.sectionHp[s]} HP` : `Reach floor ${first}`;
      return `<button class="section-option${s === current ? " selected" : ""}" data-section="${s}" ${open ? "" : "disabled"}><b>Floors ${first}–${first + TOWER_SECTION - 1}</b><span>${hp}</span></button>`;
    };
    modal.innerHTML = `<small>THE ASCENT TRIALS</small><h2>Starting floor</h2>
      <p class="hint">Every 10 floors is its own trial: the way down seals behind you and ATK/DEF from items resets. Each trial begins with the highest HP you have ever reached its first floor with.</p>
      <div class="section-list">${Array.from({ length: count }, (_, s) => option(s)).join("")}</div>
      ${inside ? `<p class="hint">Your current ascent continues; the new start applies to your next one.</p>` : ""}
      <div class="dialog-actions"><button id="section-close">Close</button></div>`;
    modal.querySelectorAll<HTMLButtonElement>("[data-section]").forEach(b => {
      b.onclick = () => {
        if (!game.setStartSection(Number(b.dataset.section))) return;
        ctx.save();
        render();
      };
    });
    el("section-close").onclick = () => modal.close();
  };
  render();
  modal.showModal();
}

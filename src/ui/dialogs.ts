import { whole, wholeHp } from "../whole.ts";
import { TOWER_SECTION } from "../config.ts";
import { CLEAR_TIERS } from "../tower/clear-ledger.ts";
import { MODES } from "../modes.ts";
import { loadout } from "../loadout.ts";
import type { AppContext } from "./app.ts";
import { capitalized, displayedProgress, el, itemSprite, uiSprite } from "./dom.ts";
import { boardTitle, devAmount } from "./hud.ts";

/** The modal dialogs opened from the HUD, all sharing `ctx.modal`. */

/** A confirm dialog's text: `label` names the confirm button and `cancel`
 * the one that backs out. */
export type ConfirmPrompt = { title: string; body: string; label: string; cancel: string };

/** Asks the player to confirm `action`. */
export function confirmAction(ctx: AppContext, { title, body, label, cancel }: ConfirmPrompt, action: () => void) {
  const modal = ctx.modal;
  modal.innerHTML = `<small>${boardTitle(ctx.game)}</small><h2>${title}</h2><p>${body}</p><div class="dialog-actions"><button id="cancel">${cancel}</button><button id="confirm">${label}</button></div>`;
  modal.showModal();
  el("cancel").onclick = () => modal.close();
  el("confirm").onclick = () => {
    modal.close();
    action();
  };
}

/** Each mode's currency icon, as the currencies row shows it: Inspiration
 * the Upgrades sprite, Courage the Automove one. */
const CURRENCY_SPRITES = { tower: "upgrades", delve: "automove" } as const;

/** Why the run's end dialog opened: the hero fell, the End Run button was
 * pressed while no card in the hand can act, or it was pressed by choice. */
type RunEndCause = "fallen" | "stuck" | "chosen";

/** The run's end dialog, one for every way a run ends: it says what brought
 * it up, shows the same totals of what the run obtained, and asks what next.
 * A fallen hero must answer it (undo the fight, once undo is unlocked and
 * one is left, or accept defeat), after which the forest fades in from
 * black; otherwise the player ends the run or keeps going.
 * TODO: show the run's totals another way, viewable during the run and
 * when it ends (the victories, among more), in place of this summary. */
export class RunEndDialog {
  private fadeOverlay = document.createElement("div");

  constructor(private ctx: AppContext) {
    this.fadeOverlay.className = "fade-overlay";
    document.body.appendChild(this.fadeOverlay);
  }

  /** Opens the dialog for a fallen hero, unless it is already open. */
  check() {
    if (this.ctx.game.fallen && !this.ctx.modal.open) this.show("fallen");
  }

  /** The End Run button: a fallen hero's dialog, or the prompt to end. */
  ask() {
    const game = this.ctx.game;
    this.show(game.fallen ? "fallen" : game.handStuck && !game.run.outside ? "stuck" : "chosen");
  }

  private fadeInFromBlack() {
    const overlay = this.fadeOverlay;
    overlay.classList.add("active");
    requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.remove("active")));
  }

  /** The run's totals, the same whatever ended it: where it stands, its
   * highest, and the Gold, currency and XP it obtained (not the balances
   * held). */
  private stats() {
    const { game } = this.ctx, rules = MODES[game.mode], slice = game.save[game.mode], run = game.run;
    const stat = (value: string | number, label: string, icon = "") => `<div><strong>${icon}${value}</strong>${label}</div>`;
    return [
      stat(displayedProgress(run.height, !!run.outside), rules.words.progress.toUpperCase()),
      stat(displayedProgress(run.maxHeight ?? run.height, !!run.outside), "HIGHEST"),
      stat(whole(slice.runGold), "GOLD", uiSprite("gold")),
      stat(slice.runCurrency, rules.words.currency.toUpperCase(), uiSprite(CURRENCY_SPRITES[game.mode])),
      stat(run.xp ?? 0, "XP"),
    ].join("");
  }

  private show(cause: RunEndCause) {
    const ctx = this.ctx, { game, modal } = ctx;
    const words = MODES[game.mode].words, slice = game.save[game.mode];
    const where = `${words.progress} ${displayedProgress(game.run.height, !!game.run.outside)}`;
    const kept = `Milestone rewards and the Gold found are already saved${game.mode === "tower" ? "; uncollected clear chests will be claimed" : ""}.`;
    const stats = `<div class="summary-stats compact">${this.stats()}</div>`;
    if (cause === "fallen") {
      const undos = slice.history.length, by = slice.fall?.by;
      // Undo goes unmentioned until Rehearsed steps unlocks it.
      const takeBack = !loadout(game.save).undoCapacity ? ""
        : undos ? `<p>Undo takes back the fight, and the hand waits for you.</p>`
        : `<p class="hint">No undo is left to take the fight back.</p>`;
      const button = undos ? `<button id="defeat-undo">Undo (${undos} left)</button>` : "";
      modal.innerHTML = `<span class="summary-icon">${uiSprite("revive")}</span><small>FALLEN IN COMBAT</small><h2>Your hero has fallen.</h2><p>${by ? `Defeated by ${by}` : "Defeated"} at ${where}. ${kept}</p>${stats}${takeBack}<div class="dialog-actions">${button}<button id="defeat-accept">Accept defeat</button></div>`;
      modal.showModal();
      const undo = document.querySelector<HTMLButtonElement>("#defeat-undo");
      if (undo)
        undo.onclick = () => {
          modal.close();
          game.undo();
          ctx.navigate(game.mode);
        };
      el("defeat-accept").onclick = () => {
        modal.close();
        game.acceptDefeat();
        this.fadeInFromBlack();
        ctx.navigate(game.mode);
      };
      return;
    }
    const [label, title, why] = cause === "stuck"
      ? ["NO CARD CAN ACT", `End this ${words.run}?`, `Nothing in your hand can act at ${where}. `]
      : ["END RUN", `End this ${words.run}?`, `End the current ${words.run} at ${where}. `];
    modal.innerHTML = `<small>${label}</small><h2>${title}</h2><p>${why}${kept}</p>${stats}<div class="dialog-actions"><button id="cancel">${words.keepGoing}</button><button id="confirm">End run</button></div>`;
    modal.showModal();
    el("cancel").onclick = () => modal.close();
    el("confirm").onclick = () => {
      modal.close();
      game.finish(`${capitalized(words.run)} ended`);
      ctx.navigate(game.mode);
    };
  }
}

const LOG_PAGE = 25;

/** The Tower's adventure log: records, clear tiers, and floors 25 at a time. */
export function showLog(ctx: AppContext) {
  const { game, modal } = ctx;
  if (game.mode !== "tower") return;
  let page = 0;
  const floorRecord = (floor: number) => {
    const record = game.save.tower.log[floor];
    const earned = CLEAR_TIERS.filter(t => record?.[t]);
    const tiers = earned.length
      ? earned.map(t => `<span class="${t}">${itemSprite(`chest_${t}` as "chest_silver" | "chest_gold" | "chest_platinum", "log-sprite")}${t[0].toUpperCase() + t.slice(1)}${record![t] === "claimed" ? " ✓" : " · chest"}</span>`).join(" · ")
      : "Reached";
    return `<div class="floor-record"><b>Floor ${displayedProgress(floor)}</b><span>${tiers}</span></div>`;
  };
  const render = () => {
    const highest = game.save.tower.reached;
    const start = Math.max(0, highest - page * LOG_PAGE);
    const floors = Array.from({ length: Math.min(LOG_PAGE, start + 1) }, (_, i) => start - i);
    modal.innerHTML = `<small>WAYFARER’S RECORD</small><h2>Adventure log</h2>
      <div class="summary-stats"><div><strong>${displayedProgress(highest)}</strong>HIGHEST FLOOR</div><div><strong>${displayedProgress(game.save.delve.reached)}</strong>DEEPEST DEPTH</div></div>
      <p>${devAmount(game, game.save.tower.inspiration)} Inspiration · ${devAmount(game, game.save.delve.courage)} Courage</p>
      <p class="hint">+1 Inspiration per new height. +1 Courage at each new 10-depth milestone. Past floor 100 (depth 1,000) a point takes 10 times as far, past floor 1,000 100 times, and past floor 10,000 none. Revisits never pay again.</p>
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
      maxHp = tower.run?.player.maxHp ?? loadout(game.save).maxHp,
      current = game.startSection(),
      unlocked = Object.keys(tower.sectionHp).map(Number),
      // Every unlocked section, plus the next one as a locked goal.
      count = Math.max(0, ...unlocked) + 2,
      inside = !!tower.run && !tower.run.outside;
    const option = (s: number) => {
      const first = s * TOWER_SECTION + 1,
        open = game.sectionUnlocked(s),
        hp = s === 0 ? `${whole(maxHp)} HP · full` : open ? `${wholeHp(tower.sectionHp[s])} HP` : `Reach floor ${first}`;
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

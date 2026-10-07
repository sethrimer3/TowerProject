import { whole, wholeChange } from "../whole.ts";
import { GOLD_BOOST_FACTOR } from "../gold-boost.ts";
import { MODES } from "../modes.ts";
import { loadout } from "../loadout.ts";
import type { AppContext } from "./app.ts";
import { capitalized, CURRENCY_SPRITES, displayedProgress, el, uiSprite } from "./dom.ts";
import { boardTitle } from "./hud.ts";

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

/** The ? button beside a page heading, which `showHelp` answers. */
/** The ? beside a page's heading; `id` keeps each page's apart, since an
 * inactive page keeps its markup. */
export const helpButton = (about: string, id = "tree-help") =>
  `<button class="tree-help" id="${id}" aria-label="${about}" title="${about}">?</button>`;

/** A page's explanations, kept off the page to spare it clutter: opened by
 * the ? beside its heading. */
export function showHelp(ctx: AppContext, eyebrow: string, title: string, body: string) {
  const modal = ctx.modal;
  modal.innerHTML = `<small>${eyebrow}</small><h2>${title}</h2>${body}<div class="dialog-actions"><button id="tree-help-ok">Got it</button></div>`;
  modal.showModal();
  el("tree-help-ok").onclick = () => modal.close();
}

/** Offers the Shop when a Gem purchase finds too few Gems held. */
export function askForGems(ctx: AppContext) {
  confirmAction(ctx, { title: "Not enough Gems", body: "Not enough gems. Go to the store?", label: "Go to Shop", cancel: "Cancel" }, () => ctx.navigate("shop"));
}

/** Why the run's end dialog opened: the hero fell, the End Run button was
 * pressed while no card in the hand can act, or it was pressed by choice. */
type RunEndCause = "fallen" | "stuck" | "chosen";

/** The run's end dialog, one for every way a run ends: it says what brought
 * it up, shows the same totals of what the run obtained, and asks what next.
 * A fallen hero must answer it (undo the fight, once undo is unlocked and
 * one is left, or return to the entrance), after which the forest fades in from
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
   * held). A run that climbed past the tier's record says so over them,
   * and its highest goes unsaid while it stands there. */
  private stats() {
    const { game } = this.ctx, rules = MODES[game.mode], slice = game.save[game.mode], run = game.run;
    const stat = (value: string | number, label: string, icon = "") => `<div><strong>${icon}${value}</strong>${label}</div>`;
    const highest = run.maxHeight ?? run.height, record = slice.runRecord && !run.outside;
    const stats = [
      stat(displayedProgress(run.height, !!run.outside), rules.words.progress.toUpperCase()),
      record && run.height === highest ? "" : stat(displayedProgress(highest, !!run.outside), "HIGHEST"),
      stat(whole(slice.runGold), "GOLD", uiSprite("gold")),
      stat(slice.runCurrency, rules.words.currency.toUpperCase(), uiSprite(CURRENCY_SPRITES[game.mode])),
      stat(run.xp ?? 0, "XP"),
    ].join("");
    const cheer = record ? `<p class="summary-record">Highest ${rules.words.progress.toLowerCase()} reached!</p>` : "";
    return `${cheer}<div class="summary-stats compact">${stats}</div>${this.boostLine()}`;
  }

  /** While the Gold ad's boost ran during the run, the Gold it found then
   * and what the boost made of it: 50 Gold × 1.5 boost = 75 Gold. */
  private boostLine() {
    const found = this.ctx.game.save[this.ctx.game.mode].runBoostGold;
    if (found === null) return "";
    const gold = uiSprite("gold");
    return `<p class="summary-boost">${gold}${wholeChange(found)} Gold × ${GOLD_BOOST_FACTOR} boost = ${gold}<b>${wholeChange(found * GOLD_BOOST_FACTOR)} Gold</b></p>`;
  }

  private show(cause: RunEndCause) {
    const ctx = this.ctx, { game, modal } = ctx;
    const words = MODES[game.mode].words, slice = game.save[game.mode];
    const where = `${words.progress} ${displayedProgress(game.run.height, !!game.run.outside)}`;
    const kept = "Milestone rewards and the Gold found are already saved.";
    const stats = this.stats();
    if (cause === "fallen") {
      const undos = slice.history.length, by = slice.fall?.by;
      // Undo goes unmentioned until Rehearsed steps unlocks it.
      const takeBack = !loadout(game.save).undoCapacity ? ""
        : undos ? `<p>Undo takes back the fight, and the hand waits for you.</p>`
        : `<p class="hint">No undo is left to take the fight back.</p>`;
      const button = undos ? `<button id="defeat-undo">Undo (${undos} left)</button>` : "";
      // Encourages another run: the next one is a new layout, and what this one earned can make the hero stronger.
      const again = `<p>Look over what this ${words.run} earned, spend it to grow stronger, and try again: the ${words.tierName} will shift to a new layout for your next ${words.run}.</p>`;
      modal.innerHTML = `<span class="summary-icon">${uiSprite("revive")}</span><small>FALLEN IN COMBAT</small><h2>Regroup and try again.</h2><p>${by ? `Felled by ${by}` : "Felled"} at ${where}. ${kept}</p>${stats}${again}${takeBack}<div class="dialog-actions">${button}<button id="defeat-accept">Return to entrance</button></div>`;
      modal.showModal();
      // Undo, or else return to the entrance: however the dialog closes,
      // even dismissed by the browser itself (a phone's Back, or coming back
      // to the tab, can close it past the cancel guard), the hero never stays
      // fallen on the floor with no dialog to answer.
      let undoing = false;
      const undo = document.querySelector<HTMLButtonElement>("#defeat-undo");
      if (undo) undo.onclick = () => ((undoing = true), modal.close());
      el("defeat-accept").onclick = () => modal.close();
      modal.addEventListener("close", () => {
        if (undoing) game.undo();
        else if (game.acceptDefeat()) this.fadeInFromBlack();
        ctx.navigate(game.mode);
      }, { once: true });
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

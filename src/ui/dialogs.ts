import { keyCount, whole, wholeChange, wholeHp } from "../whole.ts";
import { GOLD_BOOST_FACTOR } from "../economy/gold-boost.ts";
import { MODES } from "../modes.ts";
import { loadout } from "../progression/loadout.ts";
import { CARDS, type Blocker } from "../cards/cards.ts";
import { attackAgainst, defenseAgainst } from "../combat.ts";
import { doorBlockedMessage, doorRule, KEY_NAMES, KEY_ORDER } from "../doors.ts";
import { tileInfo } from "./tile-info.ts";
import type { AppContext, PageGame } from "./app.ts";
import { capitalized, CURRENCY_SPRITES, displayedProgress, el, uiSprite } from "./dom.ts";
import { boardTitle, shortStat } from "./hud.ts";
import type { DelveRun } from "../runs.ts";
import type { TournamentClient } from "../tournament/client.ts";
import { LEAGUE_INFO } from "../tournament/leagues.ts";
import { placeText } from "../tournament/prizes.ts";
import { tournamentScore } from "../tournament/run.ts";
import { notesResearched, type RunNotesDialog } from "./run-notes-dialog.ts";

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

/** How many kinds of blocker the stuck dialog lists before counting the rest. */
const BLOCKERS_SHOWN = 4;

/** What stops a hand that can't act, for the run's end dialog: each door,
 * monster or tile in the way (`Game.stuckReport`), closest first, alike
 * ones counted together at the closest, with where it stands from the hero
 * and why no card in the hand gets past it, naming what the hero holds that
 * falls short. */
function stuckBlock(game: PageGame) {
  const report = game.stuckReport(), p = game.run.player, groups = new Map<string, { b: Blocker; count: number }>();
  for (const b of report.blockers) {
    const key = `${tileInfo(game, b.x, b.y).title}|${blockWhy(game, b)}`, group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, { b, count: 1 });
  }
  const items = [...groups.values()].slice(0, BLOCKERS_SHOWN).map(({ b, count }) => {
    const info = tileInfo(game, b.x, b.y), rows = b.y - p.y;
    const where = [rows ? `${Math.abs(rows)} ${rows === 1 || rows === -1 ? "row" : "rows"} ${rows > 0 ? "up" : "down"}` : "on your row", `${b.steps} ${b.steps === 1 ? "step" : "steps"} away`].join(" · ");
    return `<li><span class="stuck-swatch" style="background:${info.color}"></span><div><b>${info.title}</b>${count > 1 ? ` ×${count}` : ""} <small>${where}</small><p>${blockWhy(game, b)}</p></div></li>`;
  });
  const more = groups.size - BLOCKERS_SHOWN;
  if (more > 0) items.push(`<li class="stuck-more">and ${more} more</li>`);
  const list = items.length ? `<ul>${items.join("")}</ul>` : `<p>No door or enemy stands at the edge of the ground you can reach.</p>`;
  return `<div class="stuck-blockers"><small>WHAT BLOCKS THE WAY</small>${list}</div>`;
}

/** Why no card in the hand gets past blocker `b`. */
function blockWhy(game: PageGame, b: Blocker) {
  const p = game.run.player, t = b.tile;
  switch (b.why) {
    case "ignored": return "You marked it with Ignore: no card goes there.";
    case "held": return `${CARDS[b.card!].name} would take it, but its badge holds the card back.`;
    case "passed": return `${CARDS[b.card!].name} passes it over, as its badge directs.`;
    case "keys": {
      const rule = doorRule(t), colors = rule.type === "keys" && rule.mode === "all" ? rule.keys : KEY_ORDER;
      const held = colors.map((c) => `${keyCount(p.keys[c])} ${KEY_NAMES[c].toLowerCase()}`).join(", ");
      return `${doorBlockedMessage(t)} You hold ${held}${rule.type === "wood" ? ` and ${wholeHp(p.hp)} HP` : ""}.`;
    }
    case "doorRun": return "It begins a run of doors, and the keys you hold run out partway through.";
    case "impervious": return `Your ATK ${shortStat(attackAgainst(p, t.enemy!))} can't get past its DEF ${shortStat(defenseAgainst(p, t.enemy!))}.`;
    case "noCard":
      if (t.kind === "door") return "You can open it, but no card in your hand heads for this door.";
      if (t.kind === "enemy") return "No card in your hand fights this enemy.";
      if (t.kind === "stairs") return "No card in your hand takes the stairs.";
      return "No card in your hand heads for it.";
  }
}

/** Why the run's end dialog opened:the hero fell, the End Run button was
 * pressed while no card in the hand can act, or it was pressed by choice. */
type RunEndCause = "fallen" | "stuck" | "chosen";

/** The run's end dialog, one for every way a run ends: it says what brought
 * it up, shows the same totals of what the run obtained, and asks what next.
 * A fallen hero must answer it (undo the fight, once undo is unlocked and
 * one is left, or return to the entrance), after which the forest fades in from
 * black; otherwise the player ends the run or keeps going. Once Note
 * Taking is researched, a button at the end of its totals opens the run's
 * notes over it. */
export class RunEndDialog {
  private fadeOverlay = document.createElement("div");

  constructor(
    private ctx: AppContext,
    /** Sends a tournament run's score as the dialog opens. */
    private tournament: TournamentClient | null = null,
    /** The run's notes, which the summary's Run Notes button opens. */
    private notes: RunNotesDialog | null = null,
  ) {
    this.fadeOverlay.className = "fade-overlay";
    document.body.appendChild(this.fadeOverlay);
  }

  /** The wait for the skull over a fallen hero to be over. */
  private waiting: ReturnType<typeof setTimeout> | null = null;

  /** Opens the dialog for a fallen hero, unless it is already open, once
   * the skull over it is over (looking again then). */
  check() {
    const game = this.ctx.game;
    if (!game.fallen || this.ctx.modal.open || this.waiting) return;
    const wait = game.fights.defeatShownUntil - performance.now();
    if (wait > 0) this.waiting = setTimeout(() => ((this.waiting = null), this.check()), wait);
    else this.show("fallen");
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
      rules.pays ? stat(slice.runCurrency, rules.pays.currency.toUpperCase(), uiSprite(CURRENCY_SPRITES[game.mode])) : "",
      stat(run.xp ?? 0, "XP"),
    ].join("");
    const cheer = record ? `<p class="summary-record">Highest ${rules.words.progress.toLowerCase()} reached!</p>` : "";
    return `${cheer}<div class="summary-stats compact">${stats}</div>${this.boostLine()}${this.tournamentBlock()}${this.notesButton()}`;
  }

  /** At the end of the run's totals, once Note Taking is researched: the
   * button that opens the run's notes over the summary. */
  private notesButton() {
    const { game } = this.ctx;
    if (!this.notes || game.run.outside || !notesResearched(game.save)) return "";
    return `<button id="summary-notes" class="wide summary-notes">${capitalized(MODES[game.mode].words.run)} Notes</button>`;
  }
  /** Opens the notes from the summary's button, when it has one. */
  private bindNotes() {
    const button = document.querySelector<HTMLButtonElement>("#summary-notes");
    if (button) button.onclick = () => this.notes?.show();
  }

  /** A tournament run's score, sent as the dialog opens (the best of the
   * tournament's runs counts), and its place once the server answers. */
  private tournamentBlock() {
    const { game } = this.ctx, t = game.mode === "delve" ? (game.run as DelveRun).tournament : undefined;
    if (!t || game.run.outside) return "";
    // Past the grace, depth no longer counts: the score is what was kept before it.
    const client = this.tournament, counts = game.tournament.counts(t.id);
    const score = counts ? tournamentScore(game.run) : (game.save.tournament.entries[t.id]?.best ?? 0);
    void client?.sendRun().then((s) => {
      const line = document.getElementById("summary-tournament-place");
      if (line) line.textContent = s ? `Place: ${placeText(s.place, s.entrants)}` : counts ? "Offline — your score will be sent later" : "";
    });
    return `<div class="summary-tournament"><small>TOURNAMENT · ${LEAGUE_INFO[t.league].name.toUpperCase()} LEAGUE</small>` +
      `<p>Score: <b>${score}</b></p>${counts ? "" : `<p class="hint">The tournament has ended: depth reached since doesn't count.</p>`}` +
      `<p id="summary-tournament-place">${client ? "Checking your place…" : ""}</p></div>`;
  }

  /** While the Gold ad's boost ran during the run, the Gold it found then
   * and what the boost made of it: 50 Gold × 1.5 boost = 75 Gold. */
  private boostLine() {
    const found = this.ctx.game.save[this.ctx.game.mode].runBoostGold;
    if (found === null) return "";
    const gold = uiSprite("gold");
    return `<p class="summary-boost">${gold}${wholeChange(found)} Gold × ${GOLD_BOOST_FACTOR} boost = ${gold}<b>${wholeChange(found * GOLD_BOOST_FACTOR)} Gold</b></p>`;
  }

  /** The Retry button, when a new run on this run's starting floor can
   * begin: it says which floor when a Warp started the run above floor 1. */
  private retryButton(id: string) {
    const height = this.ctx.game.retryHeight;
    if (height === null) return "";
    return `<button id="${id}">${height ? `Retry from floor ${displayedProgress(height)}` : "Retry"}</button>`;
  }

  private show(cause: RunEndCause) {
    const ctx = this.ctx, { game, modal } = ctx;
    const words = MODES[game.mode].words, slice = game.save[game.mode];
    const where = `${words.progress} ${displayedProgress(game.run.height, !!game.run.outside)}`;
    const kept = "Milestone rewards and the Gold found are already saved.";
    const stats = this.stats();
    if (cause === "fallen") {
      const undos = game.canUndo ? game.undosLeft : 0, by = slice.fall?.by;
      // Undo goes unmentioned until Rehearsed steps unlocks it.
      const takeBack = !loadout(game.save).undoCapacity ? ""
        : undos ? `<p>Undo takes back the fight, and the hand waits for you.</p>`
        : `<p class="hint">No undo is left to take the fight back.</p>`;
      const button = undos ? `<button id="defeat-undo">Undo (${undos} left)</button>` : "";
      // Encourages another run: the next one is a new layout, and what this one earned can make the hero stronger.
      const again = `<p>Look over what this ${words.run} earned, spend it to grow stronger, and try again: the ${words.tierName} will shift to a new layout for your next ${words.run}.</p>`;
      modal.innerHTML = `<span class="summary-icon">${uiSprite("revive")}</span><small>FALLEN IN COMBAT</small><h2>Regroup and try again.</h2><p>${by ? `Felled by ${by}` : "Felled"} at ${where}. ${kept}</p>${stats}${again}${takeBack}<div class="dialog-actions">${button}<button id="defeat-accept">Return to entrance</button>${this.retryButton("defeat-retry")}</div>`;
      modal.showModal();
      this.bindNotes();
      // Undo, or else return to the entrance: however the dialog closes,
      // even dismissed by the browser itself (a phone's Back, or coming back
      // to the tab, can close it past the cancel guard), the hero never stays
      // fallen on the floor with no dialog to answer.
      let undoing = false, retrying = false;
      const undo = document.querySelector<HTMLButtonElement>("#defeat-undo");
      if (undo) undo.onclick = () => ((undoing = true), modal.close());
      el("defeat-accept").onclick = () => modal.close();
      const retry = document.querySelector<HTMLButtonElement>("#defeat-retry");
      if (retry) retry.onclick = () => ((retrying = true), modal.close());
      modal.addEventListener("close", () => {
        if (undoing) game.undo();
        else if (retrying) {
          if (game.retry("Fallen in combat")) this.fadeInFromBlack();
        } else if (game.acceptDefeat()) this.fadeInFromBlack();
        ctx.navigate(game.mode);
      }, { once: true });
      return;
    }
    const [label, title, why] = cause === "stuck"
      ? ["NO CARD CAN ACT", `End this ${words.run}?`, `Nothing in your hand can act at ${where}. `]
      : [words.endRun.toUpperCase(), `End this ${words.run}?`, `End the current ${words.run} at ${where}. `];
    const blocked = cause === "stuck" ? stuckBlock(game) : "";
    modal.innerHTML = `<small>${label}</small><h2>${title}</h2><p>${why}${kept}</p>${blocked}${stats}<div class="dialog-actions"><button id="cancel">${words.keepGoing}</button><button id="confirm">${words.endRun}</button>${this.retryButton("retry")}</div>`;
    modal.showModal();
    this.bindNotes();
    el("cancel").onclick = () => modal.close();
    el("confirm").onclick = () => {
      modal.close();
      game.finish(`${capitalized(words.run)} ended`);
      ctx.navigate(game.mode);
    };
    const retry = document.querySelector<HTMLButtonElement>("#retry");
    if (retry) retry.onclick = () => {
      modal.close();
      game.retry(`${capitalized(words.run)} ended`);
      ctx.navigate(game.mode);
    };
  }
}

import type { Game } from "../state.ts";
import { TRAINING, TRAINING_GROUPS, trainingOpen, type TrainingId } from "../config.ts";
import { runTrainingOffer, runTrainingValue } from "../run-training.ts";
import { trainingText } from "../loadout.ts";
import { el, itemSprite, POINTER_SVG, uiSprite } from "./dom.ts";
import { flashRed } from "./hud.ts";

type Group = keyof typeof TRAINING_GROUPS;
/** Each group's button icon. */
const GROUP_ICONS: Record<Group, string> = {
  offense: itemSprite("upgrade_attack", "ui-sprite group-sprite"),
  defense: itemSprite("upgrade_defense", "ui-sprite group-sprite"),
  utility: uiSprite("gold", "ui-sprite group-sprite"),
};
const silverIcon = () => uiSprite("gold", "ui-sprite silver-sprite");

/** The run's training bar under the hand: a wide button for each Training
 * group. Pressing one shows that group's rows in the hand's place, a card
 * each, scrolled sideways, to buy a rank for this run with Silver; pressing
 * it again brings the hand back. Pressing or hovering a card's face shows
 * what it trains and its level. The bar shows once On the Job is owned;
 * the first run after it teaches the bar (`lesson`): a note over the hand
 * and a hand pointing at a group button, until the player opens a group
 * and closes it again. */
export class RunTrainingBar {
  /** The group shown in the hand's place, if any. */
  private open: Group | null = null;
  /** The rows the cards were last built for. */
  private shown = "";
  /** The card whose details show, if any. */
  private tipFor: HTMLElement | null = null;
  /** Whether the player opened a group while the lesson showed: closing it
   * then finishes the lesson. */
  private triedGroup = false;

  constructor(private game: Game, private changed: () => void) {
    const bar = el("training-bar");
    bar.innerHTML = (Object.entries(TRAINING_GROUPS) as [Group, string][])
      .map(([group, name]) => `<button type="button" data-run-group="${group}" aria-pressed="false">${GROUP_ICONS[group]}<span>${name}</span></button>`)
      .join("");
    bar.onclick = (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-run-group]");
      if (!button || button.disabled) return;
      const group = button.dataset.runGroup as Group;
      this.open = this.open === group ? null : group;
      if (this.lesson) {
        if (this.open) this.triedGroup = true;
        else if (this.triedGroup) this.game.save.tutorials.onTheJob = true;
      }
      this.hideTip();
      this.changed();
    };
    const cards = el("run-drills");
    cards.onclick = (e) => {
      const target = e.target as HTMLElement, buy = target.closest<HTMLButtonElement>("[data-run-train]");
      if (buy) {
        if (!this.game.trainInRun(buy.dataset.runTrain as TrainingId)) flashRed(buy);
        this.changed();
        this.refreshTip();
        return;
      }
      const card = target.closest<HTMLElement>(".drill-card");
      if (card) this.showTip(card);
    };
    cards.addEventListener("pointerover", (e) => {
      if (e.pointerType !== "mouse") return;
      const card = (e.target as HTMLElement).closest<HTMLElement>(".drill-card");
      if (card && card !== this.tipFor) this.showTip(card);
    });
    cards.addEventListener("pointerleave", () => this.hideTip());
    cards.addEventListener("scroll", () => this.hideTip());
    // With no scrollbar shown, a mouse wheel scrolls the cards sideways.
    cards.addEventListener("wheel", (e) => {
      if (!e.deltaY || cards.scrollWidth <= cards.clientWidth) return;
      cards.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });
  }

  /** Shows the bar inside a run, and the open group's cards in the hand's place. */
  render() {
    const game = this.game, inside = !game.run.outside && game.trainsOnTheJob;
    el("training-bar").hidden = !inside;
    if (!inside) this.open = null;
    if (this.open && !this.rows(this.open).length) this.open = null;
    document.querySelectorAll<HTMLButtonElement>("[data-run-group]").forEach((b) => {
      const group = b.dataset.runGroup as Group, open = this.rows(group).length > 0;
      b.disabled = !open;
      b.title = open ? `${TRAINING_GROUPS[group]} training for this run, with Silver` : `No ${TRAINING_GROUPS[group]} training unlocked yet`;
      b.classList.toggle("selected", group === this.open);
      b.setAttribute("aria-pressed", String(group === this.open));
    });
    const rows = this.open ? this.rows(this.open) : [];
    document.querySelector("nav")!.classList.toggle("drilling", !!this.open);
    if (rows.join() !== this.shown) {
      this.shown = rows.join();
      this.hideTip();
      el("run-drills").innerHTML = rows.map((id) => {
        const row = TRAINING.find((t) => t.id === id)!;
        return `<div class="drill-card" role="listitem" data-drill="${id}"><b class="drill-name">${row.name}</b><span class="drill-value"></span><button type="button" class="drill-buy" data-run-train="${id}"></button></div>`;
      }).join("");
    }
    for (const id of rows) this.fill(id);
    this.renderLesson(inside);
  }

  /** Whether the bar's lesson waits: the first run inside after On the Job. */
  private get lesson() {
    return !!this.game.save.upgrades.onTheJob && !this.game.save.tutorials.onTheJob;
  }

  /** The lesson's note, over the hand, and its hand pointing down at the
   * open group's button, or the first that opens. */
  private renderLesson(inside: boolean) {
    const bar = el("training-bar");
    let note = bar.querySelector<HTMLElement>(".job-tip"), pointer = bar.querySelector<HTMLElement>(".job-pointer");
    if (!inside || !this.lesson) {
      note?.remove();
      pointer?.remove();
      return;
    }
    if (!note || !pointer) {
      bar.insertAdjacentHTML("beforeend", `<div class="job-tip" role="status"></div><span class="job-pointer${this.game.save.settings.reduceMotion ? " still" : ""}">${POINTER_SVG}</span>`);
      note = bar.querySelector<HTMLElement>(".job-tip")!;
      pointer = bar.querySelector<HTMLElement>(".job-pointer")!;
    }
    const text = this.open
      ? `<b>Training for this run</b><p>Press a card's price to buy a rank with ${silverIcon()} Silver. Press ${TRAINING_GROUPS[this.open].toUpperCase()} again to close it.</p>`
      : `<b>Train on the Job</b><p>Spend the ${silverIcon()} Silver you find on upgrades that raise your stats for the rest of this run. Press any of the three menus below to open it, and press it again to close it.</p>`;
    if (note.dataset.text !== text) {
      note.dataset.text = text;
      note.innerHTML = text;
    }
    // The hand above lifts the note clear of its cards.
    note.style.bottom = `${document.querySelector("nav")!.offsetHeight + 8}px`;
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-run-group]"));
    const at = buttons.find((b) => b.dataset.runGroup === this.open) ?? buttons.find((b) => !b.disabled) ?? buttons[0];
    // The buttons share the bar's width, so a share of it stays right as the window resizes.
    pointer.style.left = `${((buttons.indexOf(at) + 0.5) / buttons.length) * 100}%`;
  }

  /** The rows of `group` the hero can train. */
  private rows(group: Group): TrainingId[] {
    return TRAINING.filter((t) => t.group === group && trainingOpen(t, this.game.save.upgrades)).map((t) => t.id);
  }

  /** One card's value and price, its button faded while the Silver isn't
   * there, and the whole card greyed at its highest. */
  private fill(id: TrainingId) {
    const game = this.game, card = document.querySelector<HTMLElement>(`[data-drill="${id}"]`)!;
    const offer = runTrainingOffer(game.save, game.run, id), { value, unit } = runTrainingValue(game.save, game.run, id);
    const short = !offer.maxed && !game.free && game.silver < offer.price;
    card.classList.toggle("short", short);
    card.classList.toggle("maxed", offer.maxed);
    card.querySelector(".drill-value")!.textContent = trainingText(value, unit);
    const buy = card.querySelector<HTMLButtonElement>(".drill-buy")!;
    const label = offer.maxed ? "Max" : `${silverIcon()}<b>${offer.price.toLocaleString("en-US")}</b>`;
    if (buy.dataset.label !== label) {
      buy.dataset.label = label;
      buy.innerHTML = label;
    }
    buy.disabled = offer.maxed || short;
    buy.setAttribute("aria-label", offer.maxed ? `${offer.row.name} is at its highest level` : `Train ${offer.row.name} for this run for ${offer.price} Silver`);
  }

  private showTip(card: HTMLElement) {
    this.tipFor = card;
    this.refreshTip();
  }
  /** The card's name, what it trains, and its level of the most it reaches,
   * over the card. */
  private refreshTip() {
    const card = this.tipFor, tip = el("drill-tip");
    if (!card?.isConnected) return this.hideTip();
    const offer = runTrainingOffer(this.game.save, this.game.run, card.dataset.drill as TrainingId);
    tip.innerHTML = `<b>${offer.row.name}</b><p>${offer.row.description}</p><small>Level ${offer.level} of ${offer.max.toLocaleString("en-US")}${offer.bought ? ` · ${offer.bought} bought this run` : ""}</small>`;
    tip.hidden = false;
    const box = card.getBoundingClientRect(), width = tip.offsetWidth;
    tip.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, box.left + box.width / 2 - width / 2))}px`;
    tip.style.top = `${Math.max(8, box.top - tip.offsetHeight - 8)}px`;
  }
  private hideTip() {
    this.tipFor = null;
    el("drill-tip").hidden = true;
  }
}

import type { Game } from "../state.ts";
import { TRAINING, TRAINING_GROUPS, trainingOpen, type TrainingId } from "../config.ts";
import { runTrainingBulk, runTrainingOffer, runTrainingValue } from "../run-training.ts";
import { buyQuantityHtml, readQuantity, runCount } from "./buy-quantity-select.ts";
import { trainingText } from "../loadout.ts";
import { el, itemSprite, POINTER_SVG, uiSprite } from "./dom.ts";
import { sparkRed } from "./hud.ts";

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
 * and a hand pointing at a group button, the hand paused, until the
 * player opens a group and closes it again. */
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
  /** Whether the lesson paused the hand when it began: finishing the lesson
   * sets it playing again. */
  private pausedForLesson = false;

  constructor(private game: Game, private changed: () => void) {
    const bar = el("training-bar");
    bar.innerHTML = (Object.entries(TRAINING_GROUPS) as [Group, string][])
      .map(([group, name]) => `<button type="button" data-run-group="${group}" aria-pressed="false">${GROUP_ICONS[group]}<span>${name}</span></button>`)
      .join("") + `<span class="run-buy-quantity"></span>`;
    // Buy Quantity, at the right of the group buttons once the skill is owned.
    bar.onchange = (e) => {
      const select = (e.target as HTMLElement).closest<HTMLSelectElement>("[data-buy-quantity]");
      if (!select) return;
      this.game.setBuyQuantity(readQuantity(select.value), "run");
      this.changed();
    };
    bar.onclick = (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-run-group]");
      if (button && !button.disabled) this.toggleGroup(button.dataset.runGroup as Group);
    };
    this.bindCards(el("run-drills"));
  }

  /** Opens `group` in the hand's place, or closes it; in the lesson,
   * closing a group opened finishes it. */
  private toggleGroup(group: Group) {
    this.open = this.open === group ? null : group;
    if (this.lesson && this.open) this.triedGroup = true;
    else if (this.lesson && this.triedGroup) this.finishLesson();
    this.hideTip();
    this.changed();
  }

  /** A card's price buys a rank (red sparks when it can't); its face, or a
   * mouse over it, shows its details. */
  private bindCards(cards: HTMLElement) {
    cards.onclick = (e) => {
      const target = e.target as HTMLElement, buy = target.closest<HTMLButtonElement>("[data-run-train]");
      if (buy) return this.buy(buy);
      const card = target.closest<HTMLElement>(".drill-card");
      if (card) this.showTip(card);
    };
    cards.addEventListener("pointerover", (e) => {
      if (e.pointerType !== "mouse") return;
      const card = (e.target as HTMLElement).closest<HTMLElement>(".drill-card");
      if (card && card !== this.tipFor) this.showTip(card);
    });
    // A mouse leaving the card hides its details, even into the strip's
    // empty space past the last card.
    cards.addEventListener("pointerout", (e) => {
      if (e.pointerType !== "mouse" || !this.tipFor) return;
      if (!this.tipFor.contains(e.relatedTarget as Node | null)) this.hideTip();
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

  private buy(button: HTMLButtonElement) {
    if (!this.game.trainInRun(button.dataset.runTrain as TrainingId, this.game.buyQuantityFor("run"))) sparkRed(button, this.game.save.settings.reduceMotion);
    this.changed();
    this.refreshTip();
  }

  /** Shows the bar inside a run, and the open group's cards in the hand's place. */
  render() {
    const game = this.game, inside = !game.run.outside && game.trainsOnTheJob;
    el("training-bar").hidden = !inside;
    // A group closes outside a run, or once none of its rows can train.
    if (!inside || (this.open && !this.rows(this.open).length)) this.open = null;
    this.renderGroups();
    this.renderQuantity();
    const rows = this.open ? this.rows(this.open) : [];
    document.querySelector("nav")!.classList.toggle("drilling", !!this.open);
    this.renderCards(rows);
    this.renderLesson(inside);
  }

  /** Each group's button: closed with no rows to train, lit while open. */
  private renderGroups() {
    document.querySelectorAll<HTMLButtonElement>("[data-run-group]").forEach((b) => {
      const group = b.dataset.runGroup as Group, open = this.rows(group).length > 0;
      b.disabled = !open;
      b.title = open ? `${TRAINING_GROUPS[group]} training for this run, with Silver` : `No ${TRAINING_GROUPS[group]} training unlocked yet`;
      b.classList.toggle("selected", group === this.open);
      b.setAttribute("aria-pressed", String(group === this.open));
    });
  }

  /** The Buy Quantity dropdown, built again only when its choices change. */
  private renderQuantity() {
    const slot = el("training-bar").querySelector<HTMLElement>(".run-buy-quantity")!;
    const html = buyQuantityHtml(this.game.buyQuantities, this.game.buyQuantityFor("run"));
    if (slot.dataset.html !== html) {
      slot.dataset.html = html;
      slot.innerHTML = html;
    }
    slot.hidden = !html;
  }

  /** The open group's cards, built again only when its rows change. */
  private renderCards(rows: TrainingId[]) {
    if (rows.join() !== this.shown) {
      this.shown = rows.join();
      this.hideTip();
      el("run-drills").innerHTML = rows.map((id) => {
        const row = TRAINING.find((t) => t.id === id)!;
        return `<div class="drill-card" role="listitem" data-drill="${id}"><b class="drill-name">${"short" in row ? row.short : row.name}</b><span class="drill-value"></span><button type="button" class="drill-buy" data-run-train="${id}"></button></div>`;
      }).join("");
    }
    for (const id of rows) this.fill(id);
  }

  /** Ends the lesson, and plays the hand on if the lesson paused it. */
  private finishLesson() {
    this.game.save.tutorials.onTheJob = true;
    if (this.pausedForLesson && !this.game.auto) this.game.toggleAuto();
    this.pausedForLesson = false;
  }

  /** Whether the bar's lesson waits: the first run inside after On the Job. */
  private get lesson() {
    return !!this.game.save.upgrades.onTheJob && !this.game.save.tutorials.onTheJob;
  }

  /** The lesson's note, over the hand, and its hand pointing down at the
   * open group's button, or the first that opens. */
  private renderLesson(inside: boolean) {
    const bar = el("training-bar");
    if (!inside || !this.lesson) {
      bar.querySelector(".job-tip")?.remove();
      bar.querySelector(".job-pointer")?.remove();
      return;
    }
    const { note, pointer } = this.lessonParts(bar), text = this.lessonText();
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

  /** The lesson's note and pointing hand, laid over the bar when it
   * begins; beginning pauses the hand, so the player can take it in. */
  private lessonParts(bar: HTMLElement) {
    const note = bar.querySelector<HTMLElement>(".job-tip"), pointer = bar.querySelector<HTMLElement>(".job-pointer");
    if (note && pointer) return { note, pointer };
    bar.insertAdjacentHTML("beforeend", `<div class="job-tip" role="status"></div><span class="job-pointer${this.game.save.settings.reduceMotion ? " still" : ""}">${POINTER_SVG}</span>`);
    if (this.game.auto) {
      this.game.toggleAuto();
      this.pausedForLesson = true;
      // The HUD drew before the bar: redraw it with the hand paused.
      queueMicrotask(this.changed);
    }
    return { note: bar.querySelector<HTMLElement>(".job-tip")!, pointer: bar.querySelector<HTMLElement>(".job-pointer")! };
  }

  private lessonText() {
    return this.open
      ? `<b>Training for this run</b><p>Press a card's price to buy a rank with ${silverIcon()} Silver. Press ${TRAINING_GROUPS[this.open].toUpperCase()} again to close it.</p>`
      : `<b>Train on the Job</b><p>Spend the ${silverIcon()} Silver you find on upgrades that raise your stats for the rest of this run. Press any of the three menus below to open it, and press it again to close it.</p>`;
  }

  /** The rows of `group` the hero can train. */
  private rows(group: Group): TrainingId[] {
    return TRAINING.filter((t) => t.group === group && trainingOpen(t, this.game.save.upgrades)).map((t) => t.id);
  }

  /** One card's value and price (for the ranks the Buy Quantity buys, past
   * x1 their count in the button's corner), its button faded while the Silver isn't
   * there, and the whole card greyed at its highest. */
  private fill(id: TrainingId) {
    const game = this.game, card = document.querySelector<HTMLElement>(`[data-drill="${id}"]`)!;
    const offer = runTrainingOffer(game.save, game.run, id), { value, unit } = runTrainingValue(game.save, game.run, id);
    const q = game.buyQuantityFor("run"), bulk = runTrainingBulk(game.save, game.run, id, q, game.free ? Infinity : game.silver);
    const short = !offer.maxed && !bulk.affordable;
    card.classList.toggle("short", short);
    card.classList.toggle("maxed", offer.maxed);
    card.querySelector(".drill-value")!.textContent = trainingText(value, unit);
    const buy = card.querySelector<HTMLButtonElement>(".drill-buy")!;
    const label = offer.maxed ? "Max" : `${runCount(q, bulk.count)}${silverIcon()}<b>${bulk.cost.toLocaleString("en-US")}</b>`;
    if (buy.dataset.label !== label) {
      buy.dataset.label = label;
      buy.innerHTML = label;
    }
    // Short of Silver it still answers a press, with red sparks.
    buy.disabled = offer.maxed;
    buy.setAttribute("aria-label", offer.maxed ? `${offer.row.name} is at its highest level` : `Train ${offer.row.name} for this run, ${bulk.count === 1 ? "one rank" : `${bulk.count} ranks`}, for ${bulk.cost} Silver`);
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

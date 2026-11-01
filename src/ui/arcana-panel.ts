import { arcanum, enhancementsOf, levelsOf, nextStep, valuesAt, type ArcanumId, type AttributeLevels } from "../arcana/arcana.ts";
import type { HeldArcanum } from "../game/arcana-desk.ts";
import type { AppContext } from "./app.ts";
import { askForArcanite, closesOnBackdrop, confirmAction, helpButton, showHelp } from "./dialogs.ts";
import { arcaniteIcon, el } from "./dom.ts";
import { priceAmount } from "./hud.ts";
import { shortAmount } from "../whole.ts";

/** Each arcanum's picture. */
export const ARCANUM_ICONS: Record<ArcanumId, string> = {
  aurumBloom: `<svg class="arcanum-icon" viewBox="0 0 24 24" aria-hidden="true"><g fill="#f0c34a" stroke="#10151c" stroke-width="1.2">${[0, 60, 120, 180, 240, 300].map((turn) => `<ellipse cx="12" cy="6.2" rx="3.2" ry="5" transform="rotate(${turn} 12 12)"/>`).join("")}</g><circle cx="12" cy="12" r="3.4" fill="#fff4c2" stroke="#10151c" stroke-width="1.2"/></svg>`,
  thunderbolt: `<svg class="arcanum-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 1.5L5 13.5h5.5L8.5 22.5 19.5 9.5h-6z" fill="#fff" stroke="#10151c" stroke-width="1.4" stroke-linejoin="miter"/></svg>`,
  overseer: `<svg class="arcanum-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12L3 2.5h7.5zM12 12l9 9.5h-7.5z" fill="#fff4c2" stroke="#10151c" stroke-width="1.1" stroke-linejoin="round"/><path d="M3 12s3.6-5 9-5 9 5 9 5-3.6 5-9 5-9-5-9-5z" fill="#f4f7ff" stroke="#10151c" stroke-width="1.3" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.2" fill="#5fb3d9" stroke="#10151c" stroke-width="1.1"/><circle cx="12" cy="12" r="1.2" fill="#10151c"/></svg>`,
  lifespring: `<svg class="arcanum-icon" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke-linecap="butt"><circle cx="12" cy="12" r="9.6" stroke="#10151c" stroke-width="3.6"/><circle cx="12" cy="12" r="9.6" stroke="#62f29a" stroke-width="1.8" stroke-dasharray="13 2.1 9 1.7 20 1.7" /><circle cx="12" cy="12" r="6.4" stroke="#10151c" stroke-width="3.4"/><circle cx="12" cy="12" r="6.4" stroke="#b5ffd2" stroke-width="1.6" stroke-dasharray="8 1.6 11 1.8 16.8 1" stroke-dashoffset="6"/></g><path d="M12 7.6c2.4 2.8 3.3 4.3 3.3 5.7a3.3 3.3 0 0 1-6.6 0c0-1.4.9-2.9 3.3-5.7z" fill="#62f29a" stroke="#10151c" stroke-width="1.1" stroke-linejoin="round"/></svg>`,
  timeDilation: `<svg class="arcanum-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.2" fill="#8fd8ff" fill-opacity=".28" stroke="#10151c" stroke-width="3"/><circle cx="12" cy="12" r="10.2" fill="none" stroke="#8fd8ff" stroke-width="1.4"/><path d="M7.5 5.5h9v1.6L13 12l3.5 4.9v1.6h-9v-1.6L11 12 7.5 7.1z" fill="#f4f7ff" stroke="#10151c" stroke-width="1.2" stroke-linejoin="round"/><path d="M9.6 7.4h4.8L12 10.8zM8.9 17.2L12 14.6l3.1 2.6z" fill="#8fd8ff"/></svg>`,
  ricochetShot: `<svg class="arcanum-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 19.5L9.5 5l5 11 7-9" fill="none" stroke="#10151c" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.5 19.5L9.5 5l5 11 7-9" fill="none" stroke="#f4f7ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.5" cy="5" r="2.2" fill="#ff8f6b"/><circle cx="14.5" cy="16" r="2.2" fill="#ff8f6b"/><path d="M21.5 7l-.6 4-3.2-2.4z" fill="#ffd34d"/></svg>`,
};

/** The price of a purchase: its amount, then the Arcanite icon. */
const price = (amount: number) => `<span class="price"><b>${priceAmount(amount)}</b>${arcaniteIcon()}</span>`;

/** A table of rows in a rounded box under `heading`, if it has any. */
const boxedTable = (heading: string, rows: readonly (readonly [string, string])[]) => rows.length
  ? `<div class="arcana-box"><h3>${heading}</h3><table class="arcana-table"><tbody>${rows.map(([name, value]) => `<tr><td>${name}</td><td>${value}</td></tr>`).join("")}</tbody></table></div>`
  : "";

/** The top of an arcanum's information: its name, its icon, what it does. */
const aboutHtml = (id: ArcanumId, levels: AttributeLevels) =>
  `<h2>${arcanum(id).name}</h2><div class="arcana-info-icon">${ARCANUM_ICONS[id]}</div><p>${arcanum(id).summary(valuesAt(id, levels))}</p>`;

/** The Gear page's Arcana tab: the button that opens a choice of arcana, and
 * each one bought in a row of its attributes to upgrade. */
export class ArcanaPanel {
  constructor(private ctx: AppContext, private changed: () => void) {}

  private get desk() {
    return this.ctx.game.arcana;
  }

  html() {
    const desk = this.desk, cost = desk.price;
    const select = cost === null ? "" : `<button id="arcana-select" class="arcana-select${desk.affords(cost) ? "" : " short"}" aria-label="Select Arcanum, ${cost} Arcanite">Select Arcanum ${price(cost)}</button>`;
    return `<div class="arcana-head"><h3>Arcana</h3>${helpButton("About Arcana", "arcana-help")}</div>${select}${desk.owned.map((id) => this.rowHtml(id)).join("")}`;
  }

  private rowHtml(id: ArcanumId) {
    const levels = levelsOf(this.ctx.game.save.arcana, id);
    return `<article class="arcana-row" data-arcana-row="${id}"><h3>${arcanum(id).name}</h3><div class="arcana-row-body"><div class="arcana-row-icon">${ARCANUM_ICONS[id]}</div>${arcanum(id).attributes.map((a, i) => {
      const next = nextStep(id, i, levels[i]!), value = a.steps[levels[i]!]![0];
      const state = !next ? " maxed" : this.desk.affords(next.cost) ? "" : " short";
      return `<button class="arcana-attr${state}" data-arcana-up="${id}:${i}" aria-label="${a.name}, ${a.shown(value)}, ${next ? `upgrade for ${next.cost} Arcanite` : "at its highest level"}"><span class="arcana-attr-name">${a.name}</span><b>${a.shown(value)}</b><hr><span class="arcana-attr-cost">${next ? price(next.cost) : "Max"}</span></button>`;
    }).join("")}</div></article>`;
  }

  bind() {
    const { ctx, desk } = this, gear = el("gear");
    el("arcana-help").onclick = () => showHelp(ctx, "GEAR", "Arcana", `<p>Arcana are mighty spells bought with Arcanite and kept for good. Each has three attributes to upgrade.</p><p>Each new arcanum is chosen from up to three drawn at random from those you don't own, each as likely as any other. The choice stays until you buy one or reroll it, and the next arcanum costs more the more you own.</p><p>Every arcanum you hold works at once in every run. Inside a run the Arcana tab switches each on and off, up to 40 times a run.</p><p class="hint">Arcanite comes from tournaments and the Shop.</p>`);
    const select = document.getElementById("arcana-select");
    if (select) select.onclick = () => (desk.affords(desk.price!) ? this.showChoice() : askForArcanite(ctx));
    gear.querySelectorAll<HTMLButtonElement>("[data-arcana-up]").forEach((b) => (b.onclick = () => {
      const [id, attribute] = b.dataset.arcanaUp!.split(":") as [ArcanumId, string], answer = desk.upgrade(id, Number(attribute));
      if (answer === "short") askForArcanite(ctx);
      if (answer === "done") this.changed();
    }));
    gear.querySelectorAll<HTMLElement>("[data-arcana-row]").forEach((row) => (row.onclick = (e) => {
      if (!(e.target as HTMLElement).closest("button")) showArcanum(ctx, row.dataset.arcanaRow as ArcanumId);
    }));
  }

  /** The choice waiting, to buy one from, or to reroll. A press outside it, or
   * leaving, keeps the choice as it is. */
  private showChoice() {
    const { ctx, desk } = this, modal = ctx.modal, reroll = desk.rerollPrice;
    modal.innerHTML = `<small>ARCANA</small><h2>Select an Arcanum</h2><div class="arcana-options">${desk.offer().map((id) =>
      `<button class="arcana-option" data-arcana-buy="${id}">${ARCANUM_ICONS[id]}<span><b>${arcanum(id).name}</b><small>${arcanum(id).summary(valuesAt(id, [0, 0, 0]))}</small></span></button>`).join("")}</div>${desk.canReroll
      ? `<div class="dialog-actions"><button id="arcana-reroll" class="${desk.affords(reroll) ? "" : "short"}" aria-label="Reroll, ${reroll} Arcanite">Reroll ${price(reroll)}</button></div>` : ""}`;
    if (!modal.open) modal.showModal();
    closesOnBackdrop(modal);
    modal.querySelectorAll<HTMLButtonElement>("[data-arcana-buy]").forEach((b) => (b.onclick = () => {
      const answer = desk.buy(b.dataset.arcanaBuy as ArcanumId);
      if (answer === "short") return askForArcanite(ctx);
      modal.close();
      if (answer === "done") this.changed();
    }));
    const button = document.getElementById("arcana-reroll");
    if (button) button.onclick = () => (desk.affords(reroll) ? this.askReroll() : askForArcanite(ctx));
  }

  /** Reroll, on confirmation: a new choice in place of this one. */
  private askReroll() {
    const { ctx, desk } = this, cost = desk.rerollPrice;
    confirmAction(ctx, { title: "Reroll the choice?", body: "A new set of Arcana takes the place of this one.", label: `Reroll · ${arcaniteIcon()} <b>${priceAmount(cost)}</b>`, cancel: "Cancel" }, () => {
      if (desk.reroll() !== "done") return;
      this.changed();
      this.showChoice();
    });
    el("confirm").setAttribute("aria-label", `Reroll for ${cost} Arcanite`);
  }
}

/** A bought arcanum's information, from its row: what it does, each attribute
 * now and at its next level, and what research has added to it. */
function showArcanum(ctx: AppContext, id: ArcanumId) {
  const levels = levelsOf(ctx.game.save.arcana, id), modal = ctx.modal;
  modal.innerHTML = `<div class="arcana-info">${aboutHtml(id, levels)}<table class="arcana-table"><thead><tr><th>Attribute</th><th>Now</th><th>Next</th></tr></thead><tbody>${arcanum(id).attributes.map((a, i) => {
    const next = nextStep(id, i, levels[i]!);
    return `<tr><td>${a.name}</td><td>${a.shown(a.steps[levels[i]!]![0])}</td><td>${next ? a.shown(next.value) : "Max"}</td></tr>`;
  }).join("")}</tbody></table>${boxedTable("Enhancements", enhancementsOf(id, ctx.game.save))}</div>`;
  modal.showModal();
  closesOnBackdrop(modal);
}

/** Lifespring's own tables on its card's information: the HP Pool now, and what its Effect Waves give. */
function lifespringTables(desk: AppContext["game"]["arcana"]) {
  const stats = desk.lifespringStats;
  if (!stats) return "";
  const { healthPerKill, healthLimit, amplify, gold, cells, defense } = stats.effects, factor = (n: number) => `${Number(n.toFixed(2))}×`;
  return boxedTable("Field", [["HP Pool", shortAmount(stats.pool)]]) + boxedTable("Effect Waves", [
    ["Health Bonus", `+${healthPerKill}% max HP a kill, ${factor(stats.health)} of ${factor(healthLimit)}`],
    ["Damage Amplification", `${factor(amplify)} a wave`],
    ["Gold Bonus", factor(gold)],
    ["Cell Bonus", factor(cells)],
    ["DEF Reduction", `${Number(defense.toFixed(2))}%`],
  ]);
}

/** An arcanum's information, from its card in a run: what it does, its stats,
 * and what modifies them, among them what its damage comes to. */
export function showHeldArcanum(ctx: AppContext, { id, levels, lent }: HeldArcanum, game: Pick<AppContext["game"], "crit" | "arcana" | "run" | "save"> = ctx.game) {
  const modal = ctx.modal, def = arcanum(id), crit = game.crit, value = game.arcana.cardValue({ id, levels, lent });
  const percent = (n: number) => `${Number(n.toFixed(2))}%`, factor = (n: number) => `×${Number(n.toFixed(2))}`;
  const modifiers: [string, string][] = def.damage ? [
    ["Hero ATK", shortAmount(game.run.player.attack)],
    ...(crit ? [["Critical Chance", percent(crit.chance)], ["Critical Factor", factor(crit.factor)]] as [string, string][] : []),
    ...(crit?.superCrit ? [["Super Crit Chance", percent(crit.superCrit.chance)], ["Super Crit Mult", factor(crit.superCrit.factor)]] as [string, string][] : []),
    ["Arcanum Damage", shortAmount(value.damage ?? 0)],
  ] : [];
  modal.innerHTML = `<div class="arcana-info">${aboutHtml(id, levels)}${lent ? `<p class="hint">A Shrine boon lends it for this climb.</p>` : ""}<table class="arcana-table"><tbody>${def.attributes.map((a, i) => `<tr><td>${a.name}</td><td>${a.shown(a.steps[levels[i]!]![0])}</td></tr>`).join("")}</tbody></table>${id === "lifespring" ? lifespringTables(game.arcana) : ""}${boxedTable("Modifiers", [...modifiers, ...enhancementsOf(id, game.save)])}</div>`;
  modal.showModal();
  closesOnBackdrop(modal);
}

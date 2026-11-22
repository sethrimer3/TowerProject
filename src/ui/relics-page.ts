import { controlIcon } from "./control-icon.ts";
import { PREVIEW_RELICS, RARITIES, RARITY_NAMES, RELICS, type RelicDef } from "../economy/relics.ts";
import { bonusText, relicText, relicTotals } from "../economy/relic-effects.ts";
import type { AppContext } from "./app.ts";
import { helpButton, showHelp } from "./dialogs.ts";
import { el, giftIcon, relicIcon } from "./dom.ts";
import { GIFT_RARITIES, GIFTS, giftCount, giftTotals } from "../economy/gifts.ts";
import { GIFT_STAT_NAMES, GIFT_TEXT } from "../economy/gift-effects.ts";
import { RARITIES as RARITY_TABLE } from "../shop/rarity.ts";
import { giftItemIcon } from "./gift-icons.ts";
import { relicButton } from "./relic-pop.ts";
import { seesAll } from "../access.ts";

/** The Relics screen (docs/EVENTS.md): every relic the player has won over
 * their career, small, in a grid for each rarity. Pressing one raises it
 * to the middle of the screen (`showRelic`). Its
 * ? tells where relics come from and totals their bonuses. Opened by the
 * Relics button in the forest's menu; its X returns to whichever page
 * opened it. In Dev mode placeholder relics join the grids, so they and
 * the pop-up can be seen before any relic exists. Above the relics, the
 * Gifts section (closed until opened, and kept so: `save.gifts.expanded`)
 * lists the gifts received, by rarity, each with how many are owned. */
export class RelicsPage {
  /** The page the screen was opened from, which its X returns to. */
  private from = "";

  constructor(private ctx: AppContext) {}

  /** Opens the screen, from page `from`. */
  open(from: string) {
    this.from = from;
    this.render();
  }

  /** The relics shown: those owned, then in Dev mode the placeholders. */
  private relics(): [string, RelicDef][] {
    const save = this.ctx.game.save;
    const owned = save.relics.filter((id) => RELICS[id]).map((id): [string, RelicDef] => [id, RELICS[id]!]);
    return seesAll(save) ? [...owned, ...Object.entries(PREVIEW_RELICS)] : owned;
  }

  render() {
    const relics = this.relics();
    const cell = ([id, r]: [string, RelicDef]) =>
      `<button class="relic-cell ${r.rarity}" data-relic="${id}" aria-label="${r.name}: ${relicText(r)}">${relicIcon(r)}<small>${r.name}</small></button>`;
    const section = (rarity: (typeof RARITIES)[number]) => {
      const these = relics.filter(([, r]) => r.rarity === rarity);
      return `<section class="relic-rarity ${rarity}" aria-label="${RARITY_NAMES[rarity]} relics"><h3>${RARITY_NAMES[rarity]}</h3>` +
        (these.length ? `<div class="relic-grid">${these.map(cell).join("")}</div>` : `<p class="hint">None yet.</p>`) + `</section>`;
    };
    el("relics").innerHTML =
      `<button class="missions-close" id="relics-close" aria-label="Close" title="Close">${controlIcon("close")}</button>` +
      `<div class="page-title"><small>KEEPSAKES OF EVENTS AND TOWERS</small><h2>Relics${helpButton("About relics", "relics-help")}</h2></div>` +
      this.giftsHtml() + RARITIES.map(section).join("");
    el("relics-close").onclick = () => this.ctx.navigate(this.from || "board");
    const gifts = el("relics-gifts") as HTMLDetailsElement;
    gifts.ontoggle = () => {
      if (this.ctx.game.save.gifts.expanded === gifts.open) return;
      this.ctx.game.save.gifts.expanded = gifts.open;
      this.ctx.save();
    };
    el("relics-help").onclick = () => this.showHelp();
    const byId = new Map(relics), reduceMotion = this.ctx.game.save.settings.reduceMotion;
    el("relics").querySelectorAll<HTMLButtonElement>("[data-relic]").forEach((b) => relicButton(b, byId.get(b.dataset.relic!)!, reduceMotion));
  }

  /** The Gifts section: its gift box and count in the heading, shown
   * closed too, then the gifts owned, a row each, grouped and coloured by rarity. */
  private giftsHtml() {
    const g = this.ctx.game.save.gifts, n = giftCount(g);
    const groups = GIFT_RARITIES.flatMap((rarity) => {
      const rows = Object.entries(GIFTS).filter(([id, d]) => d.rarity === rarity && g.owned[id]);
      if (!rows.length) return [];
      return [`<div class="gift-group ${rarity}" style="--rarity: ${RARITY_TABLE[rarity].color}"><h4>${RARITY_TABLE[rarity].displayName}</h4><ul>` +
        rows.map(([id, d]) => `<li class="gift-row" aria-label="${g.owned[id]} ${RARITY_TABLE[rarity].displayName} ${GIFT_STAT_NAMES[d.stat]} gifts: ${GIFT_TEXT[d.stat](d.percent)} each">${giftItemIcon(id)}<b class="gift-count">${g.owned[id]}x</b><span>${GIFT_TEXT[d.stat](d.percent)}</span></li>`).join("") +
        `</ul></div>`];
    });
    return `<details class="relic-gifts" id="relics-gifts"${g.expanded ? " open" : ""}><summary><h3>${giftIcon("gift-icon relic-gifts-icon")} Gifts${n ? ` <span class="gift-total">(${n})</span>` : ""}</h3></summary>` +
      `<p class="hint">Memories of the gifts you've received. Their bonuses stack multiplicatively alongside unique relics.</p>` +
      (groups.length ? groups.join("") : `<p class="hint">None yet. Every weekly mission prize holds one.</p>`) + `</details>`;
  }

  /** Where relics come from, and the bonuses of those owned, totalled by stat. */
  private showHelp() {
    const totals = relicTotals(this.ctx.game.save.relics);
    const table = totals.length
      ? `<table class="stats-table relic-totals"><thead><tr><th scope="col">Total bonus</th><th scope="col">Relics</th></tr></thead><tbody>` +
        totals.map((t) => `<tr><td>${bonusText(t.bonus)}</td><td>${t.count}</td></tr>`).join("") + `</tbody></table>`
      : `<p class="hint">No relics owned yet.</p>`;
    const gifts = giftTotals(this.ctx.game.save.gifts);
    const giftTable = gifts.length
      ? `<table class="stats-table relic-totals"><thead><tr><th scope="col">Gifts' bonus</th><th scope="col">Gifts</th></tr></thead><tbody>` +
        gifts.map((t) => `<tr><td>${GIFT_TEXT[t.stat](t.percent)}</td><td>${t.count}</td></tr>`).join("") + `</tbody></table>`
      : "";
    showHelp(this.ctx, "KEEPSAKES", "Relics",
      `<p>Every relic's bonus is permanent, and they all stack.</p>` +
      `<p>Win relics by making progress in the towers' Goals and in limited-time Events.</p>` + table +
      `<p>Gifts come in every weekly mission prize. Each gift's bonus adds to the others of its stat, and that total multiplies the relics' own, so neither dilutes the other.</p>` + giftTable);
  }
}

import { controlIcon } from "./control-icon.ts";
import { PREVIEW_RELICS, RARITIES, RARITY_NAMES, RELICS, type RelicDef } from "../economy/relics.ts";
import { bonusText, relicTotals } from "../economy/relic-effects.ts";
import type { AppContext } from "./app.ts";
import { helpButton, showHelp } from "./dialogs.ts";
import { el, relicIcon } from "./dom.ts";
import { relicButton } from "./relic-pop.ts";

/** The Relics screen (docs/EVENTS.md): every relic the player has won over
 * their career, small, in a grid for each rarity. Pressing one, or a mouse
 * resting on it, raises it to the middle of the screen (`showRelic`). Its
 * ? tells where relics come from and totals their bonuses. Opened by the
 * Relics button in the forest's menu; its X returns to whichever page
 * opened it. In Dev mode placeholder relics join the grids, so they and
 * the pop-up can be seen before any relic exists. */
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
    return save.settings.devMode ? [...owned, ...Object.entries(PREVIEW_RELICS)] : owned;
  }

  render() {
    const relics = this.relics();
    const cell = ([id, r]: [string, RelicDef]) =>
      `<button class="relic-cell ${r.rarity}" data-relic="${id}" aria-label="${r.name}: ${bonusText(r.bonus)}">${relicIcon(r)}<small>${r.name}</small></button>`;
    const section = (rarity: (typeof RARITIES)[number]) => {
      const these = relics.filter(([, r]) => r.rarity === rarity);
      return `<section class="relic-rarity ${rarity}" aria-label="${RARITY_NAMES[rarity]} relics"><h3>${RARITY_NAMES[rarity]}</h3>` +
        (these.length ? `<div class="relic-grid">${these.map(cell).join("")}</div>` : `<p class="hint">None yet.</p>`) + `</section>`;
    };
    el("relics").innerHTML =
      `<button class="missions-close" id="relics-close" aria-label="Close" title="Close">${controlIcon("close")}</button>` +
      `<div class="page-title"><small>KEEPSAKES OF EVENTS AND TOWERS</small><h2>Relics${helpButton("About relics", "relics-help")}</h2></div>` +
      RARITIES.map(section).join("");
    el("relics-close").onclick = () => this.ctx.navigate(this.from || "board");
    el("relics-help").onclick = () => this.showHelp();
    const byId = new Map(relics), reduceMotion = this.ctx.game.save.settings.reduceMotion;
    el("relics").querySelectorAll<HTMLButtonElement>("[data-relic]").forEach((b) => relicButton(b, byId.get(b.dataset.relic!)!, reduceMotion));
  }

  /** Where relics come from, and the bonuses of those owned, totalled by stat. */
  private showHelp() {
    const totals = relicTotals(this.ctx.game.save.relics);
    const table = totals.length
      ? `<table class="stats-table relic-totals"><thead><tr><th scope="col">Total bonus</th><th scope="col">Relics</th></tr></thead><tbody>` +
        totals.map((t) => `<tr><td>${bonusText(t.bonus)}</td><td>${t.count}</td></tr>`).join("") + `</tbody></table>`
      : `<p class="hint">No relics owned yet.</p>`;
    showHelp(this.ctx, "KEEPSAKES", "Relics",
      `<p>Every relic's bonus is permanent, and they all stack.</p>` +
      `<p>Win relics by making progress in the towers' Goals and in limited-time Events.</p>` + table);
  }
}

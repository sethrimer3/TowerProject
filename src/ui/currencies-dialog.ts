import { controlIcon } from "./control-icon.ts";
import { cellIcon, el, gemIcon, goldIcon, medalIcon, pointsIcon, shardIcon, ticketIcon, uiSprite } from "./dom.ts";
import { materialIcon } from "./equipment-icons.ts";
import { EQUIP_MATERIALS, EQUIP_MATERIAL_IDS } from "../equipment/catalog.ts";
import { trainingPoints } from "../progression/loadout.ts";
import { shortAmount, whole } from "../whole.ts";
import type { Game } from "../state.ts";

/** A currency held, as the currencies bar and its dialog show it: in full to
 * 9,999, then shortened (12.3K, 4.56M), ∞ in Dev mode. */
export const heldAmount = (game: Pick<Game, "save">, n: number) => game.save.settings.devMode ? "∞" : shortAmount(whole(n));

/** One line of the currencies dialog: the currency's icon, its name and the
 * amount held, shortened, with the exact amount for its tooltip. */
export type CurrencyRow = { id: string; icon: string; name: string; value: string; exact: string };

/** Every currency the player holds, in the dialog's order: Gold, Gems,
 * Ascension Shards, Medals, the run's Silver, Training Points, Inspiration
 * and Breakthrough, then Cells, Tickets and each Equipment material. Each shows
 * once the system behind it is open (all of them in Dev mode), so the list
 * never names what the player hasn't reached. */
export function currencyRows(game: Game): CurrencyRow[] {
  const save = game.save, dev = save.settings.devMode, outside = !!game.run.outside;
  const silver = outside ? game.startingSilver : game.silver;
  const rows: [boolean, string, string, string, number][] = [
    [true, "gold", goldIcon(), "Gold", save.gold],
    [true, "gems", gemIcon(), "Gems", save.gems],
    [true, "shards", shardIcon(), "Ascension Shards", save.ascensionShards],
    [true, "medals", medalIcon(), "Medals", save.medals],
    [!outside || silver > 0, "silver", uiSprite("gold", "ui-sprite silver-sprite"), outside ? "Silver (next run)" : "Silver", silver],
    [true, "training", pointsIcon(), "Training Points", trainingPoints(save).left],
    [true, "inspiration", uiSprite("inspiration"), "Inspiration", save.tower.inspiration],
    [!!save.upgrades.breakthrough, "breakthrough", uiSprite("breakthrough"), "Breakthrough", save.breakthrough],
    [save.profile.earned.cells > 0, "cells", cellIcon(), "Cells", save.cells],
    [game.tournament.unlocked, "tickets", ticketIcon(), "Tournament Tickets", save.tournament.tickets],
    ...EQUIP_MATERIAL_IDS.map((m): [boolean, string, string, string, number] =>
      [save.equipment.unlocked, `material-${m}`, materialIcon(m), EQUIP_MATERIALS[m].name, save.equipment.materials[m]]),
  ];
  return rows.filter(([open]) => open || dev).map(([, id, icon, name, n]) =>
    ({ id, icon, name, value: heldAmount(game, n), exact: dev ? "∞" : whole(n).toLocaleString("en-US") }));
}

/** The currencies bar's chevron opens this: every currency held, a row each,
 * in a table that scrolls, closed by the X at its top right. */
export function showCurrencies(modal: HTMLDialogElement, game: Game) {
  modal.innerHTML = `<div class="currencies-dialog"><button id="currencies-close" class="dialog-x" aria-label="Close" title="Close">${controlIcon("close")}</button><h2>Currencies</h2>
    <div class="currencies-scroll"><table class="stats-table currencies-table"><tbody>${currencyRows(game).map((r) =>
      `<tr data-currency="${r.id}" title="${r.name}: ${r.exact}"><th scope="row"><span class="currencies-icon">${r.icon}</span>${r.name}</th><td>${r.value}</td></tr>`).join("")}</tbody></table></div></div>`;
  el("currencies-close").onclick = () => modal.close();
  modal.showModal();
}

import { controlIcon } from "./control-icon.ts";
import type { LifetimeCurrency, Profile } from "../save/profile.ts";
import type { AppContext } from "./app.ts";
import { el } from "./dom.ts";
import { currencyAmount } from "./hud.ts";
import { copyButton, copyText } from "./run-notes-dialog.ts";
import { recentGoldPerHour, type OfflineSave } from "../offline-gold.ts";
import { shortAmount } from "../whole.ts";

/** Each currency's line in the table, in the order shown. */
const EARNED: [LifetimeCurrency, string][] = [
  ["gold", "Gold earned"],
  ["silver", "Silver earned"],
  ["gems", "Gems earned"],
  ["ascensionShards", "Ascension Shards earned"],
  ["cells", "Cells earned"],
  ["medals", "Medals earned"],
  ["inspiration", "Inspiration earned"],
  ["breakthrough", "Breakthrough earned"],
  ["tickets", "Tickets earned"],
];

/** A tally, rounded down: in full below a million, then shortened (1.23M). */
const amount = (n: number) => currencyAmount(Math.floor(n));
const created = (at: number) => (at ? new Date(at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "Unknown");

/** The Stats table's rows, label then value; with `offline`, the Recent
 * Gold per Hour after the Gold earned, shortened (12.3K). */
export function statsRows(p: Profile, offline?: OfflineSave): [string, string][] {
  const rgph: [string, string][] = offline ? [["Recent Gold per Hour", shortAmount(Math.floor(recentGoldPerHour(offline)), 1000)]] : [];
  return [
    ["Profile created", created(p.createdAt)],
    ...EARNED.flatMap(([c, label]): [string, string][] => [[label, amount(p.earned[c])], ...(c === "gold" ? rgph : [])]),
    ...(p.earned.trialPoints>0?[["Trial Points earned",amount(p.earned.trialPoints)] as [string,string]]:[]),
    ["Floors climbed", amount(p.floorsClimbed)],
    ["Training levels gained", amount(p.trainingLevels)],
    ["Research levels completed", amount(p.researchLevels)],
    ["Gold spent on Training", amount(p.trainingGold)],
    ["Gold spent on Research", amount(p.researchGold)],
  ];
}

/** The Settings page's Stats dialog: the player profile's lifetime tallies,
 * closed by the X at its top right, and copied as text by the button beside it. */
export function showStats(ctx: AppContext) {
  const modal = ctx.modal, rows = statsRows(ctx.game.save.profile, ctx.game.save.offline);
  modal.innerHTML = `<div class="stats-dialog"><button id="stats-close" class="dialog-x" aria-label="Close" title="Close">${controlIcon("close")}</button>${copyButton("stats-copy")}<small>PLAYER PROFILE</small><h2>Stats</h2>
    <table class="stats-table"><tbody>${rows.map(([label, value]) => `<tr><th scope="row">${label}</th><td>${value}</td></tr>`).join("")}</tbody></table></div>`;
  el("stats-close").onclick = () => modal.close();
  const copy = el("stats-copy") as HTMLButtonElement;
  copy.onclick = () => copyText(copy, ["Stats", "", ...rows.map(([label, value]) => `${label}: ${value}`)].join("\n"));
  modal.showModal();
}

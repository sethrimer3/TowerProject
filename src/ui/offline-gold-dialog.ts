import { hoursMinutes } from "../progression/archives.ts";
import type { OfflineGrant } from "../offline-gold.ts";
import { shortAmount } from "../whole.ts";
import { gemIcon, goldIcon } from "./dom.ts";

const short = (n: number) => shortAmount(Math.floor(n), 1000);

/** The Catacombs' line: the seconds the time away banked, a turn each. */
export const catacombLine = (seconds: number) =>
  `<p class="offline-sum offline-catacombs">Catacombs: <b>+${seconds.toLocaleString("en-US")}</b> banked turns (${hoursMinutes(seconds / 60)})</p>`;

/** The Offline Gold dialog: the time away (of the most that pays), and
 * the Recent Gold per Hour times the time paid for and the Offline Gold
 * Multiplier, making the Gold granted; and the Catacombs' turns banked
 * (`catacombSeconds`), the dialog's only line when no Gold is owed (no
 * `grant`). Claim, or closing it any other way, calls `claim` once. */
export function showOfflineGold(modal: HTMLDialogElement, grant: OfflineGrant | null, claim: () => void, catacombSeconds = 0) {
  const paidMinutes = grant ? Math.min(grant.awayMs, grant.capMs) / 60_000 : 0;
  const paid = grant ? [grant.gold > 0 ? `${grant.gold.toLocaleString("en-US")} Gold` : "", grant.gems > 0 ? `${grant.gems.toLocaleString("en-US")} Gems` : ""].filter(Boolean) : [];
  const turns = catacombSeconds > 0 ? `${catacombSeconds.toLocaleString("en-US")} banked Catacomb turns` : "";
  modal.innerHTML = `<div class="offline-gold"><small>WELCOME BACK</small><h2>${grant ? "Offline Gold" : "The Catacombs"}</h2>
    ${grant ? `<p class="offline-time">${hoursMinutes(grant.awayMs / 60_000)} offline (of ${hoursMinutes(grant.capMs / 60_000)} max)</p>` : ""}
    ${grant && grant.gold > 0 ? `<p class="offline-sum">Recent <b>${short(grant.rgph)}</b> ${goldIcon()} × ${hoursMinutes(paidMinutes)} × <b>${(grant.multiplier / 10).toFixed(1)}%</b> = <b>${short(grant.gold)}</b> ${goldIcon()}</p>` : ""}
    ${grant && grant.gems > 0 ? `<p class="offline-sum">Offline Gems: <b>${grant.gems.toLocaleString("en-US")}</b> ${gemIcon()}</p>` : ""}
    ${catacombSeconds > 0 ? catacombLine(catacombSeconds) : ""}
    <div class="dialog-actions"><button id="offline-claim" aria-label="Claim ${[...paid, turns].filter(Boolean).join(" and ")}">Claim</button></div></div>`;
  let claimed = false;
  const done = () => {
    if (claimed) return;
    claimed = true;
    modal.removeEventListener("close", done);
    claim();
  };
  modal.addEventListener("close", done);
  (modal.querySelector("#offline-claim") as HTMLButtonElement).onclick = () => modal.close();
  modal.showModal();
}

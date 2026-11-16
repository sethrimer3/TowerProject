import { controlIcon } from "./control-icon.ts";
import { checkIcon, el, onePieceIcon, starIcon, vipIcon } from "./dom.ts";
import {
  CHAMPION_BONUSES, CHAMPION_BONUS_IDS, CHAMPION_GEM_COOLDOWN, CHAMPION_OFFLINE_TIME, CHAMPION_PREMIUM_SHOWN, CHAMPION_XP, DAILY_TRAINING_POINTS,
  LATER_TIER_POINTS, TICKET_TIER, TIER_POINTS, bonusAt, championTier, claimTicket, ticketsEarned, ticketsWaiting, tierPoints,
  type ChampionBonusId,
} from "../shop/champion.ts";
import type { Save } from "../save/shape.ts";

// Champion Status on the Shop page: the banner over it for a Champion, with
// the VIP Points earned and the Champion's Club button, and the Club's
// dialog, every tier and what it gives, those reached in white with a check.

const points = (n: number) => n.toLocaleString("en-US");
/** A tier's name: "Base Tier", or "Tier 3" and a star. */
const tierName = (n: number) => (n ? `Tier ${n} ${starIcon()}` : "Base Tier");

/** The banner over the Shop page for a Champion: the status between two
 * stars, the thanks, the VIP Points earned and the Club's button. */
export function championBanner(save: Pick<Save, "entitlements" | "vip" | "champion">) {
  const tier = championTier(save);
  if (tier === null) return "";
  const waiting = ticketsWaiting(save);
  return `<section class="champion-status"><div class="champion-banner">${starIcon()}<b>Champion Status</b>${starIcon()}</div>
    <p class="champion-thanks">Thanks for your support! Enjoy!</p>
    <p class="champion-vip">${tierName(tier)} · <span title="VIP Points earned">${vipIcon()} <b>${points(save.vip)}</b></span></p>
    <button id="champion-club" class="champion-club-button${waiting ? " notify" : ""}">${starIcon()} Champion's Club</button></section>`;
}

/** What the bundle itself gives, each always the Champion's. */
const PERKS = [
  `×${CHAMPION_OFFLINE_TIME} Offline time max`, `+${CHAMPION_XP}% XP gain`, "Founder's Cape: +5% ATK and +5% DEF",
  `−${CHAMPION_GEM_COOLDOWN}s Gem button cooldown`, `Daily Training Points (${DAILY_TRAINING_POINTS} a day, on the Training page)`,
  `See the next ${CHAMPION_PREMIUM_SHOWN} Premium Offers`, "VIP Points raise permanent bonuses",
];

/** One bonus's line: its value now once reached, else its first value,
 * with how it grows and its cap. */
function bonusLine(id: ChampionBonusId, tier: number) {
  const b = CHAMPION_BONUSES[id], reached = tier >= b.tier;
  const sign = id === "gemCooldown" ? "−" : "+";
  const grows = b.step ? ` <small>(${sign}${b.step}${b.unit} a tier${b.cap !== undefined ? `, up to ${sign}${b.cap}${b.unit}` : ""})</small>` : "";
  return `<li class="${reached ? "reached" : ""}">${reached ? checkIcon() : ""}<span>${b.text(reached ? bonusAt(id, tier) : b.base)}${grows}</span></li>`;
}

/** The Club's tiers: the Base Tier and Tiers 1 to 13, each with what it
 * gives, then the One Piece Tickets' row for Tier 14 on. */
function clubHtml(save: Pick<Save, "entitlements" | "vip" | "champion">) {
  const tier = championTier(save) ?? 0;
  const next = tier + 1, toNext = tierPoints(next) - save.vip;
  const perks = `<section class="club-tier reached"><h3>${checkIcon()} Champion's Bundle</h3><ul>${PERKS.map((p) => `<li class="reached">${checkIcon()}<span>${p}</span></li>`).join("")}</ul></section>`;
  const tiers = Array.from({ length: TIER_POINTS.length + 1 }, (_, n) => {
    const reached = tier >= n, ids = CHAMPION_BONUS_IDS.filter((id) => CHAMPION_BONUSES[id].tier === n);
    const at = n ? `<small class="club-points">${vipIcon()} ${points(tierPoints(n))}</small>` : `<small class="club-points">With the bundle</small>`;
    return `<section class="club-tier${reached ? " reached" : ""}"><h3>${reached ? checkIcon() : ""}${tierName(n)}${at}</h3><ul>${ids.map((id) => bonusLine(id, tier)).join("")}</ul></section>`;
  }).join("");
  const earned = ticketsEarned(save), waiting = ticketsWaiting(save), open = earned > 0;
  const tickets = `<section class="club-tier${open ? " reached" : ""}"><h3>${open ? checkIcon() : ""}Tier ${TICKET_TIER}+ ${starIcon()}<small class="club-points">${vipIcon()} ${points(tierPoints(TICKET_TIER))}, then every ${points(LATER_TIER_POINTS)}</small></h3>
    <ul><li class="${open ? "reached" : ""}">${open ? checkIcon() : ""}<span>${onePieceIcon()} One Piece Ticket each tier: a free five-Star Unique, redeemed on the Equipment page. <b>${earned}</b> available, <b>${save.champion.ticketsClaimed}</b> claimed</span></li></ul>
    ${waiting ? `<button id="club-claim" class="club-claim">Claim ${onePieceIcon()} ${waiting > 1 ? `1 of ${waiting}` : "1"}</button>` : ""}</section>`;
  return `<div class="champion-club"><button id="club-close" class="dialog-x" aria-label="Close" title="Close">${controlIcon("close")}</button>
    <small>CHAMPION STATUS</small><h2>${starIcon()} Champion's Club ${starIcon()}</h2>
    <p class="club-now">${tierName(tier)} · ${vipIcon()} <b>${points(save.vip)}</b> VIP Points earned${` · ${points(toNext)} to Tier ${next}`}</p>
    <p class="hint">Each tier's bonus grows with every tier reached past it. They count even before the research, skill or card they add to is open.</p>
    <div class="club-scroll">${perks}${tiers}${tickets}</div></div>`;
}

/** Opens the Champion's Club on `modal`. `claimed` runs after a One Piece
 * Ticket is claimed (to save and redraw what shows it). */
export function showChampionClub(modal: HTMLDialogElement, save: Save, claimed: () => void) {
  const draw = () => {
    modal.innerHTML = clubHtml(save);
    el("club-close").onclick = () => modal.close();
    const claim = document.getElementById("club-claim");
    if (claim) claim.onclick = () => {
      if (claimTicket(save)) claimed();
      draw();
    };
  };
  draw();
  if (!modal.open) modal.showModal();
}

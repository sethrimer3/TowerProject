import { EQUIP_MATERIALS } from "../equipment/catalog.ts";
import type { MissionPayout } from "../game/mission-desk.ts";
import { MISSION_CAPACITY, MISSIONS, missionReward, WEEKLY_MAX, WEEKLY_REWARDS, weeklyReward } from "../missions/catalog.ts";
import { isComplete, nextPeriodAt, weekEndsAt, type Mission } from "../missions/progress.ts";
import { shortCountdown } from "../tournament/schedule.ts";
import type { AppContext } from "./app.ts";
import { checkIcon, el, gemIcon, giftIcon, goldIcon, medalIcon, shardIcon } from "./dom.ts";
import { materialIcon } from "./equipment-icons.ts";
import { currencyAmount } from "./hud.ts";
import { revealReward, type RewardShown } from "./reward-reveal.ts";

/** A countdown on the page: *2d 5h*, *7h 12m*, *12m*. */
const countdown = (ms: number) => shortCountdown(ms).replace(/([dh])(?=\d)/g, "$1 ");
const amount = (icon: string, n: number, title: string) =>
  `<span class="mission-reward" title="${title}">${icon}<b>${currencyAmount(n)}</b></span>`;

/** What a claim paid, risen to the middle of the screen: its Gold, the rest
 * written under it. */
function payoutShown(p: MissionPayout, kicker: string): RewardShown {
  const rest = [
    p.gems && `+${p.gems} Gems`,
    p.medals && `+${p.medals} Medals`,
    p.shards && `+${p.shards} Ascension Shards`,
    p.material && `+${p.material.amount} ${EQUIP_MATERIALS[p.material.id as keyof typeof EQUIP_MATERIALS].name}`,
  ].filter(Boolean);
  return { icon: goldIcon(), amount: `+${p.gold.toLocaleString("en-US")}`, kicker, name: "Gold", text: rest.join(" · ") || undefined, permanent: false };
}

/** What a weekly reward paid, one celebration a currency in turn: Gold,
 * Gems, Medals and Ascension Shards, each it paid any of. */
function weeklyShown(p: MissionPayout, missions: number): RewardShown[] {
  const kicker = "WEEKLY REWARD", text = `For ${missions} daily missions this week`;
  const each: [number, string, string][] = [
    [p.gold, goldIcon(), "Gold"], [p.gems, gemIcon(), "Gems"], [p.medals, medalIcon(), "Medals"], [p.shards, shardIcon(), "Ascension Shards"],
  ];
  return each.filter(([n]) => n > 0).map(([n, icon, name]) => ({ icon, amount: `+${n.toLocaleString("en-US")}`, kicker, name, text, permanent: false }));
}

/** The Missions screen (docs/MISSIONS.md): the week's rewards on a bar
 * filling to 35 daily missions claimed, a prize box over every fifth
 * (dim until reached, glowing while it can be claimed, checked once
 * claimed; pressed to claim), and the daily missions, each with its
 * progress, or *Complete!* and a Claim button. Opened by the Missions
 * button, in the forest's actions column or the run's menu; its X returns
 * to whichever page opened it. */
export class MissionsPage {
  /** The page the screen was opened from, which its X returns to. */
  private from = "";
  /** What the page last drew, but for the countdowns. */
  private shown = "";

  constructor(private ctx: AppContext) {}

  /** Opens the screen afresh, from page `from`. */
  open(from: string) {
    this.from = from;
    this.ctx.game.missions.refresh();
    this.render();
  }

  private state() {
    const m = this.ctx.game.save.missions;
    return JSON.stringify([m.list, this.ctx.game.missions.week, this.ctx.game.save.tower.tiersOpen]);
  }

  /** Every second while the screen shows: the countdowns, or the whole
   * screen once what it shows has changed (new missions given, a new week). */
  rerender() {
    if (!el("missions").classList.contains("active")) return;
    if (this.shown !== this.state()) return this.render();
    const next = document.getElementById("missions-next"), reset = document.getElementById("weekly-reset");
    if (next) next.innerHTML = this.nextText();
    if (reset) reset.textContent = this.resetText();
  }

  render() {
    const missions = this.ctx.game.missions;
    this.shown = this.state();
    const list = missions.list;
    el("missions").innerHTML =
      `<button class="missions-close" id="missions-close" aria-label="Close" title="Close">✕</button>` +
      `<div class="page-title"><small>NEW MISSIONS EVERY 8 HOURS</small><h2>Missions</h2></div>` +
      this.weekly() +
      `<p class="missions-next" id="missions-next">${this.nextText()}</p>` +
      (list.length
        ? `<ul class="mission-list">${list.map((m) => this.missionHtml(m)).join("")}</ul>`
        : `<p class="hint">No missions yet. New ones come every 8 hours.</p>`);
    this.bind();
  }

  /** When the next missions come, or that the list is full. */
  private nextText() {
    const missions = this.ctx.game.missions;
    if (missions.full) return `${missions.list.length}/${MISSION_CAPACITY} missions · ${missions.open < missions.list.length ? "claim" : "complete"} one to make room`;
    return `${missions.list.length}/${MISSION_CAPACITY} missions · 2 more in <b>${countdown(nextPeriodAt(missions.now) - missions.now)}</b>`;
  }

  private resetText() {
    const missions = this.ctx.game.missions;
    return `Resets in ${countdown(weekEndsAt(missions.week.id) - missions.now)}`;
  }

  /** The weekly rewards: the bar, and a box over every fifth mission. */
  private weekly() {
    const game = this.ctx.game, week = game.missions.week, done = Math.min(week.missions, WEEKLY_MAX);
    const boxes = WEEKLY_REWARDS.map((w, i) => {
      const claimed = week.claimed.includes(i), ready = game.missions.weeklyReady(i), r = weeklyReward(game.save, i);
      const state = claimed ? "claimed" : ready ? "ready" : "dim";
      const pays = [`${currencyAmount(r.gold)} Gold`, `${r.gems} Gems`, r.medals && `${r.medals} Medals`, r.shards && `${r.shards} Ascension Shards`].filter(Boolean).join(", ");
      const label = `${w.missions} missions: ${pays}${claimed ? " (claimed)" : ready ? " (claim)" : ""}`;
      return `<button class="weekly-box ${state}" data-weekly="${i}" style="--at:${(100 * w.missions) / WEEKLY_MAX}%" aria-label="${label}" title="${label}"${ready ? "" : " aria-disabled=\"true\""}>` +
        `<span class="weekly-prize">${giftIcon()}${claimed ? checkIcon() : ""}</span><small>${w.missions}</small></button>`;
    }).join("");
    return `<section class="weekly" aria-label="Weekly rewards"><div class="weekly-head"><b>Weekly rewards</b><small id="weekly-reset">${this.resetText()}</small></div>` +
      `<div class="weekly-track"><div class="weekly-boxes">${boxes}</div><div class="weekly-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${WEEKLY_MAX}" aria-valuenow="${done}"><i style="width:${(100 * done) / WEEKLY_MAX}%"></i></div></div>` +
      `<small class="weekly-count">${done}/${WEEKLY_MAX} daily missions claimed this week</small></section>`;
  }

  /** A daily mission: what it asks and pays, its progress bar (or
   * *Complete!*), and once complete its Claim button. */
  private missionHtml(m: Mission) {
    const def = MISSIONS[m.type], r = missionReward(this.ctx.game.save, m.material), complete = isComplete(m);
    const rewards = amount(gemIcon(), r.gems, "Gems") + amount(goldIcon(), r.gold, "Gold") +
      (r.materials ? amount(materialIcon(r.material), r.materials, EQUIP_MATERIALS[r.material].name) : "");
    const bar = `<div class="mission-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${def.target}" aria-valuenow="${m.progress}"><i style="width:${(100 * m.progress) / def.target}%"></i><span>${complete ? "Complete!" : `${m.progress}/${def.target}`}</span></div>`;
    return `<li class="mission${complete ? " complete" : ""}"><div class="mission-body"><b class="mission-text">${def.text}</b><div class="mission-rewards">${rewards}</div>${bar}</div>` +
      (complete ? `<button class="mission-claim" data-claim="${m.id}">Claim</button>` : "") + `</li>`;
  }

  private bind() {
    const ctx = this.ctx, game = ctx.game;
    el("missions-close").onclick = () => ctx.navigate(this.from || "board");
    el("missions").querySelectorAll<HTMLButtonElement>("[data-claim]").forEach((b) => (b.onclick = () => {
      const paid = game.missions.claim(Number(b.dataset.claim));
      if (paid) this.claimed(payoutShown(paid, "MISSION COMPLETE"));
    }));
    el("missions").querySelectorAll<HTMLButtonElement>("[data-weekly]").forEach((b) => (b.onclick = () => {
      const i = Number(b.dataset.weekly), paid = game.missions.claimWeekly(i);
      if (paid) this.claimed(...weeklyShown(paid, WEEKLY_REWARDS[i]!.missions));
    }));
  }

  /** A reward claimed: saved, redrawn, and risen to the middle of the
   * screen, each of `shown` after the one before is pressed away. */
  private claimed(...shown: RewardShown[]) {
    this.ctx.update();
    this.render();
    const next = (i: number) => {
      if (shown[i]) revealReward(shown[i]!, this.ctx.game.save.settings.reduceMotion, () => next(i + 1));
    };
    next(0);
  }
}

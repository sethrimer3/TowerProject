import { CHECKPOINTS, UNLOCK_NAMES, areaCleared, checkpoint, areaMastered, canWarp, floorsCompleted, goalState, passFor, passTotals, unlockFloor, warpUnlocked, type Checkpoint, type GoalReward, type GoalState, type GoalUnlock, type Pass } from "../goals.ts";
import { CURRENCIES, type CurrencyId } from "../shop/currency.ts";
import { owns } from "../shop/entitlements.ts";
import { stubServer, type ShopServer } from "../shop/server.ts";
import { CLEARED_INSPIRATION } from "../tower/area-ledger.ts";
import { tierNumeral, tierRewardText, tierStats } from "../tiers.ts";
import type { AppContext } from "./app.ts";
import { el, gemIcon, goldIcon } from "./dom.ts";

// The Goals screen: each tower drawn as a stone column rising from the
// ground, a line up its middle lit to the highest floor completed, and a
// checkpoint every ten floors with its reward on the left and its premium
// reward on the right. Beside a checkpoint's floor, a golden swirl once its
// area is mastered (with Warp owned: it can be warped to) and a green check
// once it is cleared. Opened from the forest's Goals button (Tower only).

/** Pixels per floor up the tower, the ground under floor 0, and the tower
 * standing on past the last checkpoint, off the top. */
const FLOOR_PX = 14;
const GROUND_PX = 96;
const TOP_PX = 160;

const CURRENCY_ICONS: Record<CurrencyId, () => string> = { gems: () => gemIcon("gem-icon goal-icon"), gold: goldIcon };
/** Each unlock's icon: Damage Prediction a cracked heart, Combat Forecast an eye over crossed blades, Attack
 * Lore an open book with a rising arrow, Warp a portal's swirl, Damage Visual a monster's tile with a red
 * number in its corner, Relative Damage Color that tile over a green-to-red bar. */
const UNLOCK_ICONS: Record<GoalUnlock, string> = {
  damagePrediction: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5S3.5 15 3.5 9A4.5 4.5 0 0 1 12 6.6 4.5 4.5 0 0 1 20.5 9c0 6-8.5 11.5-8.5 11.5z" fill="#4a1a22" stroke="#e86d7a" stroke-width="1.6" stroke-linejoin="round"/><path d="M12.5 7.5l-2 4 3 1.5-2 4" fill="none" stroke="#ffd0d5" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  combatForecast: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19L17 7M19 19L7 7" stroke="#c9ced8" stroke-width="2" stroke-linecap="round"/><path d="M3.5 9.5C6 5.5 9 4 12 4s6 1.5 8.5 5.5C18 13.5 15 15 12 15s-6-1.5-8.5-5.5z" fill="#1c2a44" stroke="#8fc4ff" stroke-width="1.5"/><circle cx="12" cy="9.5" r="2.6" fill="#8fc4ff"/></svg>`,
  attackLore: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.5C9.5 5.5 6.5 5 3 5.5v12c3.5-.5 6.5 0 9 2 2.5-2 5.5-2.5 9-2v-12c-3.5-.5-6.5 0-9 2z" fill="#3a2a1a" stroke="#e2a15c" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 7.5v12" stroke="#e2a15c" stroke-width="1.2"/><path d="M16.5 15V9.5M14.3 11.6l2.2-2.3 2.2 2.3" fill="none" stroke="#ffd59a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  warp: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="8" ry="10" fill="#2a1d4a" stroke="#c9a6ff" stroke-width="1.6"/><path d="M12 6.5c3 0 4.6 2.4 4 4.8-.6 2.3-3.4 3.3-5.2 2-1.5-1-1.2-3.2.4-3.6 1.1-.3 2 .6 1.6 1.5" fill="none" stroke="#f0e2ff" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  damageVisual: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="2.5" fill="#1d2230" stroke="#8d97a8" stroke-width="1.3"/><path d="M8 15.5c0-4.5 1.8-8 4.5-8s4.5 3.5 4.5 8l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1z" fill="#6b3a44" stroke="#df797e" stroke-width="1.2" stroke-linejoin="round"/><circle cx="11" cy="11" r="0.9" fill="#ffd0d5"/><circle cx="14" cy="11" r="0.9" fill="#ffd0d5"/><path d="M4.5 20.5v-5h2.6a1.6 1.6 0 0 1 0 3.2H4.5" fill="none" stroke="#000" stroke-width="2.6" stroke-linejoin="round"/><path d="M4.5 20.5v-5h2.6a1.6 1.6 0 0 1 0 3.2H4.5" fill="none" stroke="#ff5a5a" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  relativeDamageColor: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="goal-spectrum"><stop offset="0" stop-color="#4dff6a"/><stop offset=".35" stop-color="#ffe14d"/><stop offset=".65" stop-color="#ff9a3d"/><stop offset="1" stop-color="#ff5a5a"/></linearGradient></defs><rect x="2.5" y="2.5" width="19" height="14" rx="2.5" fill="#1d2230" stroke="#8d97a8" stroke-width="1.3"/><path d="M8.5 13.5c0-3.6 1.5-6.5 3.5-6.5s3.5 2.9 3.5 6.5l-1.2-.8-1.2.8-1.1-.8-1.1.8-1.2-.8z" fill="#6b3a44" stroke="#df797e" stroke-width="1.1" stroke-linejoin="round"/><rect x="2.5" y="18" width="19" height="3.5" rx="1.75" fill="url(#goal-spectrum)" stroke="#000" stroke-width=".8"/></svg>`,
};
/** The next tower's reward: a tower's silhouette with its door lit. */
const TOWER_ICON = `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21.5V8.5H4.5v-5h3v2h2.2v-2h4.6v2h2.2v-2h3v5H18v13z" fill="#3a3f4b" stroke="#c9ced8" stroke-width="1.3" stroke-linejoin="round"/><path d="M10 21.5v-4a2 2 0 0 1 4 0v4z" fill="#ffd34d"/><rect x="11" y="10" width="2" height="3" rx=".5" fill="#ffd34d"/></svg>`;
/** What each unlock does, shown once it is claimed and again whenever its claimed reward is pressed. */
const UNLOCK_TUTORIALS: Record<GoalUnlock, string> = {
  damagePrediction: `<p>Inspect an enemy in a run and its panel now says how much HP the fight would cost you, and whether you survive it: Survivable, Invincible when it costs no HP, LETHAL, or Instakill when your first strike defeats it.</p>`,
  combatForecast: `<p>Inspect an enemy in a run and its panel now also says how many of your hits defeat it, or Instakill when one does.</p>`,
  attackLore: `<p>Inspect an enemy in a run and its panel now also says how much more ATK would defeat it in one hit fewer.</p>` +
    `<p class="hint">Train ATK in the run, even mid-fight, to make the most of it.</p>`,
  warp: `<p>Master an area, climbing its ten floors without taking damage, to warp to its checkpoint: tap the floor number to begin a new ascent there at once, on the floor just above it.</p>` +
    `<p class="hint">Checkpoints with a golden swirl can be warped to. Entering the tower from the forest always starts on floor 1.</p>`,
  relativeDamageColor: `<p>Each enemy's damage number now takes its colour from your HP as it stands: bright green when the fight costs under 1% of it, sliding through yellow at 10% and orange at 25% to red at half your HP or more.</p>` +
    `<p class="hint">Gray still marks an Instakill, and red a lethal fight.</p>`,
  damageVisual: `<p>Every enemy on the board now shows, in its lower-left corner, how much HP its fight would cost you: red when it is lethal, white when it strikes you but costs no HP, gray when your first strike defeats it, and ∞ when you can't hurt it.</p>` +
    `<p class="hint">Turn it off in Settings if the board feels crowded.</p>`,
};
const LOCK_ICON = `<svg class="goal-badge" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7.5" rx="1.5" fill="#3a3f4b" stroke="#c9ced8" stroke-width="1.1"/><path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" fill="none" stroke="#c9ced8" stroke-width="1.4"/></svg>`;
/** Beside a checkpoint's floor: its area mastered (a golden swirl, shown once Warp is owned) and cleared (a green check). */
const SWIRL_MARK = `<svg class="goal-mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#3a2a08" stroke="#ffd34d" stroke-width="1.6"/><path d="M12 5.5c3.6 0 6 2.7 5.4 5.9-.6 3-3.8 4.5-6.3 3.3-2.1-1-2.1-3.9-.1-4.6 1.4-.5 2.7.5 2.3 1.7" fill="none" stroke="#fff1b0" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const CLEARED_MARK = `<svg class="goal-mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#1f6a34" stroke="#8ff0a8" stroke-width="1.6"/><path d="M7 12.5l3.4 3.4L17.2 8.4" fill="none" stroke="#f0fff4" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CHECK_ICON = `<svg class="goal-badge" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#1f5a34" stroke="#9fe0b0" stroke-width="1.1"/><path d="M4.6 8.3l2.3 2.3 4.6-5" fill="none" stroke="#e8fff0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const rewardIcon = (r: GoalReward) => (r.kind === "unlock" ? UNLOCK_ICONS[r.unlock] : r.kind === "tower" ? TOWER_ICON : CURRENCY_ICONS[r.currency]());
const rewardText = (r: GoalReward) =>
  r.kind === "unlock" ? `Unlock ${UNLOCK_NAMES[r.unlock]}`
  : r.kind === "tower" ? `Unlock Tower ${tierNumeral(r.tower)}`
  : `${r.amount.toLocaleString("en-US")} ${CURRENCIES[r.currency].name}`;
/** Where floor `f` stands, from the bottom of the tower. */
const floorY = (f: number) => GROUND_PX + f * FLOOR_PX;

export class GoalsPage {
  /** The tower in view. */
  private tower = 1;
  private message = "";
  /** Each tower's scroll position, kept across re-renders. */
  private scrolled: Record<number, number> = {};
  private busy = false;

  constructor(
    private ctx: AppContext,
    private server: ShopServer = stubServer,
  ) {}

  /** Opens on the tower the forest leads to, scrolled to its highest floor. */
  open() {
    this.tower = this.ctx.game.save.tower.tier;
    this.message = "";
    this.scrolled = {};
    this.render();
  }

  private get towers() {
    return this.ctx.game.save.tower.tiersOpen;
  }

  render() {
    const save = this.ctx.game.save;
    document.querySelectorAll<HTMLElement>("#goals [data-scroll]").forEach((s) => (this.scrolled[Number(s.dataset.scroll)] = s.scrollTop));
    const panels = Array.from({ length: this.towers }, (_, i) => this.towerPanel(i + 1)).join("");
    el("goals").innerHTML =
      `<div class="goals-head"><button class="back" id="goals-back">← Back</button><div class="page-title"><small>THE ASCENT'S MILESTONES</small><h2>Goals</h2></div><button id="goals-pass" class="goals-pass"></button></div>` +
      `<p class="goals-message" id="goals-message" aria-live="polite">${this.message}</p>` +
      `<div class="goals-stage"><div class="goals-strip" id="goals-strip">${panels}</div><div class="goals-floor" id="goals-floor"></div></div>` +
      (this.towers > 1
        ? `<div class="goals-towers"><button id="goals-prev" aria-label="Previous tower">‹</button><b id="goals-tower"></b><button id="goals-next" aria-label="Next tower">›</button></div>`
        : "");
    this.bind();
    this.show(false);
    document.querySelectorAll<HTMLElement>("#goals [data-scroll]").forEach((s) => {
      const t = Number(s.dataset.scroll);
      // First shown: the highest floor completed sits a little below the middle.
      s.scrollTop = this.scrolled[t] ?? s.scrollHeight - s.clientHeight - Math.max(0, floorY(floorsCompleted(save, t)) - s.clientHeight * 0.4);
    });
  }

  /** One tower: its stone, the line lit to the highest floor, its checkpoints. */
  private towerPanel(tower: number) {
    const save = this.ctx.game.save,
      high = floorsCompleted(save, tower),
      checkpoints = CHECKPOINTS[tower]!,
      top = checkpoints[checkpoints.length - 1]!.floor,
      warp = warpUnlocked(save);
    const row = (c: Checkpoint) => {
      const done = high >= c.floor, warpable = canWarp(save, tower, c.floor);
      const mastered = warp && areaMastered(save, tower, c.floor), cleared = areaCleared(save, tower, c.floor);
      const marks = (cleared ? `<span title="Enemies cleared: floors ${c.floor - 9}–${c.floor}">${CLEARED_MARK}</span>` : "") +
        (mastered ? `<span title="Area mastered: warp here">${SWIRL_MARK}</span>` : "");
      return `<div class="goal-row" style="bottom:${floorY(c.floor)}px">` +
        `<div class="goal-left">${this.reward(tower, c, false)}${marks ? `<span class="goal-marks">${marks}</span>` : ""}</div>` +
        `<button class="goal-floor${done ? " completed" : ""}${warpable ? " warpable" : ""}" data-warp="${tower}:${c.floor}" aria-label="Floor ${c.floor}${warpable ? ": warp" : ""}">${c.floor}</button>` +
        this.reward(tower, c, true) +
        `</div>`;
    };
    return `<div class="goals-scroll" data-scroll="${tower}"><div class="goals-tower" style="height:${floorY(top) + TOP_PX}px">` +
      `<div class="goals-ground"></div><div class="goals-line" style="bottom:${GROUND_PX}px"></div>` +
      `<div class="goals-line lit" style="bottom:${GROUND_PX}px;height:${Math.min(high, top + TOP_PX / FLOOR_PX) * FLOOR_PX}px"></div>` +
      checkpoints.map(row).join("") +
      `</div></div>`;
  }

  /** A checkpoint's reward, or its premium reward, as its state shows it. */
  private reward(tower: number, c: Checkpoint, premium: boolean) {
    const state = goalState(this.ctx.game.save, tower, c.floor, premium), r = premium ? c.premium : c.reward;
    const badge = state === "claimed" ? CHECK_ICON : state === "ready" ? "" : LOCK_ICON;
    const label = { locked: `Complete floor ${c.floor}`, needsPass: "Premium Pass", ready: "Claim", claimed: "Claimed" }[state];
    // A locked standard reward says nothing more: pressing it says which floor to complete.
    const shown = state === "locked" && !premium ? "" : `<small>${label}</small>`;
    return `<button class="goal-reward ${premium ? "premium" : "standard"} ${state}" data-goal="${tower}:${c.floor}:${premium ? 1 : 0}" aria-label="${rewardText(r)}: ${label}">` +
      `<span class="goal-art">${rewardIcon(r)}${badge}</span><span class="goal-text"><b>${rewardText(r)}</b>${shown}</span></button>`;
  }

  /** Brings the tower in view across, and its floor, pass and name. */
  private show(animate = true) {
    const save = this.ctx.game.save, strip = el("goals-strip"), pass = passFor(this.tower);
    strip.classList.toggle("instant", !animate);
    strip.style.transform = `translateX(-${(this.tower - 1) * 100}%)`;
    // The highest floor completed: 0 until the first floor's stairs are climbed.
    const floor = el("goals-floor");
    floor.textContent = `Floor ${floorsCompleted(save, this.tower)}`;
    floor.title = "Highest floor completed";
    const passButton = el("goals-pass");
    passButton.textContent = `${owns(save, pass.id) ? "✓ " : ""}Premium Pass ${pass.n}`;
    passButton.classList.toggle("owned", owns(save, pass.id));
    if (this.towers > 1) {
      el("goals-tower").textContent = `Tower ${tierNumeral(this.tower)}`;
      (el("goals-prev") as HTMLButtonElement).disabled = this.tower <= 1;
      (el("goals-next") as HTMLButtonElement).disabled = this.tower >= this.towers;
    }
  }

  private say(message: string) {
    this.message = message;
    el("goals-message").textContent = message;
  }

  private bind() {
    const { ctx } = this, game = ctx.game;
    el("goals-back").onclick = () => ctx.navigate("tower");
    el("goals-pass").onclick = () => this.showPass(passFor(this.tower));
    if (this.towers > 1)
      for (const [id, step] of [["goals-prev", -1], ["goals-next", 1]] as const)
        el(id).onclick = () => {
          this.tower = Math.max(1, Math.min(this.towers, this.tower + step));
          this.show();
        };
    el("goals").querySelectorAll<HTMLButtonElement>("[data-goal]").forEach((b) => {
      b.onclick = () => {
        const [tower, floor, premium] = b.dataset.goal!.split(":").map(Number) as [number, number, number];
        this.choose(tower, floor, premium === 1);
      };
    });
    el("goals").querySelectorAll<HTMLButtonElement>("[data-warp]").forEach((b) => {
      b.onclick = () => {
        const [tower, floor] = b.dataset.warp!.split(":").map(Number) as [number, number];
        if (canWarp(game.save, tower, floor)) return this.askWarp(tower, floor);
        this.say(this.warpRefusal(tower, floor));
      };
    });
  }

  /** Why the checkpoint at `floor` can't be warped to yet, and what each of its marks means. */
  private warpRefusal(tower: number, floor: number) {
    const save = this.ctx.game.save, from = floor - 9;
    const cleared = areaCleared(save, tower, floor) ? ` Floors ${from}–${floor} cleared of enemies: +${CLEARED_INSPIRATION} Inspiration paid.` : "";
    if (!areaMastered(save, tower, floor)) return `Master floors ${from}–${floor}, climbing them without taking damage, to warp here.${cleared}`;
    return `Floors ${from}–${floor} mastered. Claim Unlock Warp at Tower I's floor ${unlockFloor("warp")} to start runs here.${cleared}`;
  }

  /** A reward pressed: claimed when ready, the pass offered when it needs one. */
  private choose(tower: number, floor: number, premium: boolean) {
    const game = this.ctx.game, state: GoalState = goalState(game.save, tower, floor, premium);
    if (state === "needsPass") return this.showPass(passFor(tower));
    if (state === "locked") return this.say(`Complete floor ${floor} in Tower ${tierNumeral(tower)} to claim it.`);
    if (state === "claimed") {
      // An unlock pressed again shows what it does once more.
      const r = checkpoint(tower, floor)![premium ? "premium" : "reward"];
      if (r.kind === "unlock") return this.unlockTutorial(r.unlock, true);
      return r.kind === "tower" ? this.towerOpened(r.tower, true) : this.say("Already claimed.");
    }
    const reward = game.claimGoal(tower, floor, premium);
    if (!reward) return;
    this.message = `Claimed: ${rewardText(reward)}`;
    this.ctx.update();
    this.render();
    if (reward.kind === "unlock") this.unlockTutorial(reward.unlock);
    if (reward.kind === "tower") this.towerOpened(reward.tower);
  }

  /** The next tower opened, shown once it is claimed and `again` when its claimed reward is pressed. */
  private towerOpened(tower: number, again = false) {
    const modal = this.ctx.modal, name = `Tower ${tierNumeral(tower)}`;
    modal.innerHTML = `<small>GOALS</small><h2>${name}${again ? "" : " unlocked"}</h2>` +
      `<p>Access the next tower: choose ${name} with the arrows beside the forest's entrance. Its enemies are ${tierStats(tower)} times as strong as Tower I's, and pay ${tierRewardText(tower)}.</p>` +
      `<p class="hint">The cave of the same number opens in the Delve with it.</p>` +
      `<div class="dialog-actions"><button id="unlock-ok">Got it</button></div>`;
    modal.showModal();
    el("unlock-ok").onclick = () => modal.close();
  }

  /** What an unlock does, shown once it is claimed, and `again` when its claimed reward is pressed. */
  private unlockTutorial(what: GoalUnlock, again = false) {
    const modal = this.ctx.modal;
    modal.innerHTML = `<small>GOALS</small><h2>${UNLOCK_NAMES[what]}${again ? "" : " unlocked"}</h2>` + UNLOCK_TUTORIALS[what] +
      `<div class="dialog-actions"><button id="unlock-ok">Got it</button></div>`;
    modal.showModal();
    el("unlock-ok").onclick = () => modal.close();
  }

  private askWarp(tower: number, floor: number) {
    const towerName = this.towers > 1 ? ` of Tower ${tierNumeral(tower)}` : "";
    this.ctx.confirm(
      { title: `Warp to floor ${floor}?`, body: `Begin a new ascent${towerName} from the floor ${floor} checkpoint, on floor ${floor + 1}.`, label: "Warp", cancel: "Not yet" },
      () => {
        if (!this.ctx.game.warp(tower, floor)) return;
        this.ctx.navigate("tower");
      },
    );
  }

  /** The Premium Pass for a set of three towers: what it opens, and its price. */
  private showPass(pass: Pass) {
    const { modal, game } = this.ctx, owned = owns(game.save, pass.id), totals = passTotals(pass);
    const names = pass.towers.map(tierNumeral).join(", ");
    const amounts = (Object.entries(totals) as [CurrencyId, number][])
      .sort(([a]) => (a === "gems" ? -1 : 1))
      .map(([id, n]) => `<div class="pass-total ${id}">${CURRENCY_ICONS[id]()}<b>${n.toLocaleString("en-US")}</b><small>${CURRENCIES[id].name.toUpperCase()}</small></div>`)
      .join("");
    modal.innerHTML = `<small>GOALS</small><h2>Premium Pass ${pass.n}</h2>` +
      `<p>${owned ? "Yours: every" : "Unlocks every"} premium reward in Towers ${names}, claimed as you reach each checkpoint.</p>` +
      `<div class="pass-totals">${amounts}</div>` +
      `<p class="goals-message" id="pass-message" aria-live="polite"></p>` +
      `<div class="dialog-actions"><button id="pass-close">${owned ? "Close" : "Not now"}</button>${owned ? "" : `<button id="pass-buy">Unlock · ${pass.label}</button>`}</div>`;
    modal.showModal();
    el("pass-close").onclick = () => modal.close();
    if (!owned) el("pass-buy").onclick = () => void this.buyPass(pass);
  }

  /** Buys a pass through the store; Dev mode (or free purchases) skips it.
   * TODO: the real store link, once the store is connected. */
  private async buyPass(pass: Pass) {
    if (this.busy) return;
    this.busy = true;
    const game = this.ctx.game, dev = game.save.settings.devMode || game.free;
    try {
      const paid = dev || (await this.server.purchase(pass.sku));
      if (!paid) return void (el("pass-message").textContent = "The store isn't open yet.");
      const now = (await this.server.time()) ?? game.clock();
      const refused = game.buyOffer(pass.id as Parameters<typeof game.buyOffer>[0], now, true);
      if (refused) return void (el("pass-message").textContent = "Already yours.");
      this.ctx.modal.close();
      this.message = `Premium Pass ${pass.n} unlocked!`;
      this.ctx.update();
      this.render();
    } finally {
      this.busy = false;
    }
  }
}

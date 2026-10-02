import { CHECKPOINTS, CHECKPOINT_EVERY, canWarp, goalState, highestFloor, passFor, passTotals, warpUnlocked, type Checkpoint, type GoalReward, type GoalState, type Pass } from "../goals.ts";
import { CURRENCIES, type CurrencyId } from "../shop/currency.ts";
import { owns } from "../shop/entitlements.ts";
import { stubServer, type ShopServer } from "../shop/server.ts";
import { tierNumeral } from "../tiers.ts";
import type { AppContext } from "./app.ts";
import { el, gemIcon, goldIcon } from "./dom.ts";

// The Goals screen: each tower drawn as a stone column rising from the
// ground, a line up its middle lit to the highest floor reached, and a
// checkpoint every ten floors with its reward on the left and its premium
// reward on the right. Opened from the forest's Goals button (Tower only).

/** Pixels per floor up the tower, the ground under floor 0, and the tower
 * standing on past the last checkpoint, off the top. */
const FLOOR_PX = 14;
const GROUND_PX = 96;
const TOP_PX = 160;

const CURRENCY_ICONS: Record<CurrencyId, () => string> = { gems: () => gemIcon("gem-icon goal-icon"), gold: goldIcon };
/** Warp: a portal's swirl. */
const WARP_ICON = `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="8" ry="10" fill="#2a1d4a" stroke="#c9a6ff" stroke-width="1.6"/><path d="M12 6.5c3 0 4.6 2.4 4 4.8-.6 2.3-3.4 3.3-5.2 2-1.5-1-1.2-3.2.4-3.6 1.1-.3 2 .6 1.6 1.5" fill="none" stroke="#f0e2ff" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const LOCK_ICON = `<svg class="goal-badge" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7.5" rx="1.5" fill="#3a3f4b" stroke="#c9ced8" stroke-width="1.1"/><path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" fill="none" stroke="#c9ced8" stroke-width="1.4"/></svg>`;
const CHECK_ICON = `<svg class="goal-badge" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#1f5a34" stroke="#9fe0b0" stroke-width="1.1"/><path d="M4.6 8.3l2.3 2.3 4.6-5" fill="none" stroke="#e8fff0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const rewardIcon = (r: GoalReward) => (r.kind === "warp" ? WARP_ICON : CURRENCY_ICONS[r.currency]());
const rewardText = (r: GoalReward) => (r.kind === "warp" ? "Unlock Warp" : `${r.amount.toLocaleString("en-US")} ${CURRENCIES[r.currency].name}`);
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
      // First shown: the highest floor reached sits a little below the middle.
      s.scrollTop = this.scrolled[t] ?? s.scrollHeight - s.clientHeight - Math.max(0, floorY(highestFloor(save, t)) - s.clientHeight * 0.4);
    });
  }

  /** One tower: its stone, the line lit to the highest floor, its checkpoints. */
  private towerPanel(tower: number) {
    const save = this.ctx.game.save,
      high = highestFloor(save, tower),
      checkpoints = CHECKPOINTS[tower]!,
      top = checkpoints[checkpoints.length - 1]!.floor,
      warp = warpUnlocked(save);
    const row = (c: Checkpoint) => {
      const reached = high >= c.floor;
      return `<div class="goal-row" style="bottom:${floorY(c.floor)}px">` +
        this.reward(tower, c, false) +
        `<button class="goal-floor${reached ? " reached" : ""}${reached && warp ? " warpable" : ""}" data-warp="${tower}:${c.floor}" aria-label="Floor ${c.floor}${reached && warp ? ": warp" : ""}">${c.floor}</button>` +
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
    const label = { locked: `Reach floor ${c.floor}`, needsPass: "Premium Pass", ready: "Claim", claimed: "Claimed" }[state];
    return `<button class="goal-reward ${premium ? "premium" : "standard"} ${state}" data-goal="${tower}:${c.floor}:${premium ? 1 : 0}" aria-label="${rewardText(r)}: ${label}">` +
      `<span class="goal-art">${rewardIcon(r)}${badge}</span><span class="goal-text"><b>${rewardText(r)}</b><small>${label}</small></span></button>`;
  }

  /** Brings the tower in view across, and its floor, pass and name. */
  private show(animate = true) {
    const save = this.ctx.game.save, strip = el("goals-strip"), pass = passFor(this.tower);
    strip.classList.toggle("instant", !animate);
    strip.style.transform = `translateX(-${(this.tower - 1) * 100}%)`;
    el("goals-floor").textContent = `Floor ${highestFloor(save, this.tower)}`;
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
        this.say(highestFloor(game.save, tower) < floor ? `Reach floor ${floor} first.` : `Claim Unlock Warp at Tower I's floor ${CHECKPOINT_EVERY} to start runs here.`);
      };
    });
  }

  /** A reward pressed: claimed when ready, the pass offered when it needs one. */
  private choose(tower: number, floor: number, premium: boolean) {
    const game = this.ctx.game, state: GoalState = goalState(game.save, tower, floor, premium);
    if (state === "needsPass") return this.showPass(passFor(tower));
    if (state === "locked") return this.say(`Reach floor ${floor} in Tower ${tierNumeral(tower)} to claim it.`);
    if (state === "claimed") return this.say("Already claimed.");
    const reward = game.claimGoal(tower, floor, premium);
    if (!reward) return;
    this.message = `Claimed: ${rewardText(reward)}`;
    this.ctx.update();
    this.render();
    if (reward.kind === "warp") this.warpTutorial();
  }

  /** What Warp does, shown once it is claimed. */
  private warpTutorial() {
    const modal = this.ctx.modal;
    modal.innerHTML = `<small>GOALS</small><h2>Warp unlocked</h2>` +
      `<p>Tap the floor number of any checkpoint you have reached to begin a new ascent there at once, on the floor just above it.</p>` +
      `<p class="hint">Glowing checkpoints can be warped to. Entering the tower from the forest always starts on floor 1.</p>` +
      `<div class="dialog-actions"><button id="warp-ok">Got it</button></div>`;
    modal.showModal();
    el("warp-ok").onclick = () => modal.close();
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

import { controlIcon } from "./control-icon.ts";
import { kitIcon } from "../sprites/kit.ts";
import { GOAL_SPRITES } from "../sprites/ui-details.ts";
import { GOAL_BREAKTHROUGH, CHECKPOINT_EVERY, CHECKPOINT_FLOORS, CHECKPOINTS, UNLOCK_NAMES, areaCleared, checkpoint, areaMastered, canWarp, floorsCompleted, goalState, unmasteredBelow, passFor, passTotals, unlockAt, unlockFloor, warpUnlocked, type Checkpoint, type GoalReward, type GoalState, type GoalUnlock, type Pass } from "../goals.ts";
import { CURRENCIES, type CurrencyId } from "../shop/currency.ts";
import { owns } from "../shop/entitlements.ts";
import { stubServer, type ShopServer } from "../shop/server.ts";
import { offer } from "../shop/offers.ts";
import { clearedInspiration } from "../tower/area-ledger.ts";
import { tierNumeral, tierRewardText, tierStats } from "../tiers.ts";
import type { AppContext } from "./app.ts";
import { el, eventIcon, gemIcon, goldIcon, medalIcon, arcaniteIcon, shrineIcon, trophyIcon, uiSprite } from "./dom.ts";
import { flyToPurse } from "./flourish.ts";
import { goalRewardShown, offerShown, revealReward } from "./reward-reveal.ts";

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

const CURRENCY_ICONS: Record<CurrencyId, () => string> = { gems: () => gemIcon("gem-icon goal-icon"), arcanite: () => arcaniteIcon("arcanite-icon goal-icon"), gold: goldIcon, medals: () => medalIcon("medal-icon goal-icon") };
/** Each unlock's icon: Damage Prediction a cracked heart, Combat Forecast an eye over crossed blades, Attack
 * Lore an open book with a rising arrow, Warp a portal's swirl, Damage Visual a monster's tile with a red
 * number in its corner, Relative Damage Color that tile over a green-to-red bar, Equipment an anvil
 * under a hammer, the Tournament a trophy, Events a pennant, Research Speed an hourglass, Shard ATK and Shard DEF a red or
 * blue shard under a rising arrow, Badge
 * Slots a card wearing two badges, one above the other, Note Taking an open notebook under a quill,
 * the Archer Card a card wearing a plain wooden bow, Attack Range an arrow flying past
 * a range ring, Attack Speed two arrows in a row, Training Discount a Gold
 * coin under a falling arrow, Card Groups two cards linked by a bracket and
 * a diamond, the Flying Enemy Card a card wearing a wing, Super Critical
 * Research a purple star edged in gold, and every Shrine research a shrine's
 * gate (`shrineIcon`). */
const UNLOCK_ICONS = Object.fromEntries((Object.keys(GOAL_SPRITES) as GoalUnlock[]).map(id => [id,
  kitIcon(id === "aetherShield" ? "hud-aether-shield" : GOAL_SPRITES[id], "", "goal-icon"),
])) as Record<GoalUnlock, string>;

/** The next tower's reward: a tower's silhouette with its door lit. */
const TOWER_ICON = kitIcon("tower", "", "goal-icon");
/** What each unlock does, shown once it is claimed and again whenever its claimed reward is pressed. */
const UNLOCK_TUTORIALS: Record<GoalUnlock, string> = {
  aetherShield: `<p>Shield HP and Regrow Shield research open in the Archives once you own their skills: your shield holds more HP, and regrows in fewer turns after it breaks.</p>`,
  superCriticalResearch: `<p>Super Critical Chance and Super Critical Factor research open in the Archives once you own the Super Critical skill: more chance a critical hit becomes a Super Critical hit, and a larger multiplier when it does.</p>`,
  flyingEnemyCard: `<p>The Flying Enemy card joins your deck: it moves you toward the closest Flying enemy your arrows can hurt, stops once one is within your Attack Range, and waits there while your arrows fly.</p>` +
    `<p>While it is in your hand, your arrows strike with 5% more ATK and charge 5% faster.</p>` +
    `<p class="hint">Flying enemies hover out of reach of your sword: walk under them freely, but only arrows can bring them down. A Flying enemy an arrow wounds comes after you.</p>`,
  warpLoot: `<p>Warp Loot opens in the Archives: research it, and a climb that starts above floor 1 (a Warp, or a Retry from one) goes inside with a share of the Silver its skipped floors would have paid, 2% a level, up to all of it at level 50.</p>` +
    `<p class="hint">The skipped floors' kills, Wishing Well and Interest are estimated from your training and research as the climb begins.</p>`,
  trainingDiscount: `<p>Training Discount opens in the Archives: research it, and every rank a trainer trains costs 0.5% less Gold a level, up to 49.5% at level 99.</p>` +
    `<p class="hint">Training points and a climb's Silver cost the same as ever.</p>`,
  cardGroups: `<p>Card Groups opens on the Deck: tap a diamond under the hand, between two cards, to link them into a group. The cards of a group share one priority: of every target any of them can reach, the hand heads for the closest.</p>` +
    `<p class="hint">Link Gold Key and Blue Key, and the hero takes whichever key is nearer. Moving a card out of place breaks its links.</p>`,
  archerCard: `<p>The Archer card joins your deck. It never moves you, but while it is in your hand your hero is an Archer: every 10 turns it fires an arrow at the closest enemy within 3 m, walls and doors no obstacle, dealing one strike's damage (critical hits and the enemy's DEF counted) before you ever touch it.</p>` +
    `<p>While it is in your hand, your arrows strike bosses with 5% more ATK, and your Archer training can be raised with Silver during the climb. Training it between climbs works with or without the card.</p>` +
    `<p class="hint">A ready shot waits for an enemy to come in range, and fires the turn one does. Ranged enemies reach five sixths as far as your arrows: strike first, then close in.</p>`,
  attackRange: `<p>Attack Range joins Offense training: each rank lets your arrows reach 0.05 m further, from 3 m up to 7 m.</p>` +
    `<p class="hint">Ranged enemies always reach five sixths as far as you do.</p>`,
  attackPerTile: `<p>ATK / m joins Offense training: each arrow's ATK is multiplied by more for every meter (a tile) its target stands away, counted straight across. The first rank makes it ×1.01 a meter, and 200 ranks ×2.204 a meter.</p>` +
    `<p class="hint">A far enemy your arrows can't hurt up close may fall to a shot from further off. Critical hits multiply on top.</p>`,
  chargedShot: `<p>Charged Shot opens in the Archives: once your arrow is ready, every turn it waits without firing adds to the next arrow's ATK, by 1% a turn for each level researched.</p>` +
    `<p class="hint">A charged arrow flies in a blue glow, and its number wears a gold outline. Its bonus multiplies with ATK / m and critical hits, and resets once it fires.</p>`,
  multishot: `<p>Multishot Chance and Multishot Targets join Offense training: each rank of Chance gives every shot 0.5% more chance, up to 49.5%, to fire at several enemies in range at once, 2 of them and one more for each rank of Targets, up to 9.</p>` +
    `<p class="hint">Every arrow of a multishot carries the first's Charged Shot, rolls its own critical hit, and has its own ATK / m for its distance. With fewer enemies in range, it fires one at each.</p>`,
  rapidFire: `<p>Rapid Fire Chance and Rapid Fire Duration join Offense training: each rank of Chance gives every shot 0.4% more chance, up to 34%, to start Rapid Fire, and your arrows come four times as fast from that moment for 1 turn, and 0.05 turns more for each rank of Duration, up to 5.95.</p>` +
    `<p class="hint">A shot fired during Rapid Fire can't start another. Time left toward a shot when it ends carries on toward the next one at the usual pace.</p>`,
  attackSpeed: `<p>Attack Speed joins Offense training: each rank adds 0.05 shots every 10 turns, from 1 up to 6.</p>` +
    `<p class="hint">A fraction of a turn left over carries to the next shot: 3 shots in 10 turns fire 4, 3 and 3 turns apart.</p>`,
  tournament: `<p>Twice a week, on Wednesday and Saturday (GMT), the Tournament opens: one Delve run from seeds every player in your league shares, among stronger enemies, scored by the depth you reach and ranked worldwide.</p>` +
    `<p>Its Hall now stands in the forest, right of the path: tap it to see when the next one opens. While one is open, the Delve opens with it: the trophy at the right leads down to its cave, and entering costs a Ticket.</p>` +
    `<p class="hint">Each new tournament gives you a Ticket to enter. Place high to win Gems and Arcanite, and climb from Copper through Silver, Gold and Platinum to Champion.</p>`,
  events: `<p>Every two weeks an Event begins: missions released over its first eight days, each with three tiers paying Medals as you complete them.</p>` +
    `<p>The Medals an event pays count toward its relics, unique keepsakes that each give a permanent bonus. The Event Booster doubles them, and opens two premium relics.</p>` +
    `<p class="hint">Tap the pennant at the right to see the running event. The relics you own wait on the Relics screen, in the menu.</p>`,
  damagePrediction: `<p>Inspect an enemy in a climb and its panel now says how much HP the fight would cost you, and whether you survive it: Survivable, Harmless when it costs no HP, LETHAL, or Instakill when your first strike defeats it.</p>`,
  combatForecast: `<p>Inspect an enemy in a climb and its panel now also says how many of your hits defeat it, or Instakill when one does.</p>`,
  attackLore: `<p>Inspect an enemy in a climb and its panel now also says how much more ATK would defeat it in one hit fewer.</p>` +
    `<p class="hint">Train ATK in the climb, even mid-fight, to make the most of it.</p>`,
  warp: `<p>Master an area, climbing its ten floors without taking damage, to warp to the next checkpoint: tap the floor number to begin a new climb there at once, on the floor just above it.</p>` +
    `<p class="hint">Checkpoints with a golden swirl can be warped to. Entering the tower from the forest always starts on floor 1.</p>`,
  relativeDamageColor: `<p>Each enemy's damage number now takes its colour from your HP as it stands: bright green when the fight costs under 1% of it, sliding through yellow at 10% and orange at 25% to red at half your HP or more.</p>` +
    `<p class="hint">Gray still marks an Instakill, and red a lethal fight.</p>`,
  damageVisual: `<p>Every enemy on the board now shows, in its lower-left corner, how much HP its fight would cost you: red when it is lethal, white when it strikes you but costs no HP, gray when your first strike defeats it, and ∞ when you can't hurt it.</p>` +
    `<p>Items show what they give: a potion's HP in blue, a shard's ATK or DEF in white, and a chest's Gold in yellow.</p>` +
    `<p class="hint">Turn it off in Settings if the board feels crowded.</p>`,
  equipment: `<p>A Blacksmith opens in the forest: tap it, or the Gear tab, to wear weapons, armour and trinkets, level them up with Gold and materials, and merge them.</p>` +
    `<p class="hint">With the Chest card in your hand, a treasure chest may now be a Supply Chest, holding upgrade materials, or an Equipment Chest, holding a piece of equipment.</p>`,
  noteTaking: `<p>Note Taking opens in the Archives: research it, and tap the floor number during a climb to read the climb's notes, kept as you play: its time, steps, kills, keys, doors, chests and loot.</p>` +
    `<p class="hint">The notes stay open while the climb plays on, and copy to paste elsewhere. The climb's summary opens them too.</p>`,
  researchSpeed: `<p>Research Speed opens in the Archives: train the archivists to read faster, and every research, those under way included, takes less time.</p>`,
  badgeSlots: `<p>Badge Slots opens in the Archives: research it, and each card holds one more badge a level. Drag a badge onto a card on the Deck page to fill its next slot; on a card with every slot full, it takes the bottom slot's place.</p>` +
    `<p class="hint">Badges that can't work together can't share a card: a key colour's &lt; gate with its ≥ gate (GK &lt; with GK ≥), or Effective with Dampen.</p>`,
  shardAttack: `<p>Shard ATK opens in the Archives: research it, and every ATK shard a climb picks up raises ATK by more, from the next one on, in the Tower and the Delve alike.</p>`,
  parryPercent: `<p>Parry % opens in the Archives once Parry is yours: research it, and every strike you parry is cut by more, at once, in the Tower and the Delve alike.</p>` +
    `<p class="hint">However it is raised, a parry cuts a strike's damage by at most 98%.</p>`,
  shardDefense: `<p>Shard DEF opens in the Archives: research it, and every DEF shard a climb picks up raises DEF by more, from the next one on, in the Tower and the Delve alike.</p>`,
  shrines: `<p>Unlock Shrines opens in the Archives: research it, and every so many floors climbed in the Tower grants a boon, a bonus that lasts the rest of the climb, chosen from a few offered.</p>` +
    `<p class="hint">Its research also opens Floors Required and Standard Boon Bonus. Boons are the Tower's alone, not the Delve's.</p>`,
  firstBoonChoice: `<p>First Boon Choice opens in the Archives once Shrines are yours: research it, and pick on the forest's Shrine Boons page a standard boon to head every climb's first offer.</p>`,
  improveTradeoffs: `<p>Improve Trade-off Boons opens in the Archives once Shrines are yours: research it, and the benefit of every trade-off boon grows, its cost unchanged.</p>`,
  autoPickBoons: `<p>Auto Pick Boons opens in the Archives once Shrines are yours: research it, and a climb can pick its boons itself, the top one offered, as soon as each is earned.</p>` +
    `<p class="hint">Turn it on or off from the Shrine button in a climb.</p>`,
  boonOptions: `<p>Boon Option Quantity opens in the Archives once Shrines are yours: research it, and each boon offered gives one more to choose from, up to four.</p>`,
  banBoons: `<p>Ban Boons opens in the Archives once Shrines are yours: research it, and ban boons from ever being offered, on the forest's Shrine Boons page.</p>`,
  autoPickRanking: `<p>Auto Pick Ranking opens in the Archives once Auto Pick Boons is yours: research it, and rank the boons Auto Pick takes first, on the forest's Shrine Boons page.</p>`,
};
const LOCK_ICON = kitIcon("lock", "", "goal-badge");
/** Beside a checkpoint's floor: its area mastered (a golden swirl, shown once Warp is owned) and cleared (a green check). */
const SWIRL_MARK = kitIcon("ui-mastered", "", "goal-mark");
const CLEARED_MARK = kitIcon("check", "", "goal-mark");
const CHECK_ICON = kitIcon("check", "", "goal-badge");

const rewardIcon = (r: GoalReward) => (r.kind === "unlock" ? UNLOCK_ICONS[r.unlock] : r.kind === "tower" ? TOWER_ICON : CURRENCY_ICONS[r.currency]());
/** An unlock's name with "Unlock" before it, once: Unlock Shrines is already named so. */
const unlockText = (u: GoalUnlock) =>
  UNLOCK_NAMES[u].startsWith("Unlock ") ? UNLOCK_NAMES[u] : `Unlock ${u === "tournament" ? "the " : ""}${UNLOCK_NAMES[u]}`;
const rewardText = (r: GoalReward) =>
  r.kind === "unlock" ? unlockText(r.unlock)
  : r.kind === "tower" ? `Unlock Tower ${tierNumeral(r.tower)}`
  : `${r.amount.toLocaleString("en-US")} ${CURRENCIES[r.currency].name}`;
/** Pixels between neighbouring checkpoints, whatever floors they stand on:
 * the column spaces its checkpoints evenly (ten floors' worth), so a
 * checkpoint added between two makes room and the rest keep the same
 * interval, and the gap from floor 100 to 150 is no wider than any other. */
const CHECKPOINT_PX = CHECKPOINT_EVERY * FLOOR_PX;
/** How far above the ground floor `f` stands in a column holding checkpoints
 * at `floors` (lowest first): between two checkpoints it is placed in
 * proportion to the floors between them, and past the last at a floor's
 * height each. */
function risePx(f: number, floors: readonly number[]) {
  let below = 0;
  for (const [i, at] of floors.entries()) {
    if (f <= at) return i * CHECKPOINT_PX + (CHECKPOINT_PX * (f - below)) / (at - below);
    below = at;
  }
  return floors.length * CHECKPOINT_PX + (f - below) * FLOOR_PX;
}
/** Where floor `f` stands, from the bottom of the tower. */
const floorY = (f: number, floors: readonly number[]) => GROUND_PX + risePx(f, floors);

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
      `<div class="goals-head"><button class="back" id="goals-back">${controlIcon("back")} Back</button><div class="page-title"><small>THE ASCENT'S MILESTONES</small><h2>Goals</h2></div><button id="goals-pass" class="goals-pass"></button></div>` +
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
      s.scrollTop = this.scrolled[t] ?? s.scrollHeight - s.clientHeight - Math.max(0, floorY(floorsCompleted(save, t), CHECKPOINT_FLOORS) - s.clientHeight * 0.4);
    });
  }

  /** One tower: its stone, the line lit to the highest floor, its checkpoints. */
  private towerPanel(tower: number) {
    const save = this.ctx.game.save,
      high = floorsCompleted(save, tower),
      checkpoints = CHECKPOINTS[tower]!,
      floors = checkpoints.map((c) => c.floor),
      top = floors[floors.length - 1]!,
      warp = warpUnlocked(save);
    const row = (c: Checkpoint) => {
      const done = high >= c.floor, warpable = canWarp(save, tower, c.floor);
      const mastered = warp && areaMastered(save, tower, c.floor), cleared = areaCleared(save, tower, c.floor);
      const marks = (cleared ? `<span title="Enemies cleared: floors ${c.floor - 9}–${c.floor}">${CLEARED_MARK}</span>` : "") +
        // A mastered area's warp point stays greyed out until every one below it is mastered too.
        (mastered ? `<span${warpable ? "" : ` class="inactive"`} title="Area mastered: ${warpable ? "warp here" : "warp here once every area below it is mastered"}">${SWIRL_MARK}</span>` : "");
      return `<div class="goal-row" style="bottom:${floorY(c.floor, floors)}px">` +
        `<div class="goal-left">${this.reward(tower, c, false)}${marks ? `<span class="goal-marks">${marks}</span>` : ""}</div>` +
        `<button class="goal-floor${done ? " completed" : ""}${warpable ? " warpable" : ""}" data-warp="${tower}:${c.floor}" aria-label="Floor ${c.floor}${warpable ? ": warp" : ""}">${c.floor}</button>` +
        this.reward(tower, c, true) +
        `</div>`;
    };
    return `<div class="goals-scroll" data-scroll="${tower}"><div class="goals-tower" style="height:${floorY(top, floors) + TOP_PX}px">` +
      `<div class="goals-ground"></div><div class="goals-line" style="bottom:${GROUND_PX}px"></div>` +
      `<div class="goals-line lit" style="bottom:${GROUND_PX}px;height:${Math.min(risePx(high, floors), risePx(top, floors) + TOP_PX)}px"></div>` +
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
        this.choose(tower, floor, premium === 1, b.getBoundingClientRect());
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
    const cleared = areaCleared(save, tower, floor) ? ` Floors ${from}–${floor} cleared of enemies: +${clearedInspiration(floor)} Inspiration paid.` : "";
    if (!areaMastered(save, tower, floor)) return `Master floors ${from}–${floor}, climbing them without taking damage, to warp here.${cleared}`;
    const below = unmasteredBelow(save, tower, floor);
    if (below !== null && warpUnlocked(save)) return `Floors ${from}–${floor} mastered. Master floors ${below - 9}–${below} too: a warp point opens once every one below it is mastered.${cleared}`;
    return `Floors ${from}–${floor} mastered. Claim Unlock Warp at Tower ${tierNumeral(unlockAt("warp").tower)}'s floor ${unlockFloor("warp")} to start climbs here.${cleared}`;
  }

  /** A reward pressed (`from`, its button's box): claimed when ready (or,
   * with Dev free purchases, before its floor is completed), the pass
   * offered when it needs one. A standard reward's Breakthrough point,
   * unsaid on the page, drops from it as it is claimed. */
  private choose(tower: number, floor: number, premium: boolean, from: DOMRect) {
    const game = this.ctx.game, state: GoalState = goalState(game.save, tower, floor, premium);
    if (state === "needsPass") return this.showPass(passFor(tower));
    if (state === "locked" && !game.save.settings.freePurchases) return this.say(`Complete floor ${floor} in Tower ${tierNumeral(tower)} to claim it.`);
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
    // An unlock's or tower's dialog waits for the point to land, so it doesn't hide it.
    const explain = () => {
      if (reward.kind === "unlock") this.unlockTutorial(reward.unlock);
      if (reward.kind === "tower") this.towerOpened(reward.tower);
    };
    if (premium) explain();
    else flyToPurse(from, [{ html: `${uiSprite("breakthrough")}<b>+${GOAL_BREAKTHROUGH}</b>`, to: null, landed: explain }]);
    const shown = goalRewardShown(reward);
    if (shown) revealReward(shown, game.save.settings.reduceMotion);
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
    // Equipment, newly claimed, offers its Blacksmith at once, and the Tournament and Events their pages.
    const visit = (what === "equipment" || what === "tournament" || what === "events") && !again;
    const where = what === "equipment" ? { label: "Visit the Blacksmith", page: "gear" }
      : what === "events" ? { label: "Open Events", page: "events" } : { label: "Open the Tournament", page: "tournament" };
    modal.innerHTML = `<small>GOALS</small><h2>${UNLOCK_NAMES[what]}${again ? "" : " unlocked"}</h2>` + UNLOCK_TUTORIALS[what] +
      `<div class="dialog-actions"><button id="unlock-ok">${visit ? "Later" : "Got it"}</button>${visit ? `<button id="unlock-visit">${where.label}</button>` : ""}</div>`;
    modal.showModal();
    el("unlock-ok").onclick = () => modal.close();
    if (visit) el("unlock-visit").onclick = () => (modal.close(), this.ctx.navigate(where.page));
  }

  private askWarp(tower: number, floor: number) {
    const towerName = this.towers > 1 ? ` of Tower ${tierNumeral(tower)}` : "";
    this.ctx.confirm(
      { title: `Warp to floor ${floor}?`, body: `Begin a new climb${towerName} from the floor ${floor} checkpoint, on floor ${floor + 1}.`, label: "Warp", cancel: "Not yet" },
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
      const refused = game.shop.buy(pass.id as Parameters<typeof game.shop.buy>[0], now, true);
      if (refused) return void (el("pass-message").textContent = "Already yours.");
      this.ctx.modal.close();
      this.message = `Premium Pass ${pass.n} unlocked!`;
      this.ctx.update();
      this.render();
      const shown = offerShown(offer(pass.id)!);
      if (shown) revealReward(shown, game.save.settings.reduceMotion);
    } finally {
      this.busy = false;
    }
  }
}

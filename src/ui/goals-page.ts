import { controlIcon } from "./control-icon.ts";
import { kitIcon } from "../sprites/kit.ts";
import { GOAL_SPRITES } from "../sprites/ui-details.ts";
import { GOAL_BREAKTHROUGH, CHECKPOINT_EVERY, CHECKPOINT_FLOORS, CHECKPOINTS, UNLOCK_NAMES, areaCleared, checkpoint, areaMastered, canWarp, floorsCompleted, goalState, unmasteredBelow, passFor, passTotals, unlockAt, unlockFloor, warpUnlocked, type Checkpoint, type GoalReward, type GoalState, type GoalUnlock, type Pass } from "../goals.ts";
import { CURRENCIES, type CurrencyId } from "../shop/currency.ts";
import { owns } from "../shop/entitlements.ts";
import { stubServer, type ShopServer } from "../shop/server.ts";
import { money, offer } from "../shop/offers.ts";
import { clearedInspiration } from "../tower/area-ledger.ts";
import { tierNumeral, tierRewardText, tierStats } from "../tiers.ts";
import type { AppContext } from "./app.ts";
import { el, eventIcon, gemIcon, goldIcon, medalIcon, arcaniteIcon, relicIcon, vipIcon, shrineIcon, trophyIcon, uiSprite } from "./dom.ts";
import { RELICS } from "../economy/relics.ts";
import { showRelic } from "./relic-pop.ts";
import { flyToPurse } from "./flourish.ts";
import { goalRewardShown, offerShown, revealReward } from "./reward-reveal.ts";
import { tiersReachable } from "../access.ts";
import { play } from "../sound.ts";

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

const CURRENCY_ICONS: Record<CurrencyId, () => string> = { gems: () => gemIcon("gem-icon goal-icon"), arcanite: () => arcaniteIcon("arcanite-icon goal-icon"), gold: goldIcon, medals: () => medalIcon("medal-icon goal-icon"), vip: () => vipIcon("vip-icon goal-icon") };
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
  aetherShield: `<p>Once you own the Shield HP and Regrow Shield skills, their research opens in the Archives. Your shield holds more HP, and grows back sooner after it breaks.</p>`,
  superCriticalResearch: `<p>Once you own the Super Critical skill, Super Critical Chance and Super Critical Factor research open in the Archives. Critical hits turn Super Critical more often, and hit harder when they do.</p>`,
  flyingEnemyCard: `<p>The Flying Enemy card joins your deck. It walks you toward the closest Flying enemy your arrows can hurt, then stops and holds still once that enemy is within your Attack Range.</p>` +
    `<p>While it is in your hand, your arrows strike with 5% more ATK and charge 5% faster.</p>` +
    `<p class="hint">Flying enemies hover out of reach of your sword. You can walk right under them, but only arrows bring them down, and one your arrow wounds will come after you.</p>`,
  warpLoot: `<p>Warp Loot opens in the Archives. When a climb starts above floor 1, from a Warp or a Retry after one, it brings some of the Silver the skipped floors would have paid.</p>` +
    `<p>Each level adds 2%, so level 50 brings all of it.</p>` +
    `<p class="hint">The skipped floors' kills, Wishing Well and Interest are estimated from your training and research when the climb begins.</p>`,
  trainingDiscount: `<p>Training Discount opens in the Archives. Each level takes 0.5% off the Gold your trainers charge per rank, up to 49.5% at level 99.</p>` +
    `<p class="hint">Training points and a climb's Silver cost the same as before.</p>`,
  cardGroups: `<p>Card Groups opens on the Deck. Tap a diamond under the hand, between two cards, to link them.</p>` +
    `<p>Linked cards share one priority, and the hero goes for whichever of their targets is closest.</p>` +
    `<p class="hint">Link Gold Key and Blue Key, and the hero takes the nearer key. Moving a card out of place breaks its links.</p>`,
  archerCard: `<p>The Archer card joins your deck. It never moves you, but while you hold it your hero is an Archer.</p>` +
    `<p>Every 10 turns you fire an arrow at the closest enemy within 3 m, straight through walls and doors. It deals one strike's damage, crits and the enemy's DEF counted, before you ever reach it.</p>` +
    `<p>Holding the card also adds 5% ATK against bosses, and lets you raise Archer training with Silver during a climb. Training it between climbs works with or without the card.</p>` +
    `<p class="hint">A ready shot waits until an enemy comes in range. Ranged enemies reach five sixths as far as you do, so shoot first and close in after.</p>`,
  attackRange: `<p>Attack Range joins Offense training. Each rank adds 0.05 m to your arrows' reach, from 3 m up to 7 m.</p>` +
    `<p class="hint">Ranged enemies always reach five sixths as far as you do.</p>`,
  attackPerTile: `<p>ATK / m joins Offense training. Your arrows hit harder the farther away the target stands, counted in tiles straight across.</p>` +
    `<p>The first rank gives ×1.01 per tile, and 200 ranks give ×2.204.</p>` +
    `<p class="hint">An enemy your arrows can't hurt up close may fall to a shot from farther off. Critical hits multiply on top.</p>`,
  chargedShot: `<p>Charged Shot opens in the Archives. Each turn a ready arrow goes unfired, the next one gains 1% ATK per level researched.</p>` +
    `<p class="hint">A charged arrow flies in a blue glow, and its number has a gold outline. The bonus stacks with ATK / m and critical hits, and resets when the arrow fires.</p>`,
  multishot: `<p>Multishot Chance and Multishot Targets join Offense training. A multishot fires at several enemies in range together.</p>` +
    `<p>Each rank of Chance adds 0.5%, up to 49.5%. A multishot hits 2 enemies, plus one for each rank of Targets, up to 9.</p>` +
    `<p class="hint">Each arrow of a multishot carries the first one's Charged Shot, rolls its own crit and uses its own distance for ATK / m. With fewer enemies in range, each gets one arrow.</p>`,
  rapidFire: `<p>Rapid Fire Chance and Rapid Fire Duration join Offense training. Each shot has a chance to start Rapid Fire, and while it lasts your arrows come four times as fast.</p>` +
    `<p>Each rank of Chance adds 0.4%, up to 34%. Rapid Fire lasts 1 turn, plus 0.05 turns for each rank of Duration, up to 5.95.</p>` +
    `<p class="hint">A shot fired during Rapid Fire can't start another. When it ends, the next shot carries on from where it was, at the usual pace.</p>`,
  attackSpeed: `<p>Attack Speed joins Offense training. Each rank adds 0.05 shots every 10 turns, from 1 up to 6.</p>` +
    `<p class="hint">Leftover fractions of a turn carry over, so 3 shots in 10 turns fire 4, 3 and 3 turns apart.</p>`,
  tournament: `<p>The Tournament opens twice a week, on Wednesday and Saturday (GMT). It is one Delve run with tougher enemies, on the same seeds for everyone in your league, scored by how deep you get and ranked worldwide.</p>` +
    `<p>Its Hall stands in the forest, right of the path. Tap it to see when the next one opens. While a tournament is open, the trophy at the right leads down to the Delve's cave, and going in costs a Ticket.</p>` +
    `<p class="hint">Each new tournament gives you a Ticket. Place high to win Gems and Arcanite, and climb the leagues from Copper through Silver, Gold and Platinum to Champion.</p>`,
  events: `<p>A new Event starts every two weeks. Its missions come out over the first eight days, and each has three tiers that pay Medals.</p>` +
    `<p>Medals from an event count toward its relics, keepsakes that each give a permanent bonus. The Event Booster doubles them and opens two premium relics.</p>` +
    `<p class="hint">Tap the pennant at the right to see the current event. Relics you own are on the Relics screen, in the menu.</p>`,
  damagePrediction: `<p>When you inspect an enemy in a climb, its panel now tells you how much HP the fight would cost and whether you'd survive.</p>` +
    `<p>It reads Survivable, Harmless if it costs no HP, LETHAL, or Instakill if your first strike wins.</p>`,
  combatForecast: `<p>When you inspect an enemy in a climb, its panel now also says how many hits it takes to defeat it, or Instakill if one does.</p>`,
  attackLore: `<p>When you inspect an enemy in a climb, its panel now also says how much more ATK you'd need to defeat it in one hit fewer.</p>` +
    `<p class="hint">You can train ATK during a climb, even mid-fight, to take advantage of it.</p>`,
  warp: `<p>Master an area by climbing its ten floors without taking damage, and you can warp to the next checkpoint. Tap its floor number to start a new climb on the floor just above it.</p>` +
    `<p class="hint">Checkpoints with a golden swirl can be warped to. Entering the tower from the forest always starts on floor 1.</p>`,
  relativeDamageColor: `<p>Each enemy's damage number is now coloured by how much of your current HP the fight would cost.</p>` +
    `<p>Under 1% is bright green. It shifts to yellow at 10%, orange at 25%, and red at half your HP or more.</p>` +
    `<p class="hint">Gray still marks an Instakill, and red a lethal fight.</p>`,
  damageVisual: `<p>Every enemy on the board now shows, in its lower-left corner, how much HP its fight would cost you.</p>` +
    `<p>The number is red when the fight is lethal, white when it hits you but costs no HP, and gray when your first strike wins. ∞ means you can't hurt it.</p>` +
    `<p>Items show what they give too. A potion's HP is blue, a shard's ATK or DEF white, and a chest's Gold yellow.</p>` +
    `<p class="hint">Turn it off in Settings if the board feels crowded.</p>`,
  equipment: `<p>A Blacksmith opens in the forest. Tap it, or the Gear tab, to wear weapons, armour and trinkets, level them up with Gold and materials, and merge them.</p>` +
    `<p class="hint">With the Chest card in your hand, a treasure chest may now be a Supply Chest with upgrade materials, or an Equipment Chest with a piece of equipment.</p>`,
  noteTaking: `<p>Note Taking opens in the Archives. Once researched, tap the floor number during a climb to read its notes.</p>` +
    `<p>They're kept as you play and cover time, steps, kills, keys, doors, chests and loot.</p>` +
    `<p class="hint">The notes stay open while the climb goes on, and you can copy them to paste elsewhere. The climb's summary opens them too.</p>`,
  rerollMission: `<p>Reroll Daily Mission opens in the Archives. Once researched, each unfinished daily mission gets a looping arrow on the Missions screen.</p>` +
    `<p>Tap it and spend 5 Gems to swap the mission for a different one.</p>` +
    `<p class="hint">You never get a mission already on your list, and its progress starts from zero.</p>`,
  bossPotion: `<p>Boss Potion Drop opens in the Archives. Once researched, each boss you defeat drops a percent potion that you drink on the spot, wherever you are.</p>` +
    `<p class="hint">It heals the same as picking up a percent potion, Potion % and HEAL's tree included.</p>`,
  esotericResearch: `<p>Esoteric Research opens the last 50 levels of every Archives project that has 100 or 150, such as Research Speed, Potion HP and the ATK, DEF and Max HP projects.</p>` +
    `<p class="hint">Until it is claimed, those projects stop 50 levels short.</p>`,
  dropResearch: `<p>Drop &amp; Material Research opens two projects in the Archives' Equipment section.</p>` +
    `<p>Common Drop Chance gives each boss you defeat a chance to drop a Common piece of equipment, 0.1% per level up to 1%. Daily Mission Materials adds one upgrade material per level, up to 50, to each daily mission's reward.</p>` +
    `<p class="hint">The Common piece is rolled separately from the boss's usual drops.</p>`,
  familiarResearch: `<p>Familiar Research opens five projects in the Archives' Familiars section, one for each familiar's Cooldown. Each level makes its effect come 1 turn sooner, up to 25 turns.</p>` +
    `<p class="hint">Familiars hatch from eggs bought with Medals, on the Events screen's Familiars tab.</p>`,
  researchSpeed: `<p>Research Speed opens in the Archives. It trains your archivists to read faster, so every project takes less time, including ones already under way.</p>`,
  badgeSlots: `<p>Badge Slots opens in the Archives. Each level lets every card hold one more badge.</p>` +
    `<p>Drag a badge onto a card on the Deck page to fill its next slot. If every slot is full, it replaces the bottom one.</p>` +
    `<p class="hint">Some badges can't share a card, such as a key colour's &lt; gate and its ≥ gate (GK &lt; with GK ≥), or Effective with Dampen.</p>`,
  shardAttack: `<p>Shard ATK opens in the Archives. Each level makes every ATK shard you pick up give more ATK, starting with the next one, in both the Tower and the Delve.</p>`,
  parryPercent: `<p>Once you have Parry, Parry % opens in the Archives. Each level makes your parries block more damage, starting right away, in both the Tower and the Delve.</p>` +
    `<p class="hint">No matter how it's raised, a parry blocks at most 98% of a strike.</p>`,
  shardDefense: `<p>Shard DEF opens in the Archives. Each level makes every DEF shard you pick up give more DEF, starting with the next one, in both the Tower and the Delve.</p>`,
  shrines: `<p>Unlock Shrines opens in the Archives. Once researched, every few floors you climb in the Tower earns a boon, a bonus for the rest of the climb, picked from a short list.</p>` +
    `<p class="hint">It also opens Floors Required and Standard Boon Bonus research. Boons are only found in the Tower, not the Delve.</p>`,
  firstBoonChoice: `<p>Once you have Shrines, First Boon Choice opens in the Archives. Use the forest's Shrine Boons page to pick a standard boon that leads every climb's first offer.</p>`,
  improveTradeoffs: `<p>Once you have Shrines, Improve Trade-off Boons opens in the Archives. It makes every trade-off boon's benefit bigger without raising its cost.</p>`,
  autoPickBoons: `<p>Once you have Shrines, Auto Pick Boons opens in the Archives. A climb can then take the top boon offered each time it earns one.</p>` +
    `<p class="hint">Switch it on or off from the Shrine button during a climb.</p>`,
  boonOptions: `<p>Once you have Shrines, Boon Option Quantity opens in the Archives. Each level adds one more boon to choose from, up to four.</p>`,
  banBoons: `<p>Once you have Shrines, Ban Boons opens in the Archives. Use the forest's Shrine Boons page to stop boons you don't want from being offered.</p>`,
  autoPickRanking: `<p>Once you have Auto Pick Boons, Auto Pick Ranking opens in the Archives. Use the forest's Shrine Boons page to set which boons Auto Pick takes first.</p>`,
};
const LOCK_ICON = kitIcon("lock", "", "goal-badge");
/** Beside a checkpoint's floor: its area mastered (a golden swirl, shown once Warp is owned) and cleared (a green check). */
const SWIRL_MARK = kitIcon("ui-mastered", "", "goal-mark");
const CLEARED_MARK = kitIcon("check", "", "goal-mark");
const CHECK_ICON = kitIcon("check", "", "goal-badge");

/** A checkpoint's Breakthrough points: the Breakthrough tree's own icon. */
const BREAKTHROUGH_ICON = uiSprite("breakthrough", "ui-sprite goal-icon");
const rewardIcon = (r: GoalReward) =>
  r.kind === "unlock" ? UNLOCK_ICONS[r.unlock] : r.kind === "tower" ? TOWER_ICON : r.kind === "relic" ? relicIcon(RELICS[r.relic]!)
  : r.kind === "breakthrough" ? BREAKTHROUGH_ICON : CURRENCY_ICONS[r.currency]();
/** An unlock's name with "Unlock" before it, once: Unlock Shrines is already named so. */
const unlockText = (u: GoalUnlock) =>
  UNLOCK_NAMES[u].startsWith("Unlock ") ? UNLOCK_NAMES[u] : `Unlock ${u === "tournament" ? "the " : ""}${UNLOCK_NAMES[u]}`;
const rewardText = (r: GoalReward) =>
  r.kind === "unlock" ? unlockText(r.unlock)
  : r.kind === "tower" ? `Unlock Tower ${tierNumeral(r.tower)}`
  : r.kind === "relic" ? RELICS[r.relic]!.name
  : r.kind === "breakthrough" ? `${r.amount} Breakthrough`
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
    return tiersReachable(this.ctx.game.save, "tower");
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
      if (r.kind === "relic") return showRelic(RELICS[r.relic]!, { reduceMotion: game.save.settings.reduceMotion });
      return r.kind === "tower" ? this.towerOpened(r.tower, true) : this.say("Already claimed.");
    }
    const reward = game.claimGoal(tower, floor, premium);
    if (!reward) return;
    if (reward.kind === "tower") play("newTower");
    this.message = `Claimed: ${rewardText(reward)}`;
    this.ctx.update();
    this.render();
    // An unlock's or tower's dialog waits for the point to land, so it doesn't hide it.
    const explain = () => {
      if (reward.kind === "unlock") this.unlockTutorial(reward.unlock);
      if (reward.kind === "tower") this.towerOpened(reward.tower);
      if (reward.kind === "relic") showRelic(RELICS[reward.relic]!, { reduceMotion: game.save.settings.reduceMotion, obtained: true });
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
      `<div class="dialog-actions"><button id="pass-close">${owned ? "Close" : "Not now"}</button>${owned ? "" : `<button id="pass-buy">Unlock · ${money(pass.sku, pass.dollars).label}</button>`}</div>`;
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

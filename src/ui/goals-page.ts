import { CHECKPOINT_EVERY, CHECKPOINT_FLOORS, CHECKPOINTS, UNLOCK_NAMES, areaCleared, checkpoint, areaMastered, canWarp, floorsCompleted, goalState, unmasteredBelow, passFor, passTotals, unlockAt, unlockFloor, warpUnlocked, type Checkpoint, type GoalReward, type GoalState, type GoalUnlock, type Pass } from "../goals.ts";
import { CURRENCIES, type CurrencyId } from "../shop/currency.ts";
import { owns } from "../shop/entitlements.ts";
import { stubServer, type ShopServer } from "../shop/server.ts";
import { offer } from "../shop/offers.ts";
import { clearedInspiration } from "../tower/area-ledger.ts";
import { tierNumeral, tierRewardText, tierStats } from "../tiers.ts";
import type { AppContext } from "./app.ts";
import { el, eventIcon, gemIcon, goldIcon, medalIcon, shardIcon, shrineIcon, trophyIcon } from "./dom.ts";
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

const CURRENCY_ICONS: Record<CurrencyId, () => string> = { gems: () => gemIcon("gem-icon goal-icon"), shards: () => shardIcon("shard-icon goal-icon"), gold: goldIcon, medals: () => medalIcon("medal-icon goal-icon") };
/** Each unlock's icon: Damage Prediction a cracked heart, Combat Forecast an eye over crossed blades, Attack
 * Lore an open book with a rising arrow, Warp a portal's swirl, Damage Visual a monster's tile with a red
 * number in its corner, Relative Damage Color that tile over a green-to-red bar, Equipment an anvil
 * under a hammer, the Tournament a trophy, Events a pennant, Research Speed an hourglass, Shard ATK and Shard DEF a red or
 * blue shard under a rising arrow, Badge
 * Slots a card wearing two badges, one above the other, Note Taking an open notebook under a quill,
 * the Archer Class a drawn bow and arrow, Attack Range an arrow flying past
 * a range ring, Attack Speed two arrows in a row, Training Discount a Gold
 * coin under a falling arrow, Card Groups two cards linked by a bracket and
 * a diamond, and every Shrine research a shrine's gate (`shrineIcon`). */
const UNLOCK_ICONS: Record<GoalUnlock, string> = {
  trainingDiscount: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="13" r="7.5" fill="#6b4a0e" stroke="#ffd34d" stroke-width="1.5"/><circle cx="10" cy="13" r="4.6" fill="none" stroke="#ffe58a" stroke-width="1"/><path d="M19.5 2.5v9M16.6 8.6l2.9 2.9 2.9-2.9" fill="none" stroke="#8ff0a8" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  cardGroups: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2.5" width="8.5" height="12" rx="1.3" fill="#2a3346" stroke="#c9ced8" stroke-width="1.2"/><rect x="13.5" y="2.5" width="8.5" height="12" rx="1.3" fill="#2a3346" stroke="#c9ced8" stroke-width="1.2"/><path d="M6.25 17v3h11.5v-3" fill="none" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/><path d="M12 17.2l2.3 2.8-2.3 2.8-2.3-2.8z" fill="#fff" stroke="#1d2230" stroke-width=".8"/></svg>`,
  archer: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2.5c6 2.5 6 16.5 0 19" fill="none" stroke="#b07a42" stroke-width="2" stroke-linecap="round"/><path d="M7 2.5v19" stroke="#e6ebf2" stroke-width=".9"/><path d="M4 12h16" stroke="#c9ced8" stroke-width="1.5" stroke-linecap="round"/><path d="M17.5 9.5L21 12l-3.5 2.5z" fill="#ffd34d"/><path d="M4 12l-1.5-2M4 12l-1.5 2" stroke="#e86d7a" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  attackRange: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="14" r="7.5" fill="#1c2a44" stroke="#8fc4ff" stroke-width="1.3" stroke-dasharray="2.4 1.6"/><circle cx="9" cy="14" r="1.6" fill="#8fc4ff"/><path d="M9 14L20 3" stroke="#c9ced8" stroke-width="1.5" stroke-linecap="round"/><path d="M21.5 1.5l-1.2 4.4-3.2-3.2z" fill="#ffd34d"/></svg>`,
  attackSpeed: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 8h14M2.5 16h14" stroke="#c9ced8" stroke-width="1.5" stroke-linecap="round"/><path d="M15.5 5.2L20.5 8l-5 2.8zM15.5 13.2L20.5 16l-5 2.8z" fill="#ffd34d"/><path d="M2.5 8L1 6.4M2.5 8L1 9.6M2.5 16L1 14.4M2.5 16L1 17.6" stroke="#e86d7a" stroke-width="1.1" stroke-linecap="round"/></svg>`,
  attackPerTile: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21.5h3v-3H3zM9 21.5h3v-6H9zM15 21.5h3v-9h-3z" fill="#6b3a44" stroke="#df797e" stroke-width="1.1" stroke-linejoin="round"/><path d="M2.5 13L19 3" stroke="#c9ced8" stroke-width="1.5" stroke-linecap="round"/><path d="M21.5 1.5l-4.4.6 2.2 3.4z" fill="#ffd34d"/></svg>`,
  chargedShot: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="#2a2214" stroke="#ffd34d" stroke-width="1.3" stroke-dasharray="3 1.8"/><path d="M4.5 19.5L17 7" stroke="#000" stroke-width="3" stroke-linecap="round"/><path d="M4.5 19.5L17 7" stroke="#c9ced8" stroke-width="1.5" stroke-linecap="round"/><path d="M19.5 4.5l-1.3 4.6-3.3-3.3z" fill="#ffd34d" stroke="#000" stroke-width=".6"/></svg>`,
  multishot: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12L19 4M2.5 12h16.5M2.5 12L19 20" stroke="#c9ced8" stroke-width="1.4" stroke-linecap="round"/><path d="M21.5 2.8l-4.3.4 1.9 3.7zM22 12l-4-2.2v4.4zM21.5 21.2l-2.4-4.1-1.9 3.7z" fill="#ffd34d"/><path d="M2.5 12L1 10.4M2.5 12L1 13.6" stroke="#e86d7a" stroke-width="1.1" stroke-linecap="round"/></svg>`,
  rapidFire: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 7.5H16M2.5 12H18M2.5 16.5H16" stroke="#c9ced8" stroke-width="1.4" stroke-linecap="round"/><path d="M19 7.5l-3.4-1.9v3.8zM21 12l-3.4-1.9v3.8zM19 16.5l-3.4-1.9v3.8z" fill="#ffd34d"/><path d="M1 5.5h3M1 18.5h3" stroke="#e86d7a" stroke-width="1.1" stroke-linecap="round"/></svg>`,
  shrines: shrineIcon("goal-icon"), firstBoonChoice: shrineIcon("goal-icon"), improveTradeoffs: shrineIcon("goal-icon"), autoPickBoons: shrineIcon("goal-icon"),
  boonOptions: shrineIcon("goal-icon"), banBoons: shrineIcon("goal-icon"), autoPickRanking: shrineIcon("goal-icon"),
  badgeSlots: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="2.5" width="14" height="19" rx="2" fill="#2a2234" stroke="#c9a6ff" stroke-width="1.4"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="1.8" fill="#0c1018" stroke="#ffd34d" stroke-width="1.3"/><path d="M16.75 5.4l1.5 2.6h-3z" fill="#7be07b"/><rect x="13" y="12" width="7.5" height="7.5" rx="1.8" fill="#0c1018" stroke="#ffd34d" stroke-width="1.3"/><path d="M16.75 17.6l1.5-2.6h-3z" fill="#ff6b6b"/></svg>`,
  shardAttack: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5l4.5 5-4.5 8-4.5-8z" fill="#a8323a" stroke="#ff9aa0" stroke-width="1.3" stroke-linejoin="round"/><path d="M12 8.5v13" stroke="#ff9aa0" stroke-width=".9"/><path d="M12 6V1.8M9 4.6l3-3 3 3" fill="none" stroke="#ffd34d" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  shardDefense: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5l4.5 5-4.5 8-4.5-8z" fill="#2f5fa8" stroke="#9cc4ff" stroke-width="1.3" stroke-linejoin="round"/><path d="M12 8.5v13" stroke="#9cc4ff" stroke-width=".9"/><path d="M12 6V1.8M9 4.6l3-3 3 3" fill="none" stroke="#ffd34d" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  noteTaking: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9C9.5 7 6.5 6.5 3 7v12c3.5-.5 6.5 0 9 2 2.5-2 5.5-2.5 9-2V7c-3.5-.5-6.5 0-9 2z" fill="#3a2a1a" stroke="#e2a15c" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 9v12" stroke="#e2a15c" stroke-width="1.2"/><path d="M5.5 11h4M5.5 14h4M14.5 14h4" stroke="#ffd59a" stroke-width="1.1" stroke-linecap="round"/><path d="M21.5 1.5c-3 1-5.5 3.5-6.5 7l1.2.4c1.6-2.7 3.4-4.8 5.3-7.4z" fill="#f0e2ff" stroke="#c9a6ff" stroke-width=".9" stroke-linejoin="round"/></svg>`,
  tournament: trophyIcon("goal-icon"),
  events: eventIcon("goal-icon"),
  researchSpeed: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9" fill="none" stroke="#8fc4ff" stroke-width="1.6" stroke-linecap="round"/><path d="M9 19c1-2 2-2.5 3-2.5s2 .5 3 2.5z" fill="#ffd59a"/></svg>`,
  damagePrediction: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5S3.5 15 3.5 9A4.5 4.5 0 0 1 12 6.6 4.5 4.5 0 0 1 20.5 9c0 6-8.5 11.5-8.5 11.5z" fill="#4a1a22" stroke="#e86d7a" stroke-width="1.6" stroke-linejoin="round"/><path d="M12.5 7.5l-2 4 3 1.5-2 4" fill="none" stroke="#ffd0d5" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  combatForecast: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19L17 7M19 19L7 7" stroke="#c9ced8" stroke-width="2" stroke-linecap="round"/><path d="M3.5 9.5C6 5.5 9 4 12 4s6 1.5 8.5 5.5C18 13.5 15 15 12 15s-6-1.5-8.5-5.5z" fill="#1c2a44" stroke="#8fc4ff" stroke-width="1.5"/><circle cx="12" cy="9.5" r="2.6" fill="#8fc4ff"/></svg>`,
  attackLore: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.5C9.5 5.5 6.5 5 3 5.5v12c3.5-.5 6.5 0 9 2 2.5-2 5.5-2.5 9-2v-12c-3.5-.5-6.5 0-9 2z" fill="#3a2a1a" stroke="#e2a15c" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 7.5v12" stroke="#e2a15c" stroke-width="1.2"/><path d="M16.5 15V9.5M14.3 11.6l2.2-2.3 2.2 2.3" fill="none" stroke="#ffd59a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  warp: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="8" ry="10" fill="#2a1d4a" stroke="#c9a6ff" stroke-width="1.6"/><path d="M12 6.5c3 0 4.6 2.4 4 4.8-.6 2.3-3.4 3.3-5.2 2-1.5-1-1.2-3.2.4-3.6 1.1-.3 2 .6 1.6 1.5" fill="none" stroke="#f0e2ff" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  parryPercent: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3.5l6 2.2v4.9c0 4-2.6 7-6 8.6-3.4-1.6-6-4.6-6-8.6V5.7z" fill="#1c2a44" stroke="#8fc4ff" stroke-width="1.5" stroke-linejoin="round"/><path d="M21.5 3l-6 5.5c-.9.8-.9 2 0 2.8l2 1.7" fill="none" stroke="#ffd34d" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 22V17M13.8 19.2l2.2-2.3 2.2 2.3" fill="none" stroke="#ffd34d" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  equipment: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h13.5c2 0 3.5-1 4-2.5v3c-.5 1.8-2 3-4 3H15l1.5 4h-9L9 15.5H6.5C4.5 15.5 3 14 3 12z" fill="#3a3f4b" stroke="#c9ced8" stroke-width="1.4" stroke-linejoin="round"/><path d="M13 9.5L18.5 4" stroke="#b07a42" stroke-width="2" stroke-linecap="round"/><rect x="15.6" y="1.6" width="6" height="3.2" rx=".8" transform="rotate(45 18.6 3.2)" fill="#8d97a8" stroke="#e6ebf2" stroke-width="1"/></svg>`,
  damageVisual: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="2.5" fill="#1d2230" stroke="#8d97a8" stroke-width="1.3"/><path d="M8 15.5c0-4.5 1.8-8 4.5-8s4.5 3.5 4.5 8l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1z" fill="#6b3a44" stroke="#df797e" stroke-width="1.2" stroke-linejoin="round"/><circle cx="11" cy="11" r="0.9" fill="#ffd0d5"/><circle cx="14" cy="11" r="0.9" fill="#ffd0d5"/><path d="M4.5 20.5v-5h2.6a1.6 1.6 0 0 1 0 3.2H4.5" fill="none" stroke="#000" stroke-width="2.6" stroke-linejoin="round"/><path d="M4.5 20.5v-5h2.6a1.6 1.6 0 0 1 0 3.2H4.5" fill="none" stroke="#ff5a5a" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  relativeDamageColor: `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="goal-spectrum"><stop offset="0" stop-color="#4dff6a"/><stop offset=".35" stop-color="#ffe14d"/><stop offset=".65" stop-color="#ff9a3d"/><stop offset="1" stop-color="#ff5a5a"/></linearGradient></defs><rect x="2.5" y="2.5" width="19" height="14" rx="2.5" fill="#1d2230" stroke="#8d97a8" stroke-width="1.3"/><path d="M8.5 13.5c0-3.6 1.5-6.5 3.5-6.5s3.5 2.9 3.5 6.5l-1.2-.8-1.2.8-1.1-.8-1.1.8-1.2-.8z" fill="#6b3a44" stroke="#df797e" stroke-width="1.1" stroke-linejoin="round"/><rect x="2.5" y="18" width="19" height="3.5" rx="1.75" fill="url(#goal-spectrum)" stroke="#000" stroke-width=".8"/></svg>`,
};
/** The next tower's reward: a tower's silhouette with its door lit. */
const TOWER_ICON = `<svg class="goal-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21.5V8.5H4.5v-5h3v2h2.2v-2h4.6v2h2.2v-2h3v5H18v13z" fill="#3a3f4b" stroke="#c9ced8" stroke-width="1.3" stroke-linejoin="round"/><path d="M10 21.5v-4a2 2 0 0 1 4 0v4z" fill="#ffd34d"/><rect x="11" y="10" width="2" height="3" rx=".5" fill="#ffd34d"/></svg>`;
/** What each unlock does, shown once it is claimed and again whenever its claimed reward is pressed. */
const UNLOCK_TUTORIALS: Record<GoalUnlock, string> = {
  trainingDiscount: `<p>Training Discount opens in the Archives: research it, and every rank a trainer trains costs 0.5% less Gold a level, up to 49.5% at level 99.</p>` +
    `<p class="hint">Training points and a run's Silver cost the same as ever.</p>`,
  cardGroups: `<p>Card Groups opens on the Deck: tap a diamond under the hand, between two cards, to link them into a group. The cards of a group share one priority: of every target any of them can reach, the hand heads for the closest.</p>` +
    `<p class="hint">Link Yellow Key and Blue Key, and the hero takes whichever key is nearer. Moving a card out of place breaks its links.</p>`,
  archer: `<p>Your hero is now an Archer: every 10 turns it fires an arrow at the closest enemy within 3 m, walls and doors no obstacle, dealing one strike's damage (critical hits and the enemy's DEF counted) before you ever touch it.</p>` +
    `<p>A ready shot waits for an enemy to come in range, and fires the turn one does. Only Ranged enemies can shoot back; the rest strike only when you fight them.</p>` +
    `<p class="hint">Ranged enemies reach five sixths as far as your arrows: strike first, then close in.</p>`,
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
    `<p>Its Hall now stands in the forest, right of the path: tap it, or the trophy at the right, to see when the next one opens.</p>` +
    `<p class="hint">Each new tournament gives you a Ticket to enter. Place high to win Gems and Ascension Shards, and climb from Copper through Silver, Gold and Platinum to Champion.</p>`,
  events: `<p>Every two weeks an Event begins: missions released over its first eight days, each with three tiers paying Medals as you complete them.</p>` +
    `<p>The Medals an event pays count toward its relics, unique keepsakes that each give a permanent bonus. The Event Booster doubles them, and opens two premium relics.</p>` +
    `<p class="hint">Tap the pennant at the right to see the running event. The relics you own wait on the Relics screen, in the menu.</p>`,
  damagePrediction: `<p>Inspect an enemy in a run and its panel now says how much HP the fight would cost you, and whether you survive it: Survivable, Harmless when it costs no HP, LETHAL, or Instakill when your first strike defeats it.</p>`,
  combatForecast: `<p>Inspect an enemy in a run and its panel now also says how many of your hits defeat it, or Instakill when one does.</p>`,
  attackLore: `<p>Inspect an enemy in a run and its panel now also says how much more ATK would defeat it in one hit fewer.</p>` +
    `<p class="hint">Train ATK in the run, even mid-fight, to make the most of it.</p>`,
  warp: `<p>Master an area, climbing its ten floors without taking damage, to warp to the next checkpoint: tap the floor number to begin a new ascent there at once, on the floor just above it.</p>` +
    `<p class="hint">Checkpoints with a golden swirl can be warped to. Entering the tower from the forest always starts on floor 1.</p>`,
  relativeDamageColor: `<p>Each enemy's damage number now takes its colour from your HP as it stands: bright green when the fight costs under 1% of it, sliding through yellow at 10% and orange at 25% to red at half your HP or more.</p>` +
    `<p class="hint">Gray still marks an Instakill, and red a lethal fight.</p>`,
  damageVisual: `<p>Every enemy on the board now shows, in its lower-left corner, how much HP its fight would cost you: red when it is lethal, white when it strikes you but costs no HP, gray when your first strike defeats it, and ∞ when you can't hurt it.</p>` +
    `<p>Items show what they give: a potion's HP in blue, a shard's ATK or DEF in white, and a chest's Gold in yellow.</p>` +
    `<p class="hint">Turn it off in Settings if the board feels crowded.</p>`,
  equipment: `<p>A Blacksmith opens in the forest: tap it, or the Gear tab, to wear weapons, armour and trinkets, level them up with Gold and materials, and merge them.</p>` +
    `<p class="hint">Every boss now has a chance to drop equipment, on any floor, and every enemy drops upgrade materials.</p>`,
  noteTaking: `<p>Note Taking opens in the Archives: research it, and tap the floor number during a run to read the run's notes, kept as you play: its time, steps, kills, keys, doors, chests and loot.</p>` +
    `<p class="hint">The notes stay open while the run plays on, and copy to paste elsewhere. The run's summary opens them too.</p>`,
  researchSpeed: `<p>Research Speed opens in the Archives: train the archivists to read faster, and every research, those under way included, takes less time.</p>`,
  badgeSlots: `<p>Badge Slots opens in the Archives: research it, and each card holds one more badge a level. Drag a badge onto a card on the Deck page to fill its next slot; on a card with every slot full, it takes the bottom slot's place.</p>` +
    `<p class="hint">Badges that can't work together can't share a card: a key colour's &lt; gate with its ≥ gate (YK &lt; with YK ≥), or Effective with Dampen.</p>`,
  shardAttack: `<p>Shard ATK opens in the Archives: research it, and every ATK shard a run picks up raises ATK by more, from the next one on, in the Tower and the Delve alike.</p>`,
  parryPercent: `<p>Parry % opens in the Archives once Parry is yours: research it, and every strike you parry is cut by more, at once, in the Tower and the Delve alike.</p>` +
    `<p class="hint">However it is raised, a parry cuts a strike's damage by at most 98%.</p>`,
  shardDefense: `<p>Shard DEF opens in the Archives: research it, and every DEF shard a run picks up raises DEF by more, from the next one on, in the Tower and the Delve alike.</p>`,
  shrines: `<p>Unlock Shrines opens in the Archives: research it, and every so many floors climbed in the Tower grants a boon, a bonus that lasts the rest of the run, chosen from a few offered.</p>` +
    `<p class="hint">Its research also opens Floors Required and Standard Boon Bonus. Boons are the Tower's alone, not the Delve's.</p>`,
  firstBoonChoice: `<p>First Boon Choice opens in the Archives once Shrines are yours: research it, and pick on the forest's Shrine Boons page a standard boon to head every run's first offer.</p>`,
  improveTradeoffs: `<p>Improve Trade-off Boons opens in the Archives once Shrines are yours: research it, and the benefit of every trade-off boon grows, its cost unchanged.</p>`,
  autoPickBoons: `<p>Auto Pick Boons opens in the Archives once Shrines are yours: research it, and a run can pick its boons itself, the top one offered, as soon as each is earned.</p>` +
    `<p class="hint">Turn it on or off from the Shrine button in a run.</p>`,
  boonOptions: `<p>Boon Option Quantity opens in the Archives once Shrines are yours: research it, and each boon offered gives one more to choose from, up to four.</p>`,
  banBoons: `<p>Ban Boons opens in the Archives once Shrines are yours: research it, and ban boons from ever being offered, on the forest's Shrine Boons page.</p>`,
  autoPickRanking: `<p>Auto Pick Ranking opens in the Archives once Auto Pick Boons is yours: research it, and rank the boons Auto Pick takes first, on the forest's Shrine Boons page.</p>`,
};
const LOCK_ICON = `<svg class="goal-badge" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7.5" rx="1.5" fill="#3a3f4b" stroke="#c9ced8" stroke-width="1.1"/><path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" fill="none" stroke="#c9ced8" stroke-width="1.4"/></svg>`;
/** Beside a checkpoint's floor: its area mastered (a golden swirl, shown once Warp is owned) and cleared (a green check). */
const SWIRL_MARK = `<svg class="goal-mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#3a2a08" stroke="#ffd34d" stroke-width="1.6"/><path d="M12 5.5c3.6 0 6 2.7 5.4 5.9-.6 3-3.8 4.5-6.3 3.3-2.1-1-2.1-3.9-.1-4.6 1.4-.5 2.7.5 2.3 1.7" fill="none" stroke="#fff1b0" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const CLEARED_MARK = `<svg class="goal-mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#1f6a34" stroke="#8ff0a8" stroke-width="1.6"/><path d="M7 12.5l3.4 3.4L17.2 8.4" fill="none" stroke="#f0fff4" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CHECK_ICON = `<svg class="goal-badge" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#1f5a34" stroke="#9fe0b0" stroke-width="1.1"/><path d="M4.6 8.3l2.3 2.3 4.6-5" fill="none" stroke="#e8fff0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

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
    const cleared = areaCleared(save, tower, floor) ? ` Floors ${from}–${floor} cleared of enemies: +${clearedInspiration(floor)} Inspiration paid.` : "";
    if (!areaMastered(save, tower, floor)) return `Master floors ${from}–${floor}, climbing them without taking damage, to warp here.${cleared}`;
    const below = unmasteredBelow(save, tower, floor);
    if (below !== null && warpUnlocked(save)) return `Floors ${from}–${floor} mastered. Master floors ${below - 9}–${below} too: a warp point opens once every one below it is mastered.${cleared}`;
    return `Floors ${from}–${floor} mastered. Claim Unlock Warp at Tower ${tierNumeral(unlockAt("warp").tower)}'s floor ${unlockFloor("warp")} to start runs here.${cleared}`;
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
      const shown = offerShown(offer(pass.id)!);
      if (shown) revealReward(shown, game.save.settings.reduceMotion);
    } finally {
      this.busy = false;
    }
  }
}

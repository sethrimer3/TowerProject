import type { EnemyStrength, KeyColor } from "./entities.ts";
import type { GoalUnlock } from "./goals.ts";
import type { ResearchTarget } from "./archives.ts";
import { halfPow, intPow, snap } from "./exact.ts";
export const UNGUARDED_LOOT_CHANCE = 1 / 1000;
export const WIDTH = 30;
export const CHUNK = 20;
export const START_X = 15;
export const VIEWPORT_TILES = 17;
export const TOWER_WIDTH = 17;
export const TOWER_HEIGHT = 17;
export const TOWER_START_X = 8;
/** Tower floors come in isolated sections of this many rooms. */
export const TOWER_SECTION = 10;
export const SAVE_KEY = "towerdelve.v1";
/** Where saves were kept before the game was named Tower Delve; `load` reads it when nothing is under `SAVE_KEY`. */
export const OLD_SAVE_KEY = "towerincramental.v1";
export const COLORS: Record<KeyColor, string> = { yellow: "#eac16b", blue: "#6dbdf1", red: "#df797e" };
export type Currency = "courage" | "inspiration";
/** Upgrades that make the character stronger say so in `grants` (what one
 * rank adds; see loadout.ts), which also writes their description. */
/** Focus uses a run starts with, once the Focus skill is owned. */
export const FOCUS_PER_RUN = 1;
/** Ignore and Target uses a run starts with, once each skill is owned. */
export const IGNORE_PER_RUN = 1;
export const TARGET_PER_RUN = 1;
/** New floors a run climbs to regain one Focus, Ignore or Target use
 * (Refocus, Ignore More, Target More), before research shortens it. */
export const REGAIN_FLOORS = 100;
export const UPGRADES = [
  { id: "delve", name: "Into the depths", description: "Unlock Delve and the Courage skill tree", base: 3, max: 1, currency: "inspiration" },
  { id: "legacy", name: "An enduring legacy", description: "Unlock the Legacy skill tree and unlock Defend", base: 8, max: 1, currency: "courage" },
  {
    id: "revive",
    name: "Revive",
    description: "When a strike would fell you, a 0.5% chance to rise at full HP and fight on: opens Revive training",
    base: 10,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "undos",
    name: "Echoes of time",
    description: "Open Undo Count research in the Archives, or 4 more levels of it once Rehearsed steps has opened it",
    base: 5,
    max: 1,
    currency: "courage",
  },
  { id: "findYellowKey", name: "Find Gold Key", description: "Open Find Gold Key research in the Archives: each new floor climbed may hand you a gold key", base: 10, max: 1, currency: "courage" },
  { id: "keyEfficiency", name: "Key Efficiency", description: "Open Key Efficiency research in the Archives: each level makes a door take less of a key", base: 10, max: 1, currency: "courage" },
  { id: "interest", name: "Interest", description: "Open Interest % research in the Archives: each new floor climbed adds a share of the Silver you hold, up to a limit", base: 10, max: 1, currency: "courage" },
  { id: "maxInterest", name: "Max Interest", description: "Open Max Interest research in the Archives: each level raises the most Interest a floor pays", base: 10, max: 1, currency: "courage" },
  { id: "mug", name: "Mug", description: "Open Mug research in the Archives: each level adds Gold to a kill your first strike makes", base: 10, max: 1, currency: "courage" },
  { id: "overheal", name: "Overheal", description: "Potions can heal you above max HP, up to your Overheal: opens Overheal training", base: 20, max: 1, currency: "courage" },
  { id: "refocus", name: "Refocus", description: `Inside a run, regain 1 Focus every ${REGAIN_FLOORS} new floors climbed; opens Refocus research, which shortens it`, base: 20, max: 1, currency: "courage" },
  { id: "ignore", name: "Ignore", description: `Inside a run, press Ignore, then a tile: the hero won't step on it for the rest of the floor (${IGNORE_PER_RUN} use a run); opens Ignore Count research`, base: 20, max: 1, currency: "courage" },
  { id: "ignoreMore", name: "Ignore More", description: `Inside a run, regain 1 Ignore use every ${REGAIN_FLOORS} new floors climbed; opens Ignore More research, which shortens it`, base: 20, max: 1, currency: "courage" },
  { id: "target", name: "Target", description: `Inside a run, press Target, then a tile: the hero walks there (${TARGET_PER_RUN} use a run); opens Target Count research`, base: 20, max: 1, currency: "courage" },
  { id: "targetMore", name: "Target More", description: `Inside a run, regain 1 Target use every ${REGAIN_FLOORS} new floors climbed; opens Target More research, which shortens it`, base: 20, max: 1, currency: "courage" },
  {
    id: "dash",
    name: "Dash",
    description: "Unlock Dash research in the Archives: the hand's first step toward a new target dashes across empty tiles",
    base: 1,
    max: 1,
    currency: "courage",
  },
  { id: "endRush", name: "End Rush", description: "Open End Rush research in the Archives: STAIRS's dash toward the stairs crosses more empty tiles", base: 1, max: 1, currency: "courage" },
  { id: "dashRegen", name: "Dash Regen", description: "Open Dash Regen research in the Archives: a Dash's first steps regain HP by Regen", base: 1, max: 1, currency: "courage" },
  { id: "dashBadge", name: "Dash Badge", description: "Add the Dash badge to the badge draw: its card's dash toward its target crosses more empty tiles", base: 1, max: 1, currency: "courage" },
  {
    id: "yellow",
    name: "Gilded passage",
    grants: { yellow: 1 },
    base: 3,
    max: 10,
    currency: "courage",
  },
  {
    id: "blue",
    name: "Blue passage",
    grants: { blue: 1 },
    base: 5,
    max: 10,
    currency: "courage",
  },
  {
    id: "red",
    name: "Red passage",
    grants: { red: 1 },
    base: 7,
    max: 10,
    currency: "courage",
  },
  {
    id: "quality",
    name: "Heirloom steel",
    grants: { attack: 2, defense: 1 },
    words: { attack: "weapon attack", defense: "armor defense" },
    base: 6,
    max: 20,
    currency: "courage",
  },
  {
    id: "moveSpeed",
    name: "Movement Speed",
    description: "Open the Archives' Movement Speed research: each level lets the run's speed arrows go one step a second faster than 3",
    base: 1,
    max: 1,
    currency: "courage",
  },
  {
    id: "instantCombat",
    name: "Instant Combat",
    description: "Unlock the Animate fights setting: turn it off to settle each fight at once, in one step",
    base: 1,
    max: 1,
    currency: "courage",
  },
  {
    id: "pathfinder",
    name: "Pathfinder",
    description: "Tapping a tile shows the way there on the board and what happens along it",
    base: 1,
    max: 1,
    currency: "courage",
  },
  {
    id: "aiMemory", name: "Route memory", description: "Delve: remember explored routes, then recognize dead ends", base: 3, max: 2, currency: "courage",
  },
  {
    id: "aiEvaluation", name: "Resource judgment", description: "Delve: learn combat cost, key cost, contextual rewards, then scarcity", base: 4, max: 4, currency: "courage",
  },
  {
    id: "aiLookahead", name: "Labyrinth scouting", description: "Delve: +4 scouting radius and +2 interactions of route lookahead", base: 5, max: 4, currency: "courage",
  },
  {
    id: "extraKey",
    name: "Extra Key",
    description: "Open the Gold Key provision on the Gear page: a gold key every 100 floors of a run",
    base: 1,
    max: 1,
    currency: "courage",
  },
  {
    id: "combatStance",
    name: "Combat Stance",
    description: "Open the Deck, where you reorder the cards in your hand before a run",
    base: 1,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "buildout",
    name: "Buildout",
    description: "Unlock the Deck: add its cards to your hand, or set them aside, to choose what a run heads for",
    base: 1,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "largerHand",
    name: "Larger Hand",
    description: "Your hand holds one more card, and more hand slots can be bought with Gems on the Deck page",
    base: 1,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "critical",
    name: "Critical",
    description: "Your strikes can land critical hits: unlock Crit % and Crit x training and their research",
    base: 2,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "critPrediction",
    name: "Critical Prediction",
    description: "Damage predictions count your critical hits: the damage to expect, your chance to survive and the range it usually lands in",
    base: 2,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "cardHeal",
    name: "Heal",
    description: "Add the HEAL card to your deck: it moves you toward the closest healing potion",
    card: "heal",
    base: 3,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "greaterHeal",
    name: "Greater Heal",
    description: "Unlock Potion HP research in the Archives: every potion restores more HP",
    base: 3,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "recovery",
    name: "Recovery",
    description: "Percent potions appear on the floors (2% of potions, more with Find Potion): each restores 35 HP and a share of your max HP, raised by Potion % training",
    base: 10,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "findPotion",
    name: "Find Potion",
    description: "More of the potions you find are percent potions: opens Find Potion training",
    base: 10,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "shroud",
    name: "Shroud",
    description: "A shroud blocks the first damage of every fight, and opens Shroud training",
    grants: { shroud: 1 },
    base: 2,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "cardYellowKey",
    name: "Gold Key",
    description: "Add the GOLD KEY card to your deck: it moves you toward the closest gold key, and while you hold it each gold key is worth 5% more and pays 1 more Gold",
    card: "yellowKey",
    base: 3,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "cardAtkUp",
    name: "ATK Up",
    description: "Add the ATK UP card to your deck: it moves you toward the closest ATK pickup",
    card: "atkUp",
    base: 5,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "cardDefUp",
    name: "DEF Up",
    description: "Add the DEF UP card to your deck: it moves you toward the closest DEF pickup",
    card: "defUp",
    base: 5,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "trainers",
    name: "Trainers",
    description: "Hire a trainer on the Training tab: pay Gold to train a stat over time, on its own schedule beside training points",
    base: 1,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "cardBlueKey",
    name: "Blue Key",
    description: "Add the BLUE KEY card to your deck: it moves you toward the closest blue key, and while you hold it each blue key is worth 5% more and pays 2 more Gold",
    card: "blueKey",
    base: 2,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "gear",
    name: "Gear",
    description: "Open the Gear page: provisions bought with Gold, used during every run",
    base: 1,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "onTheJob",
    name: "On the Job",
    description: "Inside a run, train with the Silver you find: the Training buttons under your hand buy ranks that last the run",
    base: 1,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "regen",
    name: "Regen",
    description: "Open Regen training: regain HP with every step you take in a run",
    base: 1,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "focus",
    name: "Focus",
    description: `Inside a run, press a card in your hand to put it ahead of the others until it reaches its target (${FOCUS_PER_RUN} use a run)`,
    base: 5,
    max: 1,
    currency: "courage",
  },
  {
    id: "cardBadges",
    name: "Badges",
    description: "Open the Badges box on the Deck page: tokens bought with Gems that change what a card does when it activates",
    base: 2,
    max: 1,
    currency: "courage",
  },
  {
    id: "archives",
    name: "Archives",
    description: "Unlock the Archives on the Upgrades page: research that lasts, paid in Gold and real time",
    base: 5,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "fasterTrainers",
    name: "Faster Trainers",
    description: "Open Faster Trainers research in the Archives: trainers train ranks faster",
    base: 2,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "lifesteal",
    name: "Lifesteal",
    description: "Open Lifesteal training: each of your strikes restores a share of the damage it deals as HP",
    base: 10,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "keySiphon",
    name: "GK Siphon",
    description: "Add the GK SIPHON card to your deck: it trades Max HP training levels, for the rest of the run, for a gold key, each use costing one level more than the last",
    card: "keySiphon",
    base: 5,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "regenResearch",
    name: "Regen Research",
    description: "Open Regen research in the Archives: every step regains more HP",
    base: 10,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "buyQuantity",
    name: "Buy Quantity",
    description: "Choose how many Training ranks one press buys, with training points or with Silver in a run (x1 at first): Buy Quantity research in the Archives opens x5, x10, x25, x100 and Max, and a trainer that trains 5 or more ranks at once works faster (×2 at 5, ×3 at 10, ×5 at 25, ×10 at 100)",
    base: 5,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "pocketMoney",
    name: "Pocket Money",
    description: "Open Pocket Money research in the Archives: every run goes inside with Silver in hand",
    base: 1,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "spareChange",
    name: "Spare Change",
    description: "Every floor climbed for the first time in a run pays Gold: opens Gold / Floor training, and Gold / Floor research in the Archives",
    base: 3,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "wealthy",
    name: "Wealthy",
    description: "All Silver found in a run is multiplied: opens Silver Bonus training, and Silver Bonus research in the Archives",
    base: 2,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "loot",
    name: "Loot",
    description: "Kills, chests, items picked up and doors opened pay more Gold: opens Gold Bonus training, and Gold Bonus research in the Archives",
    base: 2,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "wishingWell",
    name: "Wishing Well",
    description: "Every floor climbed for the first time in a run pays Silver: opens Silver / Floor training, and Silver / Floor research in the Archives",
    base: 2,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "freeTraining",
    name: "Free Training",
    description: "Opens Free Offense, Defense and Utility Up training: each floor passed in a run may train a stat for free",
    base: 20,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "thorns",
    name: "Thorns",
    description: "Opens Thorn Damage training: each enemy strike costs the enemy a share of its max HP, half against bosses",
    base: 10,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "parry",
    name: "Parry",
    description: "Opens Parry % training: every enemy strike is parried, doing less damage",
    base: 10,
    max: 1,
    currency: "inspiration",
  },
  // The cards below Buy Quantity: the doors, the enemies by strength, then
  // chests, Heart Door Resilience, the key trades, Floor Skip Reward, torches
  // and Steel Doors.
  { id: "cardYellowDoor", name: "Gold Door", description: "Add the GOLD DOOR card to your deck: it moves you toward the closest gold door, while you hold a gold key", card: "yellowDoor", base: 5, max: 1, currency: "inspiration" },
  { id: "keyLessBadges", name: "Key < Badges", description: "Add the GK <, BK < and RK < badges to the badge draw: each lets its card act only while you hold fewer keys of its colour than it says", base: 50, max: 1, currency: "inspiration" },
  { id: "keyAtLeastBadges", name: "Key ≥ Badges", description: "Add the GK ≥, BK ≥ and RK ≥ badges to the badge draw: each lets its card act only while you hold at least as many keys of its colour as it says", base: 50, max: 1, currency: "inspiration" },
  { id: "cardHeartDoor", name: "Heart Door", description: "Add the HEART DOOR card to your deck: it moves you toward the closest Heart Door", card: "heartDoor", base: 10, max: 1, currency: "inspiration" },
  { id: "cardWeakEnemy", name: "Weak Enemy", description: "Add the WEAK ENEMY card to your deck: it moves you toward the closest weak enemy", card: "weakEnemy", base: 20, max: 1, currency: "inspiration" },
  { id: "cardBaseEnemy", name: "Base Enemy", description: "Add the BASE ENEMY card to your deck: it moves you toward the closest enemy that is neither weak, strong, elite nor a boss", card: "baseEnemy", base: 20, max: 1, currency: "inspiration" },
  { id: "cardStrongEnemy", name: "Strong Enemy", description: "Add the STRONG ENEMY card to your deck: it moves you toward the closest strong enemy", card: "strongEnemy", base: 20, max: 1, currency: "inspiration" },
  { id: "cardEliteEnemy", name: "Elite Enemy", description: "Add the ELITE ENEMY card to your deck: it moves you toward the closest elite enemy", card: "eliteEnemy", base: 20, max: 1, currency: "inspiration" },
  { id: "cardBossEnemy", name: "Boss Enemy", description: "Add the BOSS ENEMY card to your deck: it moves you toward the closest boss or Greater Boss", card: "bossEnemy", base: 20, max: 1, currency: "inspiration" },
  { id: "cardNonBossEnemy", name: "Non-Boss Enemy", description: "Add the NON-BOSS ENEMY card to your deck: it moves you toward the closest enemy that is not a boss or Greater Boss", card: "nonBossEnemy", base: 40, max: 1, currency: "inspiration" },
  { id: "cardFastEnemy", name: "Fast Enemy", description: "Add the FAST ENEMY card to your deck: it moves you toward the closest Fast enemy", card: "fastEnemy", base: 20, max: 1, currency: "inspiration" },
  { id: "cardChest", name: "Chest", description: "Add the CHEST card to your deck: it moves you toward the closest closed chest, treasure or area reward, and while you hold it each treasure chest has a 1.5% chance to be a Supply Chest and a 0.5% chance to be an Equipment Chest", card: "chest", base: 20, max: 1, currency: "inspiration" },
  { id: "heartDoorResilience", name: "Heart Door Resilience", description: "Open Heart Door Resilience research in the Archives: each level makes a Heart Door drain less HP", base: 20, max: 1, currency: "inspiration" },
  { id: "blueSiphon", name: "BK Siphon", description: "Add the BK SIPHON card to your deck: it trades DEF training levels, for the rest of the run, for a blue key, each use costing one level more than the last", card: "blueSiphon", base: 20, max: 1, currency: "inspiration" },
  { id: "blueTrader", name: "BK Trader", description: "Add the BK TRADER card to your deck: it trades 3 gold keys for a blue key, without moving", card: "blueTrader", base: 20, max: 1, currency: "inspiration" },
  { id: "keyToHp", name: "GK to HP", description: "Add the GK TO HP card to your deck: it trades a gold key for 10% of your max HP, without moving, while you are missing at least that much", card: "keyToHp", base: 20, max: 1, currency: "inspiration" },
  { id: "cardRedKey", name: "Red Key", description: "Add the RED KEY card to your deck: it moves you toward the closest red key, and while you hold it each red key is worth 5% more and pays 3 more Gold", card: "redKey", base: 20, max: 1, currency: "inspiration" },
  { id: "redSiphon", name: "RK Siphon", description: "Add the RK SIPHON card to your deck: it trades ATK training levels, for the rest of the run, for a red key, each use costing one level more than the last", card: "redSiphon", base: 20, max: 1, currency: "inspiration" },
  { id: "floorSkipReward", name: "Floor Skip Reward", description: "Open Floor Skip Reward research in the Archives: each level pays a share of the Gold a skipped floor's chests and battles held", base: 20, max: 1, currency: "inspiration" },
  { id: "cardTorch", name: "Torch", description: "Add the TORCH card to your deck: it moves you toward the closest lit torch, putting it out", card: "torch", base: 20, max: 1, currency: "inspiration" },
  // Limit Break 1 to 10, a chain under Torch: each raises the most levels of
  // the Training rows with `breaks` (LIMIT_BREAK_RANKS, trainingCap).
  { id: "limitBreak1", name: "Limit Break 1", description: "Raise the most training levels of ATK, DEF, Max HP, Regen and Shroud by 500", base: 50, max: 1, currency: "inspiration" },
  { id: "limitBreak2", name: "Limit Break 2", description: "Raise the most training levels of ATK, DEF, Max HP, Regen and Shroud by 500", base: 50, max: 1, currency: "inspiration" },
  { id: "limitBreak3", name: "Limit Break 3", description: "Raise the most training levels of ATK, DEF, Max HP, Regen and Shroud by 500", base: 50, max: 1, currency: "inspiration" },
  { id: "limitBreak4", name: "Limit Break 4", description: "Raise the most training levels of ATK, DEF, Max HP, Regen and Shroud by 500", base: 50, max: 1, currency: "inspiration" },
  { id: "limitBreak5", name: "Limit Break 5", description: "Raise the most training levels of ATK, DEF, Max HP, Regen and Shroud by 500", base: 50, max: 1, currency: "inspiration" },
  { id: "limitBreak6", name: "Limit Break 6", description: "Raise the most training levels of ATK, DEF, Max HP, Regen and Shroud by 500", base: 50, max: 1, currency: "inspiration" },
  { id: "limitBreak7", name: "Limit Break 7", description: "Raise the most training levels of ATK, DEF, Max HP, Regen and Shroud by 500", base: 50, max: 1, currency: "inspiration" },
  { id: "limitBreak8", name: "Limit Break 8", description: "Raise the most training levels of ATK, DEF, Max HP, Regen and Shroud by 500", base: 50, max: 1, currency: "inspiration" },
  { id: "limitBreak9", name: "Limit Break 9", description: "Raise the most training levels of ATK, DEF, Max HP and Regen by 500", base: 50, max: 1, currency: "inspiration" },
  { id: "limitBreak10", name: "Limit Break 10", description: "Raise the most training levels of ATK, DEF, Max HP and Regen by 500", base: 50, max: 1, currency: "inspiration" },
  { id: "cardWoodenDoor", name: "Wooden Door", description: "Add the WOODEN DOOR card to your deck: it moves you toward the closest Wooden Door you hold a key for, or can break down and survive", card: "woodenDoor", base: 20, max: 1, currency: "inspiration" },
  {
    id: "inspirationUndos",
    name: "Rehearsed steps",
    description: "Rewind one action a run, and open Undo Count research in the Archives, or 4 more levels of it once Echoes of time has opened it",
    grants: { undos: 1 },
    base: 5,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "wisdomFocus",
    name: "Quiet focus",
    description: "A placeholder Wisdom upgrade",
    base: 5,
    max: 5,
    currency: "inspiration",
  },
  {
    id: "wisdomMemory",
    name: "Long memory",
    description: "A placeholder Wisdom upgrade",
    base: 7,
    max: 5,
    currency: "inspiration",
  },
  {
    id: "wisdomSight",
    name: "Far sight",
    description: "A placeholder Wisdom upgrade",
    base: 9,
    max: 5,
    currency: "inspiration",
  },
  {
    id: "renownBanner",
    name: "Raised banner",
    description: "A placeholder Renown upgrade",
    base: 6,
    max: 5,
    currency: "courage",
  },
  {
    id: "renownOath",
    name: "Hero's oath",
    description: "A placeholder Renown upgrade",
    base: 8,
    max: 5,
    currency: "courage",
  },
  {
    id: "renownCrown",
    name: "Laurel crown",
    description: "A placeholder Renown upgrade",
    base: 10,
    max: 5,
    currency: "courage",
  },
] as const;
export type UpgradeId = (typeof UPGRADES)[number]["id"];
export const cost = (id: UpgradeId, level: number) =>
  Math.ceil(UPGRADES.find((u) => u.id === id)!.base * intPow(1.65, level));
/** Gold a beaten enemy pays, by its strength, in both modes: every victory
 * pays some, beside its Silver. A Greater Boss pays twice a boss's Gold,
 * Silver and XP. */
export const ENEMY_GOLD: Record<EnemyStrength, number> = { weak: 1, normal: 1, strong: 2, elite: 4, boss: 5, greaterBoss: 10 };
/** The Gold a Fast enemy pays more than its strength's (fast-enemies.ts). */
export const FAST_GOLD = 1;
/** The Gold a Ranged enemy pays more than its strength's (ranged.ts). */
export const RANGED_GOLD = 1;
/** The Gold a Shielded enemy pays more than its strength's (shielded.ts). */
export const SHIELDED_GOLD = 1;
/** Gold every item a run takes off the floor pays, before Gold Bonus and
 * the tier's bonus: a potion, a shard, a torch put out, a treasure chest
 * opened (not an area reward chest), a door without a colour (Heart,
 * Wooden, Steel) opened. */
export const PICKUP_GOLD = 1;
/** Gold a key of each colour pays when picked up, and a keyed door opened
 * the sum of its colours' (a Triune Door 6). */
export const KEY_GOLD: Record<KeyColor, number> = { yellow: 1, blue: 2, red: 3 };
/** Silver, the currency spent inside a run, that a beaten enemy pays per
 * base amount, by its strength. */
export const SILVER_MULTIPLIER: Record<EnemyStrength, number> = { weak: 1, normal: 2, strong: 3, elite: 4, boss: 5, greaterBoss: 10 };
/** The floor index (0 is the first) from which a kill's Silver rises half
 * as fast: floor 201. */
export const SILVER_SLOWDOWN_FLOOR = 200;
/** Silver a beaten weak enemy pays on equivalent floor `floor` (0 is the
 * first), rising smoothly with fractions kept: 2 on floor 1, 0.2 more a
 * floor (4 on floor 11, 42 on floor 201), then 0.1 more a floor. */
export const silverBase = (floor: number) => {
  const f = Math.max(0, floor), slow = SILVER_SLOWDOWN_FLOOR;
  return 2 * (f <= slow ? 1 + f / TOWER_SECTION : 1 + slow / TOWER_SECTION + (f - slow) / (2 * TOWER_SECTION));
};
/** Silver a beaten enemy pays on equivalent floor `floor`: the base,
 * times its strength's multiplier. */
export const silverForKill = (strength: EnemyStrength, floor: number) =>
  snap(silverBase(floor) * SILVER_MULTIPLIER[strength]);
/** Gold the Delve pays at a run's end: one for each treasure opened. */
export const goldReward = (treasures: number) => treasures;
/** XP a beaten enemy pays per base amount, by its strength (the same
 * proportions as the forks' `GATE_VALUE`). */
export const XP_MULTIPLIER: Record<EnemyStrength, number> = { weak: 2, normal: 3, strong: 5, elite: 8, boss: 12, greaterBoss: 24 };
/** The base XP a kill pays on equivalent floor `floor` (0 is the first): 3,
 * rising with the square root of the floor (×2 by floor 30, ×3.3 by 100,
 * ×10 by 1000). The XP a level needs rises faster, so each floor is worth a
 * smaller share of a level than the one before. */
export const xpBase = (floor: number) => 3 * Math.sqrt(1 + Math.max(0, floor) / TOWER_SECTION);
/** XP a beaten enemy pays on equivalent floor `floor`, in both modes. */
export const xpForKill = (strength: EnemyStrength, floor: number) =>
  Math.round(xpBase(floor) * XP_MULTIPLIER[strength]);
/** The lifetime XP that reaches `level` on the base curve: 20 × level ×
 * (level + 1) × (1 + level / 5), written in whole numbers. It grows with the
 * cube of the level, faster than kills pay more on higher floors, so levels
 * come more slowly the higher the hero climbs, even replaying the floors
 * below. */
const baseXpForLevel = (level: number) => 4 * level * (level + 1) * (level + 5);
/** Levels in each band of the XP curve: a band's levels cost more than the
 * one's below it. */
const XP_BAND = 25;
/** The lifetime XP that reaches `level`: the base curve, each band of
 * `XP_BAND` levels past the first costing more than the band below, 25%
 * more for the second, 50% more again for the third, 75% for the fourth,
 * 100% for the fifth, and 25% more each band after (×1.25, ×1.875, ×3.28,
 * ×6.56, then ×8.2 the base cost past 125, ×10.25 past 150, …), rounded to
 * a whole number. */
export const xpForLevel = (level: number) => {
  let xp = 0, factor = 1;
  for (let band = 0, from = 0; from < level; band++) {
    if (band) factor *= band <= 4 ? 1 + band / 4 : 1.25;
    const to = Math.min(level, from + XP_BAND);
    xp += factor * (baseXpForLevel(to) - baseXpForLevel(from));
    from = to;
  }
  return Math.round(xp);
};
/** The level `xp` lifetime XP reaches, found among the exact whole-number
 * costs (a cube root could differ between engines). */
export function levelForXp(xp: number) {
  let low = 0, high = 1;
  while (xpForLevel(high) <= xp) high *= 2;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (xpForLevel(mid) <= xp) low = mid;
    else high = mid;
  }
  return low;
}
/** Training points each level earns, to spend on the hero's stats. */
export const TRAINING_PER_LEVEL = 3;
/** The groups the Training tab, and a run's training bar, show the rows
 * in, in order. */
export const TRAINING_GROUPS = { offense: "Offense", defense: "Defense", utility: "Utility" } as const;
export type TrainingId = (typeof TRAINING)[number]["id"];
export type TrainingRow = (typeof TRAINING)[number];
/** The Limit Break skills, in the order the chain buys them. */
export const LIMIT_BREAKS = ["limitBreak1", "limitBreak2", "limitBreak3", "limitBreak4", "limitBreak5", "limitBreak6", "limitBreak7", "limitBreak8", "limitBreak9", "limitBreak10"] as const satisfies readonly UpgradeId[];
/** Training levels each Limit Break adds to the cap of a row it raises. */
export const LIMIT_BREAK_RANKS = 500;
/** The Limit Breaks that raise `row`'s cap: its first `breaks` of them. */
const breaksOf = (row: TrainingRow) => ("breaks" in row ? row.breaks : 0);
/** The most levels `row` trains to with `upgrades` owned: its `max`, and
 * `LIMIT_BREAK_RANKS` more for each Limit Break owned that raises it. */
export const trainingCap = (row: TrainingRow, upgrades: Partial<Record<UpgradeId, number>>) =>
  row.max + LIMIT_BREAK_RANKS * LIMIT_BREAKS.slice(0, breaksOf(row)).filter((id) => upgrades[id]).length;
/** The most levels `row` trains to with every Limit Break owned, which a
 * saved rank may hold. */
export const trainingCeiling = (row: TrainingRow) => row.max + LIMIT_BREAK_RANKS * breaksOf(row);
/** A row that raises one of the character's stats. */
export type StatTrainingRow = Extract<TrainingRow, { stat: string }>;
export const isStatRow = (row: TrainingRow): row is StatTrainingRow => "stat" in row;
/** A price that rises with each purchase (a Training row's Silver inside a
 * run, a provision's Gold): the first costs `base`, and each one after
 * costs more than the last by `step` plus the number already bought, the
 * `step` growing by `growth` every five (see `schedulePrice`). Base 5: +1+N
 * for the next five, then +4+N, +7+N … With `compound`, that price is
 * then multiplied by `compound` for each one already bought, rounded up.
 * Or, with `ratio`, each costs `ratio` times the one before (with `rise`,
 * that ratio itself `rise` times the last one's: `risingPrice`); or, with
 * `power`, the n-th costs `base` × n × (1 + ((n − 1) / `growth`)^`power`); or,
 * with `cubic`, it costs what a trainer's Gold curve of that shape asks
 * (`curvePrice`); or, with `prices`, each costs the next in that list. The
 * `power` may be a whole number or a half (`halfPow`). */
export type PriceSchedule = { base: number; step: number; growth: number; compound?: number } | { base: number; ratio: number; rise?: number } | { base: number; growth: number; power: number } | { base: number; growth: number; cubic: number } | { prices: readonly number[] };
/** The purchase after `bought` when the first costs `base` and each costs
 * `ratio` times the one before, that ratio `rise` times the last one's,
 * rounded up: base × ratio^bought × rise^(bought × (bought − 1) / 2),
 * multiplied out in order so every engine agrees. */
export function risingPrice(base: number, ratio: number, rise: number, bought: number) {
  let price = base, step = ratio;
  for (let k = 0; k < bought; k++) {
    price *= step;
    step *= rise;
  }
  return Math.ceil(price);
}
/** The n-th rank (after `ranks`) on a linear-and-cubic curve from `start`:
 * start × n × (1 + ranks / `growth`), rounded up, plus start × n × (ranks /
 * `cubic`)³, rounded down. A trainer's Gold (`trainingGold`) and a
 * `cubic` Silver schedule both price by it. */
export function curvePrice(start: number, ranks: number, growth: number, cubic?: number) {
  const base = start * (ranks + 1);
  return Math.ceil((base * (growth + ranks)) / growth) + (cubic ? Math.floor(base * intPow(ranks / cubic, 3)) : 0);
}
/** What the purchase after `bought` costs on `schedule`: its base, and for
 * the k-th after it `step + k` more than the one before, `step` rising by
 * `growth` every five, summed here at once, then compounded (or `ratio`
 * times the one before). */
export function schedulePrice(schedule: PriceSchedule, bought: number) {
  if ("prices" in schedule) return schedule.prices[Math.min(bought, schedule.prices.length - 1)]!;
  if ("ratio" in schedule) return schedule.rise ? risingPrice(schedule.base, schedule.ratio, schedule.rise, bought) : schedule.base * intPow(schedule.ratio, bought);
  // The n-th rank (bought + 1) costs base × n × (1 + ((n − 1) / growth)^power), as a trainer's Gold does.
  if ("power" in schedule) return Math.ceil(schedule.base * (bought + 1) * (1 + halfPow(bought / schedule.growth, schedule.power)));
  if ("cubic" in schedule) return curvePrice(schedule.base, bought, schedule.growth, schedule.cubic);
  const { base, step, growth, compound } = schedule;
  const fives = Math.floor(bought / 5), rest = bought % 5;
  const price = base + bought * step + bought * (bought + 1) / 2 + growth * (5 * fives * (fives - 1) / 2 + rest * fives);
  return compound ? Math.ceil(price * intPow(compound, bought)) : price;
}
/** Rows open from the start. */
const cheap: PriceSchedule = { base: 5, step: 1, growth: 3 };
/** Max HP and Shroud: the cheapest, rising a little more slowly. */
const vital: PriceSchedule = { base: 3, step: 1, growth: 2 };
/** Rows a skill opens: steeper, so ranks from Inspiration's Training points
 * stay worth more than Silver's. */
const opened: PriceSchedule = { base: 10, step: 2, growth: 3 };
/** Rows a deeper skill opens. */
const deep: PriceSchedule = { base: 20, step: 4, growth: 4 };
/** The Free Upgrade rows: 75 for the first rank, then 75 × n × (1 + (n − 1) /
 * 11 + ((n − 1) / 49)³) for the n-th (1,582 for the 11th, 9,771 for the
 * 32nd, 92,815 for the 87th, 136,855 for the 100th), the same in Silver
 * and a trainer's Gold. */
const freeUpgrades = { base: 75, growth: 11, cubic: 49 };
/** Thorn Damage: 60 for the first rank, then 60 × n × (1 + ((n − 1) / 23)²)
 * for the n-th (993 for the 13th, 9,901 for the 41st, 113,781 for the
 * 99th), the same in Silver and a trainer's Gold. */
const thornPrices = { base: 60, growth: 23, power: 2 };
/** Parry %: 40 for the first rank, then 40 × n × (1 + ((n −
 * 1) / 23)²) for the n-th (590 for the 12th, 4,775 for the 36th, 40,953
 * for the 80th), the same in Silver and a trainer's Gold. */
const parryPrices = { base: 40, growth: 23, power: 2 };
/** Revive: 100 for the first rank, then 100 × n × (1 + ((n − 1) / 6.4)³) for
 * the n-th (1,277 for the 7th, 9,870 for the 13th, 95,724 for the 23rd,
 * 1,005,077 for the 41st, 35,554,490 for the 99th), the same in Silver and a trainer's Gold. */
const revivePrices = { base: 100, growth: 6.4, power: 3 };
/** Attack Range: 50 for the first rank, then 50 × n × (1 + (n − 1) / 12 +
 * ((n − 1) / 37)³) for the n-th (1,165 for the 12th, 8,573 for the 36th,
 * 64,075 for the 78th), the same in Silver and a trainer's Gold. */
const rangePrices = { base: 50, growth: 12, cubic: 37 };
/** Attack Speed: 30 for the first rank, then 30 × n × (1 + (n − 1) / 5 +
 * ((n − 1) / 32)³) for the n-th (1,166 for the 12th, 8,870 for the 34th,
 * 116,464 for the 92nd), the same in Silver and a trainer's Gold. */
const speedPrices = { base: 30, growth: 5, cubic: 32 };
/** ATK / m: 50 for the first rank, each 6.47% dearer than the one
 * before, that rise itself growing 0.022% a rank (589 for the 38th, 60,929
 * for the 98th, 1 million for the 130th, 998 million for the 200th; about
 * 10 billion in all), the same in Silver and a trainer's Gold. */
const perTilePrices = { base: 50, ratio: 1.0647, rise: 1.00022 };
/** Multishot Chance: 60 for the first rank, then 60 × n × (1 + ((n − 1) /
 * 12)^1.5) for the n-th (1,163 for the 11th, 9,893 for the 32nd, 99,554
 * for the 85th, 144,569 for the 99th), the same in Silver and a trainer's
 * Gold. */
const multishotChancePrices = { base: 60, growth: 12, power: 1.5 };
/** Multishot Targets: its seven ranks priced one by one, the same in
 * Silver and a trainer's Gold. */
const multishotTargetsPrices = { prices: [450, 2_000, 5_000, 12_500, 40_000, 120_000, 350_000] } as const;
/** Rapid Fire Chance and Duration: the n-th rank costs 120 + 42m + 7.85m² +
 * 0.085m³, m = n − 1, rounded up (1,002 for the 9th, 10,013 for the 30th,
 * 100,199 for the 82nd, 109,418 for Chance's 85th, 159,629 for Duration's
 * 99th), in whole numbers so every engine agrees, the same in Silver and a
 * trainer's Gold. */
const rapidFirePrices = (ranks: number) => ({
  prices: Array.from({ length: ranks }, (_, m) => Math.ceil((24_000 + 8_400 * m + 1_570 * m * m + 17 * m * m * m) / 200)),
});
const rapidFireChancePrices = rapidFirePrices(85), rapidFireDurationPrices = rapidFirePrices(99);
/** Overheal: the n-th rank costs 1,000 + (n⁴ − 1) × (800 + n) / 400, rounded
 * up (21,262 for the 10th, 5.4 million for the 40th, 1.2 billion for the
 * 150th, 10.3 billion for the 250th, 128 billion for the 450th, 203 billion
 * for the 500th), in whole numbers so every engine agrees, the same in
 * Silver and a trainer's Gold. */
const overhealPrices = {
  prices: Array.from({ length: 500 }, (_, m) => {
    const n = m + 1;
    return 1_000 + Math.ceil(((n * n * n * n - 1) * (800 + n)) / 400);
  }),
};
/** A trainer's Gold curve: each rank asks `TRAINING_GOLD_PER_POINT` Gold
 * a point of the row's cost times the rank's number, times 1 + ranks /
 * `growth` (see `trainingGold`), so a smaller `growth` pulls away faster. A
 * `cubic` scale adds (ranks / cubic)³ to that multiplier: a gentle start and
 * a steep last stretch. A curve with a `ratio` instead asks `start` for
 * the first rank and prices the rest as a `rise` schedule (`risingPrice`),
 * and one with `prices` asks each rank's price from that list. */
export type TrainerCurve = { growth: number; start?: number; power?: number; cubic?: number } | { start: number; ratio: number; rise: number } | { prices: readonly number[] };
/** The trainer curves, set by where each row's Silver schedule starts:
 * the dearer a row in a run, the steeper its trainers. Rows starting at 20
 * Silver: 20, 44, 72, 104 … 380 for the tenth rank. */
const steepTrainers: TrainerCurve = { growth: 10, cubic: 60 };
/** Rows starting at 10 Silver: 20, 42, 66, 92 … 290 for the tenth. */
const firmTrainers: TrainerCurve = { growth: 20, cubic: 45 };
/** Rows starting at 5 Silver: 20, 41, 63, 86 … 245 for the tenth. */
const mildTrainers: TrainerCurve = { growth: 40, cubic: 700 };
/** Max HP and Shroud, starting at 3 Silver: 20, 41, 62, 84 … 230 for the tenth. */
const gentleTrainers: TrainerCurve = { growth: 60, cubic: 800 };
/** The Offense crit rows: from 30 Gold, rising with the cube of the ranks done
 * (`power`), so the 13th rank costs 2,356, the 35th 121,000 and the 72nd 2.26 million. */
const critTrainers: TrainerCurve = { growth: 7, start: 30, power: 3 };
/** The Free Upgrade rows' trainers: the same curve as their Silver (`freeUpgrades`). */
const freeUpgradeTrainers: TrainerCurve = { growth: freeUpgrades.growth, start: freeUpgrades.base, cubic: freeUpgrades.cubic };
/** How a value row's amount reads on the Training tab and the run's cards
 * (`trainingText`): a multiplier (×1.30), meters (a tile is one), shots
 * every 10 turns, ATK multiplier a meter, a count with no unit (its name
 * says what), turns, a percent, or a bare amount. */
export type TrainingUnit = "×" | "m" | "shots" | "perMeter" | "count" | "turns" | "%" | "";
/** How long a trainer's ranks of a row take, when not the usual schedule
 * (`trainingSeconds`): `skip` passes over that many of its quickest first
 * ranks, so the row's first rank takes as long as the usual second; `each`
 * makes its n-th rank take n times that many seconds. */
export type TrainerTime = { readonly skip: number } | { readonly each: number };
/** One Training row, all of it in one place. Each rank costs `cost`
 * training points, and the row trains no further than its cap
 * (`trainingCap`): `max` ranks, and `LIMIT_BREAK_RANKS` more for each of its
 * first `breaks` Limit Breaks owned, its ranks and those bought for a run with
 * Silver together. A row with `requires` shows, and trains, only once that
 * upgrade is owned, and one with `goal` once that Goals checkpoint is claimed
 * (`trainingOpen`).
 *
 * Its ranks add up on its rank `curve` (`trained`). A stat row's (`stat`) add
 * to that stat of the hero, never by the hero's level: levels only earn
 * the points that buy ranks. Any other row is a value row, whose amount is
 * `base` plus its curve, up to `cap`, in its own units, `scale` of them to
 * one `unit` shown (`amountAt`). The game reads a value row's amount by
 * `trainedAmount`: `off` (0 unless given) until its `needs` upgrade is owned
 * (its `requires` unless given), and its ranks counted only once its
 * `requires` is.
 *
 * `research` multiplies what the row's value does (`rowResearchFactor`).
 * A rank bought with Silver inside a run, for that run alone, costs by the
 * row's `silver` schedule, and one a trainer trains costs Gold by its `gold`
 * curve (`trainingGold`): two curves chosen apart, the dearer a row's first
 * Silver rank the steeper its trainers, and takes the usual trainer's time
 * a rank unless `time` says otherwise. */
export type TrainingDef = {
  readonly id: string;
  readonly name: string;
  readonly short?: string;
  readonly group: keyof typeof TRAINING_GROUPS;
  readonly requires?: UpgradeId;
  readonly goal?: GoalUnlock;
  readonly cost: number;
  readonly max: number;
  readonly breaks?: number;
  readonly description: string;
  readonly stat?: string;
  readonly curve: TrainingCurve;
  readonly base?: number;
  readonly cap?: number;
  readonly scale?: number;
  readonly unit?: TrainingUnit;
  readonly needs?: UpgradeId;
  readonly off?: number;
  readonly research?: ResearchTarget;
  readonly silver: PriceSchedule;
  readonly gold: TrainerCurve;
  readonly time?: TrainerTime;
};
/** The Training rows, in the order the Training tab and a run's training
 * bar list them within each group. Every stat row's curve is super-linear,
 * every rank worth more than the one before, but Thorn Damage's and
 * Parry %'s, a flat percent a rank. */
export const TRAINING = [
  {
    id: "hp", name: "Max HP", group: "defense", stat: "maxHp", curve: { per: 10, square: 1 }, cost: 1, max: 1000, breaks: 10,
    description: "Raises maximum HP.",
    silver: vital, gold: gentleTrainers,
  },
  {
    id: "attack", name: "ATK", group: "offense", stat: "attack", curve: { per: 1, square: 0.2 }, cost: 1, max: 1000, breaks: 10,
    description: "Raises ATK, the damage each strike deals before the enemy's DEF.",
    silver: cheap, gold: mildTrainers,
  },
  // The chance each of the hero's strikes is critical, in hundredths of a
  // percent: 1% a rank, before research.
  {
    id: "critChance", name: "Critical Chance", short: "Crit %", group: "offense", requires: "critical", cost: 1, max: 80,
    curve: { per: 100 }, scale: 100, unit: "%", research: "critChancePercent",
    description: "Raises the chance each of your strikes is a critical hit.",
    silver: opened, gold: critTrainers,
  },
  // What a critical strike multiplies the hero's ATK by, in hundredths:
  // ×1.2 with Critical, and ×0.1 more a rank, before research.
  {
    id: "critFactor", name: "Critical Factor", short: "Crit x", group: "offense", requires: "critical", cost: 1, max: 150,
    curve: { per: 10 }, base: 120, off: 100, scale: 100, unit: "×", research: "critFactorPercent",
    description: "Raises how much a critical hit multiplies your ATK.",
    silver: { base: 12, step: 2, growth: 3 }, gold: critTrainers,
  },
  // The Archer's reach, in hundredths of a tile (a meter): 3 tiles, and 0.05 more a
  // rank, 7 at its 80 (ranged.ts).
  {
    id: "attackRange", name: "Attack Range", short: "Range", group: "offense", goal: "attackRange", cost: 1, max: 80,
    curve: { per: 5 }, base: 300, scale: 100, unit: "m",
    description: "Raises how far the Archer's shots reach, in meters.",
    silver: rangePrices, gold: { growth: rangePrices.growth, start: rangePrices.base, cubic: rangePrices.cubic },
  },
  // The Archer's rate of fire, in twentieths of a shot every 10 turns: 1
  // shot, and 0.05 more a rank, 6 at its 100 (ranged.ts).
  {
    id: "attackSpeed", name: "Attack Speed", short: "Speed", group: "offense", goal: "attackSpeed", cost: 1, max: 100,
    curve: { per: 1 }, base: 20, scale: 20, unit: "shots",
    description: "Raises how many shots the Archer fires every 10 turns.",
    silver: speedPrices, gold: { growth: speedPrices.growth, start: speedPrices.base, cubic: speedPrices.cubic },
  },
  // What ATK / m adds to an arrow's ATK multiplier for each tile to its
  // target, in hundred-thousandths of ×1: 0.01 for the first rank, and each
  // later rank 0.00004 less (0.00204 for the 200th), 1.204 a tile in all.
  // An arrow's ATK is multiplied by 1 + this × the Euclidean distance to
  // its target (ranged.ts). Its trainers start at a minute a rank.
  {
    id: "attackPerTile", name: "ATK / m", short: "ATK/m", group: "offense", goal: "attackPerTile", cost: 1, max: 200,
    curve: { per: 1002, square: -2 }, scale: 100_000, unit: "perMeter",
    description: "Multiplies the ATK of each of the Archer's shots by more for every meter its target stands away.",
    silver: perTilePrices, gold: { start: perTilePrices.base, ratio: perTilePrices.ratio, rise: perTilePrices.rise }, time: { skip: 1 },
  },
  // The chance each of the Archer's shots is a multishot, in hundredths of
  // a percent: 0.5% a rank, 49.5% at its 99 (ranged.ts). Its trainers
  // start at a minute a rank. Its trainers
  // start at a minute a rank.
  {
    id: "multishotChance", name: "Multishot Chance", short: "Multi %", group: "offense", goal: "multishot", cost: 1, max: 99,
    curve: { per: 50 }, scale: 100, unit: "%",
    description: "Raises the chance each of the Archer's shots fires more than one arrow, each at another enemy in range.",
    silver: multishotChancePrices, gold: { growth: multishotChancePrices.growth, start: multishotChancePrices.base, power: multishotChancePrices.power }, time: { skip: 1 },
  },
  // How many enemies a multishot fires at: 2, and one more a rank, 9 at its
  // 7. A trainer's n-th rank takes n hours.
  {
    id: "multishotTargets", name: "Multishot Targets", short: "Targets", group: "offense", goal: "multishot", cost: 1, max: 7,
    curve: { per: 1 }, base: 2, unit: "count",
    description: "Raises how many arrows a multishot fires, one at each of that many enemies in range.",
    silver: multishotTargetsPrices, gold: multishotTargetsPrices, time: { each: 3600 },
  },
  // The chance each of the Archer's shots, fired while Rapid Fire isn't,
  // starts it, in hundredths of a percent: 0.4% a rank, 34% at its 85.
  // While it lasts the Archer's arrows charge `RAPID_FIRE_SPEED` times as
  // fast (ranged.ts).
  {
    id: "rapidFireChance", name: "Rapid Fire Chance", short: "Rapid %", group: "offense", goal: "rapidFire", cost: 1, max: 85,
    curve: { per: 40 }, scale: 100, unit: "%",
    description: "Raises the chance each of the Archer's shots starts Rapid Fire: shots come four times as fast for a while.",
    silver: rapidFireChancePrices, gold: rapidFireChancePrices,
  },
  // How long Rapid Fire lasts, in hundredths of a turn: 1 turn, and 0.05
  // more a rank, 5.95 at its 99.
  {
    id: "rapidFireDuration", name: "Rapid Fire Duration", short: "Duration", group: "offense", goal: "rapidFire", cost: 1, max: 99,
    curve: { per: 5 }, base: 100, scale: 100, unit: "turns",
    description: "Raises how many turns Rapid Fire lasts once it starts.",
    silver: rapidFireDurationPrices, gold: rapidFireDurationPrices,
  },
  {
    id: "defense", name: "DEF", group: "defense", stat: "defense", curve: { per: 0, square: 1 / 12 }, cost: 1, max: 1000, breaks: 10,
    description: "Raises DEF, taken off the damage of every enemy strike.",
    silver: cheap, gold: mildTrainers,
  },
  // The HP regained each step taken in a run.
  {
    id: "regen", name: "Regen", group: "defense", stat: "regen", curve: { per: 0.1, square: 1 / 120 }, cost: 1, max: 1000, breaks: 10, requires: "regen",
    research: "regenPercent",
    description: "Raises the HP regained with every step taken in a run.",
    silver: cheap, gold: mildTrainers,
  },
  // The damage the shroud blocks each fight.
  {
    id: "shroud", name: "Shroud", group: "defense", stat: "shroud", curve: { per: 5, square: 0.1, fourth: 0.0000064 }, cost: 1, max: 1000, breaks: 8, requires: "shroud",
    description: "Raises the damage the shroud blocks at the start of every fight.",
    silver: vital, gold: { ...gentleTrainers, cubic: 700 },
  },
  // The share of the damage a strike deals restored as HP, in percent: 0.1%
  // for the first rank, each later rank adding 0.001% less, 0.021% for the
  // 80th, 4.84% in all.
  {
    id: "lifesteal", name: "Lifesteal", group: "defense", stat: "lifesteal", curve: { per: 0.1005, square: -0.0005 }, cost: 1, max: 80, requires: "lifesteal",
    description: "Raises the share of the damage each of your strikes deals that is restored to you as HP.",
    // 60 Gold for the first rank, then 60 × n × (1 + ((n − 1) / 20.5)²) for the n-th: about 1,000 for the 13th, 9,000 for the 37th and 70,000 for the 80th.
    silver: { base: 60, growth: 20.5, power: 2 }, gold: { growth: 20.5, start: 60, power: 2 },
  },
  // 1% a rank.
  {
    id: "thorns", name: "Thorn Damage", short: "Thorns", group: "defense", stat: "thorns", curve: { per: 1 }, cost: 1, max: 99, requires: "thorns",
    description: "Each enemy strike costs the enemy this share of its max HP, half against bosses and Greater Bosses.",
    silver: thornPrices, gold: { growth: thornPrices.growth, start: thornPrices.base, power: thornPrices.power },
  },
  // 0.5% a rank.
  {
    id: "parry", name: "Parry %", group: "defense", stat: "parry", curve: { per: 0.5 }, cost: 1, max: 100, requires: "parry",
    description: "Raises how much every enemy strike's damage is cut.",
    silver: parryPrices, gold: { growth: parryPrices.growth, start: parryPrices.base, power: parryPrices.power },
  },
  // The chance each strike that would fell the hero revives it instead, in
  // hundredths of a percent: 0.5% with Revive, and 0.5% more a rank, up to
  // 50% (99 ranks).
  {
    id: "revive", name: "Revive", group: "defense", requires: "revive", cost: 1, max: 99,
    curve: { per: 50 }, base: 50, cap: 5000, scale: 100, unit: "%",
    description: "Raises the chance a strike that would fell you revives you at full HP instead.",
    silver: revivePrices, gold: { growth: revivePrices.growth, start: revivePrices.base, power: revivePrices.power },
  },
  // The Gold each floor climbed for the first time in a run pays, before
  // the tier's bonus and research: 3 with Spare Change, and 1 more a rank.
  {
    id: "floorGold", name: "Gold / Floor", group: "utility", requires: "spareChange", cost: 1, max: 150,
    curve: { per: 1 }, base: 3, unit: "", research: "floorGold",
    description: "Raises the Gold paid for each floor climbed for the first time in a run.",
    silver: opened, gold: firmTrainers,
  },
  // The Silver each floor climbed for the first time in a run pays, before
  // research and Silver Bonus: none with Wishing Well alone, and 4 a rank.
  {
    id: "floorSilver", name: "Silver / Floor", group: "utility", requires: "wishingWell", cost: 1, max: 150,
    curve: { per: 4 }, unit: "", research: "floorSilver",
    description: "Raises the Silver paid for each floor climbed for the first time in a run.",
    silver: opened, gold: firmTrainers,
  },
  // Silver Bonus's multiplier on all Silver a run finds, in percent: ×1, and
  // 1% more a rank (`silverFound`).
  {
    id: "silverBonus", name: "Silver Bonus", group: "utility", requires: "wealthy", cost: 1, max: 150,
    curve: { per: 1 }, base: 100, off: 100, scale: 100, unit: "×", research: "silverBonus",
    description: "Multiplies all Silver found in a run.",
    silver: opened, gold: firmTrainers,
  },
  // Gold Bonus's multiplier on the Gold a kill, chest, item picked up or
  // door opened pays in a run, in percent: ×1, and 3% more a rank.
  {
    id: "goldBonus", name: "Gold Bonus", group: "utility", requires: "loot", cost: 1, max: 150,
    curve: { per: 3 }, base: 100, off: 100, scale: 100, unit: "×", research: "goldBonus",
    description: "Multiplies the Gold kills, chests, items picked up and doors opened pay in a run, and what Floor Skip pays for them, with Gold Bonus research. Gold / Floor and Interest aren't raised.",
    silver: opened, gold: firmTrainers,
  },
  // The Free Upgrade rows: the chance each floor passed in a run trains a
  // stat of the row's group a level for free, in hundredths of a percent:
  // 0.5% a rank, 50% at its 100 (`FREE_TRAINING_ROWS`).
  {
    id: "freeOffense", name: "Free Offense Up", group: "utility", requires: "freeTraining", cost: 1, max: 100,
    curve: { per: 50 }, scale: 100, unit: "%",
    description: "Each floor passed in a run has a chance to train a random Offense stat one level for free, for the run.",
    silver: freeUpgrades, gold: freeUpgradeTrainers,
  },
  {
    id: "freeDefense", name: "Free Defense Up", group: "utility", requires: "freeTraining", cost: 1, max: 100,
    curve: { per: 50 }, scale: 100, unit: "%",
    description: "Each floor passed in a run has a chance to train a random Defense stat one level for free, for the run.",
    silver: freeUpgrades, gold: freeUpgradeTrainers,
  },
  {
    id: "freeUtility", name: "Free Utility Up", group: "utility", requires: "freeTraining", cost: 1, max: 100,
    curve: { per: 50 }, scale: 100, unit: "%",
    description: "Each floor passed in a run has a chance to train a random Utility stat one level for free, for the run.",
    silver: freeUpgrades, gold: freeUpgradeTrainers,
  },
  // What a percent potion restores beyond its HP, in hundredths of a
  // percent of max HP: 1% with Recovery, and 0.25% more a rank.
  {
    id: "potion", name: "Potion %", group: "utility", requires: "recovery", cost: 1, max: 300,
    curve: { per: 25 }, base: 100, scale: 100, unit: "%",
    description: "Percent potions restore more of your maximum HP.",
    silver: deep, gold: steepTrainers,
  },
  // The chance each potion that may be one is a percent potion, in
  // hundredths of a percent: 2% with Recovery, and 0.25% more a rank once
  // Find Potion opens the row, up to 20% (72 ranks).
  {
    id: "findPotion", name: "Find Potion", group: "utility", requires: "findPotion", needs: "recovery", cost: 1, max: 72,
    curve: { per: 25 }, base: 200, cap: 2000, scale: 100, unit: "%",
    description: "More of the potions found are percent potions.",
    silver: deep, gold: { ...steepTrainers, cubic: 25 },
  },
  // How far HP may rise above max HP once Overheal is owned, as a multiple
  // of max HP in thousandths: ×1 (none above), and 0.031 more a rank, ×16.5
  // at its 500 (`hpCeiling`).
  {
    id: "overheal", name: "Overheal", group: "utility", requires: "overheal", cost: 1, max: 500,
    curve: { per: 31 }, base: 1000, off: 1000, scale: 1000, unit: "×",
    description: "Raises how far potions, GK to HP and badge heals can heal you above max HP.",
    silver: overhealPrices, gold: overhealPrices,
  },
] as const satisfies readonly TrainingDef[];
/** A row's rank curve: what `n` ranks add up to is `per` × n +
 * `square` × n² + `cube` × (n − 1)³ + `fourth` × (n − 1)⁴, the cubic and
 * quartic terms counted from the second rank so the first is worth exactly
 * `per` + `square`. Rows that grew with the hero's level give a hero
 * with a rank a level in each what they gave at that level: ATK n + n²/5,
 * max HP 10n + n², Regen 0.1n + n²/120, and DEF n²/12, without the whole
 * point a rank its old curve began from. Shroud is 5.1 at rank 1, 60 at 10,
 * about 2,100 at 100, 15,000 at 200 and 62,000 at 300, about four billion at
 * its 5,000. */
export type TrainingCurve = { per: number; square?: number; cube?: number; fourth?: number };
/** What `ranks` ranks of `row` add up to on its curve (to the character,
 * for a stat row), rounded once. Only `+` and `*`, so it is the same in
 * every engine. */
export function trained(row: Pick<TrainingDef, "curve">, ranks: number) {
  if (ranks <= 0) return 0;
  const c: TrainingCurve = row.curve, m = ranks - 1;
  return snap(c.per * ranks + (c.square ?? 0) * ranks * ranks + (c.cube ?? 0) * m * m * m + (c.fourth ?? 0) * m * m * m * m);
}
/** What the rank after `ranks` adds to `row`'s stat. */
export const trainingWorth = (row: StatTrainingRow, ranks: number) => snap(trained(row, ranks + 1) - trained(row, ranks));
/** Row `id`, read through its definition's type. */
export const trainingDef = (id: TrainingId): TrainingDef => TRAINING.find((t) => t.id === id)!;
/** A value row's amount at `ranks`, in its own units: its `base` and
 * curve, up to its `cap`. */
export const amountAt = (row: TrainingDef, ranks: number) => Math.min(row.cap ?? Infinity, (row.base ?? 0) + trained(row, ranks));
/** Value row `id`'s amount as the game reads it, in the row's own units,
 * at `ranks` (the ranks `save` holds; a run's `trainingNow` counts those
 * bought with Silver): `off` until its `needs` upgrade is owned, and its
 * ranks counted only once its `requires` is. */
export function trainedAmount(save: { upgrades: Partial<Record<UpgradeId, number>>; training?: Partial<Record<TrainingId, number>> }, id: TrainingId, ranks = save.training?.[id] ?? 0) {
  const row = trainingDef(id), needs = row.needs ?? row.requires;
  if (needs && !save.upgrades[needs]) return row.off ?? 0;
  return amountAt(row, row.requires && !save.upgrades[row.requires] ? 0 : ranks);
}
/** Provisions, bought with Gold on the Gear page and kept for good: each
 * one owned is one use every run carries, never a stat at its start. The
 * Traveler's elixir fills HP (`Game.useProvision`), the Whetstone and
 * Aegis charm raise ATK or DEF by `PROVISION_BOOST_PERCENT` for
 * `PROVISION_BOOST_TURNS` turns, a Bomb is thrown at an enemy (`Game.arm`),
 * and each Gold Key hands the run a gold key every `PROVISION_KEY_FLOORS`
 * floors. Each costs `price.base` Gold (100), and each one after `ratio` (100) times
 * the last (`schedulePrice`). One with `requires` shows, and sells, only
 * once that upgrade is owned. */
export const GOLD_SHOP = [
  {
    id: "heal",
    name: "Traveler's elixir",
    description: "One more elixir every run: press it to fill HP to max HP",
    price: { base: 100, ratio: 100 },
  },
  {
    id: "guard",
    name: "Aegis charm",
    description: "One more Aegis charm every run: press it for +20% DEF for 100 turns",
    price: { base: 100, ratio: 100 },
  },
  {
    id: "edge",
    name: "Whetstone",
    description: "One more Whetstone every run: press it for +20% ATK for 100 turns",
    price: { base: 100, ratio: 100 },
  },
  {
    id: "yellowKey",
    name: "Gold Key",
    description: "One more gold key every 100 floors of a run, from the floor it starts on",
    price: { base: 100, ratio: 100 },
    requires: "extraKey",
  },
  {
    id: "bomb",
    name: "Bomb",
    description: "One more Bomb every run: press it, then an enemy's tile, to deal that enemy your ATK",
    price: { base: 100, ratio: 100 },
  },
] as const;
/** The provisions pressed from the HUD to use at once (not a Bomb, armed
 * for a board tap, nor the Gold Key, which uses itself). */
export const USED_PROVISIONS = ["heal", "edge", "guard"] as const;
export type UsedProvision = (typeof USED_PROVISIONS)[number];
/** The stat each boosting provision raises while it lasts. */
export const PROVISION_BOOSTS = { edge: "attack", guard: "defense" } as const satisfies Partial<Record<UsedProvision, string>>;
/** How much a Whetstone or Aegis charm raises its stat, in percent, and
 * for how many turns. */
export const PROVISION_BOOST_PERCENT = 20;
export const PROVISION_BOOST_TURNS = 100;
/** The floors between a Gold Key provision's keys. */
export const PROVISION_KEY_FLOORS = 100;
export type GoldItemId = (typeof GOLD_SHOP)[number]["id"];

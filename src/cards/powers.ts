/** Card powers: what each card's levels give (cards/levels.ts). A card's
 * base power rises with every level it reaches; each of its rarities'
 * powers rises once a level through that rarity's ten levels, so a card
 * gains them as it levels, with nothing to spend. A power raises the stats
 * it names (`PowerStat`) for as long as the run's hand holds the card,
 * summed with every other card in the hand that raises the same stat into
 * one card factor. */
import { TRADERS, type CardId, type TraderCard } from "./cards.ts";
import { levelIn, type CardLevelSave } from "./levels.ts";
import { LEVELS_PER_RARITY, firstLevelOf, type CardRarity } from "./rarity.ts";
import { snap } from "../exact.ts";
import { hasLock, type DoorKind } from "../doors.ts";
import type { Enemy, KeyColor, Tile } from "../entities.ts";
import { covers } from "./foe-cards.ts";
import { extraEnemies } from "../enemies/more-enemies.ts";
import type { RunCore } from "../runs.ts";

/** What a power's levels raise, a level's worth each. Most are percents
 * that add into one card factor (×(100 + sum) / 100) on their stat; the
 * rest (`FLAT_STATS`) add their amount as it is. */
export type PowerStat =
  /** Spare Change's Gold and Wishing Well's Silver for each floor new to the run. */
  | "floorGold" | "floorSilver"
  /** Gold Bonus (a kill's, a chest's, Pickup Gold and Gold / Floor) and all Silver a run finds, Interest too. */
  | "goldBonus" | "silverBonus"
  /** Each Free Upgrade group's chance a floor. */
  | "freeOffense" | "freeDefense" | "freeUtility"
  /** Flat: a percent chance of a free Offense, Defense or Utility level
   * each floor, added to that group's own, so it gives one without it
   * trained. */
  | "freeOffenseChance" | "freeDefenseChance" | "freeUtilityChance"
  /** Flat: the percent of max HP healed on each floor new to the run, up to the Overheal ceiling. */
  | "floorHeal"
  /** Flat: percent of max HP added to the Overheal ceiling, whether or not the skill is owned (so it opens one above max HP). */
  | "overhealMax"
  /** Flat: the percent chance the Tower's stairs, reached by STAIRS, climb two floors (as Skip on STAIRS does). */
  | "stairSkip"
  /** The chance each potion is a percent potion, and the HP every potion restores. */
  | "percentPotions" | "potionHeal"
  /** Flat: the percent of max HP each potion HEAL reaches boosts it by, for the run (as the Max HP badge does). */
  | "potionMaxHp"
  /** Flat: Silver found with each potion taken, before Silver Bonus. */
  | "potionSilver"
  /** Regen: the HP regained each step. */
  | "regen"
  /** The shroud in fights with every enemy. */
  | "shroud"
  /** Flat: a percent of every enemy strike parried, added to the hero's
   * Parry %, so it parries without Parry. */
  | "parry"
  /** Flat: percent added to Revive's chance, so it revives without Revive trained. */
  | "reviveChance"
  /** Less of each key every door takes, and more each door's Pickup Gold. */
  | "doorCost" | "doorGold"
  /** Flat: Silver found with each door opened, before Silver Bonus. */
  | "doorSilver"
  /** Flat: the percent of max HP healed on opening each door, after a Heart Door's drain, up to max HP. */
  | "doorHeal"
  /** Flat: the percent chance each colour door on the run's floors is
   * generated a Wooden Door instead (Skeleton Key), and each door of two
   * or three colours without its rarest lock (Lock Pick). */
  | "skeletonKey" | "lockPick"
  /** Flat: the percent chance a door opens for nothing: no keys, no HP (Secret Knock). */
  | "secretKnock"
  /** A door card's own stats (GOLD, HEART and WOODEN DOOR's trees), for its doors only. */
  | DoorLockStat
  /** Flat: the percent of max HP healed on opening each door with a gold
   * lock (GOLD DOOR's Gold Door Heal), added to Door Heal. */
  | "yellowLockHeal"
  /** Flat: the percent chance each Wooden or Steel Door on the run's floors
   * is generated a Gold Door instead (GOLD DOOR's Gold Door Transmute), and
   * each Heart Door taking no keys a Wooden Door (HEART and WOODEN DOOR's
   * Wooden Door Transmute). */
  | "yellowTransmute" | "woodTransmute"
  /** HEART DOOR's: less of the HP each door draining HP drains (added to
   * the card's own cut); and flat, the percent chance each door taking keys
   * and draining HP on the run's floors is generated without its drain
   * (Heart Lock Pick), and the percent more shroud, for the rest of the
   * run, each drain paid adds (Shroud Growth). */
  | "heartLockCost" | "heartLockPick" | "heartShroud"
  /** WOODEN DOOR's: less of the key (Wooden Key Cost) and of the HP
   * breaking it down (Durability) each Wooden Door takes, each added to the
   * card's own cut; and flat, the percent chance an opened Wooden Door
   * gives a gold key (Druidic Talent). */
  | "woodKeyCost" | "woodDurability" | "druidKey"
  /** Flat: the percent chance an opened door (Door Chest) or a key picked
   * up (Key Chest) leaves an opened treasure chest, its loot paid. */
  | "doorChest" | "keyChest"
  /** More each key of every colour is worth, and more each key's Pickup Gold. */
  | "keyFind" | "keyGold"
  /** Flat: the percent of max HP healed on picking up each key, up to max
   * HP (Key Heal), and the percent of the Overheal ceiling, up to it (Key
   * Overheal: the max HP ceiling without Overheal). */
  | "keyHeal" | "keyOverheal"
  /** Flat: Silver found with each key picked up, before Silver Bonus. */
  | "keySilver"
  /** A key colour's own stats (GOLD, BLUE and RED KEY's trees), for its keys only. */
  | ColorKeyStat
  /** A key trader's own stats (GK -> BK's and BK -> RK's trees), for its trades only. */
  | TradeStat
  /** A smelt's own stats (Smelt GK's, BK's and RK's trees), for its smelts only. */
  | SmeltStat
  /** Flat: the percent chance any smelt pays twice its Gold (Key Smelter),
   * every smelt tree's added as one. */
  | "keySmelter"
  /** An enemy card's own stats (WEAK through NON-BOSS ENEMY's trees), against the enemies it covers only. */
  | FoeCardStat
  /** Max HP for the run, its own factor beside the boons' and the Max HP badge's. */
  | "maxHp"
  /** Less of the keys and HP a Wooden or Steel Door takes, and of the keys
   * and the drain a Heart Door takes. */
  | "plainDoorCost" | "heartDoorCost"
  /** Flat: the percent chance a key picked up is two (Locksmith), and that
   * one opens every door on its floor (Master Key). */
  | "doubleKey" | "masterKey"
  /** ATK and DEF in fights with every enemy, and every kill's Gold and Silver. */
  | "foeAttack" | "foeDefense" | "foeGold" | "foeSilver"
  /** Crit %'s chance and Crit x's factor, and the XP every kill gives. */
  | "critChance" | "critFactor" | "killXp"
  /** Flat: the percent chance the first strike of a fight right after a
   * Dash strikes with twice the hero's ATK (Surprise Attack). */
  | "surpriseAttack"
  /** Flat: the percent every enemy's ATK is cut by (Weaken). */
  | "foeAttackCut"
  /** Flat: the percent of max HP Lifesteal may heal above it (Lifesteal Overheal). */
  | "stealOverheal"
  /** More enemies generated on each floor, of every strength (as More Enemies adds them). */
  | "moreEnemies"
  /** What each ATK or DEF shard raises its stat by, and its Pickup Gold. */
  | "attackShard" | "defenseShard" | "attackShardGold" | "defenseShardGold"
  /** Flat: Silver found with each ATK or DEF shard taken, before Silver Bonus. */
  | "attackShardSilver" | "defenseShardSilver"
  /** Flat: the percent chance an ATK shard taken charges Power Strike:
   * twice the hero's ATK in its next fight. */
  | "powerStrike"
  /** Flat: the percent of a boss's (Takedown) or a Greater Boss's (Greater
   * Takedown) max HP taken off as a fight with it begins, and of its ATK
   * (Tangle, Greater Tangle). */
  | "takedown" | "tangle" | "greaterTakedown" | "greaterTangle"
  /** ATK, DEF and the shroud in fights with a Greater Boss, and its kill's Gold. */
  | "bossAttack" | "bossDefense" | "bossShroud" | "bossGold"
  /** Flat: Lore more from each Greater Boss, before a badge's scale. */
  | "bossCells"
  /** Each treasure chest's Gold. */
  | "chestGold"
  /** Flat: Silver found with each treasure chest opened, before Silver Bonus. */
  | "chestSilver"
  /** Flat: the percent chance a treasure chest also holds a Greater Boss's Lore. */
  | "chestCells"
  /** Flat: percentage points more chance of a Supply or an Equipment Chest. */
  | "supplyChance" | "equipmentChance"
  /** Flat: the percent chance each floor is a Treasure Floor, its ATK and
   * DEF shards and potions made treasure chests. */
  | "treasureFloor"
  /** Flat: the percent chance an Equipment Chest's piece is a rarity higher. */
  | "rarityUp"
  /** Flat: the percent chance a treasure chest's rewards are doubled (Double), and tripled (Triple). */
  | "chestDouble" | "chestTriple"
  /** The Archer's arrows: Shot ATK, added to the cards' (and, against a
   * boss or Greater Boss, to their boss bonus), Attack Speed, added to the
   * cards' (Shot Speed), Attack Range (Range, the arrows' only), and
   * Charged Shot's percent a turn waited (Charge Shot). */
  | "shotAttack" | "bossShotAttack" | "shotSpeed" | "shotRange" | "chargeShot"
  /** Flat: the percent chance each floor new to the run pays the tier's
   * Rubies, as a boss does (STAIRS' Ruby Chance). */
  | "floorRuby"
  /** Flat: Rubies more from each boss or Greater Boss kill, any fraction a
   * chance of one more (BOSS ENEMY's Boss Rubies). */
  | "bossRubies"
  /** Both Enemy Level Skip chances, raised by this percent, each up to
   * `LEVEL_SKIP_BOOST_CAP` (STAIRS' Enemy Skip). */
  | "levelSkipBoost"
  /** Flat: Gold and Silver each torch TORCH puts out pays, before Gold and Silver Bonus (Torch Loot). */
  | "torchGold" | "torchSilver"
  /** Flat: the percent chance each Gold Door on the run's floors is
   * generated a Wooden Door that still pays the Gold Door's Gold (WOODEN
   * DOOR's Transmute Gold to Wood). */
  | "yellowToWood"
  /** GEM's, all flat but Gem XP: rewards more the ad button's bank holds
   * (Gem Bank), seconds off its cooldown (Gem Bank Speed) and Gems more
   * each reward pays (More Gems); the percent chances a Gem appearing is
   * golden (Golden Gem), a golden one stellar (Stellar Gem Chance), a
   * treasure chest holds a Gem (Gems in Chests), each floor new to the run
   * has one of its own (Gem Chance) and a boss or Greater Boss drops one
   * (Boss Gem Drop); and percent more GEM card XP from each Gem (Gem XP). */
  | GemStat;
/** The GEM card's stats (`PowerStat`'s last line). */
export const GEM_STATS = ["gemBank", "gemBankSpeed", "adGems", "goldenGem", "stellarGem", "chestGem", "gemChance", "bossGem", "gemXp"] as const;
export type GemStat = (typeof GEM_STATS)[number];

/** What a key colour's own stats (GOLD, BLUE and RED KEY's trees) raise,
 * for keys of that colour only, each named `${colour}${part}`: Key Heal and
 * Key Overheal, Key Silver and Key Chest (flat, added to KEY's), Key Gold
 * and Key Find (each its own factor on KEY's and the key cards'), Door Cost
 * (the percent less of the key a single door of the colour takes, its own
 * factor on the other door discounts), and the flat chances a key of the
 * colour is two (its Locksmith, rolled apart from KEY's), opens every
 * door with a lock of its colour on its floor (its Master Key), and of a
 * key of the colour on each floor new to the run (Floor Key: the traders'
 * and smelts' Extra Key). */
export const COLOR_KEY_PARTS = ["KeyHeal", "KeyOverheal", "KeyGold", "KeyFind", "KeySilver", "KeyChest", "DoorCost", "DoubleKey", "MasterKey", "FloorKey"] as const;
export type ColorKeyPart = (typeof COLOR_KEY_PARTS)[number];
export type ColorKeyStat = `${KeyColor}${ColorKeyPart}`;
export const KEY_COLORS: readonly KeyColor[] = ["yellow", "blue", "red"];
const FLAT_KEY_PARTS: readonly ColorKeyPart[] = ["KeyHeal", "KeyOverheal", "KeySilver", "KeyChest", "DoubleKey", "MasterKey", "FloorKey"];
const colorKeyStats = (parts: readonly ColorKeyPart[]) => KEY_COLORS.flatMap((color) => parts.map((part): ColorKeyStat => `${color}${part}`));
/** Key colour `color`'s own stat `part` in `bonus`. */
export const keyStat = (bonus: PowerBonus, color: KeyColor, part: ColorKeyPart) => bonus[`${color}${part}`];

/** What a key trader's own stats (GK -> BK's and BK -> RK's trees) raise,
 * each named `${colour}${part}` by the colour it trades for: Trade Cost
 * (the percent less of the keys each trade takes, its Efficiency), and the
 * flat chances of a free Utility level on each trade (Trade Free Utility),
 * of a second key from a trade (Forge), and of a third when the Forge
 * gives one (Smelter). */
export const TRADE_PARTS = ["TradeCost", "TradeFreeUtility", "Forge", "Smelter"] as const;
export type TradePart = (typeof TRADE_PARTS)[number];
export type TradeColor = (typeof TRADERS)[TraderCard]["to"];
export type TradeStat = `${TradeColor}${TradePart}`;
export const TRADE_COLORS: readonly TradeColor[] = ["blue", "red"];
const tradeStats = (parts: readonly TradePart[]) => TRADE_COLORS.flatMap((color) => parts.map((part): TradeStat => `${color}${part}`));
/** The trader for key colour `color`'s own stat `part` in `bonus`. */
export const tradeStat = (bonus: PowerBonus, color: TradeColor, part: TradePart) => bonus[`${color}${part}`];

/** What a smelt's own stats (Smelt GK's, BK's and RK's trees) raise, each
 * named `${colour}${part}` by the colour it smelts: Smelt Cost (the percent
 * less of the key each smelt takes, its Efficiency), and the flat Gold and
 * Silver each smelt pays (Smelt Gold, Smelt Silver), percent of max HP it
 * heals more (Smelt Heal), and chances of a free training level (Smelt
 * Free: Defense for gold keys, Offense for blue, each group for red) and of
 * three times its Gold (Smelt Master: its Master Smelter). */
export const SMELT_PARTS = ["SmeltGold", "SmeltHeal", "SmeltSilver", "SmeltFree", "SmeltCost", "SmeltMaster"] as const;
export type SmeltPart = (typeof SMELT_PARTS)[number];
export type SmeltStat = `${KeyColor}${SmeltPart}`;
const smeltStats = (parts: readonly SmeltPart[]) => KEY_COLORS.flatMap((color) => parts.map((part): SmeltStat => `${color}${part}`));
/** The smelt for key colour `color`'s own stat `part` in `bonus`. */
export const smeltStat = (bonus: PowerBonus, color: KeyColor, part: SmeltPart) => bonus[`${color}${part}`];

/** What a door card's own stats (GOLD, HEART and WOODEN DOOR's trees)
 * raise, for its doors only (`hasLock`: a door with a gold lock, one
 * draining HP, a Wooden Door), each named `${kind}Lock${part}` and added to
 * DOOR's own as one amount (`doorStat`): Door Gold (a percent), and the
 * flat Door Silver and chances of Door Chest and Secret Knock. */
export const DOOR_LOCK_PARTS = ["Gold", "Silver", "Chest", "Knock"] as const;
export type DoorLockPart = (typeof DOOR_LOCK_PARTS)[number];
export type DoorLockStat = `${DoorKind}Lock${DoorLockPart}`;
const DOOR_KINDS: readonly DoorKind[] = ["yellow", "heart", "wood"];
const doorLockStats = (parts: readonly DoorLockPart[]) => DOOR_KINDS.flatMap((kind) => parts.map((part): DoorLockStat => `${kind}Lock${part}`));
const DOOR_PART_STATS: Record<DoorLockPart, PowerStat> = { Gold: "doorGold", Silver: "doorSilver", Chest: "doorChest", Knock: "secretKnock" };
/** DOOR's stat `part` in `bonus` for the door `t`, the door cards' own covering it added. */
export const doorStat = (bonus: PowerBonus, t: Tile, part: DoorLockPart) =>
  DOOR_KINDS.reduce((sum, kind) => (hasLock(t, kind) ? snap(sum + bonus[`${kind}Lock${part}`]) : sum), bonus[DOOR_PART_STATS[part]]);

/** The enemy cards with powers of their own, each raising its own stats
 * against the enemies it covers (`FOE_CARDS`), and ARCHER, whose powers
 * cover every enemy (`TREE_FOES`). */
export const FOE_TREE_CARDS = ["bossEnemy", "nonBossEnemy", "archer"] as const;
export type FoeTreeCard = (typeof FOE_TREE_CARDS)[number];
/** What an enemy card's own stats raise, against the enemies it covers
 * only, each named `${card}${part}`: kill Gold, and kill Gold more for an
 * Instakill (percents added into one card factor with ENEMY's and the
 * cards'); Silver more each kill (flat, before Silver Bonus); ATK, DEF and
 * the shroud in fights with them, Crit %'s chance and Crit x's factor, and
 * kill XP (percents added to ENEMY's); Spawn Rate (percent more of them on
 * each floor); and the flat ones: the percent chance of a Supply Chest's
 * upgrade materials from each kill (Material) or each Instakill (Instakill
 * Material) and of an Equipment Chest's piece from each kill (Equipment),
 * the percent of max HP each Instakill boosts it by for the run (Instakill
 * Vigor), the percent of max HP Lifesteal may heal above it, Surprise
 * Attack's chance, Lore from each kill, the percents of its max HP
 * (Takedown) and ATK (Tangle) a boss or Greater Boss loses as a fight with
 * it begins, and the percent chance a Fast enemy loses its first strike
 * (First Strike); and Charge Shot, percent more Charged Shot for the
 * Archer's arrows at them (into one card factor with ARCHER's). */
export const FOE_PARTS = ["Gold", "InstakillGold", "Silver", "Attack", "Defense", "Shroud", "CritChance", "CritFactor", "KillXp", "SpawnRate",
  "Material", "InstakillMaterial", "Equipment", "InstakillMaxHp", "StealOverheal", "SurpriseAttack", "Cells", "Takedown", "Tangle", "FirstStrike", "ChargeShot"] as const;
export type FoePart = (typeof FOE_PARTS)[number];
export type FoeCardStat = `${FoeTreeCard}${FoePart}`;
const FLAT_FOE_PARTS: readonly FoePart[] = ["Silver", "Material", "InstakillMaterial", "Equipment", "InstakillMaxHp", "StealOverheal", "SurpriseAttack", "Cells", "Takedown", "Tangle", "FirstStrike"];
const foeCardStats = (parts: readonly FoePart[]) => FOE_TREE_CARDS.flatMap((card) => parts.map((part): FoeCardStat => `${card}${part}`));
/** Enemy card `card`'s own stat `part` in `bonus`. */
export const foeCardStat = (bonus: PowerBonus, card: FoeTreeCard, part: FoePart) => bonus[`${card}${part}`];
/** The enemy cards' own stat `part` in `bonus` against `enemy`: those of
 * the cards covering it, added up. */
export const foeStat = (bonus: PowerBonus, enemy: Enemy, part: FoePart) =>
  FOE_TREE_CARDS.reduce((sum, card) => (covers(card, enemy) ? snap(sum + bonus[`${card}${part}`]) : sum), 0);
/** The enemy cards' own stat `part` in `bonus`, by card, those without it
 * left out: what the hero carries by card (`Player.foeAttack` and the rest). */
export function foeStats(bonus: PowerBonus, part: FoePart): Partial<Record<FoeTreeCard, number>> {
  const out: Partial<Record<FoeTreeCard, number>> = {};
  for (const card of FOE_TREE_CARDS) if (bonus[`${card}${part}`]) out[card] = bonus[`${card}${part}`];
  return out;
}

/** The stats added as they are, not as percents of a factor. */
export const FLAT_STATS: ReadonlySet<PowerStat> = new Set<PowerStat>(["floorHeal", "overhealMax", "stairSkip", "potionMaxHp", "potionSilver", "freeOffenseChance", "freeDefenseChance", "freeUtilityChance",
  "doorSilver", "doorHeal", "skeletonKey", "lockPick", "secretKnock", "doorChest", "yellowLockHeal", "yellowTransmute", "woodTransmute", "heartLockPick", "heartShroud", "druidKey", ...doorLockStats(["Silver", "Chest", "Knock"]), "keyChest", "keyHeal", "keyOverheal", "keySilver", "doubleKey", "masterKey", "surpriseAttack", "foeAttackCut", "stealOverheal", "parry", "reviveChance",
  "attackShardSilver", "defenseShardSilver", "powerStrike", "takedown", "tangle", "greaterTakedown", "greaterTangle", "bossCells", "chestSilver", "chestCells", "supplyChance", "equipmentChance", "treasureFloor", "rarityUp", "chestDouble", "chestTriple",
  "floorRuby", "bossRubies", "torchGold", "torchSilver", "yellowToWood", ...colorKeyStats(FLAT_KEY_PARTS), ...tradeStats(["TradeFreeUtility", "Forge", "Smelter"]),
  ...smeltStats(["SmeltGold", "SmeltHeal", "SmeltSilver", "SmeltFree", "SmeltMaster"]), "keySmelter", ...foeCardStats(FLAT_FOE_PARTS), ...GEM_STATS.filter((s) => s !== "gemXp")]);

/** One of a card's powers: the rarity whose levels raise it, its name, and
 * the stats each of those levels raises. A `base` power rises with every
 * level the card reaches, 1 to 60; the rest each rise once a level through
 * their rarity's ten (`powerLevel`). */
export type CardPower = { rarity: CardRarity; name: string; stats: Partial<Record<PowerStat, number>> };
const p = (rarity: CardRarity, name: string, stats: CardPower["stats"]): CardPower => ({ rarity, name, stats });

/** Each card's powers, base first, then one a rarity from common to
 * mythic. A card left out has none yet: it still levels and ascends. */
export const CARD_POWERS: Partial<Record<CardId, readonly CardPower[]>> = {
  stairs: [
    p("base", "Floor Heal", { floorHeal: 1 }),
    p("common", "Silver Bonus", { silverBonus: 1 }),
    p("uncommon", "Stair Skip", { stairSkip: 2 }),
    p("rare", "Free Upgrade", { freeOffenseChance: 0.5, freeDefenseChance: 0.5, freeUtilityChance: 0.5 }),
    p("epic", "Gold Bonus", { goldBonus: 1 }),
    p("legendary", "Ruby Chance", { floorRuby: 1 }),
    p("mythic", "Enemy Skip", { levelSkipBoost: 1 }),
  ],
  heal: [
    p("base", "Percent Potions", { percentPotions: 1 }),
    p("common", "Potion Heal", { potionHeal: 2 }),
    p("uncommon", "Shroud", { shroud: 2 }),
    p("rare", "Free Defense", { freeDefenseChance: 0.5 }),
    p("epic", "Overheal Max", { overhealMax: 5 }),
    p("legendary", "Potion Vigor", { potionMaxHp: 0.01 }),
    p("mythic", "Parry", { parry: 0.5 }),
  ],
  door: [
    p("base", "Door Cost", { doorCost: 0.4 }),
    p("common", "Door Gold", { doorGold: 2 }),
    p("uncommon", "Free Utility", { freeUtilityChance: 0.5 }),
    p("rare", "Skeleton Key", { skeletonKey: 1 }),
    p("epic", "Lock Pick", { lockPick: 1 }),
    p("legendary", "Secret Knock", { secretKnock: 1 }),
    p("mythic", "Door Chest", { doorChest: 0.25 }),
  ],
  yellowDoor: [
    p("base", "Gold key cost", { yellowDoorCost: 0.5 }),
    p("common", "Silver per door with a gold lock", { yellowLockSilver: 0.1 }),
    p("uncommon", "Gold Door Gold", { yellowLockGold: 2 }),
    p("rare", "Gold Bonus", { goldBonus: 1 }),
    p("epic", "Lock Pick chance", { lockPick: 1 }),
    p("legendary", "Gold Knock chance", { yellowLockKnock: 1 }),
    p("mythic", "Gold Door Chest chance", { yellowLockChest: 0.5 }),
  ],
  heartDoor: [
    p("base", "Heart Door drain", { heartLockCost: 0.3 }),
    p("common", "Wooden Door Transmute chance", { woodTransmute: 2 }),
    p("uncommon", "Heart Door Gold", { heartLockGold: 3 }),
    p("rare", "Heart Lock Pick chance", { heartLockPick: 1 }),
    p("epic", "Shroud per Heart Door", { heartShroud: 0.05 }),
    p("legendary", "Heart Knock chance", { heartLockKnock: 1 }),
    p("mythic", "Heart Door Chest chance", { heartLockChest: 1 }),
  ],
  woodenDoor: [
    p("base", "Wooden Door key cost", { woodKeyCost: 0.5 }),
    p("common", "Wooden Door durability", { woodDurability: 2 }),
    p("uncommon", "Wooden Door Transmute chance", { woodTransmute: 3 }),
    p("rare", "Wooden Knock chance", { woodLockKnock: 1 }),
    p("epic", "Transmute Gold to Wood", { yellowToWood: 1 }),
    p("legendary", "Druidic Talent chance", { druidKey: 1 }),
    p("mythic", "Wooden Door Chest chance", { woodLockChest: 1 }),
  ],
  key: [
    p("base", "Key Find", { keyFind: 1 }),
    p("common", "Plain Doors", { plainDoorCost: 1 }),
    p("uncommon", "Heart Doors", { heartDoorCost: 1 }),
    p("rare", "Key Overheal", { keyOverheal: 1 }),
    p("epic", "Locksmith", { doubleKey: 1 }),
    p("legendary", "Key Chest", { keyChest: 1 }),
    p("mythic", "Master Key", { masterKey: 1 }),
  ],
  yellowKey: [
    p("base", "Gold keys found", { yellowKeyFind: 1 }),
    p("common", "Gold key cost", { yellowDoorCost: 1 }),
    p("uncommon", "Gold Key Gold", { yellowKeyGold: 2 }),
    p("rare", "Locksmith Gold chance", { yellowDoubleKey: 1 }),
    p("epic", "Gold Key Chest chance", { yellowKeyChest: 0.2 }),
    p("legendary", "Gold Bonus", { goldBonus: 1 }),
    p("mythic", "Master Gold Key chance", { yellowMasterKey: 2 }),
  ],
  blueKey: [
    p("base", "Blue keys found", { blueKeyFind: 1 }),
    p("common", "Blue key cost", { blueDoorCost: 1 }),
    p("uncommon", "Blue Key Gold", { blueKeyGold: 4 }),
    p("rare", "Locksmith Blue chance", { blueDoubleKey: 1 }),
    p("epic", "Blue Key Chest chance", { blueKeyChest: 0.3 }),
    p("legendary", "Gold Bonus", { goldBonus: 2 }),
    p("mythic", "Master Blue Key chance", { blueMasterKey: 2 }),
  ],
  redKey: [
    p("base", "Red keys found", { redKeyFind: 1 }),
    p("common", "Red key cost", { redDoorCost: 1 }),
    p("uncommon", "Red Key Gold", { redKeyGold: 6 }),
    p("rare", "Locksmith Red chance", { redDoubleKey: 1 }),
    p("epic", "Red Key Chest chance", { redKeyChest: 0.4 }),
    p("legendary", "Gold Bonus", { goldBonus: 3 }),
    p("mythic", "Master Red Key chance", { redMasterKey: 2 }),
  ],
  blueTrader: [
    p("base", "Blue keys found", { blueKeyFind: 1 }),
    p("common", "Blue key cost", { blueDoorCost: 1 }),
    p("uncommon", "Keys per trade", { blueTradeCost: 1 }),
    p("rare", "Extra blue key chance", { blueFloorKey: 1 }),
    p("epic", "Blue Key Gold", { blueKeyGold: 2 }),
    p("legendary", "Blue Forge chance", { blueForge: 2.5 }),
    p("mythic", "Blue Smelter chance", { blueSmelter: 5 }),
  ],
  redTrader: [
    p("base", "Red keys found", { redKeyFind: 1 }),
    p("common", "Red key cost", { redDoorCost: 1 }),
    p("uncommon", "Keys per trade", { redTradeCost: 1 }),
    p("rare", "Extra red key chance", { redFloorKey: 1 }),
    p("epic", "Red Key Gold", { redKeyGold: 3 }),
    p("legendary", "Red Forge chance", { redForge: 2.5 }),
    p("mythic", "Red Smelter chance", { redSmelter: 5 }),
  ],
  keyToHp: [
    p("base", "Key per smelt", { yellowSmeltCost: 0.5 }),
    p("common", "Gold key cost", { yellowDoorCost: 1 }),
    p("uncommon", "Max HP healed per smelt", { yellowSmeltHeal: 2 }),
    p("rare", "Extra gold key chance", { yellowFloorKey: 1 }),
    p("epic", "Gold per smelt", { yellowSmeltGold: 0.15 }),
    p("legendary", "Key Smelter chance", { keySmelter: 3 }),
    p("mythic", "Master Gold Smelter chance", { yellowSmeltMaster: 6 }),
  ],
  smeltBlue: [
    p("base", "Key per smelt", { blueSmeltCost: 0.5 }),
    p("common", "Blue key cost", { blueDoorCost: 1 }),
    p("uncommon", "Max HP healed per smelt", { blueSmeltHeal: 6 }),
    p("rare", "Extra blue key chance", { blueFloorKey: 1 }),
    p("epic", "Gold per smelt", { blueSmeltGold: 0.3 }),
    p("legendary", "Key Smelter chance", { keySmelter: 3 }),
    p("mythic", "Master Blue Smelter chance", { blueSmeltMaster: 6 }),
  ],
  smeltRed: [
    p("base", "Key per smelt", { redSmeltCost: 0.5 }),
    p("common", "Red key cost", { redDoorCost: 1 }),
    p("uncommon", "Max HP healed per smelt", { redSmeltHeal: 18 }),
    p("rare", "Extra red key chance", { redFloorKey: 1 }),
    p("epic", "Gold per smelt", { redSmeltGold: 0.6 }),
    p("legendary", "Key Smelter chance", { keySmelter: 3 }),
    p("mythic", "Master Red Smelter chance", { redSmeltMaster: 6 }),
  ],
  monster: [
    p("base", "ATK vs enemies", { foeAttack: 3 }),
    p("common", "Crit %", { critChance: 1 }),
    p("uncommon", "Crit x", { critFactor: 2 }),
    p("rare", "Kill XP", { killXp: 2 }),
    p("epic", "Kill Gold", { foeGold: 2 }),
    p("legendary", "Enemy ATK", { foeAttackCut: 1 }),
    p("mythic", "Surprise Attack chance", { surpriseAttack: 5 }),
  ],
  bossEnemy: [
    p("base", "ATK vs Bosses", { bossEnemyAttack: 5 }),
    p("common", "Crit % vs Bosses", { bossEnemyCritChance: 3 }),
    p("uncommon", "Crit Factor vs Bosses", { bossEnemyCritFactor: 4 }),
    p("rare", "Boss Lore", { bossEnemyCells: 1 }),
    p("epic", "Boss Rubies", { bossRubies: 0.2 }),
    p("legendary", "Equipment drop chance", { bossEnemyEquipment: 0.3 }),
    p("mythic", "Takedown", { bossEnemyTakedown: 3 }),
  ],
  nonBossEnemy: [
    p("base", "ATK vs non-boss enemies", { nonBossEnemyAttack: 3 }),
    p("common", "Crit x vs non-boss enemies", { nonBossEnemyCritFactor: 2 }),
    p("uncommon", "Lifesteal Overheal", { nonBossEnemyStealOverheal: 10 }),
    p("rare", "XP from non-boss enemies", { nonBossEnemyKillXp: 2 }),
    p("epic", "Gold from non-boss enemies", { nonBossEnemyGold: 3 }),
    p("legendary", "Salvage chance", { nonBossEnemyMaterial: 1 }),
    p("mythic", "Surprise Attack chance", { nonBossEnemySurpriseAttack: 5 }),
  ],
  archer: [
    p("base", "Range", { shotRange: 1 }),
    p("common", "Spoils", { archerSilver: 0.1 }),
    p("uncommon", "Shot ATK", { shotAttack: 5 }),
    p("rare", "Shot Speed", { shotSpeed: 6 }),
    p("epic", "Crit Chance", { critChance: 2 }),
    p("legendary", "Crit Factor", { critFactor: 5 }),
    p("mythic", "Charge Shot", { chargeShot: 10 }),
    p("mythic", "Instakill Bounty", { archerInstakillGold: 5 }),
  ],
  atkUp: [
    p("base", "Attack", { foeAttack: 2 }),
    p("common", "ATK Shards", { attackShard: 5 }),
    p("uncommon", "Free Offense", { freeOffenseChance: 1 }),
    p("rare", "Crit Chance", { critChance: 1 }),
    p("epic", "Shard Gold", { attackShardGold: 10 }),
    p("legendary", "Gold Bonus", { goldBonus: 1 }),
    p("mythic", "Takedown", { takedown: 2.5 }),
  ],
  defUp: [
    p("base", "Defense", { foeDefense: 2 }),
    p("common", "DEF Shards", { defenseShard: 5 }),
    p("uncommon", "Free Defense", { freeDefenseChance: 1 }),
    p("rare", "Parry", { parry: 1 }),
    p("epic", "Shard Gold", { defenseShardGold: 10 }),
    p("legendary", "Gold Bonus", { goldBonus: 1 }),
    p("mythic", "Tangle", { tangle: 5 }),
  ],
  torch: [
    p("base", "Torch Loot", { torchGold: 0.1, torchSilver: 0.1 }),
    p("common", "Greater Boss Gold", { bossGold: 2 }),
    p("uncommon", "Greater Boss Lore", { bossCells: 1 }),
    p("rare", "Chest Lore chance", { chestCells: 1 }),
    p("epic", "Greater Boss Tangle", { greaterTangle: 3 }),
    p("legendary", "Greater Boss Takedown", { greaterTakedown: 3 }),
    p("mythic", "Revive chance", { reviveChance: 0.5 }),
  ],
  chest: [
    p("base", "Chest Gold", { chestGold: 1 }),
    p("common", "Supply Chest chance", { supplyChance: 0.2 }),
    p("uncommon", "Equipment Chest chance", { equipmentChance: 0.1 }),
    p("rare", "Double chance", { chestDouble: 3 }),
    p("epic", "Triple chance", { chestTriple: 2 }),
    p("legendary", "Treasure Floor chance", { treasureFloor: 0.3 }),
    p("mythic", "Rarity Up chance", { rarityUp: 0.5 }),
  ],
  gem: [
    p("base", "Seconds off the Gem cooldown", { gemBankSpeed: 3 }),
    p("common", "Gem Card XP", { gemXp: 110 }),
    p("uncommon", "Gem a floor chance", { gemChance: 0.3 }),
    p("rare", "Golden Gem chance", { goldenGem: 1 }),
    p("epic", "Gem rewards banked", { gemBank: 0.5 }),
    p("legendary", "Gem in a chest chance", { chestGem: 0.5 }),
    p("mythic", "Stellar Gem chance", { stellarGem: 2 }),
  ],
};

/** Card `card`'s powers (none for a card without any yet). */
export const powersOf = (card: CardId): readonly CardPower[] => CARD_POWERS[card] ?? [];

/** The levels of `power` a card at `level` holds: every level for a base
 * power, and for the rest those of the card's levels in its rarity's band
 * (common 1 to 10, uncommon 11 to 20, …), up to ten. */
export function powerLevel(power: CardPower, level: number) {
  if (power.rarity === "base") return level;
  return Math.max(0, Math.min(LEVELS_PER_RARITY, level - firstLevelOf(power.rarity) + 1));
}

/** What `power` gives at its `levels`: each stat's amount, first first. */
export const powerAmounts = (power: CardPower, levels: number) =>
  (Object.entries(power.stats) as [PowerStat, number][]).map(([stat, each]) => [stat, snap(each * levels)] as const);

/** The cards' levels a bonus is read from: a run's copy of its hand's
 * (`run.handLevels`), or the save's for the cards asked about. A card
 * left out is at level 0. */
export type CardLevels = Partial<Record<CardId, number>>;

/** The levels of the cards `cards` in the save, those at 0 left out. */
export function levelsOf(save: CardLevelSave, cards: Iterable<CardId>): CardLevels {
  const out: CardLevels = {};
  for (const card of new Set(cards)) {
    const { level } = levelIn(save, card);
    if (level) out[card] = level;
  }
  return out;
}

/** What the cards' powers give, each stat summed over every card's powers
 * (0 for a stat none raises). */
export type PowerBonus = Record<PowerStat, number>;
const NO_BONUS = Object.freeze(Object.fromEntries(
  ["floorGold", "floorSilver", "goldBonus", "silverBonus", "freeOffense", "freeDefense", "freeUtility", "freeOffenseChance", "freeDefenseChance", "freeUtilityChance", "floorHeal", "overhealMax", "stairSkip", "percentPotions", "potionHeal", "potionMaxHp", "potionSilver", "regen", "shroud", "parry", "reviveChance",
    "doorCost", "doorGold", "doorSilver", "doorHeal", "skeletonKey", "lockPick", "secretKnock", "doorChest", ...doorLockStats(DOOR_LOCK_PARTS), "yellowLockHeal", "yellowTransmute", "woodTransmute", "heartLockCost", "heartLockPick", "heartShroud", "woodKeyCost", "woodDurability", "druidKey", "keyChest", "keyFind", "keyGold", "keyHeal", "keyOverheal", "keySilver", "plainDoorCost", "heartDoorCost", "doubleKey", "masterKey",
    ...colorKeyStats(COLOR_KEY_PARTS), ...tradeStats(TRADE_PARTS), ...smeltStats(SMELT_PARTS), "keySmelter", ...foeCardStats(FOE_PARTS), "maxHp", "foeAttack", "foeDefense", "foeGold", "foeSilver", "critChance", "critFactor", "killXp", "surpriseAttack", "foeAttackCut", "stealOverheal", "moreEnemies", "attackShard", "defenseShard", "attackShardGold", "defenseShardGold",
    "attackShardSilver", "defenseShardSilver", "powerStrike", "takedown", "tangle", "greaterTakedown", "greaterTangle",
    "bossAttack", "bossDefense", "bossShroud", "bossGold", "bossCells", "chestGold", "chestSilver", "chestCells", "supplyChance", "equipmentChance", "treasureFloor", "rarityUp", "chestDouble", "chestTriple",
    "shotAttack", "bossShotAttack", "shotSpeed", "shotRange", "chargeShot", "floorRuby", "bossRubies", "levelSkipBoost", "torchGold", "torchSilver", "yellowToWood", ...GEM_STATS].map((s) => [s, 0]),
)) as PowerBonus;
/** What the powers of the cards at `levels` (a run's `handLevels`) give, added up. */
export function powerBonus(levels: CardLevels | undefined): PowerBonus {
  const bonus: PowerBonus = { ...NO_BONUS };
  for (const [card, level] of Object.entries(levels ?? {}) as [CardId, number][])
    for (const power of powersOf(card)) {
      const n = powerLevel(power, level);
      if (n) for (const [stat, amount] of powerAmounts(power, n)) bonus[stat] = snap(bonus[stat] + amount);
    }
  return bonus;
}
/** A percent stat's card factor: ×(100 + its percents) / 100. */
export const powerFactor = (bonus: PowerBonus, stat: PowerStat) => (bonus[stat] ? snap((100 + bonus[stat]) / 100) : 1);
/** What `run`'s floors add (enemies/more-enemies.ts): its More Enemies
 * badges' (no card power raises Spawn Rate now). */
export function runExtras(run: Pick<RunCore, "badges">) {
  return extraEnemies(run.badges, 0, {});
}
/** The percent `run`'s enemies' ATK is cut by (ENEMY's Enemy ATK). */
export const runFoeCut = (run: Pick<RunCore, "handLevels">) => powerBonus(run.handLevels).foeAttackCut;
/** What `run`'s cards' powers multiply hero stat `stat` by: Max HP, added into one factor. */
export const powerHeroFactor = (run: Pick<RunCore, "handLevels">, stat: string) => (stat === "maxHp" ? powerFactor(powerBonus(run.handLevels), "maxHp") : 1);
/** Two percents more of a thing as two factors, multiplied: as one percent. */
export const compounded = (a: number, b: number) => (a && b ? snap(((100 + a) * (100 + b)) / 100 - 100) : snap(a + b));
/** What each Free Upgrade group's chance a floor is multiplied by (STAIRS'
 * tree), as `rollFreeTraining` takes it. */
export const freeUpFactors = (bonus: PowerBonus) =>
  ({ offense: powerFactor(bonus, "freeOffense"), defense: powerFactor(bonus, "freeDefense"), utility: powerFactor(bonus, "freeUtility") });
/** The chances each Free Upgrade group also rolls a floor, in hundredths of
 * a percent (ATK UP's Free Offense, HEAL's and DEF UP's Free Defense,
 * DOOR's and KEY's Free Utility), as
 * `rollFreeTraining` takes them. */
export function freeUpChances(bonus: PowerBonus) {
  const chances = { ...(bonus.freeOffenseChance ? { offense: snap(bonus.freeOffenseChance * 100) } : {}), ...(bonus.freeDefenseChance ? { defense: snap(bonus.freeDefenseChance * 100) } : {}), ...(bonus.freeUtilityChance ? { utility: snap(bonus.freeUtilityChance * 100) } : {}) };
  return Object.keys(chances).length ? chances : undefined;
}
/** The Overheal ceiling `overheal` (in thousandths of max HP, Overheal
 * training's) with the trees' Overheal Max percents of max HP added, skill
 * or not (STAIRS' and HEAL's legendary nodes, which open a ceiling above
 * max HP by themselves). */
export const powerOverheal = (overheal: number, bonus: PowerBonus) => (bonus.overhealMax ? snap(overheal + bonus.overhealMax * 10) : overheal);

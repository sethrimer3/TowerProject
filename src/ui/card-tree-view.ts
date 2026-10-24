/** A card's tree as the player meets it: its nodes for the living graph
 * (`cardTreeGraph`, drawn by `upgrade-graph.ts`), what each node does in
 * words (`nodeName`, `statText`), and the card of the node picked in it
 * (`cardTreeCardHtml`). The tree itself comes from `cards/trees.ts`. */
import { CARDS, type CardId } from "../cards/cards.ts";
import { CARD_TREES, cardLook, nodeCap, nodeLevel, nodeOpen, opensAt, treeNode, type CardOpened, type CardTreeLevels, type CardTreeNode, type ColorKeyPart, type ColorKeyStat, type DoorLockPart, type DoorLockStat, type FoeCardStat, type FoePart, type FoeTreeCard, type TradeColor, type TradePart, type TradeStat, type TreeStat } from "../cards/trees.ts";
import type { DoorKind } from "../doors.ts";
import type { KeyColor } from "../entities.ts";
import { CARD_RARITY_NAMES, type CardRarity } from "../cards/rarity.ts";
import { rarityFrameHtml, rarityStarsHtml } from "./card-level-marks.ts";
import { snap } from "../exact.ts";
import { cardArt, cellIcon, itemSprite, uiSprite, type UiSprite } from "./dom.ts";
import type { GraphNode } from "./upgrade-graph.ts";

/** The id of a tree's root node: the card itself. */
export const ROOT = "card";

/** One entry for each key colour's own stats (`ColorKeyStat`), `each`
 * giving a colour's, by part, from the colour and its capitalized word. */
function byKeyColor<T>(each: (color: KeyColor, word: string) => Record<ColorKeyPart, T>) {
  const words: Record<KeyColor, string> = { yellow: "Gold", blue: "Blue", red: "Red" };
  return Object.fromEntries((Object.keys(words) as KeyColor[]).flatMap((color) =>
    Object.entries(each(color, words[color])).map(([part, value]) => [`${color}${part}`, value]))) as Record<ColorKeyStat, T>;
}

/** One entry for each key trader's own stats (`TradeStat`), `each` giving
 * a trader's, by part, from the colour it trades for and that colour's
 * capitalized word. */
function byTrade<T>(each: (color: TradeColor, word: string) => Record<TradePart, T>) {
  const words: Record<TradeColor, string> = { blue: "Blue", red: "Red" };
  return Object.fromEntries((Object.keys(words) as TradeColor[]).flatMap((color) =>
    Object.entries(each(color, words[color])).map(([part, value]) => [`${color}${part}`, value]))) as Record<TradeStat, T>;
}

/** How each door card's doors are named in its stats' words: one, many,
 * and the word its nodes' names start with. */
const DOOR_WORDS: Record<DoorKind, { one: string; many: string; word: string }> = {
  yellow: { one: "door with a gold lock", many: "doors with a gold lock", word: "Gold" },
  heart: { one: "Heart Door", many: "Heart Doors", word: "Heart" },
  wood: { one: "Wooden Door", many: "Wooden Doors", word: "Wooden" },
};
/** One entry for each door card's own stats (`DoorLockStat`), `each`
 * giving a card's, by part, from its kind and its doors' words. */
function byDoorLock<T>(each: (kind: DoorKind, words: (typeof DOOR_WORDS)[DoorKind]) => Record<DoorLockPart, T>) {
  return Object.fromEntries((Object.keys(DOOR_WORDS) as DoorKind[]).flatMap((kind) =>
    Object.entries(each(kind, DOOR_WORDS[kind])).map(([part, value]) => [`${kind}Lock${part}`, value]))) as Record<DoorLockStat, T>;
}

/** How each enemy card's enemies are named in its stats' words: one with
 * its article (`a`), one without (`one`), and many. */
const FOE_WORDS: Record<FoeTreeCard, { a: string; one: string; many: string }> = {
  weakEnemy: { a: "a weak enemy", one: "weak enemy", many: "weak enemies" },
  baseEnemy: { a: "a base enemy", one: "base enemy", many: "base enemies" },
  strongEnemy: { a: "a strong enemy", one: "strong enemy", many: "strong enemies" },
  eliteEnemy: { a: "an elite enemy", one: "elite enemy", many: "elite enemies" },
  bossEnemy: { a: "a boss or Greater Boss", one: "boss or Greater Boss", many: "bosses and Greater Bosses" },
  nonBossEnemy: { a: "a non-boss enemy", one: "non-boss enemy", many: "non-boss enemies" },
  fastEnemy: { a: "a Fast enemy", one: "Fast enemy", many: "Fast enemies" },
  flyingEnemy: { a: "a Flying enemy", one: "Flying enemy", many: "Flying enemies" },
  archer: { a: "an enemy", one: "enemy", many: "enemies" },
};
/** One entry for each enemy card's own stats (`FoeCardStat`), `each`
 * giving a card's, by part, from its enemies' words. */
function byFoeCard<T>(each: (words: (typeof FOE_WORDS)[FoeTreeCard]) => Record<FoePart, T>) {
  return Object.fromEntries((Object.keys(FOE_WORDS) as FoeTreeCard[]).flatMap((card) =>
    Object.entries(each(FOE_WORDS[card])).map(([part, value]) => [`${card}${part}`, value]))) as Record<FoeCardStat, T>;
}

/** What each stat is called, as a node's name. */
const STAT_NAMES: Record<TreeStat, string> = {
  floorGold: "Spare Change", floorSilver: "Wishing Well", goldBonus: "Gold Bonus", silverBonus: "Silver Bonus",
  freeOffense: "Free Offense", freeDefense: "Free Defense", freeUtility: "Free Utility", freeOffenseChance: "Free Offense", freeDefenseChance: "Free Defense", freeUtilityChance: "Free Utility",
  floorHeal: "Floor Heal", overhealMax: "Overheal Max", stairSkip: "Stair Skip", percentPotions: "Percent Potions", potionHeal: "Potion Heal", potionMaxHp: "Potion Vigor",
  potionSilver: "Potion Silver", regen: "Regen", shroud: "Shroud", parry: "Parry", reviveChance: "Revive",
  doorCost: "Door Cost", doorGold: "Door Gold", doorSilver: "Door Silver", doorHeal: "Door Heal",
  skeletonKey: "Skeleton Key", lockPick: "Lock Pick", secretKnock: "Secret Knock", doorChest: "Door Chest",
  ...byDoorLock((kind, { word }) => ({ Gold: `${word} Door Gold`, Silver: `${word} Door Silver`, Chest: `${word} Door Chest`, Knock: { yellow: "Gold Knock", heart: "Heart Knock", wood: "Wooden Lock Pick" }[kind] })),
  yellowLockHeal: "Gold Door Heal", yellowTransmute: "Gold Door Transmute", woodTransmute: "Wooden Door Transmute",
  heartLockCost: "Heart Door Cost", heartLockPick: "Heart Lock Pick", heartShroud: "Shroud Growth", woodKeyCost: "Wooden Key Cost", woodDurability: "Durability", druidKey: "Druidic Talent", keyChest: "Key Chest", keyFind: "Key Find", keyGold: "Key Gold",
  keyHeal: "Key Heal", keyOverheal: "Key Overheal", keySilver: "Key Silver", plainDoorCost: "Plain Doors", heartDoorCost: "Heart Doors", doubleKey: "Locksmith", masterKey: "Master Key",
  ...byKeyColor((_, word) => ({ KeyHeal: `${word} Key Heal`, KeyOverheal: `${word} Key Overheal`, KeyGold: `${word} Key Gold`, KeyFind: `${word} Key Find`, KeySilver: `${word} Key Silver`,
    KeyChest: `${word} Key Chest`, DoorCost: `${word} Key Cost`, DoubleKey: `Locksmith ${word}`, MasterKey: `Master ${word} Key` })),
  ...byTrade((_, word) => ({ TradeCost: "Efficiency", TradeFreeUtility: "Free Utility", FloorKey: `Extra ${word} Key`, Forge: `${word} Forge`, Smelter: `Master ${word} Smelter` })),
  ...byFoeCard(() => ({ Gold: "Bounty", InstakillGold: "Instakill Bounty", Silver: "Spoils", Attack: "Attack", Defense: "Defense", Shroud: "Shroud", CritChance: "Crit Chance", CritFactor: "Crit Factor",
    KillXp: "Kill XP", SpawnRate: "Spawn Rate", Material: "Salvage", InstakillMaterial: "Instakill Salvage", Equipment: "Equipment Drop", InstakillMaxHp: "Instakill Vigor",
    StealOverheal: "Lifesteal Overheal", SurpriseAttack: "Surprise Attack", Cells: "Cells", Takedown: "Takedown", Tangle: "Tangle", FirstStrike: "First Strike", ChargeShot: "Charge Shot" })),
  maxHp: "Max HP",
  foeAttack: "Attack", foeDefense: "Defense", foeGold: "Bounty", foeSilver: "Spoils", moreEnemies: "Spawn Rate",
  critChance: "Crit Chance", critFactor: "Crit Factor", killXp: "Kill XP", surpriseAttack: "Surprise Attack", foeAttackCut: "Weaken", stealOverheal: "Lifesteal Overheal",
  attackShard: "Sharper Shards", defenseShard: "Sturdier Shards", attackShardGold: "Shard Gold", defenseShardGold: "Shard Gold",
  attackShardSilver: "Shard Silver", defenseShardSilver: "Shard Silver", powerStrike: "Power Strike",
  takedown: "Takedown", tangle: "Tangle", greaterTakedown: "Greater Takedown", greaterTangle: "Greater Tangle",
  bossAttack: "Boss Attack", bossDefense: "Boss Defense", bossShroud: "Boss Shroud", bossGold: "Boss Bounty", bossCells: "Boss Cells",
  chestGold: "Chest Gold", chestSilver: "Chest Silver", chestCells: "Chest Cells", supplyChance: "Supply Chests", equipmentChance: "Equipment Chests",
  treasureFloor: "Treasure Floor", rarityUp: "Rarity Up", chestDouble: "Double", chestTriple: "Triple",
  shotAttack: "Shot ATK", bossShotAttack: "Boss Shot", shotSpeed: "Shot Speed", shotRange: "Range", chargeShot: "Charge Shot",
};

/** Names of nodes raising more than one stat, short enough to sit under them. */
const NODE_NAMES: Record<string, string> = { "yellowDoor.lockPick": "Gold Lock Pick", "eliteEnemy.freeUpgrade": "Free Upgrade", "nonBossEnemy.freeUpgrade": "Free Upgrade" };

/** What `n` of each stat does, a line. */
const STAT_TEXT: Record<TreeStat, (n: string) => string> = {
  floorGold: (n) => `+${n}% Spare Change Gold on each floor`,
  floorSilver: (n) => `+${n}% Wishing Well Silver on each floor`,
  goldBonus: (n) => `+${n}% Gold Bonus`,
  silverBonus: (n) => `+${n}% Silver Bonus`,
  freeOffense: (n) => `+${n}% Free Offense Upgrade chance`,
  freeDefense: (n) => `+${n}% Free Defense Upgrade chance`,
  freeUtility: (n) => `+${n}% Free Utility Upgrade chance`,
  freeOffenseChance: (n) => `+${n}% Free Offense Upgrade chance, trained or not`,
  freeDefenseChance: (n) => `+${n}% Free Defense Upgrade chance, trained or not`,
  freeUtilityChance: (n) => `+${n}% Free Utility Upgrade chance, trained or not`,
  floorHeal: (n) => `Heals ${n}% of max HP on each floor`,
  overhealMax: (n) => `+${n}% of max HP on the Overheal ceiling, Overheal owned or not`,
  stairSkip: (n) => `${n}% chance the Tower's stairs climb two floors`,
  percentPotions: (n) => `+${n}% chance each potion is a percent potion`,
  potionHeal: (n) => `+${n}% HP from every potion`,
  potionMaxHp: (n) => `+${n}% max HP for the run each time a potion is reached`,
  potionSilver: (n) => `+${n} Silver from each potion`,
  regen: (n) => `+${n}% Regen`,
  shroud: (n) => `+${n}% shroud against every enemy`,
  parry: (n) => `+${n}% Parry, owned or not`,
  doorCost: (n) => `−${n}% of each key every door takes`,
  doorGold: (n) => `+${n}% Gold from doors`,
  doorSilver: (n) => `+${n} Silver from each door opened`,
  doorHeal: (n) => `Heals ${n}% of max HP on opening each door`,
  skeletonKey: (n) => `${n}% chance each colour door on a floor is a Wooden Door`,
  lockPick: (n) => `${n}% chance each door of two or three colours loses its rarest lock`,
  secretKnock: (n) => `${n}% chance a door opens for nothing: no keys, no HP`,
  doorChest: (n) => `${n}% chance an opened door leaves a treasure chest`,
  ...byDoorLock((_, { one, many }): Record<DoorLockPart, (n: string) => string> => ({
    Gold: (n) => `+${n}% Gold from ${many}`,
    Silver: (n) => `+${n} Silver from each ${one} opened`,
    Chest: (n) => `${n}% chance an opened ${one} leaves a treasure chest`,
    Knock: (n) => `${n}% chance a ${one} opens for nothing: no keys, no HP`,
  })),
  yellowLockHeal: (n) => `Heals ${n}% of max HP on opening each door with a gold lock`,
  yellowTransmute: (n) => `${n}% chance each Wooden and Steel Door on a floor is a Gold Door`,
  woodTransmute: (n) => `${n}% chance each Heart Door taking no keys on a floor is a Wooden Door`,
  heartLockCost: (n) => `−${n}% of the HP each Heart Door drains`,
  heartLockPick: (n) => `${n}% chance each Heart Door taking keys on a floor loses its drain`,
  heartShroud: (n) => `+${n}% shroud against every enemy for the run, each Heart Door's drain paid`,
  woodKeyCost: (n) => `−${n}% of the key each Wooden Door takes`,
  woodDurability: (n) => `−${n}% of the HP breaking down each Wooden Door takes`,
  druidKey: (n) => `${n}% chance an opened Wooden Door gives a gold key`,
  keyChest: (n) => `${n}% chance a key picked up leaves a treasure chest`,
  keyFind: (n) => `+${n}% more each key of every colour`,
  keyGold: (n) => `+${n}% Gold from each key`,
  keyHeal: (n) => `Heals ${n}% of max HP on picking up each key`,
  keyOverheal: (n) => `Heals ${n}% of the HP ceiling, Overheal included, on picking up each key`,
  keySilver: (n) => `+${n} Silver from each key picked up`,
  plainDoorCost: (n) => `−${n}% of the key or HP each Wooden and Steel Door takes`,
  heartDoorCost: (n) => `−${n}% of the keys and HP each Heart Door takes`,
  doubleKey: (n) => `${n}% chance a key picked up is two`,
  masterKey: (n) => `${n}% chance a key picked up opens every door on its floor`,
  ...byKeyColor((_, word): Record<ColorKeyPart, (n: string) => string> => {
    const color = word.toLowerCase();
    return {
    KeyHeal: (n) => `Heals ${n}% of max HP on picking up each ${color} key`,
    KeyOverheal: (n) => `Heals ${n}% of the HP ceiling, Overheal included, on picking up each ${color} key`,
    KeyGold: (n) => `+${n}% Gold from each ${color} key`,
    KeyFind: (n) => `+${n}% more each ${color} key`,
    KeySilver: (n) => `+${n} Silver from each ${color} key picked up`,
    KeyChest: (n) => `${n}% chance a ${color} key picked up leaves a treasure chest`,
    DoorCost: (n) => `−${n}% of each ${color} key a door takes`,
    DoubleKey: (n) => `${n}% chance a ${color} key picked up is two`,
    MasterKey: (n) => `${n}% chance a ${color} key picked up opens every door with a ${color} lock on its floor`,
    };
  }),
  ...byTrade((color, word): Record<TradePart, (n: string) => string> => ({
    TradeCost: (n) => `−${n}% of the keys each trade for a ${color} key takes`,
    TradeFreeUtility: (n) => `${n}% chance of a free Utility level with each trade for a ${color} key, trained or not`,
    FloorKey: (n) => `${n}% chance of a ${color} key on each floor new to the run`,
    Forge: (n) => `${n}% chance a trade for a ${color} key gives a second`,
    Smelter: (n) => `${n}% chance a ${word} Forge gives a third ${color} key`,
  })),
  ...byFoeCard(({ a, one, many }): Record<FoePart, (n: string) => string> => ({
    Gold: (n) => `+${n}% Gold from each ${one} killed`,
    InstakillGold: (n) => `+${n}% Gold from each Instakill of ${a}`,
    Silver: (n) => `+${n} Silver from each ${one} killed`,
    Attack: (n) => `+${n}% ATK against ${many}`,
    Defense: (n) => `+${n}% DEF against ${many}`,
    Shroud: (n) => `+${n}% shroud against ${many}`,
    CritChance: (n) => `+${n}% Crit % chance against ${many}`,
    CritFactor: (n) => `+${n}% Crit x factor against ${many}`,
    KillXp: (n) => `+${n}% XP from each ${one} killed`,
    SpawnRate: (n) => `+${n}% more ${many} on each floor`,
    Material: (n) => `${n}% chance each ${one} killed drops upgrade materials`,
    InstakillMaterial: (n) => `${n}% chance each Instakill of ${a} drops upgrade materials`,
    Equipment: (n) => `${n}% chance each ${one} killed drops a piece of equipment`,
    InstakillMaxHp: (n) => `+${n}% max HP for the run with each Instakill of ${a}`,
    StealOverheal: (n) => `Lifesteal heals up to ${n}% above max HP against ${many}`,
    SurpriseAttack: (n) => `${n}% chance the first strike of a fight with ${a} right after a Dash deals twice your ATK`,
    Cells: (n) => `+${n} Cell${n === "1" ? "" : "s"} from each ${one} killed`,
    Takedown: (n) => `${a[0]!.toUpperCase()}${a.slice(1)} loses ${n}% of its max HP as a fight with it begins`,
    Tangle: (n) => `${a[0]!.toUpperCase()}${a.slice(1)} loses ${n}% of its ATK as a fight with it begins`,
    FirstStrike: (n) => `${n}% chance ${a} loses its first strike: you strike first`,
    ChargeShot: (n) => `+${n}% Charged Shot against ${many}`,
  })),
  maxHp: (n) => `+${n}% max HP`,
  foeAttack: (n) => `+${n}% ATK against every enemy`,
  foeDefense: (n) => `+${n}% DEF against every enemy`,
  foeGold: (n) => `+${n}% Gold from every kill`,
  foeSilver: (n) => `+${n}% Silver from every kill`,
  critChance: (n) => `+${n}% Crit % chance`,
  critFactor: (n) => `+${n}% Crit x factor`,
  killXp: (n) => `+${n}% XP from every kill`,
  surpriseAttack: (n) => `${n}% chance the first strike of a fight right after a Dash deals twice your ATK`,
  foeAttackCut: (n) => `−${n}% ATK for every enemy`,
  stealOverheal: (n) => `Lifesteal heals up to ${n}% above max HP`,
  moreEnemies: (n) => `+${n}% more enemies on each floor`,
  attackShard: (n) => `+${n}% from each ATK shard`,
  defenseShard: (n) => `+${n}% from each DEF shard`,
  attackShardGold: (n) => `+${n}% Gold from each ATK shard`,
  defenseShardGold: (n) => `+${n}% Gold from each DEF shard`,
  attackShardSilver: (n) => `+${n} Silver from each ATK shard taken`,
  defenseShardSilver: (n) => `+${n} Silver from each DEF shard taken`,
  powerStrike: (n) => `${n}% chance an ATK shard taken charges your next fight with twice your ATK`,
  takedown: (n) => `A boss loses ${n}% of its max HP as a fight with it begins`,
  tangle: (n) => `A boss loses ${n}% of its ATK as a fight with it begins`,
  greaterTakedown: (n) => `A Greater Boss loses ${n}% of its max HP as a fight with it begins`,
  greaterTangle: (n) => `A Greater Boss loses ${n}% of its ATK as a fight with it begins`,
  reviveChance: (n) => `+${n}% Revive chance`,
  bossAttack: (n) => `+${n}% ATK against a Greater Boss`,
  bossDefense: (n) => `+${n}% DEF against a Greater Boss`,
  bossShroud: (n) => `+${n}% shroud against a Greater Boss`,
  bossGold: (n) => `+${n}% Gold from a Greater Boss`,
  bossCells: (n) => `+${n} Cell${n === "1" ? "" : "s"} from each Greater Boss`,
  chestGold: (n) => `+${n}% Gold from treasure chests`,
  chestSilver: (n) => `+${n} Silver from each treasure chest opened`,
  chestCells: (n) => `${n}% chance a treasure chest holds a Greater Boss's Cells`,
  treasureFloor: (n) => `${n}% chance each floor is a Treasure Floor: its shards and potions are treasure chests`,
  rarityUp: (n) => `${n}% chance an Equipment Chest's piece is a rarity higher`,
  chestDouble: (n) => `${n}% chance a treasure chest pays twice over`,
  chestTriple: (n) => `${n}% chance a treasure chest pays three times over`,
  supplyChance: (n) => `+${n}% Supply Chest chance`,
  equipmentChance: (n) => `+${n}% Equipment Chest chance`,
  shotAttack: (n) => `+${n}% Shot ATK`,
  bossShotAttack: (n) => `+${n}% Shot ATK against bosses and Greater Bosses`,
  shotSpeed: (n) => `+${n}% Attack Speed`,
  shotRange: (n) => `+${n}% Attack Range for your arrows`,
  chargeShot: (n) => `+${n}% Charged Shot`,
};

/** How a stat's amount reads: a bonus added (`+%`, or `+` for a count),
 * a cut (`−%`), or a chance or share (`%`). */
type Unit = "+%" | "−%" | "%" | "+";
/** What each stat raises, in a few words, and how its amount reads: the
 * one line a node's details give it (how and when it works is behind the
 * details' ? button, in `STAT_TEXT`'s words). */
const STAT_LINES: Record<TreeStat, [string, Unit]> = {
  floorGold: ["Spare Change", "+%"], floorSilver: ["Wishing Well", "+%"], goldBonus: ["Gold Bonus", "+%"], silverBonus: ["Silver Bonus", "+%"],
  freeOffense: ["Free Offense Upgrade chance", "+%"], freeDefense: ["Free Defense Upgrade chance", "+%"], freeUtility: ["Free Utility Upgrade chance", "+%"],
  freeOffenseChance: ["Free Offense Upgrade chance", "+%"], freeDefenseChance: ["Free Defense Upgrade chance", "+%"], freeUtilityChance: ["Free Utility Upgrade chance", "+%"],
  floorHeal: ["Floor Heal", "%"], overhealMax: ["Overheal ceiling", "+%"], stairSkip: ["Stair Skip chance", "%"], percentPotions: ["Percent potion chance", "+%"],
  potionHeal: ["Potion healing", "+%"], potionMaxHp: ["Max HP per potion", "+%"], potionSilver: ["Silver per potion", "+"],
  regen: ["Regen", "+%"], shroud: ["Shroud", "+%"], parry: ["Parry", "+%"], reviveChance: ["Revive chance", "+%"],
  doorCost: ["Door key cost", "−%"], doorGold: ["Door Gold", "+%"], doorSilver: ["Silver per door", "+"], doorHeal: ["Door Heal", "%"],
  skeletonKey: ["Skeleton Key chance", "%"], lockPick: ["Lock Pick chance", "%"], secretKnock: ["Secret Knock chance", "%"], doorChest: ["Door Chest chance", "%"],
  ...byDoorLock((kind, { one, word }): Record<DoorLockPart, [string, Unit]> => ({
    Gold: [`${word} Door Gold`, "+%"], Silver: [`Silver per ${one}`, "+"], Chest: [`${word} Door Chest chance`, "%"],
    Knock: [`${{ yellow: "Gold Knock", heart: "Heart Knock", wood: "Wooden Lock Pick" }[kind]} chance`, "%"],
  })),
  yellowLockHeal: ["Gold Door Heal", "%"], yellowTransmute: ["Gold Door Transmute chance", "%"], woodTransmute: ["Wooden Door Transmute chance", "%"],
  heartLockCost: ["Heart Door drain", "−%"], heartLockPick: ["Heart Lock Pick chance", "%"], heartShroud: ["Shroud per Heart Door", "+%"],
  woodKeyCost: ["Wooden Door key cost", "−%"], woodDurability: ["Wooden Door durability", "−%"], druidKey: ["Druidic Talent chance", "%"],
  keyChest: ["Key Chest chance", "%"], keyFind: ["Keys found", "+%"], keyGold: ["Key Gold", "+%"], keyHeal: ["Key Heal", "%"], keyOverheal: ["Key Overheal", "%"], keySilver: ["Silver per key", "+"],
  plainDoorCost: ["Wooden and Steel Door cost", "−%"], heartDoorCost: ["Heart Door cost", "−%"], doubleKey: ["Locksmith chance", "%"], masterKey: ["Master Key chance", "%"],
  ...byKeyColor((_, word): Record<ColorKeyPart, [string, Unit]> => ({
    KeyHeal: [`${word} Key Heal`, "%"], KeyOverheal: [`${word} Key Overheal`, "%"], KeyGold: [`${word} Key Gold`, "+%"], KeyFind: [`${word} keys found`, "+%"],
    KeySilver: [`Silver per ${word.toLowerCase()} key`, "+"], KeyChest: [`${word} Key Chest chance`, "%"], DoorCost: [`${word} key cost`, "−%"],
    DoubleKey: [`Locksmith ${word} chance`, "%"], MasterKey: [`Master ${word} Key chance`, "%"],
  })),
  ...byTrade((color, word): Record<TradePart, [string, Unit]> => ({
    TradeCost: ["Keys per trade", "−%"], TradeFreeUtility: ["Free Utility chance per trade", "%"], FloorKey: [`Extra ${color} key chance`, "%"],
    Forge: [`${word} Forge chance`, "%"], Smelter: [`Master ${word} Smelter chance`, "%"],
  })),
  ...byFoeCard(({ one, many }): Record<FoePart, [string, Unit]> => ({
    Gold: [`Gold from ${many}`, "+%"], InstakillGold: ["Instakill Gold", "+%"], Silver: [`Silver per ${one}`, "+"],
    Attack: [`ATK vs ${many}`, "+%"], Defense: [`DEF vs ${many}`, "+%"], Shroud: [`Shroud vs ${many}`, "+%"], CritChance: [`Crit % vs ${many}`, "+%"], CritFactor: [`Crit x vs ${many}`, "+%"],
    KillXp: [`XP from ${many}`, "+%"], SpawnRate: [`${many[0]!.toUpperCase()}${many.slice(1)} per floor`, "+%"], Material: ["Salvage chance", "%"], InstakillMaterial: ["Instakill Salvage chance", "%"],
    Equipment: ["Equipment drop chance", "%"], InstakillMaxHp: ["Max HP per Instakill", "+%"], StealOverheal: ["Lifesteal Overheal", "%"], SurpriseAttack: ["Surprise Attack chance", "%"],
    Cells: [`Cells per ${one}`, "+"], Takedown: ["Takedown", "%"], Tangle: ["Tangle", "%"], FirstStrike: ["First Strike chance", "%"], ChargeShot: [`Charged Shot vs ${many}`, "+%"],
  })),
  maxHp: ["Max HP", "+%"],
  foeAttack: ["ATK vs enemies", "+%"], foeDefense: ["DEF vs enemies", "+%"], foeGold: ["Kill Gold", "+%"], foeSilver: ["Kill Silver", "+%"], moreEnemies: ["Enemies per floor", "+%"],
  critChance: ["Crit %", "+%"], critFactor: ["Crit x", "+%"], killXp: ["Kill XP", "+%"], surpriseAttack: ["Surprise Attack chance", "%"], foeAttackCut: ["Enemy ATK", "−%"], stealOverheal: ["Lifesteal Overheal", "%"],
  attackShard: ["ATK shards", "+%"], defenseShard: ["DEF shards", "+%"], attackShardGold: ["ATK shard Gold", "+%"], defenseShardGold: ["DEF shard Gold", "+%"],
  attackShardSilver: ["Silver per ATK shard", "+"], defenseShardSilver: ["Silver per DEF shard", "+"], powerStrike: ["Power Strike chance", "%"],
  takedown: ["Boss Takedown", "%"], tangle: ["Boss Tangle", "%"], greaterTakedown: ["Greater Boss Takedown", "%"], greaterTangle: ["Greater Boss Tangle", "%"],
  bossAttack: ["ATK vs Greater Bosses", "+%"], bossDefense: ["DEF vs Greater Bosses", "+%"], bossShroud: ["Shroud vs Greater Bosses", "+%"], bossGold: ["Greater Boss Gold", "+%"], bossCells: ["Greater Boss Cells", "+"],
  chestGold: ["Chest Gold", "+%"], chestSilver: ["Silver per chest", "+"], chestCells: ["Chest Cells chance", "%"], supplyChance: ["Supply Chest chance", "+%"], equipmentChance: ["Equipment Chest chance", "+%"],
  treasureFloor: ["Treasure Floor chance", "%"], rarityUp: ["Rarity Up chance", "%"], chestDouble: ["Double chance", "%"], chestTriple: ["Triple chance", "%"],
  shotAttack: ["Shot ATK", "+%"], bossShotAttack: ["Shot ATK vs bosses", "+%"], shotSpeed: ["Attack Speed", "+%"], shotRange: ["Attack Range", "+%"], chargeShot: ["Charged Shot", "+%"],
};

/** Each stat's icon on its node. */
const ui = (name: UiSprite) => () => uiSprite(name);
const silver = () => uiSprite("gold", "ui-sprite silver-sprite");
const STAT_ICONS: Record<TreeStat, () => string> = {
  floorGold: ui("gold"), floorSilver: silver, goldBonus: ui("gold"), silverBonus: silver,
  freeOffense: ui("attack"), freeDefense: ui("defense"), freeUtility: ui("arrow-up"), freeOffenseChance: ui("attack"), freeDefenseChance: ui("defense"), freeUtilityChance: ui("arrow-up"),
  potionSilver: silver, regen: ui("health"), shroud: ui("log"), parry: ui("defense"), reviveChance: ui("revive"),
  floorHeal: ui("health"), overhealMax: ui("health"), stairSkip: ui("arrow-up"), percentPotions: () => itemSprite("potion_percent"), potionHeal: () => itemSprite("potion_flat"), potionMaxHp: ui("health"),
  doorCost: () => itemSprite("key_red"), doorGold: ui("gold"), doorSilver: silver, doorHeal: ui("health"),
  skeletonKey: () => itemSprite("key_yellow"), lockPick: () => itemSprite("key_blue"), secretKnock: () => itemSprite("key_red"), doorChest: () => itemSprite("chest_treasure_open"),
  ...byDoorLock((kind) => ({ Gold: ui("gold"), Silver: silver, Chest: () => itemSprite("chest_treasure_open"), Knock: kind === "heart" ? ui("health") : () => itemSprite(kind === "yellow" ? "key_yellow" : "key_red") })),
  yellowLockHeal: ui("health"), yellowTransmute: () => itemSprite("key_yellow"), woodTransmute: () => itemSprite("key_blue"),
  heartLockCost: ui("health"), heartLockPick: ui("health"), heartShroud: ui("log"), woodKeyCost: () => itemSprite("key_yellow"), woodDurability: ui("defense"), druidKey: () => itemSprite("key_yellow"), keyChest: () => itemSprite("chest_treasure_open"), keyFind: () => itemSprite("key_yellow"), keyGold: ui("gold"),
  keyHeal: ui("health"), keyOverheal: ui("health"), keySilver: silver, plainDoorCost: () => itemSprite("key_yellow"), heartDoorCost: ui("health"), doubleKey: () => itemSprite("key_blue"), masterKey: () => itemSprite("key_red"),
  ...byKeyColor((color) => {
    const key = () => itemSprite(`key_${color}`);
    return { KeyHeal: ui("health"), KeyOverheal: ui("health"), KeyGold: ui("gold"), KeyFind: key, KeySilver: silver, KeyChest: () => itemSprite("chest_treasure_open"), DoorCost: key, DoubleKey: key, MasterKey: key };
  }),
  ...byTrade((color) => {
    const key = () => itemSprite(`key_${color}`);
    return { TradeCost: key, TradeFreeUtility: ui("arrow-up"), FloorKey: key, Forge: key, Smelter: key };
  }),
  ...byFoeCard(() => ({ Gold: ui("gold"), InstakillGold: ui("gold"), Silver: silver, Attack: ui("attack"), Defense: ui("defense"), Shroud: ui("log"), CritChance: ui("attack"), CritFactor: ui("attack"),
    KillXp: ui("arrow-up"), SpawnRate: ui("upgrades"), Material: () => itemSprite("chest_silver"), InstakillMaterial: () => itemSprite("chest_silver"), Equipment: () => itemSprite("chest_gold"),
    InstakillMaxHp: ui("health"), StealOverheal: ui("health"), SurpriseAttack: ui("attack"), Cells: () => cellIcon(), Takedown: ui("attack"), Tangle: ui("defense"),
    FirstStrike: ui("attack"), ChargeShot: ui("attack") })),
  maxHp: ui("health"),
  foeAttack: ui("attack"), foeDefense: ui("defense"), foeGold: ui("gold"), foeSilver: silver, moreEnemies: ui("upgrades"),
  critChance: ui("attack"), critFactor: ui("attack"), killXp: ui("arrow-up"), surpriseAttack: ui("attack"), foeAttackCut: ui("defense"), stealOverheal: ui("health"),
  attackShard: () => itemSprite("upgrade_attack"), defenseShard: () => itemSprite("upgrade_defense"), attackShardGold: ui("gold"), defenseShardGold: ui("gold"),
  attackShardSilver: silver, defenseShardSilver: silver, powerStrike: () => itemSprite("upgrade_attack"),
  takedown: ui("attack"), tangle: ui("defense"), greaterTakedown: ui("attack"), greaterTangle: ui("defense"),
  bossAttack: ui("attack"), bossDefense: ui("defense"), bossShroud: ui("log"), bossGold: ui("gold"), bossCells: () => cellIcon(),
  chestGold: () => itemSprite("chest_treasure"), supplyChance: () => itemSprite("chest_silver"), equipmentChance: () => itemSprite("chest_gold"),
  chestSilver: silver, chestCells: () => cellIcon(), treasureFloor: () => itemSprite("chest_treasure"), rarityUp: () => itemSprite("chest_gold"),
  chestDouble: () => itemSprite("chest_treasure_open"), chestTriple: () => itemSprite("chest_treasure_open"),
  shotAttack: ui("attack"), bossShotAttack: ui("attack"), shotSpeed: ui("arrow-right"), shotRange: ui("arrow-right"), chargeShot: ui("attack"),
};

const ROMAN = ["", "", " II", " III", " IV", " V"];
/** A number as a node shows it: whole, or to two places at most. */
const amount = (n: number) => snap(n).toLocaleString("en-US", { maximumFractionDigits: 2 });

/** The stats node `node` raises, first first. */
const statsOf = (node: CardTreeNode) => Object.entries(node.stats) as [TreeStat, number][];

/** Node `node`'s name: its first stat's, a numeral after it for a later
 * node raising the same stat on its tree. */
export function nodeName(card: CardId, node: CardTreeNode) {
  const stats = statsOf(node);
  const base = NODE_NAMES[`${card}.${node.id}`] ?? (stats.length > 1 ? stats.map(([s]) => STAT_NAMES[s]).join(" & ") : STAT_NAMES[stats[0][0]]);
  const same = (CARD_TREES[card] ?? []).filter((n) => statsOf(n)[0]?.[0] === stats[0][0]);
  return `${base}${same.length > 1 ? ROMAN[same.indexOf(node) + 1] ?? "" : ""}`;
}

/** What `level` levels of `node` give, a line a stat. */
export function statText(node: CardTreeNode, level: number) {
  return statsOf(node).map(([stat, each]) => STAT_TEXT[stat](amount(each * level)));
}

/** Amount `n` as unit `unit` reads it (0 unsigned). */
const shownIn = (unit: Unit, n: number) => `${n && unit[0] !== "%" ? unit[0] : ""}${amount(n)}${unit.endsWith("%") ? "%" : ""}`;

/** What `level` levels of `node` give and, below its `cap`, the next
 * level: a line a stat, its few words then the amount now → next. */
export function statChange(node: CardTreeNode, level: number, cap: number) {
  return statsOf(node).map(([stat, each]) => {
    const [words, unit] = STAT_LINES[stat];
    const next = level < cap ? `<span class="training-arrow" aria-hidden="true">→</span><span class="training-box next">${shownIn(unit, each * (level + 1))}</span>` : "";
    return `<p class="ct-change"><span class="ct-target">${words}:</span><span class="training-box">${shownIn(unit, each * level)}</span>${next}</p>`;
  }).join("");
}

/** What a card's tree reads: the levels spent on it, and those card buys
 * opened on it. */
export type TreeLevels = { levels: CardTreeLevels; opened: CardOpened };

/** A node's state in the graph: holding every level opened on it
 * (`owned`), taking points now (`next`), or waiting on the node before it
 * or on a card buy of its rarity to open it (`locked`). */
export function nodeState({ levels, opened }: TreeLevels, card: CardId, node: CardTreeNode): GraphNode["state"] {
  const cap = nodeCap(opened, card, node);
  if (cap && nodeLevel(levels, card, node.id) >= cap) return "owned";
  return nodeOpen(levels, opened, card, node) ? "next" : "locked";
}

/** A node's state in words, for screen readers and the list. */
const STATE_WORDS: Record<GraphNode["state"], string> = { owned: "full", next: "available", locked: "locked" };
const article = (rarity: CardRarity) => (rarity === "uncommon" || rarity === "epic" ? "an" : "a");
/** A sealed node, in words: what it is stays hidden until a card buy opens it. */
const SEALED_WORDS = "Sealed upgrade: a card buy opens it";
/** A sealed node's face: a ? and nothing else, so what it is stays hidden. */
const SEALED_FACE = `<span class="ct-sealed-mark" aria-hidden="true">?</span>`;

/** Node `node`'s look for its rarity: its rarity, and whether card buys
 * raised it past the levels it started with (a common node then wears
 * green and a hollow star). */
const lookOf = (opened: CardOpened, card: CardId, node: CardTreeNode) => ({ rarity: node.rarity, upgraded: node.levels > 0 && nodeCap(opened, card, node) > node.levels });
/** Whether no card buy has opened node `node` yet: it shows nothing of what it is. */
const sealed = (tree: TreeLevels, card: CardId, node: CardTreeNode) => !nodeCap(tree.opened, card, node);

/** What a node is, its rarity, level and state, and what it gives now, in
 * one line for a screen reader (`why`: why it can't take a point, if so);
 * a sealed node says only that it is sealed. */
export function nodeLabel(card: CardId, tree: TreeLevels, node: CardTreeNode, why: string | null = null) {
  if (sealed(tree, card, node)) return `${SEALED_WORDS}.`;
  const level = nodeLevel(tree.levels, card, node.id), cap = nodeCap(tree.opened, card, node), state = nodeState(tree, card, node);
  const now = level ? statText(node, level).join(", ") : "nothing yet";
  return `${nodeName(card, node)}, ${CARD_RARITY_NAMES[node.rarity].toLowerCase()}: level ${level} of ${cap}, ${STATE_WORDS[state]}. Gives ${now}.${why && state !== "owned" ? ` ${why}` : ""}`;
}

/** A node's icon: its first stat's, and on a legendary node, three copies
 * of it in shifted hues drifting on cycles of their own over a black
 * ground, flashing behind them when they line up. */
function nodeIcon(node: CardTreeNode) {
  const icon = STAT_ICONS[statsOf(node)[0][0]]();
  if (node.rarity !== "legendary") return `<span class="ct-icon">${icon}</span>`;
  return `<span class="ct-icon ct-holo"><span class="ct-holo-flash" aria-hidden="true"></span>${[1, 2, 3].map((i) => `<span class="ct-holo-${i}" aria-hidden="true">${icon}</span>`).join("")}</span>`;
}

/** Card `card`'s tree as the graph draws it: the card at the root in its
 * rarity's frame, every track growing up from it, each node in its
 * rarity's frame with its stars, its stat's icon over a fill of its
 * levels, its count in the corner and its name under it (empty for a card
 * without a tree). A sealed node is an empty frame with a ?: no icon,
 * rarity, count or name until a card buy opens it. `why` says why a node can't take a
 * point, for its label. */
export function cardTreeGraph(card: CardId, tree: TreeLevels, why: (id: string) => string | null = () => null): GraphNode[] {
  const nodes = CARD_TREES[card];
  if (!nodes) return [];
  const look = cardLook(tree.opened, card);
  const root: GraphNode = {
    id: ROOT, state: "owned", face: cardArt(card, CARDS[card].name) + rarityFrameHtml(look.rarity, look.upgraded) + rarityStarsHtml(look.rarity, look.upgraded),
    cls: `root r-${look.rarity}`, label: `${CARDS[card].name}, ${CARD_RARITY_NAMES[look.rarity].toLowerCase()}: the card, root of its tree`,
  };
  return [root, ...nodes.map((node): GraphNode => {
    if (sealed(tree, card, node)) return { id: node.id, parent: node.after ?? ROOT, state: "locked", face: SEALED_FACE, cls: "sealed", label: nodeLabel(card, tree, node) };
    const level = nodeLevel(tree.levels, card, node.id), cap = nodeCap(tree.opened, card, node), state = nodeState(tree, card, node), { rarity, upgraded } = lookOf(tree.opened, card, node);
    return {
      id: node.id, parent: node.after ?? ROOT, state,
      face: nodeIcon(node) + rarityStarsHtml(rarity, upgraded)
        + `<span class="ct-fill" aria-hidden="true"><i style="width:${(level / cap) * 100}%"></i></span><b aria-hidden="true">${level}/${cap}</b>`,
      tag: nodeName(card, node),
      cls: `r-${rarity}${upgraded ? " up" : ""}`,
      label: nodeLabel(card, tree, node, why(node.id)),
    };
  })];
}

/** How a card's tree works, behind the tree's ? button. */
export function cardTreeHelpHtml(card: CardId, left: number) {
  const n = CARD_TREES[card]?.length ?? 0;
  return `<p>${CARDS[card].name} has <b>${left}</b> point${left === 1 ? "" : "s"} to spend on ${n} upgrades.</p>`
    + `<p>Each card level earns a point. Upgrades open from the card upward, each once the one below it holds enough levels, and count while the card is in the run's hand. Choose one to see what it does.</p>`
    + `<p>Buying cards on the Deck page raises a card's max level and the levels its upgrades hold, and opens its sealed upgrades: uncommon, rare, epic and legendary, each opened by a card buy of its rarity.</p>`;
}

/** The details for node `id` of `card`'s tree, kept to what buying a
 * level does: a head with its icon, its name, one line of its rarity,
 * state and level, and at its right the button that buys a level with a
 * card point (or Full) beside the ? button opening the rest
 * (`cardTreeNodeHelpHtml`); then why it can't (`refusal`, in words; with
 * no points left, Buy just greys), and what it gives now → with the next
 * level. Nothing for the root (how the tree works is behind the tree's ?
 * button) or a sealed node. */
export function cardTreeCardHtml(card: CardId, tree: TreeLevels, id: string, left: number, refusal: string | null): string {
  const node = treeNode(card, id);
  if (id === ROOT || !node || sealed(tree, card, node)) return "";
  const level = nodeLevel(tree.levels, card, id), cap = nodeCap(tree.opened, card, node), state = nodeState(tree, card, node), { rarity, upgraded } = lookOf(tree.opened, card, node);
  const parent = node.after ? treeNode(card, node.after) : undefined;
  const opens = parent && state === "locked" ? `<p class="ug-locked">Opens once ${nodeName(card, parent)} holds ${opensAt(parent)} level${opensAt(parent) === 1 ? "" : "s"}.</p>` : "";
  const blocked = !!refusal || !left;
  const action = state === "owned"
    ? `<b class="ug-owned">Full</b>`
    : `<button type="button" class="ug-buy" data-ct-raise${blocked ? " disabled" : ""} aria-label="Buy a level with a card point" title="${blocked ? "" : "Or choose the upgrade again"}">Buy${blocked ? "" : ` <small>${left} left</small>`}</button>`;
  const info = `<button type="button" class="ct-help" data-ct-info aria-label="More about ${nodeName(card, node)}" title="More about this upgrade">?</button>`;
  return `<div class="ug-card-head"><span class="ct-detail-icon r-${rarity}">${nodeIcon(node)}</span>`
    + `<div><b>${nodeName(card, node)}</b><small class="ct-meta"><span class="ct-rarity r-${rarity}">${rarityStarsHtml(rarity, upgraded)}${CARD_RARITY_NAMES[rarity]}</span> · <span class="ct-state ${state}">${capital(STATE_WORDS[state])} · Level ${level} / ${cap}</span></small></div>`
    + `<span class="ug-card-action">${action}${info}</span></div>`
    // A locked node's own line already says what opens it.
    + (refusal && state !== "owned" && !opens ? `<p class="ug-locked">${refusal}</p>` : "")
    + opens
    + statChange(node, level, cap);
}

/** The rest of node `id` of `card`'s tree, behind its details' ? button:
 * `note` first (that the card has no points left, when so), what each
 * level gives in full, and the levels it holds of its most, with the card
 * buy that opens one more. */
export function cardTreeNodeHelpHtml(card: CardId, tree: TreeLevels, id: string, note: string | null) {
  const node = treeNode(card, id);
  if (id === ROOT || !node || sealed(tree, card, node)) return "";
  const cap = nodeCap(tree.opened, card, node), { rarity } = lookOf(tree.opened, card, node);
  return (note ? `<p class="ug-locked">${note}</p>` : "")
    + `<p>Each level: ${statText(node, 1).join("; ")}.</p>`
    + `<p>Holds ${cap} of up to ${node.max} levels${cap < node.max ? `: ${article(rarity)} ${CARD_RARITY_NAMES[rarity].toLowerCase()} card buy opens one more` : ""}.</p>`;
}

const capital = (w: string) => w[0].toUpperCase() + w.slice(1);

/** The tree as a list, for reading at a glance: each upgrade a row in tree
 * order (one after another indented under it) with its icon, name,
 * rarity, state, levels, what it gives now and next, and its Buy button
 * (a sealed one only says it is sealed); `why` says why an upgrade can't
 * take a point (null when it can). */
export function cardTreeListHtml(card: CardId, tree: TreeLevels, picked: string, why: (id: string) => string | null): string {
  const nodes = CARD_TREES[card] ?? [];
  const depth = (node: CardTreeNode): number => (node.after ? 1 + depth(treeNode(card, node.after)!) : 0);
  const rows = nodes.map((node) => {
    const at = `style="--depth:${depth(node)}"`;
    if (sealed(tree, card, node))
      return `<li class="ct-row locked sealed${node.id === picked ? " picked" : ""}" ${at}><button type="button" class="ct-row-main" data-ct-pick="${node.id}" aria-label="${nodeLabel(card, tree, node)}">`
        + `<span class="ct-detail-icon">${SEALED_FACE}</span><span class="ct-row-text"><b>Sealed upgrade</b><small>A card buy opens it</small></span></button></li>`;
    const level = nodeLevel(tree.levels, card, node.id), cap = nodeCap(tree.opened, card, node), state = nodeState(tree, card, node), refusal = why(node.id);
    const { rarity, upgraded } = lookOf(tree.opened, card, node);
    const next = level < cap ? statText(node, level + 1).join("; ") : "";
    const action = state === "owned"
      ? `<span class="ug-owned">Full</span>`
      : `<button type="button" class="ug-buy" data-ct-raise="${node.id}"${refusal ? " disabled" : ""} aria-label="Buy a level of ${nodeName(card, node)} with a card point">Buy</button>`;
    return `<li class="ct-row ${state} r-${rarity}${node.id === picked ? " picked" : ""}" ${at}>`
      + `<button type="button" class="ct-row-main" data-ct-pick="${node.id}" aria-label="${nodeLabel(card, tree, node, refusal)}">`
      + `<span class="ct-detail-icon r-${rarity}">${nodeIcon(node)}</span>`
      + `<span class="ct-row-text"><b>${nodeName(card, node)}</b><small class="ct-state ${state}">${rarityStarsHtml(rarity, upgraded)}${CARD_RARITY_NAMES[rarity]} · ${capital(STATE_WORDS[state])} · ${level}/${cap}</small>`
      + `<small>${level ? statText(node, level).join("; ") : "Nothing yet"}${next ? ` <span class="ct-next">→ ${next}</span>` : ""}</small>`
      + (refusal && state !== "owned" ? `<small class="ug-locked">${refusal}</small>` : "")
      + `</span></button>${action}</li>`;
  });
  return `<ul class="ct-list" aria-label="Upgrades">${rows.join("")}</ul>`;
}

# Equipment

**Status:** Implemented. This is the design source of truth for Equipment; the code lives in `src/equipment/` (static data in `catalog.ts`, every balance number in `balance.ts`). It supersedes the crafted equipment of `CRAFTING_AND_EQUIPMENT.md` (sections 6 to 11), which was never opened to players and has been removed.

**Every number on this page is a tunable starting value**, chosen to sit beside the game's existing stats at floor 60 and to be retuned after playtesting. Changing one is a one-line edit in `balance.ts` or `catalog.ts`; saves name items only by definition id, rarity and level, so retuning never breaks a save (an item's level over a lowered cap comes down to the cap on load).

## 1. Unlock

- Equipment opens by claiming Tower II's **floor 60** checkpoint reward on the Goals screen (the `equipment` unlock in `goals.ts`; `claimGoal` sets `save.equipment.unlocked`). The claim's dialog offers *Visit the Blacksmith*. Reaching a floor opens nothing by itself.
- The moment it opens inside a run, a golden burst reads *EQUIPMENT UNLOCKED · A Blacksmith opens in the forest*, and the status line says so. Back in the forest, a dialog explains it once and offers to visit the Blacksmith.
- From then on the **Blacksmith** stands in the forest clearing, up and left of the path (a stone forge with a red banner bearing a breastplate). Tapping it opens the Equipment screen. Before the unlock it isn't there at all.
- The Gear tab opens with Equipment even with no provision open (only its Equipment tab then), and wears a dot until the Equipment screen is first seen.
- Once Equipment is open, the Chest card's Equipment Chests and Supply Chests hold Standard pieces and upgrade materials (sections 11 and 12), and bosses and Greater Bosses may drop either (section 11); other kills drop neither without an enemy card's tree.

## 2. Loadouts

The **inventory is shared**; each mode's hero has its **own loadout** (`save.equipment.equipped.tower` and `.delve`). A piece may be worn in both. The List view's loadout ring switches between the two (tap the hero in its middle) and can copy one onto the other. Each loadout wears one piece of each category.

What a loadout does is never written into the hero's stats: `loadout(save, mode)` works it out from what is worn now, and a change while a run is inside shifts that run by exactly the difference (`changeLoadout`). Equipping, unequipping, leveling, merging, reloading and switching modes therefore never count a bonus twice. Starting keys from equipment are handed out only as a run starts, so equipping and unequipping inside a run can't mint keys.

## 3. Categories and materials

Five categories open with Equipment: Helmet, Shield, Chestplate, Sword and Boots, in a plus with Shield left and Sword right.
The remaining categories have no automatic unlock schedule; already-owned pieces keep their categories usable.
There are exactly four resource currencies (`save.equipment.materials`), not inventory pieces.
Craft, level, Refine and Improve use every input in the category recipe; salvage returns only its first input.

| Category | Recipe inputs | Starting position |
|---|---|---|
| Helmet | Quilted Padding | Top |
| Shield | Iron Rivets | Left |
| Sword | Whetstone | Right |
| Boots | Hobnails | Bottom |
| Chestplate | Iron Rivets + Quilted Padding + Whetstone + Hobnails | Center |
| Amulet | Iron Rivets + Quilted Padding (Shield and Helmet) | Future top left |
| Belt | Whetstone + Quilted Padding (Sword and Helmet) | Future top right |
| Cape | Iron Rivets + Hobnails (Shield and Boots) | Future bottom left |
| Gloves | Whetstone + Hobnails (Sword and Boots) | Future bottom right |

There is no Ring: saved Rings, and loadouts wearing one, are dropped as unknown pieces.

The Craft view makes a Common of any of an open category's Standard pieces for 25 of every input, without Gold or Gems; full inventories and locked categories refuse before any payment.
Gem pulls and Equipment Chests choose only open categories; Supply Chests and mission rewards choose only the four base resources.
Old five removed material balances split into their recipe's two inputs, preserving every unit; owned equipment, slots, levels and loadouts remain.

Each category's icon (on filters and empty slots), each piece's icon (every piece its own, so pieces of a category tell apart at a glance: the first Standard piece of a starting category wears its category's, the others are recoloured from it, and the new Uniques reuse or recolour earlier drawings; their 24 × 24 PNGs sit in `public/assets/style/equip-<id>.png`), each material's icon, and the dismantle (hammer), merge (three arrows into one), level up (arrow) and lock icons are 12 × 12 pixel art drawn as inline SVG (`ui/equipment-icons.ts`).

## 4. Rarity

Rarity always shows as a word and a letter mark (C, U, R, E, L, M, A) beside its colour, and its border thickens with it, so it never depends on colour alone.
Names and colours come from the Shop's rarity table (`shop/rarity.ts`); everything else is a row of `RARITY_TIERS` in `balance.ts`.

| Rarity | Mark | Max level | Merges into | Recipe | Dismantle returns |
|---|---|---:|---|---|---:|
| Common | C | 20 | never (worn as is or salvaged) | — | 5 |
| Uncommon | U | 40 | Rare | 3 of the piece | 20 |
| Rare | R | 60 | Epic | 3 of the piece | 75 |
| Epic | E | 80 | Legendary | 2 of the piece + 1 more of its category | 250 |
| Legendary | L | 120 | Mythic (Uniques only) | 2 of the piece + 1 more of its category | 900 |
| Mythic | M | 160 | Ancestral | 2 of the piece | 3,000 |
| Ancestral | A | 200 | Stars instead | Ancestral + 1 Legendary of the piece = one Star | 10,000 |

Common pieces never merge (their tier's `merge` is null): they are only worn as they are or salvaged, thinning the drop pool and giving material.
**Standard** pieces drop only up to Rare (`STANDARD_DROP_TOP`) and merge no higher than Legendary (`STANDARD_TOP`), so a Standard's cap is 120.
A Unique piece dismantles for twice its rarity's amount (`UNIQUE_SALVAGE`), since it was bought with Gems.

**Stars** (`STARS`): an Ancestral piece takes up to five, each a merge with one Legendary copy of the same piece.
Each Star raises the level cap by 20 (to 300 at five) and multiplies the piece's main effect: ×1.04, ×1.08, ×1.12, ×1.16 and ×1.20 at one to five Stars.
A Star shows beside the rarity (*Ancestral ★3*) and on the tile.

## 5. What a piece does

A piece has two layers: its **main effect**, which only leveling raises, and its **substats**, rolled into slots its level opens (section 15).

### Main effect

Each starting category raises one percent (`MAIN_EFFECTS` in `equipment/main-effect.ts`):

| Category | Main effect | Schedule |
|---|---|---|
| Sword | ATK % | Strike |
| Shield | DEF % | Strike |
| Helmet | Arcanum Damage % | Arcana |
| Boots | Gold found % | Gold |
| Chestplate | max HP % (Strike), and an **efficiency** (Gold) that multiplies the other four worn pieces' main effects | Strike and Gold |

A main effect is its rarity's base at level 0, plus each band of ten levels' step, each step split evenly over its ten levels (level 1 adds a tenth of the first step), all multiplied by the piece's Stars.
The future corner categories have no main effect yet.

| Rarity | Strike base (ATK, DEF, max HP) | Arcana base | Gold base (Gold found, efficiency) |
|---|---:|---:|---:|
| Common | 1% | 3% | 1% |
| Uncommon | 2% | 5% | 1.2% |
| Rare | 3% | 8% | 1.5% |
| Epic | 7% | 12% | 1.8% |
| Legendary | 13% | 20% | 2.5% |
| Mythic | 20% | 30% | 3.2% |
| Ancestral | 30% | 40% | 4% |

Each band's step, added on top of the levels before it (Arcana's steps are the Strike steps ×1.2):

| Up to level | Strike step | Strike total | Gold step | Gold total |
|---:|---:|---:|---:|---:|
| 10 | 2 | 2 | 1.2 | 1.2 |
| 20 | 3 | 5 | 1.5 | 2.7 |
| 30 | 4 | 9 | 1.8 | 4.5 |
| 40 | 6 | 15 | 2.4 | 6.9 |
| 50 | 7 | 22 | 3 | 9.9 |
| 60 | 8 | 30 | 3.4 | 13.3 |
| 70 | 12 | 42 | 3.8 | 17.1 |
| 80 | 16 | 58 | 4.2 | 21.3 |
| 90 | 24 | 82 | 4.8 | 26.1 |
| 100 | 30 | 112 | 5.4 | 31.5 |
| 110 | 60 | 172 | 6 | 37.5 |
| 120 | 80 | 252 | 6.5 | 44 |
| 130 | 90 | 342 | 7 | 51 |
| 140 | 100 | 442 | 8 | 59 |
| 150 | 110 | 552 | 9 | 68 |
| 160 | 140 | 692 | 10 | 78 |
| 170 | 170 | 862 | 11 | 89 |
| 180 | 190 | 1,052 | 12 | 101 |
| 190 | 210 | 1,262 | 13 | 114 |
| 200 | 230 | 1,492 | 14 | 128 |
| 210 | 240 | 1,732 | 15 | 143 |
| 220 | 250 | 1,982 | 16 | 159 |
| 230 | 260 | 2,242 | 17 | 176 |
| 240 | 270 | 2,512 | 18 | 194 |
| 250 | 280 | 2,792 | 19 | 213 |
| 260 | 290 | 3,082 | 20 | 233 |
| 270 | 300 | 3,382 | 21 | 254 |
| 280 | 310 | 3,692 | 22 | 276 |
| 290 | 320 | 4,012 | 23 | 299 |
| 300 | 330 | 4,342 | 24 | 323 |

For example, a Common Sword at level 1 gives +1.2% ATK, and Common Boots at level 5 +1.6% Gold found.
A worn Chestplate's efficiency raises the other worn pieces' main effects by its percent (a Rare plate at level 20, 4.2%, makes a sword's +5% ATK +5.21%); it never raises its own max HP, and it doesn't raise substats.

### Where effects are read

Main effects and substats add into the same totals, each kind summed (`equipmentEffects` in `equipment/effects.ts`), and are read where they apply:

| Effect | Read by |
|---|---|
| ATK, DEF, max HP (flat, then percent of the total) | `loadout` (flat after training, percent of that, then provisions) |
| Arcanum Damage | `ArcanaDesk.boost`, as `arcanumBoost`'s equipment factor |
| Shroud, Regen | `loadout` |
| Gold / blue keys each run | `startingHero` (only as a run starts) |
| ATK against bosses | `attackAgainst` in `combat.ts` (bosses and Greater Bosses) |
| HP from potions | `Game.stepRules` (raises the Potion HP percent) |
| Max HP healed after each victory | `StepRules.victoryHeal` → `healAfterVictory` in `step-effects.ts` |
| Max HP healed on each new floor | `Game.floorHeal` (a Tower floor first reached, each new Delve equivalent floor) |
| Gold / Silver found | `RunPurse.gold` / `RunPurse.silver` (the Gold multipliers' *Gold Found*) |
| XP from kills | `Game.gainXp` |
| Upgrade materials from Supply Chests | `RunPurse.treasure` |
| Supply and Equipment Chest chance | `Game.dealHand` (the run's `chestOdds`, section 11) |
| Silver at the start of each run | `Game.dealHand` (beside Pocket Money) |
| Movement speed | `Game.moveRate` (the hand's and Automove's steps a second) |
| Tiles a Dash crosses | `Game.dashTiles` (also lets the hand dash without the Dash skill) |
| Shroud, Regen, Thorn Damage, Armor Break, Shield Thorns %; Parry and Lifesteal points | `loadout` |
| Crit and Super Crit chance and factor, Attack Range, Attack Speed, ATK / m, Multishot, Rapid Fire, Shield HP, Regrow Shield, Overheal | `trainedAmount`'s `gear` (`equipment/gear-rows.ts`), from `Game.trainingNow` and the Aether Shield's `shieldCapacity` and `regrowNow` |
| Charged Shot's charge | `volley.ts` (its research's percent) |
| Combo ATK | `Game.fighter` |
| Each arcanum's attributes | `ArcanaDesk.valuesOf`, its cooldowns too (`arcanaWithGear`) |
| Shield Regen | `Game.stepRules` |
| Gold from kills and from pickups, Interest, drop chances | `RunPurse` (`killGold`, `pickupGold`, `interest`, `killDrops`) |
| Key Efficiency by colour | `Game.doorOff` (`${color}Gear`, multiplying the trees' `${color}Key` in `doorKeyScale`) |
| Free Upgrade and Level Skip chances | `Game.freeChances` and `Game.rollLevelSkips` |
| End Rush tiles | `Game.dashFor` |
| Trainer speed, research speed, Offline Gold | `TrainingDesk`'s batch start, `duration` in `archives.ts`, `offlineGrant` (each `bestWorn`) |

Each mode's hero counts only what it wears; what works between runs counts the more of the two loadouts (section 15).

## 6. Catalogue

Each starting category has three **Standard** pieces (from Equipment Chests, crafting and a Gem pull's Common to Rare), distinct for merging and with no ability of their own, and three **Unique** pieces (from a Gem pull's Epic and Legendary only).
A definition is only a name, a category, a class and an identity line: what it does comes from its category's main effect and its substats, and, for a Unique, its power (section 16, next).
The future corners keep one Standard piece and three Uniques until they are designed.

| Category | Standard | Uniques |
|---|---|---|
| Sword | Knight's Sword, Squire's Blade, Steel Broadsword | Raptor Blade, Kinetic Mallet, Soul Reaper |
| Shield | Iron Shield, Oaken Buckler, Kite Shield | Zenith Guard, Cradle of Life, Amber Prison |
| Chestplate | Steel Cuirass, Scale Mail, Ringmail Vest | Equilibrium Tether, Mobius Cipher, Mirror Vault |
| Helmet | Iron Helm, Acolyte's Hood, Great Helm | Lich King's Crown, Psionic Tempest, Challenger's Defiance |
| Boots | Traveler's Boots, Ranger's Boots, Riding Boots | Chrono Strider, Jackpot Spurs, Hoarder Greaves |
| Gloves | Leather Gauntlets | Brawler's Wraps, Locksmith's Gloves, Alchemist's Gloves |
| Cape | Wool Cloak | Magpie's Mantle, Gatherer's Shroud, Pilgrim's Cape |
| Belt | Leather Belt | Provisioner's Belt, Champion's Girdle, Merchant's Sash |
| Amulet | Amber Pendant | Heart of the Grove, Sage's Locket, Phoenix Talisman |

## 7. Leveling

A piece starts at **level 0**.
Reaching level L costs Gold and that many of every input in its recipe (`upgradeGold`, `upgradeMaterial` in `balance.ts`), linear between the listed points:

| Reaching level | Gold each level |
|---|---|
| 1–10 | 2,000 × L (2,000 to 20,000) |
| 11–20 | 25k to 70k |
| 21–30 | 80k to 170k |
| 31–40 | 200k to 515k |
| 41–50 | 590k to 1.4m |
| 51–60 | 2.2m to 4m |
| 61–70 | 6m to 42m |
| 71–80 | 50m to 140m |
| 81–90 | 160m to 300m |
| 91–100 | 320m to 500m |
| 101–110 | 1b to 2.8b |
| 111–120 | 3b to 12b |
| 121–130 | 14b to 23b |
| 131–140 | 24b to 42b |
| 141–150 | 50b to 500b |
| 151–160 | 550b to 1t |
| 161, 162, 171, 181, 191 | 10t, 60t, 510t, 1.01q, 1.51q |
| 201, 221, 241, 261, 281, 300 | 2.5q, 265q, 1Q, 106Q, 411Q, 886Q |

(q is a quadrillion, 10¹⁵; Q a quintillion, 10¹⁸.)

| Reaching level | Material of each input |
|---|---|
| 1–60 | ⌈L × (L + 10) / 20⌉ (1, 10 at 10, 30 at 20, 100 at 40, 210 at 60) |
| 101, 161, 201, 221 | 1,000, 5,000, 10,000, 15,000 |
| 241, 261, 281, 300 | 20,000, 30,000, 40,000, 49,500 |

A Chestplate pays its material four times over (four inputs) and a future corner piece twice.
From level 0, reaching level 20 costs 585,000 Gold and 255 material; 60, 46.4m and 4,625; 120, 102b and 61,492; 200, 41.6q and 504,325; 300, about 1.9 × 10²² and 3.18m.
The Item view levels by 1, by 10, or as far as the Gold and material allow (Max).

**Investment** is recorded on each piece (`spent`: the Gold and material leveling it cost) for a future equipment reset; there is no reset yet.
Dismantling never returns it, and a merge's used-up pieces lose theirs (the merge dialog warns when one was leveled).

## 8. Merging

A merge follows the target's recipe (`mergePlan` in `inventory.ts`, section 4).
In the Assemble view the player chooses the piece to keep (the target), shown beside the pieces to use up with the result it makes: it moves up a rarity (or gains a Star) **keeping its level**, lock, loadouts, investment, **substat slots, their effects and their Refinement** (nothing is rerolled: the new rarity raises the cap and lets its slots hold rarer substats, so leveling on opens more slots).
The pieces used up start chosen (`defaultFodder`): the lowest-level copies of the piece, then, for Epic and Legendary, the category's cheapest other piece at that rarity (a Standard before a Unique, the lowest level first), so Standard pieces serve as fodder for Uniques.
The player may swap any of them; the recipe needs at least its copies of the piece itself (`fodderFits`).
Locked or worn pieces are never offered; the target itself may be locked or worn.
Assemble lists every piece with enough pieces ready (its tab wears an *N* while one is), and ends on a full-screen *Assemble Complete!* with the piece made.
**Auto-assemble**, beside *Choose the piece to keep*, lists every rarity merge the inventory makes at once, each checked by default: no piece in two merges, worn pieces left out altogether, a locked piece only ever kept, and each merge keeping the best piece left (best rarity, then locked, then the highest level) and using up `defaultFodder`'s pieces.
It never offers a Star, which is the player's own choice.
Its Assemble makes those left checked, without the melt, and ends on one *Assemble Complete!* showing them all; its ✕ or a press outside it cancels.
A merge's result never joins another in the same list: pressing again offers merges at the new rarity.

## 9. Dismantling

Dismantling breaks pieces into their recipe's first base resource (section 4 amounts). From the List view's Select mode (any number of pieces, across categories) or its Salvage quick buttons (every unprotected piece of a rarity). The confirmation shows the count, the rarities, the materials returned, and a warning for valuable pieces (Rare or above, Unique or leveled). Locked and worn pieces can't be selected or dismantled; unlock or take them off first. The materials gained rise from their balances (*+20*).

The Salvage section also holds the **Auto-salvage common drops** toggle (`save.equipment.autoSalvage`, off by default, kept between sessions): while it is on, a Common piece an Equipment Chest holds is dismantled at once into its material (`keepDrop`) instead of joining the inventory, and the status line says *Auto-salvaged · +5 …* (on the board, the material rises as its icon with its count). A Gem pull's Common pieces are dismantled the same way once pulled (`EquipmentDesk.pull`): the result screen still shows each, dimmed, with the material it returned. Pieces above Common are always kept.

## 10. Inventory

At most **500** pieces (`EQUIPMENT_CAPACITY`). An Equipment Chest's piece that finds the inventory full is dismantled at once into its material; a Gem pull needs room for every piece it brings. The List view shows the loadout (five starting slots in a plus: Helmet top, Shield left, Chestplate center, Sword right and Boots below; each future corner between the two it joins, empty until opened; the Tower/Delve switch at its top left; an empty slot shows only its category below) over the inventory as a grid of square tiles. It filters by category and by rarity together, sorts by rarity, level, category, newest or name, and selects several pieces at once to dismantle or (two) to compare. Each tile shows the icon on its rarity's colour, the rarity mark (with *★n* beside it for an Ancestral piece's Stars), the level, a check when the loadout shown wears it, a lock, and a star mark for a Unique; tapping it opens the piece.

## 11. Equipment Chests (Standard pieces)

A boss or Greater Boss killed once Equipment is open has a **0.5%** chance to drop a Standard piece and a **1.5%** chance to drop upgrade materials, each rolled as an Equipment or a Supply Chest's contents are (`BOSS_DROPS`, added to the enemy cards' trees' chances in `RunPurse.killDrops`); other kills drop them only with an enemy card's tree.
While the run's hand holds the **Chest** card, each treasure chest, once Equipment is open and in either mode, has a **0.5%** chance of being an **Equipment Chest**, which holds a Standard piece beside its Gold (`EQUIPMENT_CHEST_RARITY`, `rollChestPiece`). Each physical chest pays once (`lootedTiles`, so undo can't farm it).

| Common | Uncommon | Rare |
|---:|---:|---:|
| 67% | 30% | 3% |

The category is even among the open categories, and the piece even among its Standard pieces.

A chest's kind is fixed as its floor is generated, not as it opens. As the run goes inside, it fixes its odds (`run.chestOdds`, set by `Game.dealHand`): the hand's Chest card's 0.5% and 1.5%, each raised by the worn **Supply and Equipment Chest chance** (`chestFind`: the Treasure Sense substat; +5% makes 0.5% into 0.525%). Each treasure tile's fixed number (`chestKindAt` in `board.ts`, from the floor's seed and the tile) under the Equipment Chest's chance makes one, then under both chances a Supply Chest, so higher odds only ever add more. The board shows a Supply Chest with a light blue glow and one star in its tile's upper-left corner, and an Equipment Chest with a purple glow and two stars, and both stay on the floor once it is opened (`render/chest-marks.ts`).

The rates are low on purpose, to be raised by upgrades later.

## 12. Supply Chests (upgrade materials)

Beside bosses' drops (section 11), while the run's hand holds the **Chest** card, each treasure chest, once Equipment is open, has a **1.5%** chance of being a **Supply Chest** (fixed as its floor is generated, as in section 11), which holds upgrade materials of one category at random beside its Gold.

It holds **5** in tower I and **2** more in each tower after (7 in tower II, 9 in tower III; `SUPPLY_CHEST_MATERIALS`), the Delve's numbered delves alike, raised by Material Find (rounded down, never below the base).

## 13. Gem pulls

The Acquire view pulls in one chosen category, or of **all types** for 10% less (`PULL_ALL_DISCOUNT`).
Each pull rolls its rarity first: at Common, Uncommon or Rare it brings one of its category's Standard pieces, evenly; at Epic or Legendary one of its Uniques, evenly among those left in draws (`pullOne`).
An all-types pull draws its category evenly from the open categories first (for an Epic or Legendary, among those with a Unique left in draws).
The pieces pulled show on a full-screen result, titled by the best Epic or Legendary among them.

| Pull | Price |
|---|---:|
| ×1 | 20 Gems (all types: 18) |
| ×10 | 200 Gems (all types: 180) |

| Rarity | Rate | Brings |
|---|---:|---|
| Common | 60% | a Standard piece |
| Uncommon | 29% | a Standard piece |
| Rare | 8% | a Standard piece |
| Epic | 2.5% | a Unique |
| Legendary | 0.5% | a Unique |

Relics' Gem pull bonus moves its percent from Common to Epic.
**Pity** (`save.equipment.pity`) is counted per category, and for pulls of all types on a count of its own: the 120th pull in a row without an Epic or better is an Epic Unique, and any Epic or Legendary (natural or pity) starts the count over.
A ×10 resolves its pulls one at a time, so pity can land mid-way; all ten show together in one results view, pity pieces marked.
The count shows on each pull button and in the pool box.
**Streams.** Each category's pulls, pulls of all types and the substat rolls each draw from a saved stream of their own (`save.equipment.streams`, each seeded once from `stream("equipment")` and carried on by `withSavedStream` for the profile's life), so reloading can't reroll them and pulling one kind never shifts another's.
**Rates**, beside the buttons, lists each rarity's chance and each named piece's share of it (`pullRates`).
Once the player owns a five-Star piece (`drawTogglesOpen`), each Unique there gets a box to leave it out of future pulls (`save.equipment.drawOff`, `EquipmentDesk.setDrawn`): its share goes evenly to the others of its rarity.
The first five-Star copy made of a Unique leaves it out at once (`save.equipment.maxed` records that it happened, so it happens once).
When every Unique a pull could bring is left out, buying it is refused (`excluded`): a dialog says every Unique of that type is maxed and left out, and offers Rates to turn some back on.
The buttons always look active; short of Gems, the price turns red and a press offers the Shop.

## 14. Save shape

`save.equipment` (`decodeEquipment` in `equipment/inventory.ts`):

| Field | Holds |
|---|---|
| `unlocked`, `seen` | Opened (by Tower II's floor 60 Goal); the Equipment screen seen (the Gear dot) |
| `items` | Each piece: `id` (`e1`, `e2` …, never reused), `def` (catalogue id), `rarity`, `stars?` (1–5, Ancestral only), `level` (from 0), `locked?`, `spent?` (Gold and material invested), `slots` (one per slot opened: `effect?`, `rarity?`, `refinement?`, `choicesUsed?`, `offer?`) |
| `equipped.tower`, `equipped.delve` | Category → item id, per mode |
| `materials` | The four base resource balances |
| `pity` | Pulls since the last Epic or better, per category and for all types (`all`) |
| `nextId` | The next item id |
| `streams` | Where each saved stream stands: each category's pulls, `all`, `substats` |
| `drawOff`, `maxed` | The Uniques left out of Gem pulls; those a five-Star copy has been made of |

No catalogue data (names, effects) is saved.
Decoding drops unknown definitions and rarities, duplicate ids and pieces past the capacity, keeps Stars only on Ancestral pieces, clamps levels to the piece's cap, keeps loadouts to owned pieces of the right category, and resets anything malformed to its default.
Saves from before Equipment load with it closed and empty (opened by claiming Tower II's floor 60 Goal); the old crafted-equipment fields are dropped.
A piece keeps a slot for each its level has opened, each empty one ready for its free first roll; a slot's substat is dropped if its category can no longer hold it or another slot holds it, its rarity is clamped to the piece's (a Common one, from before substats had no Common, comes back Uncommon), and Choices spent beyond those earned are dropped.

## 15. Substats and Refinement

A piece's **substats** are its own: bonuses in slots its level opens, chosen by the player, so two copies of the same piece share a main effect but can grow different substats.
Leveling never raises a substat; rarity does.

**The loop.** Obtain a piece, level it, reach its rarity's cap, merge into the next rarity (from Uncommon up), level on, open another slot, refine it, and repeat.

### Slots

| Level | Slots open |
|---:|---:|
| 1 | 1 |
| 41 | 2 |
| 61 | 3 |
| 81 | 4 |
| 121 | 5 |
| 161 | 6 |
| 201 | 7 |
| 241 | 8 |

`openSlots(level)` counts them from `SUBSTAT_SLOT_LEVELS`.
A Common piece (never past 20) only ever has one, a Standard piece (never past Legendary's 120) four, and a Unique all eight; the item view lists only the slots a piece can reach (`reachableLevel`), each closed one with the level it opens at and the rarity (and Stars) that level needs.

### Effects and pools

Each substat (`SLOT_EFFECTS` in `equipment/slot-effects.ts`) has an id, a name, a family, the effect kind it adds to (read where section 5 says), its base value, and optionally its own value at each rarity (`values`) and the lowest rarity it rolls at (`from`).
Its value is `base × its rarity's substat power` (`SUBSTAT_POWER`: Uncommon ×1, Rare ×1.5, Epic ×2.25, Legendary ×3.5, Mythic ×5, Ancestral ×7.5), or its own value at that rarity; its name carries its rarity as a numeral (Ferocity I at Uncommon, II at Rare …).
Substats have no Common: a piece's slots hold substats up to its own rarity (`substatCap`, a Common piece's Uncommon), and a substat with a `from` rolls only on a piece of that rarity or above, never below it.
No substat is a flat stat: each is a percent, points of a chance, or a whole count, so it stays worth having however strong the hero grows.
Each starting category rolls from its own family (`CATEGORY_FAMILIES`); the future corners roll from both their neighbours' until their own synergy substats are written.

**Offense** (Swords):

| Substat | Raises | Uncommon |
|---|---|---|
| Ferocity | ATK | +3% |
| Piercing | enemy DEF ignored (at most 50%) | 3 points |
| Giantslayer | ATK against bosses | +8% |
| Keen Eye | crit chance | +2 points |
| Brutality | crit factor | +5% of it |
| Deadeye | Super Crit chance | +1 point |
| Devastation | Super Crit factor | +5% of it |
| Sunder | Armor Break | +5% of it |
| Momentum | each Combo's ATK | +5% of it |
| Far Reach | Attack Range | +5% |
| Quickdraw | Attack Speed | +4% |
| Long Shot | ATK / m | +5% of it |
| Steady Aim | Charged Shot's charge each turn | +5% of it |
| Scattershot | Multishot Chance | +1 point |
| Volley | Multishot Targets | +1 at Mythic, +2 at Ancestral (Mythic and up) |
| Hair Trigger | Rapid Fire Chance | +1 point |
| Frenzy | Rapid Fire Duration | +5% |

**Defense** (Shields):

| Substat | Raises | Uncommon |
|---|---|---|
| Fortitude | DEF | +3% |
| Warding | shroud | +5% |
| Constitution | max HP | +3% |
| Mending | Regen | +3% |
| Thorns | Thorn Damage | +5% of it |
| Deflection | Parry % (at most 98%) | +1 point (then 2, 3, 4, 5 and 8, not by power) |
| Overflow | Overheal ceiling | +3% |
| Bloodthirst | Lifesteal | +0.2 points |
| Second Wind | max HP healed after each victory | 3 points |
| Fresh Air | max HP healed on each new floor | 5 points |
| Tonic | HP from potions | +5% |
| Aegis | Aether Shield HP | +5% |
| Rebuild | turns the Aether Shield takes to regrow | −3% (its floor of 150 still holds) |
| Shield Regen | Shield Regen | +10% of it |
| Shield Thorns | Shield Thorns | +5% of it |

**Arcana** (Helmets): **Sorcery**, +4% Arcanum Damage, and one substat for each attribute of each arcanum (27): +5% of an ATK Mult, Chance, Bonus, Angle, HP, Size or Duration (a Duration rounded to whole turns), +5 points of Time Dilation's Slowdown (the 90% cap still holds), −2% of a Cooldown (to whole turns, at least 1), and whole counts that roll only from a higher rarity, 1 there and 1 more each rarity above: Thunderbolt's bolts and Phantasm's ghosts from Epic, Ricochet Shot's Rebounds and Lifespring's Effect Waves from Legendary, Overseer's beams from Mythic.
Slots roll from every arcanum, owned or not.

**Utility** (Boots):

| Substat | Raises | Uncommon |
|---|---|---|
| Prospector | Gold found | +3% |
| Bounty | Gold from kills | +3% |
| Pickpocket | Gold from items taken off the floor | +3% |
| Silver Tongue | Silver found | +3% |
| Interest | Interest's share of the Silver held | +3% |
| Locksmith | each gold key a door takes | −2% |
| Bluesmith | each blue key a door takes | −2% |
| Redsmith | each red key a door takes (Rare and up) | −2% |
| Free Offense, Free Defense, Free Utility | that group's Free Upgrade chance each floor | +1, 2, 4, 6, 8, 10 points from Uncommon to Ancestral |
| HP Skip, Combat Skip | that Enemy Level Skip's chance each floor | +1, 2, 3, 4, 6, 8 points from Uncommon to Ancestral |

**Efficiency** (Chestplates):

| Substat | Raises | Uncommon |
|---|---|---|
| Studious | XP from kills | +3% |
| Fleetness | movement speed | +3% |
| Drillmaster | trainer speed (a batch's speedup as it starts) | +3% |
| Scholarship | Archives research speed (as a project starts) | +3% |
| Fortune's Eye | kills' material and piece drop chances | +2% of them |
| Treasure Sense | Supply and Equipment Chest chance | +2% |
| Scavenger | upgrade materials from Supply Chests | +4% |
| Idle Hands | Offline Gold | +3% |
| Windfall | every Free Upgrade group's chance each floor | +1 point |
| Automaton | tiles a Dash crosses | +1 at Uncommon, +1 each rarity above |
| Sprinter | tiles End Rush crosses on STAIRS (skill or not) | +1 at Uncommon, +1 each rarity above |

Equipment is a kind of bonus of its own, so a substat's percent multiplies the other kinds' (the card trees', relics', research), and its points add to a chance.
What works between runs (Drillmaster, Scholarship, Idle Hands) counts the more of the two loadouts' (`bestWorn`), and shortens only jobs started while it is worn.
Training rows the hero's substats raise (crits, Super Crits, the Archer's rows, the Aether Shield, Overheal) take them through `trainedAmount`'s `gear` (`equipment/gear-rows.ts`), only once the row is open.
**Piercing** is a share of the enemy's DEF the hero's strikes ignore (`defenseAgainst` in `combat.ts`), at most 50% (`PIERCE_CAP`).

### Rolling

A candidate's rarity is rolled by `SUBSTAT_RARITY_WEIGHTS` (Uncommon 61.2%, Rare 25%, Epic 10%, Legendary 2.5%, Mythic 1%, Ancestral 0.3%), among the rarities up to the piece's (the weights of those allowed are rescaled).
An offer is `EFFECT_CANDIDATES` (3) different substats from the pool, never one another slot of the piece holds.
Rolls draw from the save's Equipment stream, and an offer is saved with its slot until the player answers it, so reloading can't reroll.

- **First roll (free).** A newly opened slot offers 3 candidates at no cost; the player takes one. It rolls once: asking again shows the same offer.
- **Refine (paid).** On a slot holding a substat: pay the cost, and 3 new candidates appear beside the **current** one, which stays. The player takes one, or **Keep Current**. Nothing is lost by keeping: the Refine still counts. A slot can hold one offer at a time.
- **Improve (paid).** The current substat, one rarity higher, up to the piece's: deterministic, for `IMPROVE_COST_FACTOR` (3) Refines' worth. After a merge, this is how a substat chosen at the old rarity rises.

| Piece rarity | Refine cost |
|---|---|
| Common | 1,000 Gold + 10 material |
| Uncommon | 5,000 Gold + 40 material |
| Rare | 20,000 Gold + 120 material |
| Epic | 2m Gold + 400 material |
| Legendary | 100m Gold + 1,200 material |
| Mythic | 10b Gold + 4,000 material |
| Ancestral | 1t Gold + 12,000 material |

The material is every input of the piece's category's recipe (`REFINE_COST`); Improve costs three times as much.
Epic and above are placeholders, to be tuned in play.

### Refinement and milestones

Every paid Refine adds one to that slot's **Refinement** (`slot.refinement`), which only ever rises: it is saved with the slot, kept through merges, and never taken back for keeping the current substat.

| Refinement | Milestone |
|---|---|
| Every 5th (5, 15, 25 …) | The offer's first candidate is at the piece's highest substat rarity (`REFINE_GUARANTEE_EVERY`) |
| Every 10th (10, 20 …) | The same guarantee, and a **Choice** (`REFINE_CHOICE_EVERY`) |

A **Choice** picks any substat of the slot's pool (less those its other slots hold) at the piece's highest substat rarity, outright.
Choices are earned per slot (`⌊refinement / 10⌋`, less `choicesUsed`) and kept until spent.

### Screens

The item view shows its rarity (and Stars), level and cap, what merging next raises the cap to, its main effect now and at the next level, and each slot it can reach: its substat and value, its Refinement and Choices, a free roll for a new slot, or *Unlocks at Level 41 · needs Rare* for one not open yet.
A slot's screen shows CURRENT, the NEW CANDIDATES with Keep Current, *Refinement: 7 / 10* and the next milestone, and Refine, Improve and Use a Choice (which lists the pool by family).

## 16. Approved next steps

Agreed with the designer and not built yet, in the order they are planned.

### Unique powers

Each Unique's power grows with its rarity (Epic, Legendary, Mythic, Ancestral):

| Unique | Power |
|---|---|
| Raptor Blade (Sword) | Super Crit chance +5, 7, 10, 14; a Super Crit makes the next 5 shots Super Crits |
| Kinetic Mallet (Sword) | +1, 2, 3, 4 turns to the window that keeps a Combo going |
| Soul Reaper (Sword) | 5, 8, 11, 15% chance to mark a non-boss enemy for death (rolled per enemy from the run seed): its first hit destroys it |
| Zenith Guard (Shield) | Regen heals into Overheal, up to 25, 50, 75, 100% of the room between max HP and the Overheal ceiling |
| Cradle of Life (Shield) | Aether Shield HP and Shield Regen ×1.25, 1.5, 2, 2.5 |
| Amber Prison (Shield) | A shot that doesn't kill slows its enemy (Slowdown, movement too) and cuts its ATK by 1, 1.5, 2, 2.5% a hit, stacking to 50% |
| Chrono Strider (Boots) | A potion taken cuts every arcanum's cooldown but Necrotic Frost's by 10, 13, 17, 20 turns; Aurum Bloom's Golden Chance +5, 10, 15, 20 points; every arcanum cooldown −5, 8, 11, 15% |
| Jackpot Spurs (Boots) | Gold ×(1 + n × 3, 5, 7, 10%), n the free-upgrade rolls that came up on the floor (maxed rows counted), its own compounding factor |
| Hoarder Greaves (Boots) | ATK × 1.25, 1.5, 2, 2.5 × (1 + log₁₀ of the keys held, every colour together), ×1 with none, on an exact logarithm |
| Lich King's Crown (Helmet) | 1, 2, 3, 4 ghosts rush each boss (Greater Bosses too) as it comes in shot range, at Phantasm's first-level ATK Mult |
| Psionic Tempest (Helmet) | Ricochet Shot hits its first target too, 15, 30, 45, 60% of the time |
| Challenger's Defiance (Helmet) | Overseer turns to stay on a boss; while a boss (not a Greater Boss) is on the floor, ATK against every other enemy ×2, 4, 7, 15 |
| Equilibrium Tether (Chestplate) | ATK, DEF, max HP and Regen each count as ⌈pool ÷ 4⌉ ranks: the pool is their ranks at the start of the run plus 1, 2, 3, 4 for each rank bought or given free in the run on any row, past the rows' most if need be |
| Mobius Cipher (Chestplate) | Each pickup adds 0.005, 0.01, 0.015, 0.02 to that kind's yield in the run (potions, chests' Gold, ATK shards, DEF shards, each key colour apart) |
| Mirror Vault (Chestplate) | Damage taken (HP or Aether Shield) stores in a Retribution pool at ×1, 2, 3, 4, taken off the next shots' or first strikes' enemies after their own damage, the rest kept |

### The corner categories (a spec for later)

Gloves (between Sword and Boots), Belt (Sword and Helmet), Cape (Shield and Boots) and Amulet (Shield and Helmet) sit in the plus's corners, each levelled with its two neighbours' materials (twice a starting piece's material and Gold, half a Chestplate's), each with half of each neighbour's main effect, and substats that join the two (kills dropping bonus loot, +1 Phantasm ghost, and the like).

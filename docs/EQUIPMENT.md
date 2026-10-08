# Equipment

**Status:** Implemented. This is the design source of truth for Equipment; the code lives in `src/equipment/` (static data in `catalog.ts`, every balance number in `balance.ts`). It supersedes the crafted equipment of `CRAFTING_AND_EQUIPMENT.md` (sections 6 to 11), which was never opened to players and has been removed.

**Every number on this page is a tunable starting value**, chosen to sit beside the game's existing stats at floor 60 and to be retuned after playtesting. Changing one is a one-line edit in `balance.ts` or `catalog.ts`; saves name items only by definition id, rarity and level, so retuning never breaks a save (an item's level over a lowered cap comes down to the cap on load).

## 1. Unlock

- Equipment opens by claiming Tower I's **floor 60** checkpoint reward on the Goals screen (the `equipment` unlock in `goals.ts`; `claimGoal` sets `save.equipment.unlocked`). The claim's dialog offers *Visit the Blacksmith*. Reaching a floor opens nothing by itself.
- The moment it opens inside a run, a golden burst reads *EQUIPMENT UNLOCKED · A Blacksmith opens in the forest*, and the status line says so. Back in the forest, a dialog explains it once and offers to visit the Blacksmith.
- From then on the **Blacksmith** stands in the forest clearing, up and left of the path (a stone forge with a red banner bearing a breastplate). Tapping it opens the Equipment screen. Before the unlock it isn't there at all.
- The Gear tab opens with Equipment even without the Gear skill (only its Equipment tab then), and wears a dot until the Equipment screen is first seen.
- Bosses drop equipment, and every enemy drops upgrade materials, only once Equipment is open.

## 2. Loadouts

The **inventory is shared**; each mode's hero has its **own loadout** (`save.equipment.equipped.tower` and `.delve`). A piece may be worn in both. The List view's loadout ring switches between the two (tap the hero in its middle) and can copy one onto the other. Each loadout wears one piece of each category.

What a loadout does is never written into the hero's stats: `loadout(save, mode)` works it out from what is worn now, and a change while a run is inside shifts that run by exactly the difference (`changeLoadout`). Equipping, unequipping, leveling, merging, reloading and switching modes therefore never count a bonus twice. Starting keys from equipment are handed out only as a run starts, so equipping and unequipping inside a run can't mint keys.

## 3. Categories and materials

Each category levels with its own upgrade material. Materials are currencies (`save.equipment.materials`), not inventory pieces.

| Category | Role | Material | Material theme |
|---|---|---|---|
| Weapon | Offense: ATK, boss fights and what kills pay | Whetstone | A fine-grit stone that hones every edge. |
| Chestplate | Defense: DEF, max HP and sustain | Iron Rivets | Rivets and plate scraps, hammered into armor. |
| Helmet | The first blow: shroud, and what each fight teaches | Quilted Padding | Thick lining that softens the first blow. |
| Gloves | Handling: ATK, keys and potions | Tanned Leather | Supple hide for a sure grip. |
| Boots | Movement: speed, Rush and fresh floors | Hobnails | Iron studs for sure footing on worn stone. |
| Cape | Fortune: Gold, Silver and materials | Spun Silk | Fine thread that catches the light, and the luck. |
| Belt | Provisions: potions, max HP and Silver | Brass Buckles | Clasps that keep provisions close at hand. |
| Ring | Power: percentages of ATK, DEF and max HP | Moonstone | A pale stone that holds a quiet charge. |
| Amulet | Life: max HP, regeneration and healing | Amber | Warm resin around a trapped spark of life. |

Each category's icon (on filters and empty slots), each piece's icon (every Unique and the Silver Band its own, so pieces of a category tell apart at a glance; the other Standard pieces wear their category's), each material's icon, and the dismantle (hammer), merge (three arrows into one), level up (arrow) and lock icons are 12 × 12 pixel art drawn as inline SVG (`ui/equipment-icons.ts`).

## 4. Rarity

Rarity always shows as a word and a letter mark (C, U, R) beside its colour, and its border thickens with it, so it never depends on colour alone. Powers and colours come from the Shop's rarity table (`shop/rarity.ts`), so Epic and above can be added as rows later.

| Rarity | Mark | Power (every scaling line ×) | Max level | Merge | Dismantle returns |
|---|---|---:|---:|---|---:|
| Common | C | 1 | 20 | 3 → 1 Uncommon | 5 |
| Uncommon | U | 1.25 | 40 | 3 → 1 Rare | 20 |
| Rare | R | 1.6 | 60 | top (for now) | 75 |

A Unique piece dismantles for twice its rarity's amount (`UNIQUE_SALVAGE`), since it was bought with Gems.

Higher rarity raises the power of every line, opens the lines marked for it (each Unique opens one at Uncommon and one at Rare; Standard pieces too), and raises the level cap; leveling past the old cap then opens another **effect slot** (section 15):

| Rarity | Level range | Effect slots available | Slot opens at | Maximum effect rarity |
|---|---|---:|---:|---|
| Common | 1–20 | 1 | Level 1 | Common |
| Uncommon | 1–40 | 2 | Level 21 | Uncommon |
| Rare | 1–60 | 3 | Level 41 | Rare |

Each rarity's row in `RARITY_TIERS` holds its cap (`maxLevel`), the level its slot opens at (`slotLevel`, one past the cap below) and its `maxEffect`; `openSlots(rarity, level)` counts the slots from the table, so a rarity added later (Epic with a cap of 80, say) opens a fourth slot at 61 with no other change.

## 5. Effects

Each line of an item is `(base + perLevel × (level − 1)) × rarity power`, kept on the game's snap grid (millionths); a *fixed* line ignores both (Bloodprice Blade's drawback). Keys and Rush tiles count whole units only (rounded down). All effects are deterministic: no random rolls, affixes, dodge or crits.

| Effect | Read by |
|---|---|
| ATK, DEF, max HP (flat, then percent of the total) | `loadout` (flat after training, percent of that, then provisions) |
| Shroud, Regen | `loadout` |
| Yellow / blue keys each run | `startingHero` (only as a run starts) |
| ATK against bosses | `attackAgainst` in `combat.ts` (bosses and Greater Bosses) |
| HP from potions | `Game.stepRules` (raises the Potion HP percent) |
| Max HP healed after each victory | `StepRules.victoryHeal` → `healAfterVictory` in `step-effects.ts` |
| Max HP healed on each new floor | `Game.floorHeal` (a Tower floor first reached, each new Delve equivalent floor) |
| Gold / Silver found | `RunPurse.gold` / `RunPurse.silver` |
| XP from kills | `Game.gainXp` |
| Upgrade materials from kills, boss equipment drop chance | `RunPurse.enemyLoot` |
| Silver at the start of each run | `Game.dealHand` (beside Pocket Money) |
| Movement speed | `Game.moveRate` (the hand's and Automove's steps a second) |
| Tiles a Rush crosses | `Game.rushTiles` (also lets the hand rush without the Rush skill) |

A line marked *(Tower only)* or *(Delve only)* counts only in that mode's loadout. Effects stack lightly across categories (a ring's ATK % multiplies the weapon's flat ATK, two heals both heal); there are no set bonuses.

## 6. Catalogue

Each category has one **Standard** piece (from bosses) and three **Unique** pieces (from Gem pulls only), each with a distinct identity. Values below are at level 1; *Growth* is each line's per-level gain, in order, before the rarity's power.

### Weapons

| Piece | Class | Identity | Common, level 1 | Uncommon, level 1 | Rare, level 1 | Growth a level (each line, before rarity) |
|---|---|---|---|---|---|---|
| Knight's Sword | Standard | Reliable raw ATK | +3 ATK | +3.75 ATK; +2.5% ATK | +4.8 ATK; +3.2% ATK; +1.6 DEF | 0.5 / 0.1 / 0.25 |
| Kingsbane | Unique | Boss slayer: hits bosses harder and shakes loose more equipment | +2 ATK; +10% ATK against bosses | +2.5 ATK; +12.5% ATK against bosses; +1.88% ATK | +3.2 ATK; +16% ATK against bosses; +2.4% ATK; +8% boss equipment drop chance | 0.3 / 0.25 / 0.08 / 0.1 |
| Reaper's Scythe | Unique | Clears floors for profit: more XP and Silver from every kill | +2 ATK; +5% XP from kills | +2.5 ATK; +6.25% XP from kills; +6.25% Silver found | +3.2 ATK; +8% XP from kills; +8% Silver found; 0.8% of max HP healed after each victory | 0.3 / 0.2 / 0.2 / 0.01 |
| Bloodprice Blade | Unique | High risk: the most ATK of any weapon, paid for in max HP | +8% ATK; −10% max HP | +10% ATK; −10% max HP; +3.75 ATK | +12.8% ATK; −10% max HP; +4.8 ATK; 2.4% of max HP healed after each victory | 0.2 / fixed / 0.5 / 0.03 |

### Chestplates

| Piece | Class | Identity | Common, level 1 | Uncommon, level 1 | Rare, level 1 | Growth a level (each line, before rarity) |
|---|---|---|---|---|---|---|
| Steel Cuirass | Standard | Reliable raw DEF | +2 DEF | +2.5 DEF; +2.5% DEF | +3.2 DEF; +3.2% DEF; +32 max HP | 0.4 / 0.1 / 4 |
| Bastion Plate | Unique | Raw defense: DEF, more DEF, then a shroud for the first blows | +3 DEF | +3.75 DEF; +3.75% DEF | +4.8 DEF; +4.8% DEF; +8 shroud (damage blocked each fight) | 0.5 / 0.12 / 1 |
| Giant's Hauberk | Unique | A deep pool of HP to outlast long fights | +30 max HP | +37.5 max HP; +5% max HP | +48 max HP; +6.4% max HP; +3.2 DEF | 6 / 0.12 / 0.3 |
| Verdant Mail | Unique | Sustain: regains HP as the hero walks and climbs | +0.5 HP regained each step; +1 DEF | +0.63 HP regained each step; +1.25 DEF; 2.5% of max HP healed on each new floor | +0.8 HP regained each step; +1.6 DEF; 3.2% of max HP healed on each new floor; 1.6% of max HP healed after each victory | 0.05 / 0.2 / 0.05 / 0.02 |

### Helmets

| Piece | Class | Identity | Common, level 1 | Uncommon, level 1 | Rare, level 1 | Growth a level (each line, before rarity) |
|---|---|---|---|---|---|---|
| Iron Helm | Standard | Reliable max HP and DEF | +15 max HP | +18.75 max HP; +1.25 DEF | +24 max HP; +1.6 DEF; +4.8 shroud (damage blocked each fight) | 3 / 0.25 / 0.5 |
| Sentinel's Visor | Unique | Blocks the first blows of every fight | +6 shroud (damage blocked each fight) | +7.5 shroud (damage blocked each fight); +2.5% DEF | +9.6 shroud (damage blocked each fight); +3.2% DEF; +4.8% max HP | 1.2 / 0.08 / 0.1 |
| Scholar's Circlet | Unique | Levels the hero faster, for more training points | +8% XP from kills | +10% XP from kills; +18.75 max HP | +12.8% XP from kills; +24 max HP; +8% Silver found | 0.3 / 3 / 0.2 |
| Miner's Helm | Unique | Made for the Delve: heals on new floors and digs up more there | +10 max HP; 3% of max HP healed on each new floor (Delve only) | +12.5 max HP; 3.75% of max HP healed on each new floor (Delve only); +12.5% XP from kills (Delve only) | +16 max HP; 4.8% of max HP healed on each new floor (Delve only); +16% XP from kills (Delve only); +16% upgrade materials from kills (Delve only) | 2 / 0.06 / 0.3 / 0.3 |

### Gloves

| Piece | Class | Identity | Common, level 1 | Uncommon, level 1 | Rare, level 1 | Growth a level (each line, before rarity) |
|---|---|---|---|---|---|---|
| Leather Gauntlets | Standard | Reliable ATK and DEF | +2 ATK | +2.5 ATK; +1.25 DEF | +3.2 ATK; +1.6 DEF; +3.2% ATK | 0.3 / 0.2 / 0.08 |
| Brawler's Wraps | Unique | More ATK, and a little life back from every win | +3 ATK | +3.75 ATK; +3.75% ATK | +4.8 ATK; +4.8% ATK; 0.8% of max HP healed after each victory | 0.45 / 0.1 / 0.02 |
| Locksmith's Gloves | Unique | Keys: starts every run with spare yellow keys | +1 yellow key each run | +1 yellow key each run; +1.25 DEF | +1 yellow key each run; +1.6 DEF; +1 blue key each run | 0.04 / 0.2 / fixed |
| Alchemist's Gloves | Unique | Potions: every potion heals more | +10% HP from potions | +12.5% HP from potions; +12.5 max HP | +16% HP from potions; +16 max HP; +0.48 HP regained each step | 0.4 / 2 / 0.03 |

### Boots

| Piece | Class | Identity | Common, level 1 | Uncommon, level 1 | Rare, level 1 | Growth a level (each line, before rarity) |
|---|---|---|---|---|---|---|
| Traveler's Boots | Standard | Reliable DEF and a little speed | +1 DEF | +1.25 DEF; +6.25% movement speed | +1.6 DEF; +8% movement speed; +24 max HP | 0.25 / 0.15 / 3 |
| Fleetstep Boots | Unique | Raw speed: the hand walks faster everywhere | +10% movement speed | +12.5% movement speed; +1.25 DEF | +16% movement speed; +1.6 DEF; +1 tile a Rush crosses | 0.4 / 0.2 / fixed |
| Pathfinder's Treads | Unique | Automation: each Rush crosses more empty floor | +1 tile a Rush crosses | +1 tile a Rush crosses; +6.25% movement speed | +1 tile a Rush crosses; +8% movement speed; 1.6% of max HP healed on each new floor | 0.05 / 0.2 / 0.03 |
| Delver's Greaves | Unique | Made for the Delve: faster, and healed by each new depth | +15% movement speed (Delve only); 2% of max HP healed on each new floor (Delve only) | +18.75% movement speed (Delve only); 2.5% of max HP healed on each new floor (Delve only); +6.25% Gold found (Delve only) | +24% movement speed (Delve only); 3.2% of max HP healed on each new floor (Delve only); +8% Gold found (Delve only); +1 tile a Rush crosses (Delve only) | 0.5 / 0.05 / 0.2 / 0.03 |

### Capes

| Piece | Class | Identity | Common, level 1 | Uncommon, level 1 | Rare, level 1 | Growth a level (each line, before rarity) |
|---|---|---|---|---|---|---|
| Wool Cloak | Standard | Reliable max HP and a little DEF | +10 max HP | +12.5 max HP; +1.25 DEF | +16 max HP; +1.6 DEF; +4.8% Gold found | 2 / 0.2 / 0.1 |
| Magpie's Mantle | Unique | Wealth: more Gold, then Silver, from everything found | +8% Gold found | +10% Gold found; +6.25% Silver found | +12.8% Gold found; +8% Silver found; +16 Silver at the start of each run | 0.3 / 0.2 / 1 |
| Gatherer's Shroud | Unique | Materials: more upgrade materials, and more boss drops | +10% upgrade materials from kills | +12.5% upgrade materials from kills; +2.5% boss equipment drop chance | +16% upgrade materials from kills; +3.2% boss equipment drop chance; +6.4% Gold found | 0.4 / 0.05 / 0.1 |
| Pilgrim's Cape | Unique | A steady climb: heals on every new floor | 3% of max HP healed on each new floor | 3.75% of max HP healed on each new floor; +6.25% HP from potions | 4.8% of max HP healed on each new floor; +8% HP from potions; +4.8% max HP | 0.08 / 0.2 / 0.08 |

### Belts

| Piece | Class | Identity | Common, level 1 | Uncommon, level 1 | Rare, level 1 | Growth a level (each line, before rarity) |
|---|---|---|---|---|---|---|
| Leather Belt | Standard | Reliable max HP | +20 max HP | +25 max HP; +6.25% HP from potions | +32 max HP; +8% HP from potions; +1.6 DEF | 4 / 0.2 / 0.25 |
| Provisioner's Belt | Unique | Potions: the strongest potion bonus | +15% HP from potions | +18.75% HP from potions; +6.25 Silver at the start of each run | +24% HP from potions; +8 Silver at the start of each run; +0.48 HP regained each step | 0.5 / 0.5 / 0.04 |
| Champion's Girdle | Unique | Max HP that grows with everything else | +4% max HP | +5% max HP; +25 max HP | +6.4% max HP; +32 max HP; +4.8 shroud (damage blocked each fight) | 0.12 / 4 / 0.6 |
| Merchant's Sash | Unique | Silver: buys run training from the first floor | +15 Silver at the start of each run | +18.75 Silver at the start of each run; +6.25% Silver found | +24 Silver at the start of each run; +8% Silver found; +4.8% Gold found | 1.5 / 0.2 / 0.1 |

### Rings

| Piece | Class | Identity | Common, level 1 | Uncommon, level 1 | Rare, level 1 | Growth a level (each line, before rarity) |
|---|---|---|---|---|---|---|
| Silver Band | Standard | A little of every percentage | +1.5% ATK | +1.88% ATK; +1.88% DEF | +2.4% ATK; +2.4% DEF; +2.4% max HP | 0.06 / 0.06 / 0.06 |
| Ring of Fury | Unique | Offense in percent: scales with every point of ATK | +3% ATK | +3.75% ATK; +5% ATK against bosses | +4.8% ATK; +6.4% ATK against bosses; 0.8% of max HP healed after each victory | 0.1 / 0.15 / 0.01 |
| Ring of Warding | Unique | Defense in percent: scales with every point of DEF | +3% DEF | +3.75% DEF; +3.75 shroud (damage blocked each fight) | +4.8% DEF; +4.8 shroud (damage blocked each fight); +3.2% max HP | 0.1 / 0.6 / 0.06 |
| Spire Signet | Unique | Made for the Tower: ATK and DEF there, and more boss drops | +2.5% ATK (Tower only); +2.5% DEF (Tower only) | +3.13% ATK (Tower only); +3.13% DEF (Tower only); +6.25% Gold found (Tower only) | +4% ATK (Tower only); +4% DEF (Tower only); +8% Gold found (Tower only); +4.8% boss equipment drop chance (Tower only) | 0.08 / 0.08 / 0.2 / 0.05 |

### Amulets

| Piece | Class | Identity | Common, level 1 | Uncommon, level 1 | Rare, level 1 | Growth a level (each line, before rarity) |
|---|---|---|---|---|---|---|
| Amber Pendant | Standard | Max HP in percent, and a little Regen | +1.5% max HP | +1.88% max HP; +0.25 HP regained each step | +2.4% max HP; +0.32 HP regained each step; +4.8% XP from kills | 0.06 / 0.02 / 0.1 |
| Heart of the Grove | Unique | Regeneration: the most HP back with every step | +0.6 HP regained each step | +0.75 HP regained each step; +3.75% max HP | +0.96 HP regained each step; +4.8% max HP; 3.2% of max HP healed on each new floor | 0.06 / 0.1 / 0.05 |
| Sage's Locket | Unique | Learning: more XP, then more materials and Silver | +10% XP from kills | +12.5% XP from kills; +6.25% upgrade materials from kills | +16% XP from kills; +8% upgrade materials from kills; +8% Silver found | 0.35 / 0.2 / 0.2 |
| Phoenix Talisman | Unique | Rises from each fight: heals a share of max HP after every win | 1.5% of max HP healed after each victory | 1.88% of max HP healed after each victory; +25 max HP | 2.4% of max HP healed after each victory; +32 max HP; +0.48 HP regained each step | 0.03 / 4 / 0.03 |

## 7. Leveling

Raising a piece one level costs Gold and its category's material:

- Gold: `5 × L × (L + 9)`
- Material: `⌈L × (L + 10) / 20⌉`

where `L` is the current level. Both rise smoothly with the square of the level.

| Level | Gold | Material |
|---|---|---|
| 1 → 2 | 50 | 1 |
| 2 → 3 | 110 | 2 |
| 5 → 6 | 350 | 4 |
| 10 → 11 | 950 | 10 |
| 20 → 21 | 2,900 | 30 |
| 30 → 31 | 5,850 | 60 |
| 40 → 41 | 9,800 | 100 |
| 50 → 51 | 14,750 | 150 |
| 59 → 60 | 20,060 | 204 |

From level 1, reaching level 20 costs 20,900 Gold and 225 material; level 40, 137,800 Gold and 1,430; level 60, 430,700 Gold and 4,415. The Item view levels by 1, by 10, or as far as the Gold and material allow (Max).

**Investment** is recorded on each piece (`spent`: the Gold and material leveling it cost) for a future equipment reset; there is no reset yet. Dismantling never returns it, and a merge's used-up copies lose theirs (the merge dialog warns when a copy was leveled).

## 8. Merging

Three pieces of the **same definition and rarity** make one of the next rarity. In the Assemble view the player chooses the piece to keep (the target), shown beside the copies to use up with the result it makes: it moves up a rarity **keeping its level**, lock, loadouts, investment, **effect slots, their effects and their Refinement** (nothing is rerolled: the new rarity raises the cap, lets its slots hold rarer effects, and opens the next slot once leveled past the old cap); the player picks the two copies used up (the two lowest-level unprotected ones are picked to start). Locked or worn copies are never offered; the target itself may be locked or worn. Assemble lists every piece with enough copies ready (its tab wears an *N* while one is), and ends on a full-screen *Assemble Complete!* with the piece made.

## 9. Dismantling

Dismantling breaks pieces into their category's material (section 4 amounts). From the List view's Select mode (any number of pieces, across categories) or its Salvage quick buttons (every unprotected piece of a rarity). The confirmation shows the count, the rarities, the materials returned, and a warning for valuable pieces (Rare, Unique or leveled). Locked and worn pieces can't be selected or dismantled; unlock or take them off first. The materials gained rise from their balances (*+20*).

The Salvage section also holds the **Auto-salvage common drops** toggle (`save.equipment.autoSalvage`, off by default, kept between sessions): while it is on, a Common piece a boss drops in a run is dismantled at once into its material (`keepDrop`) instead of joining the inventory, and the status line says *Auto-salvaged · +5 …*. A Gem pull's Common pieces are dismantled the same way once pulled (`EquipmentDesk.pull`): the result screen still shows each, dimmed, with the material it returned. Uncommon and Rare pieces are always kept.

## 10. Inventory

At most **500** pieces (`EQUIPMENT_CAPACITY`). A boss drop that finds the inventory full is dismantled at once into its material; a Gem pull needs room for every piece it brings. The List view shows the loadout (nine slots in a 3×3 grid shaped like the hero: ring, helmet, amulet; weapon, chestplate, cape; gloves, boots, belt; the Tower/Delve switch at its top left; an empty slot shows only its category below) over the inventory as a grid of square tiles. It filters by category and by rarity together, sorts by rarity, level, category, newest or name, and selects several pieces at once to dismantle or (two) to compare. Each tile shows the icon on its rarity's colour, the rarity mark, the level, a check when the loadout shown wears it, a lock, and a star for a Unique; tapping it opens the piece.

## 11. Boss drops (Standard pieces)

From every boss and Greater Boss, on any floor and in either mode, once Equipment is open. Each physical kill pays once (`lootedTiles`, so undo can't farm it).

| Enemy | Chance | Common | Uncommon | Rare |
|---|---:|---:|---:|---:|
| Boss | 60% | 78% | 22% | — |
| Greater Boss | 100% | 55% | 45% | — |

The category is even among the nine. Boss equipment drop chance (Kingsbane, Gatherer's Shroud, Spire Signet) adds percentage points to the chance. Rare comes only from merging and Gem pulls.

## 12. Upgrade material drops

Every enemy, once Equipment is open, of one category at random, paid once per physical kill:

| Enemy | Chance | Amount |
|---|---:|---:|
| Weak | 10% | 1 |
| Normal | 15% | 1 |
| Strong | 30% | 2 |
| Elite | 50% | 3 |
| Boss | 100% | 8 |
| Greater Boss | 100% | 20 |

The amount is multiplied by `1 + ⌊equivalent floor / 25⌋` (×3 at floor 60, ×5 at floor 100) and raised by Material Find (rounded down, never below the base).

## 13. Gem pulls (Unique pieces)

The Acquire view pulls in one chosen category, or of **all types** for 10% less (`PULL_ALL_DISCOUNT`): each pull brings one of its category's three Uniques, evenly, at a rolled rarity, an all-types pull drawing its category evenly from the nine first. The pieces pulled show on a full-screen result.

| Pull | Price |
|---|---:|
| ×1 | 20 Gems (all types: 18) |
| ×10 | 200 Gems (all types: 180) |

| Rarity | Rate |
|---|---:|
| Common | 72% |
| Uncommon | 25% |
| Rare | 3% |

**Pity** is counted per category (`save.equipment.pity`; an all-types pull counts toward the category it lands in): the 100th pull in a row without a Rare in that category is a Rare, and any Rare (natural or pity) starts the count over. A ×10 resolves its pulls one at a time, so pity can land mid-way; all ten show together in one results view, pity Rares marked. The count shows on each category's button and in the pool box. Pulls draw from the save's own stream (`save.equipment.rng`, seeded once from `stream("equipment")`), so reloading can't reroll them. The buttons always look active; short of Gems, the price turns red and a press offers the Shop.

## 14. Save shape

`save.equipment` (`decodeEquipment` in `equipment/inventory.ts`):

| Field | Holds |
|---|---|
| `unlocked`, `seen` | Opened (by the floor 60 Goal); the Equipment screen seen (the Gear dot) |
| `items` | Each piece: `id` (`e1`, `e2` …, never reused), `def` (catalogue id), `rarity`, `level`, `locked?`, `spent?` (Gold and material invested), `slots` (one per slot opened: `effect?`, `rarity?`, `refinement?`, `choicesUsed?`, `offer?`) |
| `equipped.tower`, `equipped.delve` | Category → item id, per mode |
| `materials` | The nine upgrade material balances |
| `pity` | Pulls since the last Rare, per category |
| `nextId`, `rng` | The next item id; the stream pulls and effect candidates draw from |

No catalogue data (names, effects) is saved. Decoding drops unknown definitions and rarities, duplicate ids and pieces past the capacity, clamps levels to the rarity's cap, keeps loadouts to owned pieces of the right category, and resets anything malformed to its default. Saves from before Equipment load with it closed and empty (opened by claiming the floor 60 Goal); the old crafted-equipment fields are dropped. Pieces saved before effect slots get an empty slot for each their rarity and level have opened, each ready for its free first roll; a slot's effect is dropped if its category can no longer hold it or another slot holds it, its rarity is clamped to the item's, and Choices spent beyond those earned are dropped.

## 15. Effect slots and Refinement

An item has two layers. Its **intrinsic** lines (sections 5 and 6) are fixed by its definition: its base stats and, for a Unique, its signature ability. Its **effect slots** are its own: secondary bonuses opened by rarity and level and chosen by the player, so two copies of the same piece share an identity but can grow different bonuses. Slot effects are kept to about half an intrinsic line's strength, so a Unique's specialization always leads.

**The loop.** Obtain a piece, level it, reach its rarity's cap, merge three copies into the next rarity, level past the old cap, open another slot, refine it, and repeat.

### Effects and pools

Each effect (`SLOT_EFFECTS` in `equipment/slot-effects.ts`) has an id, a name, a family, the effect kind it adds to (read where section 5 says), its value at level 1 and per level, and optionally a mode. Its value is `(base + perLevel × (level − 1)) × its rarity's power`, so a rarer version of an effect is the same effect, stronger and scaling faster; its name carries its rarity as a numeral (Fleetness I, II, III). Each category rolls from its families (`CATEGORY_FAMILIES`):

| Effect | Family | What it does (level 1, Common) | Per level | At level 60, Rare |
|---|---|---|---:|---|
| Keen Edge | Might | +1.5 ATK | 0.25 | +26 ATK |
| Ferocity | Might | +1% ATK | 0.04 | +5.38% ATK |
| Piercing | Might | 2% of enemy DEF ignored | 0.05 | 7.92% of enemy DEF ignored |
| Giantslayer | Might | +4% ATK against bosses | 0.12 | +17.73% ATK against bosses |
| Bulwark | Guard | +1 DEF | 0.2 | +20.48 DEF |
| Fortitude | Guard | +1% DEF | 0.04 | +5.38% DEF |
| Warding | Guard | +3 shroud (damage blocked each fight) | 0.5 | +52 shroud (damage blocked each fight) |
| Vigor | Vitality | +50 max HP | 10 | +1024 max HP |
| Constitution | Vitality | +1% max HP | 0.04 | +5.38% max HP |
| Mending | Vitality | +0.2 HP regained each step | 0.02 | +2.21 HP regained each step |
| Second Wind | Recovery | 0.3% of max HP healed after each victory | 0.01 | 1.42% of max HP healed after each victory |
| Fresh Air | Recovery | 1% of max HP healed on each new floor | 0.03 | 4.43% of max HP healed on each new floor |
| Tonic | Recovery | +4% HP from potions | 0.15 | +20.56% HP from potions |
| Fleetness | Mobility | +3% movement speed | 0.1 | +14.24% movement speed |
| Spire Stride | Mobility | +5% movement speed (Tower only) | 0.15 | +22.16% movement speed |
| Deep Stride | Mobility | +5% movement speed (Delve only) | 0.15 | +22.16% movement speed |
| Prospector | Fortune | +2% Gold found | 0.08 | +10.75% Gold found |
| Silver Tongue | Fortune | +2% Silver found | 0.08 | +10.75% Silver found |
| Scavenger | Fortune | +3% upgrade materials from kills | 0.12 | +16.13% upgrade materials from kills |
| Bounty | Fortune | +1% boss equipment drop chance | 0.03 | +4.43% boss equipment drop chance |
| Purse Strings | Fortune | +3 Silver at the start of each run | 0.3 | +33.12 Silver at the start of each run |
| Studious | Lore | +2% XP from kills | 0.08 | +10.75% XP from kills |
| Spire Scholar | Lore | +3.5% XP from kills (Tower only) | 0.12 | +16.93% XP from kills |
| Deep Scholar | Lore | +3.5% XP from kills (Delve only) | 0.12 | +16.93% XP from kills |

| Category | Families | Effects |
|---|---|---|
| Weapon | Might, Lore | 7 |
| Chestplate | Guard, Vitality | 6 |
| Helmet | Guard, Vitality, Lore | 9 |
| Gloves | Might, Recovery | 7 |
| Boots | Mobility, Recovery, Guard | 9 |
| Cape | Fortune, Guard | 8 |
| Belt | Vitality, Recovery, Fortune | 11 |
| Ring | Might, Guard, Vitality | 10 |
| Amulet | Vitality, Recovery, Lore | 9 |

**Piercing** is the one new effect kind: a share of the enemy's DEF the hero's strikes ignore (`defenseAgainst` in `combat.ts`), at most 50% (`PIERCE_CAP`). It changes each strike by a fixed amount, so the forecast and the fight still agree; there is no crit, dodge or other chance in any slot effect.

### Rolling

A candidate's rarity is rolled by `EFFECT_RARITY_WEIGHTS` (Common 70, Uncommon 25, Rare 5), among the rarities up to the item's `maxEffect` (the weights of those allowed are rescaled), so a Common item rolls only Common effects. An offer is `EFFECT_CANDIDATES` (3) different effects from the pool, never one another slot of the item holds. Rolls draw from the save's Equipment stream, and an offer is saved with its slot until the player answers it, so reloading can't reroll.

- **First roll (free).** A newly opened slot offers 3 candidates at no cost; the player takes one. It rolls once: asking again shows the same offer.
- **Refine (paid).** On a slot holding an effect: pay the cost, and 3 new candidates appear beside the **current** effect, which stays. The player takes one, or **Keep Current**. Nothing is lost by keeping: the Refine still counts. A slot can hold one offer at a time.
- **Improve (paid).** The current effect, one rarity higher, up to the item's `maxEffect`: deterministic, for `IMPROVE_COST_FACTOR` (3) Refines' worth. After a merge, this is how an effect chosen at the old rarity rises.

| Item rarity | Refine cost | Improve cost |
|---|---|---|
| Common | 1,000 Gold + 10 material | 3,000 Gold + 30 material |
| Uncommon | 5,000 Gold + 40 material | 15,000 Gold + 120 material |
| Rare | 20,000 Gold + 120 material | 60,000 Gold + 360 material |

The material is the item's category's (`REFINE_COST`).

### Refinement and milestones

Every paid Refine adds one to that slot's **Refinement** (`slot.refinement`), which only ever rises: it is saved with the slot, kept through merges, and never taken back for keeping the current effect.

| Refinement | Milestone |
|---|---|
| Every 5th (5, 15, 25 …) | The offer's first candidate is at the item's highest effect rarity (`REFINE_GUARANTEE_EVERY`) |
| Every 10th (10, 20 …) | The same guarantee, and a **Choice** (`REFINE_CHOICE_EVERY`) |

A **Choice** picks any effect of the slot's pool (less those its other slots hold) at the item's highest effect rarity, outright. Choices are earned per slot (`⌊refinement / 10⌋`, less `choicesUsed`) and kept until spent. This is the deterministic endpoint: luck decides how soon a slot holds the effect wanted, and ten Refines guarantee it at the top rarity, however unlucky the rolls.

### Screens

The item view shows its rarity, level and cap, what the next rarity brings (*Uncommon raises the level cap to 40; Level 21 then opens effect slot 2*), its intrinsic lines, and each slot: its effect and value, its Refinement and Choices, a free roll for a new slot, or *Unlocks at Level 41 · needs Rare* for one not open yet. A slot's screen shows CURRENT, the NEW CANDIDATES with Keep Current, *Refinement: 7 / 10* and the next milestone, and Refine, Improve and Use a Choice (which lists the pool by family). 

**Every number in this section is a balancing parameter, not a design constraint**: slot levels and caps, candidate count, rarity weights, costs, milestone spacing, effect values and families are all one-line edits in `balance.ts` and `slot-effects.ts`.

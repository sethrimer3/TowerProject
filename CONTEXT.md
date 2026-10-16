# Tower Delve

An incremental dungeon RPG: the player climbs the Tower's puzzle floors and delves an endless labyrinth, earning lasting upgrades between runs.

## Language

### Tower clears

**Area**:
The ten floors of a Tower section, from its first floor to the checkpoint floor that ends it (floors 1 to 10, 11 to 20 …). Judged as the hero climbs onto the next area's first floor.
_Avoid_: zone, floor range

**Mastered area**:
An area climbed in one run without taking fight damage (a Heart Door's toll doesn't count). Mastering an area that ends at a checkpoint lets runs warp to that checkpoint, once Warp is owned.
_Avoid_: gold clear, perfect area

**Cleared area**:
An area whose every floor the hero left with no enemy on it; pays its floors' Inspiration again, on the milestone schedule.
_Avoid_: silver clear, cleared floor

**Area chest**:
A chest set in front of the hero on the first floor of the next area for each area reward just earned: gold for mastered, silver for cleared. The reward is already paid; opening it only shows it.
_Avoid_: clear chest, reward chest

**Area ledger**:
The lifetime record, by tower, of the areas mastered and cleared, so each pays exactly once however the run is undone, revived, reloaded or replaced.
_Avoid_: tower log, reward log

### The player

**Player profile**:
The player's lifetime record, shown in the Settings page's Stats: when the profile was made, each currency ever earned (spending never lowers it), the Training levels gained, the research levels completed, and the Gold spent on each (less what came back). Erasing all progress starts a new one.
_Avoid_: account, statistics save

**Run Notes**:
A run's trivia, kept as it plays: the tower and floor reached, its real time, steps, kills, keys and doors by kind, chests, and what it found (Gold, Silver, Inspiration or Courage, materials and other loot). Note Taking research opens them, from the floor number during a run or the run's end dialog, and they copy as text. Undo takes back what the run itself holds, never what was found for good.
_Avoid_: run stats, run log

**Cinematic mode**:
Inside a run, the board alone on the screen, every control, stat and menu hidden, the hero playing on. A setting allows it; a pinch in (or two idle minutes, dimming the board) enters it, and a pinch out, three quick taps or the gear a tap shows leaves it. Never saved.
_Avoid_: fullscreen, zen mode, screensaver

### Equipment

**Equipment**:
The pieces a hero wears, one per category (Weapon, Chestplate, Helmet, Gloves, Boots, Cape, Belt, Ring, Amulet), opened by claiming Tower II's floor 60 Goal. Kept in one shared inventory between runs.
_Avoid_: gear (the Gear page and its provisions), items (pickups on the board)

**Loadout** (equipment):
The pieces one mode's hero wears; the Tower and the Delve each have their own, drawn from the shared inventory.
_Avoid_: build, set

**Standard piece**:
A category's plain piece, dropped by bosses on any floor once Equipment is open.
_Avoid_: common item (Common is a rarity)

**Unique piece**:
One of a category's three named pieces with a specialised ability, from Gem pulls only.
_Avoid_: legendary, artifact

**Upgrade material**:
A category's leveling currency (Whetstone, Iron Rivets …), dropped by enemies and returned by dismantling.
_Avoid_: crafting material, monster part

**Merge**:
Three copies of a piece at one rarity (Uncommon or above; Common pieces never merge) becoming one of the next rarity; the chosen target keeps its level. The Equipment screen calls it **Assemble**.
_Avoid_: fuse, combine

**Dismantle**:
Breaking pieces into their upgrade material.
_Avoid_: salvage (used only for the amount returned, and in **Auto-salvage**: the player's toggle that dismantles Common boss drops as they drop), destroy

**Pity**:
The count, per category, of Gem pulls since the last Rare; the 100th without one is a Rare.

**Intrinsic line**:
One of a piece's fixed effects, set by its definition (its base stats and a Unique's signature ability).
_Avoid_: affix, base effect

**Effect slot**:
A place on a piece for one chosen effect, opened by its rarity and level (one per rarity, at one level past the cap below).
_Avoid_: socket, affix, prefix, suffix

**Refine**:
Paying to roll new candidates for an effect slot beside the effect it holds, which stays unless the player takes one.
_Avoid_: reroll (it never replaces on its own)

**Refinement**:
A slot's count of Refines, which only rises; its milestones guarantee a top-rarity candidate and earn Choices.
_Avoid_: pity (the Gem pulls' count)

**Choice**:
A Refinement milestone's reward: any effect of the slot's pool, at the piece's highest effect rarity, taken outright.

**Improve**:
Raising the effect a slot holds one rarity, up to the piece's own.

**Blacksmith**:
The forest building, standing once Equipment is open, that opens the Equipment screen.

### The climb

**Climb**:
A Tower run's way through its floors, only ever up: a floor's stairs lead to the next, and a floor left behind is never returned to in the run.
_Avoid_: descent, revisit

**Section**:
A run of ten Tower floors; the hero keeps every stat on entering it.
_Avoid_: stage, chapter

### Floor layout

**Gate**:
What it costs to pass from one part of a floor into the next: an enemy to fight or a door to open.
_Avoid_: barrier, lock (for enemies)

**Fork**:
Two or three lanes side by side leading into the same place, each costing about the same but in a different resource (HP against one kind of enemy or another, keys of a colour, full HP), so the player chooses what to spend rather than whether to pay.
_Avoid_: split path, branch (a branch is an optional side room)

**Stairs guard**:
What stands on the one tile in front of a floor's stairs: an enemy, a yellow door, or nothing (a section's last floor puts its boss there).
_Avoid_: stairs gate (the gate is the stairs room's way in)

**Lane**:
One way through a fork: one to three tiles of gates walked in order, sometimes with an item between them (a treasure, or a key that pays for the door after it).
_Avoid_: corridor, path

**Door run**:
Two or three of the same door in a row in one gate, each paid in turn: blue, red or Heart Doors placed by the door quota, or yellow ones (Wooden or not) as a key sink, which the key supply plans one key for.
_Avoid_: double door, door chain

**Door quota**:
How many blue, red and Heart Doors a Tower floor holds, rolled from the door schedule for its tower and floor: none before each door's first floor, then a little more every ten floors. Only the door stage places them, so the schedule sets their number on every floor. A Delve area rolls one for each of its ten equivalent floors, from the schedule of the tower of its number. A door in a fork of k lanes counts 1/k toward it, since the hero opens one lane; each door of a door run counts.
_Avoid_: door rate (the rate is what the quota is rolled from), door budget

**Wooden Door**:
A door any one key opens (the cheapest held), or that a hero with no key breaks down by losing HP equal to its durability. DEF doesn't reduce that loss, and a hero who would fall can't break it. Common on early floors, fading as floors and towers rise.
_Avoid_: steel door (the door it replaced), breakable door

**Durability**:
The HP breaking a Wooden Door down takes: twice the ATK of the floor's normal enemy, so it grows with the floor and the tower.
_Avoid_: door HP, door strength

**Combined door**:
One door tile taking more than one thing: a key of each of two or three colours (Gold + Azure, Azure + Crimson, Triune), or a coloured door's keys and a Heart Door's drain to 1 HP (an Azure Heart Door). It counts toward the door quota of each colour, and of hearts, it takes.
_Avoid_: double door, multi-lock

**Enemy curve**:
How strong a normal, balanced enemy is on each floor of a tower or delve: HP and ATK set at a few anchor floors and grown smoothly between them, and DEF a share of ATK. Every enemy is that floor's curve times its strength and profile, so a boss placed on any floor takes that floor's value.
_Avoid_: power budget, enemy table, zone stats

**Normal enemy**:
The enemy a floor's or depth's enemy curve makes when it is neither weak, strong, elite nor a boss, and balanced, with every change the run makes to its enemies (the tower's or cave's factor, a tournament's raise, the Shrine boons). The HUD shows it under the floor; a Wooden Door's durability is measured against its ATK before the run's changes.
_Avoid_: average enemy, typical enemy (Base Enemy is a card, heading for any enemy of normal strength)

**Enemy strength**:
How hard the floor asked an enemy to be: weak, normal, strong or elite. Each strength multiplies its floor's enemy curve: strong enemies are the floor's own made tougher, elite ones come from the next zone (the Tower's curve ten floors on). The board shows it round the enemy (a dark red rim for normal, the same with one chevron pointing down for weak, bright red with one chevron for strong, bright red inside a gold rim with two chevrons for elite) and the inspect title and fight messages name weak, strong and elite (and a boss or Greater Boss) before the enemy's name.
_Avoid_: tier, rank, level

**Fast enemy**:
An enemy that strikes first in every fight, so it lands a blow even when the hero fells it in one strike. From the second tower and delve up, a share of the non-boss enemies are Fast (8% at first, growing with the floor and the tower), each striking with at least a share of the last tower's floor-100 enemy's ATK and paying 1 Gold more. Its name starts with "Fast" and its tile wears a fast-forward mark.
_Avoid_: swift, quick, first strike enemy

**Ranged enemy**:
An enemy that shoots the hero from a distance, walls and doors no obstacle, without beginning a fight: once the hero ends a turn within its reach (five sixths of the hero's Attack Range), then again each time its cooldown (10 turns, shorter further up) is ready. From the third tower and delve up, a share of the non-boss enemies are Ranged (a point under the Fast share), rolled apart from Fast, paying 1 Gold more. Its name starts with "Ranged" and its tile wears an arrow.
_Avoid_: archer enemy, shooter, sniper

**Shielded enemy**:
An enemy that casts a **bubble** round itself: while it stands, the hero's strikes and arrows on every enemy within the bubble, itself included, do 60% less after DEF. From the fourth tower and delve up, a share of floors hold one (4% at first, growing with the floor and the tower), the non-boss enemy nearest the way up; alone in its bubble, it may bring standard enemies in front of it. The bubble's radius grows from a tile to three by floor 4,000. It pays 1 Gold more. Its name starts with "Shielded" and its bubble is a glowing green ring.
_Avoid_: shield enemy, guardian, aura

**Bubble**:
The circle round a Shielded enemy within which its guard cuts the hero's damage to enemies, measured from tile centre to tile centre.
_Avoid_: aura, shield radius, field

**Archer**:
The hero's class once Tower III's floor 10 Goal is claimed: at the end of each turn its arrow is ready, it shoots the closest enemy within its **Attack Range** (3 tiles, more with training) for one strike's damage, wounding it before any fight. **Attack Speed** sets how often (1 shot every 10 turns, more with training). **ATK / Tile** (training, Tower III's floor 50) multiplies an arrow's ATK by more for each tile to its target, and **Charged Shot** (research, floor 60) raises it for each turn a ready arrow waits unfired; **Multishot** (training, floor 70) gives a shot a chance to fire at several enemies in range at once, and **Rapid Fire** (training, floor 80) a chance to make its arrows come four times as fast for a few turns. The class's name, shown under the portrait, is cosmetic before it (Wayfarer, then Pathfinder once Tower II is open).
_Avoid_: ranger, bowman

**Volley**:
A turn's shots, at the end of each turn inside a run: each ready **Ranged enemy** within reach shoots the hero, closest first, and then, unless a shot felled the hero, the **Archer**'s arrows fly.
_Avoid_: barrage, salvo

**Wound**:
The HP the Archer's arrows have taken off an enemy that still stands; the enemy keeps it, so its fight starts that much shorter.
_Avoid_: damage taken, injury

**Enemy profile**:
Which of an enemy's stats lead: attack-heavy (more ATK, less DEF), balanced, or defense-heavy (more DEF, less ATK). Any strength may wear any profile; bosses are balanced. In the Tower a profile also names the enemy: each zone's **roster** has one enemy per profile (Goblin, Thief, Armored Knight on the first zone's floors), each tower starting its rosters one zone further along.
_Avoid_: enemy type, class, archetype

**Enemy schedule**:
How many enemies a floor should hold and the share of each strength and profile, by tower and floor: weak enemies fading, strong and elite ones coming earlier each tower and growing, balanced ones giving way to attack- and defense-heavy ones, and the count growing from the floor's **baseline** (what its patterns, gates and rooms place) to three times it by floor 6,000. Bosses stand outside it. The Delve follows the tower of its number by equivalent floor. It decides who stands on a floor; the enemy curve decides how strong each is.
_Avoid_: enemy budget, spawn rate, enemy quota

**Enemy trait**:
An ability an enemy may carry beyond its stats (Armored, Piercing, Swift, Enraged: each a hero power turned against the hero). Planned for Tournament leagues and future towers; none exists yet.
_Avoid_: modifier, affix, enemy type (the profile and name already are)

### Fights

**Fight**:
What stepping into an enemy costs: rounds in which the hero strikes first and the enemy strikes back (a Fast enemy strikes once before the hero), until one of them falls. After every round the enemy's ATK rises by 1% (at least 1), so no DEF holds it off forever. How it ends is known before it starts, as the inspect panel shows.
_Avoid_: battle, combat round

**Strike**:
One attack in a fight: the hero's ATK less the enemy's DEF, or the enemy's ATK less the hero's DEF (never below zero).
_Avoid_: blow, hit (a hit is the damage one strike deals)

**Encounter**:
A fight being played out on the board, strike by strike, with its damage rising off whoever was struck and the HP it has cost so far shown in purple on the HP bar. The hero waits on the tile it came from, nothing counts until the fight is settled, and only then does the hero step onto the enemy's tile, or fall.
_Avoid_: combat animation, pending fight

**Summary round**:
A fight settled at once (Animate fights off, once Instant Combat is owned), shown afterwards as one strike each way: all the damage the hero dealt rising off the enemy and all it took rising off the hero. An enemy that falls shows nothing, since it plainly lost all its HP. A revival ends a round, and the next begins once the revival's fire is out.

**Fallen**:
The hero lost a fight: the run waits at 0 HP, the hand paused, until the player takes the fight back (Undo, spending one) or accepts defeat, which ends the run and returns to the forest.
_Avoid_: dead, game over

**Gain**:
A reward just picked up (an item's stats, keys, Gold, materials, a treasure chest's Gold), or what a door took (each key, or the HP a Heart Door drained to 1), shown rising from the tile it came from the moment it happens: as its sprite, or written out where it has none.
_Avoid_: popup, loot text

**Pickup Gold**:
The Gold every item a run takes off the floor pays (a potion, a shard, a key, a torch put out, a treasure chest or door opened, but no area reward chest): 1, but a key 1, 2 or 3 by its colour and a keyed door its colours added up; Gold Bonus multiplies it as it does a kill's Gold and a treasure chest's.
_Avoid_: item Gold, floor Gold (that is Gold / Floor)

### The character

**Loadout**:
What the character starts a run with: ATK, DEF, max HP, shroud, Regen, keys and how many undos each run has. It comes from the baseline, the upgrades bought, the training bought, the equipped gear and the provisions bought.
_Avoid_: base stats, starting stats

**Level**:
How much XP the character has gathered from kills over every run. A kill pays more for a stronger enemy and a higher floor, but each floor is worth a smaller share of a level than the one before. Each new level needs more XP than the last and earns training points; a level gives no stats by itself, nor changes what a training rank is worth.
_Avoid_: rank

**Training point**:
The currency each level earns (three a level), spent to buy ranks of training at once (a trainer can train them for Gold instead) in the character's stats (max HP, ATK, DEF, and the shroud once the Shroud skill is owned; Lifesteal once the Lifesteal skill is, Thorn Damage once Thorns is, Parry % once Parry is, Crit % and Crit x once Critical is, Attack Range, Attack Speed and ATK / Tile once Tower III's floor 20, 30 and 50 Goals are claimed, Multishot Chance and Multishot Targets once its floor 70 Goal is, Rapid Fire Chance and Rapid Fire Duration once its floor 80 Goal is) and, with Recovery, Find Potion, Revive, Spare Change, Wishing Well, Wealthy, Loot and Free Training, in Potion %, Find Potion, Revive, Gold / Floor, Silver / Floor, Silver Bonus, Gold Bonus and the Free Offense, Defense and Utility Up rows on the Training tab. A stat's ranks add up on its **rank curve**: each rank is worth more than the one before, whatever the character's level.
_Avoid_: skill point, stat point

**Trainer**:
Who trains a rank for Gold, over time, instead of training points, on each stat's own schedule (only ranks trainers finished raise its Gold and time). The Trainers skill hires the first, and each bought with Gems lets one more rank train at the same time.
_Avoid_: training slot, archivist (who does research)

**Time credit**:
Training time given back to a stat when its trainer's rank is stopped (by hand, or by buying the rank with training points): that stat's next ranks trainers train start that far along, until it is used up. Each stat keeps its own.
_Avoid_: banked time, refund time

**Time bank**:
Training time a Gem reset returns: all the time spent on the reset stat (its trainers' ranks, a rank in training, and its time credit). Any stat's next ranks trainers train use it, after that stat's own time credit, until it is used up.
_Avoid_: common credit, time pool

**Limit Break**:
One of ten Inspiration skills in a chain under Torch, 50 Inspiration each, each raising by 500 the most levels ATK, DEF, max HP, Regen and the shroud train to (the shroud by the first eight only): 1,000 levels without one, 6,000 with all ten (5,000 for the shroud).
_Avoid_: level cap upgrade, prestige

**Training boost**:
An hour of ranks in training going twice as fast, claimed from the Training tab (by an ad, to come), up to four hours banked.
_Avoid_: speedup, double time

**Revival**:
The hero rising at full HP from a strike that would have felled it, by the Revive skill's chance (0.5%, more with Revive training); the fight goes on.
_Avoid_: resurrection, second life

**Percent potion**:
The red, striped potion: it restores a regular potion's HP plus a share of max HP (1% with the Recovery skill, more with Potion % training). With Recovery owned, each potion a run finds may be one, by a chance fixed when the run goes inside (2%, more with Find Potion training, up to 20%); otherwise each is a regular potion.

**Lifesteal**:
The share of the damage each of the hero's strikes deals to an enemy that is restored to the hero as HP (up to max HP), as the strike lands and before the enemy's reply. It starts at 0% and Lifesteal training raises it by 0.1% for the first rank, each later rank adding 0.001% less, to 4.84% at 80 ranks. Fight forecasts and Damage Visual count it.

**Thorns**:
What each enemy strike the hero lives through costs the enemy: a share of its max HP (1% a Thorn Damage rank, half against a boss or Greater Boss), which DEF doesn't reduce. A fight thorns end is no Instakill.
_Avoid_: reflect, recoil

**Parry**:
An enemy strike turned partly aside: once the hero has any Parry %, every enemy strike is parried, the damage it does after DEF cut by Parry % (trained and researched, at most 98%) before the shroud and Lifesteal's heals. Parries are certain, so every prediction counts them.
_Avoid_: dodge, block (the shroud blocks)

**Piercing**:
A share of the defender's DEF a strike ignores. The hero's comes from equipment (at most 50%); as an enemy trait it would ignore a share of the hero's DEF, the same effect turned against the hero, so both keep the one name.
_Avoid_: penetration, armor break, sunder

**Shroud**:
The damage a hero's shroud blocks in each fight: the enemy's strikes, after DEF, wear it away before any HP is lost, and it is whole again when the next fight starts. The Shroud skill gives the first point; Shroud training adds more.
_Avoid_: shield (the equipment slot), barrier

**Key Siphon**:
A card that moves nowhere: its turn trades Max HP training levels, for the rest of the run only, for a yellow key, each use in a run taking one level more than the last (1, then 2, then 3 …). Skipped once the run has too few Max HP training levels left for the next use. **BK Siphon** and **RK Siphon** do the same with DEF and ATK training levels, for a blue and a red key, each counting its own uses; the three are the **siphons**.
_Avoid_: drain

**Key trade**:
A card that moves nowhere and trades keys it holds for something else: **BK Trader** (3 yellow keys for a blue key) and **YK to HP** (a yellow key for 10% of max HP, only while that much HP is missing). Skipped while it can't pay.

**Regen**:
The HP a hero regains with every step taken in a run, after whatever the step did, up to max HP. A Dash turn counts as one step, but for the first dashed tiles Dash Regen research lets regain HP too. The Regen skill opens Regen training, which gives it.
_Avoid_: regeneration, healing (a potion's)

**Provision**:
A lasting boost bought with Gold on the Gear page: each one bought adds to the loadout of every run from then on (a stat, or a yellow key), and the next of its kind costs more.
_Avoid_: consumable, buff

### Progress

**Shrine**:
What grants a Tower run its boons, once Unlock Shrines is researched: one every so many floors reached (200 for the first twenty, then 250, 300 and 350, less research and boons). Not in the Delve.
_Avoid_: altar, perk shrine

**Boon**:
A bonus a Tower run picks at a shrine, lasting the rest of the run: a standard boon (several copies a run, strengthened by Standard Boon Bonus) or a trade-off (once a run, a benefit at a cost).
_Avoid_: perk, blessing

**Offer**:
The boons a shrine lets the player choose one from: two, up to four with research; Auto Pick can choose instead.
_Avoid_: choice set, draft

**Equivalent floor**:
The one scale both modes' progress maps onto: a Tower floor counts as itself, and every ten Delve depth count as one. Loot tables are gated on it, and each new equivalent floor reached pays one of the mode's currency, up to 100; past that one every 10 to 1,000, one every 100 to 10,000, and none after.
_Avoid_: effective floor, tier

**Tier**:
One of the numbered towers (Tower I to IX), or of the delves' caves (Delve I to IX), that a run climbs. Claiming floor 100's checkpoint in a tower (once its boss is beaten) opens the next tower and the cave of the same number. Each has the same floors as the first with monsters stronger than the one before (×5 in Tower II, ×4 in III, ×3 after), pays more Gold, pays XP times the same factor as its monsters' stats, and keeps its own records, milestones and area rewards. Not to be confused with a monster's rank.
_Avoid_: new tower, prestige, world

**Inspiration**:
The Tower's currency: one for each floor completed beyond the highest completed before (paid as the hero climbs its stairs onto the floor above) and 10 for each area cleared, spent on upgrades in the skill trees.
_Avoid_: shards

**Boss**:
The monster guarding the way up at the end of every ten floors: in front of the stairs on the Tower's 10th, 20th, … floors, and below each Delve milestone gate. It has several times a normal monster's HP and hits harder than any other monster on its floor, and must be beaten to climb on.
_Avoid_: area boss, guardian

**Greater Boss**:
The Tower floor's secret monster: once every torch on a floor is put out, it appears on the open floor nearest the stairs, once a floor each run. It has twice a boss's HP, ATK and DEF and pays twice a boss's rewards, but guards nothing.
_Avoid_: super boss, secret boss

**Spawned enemy**:
A monster that appears on a floor during a run rather than being made with it, like the Greater Boss. It pays its own rewards even on a tile where a monster already fell.
_Avoid_: summon, added enemy

**Gold multiplier**:
A factor on every Gold banked: the tower's, the Gold ad's boost or Ad-Disable (one slot), each coin pack, the themes owned, the equipment's Gold found and the run's Gold boons. The player sees them together as *All Gold Bonuses*; Gold Bonus training is none of them, since it raises only a kill's, a chest's and an item's Gold.
_Avoid_: Gold bonus (the Training row)

**Silver**:
The currency of a single run: each monster beaten pays some, more on higher floors and for stronger monsters (and each new floor, with Wishing Well), and it is spent only inside that run, on run training. Undo takes it back with the kill, and it is gone when the run ends.
_Avoid_: coins, run gold

**Run training**:
Training levels bought with Silver inside a run, on top of the hero's own, lasting only for that run. Opened by the Inspiration skill On the Job.
_Avoid_: drills, run upgrades, temporary training

**Free level**:
A level of run training given for nothing on a floor passed, by a Free Upgrade row (opened by the Inspiration skill Free Training): it costs no Silver but counts as bought, so the row's next Silver level costs a step more.
_Avoid_: bonus level, free upgrade

**Buy Quantity**:
How many Training ranks one press buys, with training points or with Silver in a run: x1, then x5, x10, x100 and Max (as many as what is held pays for) as its research opens them.
_Avoid_: bulk buy, multiplier

**Checkpoint**:
A Tower floor every ten (10, 20, … 100) on the Goals screen, each tower with its own. Completing it (climbing its stairs to the floor above) lets the player claim its reward, and its premium reward too with the Premium Pass for its set of three towers. Claims last between runs.
_Avoid_: milestone (the currency paid per floor completed), section

**Floor completed**:
A Tower floor whose stairs the hero has climbed, reaching the floor above. A tower's highest floor completed is 0 until its first floor is; the Goals screen and Inspiration both count floors completed.
_Avoid_: floor reached (for progress), height

**Warp**:
Beginning a new Tower run at once on the floor just above a checkpoint already completed, from the Goals screen, once that checkpoint's area and every one below it in the tower are mastered. Unlocked by claiming Tower I's floor 40 checkpoint; entering the tower from the forest always starts on floor 1.
_Avoid_: teleport, starting floor

**Route preview**:
The route to a tapped tile drawn on the board, with a Route totals box of what happens along it (HP lost, keys spent, items picked up). Shown once the Courage skill Pathfinder is owned; before that a tap only highlights and inspects the tile.
_Avoid_: path preview

**Damage Prediction**:
The line a monster's inspect panel adds in a run once Tower I's floor 10 checkpoint is claimed: the HP the fight would cost and whether the hero survives it (Survivable, Harmless when it costs no HP, LETHAL, or Instakill when the hero's first strike fells it).
_Avoid_: combat preview

**Damage Visual**:
The cost of each fight drawn in the lower-left corner of every monster on the board, without inspecting it, once Tower I's floor 50 checkpoint is claimed: the HP Damage Prediction would show, shortened (1.2K), red when lethal (∞ when the hero can't hurt it), a gray 0 for an Instakill, a white 0 when the monster strikes but costs no HP, gold otherwise.
Items wear what they give, rounded down: a potion's HP in blue, a shard's ATK or DEF in white, a treasure chest's Gold in yellow.
_Avoid_: damage numbers, damage overlay

**Relative Damage Color**:
Tower II's floor 10 checkpoint unlock: Damage Visual's numbers coloured by the share of the hero's current HP each fight would cost, sliding from bright green below 1% through yellow at 10% and orange at 25% to red at 50% or more (an Instakill stays gray, a lethal fight red).
_Avoid_: damage gradient

**Critical hit**:
A hero strike that lands with its ATK multiplied by the **critical factor** (Crit x training and research, ×1.2 to start) before the enemy's DEF comes off. Each strike is critical with the **critical chance** (Crit % training and research, Critical skill): a fixed roll per run, floor, tile and strike, so taking a fight back and fighting it again lands the same crits. At 100% or more that many applications are certain and the rest rolls for one more; applications add to the strike's ATK (ATK × (1 + n × (factor − 1))). Fights are forecast by expected damage: the damage line shows the mean and, in the inspect panel, the range 90% of fights fall in and the chance to survive; Survivable and LETHAL stay certain (worst and best case).
Predictions count critical strikes only once the Critical Prediction skill is owned; before it they show the fight without crits.
_Avoid_: crit strike, lucky hit

**Instakill**:
A fight the hero's first strike wins, so the monster never strikes back.
_Avoid_: one-shot

**Combat Forecast**:
The line a monster's inspect panel adds in a run once Tower I's floor 20 checkpoint is claimed: how many of the hero's hits defeat it, or Instakill for one.
_Avoid_: hit count, kill preview

**Attack Lore**:
The line a monster's inspect panel adds in a run once Tower I's floor 30 checkpoint is claimed: the fewest whole points of ATK more that would defeat it in one hit fewer.
_Avoid_: attack breakpoint

**Premium Pass**:
A one-time purchase that opens the premium checkpoint rewards in one set of three towers (I–III, IV–VI or VII–IX).
_Avoid_: battle pass, season pass

**Courage**:
The Delve's currency: one for each new equivalent floor reached, spent on upgrades in the skill trees.
_Avoid_: essence

**Archives**:
Research that lasts between runs, paid in Gold and real time, unlocked by the Archives skill.
_Avoid_: lab, research tree

**Research**:
One project in the Archives, researched a level at a time; each completed level changes the game for good, and the levels add up.
_Avoid_: tech, study

**Archivist**:
One research slot: it works on one research level at a time, and optionally auto-continues to the next. Its research can be rushed: completed at once for Gems (not the hand's Dash).
_Avoid_: lab slot, researcher

**Cell**:
A lasting currency, shown as a yellow triangle, that only Greater Bosses drop (more on later towers); it buys Speed Ups. The Archives show it, and their Speed Up buttons, only once the player profile has earned some.
_Avoid_: energy, research points

**Speed Up**:
A while, bought with Cells, during which one archivist researches 1.5 to 4 times as fast; queued, it is bought again each time it ends while the Cells last. Not to be confused with Dash, which completes research at once for Gems.
_Avoid_: boost (the training boost), haste

**Research page**:
The page holding what grows with time: Training and, once that skill is owned, the Archives, a tab each. Inside a run it opens from the HUD with the run paused. Not to be confused with a single research project.
_Avoid_: lab page, training screen

### The hand

**Card**:
One way of moving the hero, toward one kind of target: the stairs, a potion, a door the hero holds the keys for, a key of one colour (yellow, or blue), a monster, an ATK pickup, or a DEF pickup. A card can act when the hero can reach such a target on the current floor over open floor and items.
_Avoid_: skill (a skill is something the player uses), ability

**Hand**:
The cards the player sets up before a run, in priority order, in four slots (five with Larger Hand, and more bought with Gems); it always holds the STAIRS card. Inside a run the hand moves the hero, and the player can't: the first card that can act (or Card Group, as one) picks its closest target, and the hero follows the shortest path there a step at a time before the hand chooses again. The player can pause it, and undo pauses it. Each run keeps the hand as ordered when it went inside.
_Avoid_: loadout (what the character starts a run with)

**Movement speed**:
How many steps a second the hand (and Automove in the forest) takes. The player sets it inside a run with the arrows beside play/pause, from 0 (paused) to 3; Movement Speed research, which the Movement Speed skill opens, makes faster speeds available, up to 9. A new hero starts at 2; the forest walks at least 3.
_Avoid_: Automove speed

**Dash**:
The hand's first step toward a new target carrying on along the path across empty floor in the same step, stopping on the tile before anything else. How many tiles it may cross comes from Dash research, once the Dash skill is owned, and adds up with End Rush research (on STAIRS only) and a Dash badge on the card.
_Avoid_: rush (the Archives' Gem button that completes research at once), sprint, leap

**Deck**:
All the player's cards: those in the hand and those waiting outside it. Also the page where the hand is ordered (with the Combat Stance skill) and its cards chosen from the deck (with Buildout).

**Card Group**:
Cards side by side in the hand that the player has linked on the Deck page (once Tower II's floor 90 Goal is claimed), so they share one priority: of the targets any of them would take, the hand heads for the closest. A link breaks when either card moves out of place.
_Avoid_: set, combo (Goldback's), stack

**Gem**:
The premium currency, kept between runs like Gold. Also the one lying on a run's floor now and then, collected by touching or tapping it.
_Avoid_: diamond, crystal, premium

**Ascension Shard**:
A limited currency, kept between runs, bought in the Shop's limited packs (each at most once every two weeks). Shown as a green crystal.
_Avoid_: shard (alone: an ATK or DEF shard is a pickup)

**Medal**:
A limited currency, kept between runs, earned from the weekly mission rewards and Events' missions. Nothing spends Medals yet. Shown as a gold disc on a red ribbon.
_Avoid_: badge (a card's token), trophy (the Tournament's)

**Focus**:
Putting one card of the hand ahead of the others inside a run, until the hero reaches its target or the card has no path to one. A run has a limited number of Focus uses.
_Avoid_: priority, override

**Charge**:
One of a run's limited uses of Focus, Ignore or Target. Each regains a use every so many new floors climbed once its regain skill (Refocus, Ignore More, Target More) is owned.
_Avoid_: token, mana

**Undo**:
Taking back the last move on the floor the hero stands on. A run has a limited number of undos (Rehearsed steps, Echoes of time and Undo Count research set how many), and one spent never comes back during that run.
_Avoid_: rewind, history slot

**Run timeline**:
What undo can take a run back to: the moves held on the floor the hero stands on, and while the hero lies fallen, the run just before that fight.
_Avoid_: undo stack, history (alone)

**Hand rules**:
What the hand's cards may do now: their badges' rules and marks, Ignore's tiles, and whether a card that acts in place can act. The hand plans from them; the hand's turn applies what they decide.
_Avoid_: card logic, badge state

**Ignore**:
Marking a tile inside a run so the hero never steps on it for the rest of that floor.
_Avoid_: block, ban

**Target**:
Sending the hero inside a run to a tile the player taps, ahead of the hand, until it arrives.
_Avoid_: waypoint, goto

**Card badge**:
A token bought with Gems (drawn by rarity: common, rare or epic) and attached to one card, changing what the card does when it activates: paying something (HP, Silver, Gold, XP), gating it (it acts only while a condition holds), changing its target (Stairward, Skip Open Nodes, Charge, Deprioritize), scaling its target's effect (Effective, Dampen), making it vanish (Skip), or adding enemies to the floors (More Enemies, only on a monster card). A card holds one in each of its badge slots, and a badge sits on one card at a time. More copies of a badge raise its level, up to 7.
_Avoid_: rune, gem, charm, enchantment

**Badge slot**:
A place on a card for one card badge. Every card has one, and one more for each level of Badge Slots research. Badges that can't work together (a key colour's < and ≥ gates, such as YK < with YK ≥, or Effective with Dampen) can't share a card.
_Avoid_: socket

**Extra enemy**:
An enemy the More Enemies badge adds to a floor after it is generated: a copy of one of that floor's own enemies of the strength its card targets, standing out of the way (a corner of a room behind a gate first) and never cutting anything off while another tile is free. It fights and pays like any other.

**Deprioritize mark**:
A ? on a tile the Deprioritize badge passed over on this floor: no card's path crosses it while another way exists. When the hand is stuck, the nearest becomes a !, which the badge's card heads for. Stepping on the tile clears its mark.

**Floor Skipped**:
Skip on the STAIRS card in the Tower: the hero climbs two floors instead of one, never standing on the floor between.

**Interest**:
Silver added on each floor climbed for the first time in a run: Interest % research's share of the Silver held, at most Max Interest's limit (50 at first).
_Avoid_: dividend

**Floor Skip Reward**:
Gold paid for a floor skipped: Floor Skip Reward research's percent of the Gold the floor's battles, chests and items still held (each closed chest counted at its average, each item at its Pickup Gold). What it counts pays no Gold if met later.

**Activation**:
A card of the hand doing what it is for: its path's last step reaching its target, or a card that acts in place acting. Card badges pay on activation.
_Avoid_: trigger, proc

**Stuck hand**:
No card in the hand can act. The hand pauses and End Run lights up, and the run ends only when the player ends it; each thing the player does (an item used, a skill) checks the hand again, and it plays on once a card can act.
_Avoid_: deadlock

**Blocker**:
What a stuck hand can't get past: a door, monster, stairs up or ignored tile at the edge of the ground the hero can walk, with more ground beyond it. The run's end dialog names each, where it stands and why no card gets past it.
_Avoid_: obstacle, deadlock cause

### Themes

**UI theme**:
A look for the page around the board: its panels, buttons and sounds. Classic is always available; Medieval is owned from the start; Neon, Terminal, Desktop, Glyph, Ember, Yang, Yin, Shiro, Kuro, Arcade, System, Orbit, Pixel, Doodle and Murk are bought (1 Gold each for now).
_Avoid_: skin, style

**Game theme**:
A look for the board itself: its tiles, the hero, enemies and torches. Classic is always available; Neon, Terminal, Desktop, Glyph, Ember, Yang, Yin, Shiro, Kuro, Arcade, System, Kroz, Orbit, Pixel, Doodle and Murk are bought (1 Gold each for now).
_Avoid_: tileset, board skin

**Owned theme**:
A UI or Game theme the player has bought (or owns from the start), kept for good; each adds 2.5% to all Gold banked, worn or not.
_Avoid_: skin, unlocked theme

### The Shop

**Shop**:
The page, opened from the cart button on the HUD, where Gems are claimed free each day or bought, and one-time packs are bought. It sells offers and hands what they grant to its owner; it keeps no items itself.
_Avoid_: store (the app store that takes real money)

**Offer**:
One thing on sale in the Shop: what it grants, how many, its price (Gems, Gold, free, real money, or only a link to the store), its rarity, and how often it can be bought.
_Avoid_: product, listing, deal

**Entitlement**:
A permanent perk bought once, such as a coin pack's Gold multiplier or Ad-Disable's permanent ×2 training. Erasing progress keeps it.
_Avoid_: unlock (a skill bought with Inspiration or Courage), perk

**Shop day**:
The day as the Shop counts it, from 00:00 to 00:00 GMT on the server's clock. A daily offer, such as the Daily Free Gems, can be claimed once each Shop day, and changing the device's clock never brings a new one.
_Avoid_: daily reset, local day

### The Tournament

**Tournament**:
A global competition, opened by Tower I's floor 60 Goal: entry is open all of each Wednesday and Saturday (GMT), and each entry is one Delve run whose depth is ranked against every other player in the same league.
_Avoid_: event, contest, season

**League**:
The bracket a player competes in: Copper, Silver, Gold, Platinum or Champion, each playing its own Delve cave (1, 3, 5, 7 or 9). The top 13% move up after each tournament; the bottom 20% move down, but never back into Copper or Silver.
_Avoid_: division, tier (a tier is a numbered tower or cave)

**Ticket**:
What entering a tournament costs. Each tournament grants one; more come from an ad, then for Gems.
_Avoid_: pass (a Premium Pass is the Goals screen's), token

**Entry**:
One tournament run, paid for with a Ticket. A player may enter as often as they have Tickets; their best score counts.

**Tournament run**:
The Delve run an Entry plays: in the league's cave, from the layout and chances every entrant of the league shares, among enemies as strong as the next cave's, without its Fast or Ranged ones. It pays and counts toward the cave's records like any run, and when it ends the player returns to the forest they began from.
_Avoid_: tournament mode

**Score**:
The deepest depth a tournament run reached. Players with the same score share the lowest place among them.

**Prize level**:
One of the ten bands a league's prizes are paid by, from the top 3% of entrants to the bottom 20%.
_Avoid_: tier, rank

### Mail

**Mail**:
Messages the game server sends a player: an outage notice, or a Tournament prize left unclaimed. The server keeps them; the game shows what it last heard.
_Avoid_: inbox (the list itself), notification, news

**Message**:
One piece of Mail: a subject line, body text, and possibly items to claim. It shows for 7 days, or while its items wait to be claimed, up to 90. A message with items waiting can't be removed.
_Avoid_: letter, post

### Missions

**Daily mission**:
A small task the player is given, two every 8 hours (from 00:00 GMT), such as *Advance 10 floors*. The list holds up to eight, those completed and waiting to be claimed included, never two incomplete of a kind, and never one asking for something not yet unlocked. They never expire, and progress counts across runs. A completed one is claimed for Gems, Gold and an equipment material.
_Avoid_: quest, task, challenge, daily (alone)

**Weekly reward**:
One of seven prizes for every 5 daily missions claimed in the week (Monday 00:00 GMT to the next), up to 35: Gold, Gems, Medals and Ascension Shards. Each can be claimed once a week.
_Avoid_: weekly mission (nothing is asked beyond the daily missions), chest

### Events

**Event**:
A fortnight of missions, from a Monday 00:00 GMT to the next but one, the next beginning as it ends, opened by Tower I's floor 70 Goal. Its missions are released over its first eight days (seven, then two a day) and stay until it ends.
_Avoid_: season, campaign, challenge (alone)

**Event mission**:
One of an event's missions, such as *Defeat 5,000 base enemies*, in three tiers of rising targets, each paying Medals (10, 15, 20) the moment it is done, with nothing to claim.
_Avoid_: daily mission (the 8-hourly ones), quest

**Event Booster**:
A purchase for one event that doubles every Medal it pays, those already paid too, and opens its two premium relics.
_Avoid_: event pass, Premium Pass (the Goals' passes)

**Relic**:
A unique keepsake won by reaching an event's Medal milestone (premium relics only with the Event Booster), each giving a permanent bonus, each owned at most once and kept for good. Spending Medals is never needed to win one.
_Avoid_: trophy (the Tournament's), artifact, badge

### The Delve

**Forest sign**:
The sign at the foot of each forest's path once the Delve is open, showing the other place: tapped, or walked onto, it leads to the other mode's forest. It is the only way between the Tower and the Delve.
_Avoid_: Delve tab, mode switch

**Automove memory**:
What Delve Automove has seen of the labyrinth during this run, and how often the player has stood on each tile. Undo leaves it as it is, since what was seen stays seen; it is forgotten when a run enters the labyrinth, when a milestone gate seals behind the player, and when the layout changes.
_Avoid_: known tiles, visit map

# Tower Delve

An incremental dungeon RPG: the player climbs the Tower's puzzle floors and delves an endless labyrinth, earning lasting upgrades between runs.

## Language

### Tower clears

**Area**:
The ten floors of a Tower section, from its sealed first floor to the checkpoint floor that ends it (floors 1 to 10, 11 to 20 …). Judged as the hero climbs onto the next area's first floor.
_Avoid_: zone, floor range

**Mastered area**:
An area climbed in one run without taking fight damage (a Heart Door's toll doesn't count). Mastering an area that ends at a checkpoint lets runs warp to that checkpoint, once Warp is owned.
_Avoid_: gold clear, perfect area

**Cleared area**:
An area left with no enemy on any of its floors; pays 10 Inspiration.
_Avoid_: silver clear, cleared floor

**Area chest**:
A chest set in front of the hero on the first floor of the next area for each area reward just earned: gold for mastered, silver for cleared. The reward is already paid; opening it only shows it.
_Avoid_: clear chest, reward chest

**Area ledger**:
The lifetime record, by tower, of the areas mastered and cleared, so each pays exactly once however the run is undone, revived, reloaded or replaced.
_Avoid_: tower log, reward log

### Equipment

**Equipment**:
The pieces a hero wears, one per category (Weapon, Chestplate, Helmet, Gloves, Boots, Cape, Belt, Ring, Amulet), opened by claiming Tower I's floor 60 Goal. Kept in one shared inventory between runs.
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
Three copies of a piece at one rarity becoming one of the next rarity; the chosen target keeps its level. The Equipment screen calls it **Assemble**.
_Avoid_: fuse, combine

**Dismantle**:
Breaking pieces into their upgrade material.
_Avoid_: salvage (used only for the amount returned), destroy

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

**Visited floor**:
A Tower floor the player has stood on during this run. It stays as it was left, and the stairs lead back to it, unless it lies below a section's first floor.
_Avoid_: explored room, old floor

**Section**:
A run of ten Tower floors. Its first floor is sealed below; the hero keeps every stat on entering it.
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

**Enemy curve**:
How strong a normal, balanced enemy is on each floor of a tower or delve: HP and ATK set at a few anchor floors and grown smoothly between them, and DEF a share of ATK. Every enemy is that floor's curve times its strength and profile, so a boss placed on any floor takes that floor's value.
_Avoid_: power budget, enemy table, zone stats

**Enemy strength**:
How hard the floor asked an enemy to be: weak, normal, strong or elite. Each strength multiplies its floor's enemy curve: strong enemies are the floor's own made tougher, elite ones come from the next zone (the Tower's curve ten floors on). The board shows it round the enemy (a dark red rim for normal, bright red with one chevron for strong, bright red inside a gold rim with two chevrons for elite) and the inspect title and fight messages name weak, strong and elite (and a boss or Greater Boss) before the enemy's name.
_Avoid_: tier, rank, level

### Fights

**Fight**:
What stepping into an enemy costs: rounds in which the hero strikes first and the enemy strikes back, until one of them falls. After every round the enemy's ATK rises by 1% (at least 1), so no DEF holds it off forever. How it ends is known before it starts, as the inspect panel shows.
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

### The character

**Loadout**:
What the character starts a run with: ATK, DEF, max HP, shroud, Regen, keys and how many undos it can store. It comes from the baseline, the upgrades bought, the training bought, the equipped gear and the provisions bought.
_Avoid_: base stats, starting stats

**Level**:
How much XP the character has gathered from kills over every run. A kill pays more for a stronger enemy and a higher floor, but each floor is worth a smaller share of a level than the one before. Each new level needs more XP than the last and earns training points; a level gives no stats by itself, but every training rank is worth more at a higher level.
_Avoid_: rank

**Training point**:
The currency each level earns (three a level), spent to buy ranks of training at once (a trainer can train them for Gold instead) in the character's stats (max HP, ATK, DEF, and the shroud once the Shroud skill is owned) and, with Recovery, Find Potion, Revive, Spare Change, Wishing Well, Wealthy and Loot, in Potion %, Find Potion, Revive, Gold / Floor, Silver / Floor, Silver Bonus and Gold / Kill on the Training tab. A stat rank's worth grows with the character's level.
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

**Training boost**:
An hour of ranks in training going twice as fast, claimed from the Training tab (by an ad, to come), up to four hours banked.
_Avoid_: speedup, double time

**Revival**:
The hero rising at full HP from a strike that would have felled it, by the Revive skill's chance (0.5%, more with Revive training); the fight goes on.
_Avoid_: resurrection, second life

**Percent potion**:
The red, striped potion: it restores a regular potion's HP plus a share of max HP (1% with the Recovery skill, more with Potion % training). With Recovery owned, each potion a run finds may be one, by a chance fixed when the run goes inside (2%, more with Find Potion training, up to 20%); otherwise each is a regular potion.

**Shroud**:
The damage a hero's shroud blocks in each fight: the enemy's strikes, after DEF, wear it away before any HP is lost, and it is whole again when the next fight starts. The Shroud skill gives the first point; Shroud training adds more.
_Avoid_: shield (the equipment slot), barrier

**Key Siphon**:
A card that moves nowhere: its turn trades Max HP training levels, for the rest of the run only, for a yellow key, each use in a run taking one level more than the last (1, then 2, then 3 …). Skipped once the run has too few Max HP training levels left for the next use. **BK Siphon** and **RK Siphon** do the same with DEF and ATK training levels, for a blue and a red key, each counting its own uses; the three are the **siphons**.
_Avoid_: drain

**Key trade**:
A card that moves nowhere and trades keys it holds for something else: **BK Trader** (3 yellow keys for a blue key) and **YK to HP** (a yellow key for 10% of max HP, only while that much HP is missing). Skipped while it can't pay.

**Regen**:
The HP a hero regains with every step taken in a run, after whatever the step did, up to max HP. A Rush turn counts as one step. The Regen skill opens Regen training, which gives it.
_Avoid_: regeneration, healing (a potion's)

**Provision**:
A lasting boost bought with Gold on the Gear page: each one bought adds to the loadout of every run from then on (a stat, or a yellow key), and the next of its kind costs more.
_Avoid_: consumable, buff

### Progress

**Equivalent floor**:
The one scale both modes' progress maps onto: a Tower floor counts as itself, and every ten Delve depth count as one. Loot tables are gated on it, and each new equivalent floor reached pays one of the mode's currency, up to 100; past that one every 10 to 1,000, one every 100 to 10,000, and none after.
_Avoid_: effective floor, tier

**Tier**:
One of the numbered towers (Tower I to IX), or of the delves' caves (Delve I to IX), that a run climbs. Claiming floor 100's checkpoint in a tower (once its boss is beaten) opens the next tower and the cave of the same number. Each has the same floors as the first with monsters three times as strong as the one before, pays more Gold, pays XP times the same factor as its monsters' stats, and keeps its own records, milestones and area rewards. Not to be confused with a monster's rank.
_Avoid_: new tower, prestige, world

**Inspiration**:
The Tower's currency: one for each floor completed beyond the highest completed before (paid as the hero climbs its stairs onto the floor above) and 10 for each area cleared, spent on upgrades in the skill trees.
_Avoid_: shards

**Boss**:
The monster guarding the way up at the end of every ten floors: in front of the stairs on the Tower's 10th, 20th, … floors, and below each Delve milestone gate. It has twice a strong monster's HP and ATK, and must be beaten to climb on.
_Avoid_: area boss, guardian

**Greater Boss**:
The Tower floor's secret monster: once every torch on a floor is put out, it appears on the open floor nearest the stairs, once a floor each run. It has twice a boss's HP, ATK and DEF and pays twice a boss's rewards, but guards nothing.
_Avoid_: super boss, secret boss

**Silver**:
The currency of a single run: each monster beaten pays some, more on higher floors and for stronger monsters (and each new floor, with Wishing Well), and it is spent only inside that run, on run training. Undo takes it back with the kill, and it is gone when the run ends.
_Avoid_: coins, run gold

**Run training**:
Training levels bought with Silver inside a run, on top of the hero's own, lasting only for that run. Opened by the Inspiration skill On the Job.
_Avoid_: drills, run upgrades, temporary training

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
Beginning a new Tower run at once on the floor just above a checkpoint already completed, from the Goals screen. Unlocked by claiming Tower I's floor 40 checkpoint; entering the tower from the forest always starts on floor 1.
_Avoid_: teleport, starting floor

**Route preview**:
The route to a tapped tile drawn on the board, with a Route totals box of what happens along it (HP lost, keys spent, items picked up). Shown once the Courage skill Pathfinder is owned; before that a tap only highlights and inspects the tile.
_Avoid_: path preview

**Damage Prediction**:
The line a monster's inspect panel adds in a run once Tower I's floor 10 checkpoint is claimed: the HP the fight would cost and whether the hero survives it (Survivable, Harmless when it costs no HP, LETHAL, or Instakill when the hero's first strike fells it).
_Avoid_: combat preview

**Damage Visual**:
The cost of each fight drawn in the lower-left corner of every monster on the board, without inspecting it, once Tower I's floor 50 checkpoint is claimed: the HP Damage Prediction would show, shortened (1.2K), red when lethal (∞ when the hero can't hurt it), a gray 0 for an Instakill, a white 0 when the monster strikes but costs no HP, gold otherwise.
_Avoid_: damage numbers, damage overlay

**Relative Damage Color**:
Tower II's floor 10 checkpoint unlock: Damage Visual's numbers coloured by the share of the hero's current HP each fight would cost, sliding from bright green below 1% through yellow at 10% and orange at 25% to red at 50% or more (an Instakill stays gray, a lethal fight red).
_Avoid_: damage gradient

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
One research slot: it works on one research level at a time, and optionally auto-continues to the next. Its research can be rushed: completed at once for Gems (not the hand's Rush).
_Avoid_: lab slot, researcher

**Research page**:
The page holding what grows with time: Training and, once that skill is owned, the Archives, a tab each. Inside a run it opens from the HUD with the run paused. Not to be confused with a single research project.
_Avoid_: lab page, training screen

### The hand

**Card**:
One way of moving the hero, toward one kind of target: the stairs, a potion, a door the hero holds the keys for, a key of one colour (yellow, or blue), a monster, an ATK pickup, or a DEF pickup. A card can act when the hero can reach such a target on the current floor over open floor and items.
_Avoid_: skill (a skill is something the player uses), ability

**Hand**:
The cards the player sets up before a run, in priority order, in four slots (five with Larger Hand, and more bought with Gems); it always holds the STAIRS card. Inside a run the hand moves the hero, and the player can't: the first card that can act picks its closest target, and the hero follows the shortest path there a step at a time before the hand chooses again. The player can pause it, and undo pauses it. Each run keeps the hand as ordered when it went inside.
_Avoid_: loadout (what the character starts a run with)

**Movement speed**:
How many steps a second the hand (and Automove in the forest) takes. The player sets it inside a run with the arrows beside play/pause, from 0 (paused) to 3; Movement Speed research, which the Movement Speed skill opens, makes faster speeds available, up to 9. A new hero starts at 2; the forest walks at least 3.
_Avoid_: Automove speed

**Rush**:
The hand's first step toward a new target carrying on along the path across empty floor in the same step, stopping on the tile before anything else. How many tiles it may cross comes from Rush research, once the Rush skill is owned.
_Avoid_: dash, sprint, leap

**Deck**:
All the player's cards: those in the hand and those waiting outside it. Also the page where the hand is ordered (with the Combat Stance skill) and its cards chosen from the deck (with Buildout).

**Gem**:
The premium currency, kept between runs like Gold. Also the one lying on a run's floor now and then, collected by touching or tapping it.
_Avoid_: diamond, crystal, premium

**Focus**:
Putting one card of the hand ahead of the others inside a run, until the hero reaches its target or the card has no path to one. A run has a limited number of Focus uses.
_Avoid_: priority, override

**Charge**:
One of a run's limited uses of Focus, Ignore or Target. Each regains a use every so many new floors climbed once its regain skill (Refocus, Ignore More, Target More) is owned.
_Avoid_: token, mana

**Ignore**:
Marking a tile inside a run so the hero never steps on it for the rest of that floor.
_Avoid_: block, ban

**Target**:
Sending the hero inside a run to a tile the player taps, ahead of the hand, until it arrives.
_Avoid_: waypoint, goto

**Card badge**:
A token bought with Gems (drawn by rarity: common, rare or epic) and attached to one card, changing what the card does when it activates: paying something (HP, Silver, Gold, XP), gating it (it acts only while a condition holds), changing its target (Stairward, Skip Open Nodes, Charge, Deprioritize), scaling its target's effect (Effective, Dampen) or making it vanish (Skip). A card holds one, and a badge sits on one card at a time. More copies of a badge raise its level, up to 7.
_Avoid_: rune, gem, charm, enchantment

**Deprioritize mark**:
A ? on a tile the Deprioritize badge passed over on this floor: no card's path crosses it while another way exists. When the hand is stuck, the nearest becomes a !, which the badge's card heads for. Stepping on the tile clears its mark.

**Floor Skipped**:
Skip on the STAIRS card in the Tower: the hero climbs two floors instead of one, never standing on the floor between.

**Interest**:
Silver added on each floor climbed for the first time in a run: Interest % research's share of the Silver held, at most Max Interest's limit (50 at first).
_Avoid_: dividend

**Floor Skip Reward**:
Gold paid for a floor skipped: Floor Skip Reward research's percent of the Gold the floor's battles and chests still held (each closed chest counted at its average). What it counts pays no Gold if met later.

**Activation**:
A card of the hand doing what it is for: its path's last step reaching its target, or a card that acts in place acting. Card badges pay on activation.
_Avoid_: trigger, proc

**Stuck hand**:
No card in the hand can act. The hand pauses and End Run lights up, and the run ends only when the player ends it; each thing the player does (an item used, a skill) checks the hand again, and it plays on once a card can act.
_Avoid_: deadlock

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

### The Delve

**Forest sign**:
The sign at the foot of each forest's path once the Delve is open, showing the other place: tapped, or walked onto, it leads to the other mode's forest. It is the only way between the Tower and the Delve.
_Avoid_: Delve tab, mode switch

**Automove memory**:
What Delve Automove has seen of the labyrinth during this run, and how often the player has stood on each tile. Undo leaves it as it is, since what was seen stays seen; it is forgotten when a run enters the labyrinth, when a milestone gate seals behind the player, and when the layout changes.
_Avoid_: known tiles, visit map

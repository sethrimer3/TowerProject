# Tower Delve

An incremental dungeon RPG: the player climbs the Tower's puzzle floors and delves an endless labyrinth, earning lasting upgrades between runs.

## Language

### Tower clears

**Cleared floor**:
A Tower floor with no enemy or door left on it.
_Avoid_: empty room, finished floor

**Clear tier**:
A grade a cleared floor earns: silver for any clear, gold if the run has taken no damage, platinum if it has also spent no keys on that floor. Each tier is earned once per floor, for good.
_Avoid_: medal, rank

**Clear chest**:
A chest standing by the stairs of a cleared floor for one clear tier; opening it pays one Inspiration. Chests still standing when the player leaves the floor or the run are paid anyway.
_Avoid_: reward chest, clear reward

**Clear ledger**:
The lifetime record, per floor, of which clear tiers were earned and which were paid, so a tier pays exactly once however the run is undone, revived, reloaded or replaced.
_Avoid_: tower log, reward log

### The climb

**Visited floor**:
A Tower floor the player has stood on during this run. It stays as it was left, and the stairs lead back to it, unless it lies below a section's first floor.
_Avoid_: explored room, old floor

**Section**:
A run of ten Tower floors. Its first floor is sealed below, and the ATK/DEF gathered from items resets on entering it; each section remembers the best HP the player arrived with, and later ascents can start there.
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

**Enemy strength**:
How hard the floor asked an enemy to be: weak, normal, strong or elite. Strong enemies are the zone's own made tougher, elite ones come from the next zone. The board shows it round the enemy (a dark red rim for normal, bright red with one chevron for strong, bright red inside a gold rim with two chevrons for elite) and the inspect title names strong and elite.
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

**Fallen**:
The hero lost a fight: the run waits at 0 HP, the hand paused, until the player takes the fight back (Undo, spending one) or accepts defeat, which ends the run and returns to the forest.
_Avoid_: dead, game over

**Gain**:
A reward just picked up (an item's stats, keys, Gold, materials, a clear chest's Inspiration), or what a door took (each key, or the full HP a Heart Door checked), shown rising from the tile it came from the moment it happens: as its sprite, or written out where it has none.
_Avoid_: popup, loot text

### The character

**Loadout**:
What the character starts a run with: ATK, DEF, max HP, keys and how many undos it can store. It comes from the baseline, the upgrades bought, the training bought, the equipped gear and the provisions bought.
_Avoid_: base stats, starting stats

**Level**:
How much XP the character has gathered from kills over every run. A kill pays more for a stronger enemy and a higher floor, but each floor is worth a smaller share of a level than the one before. Each new level needs more XP than the last and earns training points; a level gives no stats by itself, but every training rank is worth more at a higher level.
_Avoid_: rank

**Training point**:
The currency each level earns (three a level), spent to buy ranks of training at once (a trainer can train them for Gold instead) in the character's stats (max HP, ATK, DEF, and the shroud once the Shroud skill is owned) and, with Recovery, Find Potion, Revive, Spare Change, Wishing Well, Wealthy and Loot, in Potion %, Find Potion, Revive, Gold / Floor, Silver / Floor, Silver Bonus and Gold / Kill on the Training tab. A stat rank's worth grows with the character's level.
_Avoid_: skill point, stat point

**Trainer**:
Who trains a rank for Gold, over time, instead of training points. The hero starts with one, and each bought with Gems lets one more rank train at the same time.
_Avoid_: training slot, archivist (who does research)

**Time credit**:
Training time given back when a trainer's rank is stopped or a stat is reset: the next ranks trainers train start that far along, until it is used up.
_Avoid_: banked time, refund time

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

**Provision**:
A lasting boost bought with Gold on the Gear page: each one bought adds to the loadout of every run from then on (a stat, or a yellow key), and the next of its kind costs more.
_Avoid_: consumable (a crafted item used during a run), buff

### Progress

**Equivalent floor**:
The one scale both modes' progress maps onto: a Tower floor counts as itself, and every ten Delve depth count as one. Loot tables are gated on it, and each new equivalent floor reached pays one of the mode's currency, up to 100; past that one every 10 to 1,000, one every 100 to 10,000, and none after.
_Avoid_: effective floor, tier

**Tier**:
One of the numbered towers (Tower I to IX), or of the delves (Delve I to IX), that a run climbs. Beating the boss on floor 100 of the highest one opened opens the next. Each has the same floors as the first with monsters three times as strong as the one before, pays more Gold and XP, and keeps its own records, milestones and clear chests. Not to be confused with a clear tier or a monster's rank.
_Avoid_: new tower, prestige, world

**Inspiration**:
The Tower's currency: one for each new floor reached and each clear tier paid, spent on upgrades in the skill trees.
_Avoid_: shards

**Boss**:
The monster guarding the way up at the end of every ten floors: in front of the stairs on the Tower's 10th, 20th, … floors, and below each Delve milestone gate. It has twice a strong monster's HP and ATK, and must be beaten to climb on.
_Avoid_: area boss, guardian

**Silver**:
The currency of a single run: each monster beaten pays some, more on higher floors and for stronger monsters (and each new floor, with Wishing Well), and it is spent only inside that run, on run training. Undo takes it back with the kill, and it is gone when the run ends.
_Avoid_: coins, run gold

**Run training**:
Training levels bought with Silver inside a run, on top of the hero's own, lasting only for that run.
_Avoid_: drills, run upgrades, temporary training

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
One research slot: it works on one research level at a time, and optionally auto-continues to the next.
_Avoid_: lab slot, researcher

### The hand

**Card**:
One way of moving the hero, toward one kind of target: the stairs, a potion, a door the hero holds the keys for, a key of one colour (yellow, or blue), a monster, or an ATK or DEF pickup. A card can act when the hero can reach such a target on the current floor over open floor and items.
_Avoid_: skill (a skill is something the player uses), ability

**Hand**:
The cards the player sets up before a run, in priority order, in four slots (five with Larger Hand, and more bought with Gems); it always holds the STAIRS card. Inside a run the hand moves the hero, and the player can't: the first card that can act picks its closest target, and the hero follows the shortest path there a step at a time before the hand chooses again. The player can pause it, and undo pauses it. Each run keeps the hand as ordered when it went inside.
_Avoid_: loadout (what the character starts a run with)

**Movement speed**:
How many steps a second the hand (and Automove in the forest) takes. The player chooses it, from 1 to 3, once the Movement Speed skill is owned; Movement Speed research makes faster speeds available, up to 9.
_Avoid_: Automove speed

**Deck**:
All the player's cards: those in the hand and those waiting outside it. Also the page where the hand is ordered (with the Combat Stance skill) and its cards chosen from the deck (with Buildout).

**Gem**:
The premium currency, kept between runs like Gold. Also the one lying on a run's floor now and then, collected by touching or tapping it.
_Avoid_: diamond, crystal, premium

**Focus**:
Putting one card of the hand ahead of the others inside a run, until the hero reaches its target or the card has no path to one. A run has a limited number of Focus uses.
_Avoid_: priority, override

**Stuck hand**:
No card in the hand can act. The hand pauses and End Run lights up, and the run ends only when the player ends it; each thing the player does (an item used, a skill) checks the hand again, and it plays on once a card can act.
_Avoid_: deadlock

### The Delve

**Automove memory**:
What Delve Automove has seen of the labyrinth during this run, and how often the player has stood on each tile. Undo leaves it as it is, since what was seen stays seen; it is forgotten when a run enters the labyrinth, when a milestone gate seals behind the player, and when the layout changes.
_Avoid_: known tiles, visit map

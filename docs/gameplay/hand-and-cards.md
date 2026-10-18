# The hand and cards

## The hand

Inside a Tower or Delve run, your **hand** of cards moves the hero instead; taps only inspect, and swipes and keys do nothing (except in Dev mode, which also starts the hand paused).

## Cards

A new profile's hand is its whole deck, in priority order: **Stairs** (the stairs up; in the Delve, the highest open tile it can reach above any row reached this run, however far off screen, which its card text mentions only once Into the depths is owned), **Door** (a door you hold the keys for, or a Wooden Door you can break down), **Key** (the closest key of any colour), and **Enemy** (any enemy that can be fought, even a lethal one).
Six more cards join the deck from the Inspiration tree: **Heal** (a potion; the Heal skill, 3 Inspiration, below Regen), **Yellow Key** (a yellow key, never a blue or red one; the Yellow Key skill, 3 Inspiration, under Gear), **ATK Up** (an ATK pickup; the ATK Up skill, 5 Inspiration, under Yellow Key), **DEF Up** (a DEF pickup; the DEF Up skill, 5 Inspiration, under ATK Up) and **Blue Key** (a blue key; the Blue Key skill, 2 Inspiration, after the Archives, below DEF Up), and **Key Siphon** (the Key Siphon skill, 5 Inspiration, below Thorns in the tree's middle path), which moves nowhere: when its turn comes it trades Max HP training levels, for the rest of the run only, for a yellow key, the hero losing the max HP those levels give and standing still for the turn (undo takes it back).
The first use in a run takes 1 level, the second 2, the third 3, and so on, and its card's tooltip in the run says how many times it has been used.
Its levels are the hero's own Max HP ranks and any bought with Silver that run; without enough left for its next use it greys out in the hand and is skipped, so where it sits in the hand decides when it fires.
Below Buy Quantity, the middle path adds seventeen more (20 Inspiration each unless said): **Yellow Door** (5; a single yellow door, while you hold a yellow key; a Wooden Door is DOOR's), **Heart Door** (10, left of Heart Door Resilience, which stands left of Yellow Door; a Heart Door), **Weak Enemy** (below Yellow Door), with **Base Enemy** (neither weak, strong, elite nor a boss) then **Strong Enemy** to its left, **Fast Enemy** (a Fast enemy, of any strength) below Base Enemy, and **Elite Enemy** then **Boss Enemy** (a boss or a Greater Boss) to its right, **Non-Boss Enemy** (40; any enemy but a boss or a Greater Boss) below Boss Enemy, each heading for the closest enemy of its strength that can be fought, **Chest** (a closed treasure chest or area reward chest), **BK Siphon** and **RK Siphon** (Key Siphon's twins: DEF or ATK training levels for a blue or red key, each counting its own uses), **BK Trader** (3 yellow keys for a blue key, while 3 are held), **YK to HP** (a yellow key for 10% of max HP, only while that much is missing), **Red Key** (a red key), **Torch** (the closest lit torch, putting it out) and **Wooden Door** (a Wooden Door you hold a key for, or can break down and survive).
Below Torch, straight down, **Limit Break 1** to **10** (50 Inspiration each, each after the one before) raise how far ATK, DEF, Max HP, Regen and Shroud train, 500 levels each (see [Training](training.md)).
Two skills on that path open research instead: **Heart Door Resilience** (left of Yellow Door, with Heart Door to its left) opens research making every Heart Door drain 5% less of your HP a level, for ten levels, and **Floor Skip Reward** (below BK Siphon, between Torch and Wooden Door) opens research that, when the Skip badge on STAIRS climbs past a Tower floor, pays 10% a level (up to 110%) of the Gold that floor's battles and chests held; both are priced and timed like Focus Count, with one and two more levels.
The siphons and trades move nowhere, like Key Siphon, and grey out while they can't act.
Tower V's floor 10 Goal adds **Flying Enemy** to the deck: it heads for the closest Flying monster the Archer's arrows can hurt, stops as soon as one is within the Attack Range, and holds its ground there, a turn at a time, while one is, the arrows doing the work; once none is in reach, the hand moves on.
It can't act unless the hand holds Archer too.
While it is in the hand it also gives the arrows +5% Shot ATK and +5% Attack Speed.
Tower III's floor 10 Goal adds **Archer** to the deck, a plain wooden bow on its face: it never moves the hero, but while the run's hand holds it the hero is an Archer, firing arrows at the closest monster in reach ([The Archer](fights.md#the-archer)), and the Archer's Training rows can be raised with Silver in the run.

## Card bonuses

Some cards also give a bonus for as long as the run's hand holds them, whichever card leads the hero to the key or chest; a card's details list it under what it does.
**Yellow Key**, **Blue Key** and **Red Key** make each key of their colour picked up worth 5% more (1.05 keys) and pay 1, 2 or 3 more Gold (raised by Gold Bonus, like a key's own Gold); **Key** gives no bonus.
The enemy cards but **Enemy** (Weak, Base, Strong, Elite, Boss, Non-Boss, Fast and Flying Enemy) give +5% ATK against the enemies they head for, in fights and for arrows alike, and make each of those enemies drop 5% more Gold when defeated, multiplying every other Gold bonus (shown as *+5% ATK vs Weak Enemies* and *+5% Gold from Weak Enemies*).
Two such cards covering the same enemy add their ATK (+10%) and their Gold (+10%, one ×1.1 on the rest); a Boss Enemy covers Greater Bosses too, and **Enemy** gives no bonus.
**Archer** gives its arrows +5% ATK against a boss or Greater Boss (shown as +5% Shot ATK for Bosses); fights are untouched.
**Chest** gives each treasure chest, once Equipment is open, a 1.5% chance of being a **Supply Chest**, which adds Equipment upgrade materials to its Gold (kills drop none) (5 of one category in Tower I and 2 more in each tower after, raised by Material Find), and a 0.5% chance of being an **Equipment Chest**, which adds a Standard piece: 67% Common, 30% Uncommon, 3% Rare (bosses drop none).
Equipment's Supply and Equipment Chest chance raises both chances by its percent.
A chest's kind is settled as its floor is made, by the hand the run went in with: a Supply Chest shows a light blue glow and one star in its upper-left corner, an Equipment Chest a purple glow and two stars, and both marks stay once it is opened.
Otherwise a treasure chest holds only Gold.
The card's details show these as *1.5% Supplies* in light blue and *0.5% Equipment* in purple.
A profile from before the Key card holds Key in Yellow Key's place, with any badges and links Yellow Key had; the Yellow Key skill earns Yellow Key back.

## How the hand plays

Each new card rises from the bottom of the screen to its middle, green rays turning behind it and what it does written below, until you press it.
Whenever the hero has no path to follow, the first card that can reach a target over open floor and items picks its closest one, and the hero walks the shortest path there, one step per tick of the movement speed (2 steps a second for a new hero); of equally short paths it takes the one stepping on the fewest items (keys, potions, ATK and DEF shards, treasure chests) and lit torches, so it walks round them unless they lie on the only shortest way, leaving them to the cards that aim at them (an area reward chest is no item here).
Tapped routes do the same; the card glows as it moves, and keeps glowing while the hand is paused; playing on carries on along the same path.
When no card can act, the hand pauses and End Run shows in red at the foot of the floor column (and in the run's menu): the run ends only when you end it.
Its dialog lists what blocks the way, closest first: each door, enemy, stairs or ignored tile at the edge of the ground the hero can reach, how far up or down it stands, and why no card gets past it (the keys or ATK you hold that fall short, a badge holding its card back, or no card in the hand for it).
The hand searches all the ground the hero can reach, however far off screen.
Whatever you do next (training for the run, Ignore, and later skills) checks the hand again, and it plays on by itself once a card can act.

## Play, pause and speed

The play/pause button (where Automove was, showing ▶ while paused and ❚❚ while playing, with the hero's movement speed under it, *3x* for 3 steps a second) pauses the hand to look around, and undo pauses it too.
The ‹ and › arrows either side of the speed (a press anywhere on its side of the row counts) slow and speed the hero a step a second at a time, from 0 to 3 (more with research; › closes at the most allowed): slowing to 0 pauses the hand, and playing it again starts at 1.
A new hero walks at 2; on the second floor the game pauses once, a pointing hand under ›, until the player speeds up to 3, then plays on.
The forest's Automove keeps the speed last set in a run, but never walks slower than 3.
The cards sit in the row under the board.
Each run keeps the hand as it was ordered when the run went inside, however the hand is rearranged before the next.

## The Deck page

The Inspiration tree's first skill, **Combat Stance** (1 Inspiration), adds a **Deck** tab after Tower and Delve.
The Deck page shows the hand's slots along the top: four, five with **Larger Hand** (1 Inspiration, beside the Archives), and one more for each slot bought with Gems after that (50, 100, 200, 300, 400, 500, 600, 750, 1,000, 1,200, 1,400, 1,600, 1,800, 2,500, 3,500, 4,500, 5,500, 6,500, 7,500, 8,500 and 10,000 Gems, up to 26), the next for sale standing after them; dragging a card to another slot (or moving a focused card with the arrow keys) shifts each card in between over one, and the new order is saved at once.
Below the hand sits the deck, locked until **Buildout** (1 Inspiration, after Combat Stance): then the deck's cards are laid out on a grid, those in the hand greyed out with a check that returns them to the deck, and pressing any other card adds it to the hand's first empty slot.
Dragging one onto a hand slot puts it there instead: with room in the hand, the cards from that slot on slide one slot later; with the hand full, the card in that slot goes back to the deck (never STAIRS).
A hand card shows an X in its corner while hovered (always, on touch screens) that also returns it to the deck, as does dragging it onto the deck (which lights up while it is held there).
A hand must always hold STAIRS, which has no X and can only be reordered; every other card is optional.
Every change is saved at once.
The first visit teaches the drag: a note explains the order and a hand points at STAIRS, the other cards and tabs stay disabled until STAIRS is moved, and a dialog then praises the new order.
With Buildout, the next lesson shows the X on ENEMY with a hand pointing at it, and again nothing else can be used until it is pressed; a dialog praises that (closed by pressing anywhere on it), and a note over the deck, dismissed by pressing it, explains adding cards.

## Card Groups

Tower II's floor 90 Goal opens **Card Groups** on the Deck page: a thin row under each row of the hand holds a hollow light grey diamond between each card and the next (none after the last).
Pressing a diamond links the two cards beside it into a group: the diamond turns white, and a thin white square bracket runs under them from one card's middle to the other's, the diamond on top of it (a group split across two rows of the hand carries its bracket from the end of one row to the start of the next).
Linking more neighbours makes a larger group.
The cards of a group share one priority: of every target any of them would take, the hand heads for the closest (a card that acts in place, like Key Siphon, first of all; of targets as close, the earlier card's).
Link Yellow Key and Blue Key, and the hero takes whichever key is nearer.
A group gives way to the cards after it only when none of its cards can act, and a focused card plans alone, its group aside.
A link lasts until its diamond is pressed again or either card moves out of place (dragged to another slot, or out of the hand); a run keeps the groups it went in with.

## Focus

**Focus** (5 Courage, after Movement Speed in the Courage tree, below it) is the player's own say in where the hero goes inside a run.
Pressing a card in the hand under the board puts it ahead of the others: it glows white, the hand plays on (even if it was paused), and the card leads until the hero reaches its target, or until it has no path to one, when the hand's order leads again.
Each run starts with 1 Focus, shown by a lightning bolt beside the potions in the stats, and each Focus that takes spends one; a Focus Count level completed during a run adds its use at once.
With none left, the bolt flashes red; a card with no path to a target flashes red and costs nothing; the card already moving the hero can't be focused.
Undo brings back the Focus uses and focused card of the moment they return to.

## Refocus, Ignore and Target

Below Max Interest, Interest and Mug at the foot of the Courage tree, five skills (20 Courage each) give the run more of a say.
**Refocus** (below Max Interest) regains a spent Focus use every 100 new floors a run climbs (new equivalent floors in the Delve); the count waits while Focus is full, and its Archives research, **Refocus**, takes a floor off the wait a level, down to every 10 floors.
**Ignore** (below Interest) adds a button beside the Focus bolt, a red ⊘ with the uses left: press it, then tap a tile, and no card's path (nor Target's) steps on that tile for the rest of the floor, marked with a red ⊘.
A run gets 1 use, and **Ignore Count** research adds one a level, up to 10.
A wall, the hero's own tile or one already ignored costs nothing, and pressing the button again puts it away.
**Ignore More** (below Ignore) regains Ignore uses as Refocus regains Focus, with its own research.
**Target** (below Mug) adds a blue crosshair button: press it, then tap a tile, and the hero walks there (round ignored tiles, fighting or opening what stands on the tile itself), marked with a blue ring until it arrives; then the hand's order leads again.
A tile out of reach costs nothing; one that becomes out of reach on the way loses the Target.
A run gets 1 use, and **Target Count** research adds one a level, up to 5 (10 million, 100 million, 1 billion and 10 billion Gold).
**Target More** (below Target) regains Target uses the same way.
The three regain projects each take 90 levels (100 floors down to 10), level n taking n²/10 hours (6 minutes at level 1, 34 days at 90, about 2.8 years in all): Focus Count's Gold plus 8 × n³ for Refocus, and Focus Count's Gold raised 5% compounding a level for Ignore More and 10% for Target More.

## Badges

**Badges** (2 Courage, after Focus) opens a **Badges** box on the Deck page, beside the deck: the two share the space below the hand in two columns, each scrolling on its own when its cards or tokens don't fit.
Above the box, **Draw ×1** (20 Gems) and **Draw ×10** (200 Gems) draw card badges: rounded tokens drawn by rarity (common 70%, rare 27%, epic 3%, among the rarities that still have one to draw), each continuing the same saved random sequence, so reloading never draws again.
The first copy of a badge rises onto the screen with rays behind it; a repeat drops a coin onto its token, its copies bouncing up to their new count before the slash and the copies its next level takes appear, and a level reached sparkles onto the star in its corner.
Ten drawn at once show one at a time, counting 1 / 10 to 10 / 10 (Skip jumps ahead), then all ten together, marking each one new or levelled up.
The first copy opens level 1 and counts toward level 2; 3, 5, 8, 12, 20 and 32 copies reach levels 2 to 7 (80 in all), each token showing its copies toward the next under it, and a badge at level 7 is no longer drawn.
Drag a token onto a card, in the hand or the deck, to attach it: a card holds one badge (more with Badge Slots research) and a badge sits on one card, so dropping one on a card whose slots are full swaps it with the card's bottom badge (or takes that one off, for a token from the box).
Badges that can't work together, a key colour's < and ≥ gates (YK < with YK ≥) or Effective with Dampen, can't share a card: dropping one there instead opens a box naming the two.
An attached token keeps its place in the box with an X that takes it off, and its card wears small marks of its badges down its top left, top slot first.
**Badge Slots** (Archives research, opened by Tower VI's floor 50 Goal with Badges owned) gives every card one more slot a level: 1 billion Gold and 4 days, then 100 billion and 20 days.
Inside a run a card wears its badges' icons down its top right, and its tooltip has a line for each.
Pressing a token shows what it does at its level, its copies, and, for a gate, a slider to choose its threshold among those its level has opened; under the description, as when one is drawn, a line gives its value at every level, the one in use bright.
Tokens move only in the forest; a run keeps the badges it went in with.

## What badges do

A card **activates** when it reaches its target (or, like Key Siphon, acts in place): **Max HP** boosts max HP by 0.01–0.07%, **HP %** heals 1–7% of max HP, **Silver Touch** pays 1–7 Silver (Silver bonuses apply), **Gold Touch** 1–7 Gold, and **Goldback** the same on the hand's last card only (Gold bonuses and the tower's apply; each target pays its Gold once, so undo can't repeat it), and **XP** pays 1, 4, 9 … 49 XP, rising with the floor as a kill's XP does.
Max HP's boosts add up for the rest of the run into one multiplier on max HP (two boosts of 0.07% make ×1.0014), which also multiplies all max HP gained later in the run (training, a provision, gear), so the Training card's Max HP shows it too; each boost raises HP by the same ratio, keeping its share of max HP, and undo takes it back.
Gates keep their card from acting while their condition fails: **HP <** (HP below 100, 90, 75, 50, 35, 20 or 5% of max HP), **YK <**, **BK <** and **RK <** (holding fewer than 10, 8, 6, 4, 3, 2 or 1 yellow, blue or red keys; drawn only once the Inspiration skill **Key < Badges**, 50 Inspiration beside Yellow Door, is owned), and **YK ≥**, **BK ≥** and **RK ≥** (holding at least 1 to 7 of them; drawn only once **Key ≥ Badges**, 50 Inspiration beside Key < Badges, is owned); a Focus overrides a gate.
**Stairward** has its card pick the target with the shortest walk on to the stairs (in the Delve, the highest), and **Skip Open Nodes** has it pass over any door or monster that opens no new ground, marking each with a violet X for the rest of the floor; each works on one floor in every 7 (level 1) to every floor (level 7).
**Charge** lets its card's path go through up to 1–7 monsters (lethal ones too, as the hand always may) and doors whose keys the hero holds, fighting and opening them on the way to its target.

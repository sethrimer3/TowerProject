# The hand and cards

## The hand

Inside a Tower or Delve run, your **hand** of cards moves the hero instead; taps only inspect, and swipes and keys do nothing (except in Dev mode, which also starts the hand paused).

## Cards

A new profile's hand is its whole deck, one card: **Stairs** (the stairs up; in the Delve, the highest open tile it can reach above any row reached this run, however far off screen, which its card text mentions only once the Tournament, whose runs the Delve plays, is unlocked).
The Inspiration tree opens with three skills down its middle, 1 Inspiration each, every other skill hanging below them: **Door & Key** adds **Door** (a door you hold the keys for, or a Wooden Door you can break down) and **Key** (the closest key of any colour) to the deck and to the hand, after Stairs; **Enemy**, below it, adds **Enemy** (any enemy that can be fought, even a lethal one) to the deck and the hand, after Door and Key; and **Auto-Climb**, below Enemy, lets the hand play by itself (see How the hand plays).
A card those skills add goes into the hand only while it has room; Door & Key's two cards rise onto the screen one after the other, Door first.
Six more cards join the deck from the Inspiration tree: **Heal** (a potion; the Heal skill, 3 Inspiration, below Regen), **Gold Key** (a gold key, never a blue or red one; the Gold Key skill, 3 Inspiration, left of Shroud), **ATK Up** (an ATK pickup; the ATK Up skill, 5 Inspiration, left of Trainers), **DEF Up** (a DEF pickup; the DEF Up skill, 5 Inspiration, under ATK Up) and **Blue Key** (a blue key; the Blue Key skill, 5 Inspiration, after Gold Key, left of it), and **GK Siphon** (the GK Siphon skill, 5 Inspiration, below Thorns in the tree's middle path), which moves nowhere: when its turn comes it trades Max HP training levels, for the rest of the run only, for a gold key, the hero losing the max HP those levels give and standing still for the turn (undo takes it back).
The first use in a run takes 1 level, the second 2, the third 3, and so on, and its card's tooltip in the run says how many times it has been used.
Its levels are the hero's own Max HP ranks and any bought with Silver that run; without enough left for its next use it greys out in the hand and is skipped, so where it sits in the hand decides when it fires.
Below Buy Quantity, the middle path adds twenty more (20 Inspiration each unless said): **Gold Door** (5; a single gold door, while you hold a gold key; a Wooden Door is DOOR's), **Heart Door** (10, left of Heart Door Resilience, which stands left of Gold Door; a Heart Door), **Weak Enemy** (below Gold Door), with **Base Enemy** (neither weak, strong, elite nor a boss) then **Strong Enemy** to its left, **Fast Enemy** (a Fast enemy, of any strength) below Base Enemy, and **Elite Enemy** then **Boss Enemy** (a boss or a Greater Boss) to its right, **Non-Boss Enemy** (40; any enemy but a boss or a Greater Boss) below Boss Enemy, each heading for the closest enemy of its strength that can be fought, **Chest** (a closed treasure chest or area reward chest), **BK Siphon** and **RK Siphon** (GK Siphon's twins: DEF or ATK training levels for a blue or red key, each counting its own uses), **Smelt GK** (a gold key for 10% of max HP; the Smelt Gold Key skill, left of BK Siphon), **GK -> BK** (3 gold keys for a blue key, while 3 are held; left of Smelt Gold Key), then down under it **Smelt BK** (a blue key for 30% of max HP; the Smelt Blue Key skill), **BK -> RK** (30; 3 blue keys for a red key, while 3 are held) and **Smelt RK** (30; a red key for 90% of max HP; the Smelt Red Key skill), each smelt healing past max HP up to the Overheal ceiling, and only while its whole heal fits under it, **Red Key** (a red key), **Torch** (the closest lit torch, putting it out) and **Wooden Door** (a Wooden Door you hold a key for, or can break down and survive).
Below Torch, straight down, **Limit Break 1** to **10** (50 Inspiration each, each after the one before) raise how far ATK, DEF, Max HP, Regen and Shroud train, 500 levels each (see [Training](training.md)).
Two skills on that path open research instead: **Heart Door Resilience** (left of Gold Door, with Heart Door to its left) opens research making every Heart Door drain 5% less of your HP a level, for ten levels, and **Floor Skip Reward** (below BK Siphon, between Torch and Wooden Door) opens research that, when the Skip badge on STAIRS climbs past a Tower floor, pays 10% a level (up to 110%) of the Gold that floor's battles and chests held; both are priced and timed like Undo Count (500 Gold and 8 hours, each level 8 hours more and 500 × n Gold more than the one before), with two and three more levels.
The siphons and trades move nowhere, like GK Siphon, and grey out while they can't act.
**Manual Hand** (10 Inspiration, below GK Siphon, above Gold Door) opens a second hand, the [Manual hand](#the-manual-hand).
Tower V's floor 10 Goal adds **Flying Enemy** to the deck: it heads for the closest Flying monster the Archer's arrows can hurt, stops as soon as one is within the Attack Range, and holds its ground there, a turn at a time, while one is, the arrows doing the work; once none is in reach, the hand moves on.
It can't act unless the hand holds Archer too.
While it is in the hand it also gives the arrows +5% Shot ATK and +5% Attack Speed.
Tower III's floor 10 Goal adds **Archer** to the deck, a plain wooden bow on its face: it never moves the hero, but while the run's hand holds it the hero is an Archer, firing arrows at the closest monster in reach ([The Archer](fights.md#the-archer)), and the Archer's Training rows can be raised with Silver in the run.

## The Manual hand

Once Manual Hand is owned, a slider over the Deck page's hand switches between the **Auto** hand (the hand the rest of this page describes) and the **Manual** hand.
The Manual hand starts with one slot; more cost Gems, 50 for the first and then the same prices as the Auto hand's (100, 200, 300 …).
A deck card goes into whichever hand the slider shows, by pressing it or dragging it to a slot, and a card is in one hand at most.
Beside a hand card's X, a switch with two arrows moves it to the end of the other hand; it is greyed while the other hand is full.
Stairs always stays in the Auto hand, so it wears neither.
Cards in the Manual hand never play by themselves: the hand's automatic play passes them over.
They act only when you press them in a run, just as pressing an Auto hand card does: the card leads the hero to its closest target (or, like the siphons and trades, acts where the hero stands), and no other card can be pressed until it has.
This suits the trades and siphons (GK Siphon, BK Siphon, RK Siphon, GK -> BK, BK -> RK, Smelt GK, Smelt BK, Smelt RK), which then fire only when you choose.
The Manual hand's cards are still held for the whole run: their bonuses, badges and upgrade trees count, and Archer there still makes the hero an Archer, firing on its own as always.
They are never linked into Card Groups.
In a run whose Manual hand holds cards, the bar under the hand shows a **Manual** tab beside the hand's, which shows the Manual hand's cards in the hand's place, to press.
The hand's own tab is then called **Auto**, an arrow on its cards; once Auto-Climb is owned it is called Auto in every run.

## Card bonuses

Some cards also give a bonus for as long as the run's hand holds them, whichever card leads the hero to the key, door or chest; a card's details list it under what it does.
**Gold Key**, **Blue Key** and **Red Key** make each key of their colour picked up worth 5% more (1.05 keys) and pay 1, 2 or 3 more Gold (raised by Gold Bonus, like a key's own Gold); **Key** gives no bonus.
**Gold Door**, **Heart Door** and **Wooden Door** make their doors cost 5% less (shown as *−5% Gold Door cost*): a gold door takes 0.95 of a gold key, a Heart Door drains 95% of the HP it would, and a Wooden Door takes 0.95 of a key, or 95% of the HP breaking it down would take.
A gold door that also drains HP is both: Gold Door cheapens its key and Heart Door its drain.
Each multiplies Key Efficiency, Heart Door Resilience and a card's Effective or Dampen (Key Efficiency at 90% with Gold Door held makes a gold door take 0.855 of a key); **Door** gives no bonus.
The enemy cards but **Enemy** (Weak, Base, Strong, Elite, Boss, Non-Boss, Fast and Flying Enemy) give +5% ATK against the enemies they head for, in fights and for arrows alike, and make each of those enemies drop 5% more Gold when defeated, multiplying every other Gold bonus (shown as *+5% ATK vs Weak Enemies* and *+5% Gold from Weak Enemies*).
Two such cards covering the same enemy add their ATK (+10%) and their Gold (+10%, one ×1.1 on the rest); a Boss Enemy covers Greater Bosses too, and **Enemy** gives no bonus.
The cards' ATK bonuses add together into one factor, which multiplies the rest: equipment's ATK against bosses (+10% from equipment and +5% from Boss Enemy make ×1.155), and for arrows the cards' Shot ATK adds into it (Flying Enemy's +5% vs Flying and +5% Shot ATK make ×1.10).
**Archer** gives its arrows +5% ATK against a boss or Greater Boss (shown as +5% Shot ATK for Bosses); fights are untouched.
**Chest** gives each treasure chest, once Equipment is open, a 1.5% chance of being a **Supply Chest**, which adds Equipment upgrade materials to its Gold (kills drop none) (5 of one category in Tower I and 2 more in each tower after, raised by Material Find), and a 0.5% chance of being an **Equipment Chest**, which adds a Standard piece: 67% Common, 30% Uncommon, 3% Rare (bosses drop none).
Equipment's Supply and Equipment Chest chance raises both chances by its percent.
A chest's kind is settled as its floor is made, by the hand the run went in with: a Supply Chest shows a light blue glow and one star in its upper-left corner, an Equipment Chest a purple glow and two stars, and both marks stay once it is opened.
Otherwise a treasure chest holds only Gold.
The card's details show these as *1.5% Supplies* in light blue and *0.5% Equipment* in purple.
A profile from before the Key card holds Key in Gold Key's place, with any badges and links Gold Key had; the Gold Key skill earns Gold Key back.

## How the hand plays

Each new card rises from the bottom of the screen to its middle, green rays turning behind it and what it does written below, until you press it.
Until **Auto-Climb** is owned, the hand moves only for a card you press (see Pressing a card): once the hero reaches that card's target, the hand pauses and waits for the next press, its status line saying so, or, when no card can reach anything, is stuck (below).
Once Auto-Climb is owned, whenever the hero has no path to follow, the first card that can reach a target over open floor and items picks its closest one, and the hero walks the shortest path there, one step per tick of the movement speed (2 steps a second for a new hero); of equally short paths it takes the one stepping on the fewest items (keys, potions, ATK and DEF shards, treasure chests) and lit torches, so it walks round them unless they lie on the only shortest way, leaving them to the cards that aim at them (an area reward chest is no item here).
Tapped routes do the same; the card glows as it moves, and keeps glowing while the hand is paused; playing on carries on along the same path.
When no card can act, the hand pauses and End Climb (End Run in the Delve) shows in red at the foot of the floor column (and in the run's menu): the run ends only when you end it.
Its dialog lists what blocks the way, closest first: each door, enemy, stairs or ignored tile at the edge of the ground the hero can reach, how far up or down it stands, and why no card gets past it (the keys or ATK you hold that fall short, a badge holding its card back, or no card in the hand for it).
The hand searches all the ground the hero can reach, however far off screen.
Whatever you do next (training for the run, Ignore, and later skills) checks the hand again, and once a card can act it plays on by itself with Auto-Climb, or waits for a press without it.

## Play, pause and speed

The play/pause button (where Automove was, showing ▶ while paused and ❚❚ while playing, with the hero's movement speed under it, *3x* for 3 steps a second) pauses the hand to look around, and undo pauses it too.
The ‹ and › arrows either side of the speed (a press anywhere on its side of the row counts) slow and speed the hero a step a second at a time, from 0 to 3 (more with research; › closes at the most allowed): slowing to 0 pauses the hand, and playing it again starts at 1.
A new hero walks at 2; once Door & Key is owned, ten steps into a Tower run's first floor the game pauses once, a pointing hand under ›, until the player speeds up to 3, then plays on (a hero already at 3 never sees it).
The forest's Automove keeps the speed last set in a run, but never walks slower than 3.
The cards sit in the row under the board.
They keep their size however many the hand holds; a hand wider than the screen scrolls sideways, swiped or wheel-scrolled, with a small arrow at each side it can scroll further to (none at an end it has reached).
Each run keeps the hand as it was ordered when the run went inside, however the hand is rearranged before the next.

## The Deck page

**Combat Stance** (1 Inspiration, below Auto-Climb in the Inspiration tree) adds a **Deck** tab after Tower and Delve.
In the default interface, occupied cards use one full-size card frame, while empty slots keep their own frames.
The Deck page shows the hand's slots along the top: four, five with **Larger Hand** (1 Inspiration, between Trainers and Shroud), and one more for each slot bought with Gems after that (50, 100, 200, 300, 400, 500, 600, 750, 1,000, 1,200, 1,400, 1,600, 1,800, 2,500, 3,500, 4,500, 5,500, 6,500, 7,500, 8,500 and 10,000 Gems, up to 26), the next for sale standing after them; dragging a card to another slot (or moving a focused card with the arrow keys) shifts each card in between over one, and the new order is saved at once.
The chevron beside the **Hand** heading hides the hand, making room for the deck and badges below, and shows it again; the hand shows once more each time you come back to the page.
Below the hand sits the deck, locked until **Buildout** (1 Inspiration, after Combat Stance): then the deck's cards are laid out on a grid, those in the hand greyed out with a check that returns them to the deck, and pressing any other card adds it to the hand's first empty slot.
Dragging one onto a hand slot puts it there instead: with room in the hand, the cards from that slot on slide one slot later; with the hand full, the card in that slot goes back to the deck (never STAIRS).
A hand card shows an X in its corner while hovered (always, on touch screens) that also returns it to the deck, as does dragging it onto the deck (which lights up while it is held there).
A hand must always hold STAIRS, which has no X and can only be reordered; every other card is optional.
Every change is saved at once.
The first visit teaches the drag: a note explains the order and a hand points at STAIRS, the other cards and tabs stay disabled until STAIRS is moved, and a dialog then praises the new order.
With Buildout, the next lesson shows the X on ENEMY with a hand pointing at it, and again nothing else can be used until it is pressed; a dialog praises that (closed by pressing anywhere on it), and a note over the deck, dismissed by pressing it, explains adding cards.

## Card levels

Each card has a level of its own, from 0 up to its **max level**, raised by the XP it gains in runs.
Every card's max level starts at 10; buying cards (see Card buys below) raises it, up to 60 for every card with an upgrade tree, whose trees reach every rarity.
A card gains 1 XP each time it activates: its path reaching its target (once any fight there is over), or a card that moves nowhere acting (the siphons and trades); **Flying Enemy** gains it each time it brings a Flying enemy within reach.
**Archer**, which never activates, gains 1 XP for each floor completed for the first time in the run while it is in the run's hand, a floor the Skip badge climbs past included (in the Delve, each equivalent floor passed).

The levels cost, in XP: 100, 200, 300, 400 and 500 for the first five; 700, 900, 1,100, 1,300 and 1,500 for the next five; then 1,800, 2,100, 2,400, 2,700 and 3,000; then 3,500, 4,000, 4,500, 5,000 and 5,500; then 6,250, 7,250, 8,500, 10,000 and 11,750; and from level 26 each level costs 250 XP more than the step before it (13,750, 16,000, 18,500 and so on, up to 230,500 for level 60; 3,541,500 in all).
A card at its max level keeps gaining XP toward the levels above it, so when a card buy raises its max level, the XP it gathered turns into levels at once; a card gains no XP past level 60's.
Each level gives the card 1 card point, to be spent on the card's own tree (see Card trees below).
A card shows its level in small type at its top left, in the hand and on the Deck page, from level 1.
On the Deck page the grey rule between a card's picture and its name is its XP bar, filling in white toward its next level (full at level 60; at its max level, with the XP it keeps gathering).
A card's details show its level on the card and its XP toward the next level in white over the grey line above its name, as on the Deck page, and under its name its rarity with its stars, then its level of its max level and its XP toward the next (*Level 4 / 10 · 340/1,800 XP*, or at the max, *… · buy cards to raise the max*); its card points equal its level, so they aren't repeated; the hand card's tooltip says the same line.
A card can level up during a run: if the card is in view in the hand, a golden glow covers it with the training point icon at its centre for a second, which then rises and fades over the next second, and the glow fades over a third.
A card out of view (in a hand scrolled sideways) shows as a ghost at 75% transparency over the board's top left, a golden glow behind it, with the same icon, the ghost fading once the icon is gone.
Several level-ups play one after another, and wait while a page covers the board.

Back in the forest after a card levels up, the Deck tab carries a red dot with a number: the cards new to the deck and the cards with card points to spend.
Opening the Deck takes the dot away, points spent or not, until the next level-up or new card.
On the Deck page a card with card points to spend wears a gold arrow rising beside its level, and a card new to the deck wears **NEW** in gold at its top right until you meet it: press it for its details, move it, put it in the hand or give it a badge.
The starting hand's cards never wear NEW.

The first time a card has a point to spend, after a run (and after the Deck's lessons on the hand), a note over the forest says cards gain levels as you use them, each level granting a card point, and a hand points at the Deck tab, the only thing that can be pressed.
On the Deck page the hand points at the card with the most points to spend (a hand card first), the only card that can be pressed; pressing it opens its upgrade tree at once.
There the hand points at the button that spends a point on an upgrade that can take one, and **‹ Deck** waits until a point is spent.
A note then encourages you to keep levelling your cards to unlock more bonuses, says Gems will soon unlock stronger rare and special card powers, and that Gems can respec a card.
A player who had already spent a card point never sees the lesson.

## Card trees

Nine cards have a tree of upgrades their card points buy, one level of an upgrade a point.
Each upgrade has a rarity: **common**, **uncommon**, **rare**, **epic** or **legendary**, the rarest the strongest.
A common upgrade holds some levels from the start (10 in all on each tree, a card's starting max level), and common card buys open more on it; a rarer one is sealed until a card buy of its rarity opens it at 1 level, and further buys of that rarity open more, up to 5.
Each tree's tracks start from the card itself, so a track's first upgrade takes points at once; one after another takes points once the one before holds all the levels it started with (a common one's) or 1 level (one a card buy opened).
A tree's bonuses count while the run's hand holds the card, whichever card leads the hero; each adds into one factor with every other card's bonus to the same thing (two cards' +10% Gold Bonus make ×1.2), and that factor multiplies the other kinds of bonus.
A run keeps the trees its hand had as it went inside, so points are spent in the forest only; for 20 Gems a card's points all come back, to spend again (the levels card buys opened stay).

On the Deck page, a card with a tree offers **Upgrade tree** in its details, its points left to spend on a second line (*6 points available*), which opens the tree in place of the Deck page; **‹ Deck** (or Escape, or another tab) goes back.
Its top is one compact row (two on a phone): the card, its name, its level of its max level and XP toward the next, the points left to spend (and how many of its points are spent), and **Respec** for 20 Gems.
The upgrades show as a **Tree** or a **List**, chosen by one small switch labelled with both, the Tree first; the choice lasts while the game is open.
A **?** button beside the key says how the tree works and how card buys open it.
In the tree the card stands at the bottom and each track grows up from it: a full upgrade glows gold, one that can take points has a bright rim and pulses, and one waiting on the upgrade below it is dim with a dashed frame and branch, as the key above the tree shows.
A sealed upgrade shows nothing of what it is: an empty dashed frame with a **?**, no name, rarity or count (in the list, *Sealed upgrade*), and choosing it shows no details; an upgrade a card buy opened shows in full even past a sealed one below it.
Each upgrade's frame shows its rarity: grey for a common one, green with a hollow star once card buys opened more of it, silver with a shine now and then and a gold star for uncommon, gold with a shine and two gold stars for rare, rainbow hues running round its edge and three gold stars for epic, and for legendary a white frame on black with a purple star, its icon three times over in shifted hues drifting on cycles of their own, flashing when they line up.
Each upgrade wears its icon, a bar and count of its levels against those opened (*2/5*) and its name under it; the tree can be dragged, panned and zoomed, and its upgrades pulled about, springing back when let go.
Choosing an upgrade shows its details under the tree: its name with one line of its rarity, state and level (*★ Rare · Available · Level 2 / 5*) and **Buy** (or *Full*) and a **?** at the top right, then a line for what it raises, now and with one more level (*Wishing Well: +4% → +6%*); **Buy** (or choosing it again) fills a level with a point, and the upgrades after it sprout open once it holds enough.
With no card points left, **Buy** greys.
The **?** says the rest: that no card points are left, when so, what each level gives in full (*+2% Wishing Well Silver on each floor*), and how many levels card buys can still open on it.
Nothing shows under the tree until an upgrade is chosen, and a press on the tree away from every upgrade lets go of it again.
With a keyboard, the arrow keys move through the tree (up the track, down toward the card, and across), Enter chooses an upgrade and again spends a point, and each point spent is announced to screen readers.
Points are spent in the forest; inside a run the tree only shows.

- **Stairs** has two tracks, each rising one rarity an upgrade.
  Gold: +2% Spare Change Gold a floor (common, 5 levels, up to 10), then a heal of 3% of max HP on each floor, up to the Overheal ceiling (uncommon), +2% Gold Bonus (rare), +1% Free Offense chance (epic), and +5% Overheal Max (legendary), each up to 5 levels.
  Silver: +2% Wishing Well Silver a floor (common, 5 levels, up to 10), then the same 3% heal (uncommon), +2% Silver Bonus (rare), +1% Free Defense chance (epic), and +1% Stair Skip (legendary), each up to 5 levels.
  Overheal Max adds 5% of max HP a level to the Overheal ceiling whether or not Overheal is owned, so on its own it lets potions and heals rise above max HP.
  Stair Skip is a chance that the Tower's stairs, reached by Stairs, climb two floors, as the Skip badge on Stairs does (added to that badge's chance when both are held).
- **Heal** has two tracks, each rising one rarity an upgrade.
  Potions found: +2% chance of a percent potion (common, 5 levels, up to 10, up to every potion), then +0.1 Silver from each potion taken, before Silver Bonus (uncommon), +2% Gold Bonus (rare), +0.5% chance of a free Defense level each floor (epic), and +1% Parry (legendary), each up to 5 levels.
  Healing: +2% HP from every potion (common, 5 levels, up to 10), then +2% Regen (uncommon), +2% shroud against every enemy (rare), +0.01% max HP for the run each time it reaches a potion (epic), and +5% Overheal Max (legendary, as Stairs' own), each up to 5 levels.
  The free Defense chance and Parry add to Free Defense's chance and Parry %, and count from zero without Free Defense trained or Parry owned (20% Parry and Heal's 5% parry 25%).
- **Door** has two tracks, each rising one rarity an upgrade.
  Gold: +2% Gold from doors (common, 5 levels, up to 10), then +0.1 Silver from each door opened, before Silver Bonus (uncommon), +1% Gold Bonus (rare), +0.5% chance of a free Utility level each floor (epic), and **Door Chest**, +0.2% chance an opened door leaves an opened treasure chest where it stood (legendary), each up to 5 levels.
  Cost: −1% of each key every door takes (common, 5 levels, up to 10; it leaves the HP a door takes alone), then **Door Heal**, a heal of 0.5% of max HP on opening each door, after a Heart Door's drain, up to max HP (uncommon), **Skeleton Key**, +1% chance each colour door on a floor is generated a Wooden Door instead (rare), **Lock Pick**, +1% chance each door of two or three colours is generated without its rarest lock, red before blue, so a yellow-blue door is a gold door (epic), and **Secret Knock**, +1% chance a door you can open opens for nothing: no keys, no HP drained and no toll (legendary), each up to 5 levels.
  The free Utility chance adds to Free Utility's and counts without it trained.
  A Door Chest pays as a treasure chest does (a Supply or Equipment Chest at the run's odds).
  Skeleton Key and Lock Pick remake a floor's doors as the floor is first made, Skeleton Key first; Secret Knock and Door Chest roll for each door once, so undo can't roll a door again, and a card heading for a door still counts on paying for it.
- **Gold Door** has two tracks for doors with a gold lock (a door needing a gold key, alone or with other colours; not a Steel Door, which takes any key), each rising one rarity an upgrade, and opens to 60 levels.
  Gold: +2% Gold from doors with a gold lock (common, 5 levels, up to 10), then +0.1 Silver from each opened (uncommon), +1% Gold Bonus (rare), +0.5% chance of a free Utility level each floor (epic), and **Gold Door Chest**, +0.2% chance an opened door with a gold lock leaves an opened treasure chest (legendary), each up to 5 levels.
  Cost: −1% of each gold key a door takes (common, 5 levels, up to 10; Gold Key's own cut, on any door), then **Gold Door Heal**, a heal of 0.5% of max HP on opening each door with a gold lock, after a Heart Door's drain (uncommon), **Gold Door Transmute**, +4% chance each Wooden and Steel Door on a floor is generated a Gold Door instead, keeping a Heart Door's drain (rare), **Gold Lock Pick**, +1% Lock Pick chance, which never takes a gold lock (epic), and **Gold Knock**, +1% chance a door with a gold lock you can open opens for nothing (legendary), each up to 5 levels.
  Its Gold adds to Door's Door Gold, its gold key cut to Gold Key's, and its Silver, heal, chest, Lock Pick and knock chances to Door's own, as one amount.
  Transmute remakes a floor's doors as Skeleton Key does, by each door's fixed number; Gold Knock and Gold Door Chest roll once a door, with Door's.
- **Heart Door** has two tracks for Heart Doors (any door draining HP, a Blue Heart Door or a Steel Heart Door included), each rising one rarity an upgrade, and opens to 60 levels.
  Gold: +2% Gold from Heart Doors (common, 5 levels, up to 10), then +0.1 Silver from each opened (uncommon), +1% Gold Bonus (rare), +0.5% chance of a free Defense level each floor (epic), and **Heart Door Chest**, +0.2% chance an opened Heart Door leaves an opened treasure chest (legendary), each up to 5 levels.
  Cost: −1% of the HP each Heart Door drains (common, 5 levels, up to 10; added to the card's own −5%), then **Wooden Door Transmute**, +2% chance each Heart Door taking no keys on a floor is generated a Wooden Door instead (uncommon), **Shroud Growth**, +0.05% shroud against every enemy for the rest of the run each time you pay a Heart Door's drain (rare), **Heart Lock Pick**, +1% chance each Heart Door that also takes keys is generated without its drain, a plain keyed door (epic), and **Heart Knock**, +1% chance a Heart Door you can open opens for nothing: no keys, no HP (legendary), each up to 5 levels.
- **Wooden Door** has two tracks for Wooden Doors, each rising one rarity an upgrade, and opens to 60 levels.
  Gold: +2% Gold from Wooden Doors (common, 5 levels, up to 10), then +0.1 Silver from each opened (uncommon), +1% Gold Bonus (rare), +0.5% chance of a free Defense level each floor (epic), and **Wooden Door Chest**, +0.2% chance an opened Wooden Door leaves an opened treasure chest (legendary), each up to 5 levels.
  Cost: −1% of the key each Wooden Door takes (common, 5 levels, up to 10; added to the card's own −5%), then **Durability**, −2% of the HP breaking down each Wooden Door takes (uncommon), **Wooden Door Transmute**, +4% chance each Heart Door taking no keys on a floor is generated a Wooden Door instead (rare), **Wooden Lock Pick**, +1% chance a Wooden Door opens for nothing: no key, no HP (epic), and **Druidic Talent**, +1% chance an opened Wooden Door gives you a gold key, broken down or not (legendary), each up to 5 levels.
- The two cards' Wooden Door Transmutes add up, as one chance, and remake a floor's doors as Skeleton Key does, by each door's fixed number; so does Heart Lock Pick.
  Their Gold adds to Door's Door Gold, and their Silver, chest and knock chances to Door's own, as one amount (a Gold Heart Door counts for Gold Door and Heart Door both); each rolls once a door, with Door's.
  A door opened for nothing (a knock or a Master Key) pays no drain, so it grows no shroud; Druidic Talent rolls on every Wooden Door opened.
- **Key** has three tracks, each rising one rarity an upgrade.
  Heal: **Key Heal**, a heal of 1% of max HP with each key picked up, up to max HP (common, 2 levels, up to 5), then **Key Overheal**, a heal of 1% of the HP ceiling with each key, up to that ceiling (uncommon): the ceiling is max HP raised by Overheal, so with Overheal it heals above max HP.
  Gold: +2% Gold from each key (common, 4 levels, up to 5), then +0.1 Silver from each key picked up, before Silver Bonus (uncommon), +1% Gold Bonus (rare), +0.5% chance of a free Utility level each floor (epic, as Door's own), and **Key Chest**, +0.2% chance a key picked up leaves an opened treasure chest where it lay (legendary, as Door Chest pays), each up to 5 levels.
  Keys: +1% more each key of every colour (common, 4 levels, up to 5), then −1% of the key or HP each Wooden and Steel Door takes (uncommon), −1% of the keys and HP each Heart Door takes (rare), **Locksmith**, +1% chance a key picked up is two (epic), and **Master Key**, +0.2% chance a key picked up opens every door on its floor at once (legendary), each up to 5 levels.
  Master Key's doors open for nothing, each paying as a door opened does: its Gold, Door's Door Silver and Door Heal, and a Door Chest roll.
  In the Delve, a key's floor is the doors of its area at the same equivalent floor.
  Locksmith, Key Chest and Master Key roll for each key once, so undo can't roll a key again.
- **Gold Key** has three tracks for gold keys, each rising one rarity an upgrade, and opens to 60 levels.
  Heal: 1% of max HP healed with each gold key picked up (common, 2 levels, up to 5), then 1% of the HP ceiling, Overheal included (uncommon), each up to 5 levels.
  Gold: +2% Gold from each gold key (common, 4 levels, up to 5), then +0.1 Silver from each gold key picked up (uncommon), +1% Gold Bonus (rare), +0.5% chance of a free Utility level each floor (epic), and +0.2% chance a gold key picked up leaves an opened treasure chest (legendary), each up to 5 levels.
  Keys: +1% more each gold key (common, 4 levels, up to 5), then −1% of each gold key a door takes (uncommon), +5% max HP for the run (rare), **Locksmith Gold**, +1% chance a gold key picked up is two (epic), and **Master Gold Key**, +2% chance a gold key picked up opens every door with a gold lock on its floor (legendary), each up to 5 levels.
  Its percents multiply Key's and the key cards' like ones: Key Gold, Key Find and the gold key cut each its own factor, and Max HP its own beside the boons' and the Max HP badge's, training bought in the run raised by it too.
  Its heals, Silver and Key Chest chance add to Key's, as flat amounts do.
  The gold key cut applies on every door that takes a gold key, a door of two or three colours, a Steel Door or a Wooden Door included, and cuts only its gold key.
  Locksmith Gold adds to Key's Locksmith, one chance rolled once a key: Key's 3% and Locksmith Gold's 2% make a gold key two at 5%.
  Master Gold Key rolls apart from Key's Master Key, once a key: Master Key opening every door leaves Master Gold Key nothing more to open.
- **Blue Key** and **Red Key** have Gold Key's tree for their own colour's keys, its upgrades in the same places and working the same way, each level worth more.
  Blue Key: 2% of max HP healed, then 2% of the HP ceiling; +4% Gold, +0.2 Silver, +2% Gold Bonus, +1% chance of a free Utility level and +0.3% Key Chest chance; +2% more each blue key, −1% of each blue key a door takes, +10% max HP, **Locksmith Blue** +1% and **Master Blue Key** +2%.
  Red Key: 3% of max HP healed, then 3% of the HP ceiling; +6% Gold, +0.3 Silver, +3% Gold Bonus, +1.5% chance of a free Utility level and +0.4% Key Chest chance; +3% more each red key, −1% of each red key a door takes, +15% max HP, **Locksmith Red** +1% and **Master Red Key** +1%.
  Their key cuts, Locksmiths and Master Keys work as Gold Key's: the cut on each key of their colour any door takes, Locksmith Blue and Red added to Key's Locksmith, and Master Blue and Master Red Key opening every door with a lock of their colour.
  The three trees' Max HP, Gold Bonus and Free Utility chances add up with each other's, as one card's bonus does with another's.
- **GK -> BK** and **BK -> RK** have two tracks each, for the keys they trade for, each rising one rarity an upgrade, and open to 60 levels.
  GK -> BK's Keys: +1% more each blue key (common, 5 levels, up to 10), then +2% Gold from each blue key (uncommon), +0.1 Silver from each blue key picked up (rare), +1% Gold Bonus (epic), and **Free Utility**, +1% chance of a free Utility level with each trade (legendary), each up to 5 levels.
  GK -> BK's Efficiency: −1% of the gold keys each trade takes (common, 5 levels, up to 10: at −10% a trade takes 2.7 gold keys), then −1% of each blue key a door takes (uncommon), **Extra Blue Key**, +1% chance of a blue key on each floor new to the run (rare), **Blue Forge**, +2% chance a trade gives a second blue key (epic), and **Master Blue Smelter**, +2% chance a Blue Forge gives a third (legendary), each up to 5 levels.
  BK -> RK's are the same for red keys, each level of its Keys track worth more: +1% more each red key, +3% Gold, +0.2 Silver, +2% Gold Bonus and +2% Free Utility; its Efficiency track's −1% of the blue keys a trade takes, −1% of each red key a door takes, +1% Extra Red Key, +2% **Red Forge** and +2% **Master Red Smelter**.
  Their key finds, Gold, Silver and door cuts add to Blue and Red Key's own, as one amount, and their Free Utility counts without Free Utility trained.
  A trade needs only the keys it takes, so with Efficiency it trades with fewer than 3 held, and the card's text names the keys it takes: inside a run by the upgrades the run went in with, in the forest by those the next run takes; Forge, Smelter and Free Utility roll once a trade, so undo can't roll a trade again, and Effective and Dampen scale the keys a Forge gives as they do the first.
  Extra Blue and Red Key come as a floor is first reached, as Find Gold Key does.
- **Smelt GK**, **Smelt BK** and **Smelt RK** have two tracks each, for the key they smelt, each rising one rarity an upgrade, and open to 60 levels.
  Smelt GK's Smelting: +0.2 Gold from each smelt (common, 5 levels, up to 10), then +2% of max HP healed by each smelt (uncommon), +0.1 Silver from each smelt (rare), +1% Gold Bonus (epic), and **Free Defense**, +2% chance of a free Defense level with each smelt (legendary), each up to 5 levels.
  Smelt GK's Efficiency: −1% of the gold key each smelt takes (common, 5 levels, up to 10: at −10% a smelt takes 0.9 of a gold key), then −1% of each gold key a door takes (uncommon), **Extra Gold Key**, +1% chance of a gold key on each floor new to the run (rare), **Key Smelter**, +2% chance a smelt pays twice its Gold (epic), and **Master Gold Smelter**, +2% chance a smelt pays three times its Gold (legendary), each up to 5 levels.
  Smelt BK's are the same for blue keys, each level of its Smelting track worth more: +0.4 Gold, +6% of max HP healed, +0.2 Silver, +2% Gold Bonus, and **Free Offense**, +2% chance of a free Offense level; its Efficiency track's **Extra Blue Key** and **Master Blue Smelter**.
  Smelt RK's: +0.6 Gold, +18% of max HP healed, +0.3 Silver, +3% Gold Bonus, and **Free Upgrades**, +2% chance of a free level of each group (Offense, Defense and Utility, each rolled apart); its Efficiency track's **Extra Red Key** and **Master Red Smelter**.
  A smelt's Gold is raised by Gold Bonus; Key Smelter counts every smelt card's levels together and works on any smelt, and with a Master Smelter's hit too, the Gold is six times over.
  Their door cuts and Extra Keys add to the key cards' and the traders' own, as one amount, and their free levels count without Free Upgrade trained.
  A smelt needs only the key it takes, and the card's text names that and its heal, as a trader's does; its rolls are fixed for each smelt, so undo can't roll a smelt again, and its Gold is paid once, as a badge's is; Effective and Dampen scale its heal, Gold and Silver.
- **Enemy** has three tracks, each rising one rarity an upgrade, and opens to 60 levels.
  Attack: +2% ATK against every enemy (common, 4 levels, up to 5), then +1% Crit % chance (uncommon), +2% Crit x factor (rare), +2% XP from every kill (epic), and **Surprise Attack**, +5% chance the first strike of a fight right after a Dash deals twice your ATK (legendary), each up to 5 levels.
  Defense: +2% DEF against every enemy (common, 3 levels, up to 5), then +2% shroud against every enemy (uncommon), **Weaken**, −1% ATK for every enemy (rare), and **Lifesteal Overheal**, Lifesteal healing up to 5% above max HP (epic), each up to 5 levels.
  Gold: +1% Gold from every kill (common, 3 levels, up to 5), then +1% Silver from every kill (uncommon) and +2% more enemies of every strength on each floor (rare), each up to 5 levels.
  Crit % and Crit x are raised by their share, as their research raises them, so they need the Critical skill and Crit % trained.
  Weaken multiplies every enemy's ATK, as the enemies show it, fight it and shoot with it: 5 levels make it 95%.
  A Dash stops short of an enemy, and the fight you step into from there on the next turn is a surprise: Surprise Attack rolls once for each enemy's tile, so undo can't roll it again.
  A Surprise Attack's first strike rises in a gold outline, as a fully charged arrow's does.
  A Fast enemy caught by one loses its first strike: you strike first.
- **Weak Enemy**, **Base Enemy**, **Strong Enemy**, **Elite Enemy**, **Boss Enemy**, **Non-Boss Enemy**, **Fast Enemy** and **Flying Enemy** each have a tree whose upgrades work only against the enemies the card heads for (Boss Enemy's against bosses and Greater Bosses alike), but where an upgrade says every enemy; **Archer**'s tree works against every enemy.
  Each has two tracks, each rising one rarity an upgrade, every upgrade after a track's first up to 5 levels.
  Weak Enemy, to 60 levels:
  Gold: +5% Gold from each weak enemy killed (common, 5 levels, up to 10), then +0.1 Silver from each (uncommon), +5% Gold from each Instakill of one (rare), **Instakill Salvage**, +1% chance an Instakill of one drops upgrade materials (epic), and **Instakill Vigor**, +0.01% max HP for the run with each Instakill of one (legendary).
  Attack: +5% ATK against weak enemies (common, 5 levels, up to 10), then +2% Crit x factor against them (uncommon), +2% XP from each (rare), +4% more of them on each floor (epic), and Lifesteal healing up to 10% above max HP in fights with them (legendary).
  Base Enemy, to 60 levels:
  Gold: +6% Gold from each base enemy killed (common, 5 levels, up to 10), then +0.1 Silver from each (uncommon), +0.5% chance of a free Defense level each floor (rare), **Salvage**, +1% chance each drops upgrade materials (epic), and **Surprise Attack**, +5% chance against them (legendary).
  Attack: +5% ATK against base enemies (common, 5 levels, up to 10), then +2% Crit % chance against them (uncommon), +2% XP from each (rare), +3% more of them on each floor (epic), and Lifesteal healing up to 10% above max HP in fights with them (legendary).
  Strong Enemy, to 60 levels:
  Gold: +7% Gold from each strong enemy killed (common, 5 levels, up to 10), then +0.2 Silver from each (uncommon), +0.5% chance of a free Offense level each floor (rare), **Salvage**, +1% (epic), and **Surprise Attack**, +5% (legendary).
  Attack: +5% ATK against strong enemies (common, 5 levels, up to 10), then +5% shroud against them (uncommon), +3% XP from each (rare), +2% more of them on each floor (epic), and Lifesteal healing up to 15% above max HP in fights with them (legendary).
  Elite Enemy, to 60 levels:
  Gold: +8% Gold from each elite enemy killed (common, 4 levels, up to 10), then +0.3 Silver from each (uncommon), **Free Upgrade**, +0.5% chance of a free Offense, Defense and Utility level each floor (rare), **Equipment Drop**, +0.1% chance each drops a piece of equipment (epic), and **Surprise Attack**, +5% (legendary).
  Defense: +5% DEF against elite enemies (common, 4 levels, up to 5).
  Attack: +5% ATK against elite enemies (common, 2 levels, up to 5), then +2% Crit % chance against them (uncommon), +4% XP from each (rare), +2% more of them on each floor (epic), and Lifesteal healing up to 20% above max HP in fights with them (legendary).
  Boss Enemy, to 60 levels:
  Gold: +10% Gold from each boss or Greater Boss killed (common, 5 levels, up to 10), then +5% shroud against them (uncommon), +5% DEF against them (rare), **Equipment Drop**, +0.3% (epic), and **Tangle**, −3% of their ATK as a fight with one begins (legendary).
  Attack: +5% ATK against bosses and Greater Bosses (common, 5 levels, up to 10), then +3% Crit % chance against them (uncommon), +4% Crit x factor against them (rare), +1 Cell from each killed (epic), and **Takedown**, −5% of their max HP as a fight with one begins (legendary).
  Non-Boss Enemy, to 60 levels, against every enemy but bosses and Greater Bosses:
  Gold: +5% Gold from each killed (common, 5 levels, up to 10), then +0.1 Silver from each (uncommon), **Free Upgrade**, +0.2% chance of a free Offense, Defense and Utility level each floor (rare), **Salvage**, +1% (epic), and **Surprise Attack**, +5% (legendary).
  Attack: +5% ATK against them (common, 5 levels, up to 10), then +3% Crit x factor against them (uncommon), +2% XP from each (rare), +3% more of them on each floor (epic), and Lifesteal healing up to 10% above max HP in fights with them (legendary).
  Fast Enemy, to 60 levels:
  Gold: +5% Gold from each Fast enemy killed (common, 5 levels, up to 10), then +0.1 Silver from each (uncommon), +0.5% chance of a free Defense level each floor (rare), **Salvage**, +1% (epic), and **Surprise Attack**, +5% (legendary).
  Attack: +5% ATK against Fast enemies (common, 5 levels, up to 10), then +2% Crit % chance (uncommon) and +2% Crit x factor (rare) against every enemy, **First Strike**, +5% chance a Fast enemy loses its first strike, so you strike first (epic), and +10% Regen (legendary).
  Flying Enemy, to 60 levels:
  Gold: +5% Gold from each Flying enemy killed (common, 5 levels, up to 10), then +0.1 Silver from each (uncommon), +0.5% chance of a free Offense level each floor (rare), **Salvage**, +1% (epic), and **Charge Shot**, +10% Charged Shot against Flying enemies (legendary).
  Attack: +5% ATK against Flying enemies (common, 5 levels, up to 10), then +2% Crit % chance (uncommon) and +4% Crit x factor (rare) against them, and against every enemy +4% Attack Speed (**Shot Speed**, epic) and +4% Attack Range (**Range**, legendary).
  Archer, to 60 levels, against every enemy:
  Gold: +5% Gold from each Instakill (common, 5 levels, up to 10), then +0.1 Silver from each kill (uncommon), +5% Shot ATK against bosses and Greater Bosses (rare), **Salvage**, +1% (epic), and **Charge Shot**, +10% Charged Shot (legendary).
  Shots: +5% Shot ATK (common, 5 levels, up to 10), then +2% Crit % chance (uncommon), +5% Crit x factor (rare), +6% Attack Speed (**Shot Speed**, epic) and +6% Attack Range (**Range**, legendary).
  Two cards covering one enemy add their upgrades: Weak Enemy's +20% more weak enemies and Non-Boss Enemy's +15% make 35% more, and their Gold, ATK and the rest add up the same way.
  Their Gold, ATK, DEF, shroud, Crit and XP percents add to the card's own +5% and to Enemy's like ones, as one card factor.
  Their Silver adds to each kill's before Silver Bonus, their Surprise Attack and Lifesteal Overheal to Enemy's, and their Free Upgrade chances to the other cards'.
  Salvage drops a Supply Chest's upgrade materials, and Equipment Drop an Equipment Chest's piece, once Equipment is open; each kill rolls them once, so undo can't roll them again.
  More enemies on each floor are added as More Enemies adds them, counted from those generated there.
  Shot ATK and Shot Speed add to the cards' own Shot ATK and Attack Speed, and the boss Shot ATK to Archer's +5% for bosses.
  Range lengthens only your arrows' reach: a Ranged enemy's stays five sixths of your Attack Range without it.
  Charge Shot raises Charged Shot's percent for each turn an arrow waits, so it does nothing until Charged Shot is researched; Archer's and Flying Enemy's add up against a Flying enemy.
  First Strike rolls once for each Fast enemy's tile, so undo can't roll it again.
- **ATK Up** has two tracks, each rising one rarity an upgrade, and opens to 60 levels.
  Shards: +2% from each ATK shard (common, 5 levels, up to 10), then +3% more (uncommon), +2% Crit % chance (rare), +1% chance of a free Offense level each floor, trained or not (epic), and **Power Strike**, +1% chance an ATK shard taken charges your next fight with twice your ATK (legendary), each up to 5 levels.
  Gold: +10% Gold from each ATK shard (common, 5 levels, up to 10), then +0.1 Silver from each ATK shard taken (uncommon), +1% Silver Bonus (rare), +2% Gold Bonus (epic), and **Takedown**, a boss losing 5% of its max HP as a fight with it begins (legendary), each up to 5 levels.
  A charged Power Strike waits for the next fight, every strike of it rising in a gold outline, and the shard rolls it once, so undo can't roll it again.
- **DEF Up** has the same two tracks for DEF, and opens to 60 levels.
  Shards: +2% from each DEF shard (common, 5 levels, up to 10), then +3% more (uncommon), +10% Regen (rare), +1% chance of a free Defense level each floor, trained or not (epic), and +1% Parry, parried with Parry % or without it (legendary), each up to 5 levels.
  Gold: +10% Gold from each DEF shard (common, 5 levels, up to 10), then +0.1 Silver from each DEF shard taken (uncommon), +1% Silver Bonus (rare), +2% Gold Bonus (epic), and **Tangle**, a boss losing 3% of its ATK as a fight with it begins (legendary), each up to 5 levels.
- Takedown and Tangle open a fight with a boss before your first strike: a glowing X of two sword slashes shrinks onto it and holds for half a second, its HP bar dropping by the share of its max HP taken (it keeps at least 1 HP, and arrows that wounded it still count), and a glowing blue arrow points down behind the X while its ATK is cut.
  ATK Up's and DEF Up's never touch a Greater Boss, which Torch's own cuts do; Boss Enemy's cut both, adding to the others'.
  The cuts count in every forecast: the damage labels, the inspect panel and the hand's choices.
- **Torch** has two tracks against a Greater Boss, and opens to 60 levels.
  Fight: +1% ATK against a Greater Boss (common, 5 levels, up to 10), then +1% DEF against it (uncommon, up to 10 levels, 5 of them before the next opens), +2% shroud against it (rare), **Greater Tangle**, a Greater Boss losing 3% of its ATK as a fight with it begins (epic), and +1% Revive chance, reviving with Revive trained or without it (legendary), each up to 5 levels unless said.
  Cells: +2% Gold from a Greater Boss (common, 5 levels), then +1 Cell from each Greater Boss (uncommon), +2 Cells more (rare), **Greater Takedown**, a Greater Boss losing 3% of its max HP as a fight with it begins (epic), and **Chest Cells**, +1% chance a treasure chest also holds a Greater Boss's Cells (legendary), each up to 5 levels.
  Greater Tangle and Greater Takedown show over a Greater Boss as Tangle and Takedown do over a boss.
- **Chest** has one common upgrade that forks into two tracks once it holds 5 levels, and opens to 60 levels.
  +2% Gold from treasure chests (common, all 10 of the card's first levels).
  Gold: +3% Gold from treasure chests (uncommon), +1 Silver from each chest opened, before Silver Bonus (rare), **Treasure Floor**, +0.5% chance each floor is one whose ATK and DEF shards and potions are all treasure chests (epic), and **Rarity Up**, +1% chance an Equipment Chest's piece is a rarity higher (legendary), each up to 5 levels.
  Chests: +0.2% Supply Chest chance (uncommon, 10 levels, up to 3.5% with the card's own), +0.1% Equipment Chest chance (rare, 10 levels, up to 1.5%), **Double**, +3% chance a chest pays twice over (epic), and **Triple**, +2% chance it pays three times over (legendary), each up to 5 levels unless said.
  Double and Triple multiply a chest's Gold, Silver and a Supply Chest's materials, and an Equipment Chest gives that many pieces; a large ×2 or ×3 flashes over the chest, ×6 when both roll.
  Each chest rolls Double, Triple and Chest Cells once, and each floor Treasure Floor once (in the Delve, each equivalent floor), so undo can't roll them again.

## Card buys

Above the Deck on the Deck page, **Buy ×1** (20 Gems) and **Buy ×10** (200 Gems) buy cards.
Each card bought draws a rarity (common 60%, uncommon 32%, rare 6%, epic 1.5%, legendary 0.5%) and goes to a card of your deck chosen at random among those with an upgrade level of that rarity left to open (a card fully opened leaves the draw).
When no card of your deck has one, it goes to a card chosen at random among those with any level left to open.
It opens one level of that rarity on the card's tree, raising the card's max level by 1: a sealed upgrade of that rarity first, at 1 level, and once all of them are open, one more level on one of them at random.
When the card's upgrades of the rarity drawn are all fully opened, the buy goes to the next rarer rarity the card has room in (so once a Stairs card's common and uncommon upgrades are full, its buys are rare or better); with none rarer, to the rarest commoner one.
The buttons buy only while the deck's cards have that many levels left to open; with none left, buying waits until a new card joins the deck, which then takes every buy.
Each buy continues one random sequence the profile is given when it is made, so reloading never buys again differently.
Short of Gems, the price shows red and a press offers the Shop.
Each card bought is shown on its own, glowing for its rarity: green round its edge for common, silver for uncommon, gold with golden rays shooting out behind it for rare, rainbow hues turning round its edge with rainbow rays for epic, and for legendary the screen darkening behind it as stars shoot out; under it the upgrade it unlocked or raised and its max level before and after.
Ten bought at once show which of the ten is up, with **Skip**, and end on all ten together, those that unlocked an upgrade marked **NEW**; the last screen offers the same purchase again.
Once a card holds an upgrade rarer than common, it wears that rarity's frame in the hand (in runs too), on the Deck page and in its details, whose rarity line shows its stars.

## Card Groups

Tower II's floor 90 Goal opens **Card Groups** on the Deck page: a thin row under each row of the hand holds a hollow light grey diamond between each card and the next (none after the last).
Pressing a diamond links the two cards beside it into a group: the diamond turns white, and a thin white square bracket runs under them from one card's middle to the other's, the diamond on top of it (a group split across two rows of the hand carries its bracket from the end of one row to the start of the next).
Linking more neighbours makes a larger group.
The cards of a group share one priority: of every target any of them would take, the hand heads for the closest (a card that acts in place, like GK Siphon, first of all; of targets as close, the earlier card's).
Link Gold Key and Blue Key, and the hero takes whichever key is nearer.
A group gives way to the cards after it only when none of its cards can act, and a card you press plans alone, its group aside.
A link lasts until its diamond is pressed again or either card moves out of place (dragged to another slot, or out of the hand); a run keeps the groups it went in with.

## Pressing a card

Inside a run, pressing a card in the hand under the board sends the hero to that card's closest target, ahead of the others: it glows white, the hand plays on (even if it was paused), and the card leads until the hero reaches its target, or until it has no path to one, when the hand's order leads again with Auto-Climb (without it, the hand waits for another press).
It costs nothing and works from a new game's first run, a press being how the hand moves at all before Auto-Climb.
While a pressed card is still on its way, no other card can be pressed: it flashes red, as does a card with no path to a target, which costs nothing.
A card with no path also says *No open path exists.* over itself for 3 seconds, or until the next press anywhere.
Without Auto-Climb, a golden glow pulses round the hero while it waits for a card to be pressed, until a press sets it moving.
A press plans the card whatever a gate badge on it says.
Undo brings back the pressed card of the moment it returns to.

## Ignore and Target

Below Interest and Mug at the foot of the Breakthrough tree, four skills (20 Breakthrough each) give the run more of a say.
**Ignore** (below Interest) adds a button beside the potions, a red ⊘ with the uses left: press it, then tap a tile, and no card's path (nor Target's) steps on that tile for the rest of the floor, marked with a red ⊘.
A run gets 1 use, and **Ignore Count** research adds one a level, up to 10.
A wall, the hero's own tile or one already ignored costs nothing, and pressing the button again puts it away.
**Ignore More** (below Ignore) regains a spent Ignore use every 100 new floors a run climbs (new equivalent floors in the Delve); the count waits while Ignore is full, and its Archives research, **Ignore More**, takes a floor off the wait a level, down to every 10 floors.
**Target** (below Mug) adds a blue crosshair button: press it, then tap a tile, and the hero walks there (round ignored tiles, fighting or opening what stands on the tile itself), marked with a blue ring until it arrives; then the hand's order leads again.
A tile out of reach costs nothing; one that becomes out of reach on the way loses the Target.
A run gets 1 use, and **Target Count** research adds one a level, up to 5 (10 million, 100 million, 1 billion and 10 billion Gold).
**Target More** (below Target) regains Target uses the same way.
The two regain projects each take 90 levels (100 floors down to 10), level n taking n²/10 hours (6 minutes at level 1, 34 days at 90, about 2.8 years in all): Undo Count's Gold raised 5% compounding a level for Ignore More and 10% for Target More.

## Badges

**Badges** (2 Breakthrough, after Physician) opens a **Badges** box on the Deck page, beside the deck: the two share the space below the hand in two columns, each scrolling on its own when its cards or tokens don't fit.
Above the box, **Buy ×1** (20 Gems) and **Buy ×10** (200 Gems) draw card badges: rounded tokens drawn by rarity (common 70%, rare 27%, epic 3%, among the rarities that still have one to draw), each continuing the same saved random sequence, so reloading never draws again.
The first copy of a badge rises onto the screen with rays behind it; a repeat drops a coin onto its token, its copies bouncing up to their new count before the slash and the copies its next level takes appear, and a level reached sparkles onto the star in its corner.
Ten drawn at once show one at a time, counting 1 / 10 to 10 / 10 (Skip jumps ahead), then all ten together, marking each one new or levelled up.
The first copy opens level 1 and counts toward level 2; 3, 5, 8, 12, 20 and 32 copies reach levels 2 to 7 (80 in all), each token showing its copies toward the next under it, and a badge at level 7 is no longer drawn.
Drag a token onto a card, in the hand or the deck, to attach it: a card holds one badge (more with Badge Slots research) and a badge sits on one card, so dropping one on a card whose slots are full swaps it with the card's bottom badge (or takes that one off, for a token from the box).
Badges that can't work together, a key colour's < and ≥ gates (GK < with GK ≥) or Effective with Dampen, can't share a card: dropping one there instead opens a box naming the two.
An attached token keeps its place in the box with an X that takes it off, and its card wears small marks of its badges down its top right, under its X, top slot first.
**Badge Slots** (Archives research, opened by Tower VI's floor 50 Goal with Badges owned) gives every card one more slot a level: 1 billion Gold and 4 days, then 100 billion and 20 days.
Inside a run a card wears its badges' icons down its top right, and its tooltip has a line for each.
Pressing a token shows what it does at its level, its copies, and, for a gate, a slider to choose its threshold among those its level has opened; under the description, as when one is drawn, a line gives its value at every level, the one in use bright.
Tokens move only in the forest; a run keeps the badges it went in with.

## What badges do

A card **activates** when it reaches its target (or, like GK Siphon, acts in place): **Max HP** boosts max HP by 0.01–0.07%, **HP %** heals 1–7% of max HP, **Silver Touch** pays 1–7 Silver (Silver bonuses apply), **Gold Touch** 1–7 Gold, and **Goldback** the same on the hand's last card only (Gold bonuses and the tower's apply; each target pays its Gold once, so undo can't repeat it), and **XP** pays 1, 4, 9 … 49 XP, rising with the floor as a kill's XP does.
Max HP's boosts add up for the rest of the run into one multiplier on max HP (two boosts of 0.07% make ×1.0014), which also multiplies all max HP gained later in the run (training, gear), so the Training card's Max HP shows it too; each boost raises HP by the same ratio, keeping its share of max HP, and undo takes it back.
Gates keep their card from acting while their condition fails: **HP <** (HP below 100, 90, 75, 50, 35, 20 or 5% of max HP), **GK <**, **BK <** and **RK <** (holding fewer than 10, 8, 6, 4, 3, 2 or 1 yellow, blue or red keys; drawn only once the Inspiration skill **Key < Badges**, 50 Inspiration beside Gold Door, is owned), and **GK ≥**, **BK ≥** and **RK ≥** (holding at least 1 to 7 of them; drawn only once **Key ≥ Badges**, 50 Inspiration beside Key < Badges, is owned); a Focus overrides a gate.
**Stairward** has its card pick the target with the shortest walk on to the stairs (in the Delve, the highest), and **Skip Open Nodes** has it pass over any door or monster that opens no new ground, marking each with a violet X for the rest of the floor; each works on one floor in every 7 (level 1) to every floor (level 7).
**Charge** lets its card's path go through up to 1–7 monsters (lethal ones too, as the hand always may) and doors whose keys the hero holds, fighting and opening them on the way to its target.

With Settings → **Sprites** on, cards use distinct pixel-art PNG faces and badges use matching symbols, rarity frames and level stars in the Deck, hand and draw reveals.
Names, levels and gate signs remain readable text; the default setting is off, and a non-default UI theme supplies its own look.

The same optional sprite kit covers the compact Ignore, Target, Bomb, Undo and Play/Pause controls, with their uses and movement speed kept as live text.

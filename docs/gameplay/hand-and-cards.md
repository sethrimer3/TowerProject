# The hand and cards

## The hand

Inside a Tower or Delve run, your **hand** of cards moves the hero instead; taps only inspect, and swipes and keys do nothing (except in Dev mode, which also starts the hand paused).

## Cards

A new profile's hand is its whole deck, one card: **Stairs** (the stairs up; in the Delve, the highest open tile it can reach above any row reached this run, however far off screen, which its card text mentions only once the Tournament, whose runs the Delve plays, is unlocked).
The Inspiration tree opens with three skills down its middle, 1 Inspiration each, every other skill hanging below them: **Door & Key** adds **Door** (a door you hold the keys for, or a Wooden Door you can break down) and **Key** (the closest key of any colour) to the deck and to the hand, after Stairs; **Enemy**, below it, adds **Enemy** (any enemy that can be fought, even a lethal one) to the deck and the hand, after Door and Key; and **Auto-Climb**, below Enemy, lets the hand play by itself (see How the hand plays).
A card those skills add goes into the hand only while it has room; Door & Key's two cards rise onto the screen one after the other, Door first.
Six more cards join the deck from the Inspiration tree: **Heal** (a potion; the Heal skill, 3 Inspiration, below Regen), **Gold Key** (a gold key, never a blue or red one; the Gold Key skill, 3 Inspiration, down and right of Buy Quantity), **ATK Up** (an ATK pickup; the ATK Up skill, 5 Inspiration, left of Trainers), **DEF Up** (a DEF pickup; the DEF Up skill, 5 Inspiration, left of ATK Up) and **Blue Key** (a blue key; the Blue Key skill, 5 Inspiration, after Gold Key, under it), and **GK Siphon** (the GK Siphon skill, 5 Inspiration, below Torch in the tree's middle path), which moves nowhere: when its turn comes it trades Max HP training levels, for the rest of the run only, for a gold key, the hero losing the max HP those levels give and standing still for the turn.
The first use in a run takes 1 level, the second 2, the third 3, and so on, and its card's tooltip in the run says how many times it has been used.
Its levels are the hero's own Max HP ranks and any bought with Silver that run; without enough left for its next use it greys out in the hand and is skipped, so where it sits in the hand decides when it fires.
Below Torch, its paths add more cards (20 Inspiration each unless said): down the middle, two rows under Torch, **Wooden Door** (a Wooden Door you hold a key for, or can break down and survive), then below it **Gold Door** (5; a single gold door, while you hold a gold key; a Wooden Door is DOOR's) and **Heart Door** (10, below Heart Door Resilience, which stands below Gold Door; a Heart Door); down to the left, after Find Gold Key, Key Efficiency and GK Siphon, **BK Siphon** and **RK Siphon** (GK Siphon's twins: DEF or ATK training levels for a blue or red key, each counting its own uses; RK Siphon under Red Key, under BK Siphon, with Key < Badges and Key ≥ Badges below it), **Smelt GK** (a gold key for 10% of max HP; the Smelt Gold Key skill, down and left of BK Siphon), **GK -> BK** (3 gold keys for a blue key, while 3 are held; below Smelt Gold Key), then down under it **Smelt BK** (a blue key for 30% of max HP; the Smelt Blue Key skill), **BK -> RK** (30; 3 blue keys for a red key, while 3 are held) and **Smelt RK** (30; a red key for 90% of max HP; the Smelt Red Key skill), each smelt healing past max HP up to the Overheal ceiling, and only while its whole heal fits under it, and **Red Key** (a red key); and on the wealth path, under Interest, **Chest** (a closed treasure chest or area reward chest), then **Torch** (the closest lit torch, putting it out) and Floor Skip Reward under it.
Under Enemy Combat Level Skips, once Beast Mastery reveals them, **Boss Enemy** (20; a boss or a Greater Boss) and, under it, **Non-Boss Enemy** (40; any enemy but a boss or a Greater Boss) each head for the closest enemy of theirs that can be fought.
Below Torch, straight down, **Limit Break 1** to **10** (50 Inspiration each, each after the one before) raise how far ATK, DEF, Max HP, Regen and Shroud train, 500 levels each, on top of the Breakthrough skill **Esoteric Training**'s 500 (see [Training](training.md)).
Two skills on that path open research instead: **Heart Door Resilience** (below Gold Door, with Heart Door below it) opens research making every Heart Door drain 5% less of your HP a level, for ten levels, and **Floor Skip Reward** (below Chest, right of Torch) opens research that, when the Skip badge on STAIRS climbs past a Tower floor, pays 10% a level (up to 110%) of the Gold that floor's battles and chests held; both are priced and timed like Phoenix Spark Count (500 Gold and 8 hours, each level 8 hours more and 500 × n Gold more than the one before), with two and three more levels.
The siphons and trades move nowhere, like GK Siphon, and grey out while they can't act.
**Manual Hand** (1 Breakthrough, right of Card Mastery in the Breakthrough tree) opens a second hand, the [Manual hand](#the-manual-hand).
Tower V's floor 10 Goal adds **Flying Enemy** to the deck: it heads for the closest Flying monster the Archer's arrows can hurt, stops as soon as one is within the Attack Range, and holds its ground there, a turn at a time, while one is, the arrows doing the work; once none is in reach, the hand moves on.
It can't act unless the hand holds Archer too.
While it is in the hand it also gives the arrows +5% Shot ATK and +5% Attack Speed.
Tower III's floor 10 Goal adds **Archer** to the deck, a plain wooden bow on its face: it never moves the hero, but while the run's hand holds it the hero is an Archer, firing arrows at the closest monster in reach ([The Archer](fights.md#the-archer)), and the Archer's Training rows can be raised with Silver in the run.

## The Gem card

**Gem Card** (2 Breakthrough, under Offline Gold in the Breakthrough tree) adds **Gem** to the deck: it heads for the closest Gem lying on the floor.
It gains no XP from activating; instead it gains XP each time the hero collects a Gem in a run while a hand holds it (1 for a Gem, 5 for a Golden Gem, 25 for a Stellar Gem, each raised by Gem XP).
An Effective or Dampen badge on it scales the Gems its last step collects; parts of a Gem carry over, unseen, to the next Gem found.
A Skip badge never makes a Gem vanish.

Its powers (see [Card powers](#card-powers)) count while either hand (the Auto hand or the Manual hand) holds it, in the forest as well as in a climb: seconds off the [Gem button](currencies-and-shop.md#ad-rewards)'s cooldown, more card XP from each Gem, a Gem of its own on each new floor (in a side room where there is one; missed, it is gone for good, and a floor can hold more than one Gem), the chance a Gem appearing is golden (worth 5 Gems), rewards more banked on the Gem button, a Gem in a treasure chest, and the chance a golden Gem is stellar (worth 25).

## The Manual hand

Once Manual Hand is owned, a slider over the Deck page's hand switches between the **Auto** hand (the hand the rest of this page describes) and the **Manual** hand.
The Manual hand starts with one slot; more cost Gems, 50 for the first and then the same prices as the Auto hand's (100, 200, 300 …).
A deck card goes into whichever hand the slider shows, by pressing it or dragging it to a slot, and a card is in one hand at most.
Beside a hand card's X, a switch with two arrows moves it to the end of the other hand; it is greyed while the other hand is full.
Stairs always stays in the Auto hand, so it wears neither.
Cards in the Manual hand never play by themselves: the hand's automatic play passes them over.
They act only when you press them in a run, just as pressing an Auto hand card does: the card leads the hero to its closest target (or, like the siphons and trades, acts where the hero stands), and no other card can be pressed until it has.
This suits the trades and siphons (GK Siphon, BK Siphon, RK Siphon, GK -> BK, BK -> RK, Smelt GK, Smelt BK, Smelt RK), which then fire only when you choose.
The Manual hand's cards are still held for the whole run: their bonuses, badges and powers count, and Archer there still makes the hero an Archer, firing on its own as always.
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
**Chest** gives each treasure chest, once Equipment is open, a 1.5% chance of being a **Supply Chest**, which adds Equipment upgrade materials to its Gold (5 of one category in Tower I and 2 more in each tower after, raised by Material Find), and a 0.5% chance of being an **Equipment Chest**, which adds a Standard piece: 67% Common, 30% Uncommon, 3% Rare (bosses also drop both now and then: see [Gear and Equipment](gear-and-equipment.md#equipment)).
Equipment's Supply and Equipment Chest chance raises both chances by its percent.
A chest's kind is settled as its floor is made, by the hand the run went in with: a Supply Chest shows a light blue glow and one star in its upper-left corner, an Equipment Chest a purple glow and two stars, and both marks stay once it is opened.
Otherwise a treasure chest holds only Gold.
The card's details show these as *1.5% Supplies* in light blue and *0.5% Equipment* in purple.
A profile from before the Key card holds Key in Gold Key's place, with any badges and links Gold Key had; the Gold Key skill earns Gold Key back.

## How the hand plays

Each new card rises from the bottom of the screen to its middle, green rays turning behind it and what it does written below, until you tap anywhere.
Until **Auto-Climb** is owned, the hand moves only for a card you press (see Pressing a card): once the hero reaches that card's target, the hand pauses and waits for the next press, its status line saying so, or, when no card can reach anything, is stuck (below).
Once Auto-Climb is owned, whenever the hero has no path to follow, the first card that can reach a target over open floor and items picks its closest one, and the hero walks the shortest path there, one step per tick of the movement speed (2 steps a second for a new hero); of equally short paths it takes the one stepping on the fewest items (keys, potions, ATK and DEF shards, treasure chests) and lit torches, so it walks round them unless they lie on the only shortest way, leaving them to the cards that aim at them (an area reward chest is no item here).
Tapped routes do the same; the card glows as it moves, and keeps glowing while the hand is paused; playing on carries on along the same path.
When no card can act, the hand pauses and End Climb (End Run in the Delve) shows in red at the foot of the floor column (and in the run's menu): the run ends only when you end it.
Its dialog lists what blocks the way, closest first: each door, enemy, stairs or ignored tile at the edge of the ground the hero can reach, how far up or down it stands, and why no card gets past it (the keys or ATK you hold that fall short, a badge holding its card back, or no card in the hand for it).
The hand searches all the ground the hero can reach, however far off screen.
Whatever you do next (training for the run, Ignore, and later skills) checks the hand again, and once a card can act it plays on by itself with Auto-Climb, or waits for a press without it.

## Play, pause and speed

The play/pause button (where Automove was, showing ▶ while paused and ❚❚ while playing, with the hero's movement speed under it, *3x* for 3 steps a second) pauses the hand to look around.
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
Below the hand sits the deck, locked until **Buildout** (1 Inspiration, after Combat Stance); its grid shows only cards in neither hand.
Tap a card for a pop-up pointing at its sprite, showing its description, bonuses, rarity, level and XP.
Its powers follow, a row each, and while it waits to ascend, its **Ascend** button (see [Ascending](#ascending)).
Swipe up on an available card to move it into the next empty hand slot, or swipe down on a hand card to return it to the deck.
The card flies into its new place while nearby cards slide to close gaps or make room.
A full hand refuses a swiped card with a side-to-side shake and an error sound, leaving both places as they were.
Keyboard users can press Arrow Up on a deck card to add it and Arrow Down on a hand card to return it; STAIRS always stays in the hand.
Reduce motion skips the travel and shifting animations.
Dragging one onto a hand slot with room instead inserts it there, shifting later cards along (an upward drag that ends on the hand counts as this, not a swipe).
Dragged onto a card in a full hand, it swaps with that card, which returns to the deck; STAIRS can't be swapped out.
A hand card shows an X in its corner while hovered (always, on touch screens) that also returns it to the deck, as does dragging it onto the deck (which lights up while it is held there).
A hand must always hold STAIRS, which has no X and can only be reordered; every other card is optional.
Every change is saved at once.
The first visit teaches the drag: a note explains the order and a hand points at STAIRS, the other cards and tabs stay disabled until STAIRS is moved, and a dialog then praises the new order.
With Buildout, the next lesson shows the X on ENEMY with a hand pointing at it, and again nothing else can be used until it is pressed; a dialog praises that (closed by pressing anywhere on it), and a note over the deck, dismissed by pressing it, explains adding cards.

## Card levels and rarity

Each card has a level of its own, from 0 to 60, raised by the XP it gains in runs.
A card gains 1 XP each time it activates: its path reaching its target (once any fight there is over), or a card that moves nowhere acting (the siphons and trades); **Flying Enemy** gains it each time it brings a Flying enemy within reach.
**Angel Wings** (from its Inspiration skill) never moves the hero either: while either hand holds it, it raises the hero once a climb ([Angel Wings](skills-and-stats.md#angel-wings-and-avenging-angel)), and it gains XP as Archer does.
**Archer**, which never activates, gains 1 XP for each floor completed for the first time in the run while it is in the run's hand, a floor the Skip badge climbs past included (in the Delve, each equivalent floor passed).

The levels cost, in XP: 100, 200, 300, 400 and 500 for the first five; 700, 900, 1,100, 1,300 and 1,500 for the next five; then 1,800, 2,100, 2,400, 2,700 and 3,000; then 3,500, 4,000, 4,500, 5,000 and 5,500; then 6,250, 7,250, 8,500, 10,000 and 11,750; and from level 26 each level costs 250 XP more than the step before it (13,750, 16,000, 18,500 and so on, up to 230,500 for level 60; 3,541,500 in all).
A card gains no XP past level 60's.

A card's level makes its **rarity**: **Base** at level 0, then **Common** (levels 1 to 10), **Uncommon** (11 to 20), **Rare** (21 to 30), **Epic** (31 to 40), **Legendary** (41 to 50) and **Mythic** (51 to 60).
Each rarity has its own frame, worn in the hand (in runs too), on the Deck page and in a card's details: grey for Base, brown for Common, green with a hollow green star for Uncommon, silver with a shine now and then and a gold star for Rare, gold with a shine and two gold stars for Epic, rainbow hues running round the edge and three gold stars for Legendary, and for Mythic a white frame over a shifting holographic foil and a purple star.

A card shows its level in small type at its top left, in the hand and on the Deck page, from level 1.
On the Deck page the grey rule between a card's picture and its name is its XP bar, filling in white toward its next level (full at level 60, and while it waits to ascend).
A card's pop-up shows its rarity with its stars, then its level of its max level and its XP toward the next (*Level 4 / 10 · 340/1,800 XP*), with **Ready to ascend** or **MAX** in green after them once it can't level further.
A card can level up during a run: if the card is in view in the hand, a golden glow covers it with the training point icon at its centre for a second, which then rises and fades over the next second, and the glow fades over a third.
A card out of view (in a hand scrolled sideways) shows as a ghost at 75% transparency over the board's top left, a golden glow behind it, with the same icon, the ghost fading once the icon is gone.
Several level-ups play one after another, and wait while a page covers the board.

Back in the forest after a card levels up, the Deck tab carries a red dot with a number: the cards new to the deck and the cards ready to ascend, with the Card Ascension skill and the Rubies to pay for it.
Opening the Deck takes the dot away until the next level-up or new card.
On the Deck page a card ready to ascend wears a gold arrow rising beside its level, and a card new to the deck wears **NEW** in gold at its top right until you meet it: press it for its details, move it, put it in the hand or give it a badge.
The starting hand's cards never wear NEW.

## Ascending

A card stops levelling at the last level of its rarity (10, 20, 30, 40 and 50): it keeps gathering XP, and once it holds the XP for the next level it is **Ready to ascend**.
Its pop-up on the Deck page then offers **Ascend**, priced in Rubies, under *Ascend to unlock the next 10 levels with a new power.*
Each rarity's ascension first needs its Breakthrough skill, so a new game's cards stop at level 10: **Card Ascension - Uncommon** (2 Breakthrough, left of Path to Wealth, after Movement Speed), **- Rare** (3, under Uncommon, after it), **- Epic** (4, under Enemy Level Skips, after it), **- Legendary** (6, under Echoes of time, after it, with Ignore now after it) and **- Mythic** (10, right of Limit Break 3, after it).
Until the skill is owned, the pop-up says which one to unlock instead of offering Ascend, and the card wears no rising arrow.
Ascending to Uncommon costs 10 Rubies, to Rare 100, to Epic 1,000, to Legendary 10,000 and to Mythic 100,000.
The button's outline greys while the Rubies held fall short, and it does nothing then.
Ascending raises the card to its next rarity and level at once, and any XP it gathered past that carries on up the new rarity's levels.
A celebration shows the card in its new frame, glowing for its rarity (green for Uncommon, silver for Rare, gold with golden rays for Epic, rainbow hues with rainbow rays for Legendary, and for Mythic the screen darkening as stars shoot out), says **Card ascended!**, and names the **New Power** with what each level of it adds (*+0.1 Silver / level*).
A card at level 60 is **MAX**.
Every card levels and ascends, including the cards with no powers yet (GK Siphon, BK Siphon, RK Siphon, Angel Wings and Flying Enemy).

**Rubies** are kept between runs: each boss and Greater Boss drops as many as its tower's number (1 in Tower I, 9 in Tower IX; in the Delve, its cave's), and the ad prize that once gave card draws gives 10.
They show in the currencies dialog once you have had one, over the Deck section of the Deck page, and in the Stats table's *Rubies earned*.

The **?** left of the **Hand** heading on the Deck page explains how cards, their levels, powers and ascending work.

## Card powers

A card's powers rise by themselves as it levels: there is nothing to spend.
Its **base power** rises with every level it reaches, 1 to 60; each rarity from Common to Mythic opens one more power, which rises once with each of that rarity's ten levels (the Common power at levels 1 to 10, the Uncommon one at 11 to 20, and so on), then stays.
A card's pop-up on the Deck page lists its powers, one a row, with what each gives now; a power not yet reached is dimmed and names the rarity that opens it.
It lists them only up to the next rarity's, so higher ones stay a surprise; with the Dev setting Access to Everything on it lists every rarity's.
A card's powers count while either hand holds it, whichever card leads the hero, and from the moment it levels up, even in the middle of a climb.
Powers that shape a floor as it is made (Skeleton Key, Lock Pick, the Transmutes, Heart Lock Pick and Treasure Floor) are fixed as a climb goes inside, so a card levelling inside changes them from the next climb.
Each power adds into one factor with every other card's bonus to the same thing (two cards' +10% Gold Bonus make ×1.2), and that factor multiplies the other kinds of bonus.

Each card's powers, and what one level of each gives:

- **Stairs**: **Floor Heal** (base: Heals 1% of max HP on each floor), **Silver Bonus** (common: +1% Silver Bonus), **Stair Skip** (uncommon: 2% chance the Tower's stairs climb two floors), **Free Upgrade** (rare: +0.5% Free Offense Upgrade chance, trained or not; +0.5% Free Defense Upgrade chance, trained or not; +0.5% Free Utility Upgrade chance, trained or not), **Gold Bonus** (epic: +1% Gold Bonus), **Ruby Chance** (legendary: 1% chance each new floor pays the Rubies a boss of its tower drops), **Enemy Skip** (mythic: +1% Enemy HP and Combat Level Skip chance, each up to 80%).
- **Heal**: **Percent Potions** (base: +1% chance each potion is a percent potion), **Potion Heal** (common: +2% HP from every potion), **Shroud** (uncommon: +2% shroud against every enemy), **Free Defense** (rare: +0.5% Free Defense Upgrade chance, trained or not), **Overheal Max** (epic: +5% of max HP on the Overheal ceiling, Overheal owned or not), **Potion Vigor** (legendary: +0.01% max HP for the climb each time a potion is reached), **Parry** (mythic: +0.5% Parry, owned or not).
- **Door**: **Door Cost** (base: −0.4% of each key every door takes), **Door Gold** (common: +2% Gold from doors), **Free Utility** (uncommon: +0.5% Free Utility Upgrade chance, trained or not), **Skeleton Key** (rare: 1% chance each colour door on a floor is a Wooden Door), **Lock Pick** (epic: 1% chance each door of two or three colours loses its rarest lock), **Secret Knock** (legendary: 1% chance a door opens for nothing: no keys, no HP), **Door Chest** (mythic: 0.25% chance an opened door leaves a treasure chest).
- **Gold Door**: **Gold key cost** (base: −0.5% of each gold key a door takes), **Silver per door with a gold lock** (common: +0.1 Silver from each door with a gold lock opened), **Gold Door Gold** (uncommon: +2% Gold from doors with a gold lock), **Gold Bonus** (rare: +1% Gold Bonus), **Lock Pick chance** (epic: 1% chance each door of two or three colours loses its rarest lock), **Gold Knock chance** (legendary: 1% chance a door with a gold lock opens for nothing: no keys, no HP), **Gold Door Chest chance** (mythic: 0.5% chance an opened door with a gold lock leaves a treasure chest).
- **Heart Door**: **Heart Door drain** (base: −0.3% of the HP each Heart Door drains), **Wooden Door Transmute chance** (common: 2% chance each Heart Door taking no keys on a floor is a Wooden Door), **Heart Door Gold** (uncommon: +3% Gold from Heart Doors), **Heart Lock Pick chance** (rare: 1% chance each Heart Door taking keys on a floor loses its drain), **Shroud per Heart Door** (epic: +0.05% shroud against every enemy for the climb, each Heart Door's drain paid), **Heart Knock chance** (legendary: 1% chance a Heart Door opens for nothing: no keys, no HP), **Heart Door Chest chance** (mythic: 1% chance an opened Heart Door leaves a treasure chest).
- **Wooden Door**: **Wooden Door key cost** (base: −0.5% of the key each Wooden Door takes), **Wooden Door durability** (common: −2% of the HP breaking down each Wooden Door takes), **Wooden Door Transmute chance** (uncommon: 3% chance each Heart Door taking no keys on a floor is a Wooden Door), **Wooden Knock chance** (rare: 1% chance a Wooden Door opens for nothing: no keys, no HP), **Transmute Gold to Wood** (epic: 1% chance each Gold Door is a Wooden Door instead, still paying a Gold Door's Gold (from the next climb)), **Druidic Talent chance** (legendary: 1% chance an opened Wooden Door gives a gold key), **Wooden Door Chest chance** (mythic: 1% chance an opened Wooden Door leaves a treasure chest).
- **Key**: **Key Find** (base: +1% more each key of every colour), **Plain Doors** (common: −1% of the key or HP each Wooden Door takes), **Heart Doors** (uncommon: −1% of the keys and HP each Heart Door takes), **Key Overheal** (rare: Heals 1% of the HP ceiling, Overheal included, on picking up each key), **Locksmith** (epic: 1% chance a key picked up is two), **Key Chest** (legendary: 1% chance a key picked up leaves a treasure chest), **Master Key** (mythic: 1% chance a key picked up opens every door on its floor).
- **Gold Key**: **Gold keys found** (base: +1% more each gold key), **Gold key cost** (common: −1% of each gold key a door takes), **Gold Key Gold** (uncommon: +2% Gold from each gold key), **Locksmith Gold chance** (rare: 1% chance a gold key picked up is two), **Gold Key Chest chance** (epic: 0.2% chance a gold key picked up leaves a treasure chest), **Gold Bonus** (legendary: +1% Gold Bonus), **Master Gold Key chance** (mythic: 2% chance a gold key picked up opens every door with a gold lock on its floor).
- **Blue Key**: **Blue keys found** (base: +1% more each blue key), **Blue key cost** (common: −1% of each blue key a door takes), **Blue Key Gold** (uncommon: +4% Gold from each blue key), **Locksmith Blue chance** (rare: 1% chance a blue key picked up is two), **Blue Key Chest chance** (epic: 0.3% chance a blue key picked up leaves a treasure chest), **Gold Bonus** (legendary: +2% Gold Bonus), **Master Blue Key chance** (mythic: 2% chance a blue key picked up opens every door with a blue lock on its floor).
- **Red Key**: **Red keys found** (base: +1% more each red key), **Red key cost** (common: −1% of each red key a door takes), **Red Key Gold** (uncommon: +6% Gold from each red key), **Locksmith Red chance** (rare: 1% chance a red key picked up is two), **Red Key Chest chance** (epic: 0.4% chance a red key picked up leaves a treasure chest), **Gold Bonus** (legendary: +3% Gold Bonus), **Master Red Key chance** (mythic: 2% chance a red key picked up opens every door with a red lock on its floor).
- **GK -> BK**: **Blue keys found** (base: +1% more each blue key), **Blue key cost** (common: −1% of each blue key a door takes), **Keys per trade** (uncommon: −1% of the keys each trade for a blue key takes), **Extra blue key chance** (rare: 1% chance of a blue key on each floor new to the climb), **Blue Key Gold** (epic: +2% Gold from each blue key), **Blue Forge chance** (legendary: 2.5% chance a trade for a blue key gives a second), **Blue Smelter chance** (mythic: 5% chance a Blue Forge gives a third blue key).
- **BK -> RK**: **Red keys found** (base: +1% more each red key), **Red key cost** (common: −1% of each red key a door takes), **Keys per trade** (uncommon: −1% of the keys each trade for a red key takes), **Extra red key chance** (rare: 1% chance of a red key on each floor new to the climb), **Red Key Gold** (epic: +3% Gold from each red key), **Red Forge chance** (legendary: 2.5% chance a trade for a red key gives a second), **Red Smelter chance** (mythic: 5% chance a Red Forge gives a third red key).
- **Smelt GK**: **Key per smelt** (base: −0.5% of the gold key each smelt takes), **Gold key cost** (common: −1% of each gold key a door takes), **Max HP healed per smelt** (uncommon: Each gold key smelted heals 2% more of max HP), **Extra gold key chance** (rare: 1% chance of a gold key on each floor new to the climb), **Gold per smelt** (epic: +0.15 Gold from each gold key smelted, before Gold Bonus), **Key Smelter chance** (legendary: 3% chance any smelt pays twice its Gold), **Master Gold Smelter chance** (mythic: 6% chance a gold key smelted pays three times its Gold, six times with Key Smelter).
- **Smelt BK**: **Key per smelt** (base: −0.5% of the blue key each smelt takes), **Blue key cost** (common: −1% of each blue key a door takes), **Max HP healed per smelt** (uncommon: Each blue key smelted heals 6% more of max HP), **Extra blue key chance** (rare: 1% chance of a blue key on each floor new to the climb), **Gold per smelt** (epic: +0.3 Gold from each blue key smelted, before Gold Bonus), **Key Smelter chance** (legendary: 3% chance any smelt pays twice its Gold), **Master Blue Smelter chance** (mythic: 6% chance a blue key smelted pays three times its Gold, six times with Key Smelter).
- **Smelt RK**: **Key per smelt** (base: −0.5% of the red key each smelt takes), **Red key cost** (common: −1% of each red key a door takes), **Max HP healed per smelt** (uncommon: Each red key smelted heals 18% more of max HP), **Extra red key chance** (rare: 1% chance of a red key on each floor new to the climb), **Gold per smelt** (epic: +0.6 Gold from each red key smelted, before Gold Bonus), **Key Smelter chance** (legendary: 3% chance any smelt pays twice its Gold), **Master Red Smelter chance** (mythic: 6% chance a red key smelted pays three times its Gold, six times with Key Smelter).
- **Enemy**: **ATK vs enemies** (base: +3% ATK against every enemy), **Crit %** (common: +1% Crit % chance), **Crit x** (uncommon: +2% Crit x factor), **Kill XP** (rare: +2% XP from every kill), **Kill Gold** (epic: +2% Gold from every kill), **Enemy ATK** (legendary: −1% ATK for every enemy), **Surprise Attack chance** (mythic: 5% chance the first strike of a fight right after a Dash deals twice your ATK).
- **Boss Enemy**: **ATK vs Bosses** (base: +5% ATK against bosses and Greater Bosses), **Crit % vs Bosses** (common: +3% Crit % chance against bosses and Greater Bosses), **Crit Factor vs Bosses** (uncommon: +4% Crit x factor against bosses and Greater Bosses), **Boss Cells** (rare: +1 Cell from each boss or Greater Boss killed), **Boss Rubies** (epic: +0.2 Rubies from each boss and Greater Boss (a fraction is the chance of one more)), **Equipment drop chance** (legendary: 0.3% chance each boss or Greater Boss killed drops a piece of equipment), **Takedown** (mythic: A boss or Greater Boss loses 3% of its max HP as a fight with it begins).
- **Non-Boss Enemy**: **ATK vs non-boss enemies** (base: +3% ATK against non-boss enemies), **Crit x vs non-boss enemies** (common: +2% Crit x factor against non-boss enemies), **Lifesteal Overheal** (uncommon: Lifesteal heals up to 10% above max HP against non-boss enemies), **XP from non-boss enemies** (rare: +2% XP from each non-boss enemy killed), **Gold from non-boss enemies** (epic: +3% Gold from each non-boss enemy killed), **Salvage chance** (legendary: 1% chance each non-boss enemy killed drops upgrade materials), **Surprise Attack chance** (mythic: 5% chance the first strike of a fight with a non-boss enemy right after a Dash deals twice your ATK).
- **Archer**: **Range** (base: +1% Attack Range for your arrows), **Spoils** (common: +0.1 Silver from each enemy killed), **Shot ATK** (uncommon: +5% Shot ATK), **Shot Speed** (rare: +6% Attack Speed), **Crit Chance** (epic: +2% Crit % chance), **Crit Factor** (legendary: +5% Crit x factor), **Charge Shot** (mythic: +10% Charged Shot), **Instakill Bounty** (mythic: +5% Gold from each Instakill of an enemy).
- **ATK Up**: **Attack** (base: +2% ATK against every enemy), **ATK Shards** (common: +5% from each ATK shard), **Free Offense** (uncommon: +1% Free Offense Upgrade chance, trained or not), **Crit Chance** (rare: +1% Crit % chance), **Shard Gold** (epic: +10% Gold from each ATK shard), **Gold Bonus** (legendary: +1% Gold Bonus), **Takedown** (mythic: A boss loses 2.5% of its max HP as a fight with it begins).
- **DEF Up**: **Defense** (base: +2% DEF against every enemy), **DEF Shards** (common: +5% from each DEF shard), **Free Defense** (uncommon: +1% Free Defense Upgrade chance, trained or not), **Parry** (rare: +1% Parry, owned or not), **Shard Gold** (epic: +10% Gold from each DEF shard), **Gold Bonus** (legendary: +1% Gold Bonus), **Tangle** (mythic: A boss loses 5% of its ATK as a fight with it begins).
- **Torch**: **Torch Loot** (base: +0.1 Gold from each torch put out; +0.1 Silver from each torch put out), **Greater Boss Gold** (common: +2% Gold from a Greater Boss), **Greater Boss Cells** (uncommon: +1 Cell from each Greater Boss), **Chest Cells chance** (rare: 1% chance a treasure chest holds a Greater Boss's Cells), **Greater Boss Tangle** (epic: A Greater Boss loses 3% of its ATK as a fight with it begins), **Greater Boss Takedown** (legendary: A Greater Boss loses 3% of its max HP as a fight with it begins), **Revive chance** (mythic: +0.5% Revive chance).
- **Chest**: **Chest Gold** (base: +1% Gold from treasure chests), **Supply Chest chance** (common: +0.2% Supply Chest chance), **Equipment Chest chance** (uncommon: +0.1% Equipment Chest chance), **Double chance** (rare: 3% chance a treasure chest pays twice over), **Triple chance** (epic: 2% chance a treasure chest pays three times over), **Treasure Floor chance** (legendary: 0.3% chance each floor is a Treasure Floor: its shards and potions are treasure chests), **Rarity Up chance** (mythic: 0.5% chance an Equipment Chest's piece is a rarity higher).
- **Gem**: **Seconds off the Gem cooldown** (base: −3 seconds off the Gem button's cooldown), **Gem Card XP** (common: +110% card XP from each Gem collected), **Gem a floor chance** (uncommon: 0.3% chance of a Gem of its own on each new floor, in a side room where there is one; missed, it is gone), **Golden Gem chance** (rare: 1% chance a Gem appearing in a climb is a Golden Gem, worth 5 Gems and 5 card XP), **Gem rewards banked** (epic: +0.5 rewards the Gem button banks: unclaimed, it goes on banking one each cooldown until full, a claim taking them all), **Gem in a chest chance** (legendary: 0.5% chance a treasure chest holds a Gem), **Stellar Gem chance** (mythic: 2% chance a Golden Gem is a Stellar Gem instead, worth 25 Gems and 25 card XP).

How some of them work:
- Overheal Max adds percents of max HP to the Overheal ceiling whether or not Overheal is owned, so on its own it lets potions and heals rise above max HP.
- The Free Upgrade, Free Offense, Free Defense and Free Utility chances, Parry and Revive add to the trained chances and count from zero without them trained or owned.
- Stair Skip is a chance that the Tower's stairs, reached by Stairs, climb two floors, as the Skip badge on Stairs does (added to that badge's chance when both are held).
- Ruby Chance rolls once on each floor new to the climb (in the Delve, each equivalent floor), paying the Rubies a boss of that tower would drop.
- Enemy Skip raises both Enemy Level Skip chances by its percent, each up to 80% (a chance already past 80% stays).
- Boss Rubies adds to every boss's and Greater Boss's Rubies; a fraction of a Ruby is the chance of one more, fixed by the boss's tile.
- Torch Loot pays its Gold (before Gold Bonus) and Silver with each torch put out.
- Door Chest, Key Chest and the door cards' chests leave an opened treasure chest that pays as a treasure chest does (a Supply or Equipment Chest at the climb's odds).
- Skeleton Key remakes a colour door as a Wooden Door, Lock Pick takes the rarest lock off a door of two or three colours, Wooden Door Transmute makes a Heart Door taking no keys a Wooden Door, Heart Lock Pick takes a keyed door's drain off, and Transmute Gold to Wood makes a Gold Door a Wooden Door that still pays a Gold Door's Gold; each by the door's fixed number, so a higher chance only remakes more doors.
- Secret Knock and the door cards' knocks open a door you can already open for nothing; a card heading for a door still counts on paying for it.
- The door cards' Gold, Silver, chest and knock add to Door's own for their doors (a door with a gold lock for Gold Door, any door draining HP for Heart Door, a Wooden Door for Wooden Door).
- The key colour cards' and the trades' and smelts' Gold key cost, Blue key cost and Red key cost add up, each its own factor on that colour's key on any door.
- Locksmith makes a key picked up two, and Master Key opens every door on its floor (each colour's Master Key, the doors with that colour's lock).
- Forge gives a second key from a trade and Smelter a third when Forge does; Key Smelter doubles a smelt's Gold and each smelt's Master Smelter triples it.
- Double and Triple multiply a chest's Gold, Silver and a Supply Chest's materials, and an Equipment Chest gives that many pieces; a large ×2 or ×3 flashes over the chest, ×6 when both roll.
- Takedown and Tangle take a share of a boss's max HP and ATK as a fight with it begins, their Greater kin a Greater Boss's, behind an opening before the first strike.
- Gem rewards banked adds half a reward a level to the [Gem button](currencies-and-shop.md#ad-rewards)'s bank: each whole one always, and a half one on a refill whose roll comes up, rolled each time the bank is claimed.

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
A glowing golden line runs along the path from the hero to the card's target, shrinking behind the hero as it steps, so you see each step it will take and what it is heading for.
With Auto-Climb, the **Show path** toggle (Settings, Toggles) draws the same line for the card the hand chooses itself.
It costs nothing and works from a new game's first run, a press being how the hand moves at all before Auto-Climb.
While a pressed card is still on its way, no other card can be pressed: it flashes red, as does a card with no path to a target, which costs nothing.
A card with no path also says *No open path exists.* over itself for 3 seconds, or until the next press anywhere.
Without Auto-Climb, the hero waits for a card to be pressed before moving; its golden waiting pulse is temporarily disabled.
A press plans the card whatever a gate badge on it says.

## Ignore and Target

Below Card Ascension - Legendary, under Echoes of time in the Breakthrough tree, four skills (Ignore and Target 3 Breakthrough each, Ignore More and Target More 4) give the run more of a say.
**Ignore** (below Card Ascension - Legendary, after it) adds a button beside the potions, a red ⊘ with the uses left: press it, then tap a tile, and no card's path (nor Target's) steps on that tile for the rest of the floor, marked with a red ⊘.
A run gets 1 use, and **Ignore Count** research adds one a level, up to 10.
A wall, the hero's own tile or one already ignored costs nothing, and pressing the button again puts it away.
**Ignore More** (below Ignore) regains a spent Ignore use every 100 new floors a run climbs (new equivalent floors in the Delve); the count waits while Ignore is full, and its Archives research, **Ignore More**, takes a floor off the wait a level, down to every 10 floors.
**Target** (right of Ignore, after it) adds a blue crosshair button: press it, then tap a tile, and the hero walks there (round ignored tiles, fighting or opening what stands on the tile itself), marked with a blue ring until it arrives; then the hand's order leads again.
A tile out of reach costs nothing; one that becomes out of reach on the way loses the Target.
A run gets 1 use, and **Target Count** research adds one a level, up to 5 (10 million, 100 million, 1 billion and 10 billion Gold).
**Target More** (below Target) regains Target uses the same way.
The two regain projects each take 90 levels (100 floors down to 10), level n taking n²/10 hours (6 minutes at level 1, 34 days at 90, about 2.8 years in all): Phoenix Spark Count's Gold raised 5% compounding a level for Ignore More and 10% for Target More.

## Badges

**Badges** (3 Breakthrough, after Enemy Level Skips) opens a **Badges** box on the Deck page, beside the deck: the two share the space below the hand in two columns, each scrolling on its own when its cards or tokens don't fit.
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

A card **activates** when it reaches its target (or, like GK Siphon, acts in place): **Max HP** boosts max HP by 0.01–0.07%, **HP %** heals 1–7% of max HP, **Silver Touch** pays 1–7 Silver (Silver bonuses apply), **Gold Touch** 1–7 Gold, and **Goldback** the same on the hand's last card only (Gold bonuses and the tower's apply; each target pays its Gold once), and **XP** pays 1, 4, 9 … 49 XP, rising with the floor as a kill's XP does.
Max HP's boosts add up for the rest of the run into one multiplier on max HP (two boosts of 0.07% make ×1.0014), which also multiplies all max HP gained later in the run (training, gear), so the Training card's Max HP shows it too; each boost raises HP by the same ratio, keeping its share of max HP.
Gates keep their card from acting while their condition fails: **HP <** (HP below 100, 90, 75, 50, 35, 20 or 5% of max HP), **GK <**, **BK <** and **RK <** (holding fewer than 10, 8, 6, 4, 3, 2 or 1 yellow, blue or red keys; drawn only once the Inspiration skill **Key < Badges**, 50 Inspiration beside Gold Door, is owned), and **GK ≥**, **BK ≥** and **RK ≥** (holding at least 1 to 7 of them; drawn only once **Key ≥ Badges**, 50 Inspiration beside Key < Badges, is owned); a Focus overrides a gate.
**Stairward** has its card pick the target with the shortest walk on to the stairs (in the Delve, the highest), and **Skip Open Nodes** has it pass over any door or monster that opens no new ground, marking each with a violet X for the rest of the floor; each works on one floor in every 7 (level 1) to every floor (level 7).
**Charge** lets its card's path go through up to 1–7 monsters (lethal ones too, as the hand always may) and doors whose keys the hero holds, fighting and opening them on the way to its target.

With Settings → **Sprites** on, cards use distinct pixel-art PNG faces and badges use matching symbols, rarity frames and level stars in the Deck, hand and draw reveals.
Names, levels and gate signs remain readable text; the default setting is off, and a non-default UI theme supplies its own look.

The same optional sprite kit covers the compact Ignore, Target, Bomb and Play/Pause controls, with their uses and movement speed kept as live text.

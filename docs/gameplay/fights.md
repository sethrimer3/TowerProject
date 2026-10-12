# Fights

## Rising ATK

Fights loosen the classic Magic Tower rule that DEF equal to a monster's ATK makes it harmless: after every round of a fight the monster's ATK rises by 1% (rounded down), and by at least 1.
High DEF still holds a monster off for a while, but never forever, and a fight with a monster the hero can barely scratch grows lethal instead of dragging on.
The inspect panel's damage already counts the rise.

## How a fight plays out

Stepping into a monster plays the fight out: the hero waits on its own tile and strikes first, the monster strikes back, and each strike's damage rises in red off whoever was struck (a darker red off the hero) while HP counts down in the stats.
From the hero's first strike, the monster's HP shows in a red bar above it, draining with each strike and fading once the monster falls.
**Instant Combat** (1 Courage, left of Movement Speed in the Courage tree) adds **Animate fights** to Settings (hidden until then, and on): turned off, each fight counts at once, in one step, and shows as a summary.
A monster that falls raises nothing (it plainly lost all its HP), and only the damage the hero took rises off the hero.
A fight the hero loses raises the damage each way at once, and the monster's HP bar stays, showing what it has left, so you can judge whether to undo.
A revival shows the fight up to it the same way, and once its golden fire is out the rest of the fight follows as another summary.
The HP the fight has cost so far shows in purple on the HP bar, just past the HP left, and shrinks away over a second once the fight is over.
A health potion picked up does the opposite: the HP it heals shows in light red past the HP you had, the red bar fills up over it in a second, and the HP actually healed rises as a blue +N over the hero (blue is kept for HP gained, as a fight's Lifesteal heals rise too).
The first round's strikes take 0.25 s each, and each later round runs at 90% of the one before, down to 0.05 s a strike.
Once the monster falls the hero steps onto its tile.

## Rewards and feedback

Either way, every reward picked up (an item, a chest's Gold and metal bars, a monster's Equipment materials) rises from its tile as its sprite for about a second, starting at once over anything still rising; what a monster or a chest drops all rises at once, stacked (a monster's Gold just above its Silver and anything else it dropped, like a Greater Boss's Cells or Equipment materials, below them; a chest's Gold above its metal bars), and after a fight played out strike by strike, its drops wait until the last damage numbers start to fade; rewards with no sprite rise as "+N" text.
A door raises each key it took with a minus sign, and a Heart Door, which needs no key but drains the hero's HP to 1, a heart with the HP it took.
Taking the stairs snaps the hero straight onto the new floor with a brief white glow behind it, and while the hero stands on the board's bottom row the status line over it turns half see-through.
Undo during a fight takes back the whole fight.

## Monsters and their pay

A monster's inspect panel, and the messages about its fight, put its strength before its name (Weak, Strong, Elite or Boss), unless it is a normal one.
From Tower II and Delve II on, some monsters are **Fast** (8% at first, more further up and in each tower after): named *Fast …* with a fast-forward mark at the top right of their tile, they strike before the hero, so even one the hero fells in a strike lands a blow, they hit at least 1.75 times as hard as the last tower's floor 100 monster (700 ATK in Tower II; less in Tower III, 1,000 ATK, and Tower IV, 2,000 ATK), and they pay 1 Gold more.
From Tower III and Delve III on, some monsters are **Ranged** (a point fewer than Fast: 7.5% at first, growing as Fast does): named *Ranged …* with an arrow at the top right of their tile (the Fast mark moving below it on a monster that is both), they shoot the hero from a distance, walls and doors no obstacle, without beginning a fight.
A Ranged monster shoots once the hero ends a turn within its reach, five sixths of the hero's own Attack Range (2.5 tiles to the hero's 3), measured straight across, so a knight's move away is in reach, then waits 10 turns before it can shoot again (a 500th of a turn less each floor, a whole turn less every 500 floors; a fraction carries to the next shot, so 9.5 turns fire 10, then 9, apart).
Its shot lands where the hero's step ends: its ATK less DEF, the shroud (whole for every shot) taking what it can of the rest, cut by Parry % when parried; the damage rises over the hero.
A shot that costs HP costs the area's mastery, and one that leaves the hero no HP fells it, as a lost fight does (one undo takes the step back).
The hand and Automove don't plan around shots.
A rush is one turn: its shots come once it stops.
A Ranged monster pays 1 Gold more, and one both Fast and Ranged 2 more.
Every monster beaten pays Gold by its strength: none for a weak one, 1 for a normal one, 2 for a strong one, 4 for an elite one and 5 for a boss.
The stats show the Gold found so far this run beside ATK and DEF; undo never takes Gold back, so it never lowers the count.

## The Archer

Claiming Tower III's floor 10 Goal makes the hero an **Archer** (the name under its portrait says so), in the Tower and the Delve alike.
At the end of each turn its arrow is ready, it shoots the closest monster within its Attack Range (3 tiles to begin with, walls and doors no obstacle) that an arrow can hurt; the arrow flies from the hero and lands as the step ends.
An arrow deals one of the hero's strikes: ATK (raised against bosses, critical hits rolled) less the monster's DEF, Piercing counted, healing by Lifesteal; its damage rises over the monster, whose HP bar shows what it has left.
A wounded monster keeps its wound, so the fight that follows is shorter, and the wound counts in its inspect panel and damage number; undo takes an arrow back with the step.
An arrow that fells a monster pays the kill as a fight would; one that fells an unwounded monster with a single arrow is an instakill, as Mug pays it.
Only Ranged monsters shoot back: the rest strike only when the hero fights them.
The arrow is ready every 10 turns (Attack Speed: 1 shot every 10 turns, more with training), a fraction of a turn carrying to the next; a ready arrow with no monster in reach waits, and fires the turn one comes in reach.
Attack Range and Attack Speed join Offense training from Tower III's floors 20 and 30 ([Training](training.md)).
**ATK / Tile** joins it from floor 50: each arrow's ATK is multiplied by 1 plus its value for every tile to its target, counted straight across (diagonals included), so a monster too well armored for an arrow up close may still be hurt, and shot, from further off.
**Charged Shot** opens in the Archives from floor 80: each turn a ready arrow waits without firing adds its percent (1% a level) to the next arrow's ATK, and that arrow flies in a blue glow and its number rises with a gold outline; the charge starts over once it fires.
ATK / Tile, Charged Shot and a critical hit multiply one another.
**Multishot Chance** and **Multishot Targets** join Offense training from floor 90: each shot has a chance (0.5% a rank, up to 49.5%) to be a multishot, firing at once at the closest enemies an arrow can hurt, 2 of them and one more a Targets rank (up to 9), or one at each when fewer are in range.
Every arrow of a multishot carries the first's Charged Shot, rolls its own critical hit, and has its own ATK / Tile for its own distance.

## Fractions

Gold, HP and the hero's and monsters' stats keep their fractions in play: a 2% ATK bonus on 1 ATK strikes for 1.02, a monster in a higher tower can pay 3.1 Gold, and potion healing raised by research keeps its half points.
The screen shows whole numbers: Gold and the hero's stats rounded down, each strike, heal and reward to the nearest whole, and a monster's stats to two decimals when they aren't whole (one from 100, none from 1,000).

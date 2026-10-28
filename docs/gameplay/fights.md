# Fights

## Rising ATK

Fights loosen the classic Magic Tower rule that DEF equal to a monster's ATK makes it harmless: after every round of a fight the monster's ATK rises by 1% (rounded down), and by at least 1.
High DEF still holds a monster off for a while, but never forever, and a fight with a monster the hero can barely scratch grows lethal instead of dragging on.
The inspect panel's damage already counts the rise.

## How a fight plays out

Stepping into a monster plays the fight out: the hero waits on its own tile and strikes first, the monster strikes back, and each strike's damage rises in red off whoever was struck (a darker red off the hero) while HP counts down in the stats.
From the hero's first strike, the monster's HP shows in a red bar above it, draining with each strike and fading once the monster falls.
**Instant Combat** (1 Breakthrough, left of Movement Speed in the Breakthrough tree) adds **Animate fights** to Settings (hidden until then, and on): turned off, each fight counts at once, in one step, and shows as a summary.
A monster that falls raises nothing (it plainly lost all its HP), and only the damage the hero took rises off the hero.
A fight the hero loses raises the damage each way at once, and the monster's HP bar stays, showing what it has left, so you can judge whether to undo.
A revival shows the fight up to it the same way, and once its golden fire is out the rest of the fight follows as another summary.
While a fight plays out, the HP bar's red already shows the HP the fight will leave, and the HP still to be lost shows in purple just past it, shrinking as each strike lands.
A potion's heal shows in blue past the HP before it, and the red fills over the blue in a second.
With Overheal, HP above max shows as a blue bar over the full red one; while it shows, the fight's purple and a heal's growth (in pale blue) are drawn on it.
A health potion picked up does the opposite: the HP it heals shows in light red past the HP you had, the red bar fills up over it in a second, and the HP actually healed rises as a blue +N over the hero (blue is kept for HP gained, as a fight's Lifesteal heals rise too).
The first round's strikes take 0.25 s each, and each later round runs at 90% of the one before, down to 0.05 s a strike.
Once the monster falls the hero steps onto its tile.

## Rewards and feedback

Either way, every reward picked up (an item, a chest's Gold and what a Supply or Equipment Chest holds) rises from its tile as its sprite for about a second, starting at once over anything still rising; what a monster or a chest drops all rises at once, stacked (a monster's Gold just above its Silver and anything else it dropped, like a Greater Boss's Cells or Equipment materials, below them; a chest's Gold above its metal bars), and after a fight played out strike by strike, its drops wait until the last damage numbers start to fade; rewards with no sprite rise as "+N" text.
Damage and heal numbers rise over the other rewards, but what a monster or a chest drops rises over the numbers.
A door raises each key it took with a minus sign, and a Heart Door, which needs no key but drains the hero's HP to 1, a heart with the HP it took.
Taking the stairs snaps the hero straight onto the new floor.
The white arrival flash and decorative player and staircase halos are temporarily disabled; their blue pixel outlines remain visible.
While the hero stands on the board's bottom row the status line over it turns half see-through.
Undo during a fight takes back the whole fight.

## Monsters and their pay

A monster's inspect panel, and the messages about its fight, put its strength before its name (Weak, Strong, Elite or Boss), unless it is a normal one.
Its inspect panel shows its HP, ATK and DEF as icons, each beside its value.
After its ATK, in brackets, comes what each of its strikes does to the hero, in light red (after DEF and Parry %), and with Lifesteal what each of the hero's strikes heals, in light blue: *(-4 +1.4)*.
After its DEF, in light red, comes what each of the hero's strikes takes off it (Piercing and Giantslayer counted, crits not).
Last comes the Gold killing it would bank, in yellow (every Gold bonus counted, and the Mug bonus when the hero's first strike fells it; none once it has paid).
From Tower II and Delve II on, some monsters are **Fast** (12% at first, 1.5% more every 200 floors up and more in each tower after): named *Fast …* with a fast-forward mark at the top right of their tile, they strike before the hero, so even one the hero fells in a strike lands a blow, they hit at least 1.75 times as hard as the last tower's floor 100 monster (700 ATK in Tower II; less in Towers III, IV and V: 1,000, 2,000 and 4,000 ATK; the Delve's caves alike), and they pay 1 Gold more.
From Tower III and Delve III on, some monsters are **Ranged** (a point and a half fewer than Fast: 11.25% at first, growing as Fast does): named *Ranged …* with an arrow at the top right of their tile (the Fast mark moving below it on a monster that is both), they shoot the hero from a distance, walls and doors no obstacle, without beginning a fight.
A Ranged monster shoots the moment its shot is ready and the hero is within its reach, five sixths of the hero's own Attack Range (2.5 m to the hero's 3; a tile is one meter), measured straight across, so a knight's move away is in reach, then waits 10 turns from that moment before it can shoot again (a 500th of a turn less each floor, a whole turn less every 500 floors).
Every shot fires a share of the way through a turn, as the hero walks its step: a shot ready halfway through a turn fires halfway, and one waiting for the hero fires the moment the hero steps into reach, partway across a tile perhaps.
A monster both Fast and Ranged readies its shot twice as fast: 5 turns at first, half the wait on every floor.
Its shot always hits: its ATK less DEF, cut by Parry % when parried, the shroud (whole for every shot) taking what it can of the rest; the damage rises over the hero.
A shot the hero lives through costs the shooter the hero's thorns (see [Skills and stats](skills-and-stats.md)), which rise in yellow over it with its HP bar, and a shooter its thorns fell counts as any other kill.
A shot that costs HP costs the area's mastery, and one that leaves the hero no HP fells it, as a lost fight does (one undo takes the step back).
The hand and Automove don't plan around shots.
Shots resolve in the order they fire through the turn: a monster an arrow fells shoots no more, and a shot that fells the hero ends the turn there; when the hero's arrow and a monster's shot are ready at the same moment, the arrow lands first.
A dash is one turn, taken all at once: its shots fire from where it stops.
A Ranged monster pays 1 Gold more, and one both Fast and Ranged 2 more.
From Tower V and Delve V on, some monsters are **Flying** (as many as are Ranged: 12.75% at first, growing as Fast does; never a boss or a Shielded monster): named *Flying …*, with a wing at the top right of their tile, they hover a little above it.
A Flying monster shoots the hero as a Ranged one does, from the same reach and as often, but it is never Fast or Ranged as well, and no fight can reach it: the hero walks under it as over open floor, and no card but **Flying Enemy** heads for it.
While the hero stands under one, it shows half see-through.
Only the Archer's arrows can hurt it, and it pays what a Ranged monster does.
A Flying monster an arrow wounds turns **Aggroed**: it closes in on the hero along open floor (never over an item, a lit torch or another monster), a tile each time it could shoot, so 10 turns a tile at first, until it hovers over the hero.
From Tower IV and Delve IV on, a floor may hold one **Shielded** monster (4% of floors at first, 1% more a tower and 1% more every 250 floors to floor 4,000): the monster nearest the way up, boss aside, named *Shielded …*, inside a glowing green bubble.
While it stands, the hero's strikes and arrows on every monster in its bubble, itself included, do 60% less after DEF; a strike that gets past DEF still lands, so no monster becomes unbeatable, and the inspect panel and damage numbers count the cut.
Felling it bursts the bubble at once.
The bubble reaches a tile at first (the four beside it), half a tile more every 1,000 floors, up to 3 tiles from floor 4,000, measured from tile centre to tile centre, so the diagonals come in at floor 829 and two tiles straight out at 2,000.
A Shielded monster with no other in its bubble may bring standard monsters in front of it, nearer the way in (more often further up, one certain for each 100% the chance reaches), which may be Fast or Ranged as any other.
A Shielded monster pays 1 Gold more.
Every monster beaten pays Gold by its strength: none for a weak one, 1 for a normal one, 2 for a strong one, 4 for an elite one and 5 for a boss.
The stats show the Gold found so far this run beside ATK and DEF; undo never takes Gold back, so it never lowers the count.

## The Archer

Claiming Tower III's floor 10 Goal adds the **Archer** card to the deck ([The hand](hand-and-cards.md)); while the run's hand holds it the hero is an **Archer** (the name under its portrait says so), in the Tower and the Delve alike.
Without the card in the hand no arrow flies, and the Archer's Training rows (Attack Range, Attack Speed, ATK / m, Multishot, Rapid Fire) can't be raised with Silver in the run; between runs they train as ever, card or not.
The card gives its arrows +5% ATK against a boss or Greater Boss.
The moment its arrow is ready, it shoots the closest monster within its Attack Range (3 m to begin with, walls and doors no obstacle) that an arrow can hurt; the arrow flies from where the hero is then, partway through its step perhaps.
An arrow deals one of the hero's strikes: ATK (raised against bosses, critical hits rolled) less the monster's DEF, Piercing counted, healing by Lifesteal; its damage rises over the monster, whose HP bar shows what it has left.
A wounded monster keeps its wound, so the fight that follows is shorter, and the wound counts in its inspect panel and damage number; undo takes an arrow back with the step.
An arrow that fells a monster pays the kill as a fight would; one that fells an unwounded monster with a single arrow is an instakill, as Mug pays it.
Only Ranged and Flying monsters shoot back: the rest strike only when the hero fights them.
The arrow is ready every 10 turns from the moment it last fired (Attack Speed: 1 shot every 10 turns, more with training); a ready arrow with no monster in reach waits, and fires the moment one comes in reach, from where the hero is then.
**ATK / m** counts the distance at that moment.
Attack Range and Attack Speed join Offense training from Tower III's floors 20 and 30 ([Training](training.md)).
**ATK / m** joins it from floor 50: each arrow's ATK is multiplied by 1 plus its value for every meter (tile) to its target, counted straight across (diagonals included), so a monster too well armored for an arrow up close may still be hurt, and shot, from further off.
Training shows it as that multiplier a meter: ×1.010/m for the first rank.
**Charged Shot** opens in the Archives from floor 60: each turn that ends with a ready arrow still waiting adds its percent (1% a level) to the next arrow's ATK, and that arrow flies in a blue glow and its number rises with a gold outline, a faint one while the charge is under 50%; the charge starts over once it fires.
ATK / m, Charged Shot and a critical hit multiply one another.
**Multishot Chance** and **Multishot Targets** join Offense training from floor 70: each shot has a chance (0.5% a rank, up to 49.5%) to be a multishot, firing at once at the closest enemies an arrow can hurt, 2 of them and one more a Targets rank (up to 9), or one at each when fewer are in range.
Every arrow of a multishot carries the first's Charged Shot, rolls its own critical hit, and has its own ATK / m for its own distance.
**Rapid Fire Chance** and **Rapid Fire Duration** join Offense training from floor 80: each shot fired outside Rapid Fire has a chance (0.4% a rank, up to 34%) to start it, and from that moment the Archer's arrows come four times as fast for its Duration (1 turn, and 0.05 turns more a rank, up to 5.95).
A shot during Rapid Fire can't start another, and what was built toward a shot when it ends carries on toward the next at the usual pace: at one shot every 2 turns, 3.3 turns of Rapid Fire fire six arrows, half a turn apart, and the next comes 1.1 turns after the sixth.
With Rapid Fire, a turn may fire several arrows, one after another, each rolling its own multishot and critical hit.
The board shows each shot leaving as far through the hero's step as it fired, and its damage rises as it lands; a monster an arrow fells stays on its tile until the arrow reaches it, as one its own shot's thorns fell does until the shot reaches the hero.

With **Sprites** on and the Classic Game theme worn, arrows, enemy shots, rank and trait marks use the shared pixel-art PNG kit.
Charged arrows are blue, shield bubbles have a thin green pixel boundary, and Supply/Equipment Chests keep one blue/two purple stars after opening.
Sprites is off by default, and other Game themes keep their own look.

## Fractions

Gold, HP and the hero's and monsters' stats keep their fractions in play: a 2% ATK bonus on 1 ATK strikes for 1.02, a monster in a higher tower can pay 3.1 Gold, and potion healing raised by research keeps its half points.
The screen shows whole numbers: Gold and the hero's stats rounded down, each strike, heal and reward to the nearest whole, and a monster's stats to two decimals when they aren't whole (one from 100, none from 1,000).
The damage, shroud, thorns and heal numbers rising off the board shorten from 100,000 to three figures, rounded down (123K, 4.56M).

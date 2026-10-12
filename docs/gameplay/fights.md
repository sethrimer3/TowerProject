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

Either way, every reward picked up (an item, a chest's Gold and metal bars, a monster's Equipment materials) rises from its tile as its sprite for about a second, starting at once over anything still rising (what comes together, like a chest's Gold and metal bars, one after another); rewards with no sprite rise as "+N" text.
A door raises each key it took with a minus sign, and a Heart Door, which needs no key but drains the hero's HP to 1, a heart with the HP it took.
Taking the stairs snaps the hero straight onto the new floor with a brief white glow behind it, and while the hero stands on the board's bottom row the status line over it turns half see-through.
Undo during a fight takes back the whole fight.

## Monsters and their pay

A monster's inspect panel, and the messages about its fight, put its strength before its name (Weak, Strong, Elite or Boss), unless it is a normal one.
From Tower II and Delve II on, some monsters are **Fast** (8% at first, more further up and in each tower after): named *Fast …* with a fast-forward mark at the top right of their tile, they strike before the hero, so even one the hero fells in a strike lands a blow, they hit at least 1.75 times as hard as the last tower's floor 100 monster (700 ATK in Tower II), and they pay 1 Gold more.
Every monster beaten pays Gold by its strength: none for a weak one, 1 for a normal one, 2 for a strong one, 4 for an elite one and 5 for a boss.
The stats show the Gold found so far this run beside ATK and DEF; undo never takes Gold back, so it never lowers the count.

## Fractions

Gold, HP and the hero's and monsters' stats keep their fractions in play: a 2% ATK bonus on 1 ATK strikes for 1.02, a monster in a higher tower can pay 3.1 Gold, and potion healing raised by research keeps its half points.
The screen shows whole numbers: Gold and the hero's stats rounded down, each strike, heal and reward to the nearest whole, and a monster's stats to two decimals when they aren't whole (one from 100, none from 1,000).

# Arcana

**Arcana** are mighty spells bought with **Arcanite** (from tournaments, Goals, weekly mission rewards and the Shop's limited packs) and kept for good.
Once you have had any Arcanite, the Gear tab shows an **Arcana** tab, with a dot on both, and the next time you stand in the forest with no other note showing, one says *Spend Arcanite to obtain and upgrade Arcana - mighty spells that unlock new powers.*

## Buying and upgrading

**Select Arcanum** shows what the next one costs: 5, 50, 150, 300, 800, 1,250, 1,750, 2,400 then 3,000 Arcanite, by how many you own.
Short of Arcanite, it offers the Shop instead.
Otherwise it shows up to three of the Arcana you don't own, each as likely as any other, to buy one.
Pressing outside the choice closes it without buying, and it stays the same until you buy one or reroll it.
**Reroll**, for 20% of the price, draws a new set once you confirm; it shows only while more Arcana remain than the choice can show.
The button is gone once you own them all.

Each arcanum you own is a row with three attributes to upgrade, each button showing its value and the next level's price, its border faded while you can't afford it, and gold, reading *Max*, at its highest.
Pressing a row anywhere else shows what the arcanum does, each attribute now and at its next level, and any enhancements unlocked.

## In a run

Every arcanum you hold works at once in every Tower and Delve run, by its own trigger.
Inside a run, the **Arcana** tab after the Training tabs shows a card for each, with its name, its value (for damage, what it deals with your ATK and crits) and a switch.
You can switch them on and off up to 40 times a run, all of them together; the number left rises off the switch each time.
Undo doesn't give a toggle back.
An arcanum with a cooldown starts it over when switched back on.
Pressing a card anywhere else shows its stats and what modifies them.

**Arcanum Damage** = Arcanum Multiplier × Hero ATK × Equipment × (1 + Critical Factor × Critical Chance) × (1 + Super Crit Mult × Super Crit Chance × Critical Chance).
It is an average: an arcanum never rolls a critical hit of its own.
It is ATK like any other, so the enemy's DEF still counts.

A Tower run's Shrines can also offer **Unlock an Arcanum**, while you don't own them all: pick it, then choose one you don't own, up to three offered, to hold at its first levels for the rest of the climb.

## Ricochet Shot

*x% chance on enemy hit to ricochet the shot to y additional enemies, with z% of ATK.*
Each arrow the Archer lands rolls for it, however much damage the arrow did, and Multishot's arrows each roll.
A ricochet flashes a white line from the enemy struck to each of the closest other enemies on the floor, at any distance, and a ricochet never sets off another.

| Attribute | First | Highest | Levels |
|---|---|---|---|
| ATK Mult | 2x | 7,961x | 32 |
| Rebounds | 1 | 5 | 5 |
| Chance | 5.0% | 27.5% | 16 |

## Aurum Bloom

*Adds x% chance each floor is a Golden Floor and raises its bonus to y× (Golden Floors and its research add to that), and z% chance each floor is a Stellar Floor, which multiplies its Gold and Silver by 10×.*
It works for as long as it is on, in every floor it reaches, and a level bought counts at once; it needs no research.
Its first level alone makes a ×5 [Golden Floor](environments.md#golden-floor) at 5%.
The Golden Floors skill adds 1 to that, making ×6 (it is ×2 without Aurum Bloom), and Golden Floor research adds its levels and its chance on top.
Its Stellar Chance adds to any other chance of a [Stellar Floor](environments.md#stellar-floor).

| Attribute | First | Highest | Levels |
|---|---|---|---|
| Bonus | 5.0× | 21.0× | 21 |
| Golden Chance | 5.0% | 24.0% | 39 |
| Stellar Chance | 0.5% | 10.0% | 20 |

## Overseer

*Spotlight beams shine out from the hero, turning 4° clockwise each turn. Enemies in them take the Bonus × your ATK on hits from your ATK.*
The beams start with the first pointing straight up, and turn smoothly through each turn: they stop for nothing, including walls, and reach the edges of the area.
They show as a faint brightening on the board, and go on turning while switched off.
Undo turns them back, and each run starts them over.

An enemy is in a beam by the direction from you to the center of its tile, within half the beam's Angle of the beam's center.
A fight and a Bomb read the beams as the turn begins; an arrow and a ricochet read them, and where you stand mid-step, the moment each fires.
The beams can let your ATK past a DEF it couldn't otherwise pass, and then the Archer will aim there.
The Bonus multiplies every other bonus to that ATK, and comes before the enemy's DEF.
It doesn't touch what isn't your ATK: Thorns, which are a share of the enemy's HP, or opening doors.
Enemy previews, the Damage Visual and Automove count fights without the beams, since they will have turned by the time you arrive.

Beams spread evenly: 2 are 180° apart, 3 are 120° and 4 are 90°.

| Attribute | First | Highest | Levels |
|---|---|---|---|
| Bonus | 8.0× | 50.0× | 31 |
| Angle | 30° | 90° | 61 |
| Quantity | 1 | 4 | 4 |

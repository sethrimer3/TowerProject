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
An arcanum with a cooldown also has a bar on its card, filling as the cooldown runs down, with the turns left at its right end.
You can switch them on and off up to 40 times a run, all of them together; the number left rises off the switch each time.
Undo doesn't give a toggle back.
An arcanum with a cooldown starts it over when switched back on.
**Toggles** in Settings hide Ricochet Shot's and Thunderbolt's damage animations and, once you have them, Lifespring's, Phantasm's and Necrotic Frost's damage on enemies; they strike all the same.
Once you have Phantasm, an alpha slider there, 0 to 1, sets how solid its ghosts are drawn: 0.5 at first, and at 0 you don't see them at all.
Pressing a card anywhere else shows its stats and what modifies them.

**Arcanum Damage** = Arcanum Multiplier × Hero ATK × Equipment × (1 + Critical Factor × Critical Chance) × (1 + Super Crit Mult × Super Crit Chance × Critical Chance).
It is an average: an arcanum never rolls a critical hit of its own.
It is ATK like any other, so the enemy's DEF still counts.

In a [Proving Grounds](proving-grounds.md) trial, every arcanum you own works except Aurum Bloom, on the boss, its parts and its minions or summoned enemies, with its own toggles and cooldowns for the attempt (see [In a trial](#in-a-trial)).

A Tower run's Shrines can also offer **Unlock an Arcanum**, while you don't own them all: pick it, then choose one you don't own, up to three offered, to hold at its first levels for the rest of the climb.

## Ricochet Shot

*x% chance on enemy hit to ricochet the shot to y additional enemies, with z% of ATK.*
Each arrow the Archer lands rolls for it, however much damage the arrow did, and Multishot's arrows each roll.
Each fight you win rolls for it once, as it ends, however many strikes it took.
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
A fight, its ricochet and a Bomb read the beams as the turn begins; an arrow and its ricochet read them, and where you stand mid-step, the moment each fires.
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

## Thunderbolt

*Every x turns, y thunderbolts strike random enemies on the floor, with z% of ATK each.*
Each is a jagged white bolt falling straight down from the board's upper edge to its target, which a jagged white light surrounds for a moment.
The cooldown runs a turn at a time and starts over the moment it runs out.
It counts down whether or not any enemy stands on the floor.

Each bolt strikes a different enemy once, each enemy as likely as any other, at any distance, for [Arcanum Damage](#in-a-run) less the enemy's DEF.
Overseer's beams multiply it, as the bolt falls.
It kills like any other hit, paying what the enemy pays, and heals nothing.

With fewer enemies than bolts, the rest strike again next turn, each enemy at most once a turn, until they are used up or no enemies remain on the floor: any left then are wasted.
If the cooldown runs out meanwhile, its bolts join those still waiting.
Bolts still waiting follow you to the next floor, and switching it off loses them.
Undo takes back what a bolt did, but not its cooldown or the bolts spent.

| Attribute | First | Highest | Levels |
|---|---|---|---|
| ATK Mult | 10x | 9,219x | 36 |
| Quantity | 5 | 20 | 16 |
| Cooldown | 180 turns | 20 turns | 17 |

## Lifespring

*Every x turns, Effect Waves hit every enemy on the floor, then a field as wide as your shot range forms round you and adds y× your ATK to its HP Pool.*
Pressing its card in a run shows the current HP Pool and what the Effect Waves give.

**Effect Waves** come first, one every 4 turns, as many as its Effect Waves attribute, the first as the cooldown runs out.
Each shows as a ring spreading from you to the board's edges, but hits every enemy on the floor at once, however far, walls or no walls.
A wave does no damage and wakes no Flying enemy.
What the waves give, while Lifespring is on, by whatever means the enemy later falls:

| Effect | Now | What it does |
|---|---|---|
| Health Bonus | +0.05%, up to ×5 | Each enemy a wave or the field touched raises your max HP this run as it falls, once however often it was touched. Pressing the Max HP card in a run shows how far it has come. |
| Damage Amplification | ×5 a wave | The field does this much more to an enemy for each wave that hit it: after two, ×10, so an enemy of 1,000 HP costs the pool 100. |
| Gold Bonus | ×1.0 | The Gold of an enemy a wave or the field touched is multiplied. |
| Cell Bonus | ×0 | An enemy a wave or the field touched that drops Cells drops this share more. |
| DEF Reduction | 0% | Each wave takes this percent off every enemy's DEF, even below 0. |

**The field** forms 4 turns after the last wave: three spinning, overlapping, faint green rings round you that spread out as it forms and stay until the pool is spent, on every floor of the run.
Its radius is your shot range, 3 tiles until you train Attack Range, whether or not you hold the Archer; it takes no notice of walls.
A new activation adds to any pool left, the rings turning blue for 5 turns to say so.

Enemies inside lose HP from the pool, closest first, until the pool runs out or none are left, whatever their DEF.
An enemy the pool can pay for falls at once, and the pool pays exactly that (its HP left, divided by its Damage Amplification).
Otherwise the field collapses, the enemy taking the damage all that is left of the pool buys.
A Shielded enemy's bubble cuts the field's damage as it cuts your other hits.
An enemy your step brings into range meets the field before any arrow flies at it.
Enemies already in range, and those that stepped up to you this turn, meet it at the very end of the turn, so your shots and the rest get their chance first.

Undo takes back the field's damage, the pool it spent, its waves and its Health Bonus.
Switching it off loses the pool, the waves on their way and its cooldown; the Health Bonus stays.

| Attribute | First | Highest | Levels |
|---|---|---|---|
| HP | 2x | 9,119x | 31 |
| Effect Waves | 1 | 5 | 5 |
| Cooldown | 300 turns | 50 turns | 26 |

## Time Dilation

*Every x turns, a field as wide as your shot range forms round you for y turns. Enemies in it strike, shoot and move z% slower, and a boss's effects count down z% slower.*
The field shows as a faint light blue circle with a thin solid rim, lying on the floor under items and enemies.
Its radius is your shot range, 3 tiles until you train Attack Range, whether or not you hold the Archer, measured straight to each enemy, walls or no walls.

The cooldown starts over the moment it runs out, and a new field simply replaces the old one: what was left of it is lost, and fields never stack.
With a Duration as long as the Cooldown, the field never ends.
Slowdown can reach 90% at most, whatever raises it.

**In a fight** the enemy's strikes come less often, so you may strike twice in a row.
At 25%, the enemy misses every fourth round: rounds 4, 8, 12.
At 50% and above the delay comes first: at 50% it strikes in rounds 2, 4, 6, and at 75% in rounds 4, 8, 12.
A Fast enemy's first strike counts as its first chance: at 35% it strikes first, strikes again, then misses a round; from 50% it waits until you have struck.
Its ATK rises only with the strikes that land.
Enemy previews, the Damage Visual and Automove count fights without the field, since it may not be there when you arrive.

**A Ranged or Flying enemy** in the field recharges its shot that much slower, as you stand each moment of the turn, and one already ready still fires.
**An enemy on the move** takes longer between steps: at 30%, each takes 1 / 0.7 times as many turns; at 90%, ten times as many.

Undo takes back the field with what it slowed.
Switching it off loses the field and its cooldown.

| Attribute | First | Highest | Levels |
|---|---|---|---|
| Duration | 5 turns | 40 turns | 36 |
| Slowdown | 20% | 75% | 12 |
| Cooldown | 180 turns | 60 turns | 13 |

## Phantasm

*Every x turns, lost phantasms return until y ring you, one tile out, turning 1° clockwise each turn. One that touches an enemy's tile strikes every enemy in its blast with z% of ATK, then disappears.*
Its first ghosts come when its first cooldown runs out, and the cooldown starts over the moment it runs out.
It can never be shorter than 37 turns, whatever lowers it.

Ghosts ride evenly spaced round you and go where you go, onto the next floor too.
A ghost that overlaps any part of an enemy's tile strikes, even partway through your step, walls or no walls, and is gone until the next activation.
A lost ghost leaves a gap: the others keep their places.
Each activation fills every gap, up to the Quantity, and a Quantity you have bought since spaces the whole ring evenly.

A strike hits every enemy whose tile the ghost overlaps, and every enemy within its blast radius of the ghost, 0.1 tiles at first, measured straight to the middle of the enemy's tile.
Each takes [Arcanum Damage](#in-a-run) less its DEF, and Overseer's beams multiply it as the ghost strikes.
It kills like any other hit, paying what the enemy pays, and heals nothing.

Ghosts strike along your step before your arrows fly, and those an enemy has stepped up to strike at the end of the turn.
Undo takes back the ghosts with what they struck.
Switching it off loses the ghosts and its cooldown.

| Attribute | First | Highest | Levels |
|---|---|---|---|
| ATK Mult | 10x | 9,219x | 36 |
| Quantity | 3 | 6 | 4 |
| Cooldown | 200 turns | 50 turns | 16 |

## Necrotic Frost

*Every x turns, a frost field of 3 tiles' radius forms round you, off center at a random angle, and moves with you for y turns. An enemy it touches is Necro: it takes decay through its DEF every turn until it falls, z% of ATK more each turn. Each field adds its own decay. Enemies in a field strike, shoot and move 25% slower, 50% in two or more.*
Its first field comes when its first cooldown runs out, and the cooldown starts over the moment it runs out.
Each field's center lies one tile from you, at an angle rolled when it forms, and keeps that place round you as you walk, onto the next floor too.
It shows as a faint purple circle with a pale green ring outside a pale purple one and small bubbles popping across it, lying on the floor under items and enemies.

An enemy whose tile's middle lies within a field takes its first tick of decay as the turn ends, after every shot and step, and is **Necro** from then on: its name and panel say so.
The decay goes on every turn until the enemy falls, wherever it goes and whether or not any field still stands.
Each tick is a step up its ramp: with an ATK Mult of 10x, it deals 10x your ATK, then 20x, then 30x.
That is [Arcanum Damage](#in-a-run), so your crits count at their average, and Overseer's beams multiply it as the turn ends.
It ignores DEF, though a Shielded enemy's bubble still cuts it, and it heals nothing.
It kills like any other hit, paying what the enemy pays.
An enemy left on a floor you have climbed from is gone, and its decay with it.

**Fields stack.** Fields don't replace each other, so with a Duration past the Cooldown more than one stands at once, and with one as long as the Cooldown there is always a field.
Each field that touches an enemy puts its own decay on it, each with its own ramp, so an enemy in two takes both.
**The slow** is by where the enemy stands now, Necro or not: 25% in one field, 50% in two or more, however many.
It works as Time Dilation's does, in fights, on Ranged and Flying enemies' shots and on enemies on the move, and enemy previews, the Damage Visual and Automove count fights without it.
With Time Dilation too, each multiplies what the other leaves (50% and 50% make 75%), up to 90%.

Undo takes back the fields with what they did.
Switching it off loses the fields and its cooldown; decay already on enemies waits, and carries on up its ramp once it is back on.

| Attribute | First | Highest | Levels |
|---|---|---|---|
| ATK Mult | 10x | 9,219x | 36 |
| Duration | 30 turns | 100 turns | 15 |
| Cooldown | 125 turns | 50 turns | 16 |

## In a trial

Your Arcana work on what stands in a trial's arena: the boss while it is corporeal, its parts, its minions, mimics and Light Slimes.
An incorporeal boss can't be struck.
**Aurum Bloom** doesn't work there, having no floors to raise, and doesn't show in the Arcana tab.

An arcanum's hit only wounds: it never makes a boss teleport, drop keys or pop coins, and draws no counter.
It can defeat the boss and win the trial, and its damage counts toward Damage this run.
**Thunderbolt** works as above, once a turn on a lone boss.
**Ricochet Shot** springs from your own hits there, since a trial has no arrows: each hit rolls its chance, and a ricochet strikes the closest others.
**Overseer** multiplies your hits on what stands in a beam, as the turn begins.
**Lifespring** works as above on what stands in the arena, each wave counting for all of it, even what arrives later; a trial pays no kills, so its Health, Gold and Cell Bonuses do nothing there, and neither does DEF Reduction.
**Time Dilation** works as above on everything in the field: its tally for a counter or bite goes on from one of your hits to the next, a scheduled step or hop is skipped the same way, and a boss's or part's effects count down slower while it stands in the field.
At 75% a cooldown falls by 0.25 a turn, so a beam due in 10 turns takes 40, and any part of a turn left over counts toward the next.
A boss's Regen isn't on a cooldown, so it isn't slowed, and an Obelisk's turn limit still counts every turn.
**Phantasm** works as above on what stands in the arena, its ghosts striking as each turn ends, wherever you stand then.
**Necrotic Frost** works as above on what stands in the arena, and an incorporeal boss's decay waits until it can be struck again.
Toggles and cooldowns are the attempt's own, leave your run outside alone, and survive a reload.

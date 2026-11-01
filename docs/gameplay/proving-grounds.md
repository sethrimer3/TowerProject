# Proving Grounds Trials

Step onto the golden square on the grass to the right of the Tower forest's path to open **Proving Grounds Trials**.
Choose a trial, then choose **Without cards**, **Only with cards**, or **With both**.
Each choice enters the main game screen with the same top HUD, board, bottom card bar and run-training controls as a Tower run.
Trials use the current hero, dungeon, stairs, potion, torch and crate artwork, with the same **Animations** and **Reduce motion** settings as the Tower.
Their camera follows with the Delve's cinematic glide and path look-ahead, using **Settings → Movement transition**: **Smooth** is on by default, **Fast** catches up sooner, and **Off (instant)** disables the glide.
The camera leaves a small border around the arena to keep your character clear of the controls and holds the small staging room centered; tile clicks remain accurate while the view moves.
Reduce motion also makes trial camera and player movement instant.
Each trial automatically offers the next difficulty after the highest one you defeated, starting at difficulty 1.
You cannot select a difficulty manually.
The menu shows that trial's number, next difficulty, difficulty multiplier, beam count, slime timing and one-time reward.
**Trial 1 — Light Elemental** begins in a small staging room whose staircase leads to a dark, hexagonal chamber inside a 25×25 tile square.
The attempt uses your current max HP, ATK and DEF and starts at full health; your Tower run, currencies and supplies stay safe.
Reloading resumes the attempt, including its training purchases.
**Leave trial**, the HUD menu's **Leave trial**, or Escape from the board returns to the forest and discards the attempt.

## Choose your controls

**Only with cards** copies your equipped hand and its priority order when you enter.
Your cards automatically move you to their targets using the same card planner as a Tower run, including the staging staircase, potions and enemies.
The ordinary HUD play/pause button and speed arrows control autoplay; you cannot steer with keys, taps, swipes or direction buttons.
While the elemental is incorporeal, cards ignore it and autoplay waits if no other card has a target, keeping the laser countdown moving.
Otherwise, if no card can act, autoplay pauses; return to the forest to equip a hand suited to the trial, including Stairs and an enemy card, then enter again.
The encounter copies your stats and uses its own combat rules; normal-run rewards, card activations, badges and supplies do not apply.

**Without cards** gives you full movement control and has no card autoplay.
Your equipped cards stay visible at the bottom with red X overlays, and cannot activate or affect movement.
Click or tap a floor tile to walk to it along a real route, one tile at a time; click the staircase to enter the chamber, or click the elemental to approach and strike it.
There are no on-screen movement arrows.
Click your current tile, press Space, or use **Wait** to spend a turn without moving; arrows and WASD remain keyboard shortcuts.
Each move, strike or wait advances one turn, and walking into a wall does not.

**With both** keeps your cards playing automatically and also accepts your tile commands.
A player command overrides the card's planned move; your route takes priority until you arrive or choose another destination, then cards resume.
Pausing cards still lets you move manually in this mode.
Every accepted move spends one turn, even when both cards and a player command are available.

## Trial keys and levels

You have **two trial keys per UTC day**, shared across every trial and control mode in the list.
Entering or retrying costs one key; resuming a saved attempt after a reload costs none.
Keys refill to two at midnight UTC; unused keys do not carry over or accumulate for missed days.
Leaving, winning or losing does not refund the entry key.
Developer mode gives unlimited entries and retries without spending your normal keys.
The free-purchases setting alone does not bypass trial keys.

Each level adds 10% of the level-1 boss HP, starting from at least 240 HP or 24 times your copied ATK, whichever is higher.
Level 1 fires one beam per volley; levels 10, 20, 30, 40, 50, 60 and 70 add one each, reaching the maximum of eight.
Slimes spawn every 20 turns at levels 1–4; each multiple of five reduces that interval by two, reaching two turns at level 45.
These beam/slime rules apply to the Light Elemental; the Keymaster instead gains tougher mimics and summons them more often.
The difficulty stays fixed through an attempt and reload.
Any victory counts toward that trial's progression, regardless of the control mode.
After a defeat, **Try again** offers the same next unbeaten difficulty; after a victory, **Next difficulty** offers the next one and lets you choose controls again.

## Trial Points

The first victory at each difficulty awards **Trial Points equal to that difficulty**: difficulty 1 pays 1 point, and difficulty 5 pays 5 points.
Clearing difficulties 1 through 5 earns 15 points in total.
Your point balance appears in the trial menu, and points earned also appear in the profile's Stats after your first reward.
The reward is shared across all three control modes and is paid only once per trial and difficulty; repeated results and reloads never pay it again.
Trial Points are kept between attempts and currently have no spending options.

## Purchases

The same training bar appears beneath the cards when **On the Job** is unlocked, using the usual unlocks, prices and Buy Quantity.
ATK, DEF and Max HP training affect this encounter; training for other Tower systems is unavailable here.
The attempt starts with the Silver your usual run starts with, and purchases spend only its own Silver.
Purchased stats, ranks and remaining Silver survive reloads and are discarded on leaving or retrying; your ordinary Tower run and permanent training stay unchanged.

## The Light Elemental

The elemental starts at the center of the chamber, dark except for standing torches around the inside edge, glowing enemies and your immediate footing.
Potions, wooden crates and torches occupy separate floor tiles along the room's edges.
Crates and torch stands are floor props that you can move through.
Slimes smash crates and torches when they land on them, and beams destroy every crate or torch they cross before striking the wall.
Broken crates leave splintered boards, and broken torches go out, making that part of the room darker.
Destruction lasts for the attempt and survives reloads; retrying starts with fresh props.
Potions survive these hazards and remain available until you drink them.
Walk into the corporeal elemental to strike it; it answers with a small hit of radiant damage.
After each nonlethal hit it dissolves into individual pixels of light, which fly with trailing sparks to a different free interior tile and reassemble into a translucent blue ghost.
In this incorporeal phase it is invincible, does not count as an enemy to any card, and can be walked through.
Its next laser volley makes it corporeal and vulnerable again.
If you stand on its ghost when that volley is due, it reforms in the closest free tile before firing.
A hit on the same turn as a laser volley still triggers the teleport, then the volley restores its body.
Reduce motion skips the flight animation while retaining the translucent ghost appearance.

The elemental releases a light slime on its level's spawn interval, up to six at once.
Existing slimes jump every three arena turns to random nearby floor tiles within two tiles of their previous position, independently of new spawns.
New slimes leap out from the elemental's current position, including while it is incorporeal.
Walk into a slime to disperse it; a slime landing on you deals 5% of your max HP and dissipates.
Slimes cannot land in walls, on the elemental or on one another.

Every ten turns the elemental fires its level's number of beams, spread around eight tile directions.
The pattern rotates 45° clockwise each volley, starting north; two beams oppose each other, and eight cover every direction.
The lasers fire from the elemental's current tile.
The countdown shows every direction in the next volley; just before firing, small light marks near the elemental warn of each ray.
Being caught by a beam costs 25% of your max HP.
The beams leave lingering light and smoldering cracks along the floor and on the wall they strike; the cracks remain for the attempt, but do not deal additional damage.
Potions along the walls restore 35% of your max HP and can each be used once.

Defeat the elemental to complete the trial and disperse its remaining slimes.
After victory or defeat, return to the forest or choose controls for the trial's next unbeaten difficulty from its staging room.
Attempts saved in the older, larger chamber restart in the new staging room with their copied stats.

## The Keymaster

**Trial 2 — Keymaster** has its own difficulty progression and first-clear Trial Points, shared across the same three control modes.
Its staircase leads to a fully lit 25×25 chamber using Tower II's warm limestone walls and rectangular paving, with a locked door at each cardinal edge: north, east, south and west.
Six solid 2×2 and 3×3 wall blocks are scattered through the chamber; you and the mimics must route around them, and the Keymaster cannot retreat or teleport into them.
Torches, crates and potions remain around the inside edge, and the four door approaches stay clear.
Older saved attempts keep their progress; anyone or any key pile inside a newly added wall moves to nearby floor when resumed.
The Keymaster starts in the center and can be attacked while solid.
A surviving hit breaks him into pixels of light that fly to a new tile and reform as a translucent ghost, just like the Light Elemental.
He is invincible and does not count as an enemy while incorporeal; you can walk through his ghost.
Every ten arena turns he reforms and becomes vulnerable again, without firing lasers.
Every two player moves, strikes or waits, he retreats one cardinal tile away from you if there is a free tile; walls can corner him.
Each hit scatters three golden keys three tiles from where he was hit, in random directions that stay inside the arena.
Walk onto them to collect them; these are encounter items, separate from your two daily trial entry keys.

Two tough chest mimics appear when you enter, and the Keymaster summons more over time, up to six alive.
Every two player moves, strikes or waits, mimics move one tile toward you, routing around walls and other actors.
A mimic that reaches you starts combat, just as when you walk into it.
A mimic takes several attacks and fights back while it survives.
With **Mimics: use keys**, entering a mimic spends one golden key to defeat it without taking damage.
Switch to **Mimics: save keys** to fight normally and reserve your keys for doors; this choice also applies to card autoplay and survives reloads.
Key, Door and enemy cards recognize the encounter's keys, locks and mimics.

Each cardinal door costs one golden key to open.
Opening it floods red light pixels from the doorway; they curve toward the Keymaster with trailing sparks, then take **20% of his maximum HP** when they reach him.
Red spirits follow the moving boss; if they reach him while he is incorporeal, they wait for him to reform rather than lose their damage.
A surviving door hit also triggers his teleport and ghost phase.
Each door works once, so all four deal 80% of maximum HP in total.
Flights take about a second, continue while cards are paused, and do not spend extra player turns.
Reloading resumes a pending flight, and an impact already received can never damage him again.
Reduce motion simplifies the red particle paths while keeping the same timing.

Higher difficulties raise boss and mimic HP with the displayed multiplier.
New mimics spawn every eight turns at first; each five difficulties reduces the interval by one turn, down to two.
Defeat the Keymaster by combining direct attacks and door impacts to earn that difficulty's one-time Trial Points.

## Boss HP Meter and Run Damage

Above the floor area during a trial, a **Boss HP Meter** shows the boss's icon on the left, a health bar with tick marks every 10%, and a shortened HP readout centered over the bar.
Next to the bar, **Damage this run: X** and **DPT: Y** display the total damage you have inflicted on the boss during the current run and your average damage per turn over the run.

## Single-Round Combat, Magic Tower, and Obelisk

In **Trial 3 — Magic Tower** and **Trial 4 — Obelisk**, attacking the boss, a boss part, or a boss minion performs **one round of combat per turn** instead of resolving the entire fight to the death in a single turn.
A fight animation shows the strike and counter-strike results of each round.
Boss ATK remains constant and does not increase with each hit on you.
In **Only with cards** or **With both**, you can click any card in your hand at any time to break off combat and target something else in the arena (such as a stat shard, potion, coin drop, minion, or boss part), then click your boss card later to resume attacking the boss.

### Trial 3 — Magic Tower (Variant 1 & 1b)

The Magic Tower has high HP (around 30× your ATK) and no turn limit, so multiple partial combat engagements take place before it falls.
It has a **Regen** stat that restores its HP every turn, meaning turns spent away from combat require dealing more total damage to finish it off.
Each time you damage the boss, **Gold and Silver coins pop out** as loot drops, which you can use with the in-run training bar and floor stat shards to raise your stats during the encounter and surpass the boss's regeneration threshold.

### Trial 4 — Obelisk (Variant 2 & 2b)

The Obelisk has very high HP (requiring hundreds of turns to defeat), and you are given a fixed number of turns per run to inflict damage, starting at **100 turns** and increasing by +10 per level of the **Trial Turn Limit** research project in the Archives.
The Obelisk fires periodic arcane shots every 3 turns and an **Arcane Pulse** special attack every 8 turns.
The encounter ends when the Obelisk is defeated, your turns run out, or you are knocked out.
When turns run out (or the run ends early), **all damage inflicted on the Obelisk is saved**, and your next trial run at that difficulty resumes from the boss's remaining HP.

### Multi-Part Bosses (1b & 2b)

In the trial details menu for Magic Tower and Obelisk, you can switch between the **Standard Boss** (`1` / `2`) and the **Multi-Part Boss** (`1b` / `2b`).
In the multi-part sub-variant, the boss is accompanied by three parts on the floor—**Blaster Turret** (fires periodic bolts), **Regen Conduit** (increases boss regeneration), and **Ward Crystal** (increases boss DEF and dampens your DEF)—each with its own stats.
When you knock out a part, it stops its activity, disappears from the floor, and its HP cannot be regenerated.

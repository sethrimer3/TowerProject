# Proving Grounds Trials

Step onto the golden square on the grass to the right of the Tower forest's path to open **Proving Grounds Trials**.
Choosing either trial enters the main game screen with the same top HUD, board, bottom card bar and run-training controls as a Tower run.
Choose a whole **Trial level** before entering either mode; the menu previews boss HP, beam count and slime timing.
Any level from 1 to 10,000 is selectable, and the last selected level is remembered.
Both Light Elemental trials begin in a small staging room whose staircase leads to a dark, hexagonal chamber inside a 25×25 tile square.
The attempt uses your current max HP, ATK and DEF and starts at full health; your Tower run, currencies and supplies stay safe.
Reloading resumes the attempt, including its training purchases.
**Leave trial**, the HUD menu's **Leave trial**, or Escape from the board returns to the forest and discards the attempt.

## Choose your controls

**Trial I — Light Elemental · With cards** copies your equipped hand and its priority order when you enter.
Your cards automatically move you to their targets using the same card planner as a Tower run, including the staging staircase, potions and enemies.
The ordinary HUD play/pause button and speed arrows control autoplay; you cannot steer with keys, taps, swipes or direction buttons.
While the elemental is incorporeal, cards ignore it and autoplay waits if no other card has a target, keeping the laser countdown moving.
Otherwise, if no card can act, autoplay pauses; return to the forest to equip a hand suited to the trial, including Stairs and an enemy card, then enter again.
The encounter copies your stats and uses its own combat rules; normal-run rewards, card activations, badges and supplies do not apply.

**Trial II — Light Elemental · No cards** gives you full movement control and has no autoplay.
Your equipped cards stay visible at the bottom with red X overlays, and cannot activate or affect movement.
Move with arrows or WASD, swipe or tap the board, or use the direction buttons; Space or **Wait** spends a turn without moving.
Each move, strike or wait advances one turn, and walking into a wall does not.

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
The selected level stays fixed through an attempt, reload and retry.

## Purchases

The same training bar appears beneath the cards when **On the Job** is unlocked, using the usual unlocks, prices and Buy Quantity.
ATK, DEF and Max HP training affect this encounter; training for other Tower systems is unavailable here.
The attempt starts with the Silver your usual run starts with, and purchases spend only its own Silver.
Purchased stats, ranks and remaining Silver survive reloads and are discarded on leaving or retrying; your ordinary Tower run and permanent training stay unchanged.

## The Light Elemental

The elemental starts at the center of the chamber, dark except for wall torches, glowing enemies and your immediate footing.
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
After victory or defeat, return to the forest or retry the same trial from the staging room.
Attempts saved in the older, larger chamber restart in the new staging room with their copied stats.

# Catacombs

The Catacombs' design and build plan: an endless, idle side mode under the forest where the hero, as a Magician, fights a stream of undead in real time for Lore, Spirit, Ingots and Magic levels.
It is built (`src/catacombs/`, docs/agents/catacombs.md); **Later** lists the designer's TODOs and **Follow-ups** what the build left.
Each section is the spec the implementation follows; **Decisions** lists what the request left open and what was settled.

## Decisions

The designer chose floor 20, ancestral as the seventh rarity, the XP curve in 7, and kept every other default.

1. **Unlock checkpoint.**
   Tower VI's floor 10 Goal already pays a unique reward, Auto Pick Ranking (`TOWER_SIX` in `src/goals.ts`).
   Decided: Tower VI's floor **20** Goal (now 35 Gems) becomes the unlock `catacombs` ("Catacombs"); its premium reward stays 40 Gems.
2. **Where Reveal Catacombs sits in the Inspiration tree.**
   Default: its own node at the foot of the tree's middle column, `requires: []`, hidden until the Goal is claimed; placed with the `add-upgrade` skill.
3. **What buying Reveal Catacombs does.**
   The Goal reveals the node; buying the node (40 Inspiration) opens the Catacombs (mausoleum, menu button, bank).
4. **Which Lore.**
   Default: the existing Lore Fragments (`save.cells`), so Catacomb Lore buys Speed Ups like the Greater Bosses' does.
5. **Lore per tile.**
   Default: 1 Lore per Lore tile before the tier bonus.
6. **"The tower's gold bonus".**
   Default: the tier's Gold bonus only (`TIER_BONUS_TENTHS`: ×1, ×2, ×3.1, ×4.3 …, via `tierGold`), not every Gold multiplier; Lore stays fractional (`snap`), as `save.cells` already allows, and the HUD rounds down.
7. **Magic XP curve.**
   Decided: from level L to L + 1 takes 200 × 1.2^(L − 1) MXP, rounded (200, 240, 288, 346, 415 …; level 3 at 440 in all), one magic skill point per level.
8. **What a magic skill point buys.**
   First built as three stat boxes (Force, Ward, Vitality); the designer's five Magic skills replaced them (step 8, **Magic skills** below).
9. **Strong, Elite and Boss drops.**
   Default: MXP and Spirit ×2 for Strong, ×4 for Elite, ×10 for a Boss (one rarity's Spirit, of the enemy's own rarity).
   Stats: Strong ×1.25 and Elite ×1.5 on all three stats (as asked), Boss the Tower's boss shape (MHP ×3.5, MAtk ×1.3, MDef ×1, `enemyCurve(...).strength.boss` in `src/enemies/curves.ts`).
10. **Which enemy a boss hall's final slot holds.**
    Default: rolled among the types eligible at that hall, weighted by their spawn odds (empty excluded).
11. **Haste cost.**
    Default: at ×N the hero takes N turns a second; one is the ordinary real-time turn, the other N − 1 are hasted and spend one banked second each.
12. **Bank cap.**
    Default: none.
13. **A hidden browser tab.**
    Default: a frame gap over 10 seconds (tab hidden, device asleep) goes to the bank as offline time rather than playing out at once, with a short toast; under 10 seconds plays out.
14. **Which forest holds the mausoleum.**
    Default: the Tower's forest only (its tier arrows choose the number); the Delve's forest has none, but the menu button works there.
15. **Catacomb button during a Proving Grounds trial.**
    Default: hidden, since a trial owns the board (`FrameLoopHost.boardFrame`); shown everywhere else but the Catacomb screen.
16. **Switching numbers mid-run.**
    Default: entering the mausoleum on a different tower number than the current Catacomb run's asks for confirmation once the run is past Hall 1 ("Leave Catacomb III's Hall 42 for Catacomb V's Hall 1?").
17. **Spirit rarities.**
    Decided: common, uncommon, rare, epic, legendary, mythic and ancestral, matching the shared `RarityId` (`src/shop/rarity.ts`); Spirit still keeps its own list, `SPIRIT_RARITIES`.
18. **Board width.**
    The corridor's 17 tiles match the Tower's 17 columns, so a Hall is a 17 × 17 board (rows 0 to 16, the corridor rows 7 to 9).

Step 8 (the designer's spawn table, set halls, Magic skills, drops, crosshairs, potions, abilities and Spirit upgrades) settled these where the spec was open:

19. **Magic ATK +1's prices.** Levels 18 to 25 were given as 111 … 397, a digit short of the series every other level follows (50 × 1.2^(level − 1), rounded); they are 1,109, 1,331, 1,597, 1,917, 2,300, 2,760, 3,312 and 3,975.
20. **Base chances.** Every Drop and the MCrit chance start at 0%, raised only by Skills; the MCrit factor starts at ×1.5.
21. **The "Luck" skill** that opens Gold Crosshairs is Fortune, whose third effect is the Gold Crosshair chance.
22. **"(n pts)" in the skill table** means percentage points: a chance or factor adds that many points a point (Might's +3% MCrit factor takes ×1.5 to ×1.53).
23. **Might's MAtk +1%** multiplies the whole MAtk (base, Might's flat points and Magic ATK +1).
24. **MCrits** multiply what gets past MDef ((MAtk − MDef) × factor), as the Tower's crits do; Spell Surge's +100% MCrit damage adds 1 to the factor, and its +20% MAtk comes before MDef.
25. **Armor Penetration** takes the percent of MDef first, then the flat amount, never below 0.
26. **Attack speed** is strikes a round: one, plus one while Speed Drop attacks are left, plus one while Renewing Rush lasts (bonuses add, so ×3 with both). An "attack" is a round; each round spends one of each buff and one Speed Drop attack.
27. **Arcane Barrage** hits every undead standing, the one being fought too, after the Magician's strikes, for 20% of a hit past that undead's MDef (0.2 × (MAtk − MDef)); it never MCrits. A barrage kill pays as any other.
28. **Crosshairs** stay on their undead until tapped, the undead is beaten, or the hall is left (lasting one turn, they could not be tapped at ×100). They roll after each turn, on each undead without one. A tap may hit any marked undead, not only the one being fought, and benefits from Spell Surge without spending its attacks.
29. **Potions** lie on the corridor's side rows (7 and 9), not the slots' walls nor the column to the treasure rooms; several can lie at once, one a tile.
30. **Drops and amounts** are rolled together as the hall is made and saved with it, so a reload never rerolls them.
31. **Set halls** list their undead lowest rarity first, so the strongest stands on E6, and the hall's Strong, Elite or Boss rank still goes to E6. They draw nothing from the spawn stream.
32. **Each undead's first hall** follows the spawn table: Ghoul 25, Vampire 49, Lich 80, Demon 200 (they were 26, 51, 81 and none).
33. **MDef.** The five skills raise no MDef, so the Magician has none for now; Ward's MDef is gone with it.
34. **Ability cooldowns** count turns (a second each, hasted turns too), only while an ability is short of a charge; each holds one charge.
35. **Speed Drops and buffs** are kept through a fall; a restart ends nothing but the run.
36. **Randomness.** Drops, MCrits, crosshairs and potions each draw from their own saved stream, as spawns do, seeded once from `catacombDrops`, `catacombCrits`, `crosshairs` and `potions`.

## Unlock

- `GoalUnlock` gains `"catacombs"` (`UNLOCK_NAMES`: "Catacombs") on the checkpoint chosen in question 1, with its Goal art in `sprites/ui-details.ts`.
- `SkillNode` gains an optional `revealGoal?: GoalUnlock`, read by `skillHidden` beside `reveal`: hidden until `goalUnlocked(save, revealGoal)`.
  `skillHidden` takes the save's goals for it, so its callers in `skill-tree-page.ts` and `SkillDesk` pass them.
- New upgrade `catacombs` in `UPGRADES`: "Reveal Catacombs", "Open the Catacombs: a mausoleum in the forest", base 40, max 1, Inspiration.
- `catacombsOpen(save)` = the upgrade owned, or Access to Everything on.

## Getting there

- **The mausoleum.**
  `OutsideWorld` gains a `mausoleum` flag (set from `catacombsOpen`) and `MAUSOLEUM = { dx: 7, width: 3, y: 1, height: 3 }` by the entrance column, in the clearing's lower-right corner, with a yard one tile wider that the trees give way to, as the Blacksmith's and Tournament Hall's do.
  `isMausoleum(x, y)` is what a tap tests, beside `isBlacksmith` and `isTournamentHall`; `drawMausoleum` draws its kit art (`drawKit(c, "mausoleum", …)`, a new 72 × 72 PNG).
  `Roads` and `onPath` are unchanged: the mausoleum is tapped, not walked to.
  A tap enters **Catacomb N**, N the tier the forest shows (`save.tower.tier`): the same number views the run under way; another number starts a new run at Hall 1 there (question 16).
- **The menu button.**
  `ACTIONS_MENU` (`ui/shell.ts`) gains `#catacombs-button` ("CATACOMB"); `renderRunMenu` shows it once the Catacombs are open and a Catacomb run exists, in the forest and inside, never on the Catacomb screen (question 15).
  Pressed, it opens the Catacomb screen on the run under way, whatever number it is.
- **Before the first entry** there is no Catacomb run: the button is hidden and nothing banks.

## The Catacomb screen

The Catacomb screen is a view over the board, not a third `Mode`: `Game.mode` stays `tower` or `delve`, and the run behind it is paused.

- `CatacombView` (`src/ui/catacomb-view.ts`) owns `#world` while open, through `FrameLoopHost.boardFrame` returning true, as a trial does, so no Tower or Delve turn, route or Automove runs behind it: that is the pause.
  It opens only from the board (the Mausoleum, the menu), and **Switch Back** (or Escape) hands the board back to the run, which plays on as it was.
- Everything off the board that ticks in real time (trainers, research, Gem timers, Scarabs) carries on as it does behind any page.
- `html.catacombs` scopes every HUD swap below, so leaving drops them all at once.

### HUD differences

| Tower run | Catacomb screen |
|---|---|
| Silver (purse, top left) | Lore (clay tablet), the Lore Fragments held |
| HP, ATK, DEF and their extras (shield, regen, shroud, crit, sparks, wings) | MHP, MAtk, MDef only |
| Level and XP bar | Magic level and a purple MXP bar; the unspent magic skill points with a purple training arrow (`pointsIcon` recoloured) in the portrait's top-right corner |
| Wayfarer / Pathfinder / Archer | MAGICIAN |
| TOWER VI · FLOOR 37 | CATACOMB VI · HALL 37 |
| Gold bonus | The Spirit held, two columns of three; the Lore bonus (question 6) moved to the undead table, which says where the factor comes from |
| Base enemy (ATK, DEF, HP) | The Wisp at this number and hall (MAtk, MDef, MHP); pressed, the hall's enemy table |
| Inspiration earned, best reward | hidden; the hall's tooltip gives the deepest hall in this number |
| Auto, play/pause, speed | none: the Catacombs keep their own clock |
| Red END CLIMB (in the menu) | Yellow SWITCH BACK under the hamburger, where the run's Shop sits (`.mini-action.switch-back`, never `danger`) |
| Hand and Training bar | the abilities, over Skills · Spirit · Forge · Academy |
| Provisions, Familiars, Arcana, Equipment, Shrine | hidden |

- The **enemy table** (`ui/catacomb-odds.ts`, styled as `enemy-odds-box.ts`'s) lists each type that can appear in the current hall: its chance per slot, MHP, MAtk, MDef, MXP and Spirit rarity, with a row for the hall's Strong, Elite or Boss when it has one.
- The **bank** sits over the board's top-right wall tiles while a second is banked or haste is on: a clock icon, the time (`45s`, `12m 05s`, `3h 12m`) and a dropdown, ×1 ×2 ×5 ×10 ×25 ×100 (`select#catacomb-haste`).
- A **stats table** button left of the Skills row opens every Catacomb stat in one table (MHP, MAtk, MDef, MCrit, Armor Penetration, the gains, each Drop's chance and effect, Magic level, MXP to next, points spent and free, Lore bonus, current hall, best hall, number), dismissed by a tap anywhere.

## A hall

A hall is a 17 × 17 board (`CatacombHall implements Board`, `src/catacombs/hall.ts`), walls everywhere but what is listed here.

The corridor is rows 7 to 9, columns 0 to 16, laid out left to right:

| x | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| row 8 | entrance | · | E1 | · | E2 | · | E3 | · | Lore | · | E4 | · | E5 | · | E6 | · | stairs down |

- Each enemy slot (x = 2, 4, 6, 10, 12, 14) stands on row 8 with walls at rows 7 and 9 above and below it, whether or not an enemy was rolled there, so the corridor pinches to one tile at every slot and reads as "beat it to pass".
- Treasure rooms, each 3 × 3, open off the corridor as asked:

| Every | Room | Tiles | Opening | Ingot | Torch |
|---|---|---|---|---|---|
| 5th hall | upper centre | x 7–9, rows 3–5 | (8, 6) to the corridor | Brass at (8, 4) | above it, (8, 2) |
| 10th hall | lower centre | x 7–9, rows 11–13 | (8, 10) | Iron at (8, 12) | below it, (8, 14) |
| 15th hall | upper left | x 2–4, rows 3–5 | (5, 4) and (6, 4) to the upper centre room | Steel at (3, 4) | left of it, (1, 4) |
| 20th hall | lower left | x 2–4, rows 11–13 | (5, 12) and (6, 12) to the lower centre room | Nickel at (3, 12) | left of it, (1, 12) |

- Every 15th hall is also a 5th, and every 20th a 10th, so a left room always has its centre room to open from.
- An ingot tile's amount is its nth appearance in the run times the number: Brass `hall / 5 × N`, Iron `hall / 10 × N`, Steel `hall / 15 × N`, Nickel `hall / 20 × N`, so it follows from the hall alone.
- The Lore tile shows its amount on the board (`1 × Lore bonus`), as the forest entrance shows the Gold bonus.
- Torches use the existing wall torches and lighting (`torches.ts`); a hall is dark crypt stone (`CatacombLook`, new tiles `crypt-floor`, `crypt-wall`, `stairs-down`).
- Decor may dress a hall but, as everywhere, never alters a tile.

### Enemies

| Name | Rarity | MHP | MAtk | MDef | MXP | From hall |
|---|---|---|---|---|---|---|
| Wisp | common | 100 | 10 | 0 | 1 | 1 |
| Ghost | uncommon | 250 | 10 | 5 | 3 | 1 |
| Skeleton | rare | 550 | 10 | 12 | 7 | 11 |
| Ghoul | epic | 1,150 | 10 | 25 | 20 | 25 |
| Vampire | legendary | 1,950 | 10 | 50 | 70 | 49 |
| Lich | mythic | 3,500 | 10 | 150 | 150 | 80 |
| Demon | ancestral | 25,000 | 10 | 300 | 400 | 200 |

- An enemy's stats are its base × `tierStats(N)` (×1, ×5, ×20, ×60 …) × its strength × the deep-hall factors; MXP and Spirit don't scale with N or depth.
- **Deep halls.** From the hall after each listed one, every enemy's MHP and MDef multiply again, compounding:

| After hall | MHP × | MDef × |
|---|---|---|
| 400 | 2 | 1.5 |
| 600 | 2 | 1 |
| 800 | 2 | 1.5 |
| 1,000 | 2 | 1.5 |
| 1,200 | 4 | 2.25 |
| 1,400 | 2 | 1.5 |
| 1,600 | 2 | 1.5 |
| 1,800 | 2 | 1.5 |
| 2,000 | 2 | 1.5 |

  So Hall 1,201 has MHP ×64 and MDef ×7.59; past Hall 2,000, MHP ×1,024 and MDef ×38.44.
  These products use only `*` (engine independence).
- **Spawning.** Each of the six slots draws once: a roll against the hall's odds table (`spawnOdds(hall)`, `SPAWN_TABLE` in `src/catacombs/catalog.ts`).
  A hall that rolls no enemy gets one Wisp in slot 6.

| Halls | Common | Uncommon | Rare | Epic | Legendary | Mythic | Ancestral |
|---|---|---|---|---|---|---|---|
| 1–10 | 28.57% | 14.29% | | | | | |
| 11–20 | 25.40% | 12.70% | 11.11% | | | | |
| 21–24 | 25.52% | 10.94% | 12.50% | | | | |
| 25–39 | 22.97% | 9.84% | 11.25% | 10.00% | | | |
| 40–48 | 23.41% | 8.78% | 9.88% | 11.11% | | | |
| 49–59 | 21.74% | 8.15% | 9.17% | 10.32% | 7.14% | | |
| 60–79 | 21.27% | 7.98% | 8.97% | 11.54% | 7.69% | | |
| 80–99 | 19.50% | 7.31% | 8.23% | 12.34% | 8.64% | 5.00% | |
| 100–119 | 18.47% | 7.92% | 9.05% | 12.06% | 10.56% | 5.00% | |
| 120–199 | 18.10% | 9.05% | 7.92% | 11.88% | 11.88% | 5.00% | |
| 200–239 | 16.53% | 8.26% | 9.64% | 13.50% | 11.57% | 5.44% | 2.00% |
| 240–279 | 16.49% | 8.25% | 9.62% | 13.47% | 11.54% | 5.43% | 2.22% |
| 280–399 | 16.39% | 9.83% | 9.83% | 11.47% | 11.47% | 5.74% | 2.50% |
| 400–599 | 15.70% | 9.42% | 9.42% | 10.99% | 12.82% | 6.90% | 3.33% |
| 600+ | 13.50% | 8.10% | 9.72% | 11.67% | 14.00% | 9.33% | 6.67% |

- **Set halls** (`FIXED_HALLS`) aren't rolled: each holds six undead by rarity (question 31).

| Hall | Undead |
|---|---|
| 45, 95 | 6 Common |
| 70, 380 | 6 Uncommon |
| 100, 145, 440 | 6 Rare |
| 115, 165, 500 | 6 Epic |
| 125, 180, 540 | 6 Legendary |
| 390, 560 | 6 Mythic |
| 595 | 6 Ancestral |
| 140 | 5 Uncommon, 1 Legendary |
| 195 | 1 Common, 2 Uncommon, 2 Rare, 1 Mythic |
| 295 | 5 Uncommon, 1 Ancestral |
| 395 | 1 each, Uncommon to Ancestral |
- **Strong, Elite and Boss halls** (the final slot, E6, always filled):
  every 25th hall a Boss (three chevrons), else every 10th an Elite (two), else every 5th a Strong (one); stats and drops by question 9.
  Chevrons draw through `rankChevrons`, as on Tower enemies.
- **The spawn stream.** Spawns draw from a saved, persisting sequence: `save.catacombs.rng`, seeded once from a new named stream, `stream("catacombs")` (added to `StreamName` and `STREAMS` in `src/random.ts`), and stored after each hall is built, as `MissionDesk` and gifts keep theirs.
  A hall is rolled once, when the hero arrives, and stored in the run, so a reload never rerolls it.
  Halls never draw inside a sort and never call the inexact `Math` functions.

## Turns

The Catacombs keep their own clock: one turn a real second, whatever the screen, Movement Speed and play/pause ignored.

Each turn is exactly one of these, decided by the hero's next target in the hall's order (E1, E2, E3, Lore, the treasure rooms' ingots, E4, E5, E6, stairs; empty slots skipped):

1. **Dash.** The next target is an enemy and the hero isn't beside it: the hero arrives on the tile left of it.
   Dashing always takes one turn, however far.
2. **Round.** The hero is beside its target enemy: the hero strikes first, `max(0, hero MAtk − enemy MDef)`; if the enemy lives, it strikes back, `max(0, enemy MAtk − hero MDef)`.
   An enemy reaching 0 MHP pays its MXP and one Spirit of its rarity (times its strength's factor) and the hero dashes to the next target on the next turn.
   If neither side can hurt the other, the run ends and restarts at once, this same turn.
   If the hero can't hurt the enemy but the enemy can hurt the hero (an invincible enemy), rounds go on until the hero falls.
3. **Pickup.** The next target is a Lore or ingot tile: the hero dashes onto it and takes it.
   Ingots are reached only once E1 to E3 are beaten, since the rooms open off the corridor's middle.
4. **Descend.** Every target is done: the hero takes the stairs and stands at the next hall's entrance.
5. **Restart.** The hero fell last turn: a new run starts at Hall 1 of the same number, MHP full; MXP, levels, skill points, Lore, Spirit and Ingots are kept.

- The hero's MHP carries from hall to hall: nothing heals it but a restart.
- The best hall reached is kept per number.
- Skill points moved between stats take effect on the next turn; lowering Vitality lowers current MHP no further than the new maximum.
- Restarts stay on the run's number indefinitely; only the mausoleum changes it.

### The engine

`src/catacombs/` is pure and knows nothing of the DOM, `Game` or the clock:

- `catalog.ts`: the enemy table, strengths, the deep-hall table, `spawnOdds(hall)`, `SPIRIT_RARITIES`, `INGOTS` (brass, iron, steel, nickel).
- `hall.ts`: `hallCell`, `hallTargets` and `rollSlots(hall, number, rng)`; `CatacombHall`, the `Board` that draws a hall, comes with step 4.
- `state.ts`: the save's shape, the saved spawn stream, starting and entering a run.
- `magic.ts`: `mxpToNext`, `mxpForLevel`, `magicLevel`, skill point totals, `heroStats(save.catacombs)` → MHP, MAtk, MDef from the base 1,000 / 10 / 0 plus the stat boxes.
- `turn.ts`: `catacombTurn(state) → TurnResult` (what happened, what was earned, for popups and sound), mutating only `save.catacombs`.
  `runTurns(state, n)` loops it and sums the gains, so many turns, many short runs among them, settle in one call.
- `clock.ts`: `CatacombClock`, below.
- `save.ts`: `decodeCatacombs`.

### The clock, the bank and haste

- `save.catacombs.clock` keeps `lastTurnAt` (wall clock) and `bank` (whole seconds); the haste choice (`haste`: 1, 5, 10 or 100) is saved too.
- Every frame, on every page, the host calls `clock.due(now)`: the whole seconds since `lastTurnAt` are real turns; at ×N, each real second also adds N − 1 hasted turns, each spending a banked second (question 11).
- When the bank can't pay all the hasted turns due, it pays what it has, then the dropdown drops to ×1 at once.
- **Offline.** As the app starts, the time since it was last seen (`save.offline`, the same reckoning Offline Gold uses) goes to the bank in whole seconds, and the Offline dialog (`ui/offline-gold-dialog.ts`) adds a line, *Catacombs: +3h 12m of banked turns*; the dialog opens for this line alone when nothing else is owed.
  A gap of over 10 seconds while open does the same (question 13).
- **Drawing.** Turns play no faster than `MAX_MOVE_RATE` (15) a second on the board.
  At ×5 and ×10 each turn draws; at ×100, 6 or 7 turns run each frame and only the frame's last turn is drawn, the HUD reading its result; gains from the skipped turns add into one popup.
- Off the Catacomb screen, turns run the same way with nothing drawn.

## Bottom menus

A row of four tabs replaces the hand and Training bar on the Catacomb screen: **Skills**, **Spirit**, **Forge**, **Academy**, with the abilities over them.

- **Skills**: a row of skill boxes, each its name and its points of its cap.
  Tapped, a box widens to show rectangular − and + buttons and, beside them, a line for each effect, per point and in total (*MAtk +1% a point · +17%*).
  Points move freely at any time, never below 0, past a skill's cap or past the points earned.
- **Spirit**: the Spirit held, and the Spirit upgrades, each its level, what a level does and its next price.
- **Forge** and **Academy** show their names and a line saying they open later; their TODOs are below.

## Magic skills

Magic skills (Skills, in the Catacombs) are the Magician's attributes: each point raises three effects (`MAGIC_SKILLS` in `magic.ts`).
"pts" are percentage points (question 22).

| Skill | Effect 1 | Effect 2 | Effect 3 | Cap |
|---|---|---|---|---|
| Might | MAtk +1 | MAtk +1% | MCrit factor +3% (3 pts) | 50 |
| Weaving | Max MHP +50 | MCrit chance +1% | Speed Drop chance +0.20% (0.2 pts) | 50 |
| Resonance | Spirit gain +4% | Loot Drop chance +0.30% (0.3 pts) | Armor Penetration +2 | 25 |
| Focus | MXP gain +5% | MXP Drop chance +0.30% (0.3 pts) | Armor Penetration +3% | 25 |
| Fortune | MCrit chance +2% | All Drop chances +0.20% (0.2 pts) | Gold Crosshair chance +0.50% (0.5 pts) | 25 |

The MCrit factor starts at ×1.5 and the MCrit chance at 0%.
Divination and Corruption, opened by Ascension, and upgrades raising a skill's effects or cap are Later.

## Drops

As a hall is made, each undead rolls each Drop at the Magician's chance (`rollDrops`, the `drops` stream), and the amount of each that lands, every whole number in its range as likely; an icon (a coloured pip) shows each on the undead, and beating it pays them all (`defeat` in `combat.ts`).

| Drop | Effect |
|---|---|
| MXP Drop | ×3 to ×5 MXP from this undead |
| Loot Drop | ×2 to ×5 Spirit from this undead |
| Speed Drop | +10 to +110 attacks at ×2 attack speed (they stack, and are kept through a fall) |
| MHP Drop | +30 to +100 MHP (never past the maximum) |

The stats table lists each Drop's chance and effect.

## Crosshairs and potions

The active part of a run: something to tap while watching, worth most early on.

- **Crosshair.** After each turn, each undead standing without one gains a crosshair at 5% (`rollTaps`, the `crosshairs` stream).
  Tapped (`tapCrosshair`), its undead takes one of the Magician's hits, MCrit rolled as ever, with no turn spent; untapped, nothing happens.
  A tap that beats the undead being fought sends the hero on to the next target next turn.
- **Gold Crosshair.** A crosshair is gold at Fortune's Gold Crosshair chance; its hit is ×3 (`GOLD_CROSSHAIR_FACTOR`).
- **Potion.** After each turn, at 5%, a potion appears on a random free side tile (`SIDE_TILES`: the corridor's rows 7 and 9, off the hero's path; the `potions` stream).
  Tapped (`takePotion`), it restores 10 MHP, never past the maximum; one left when the hall is left is lost.

## Abilities

Three limited-use spells (`abilities.ts`), opened in order by Unlock Ability.
Each holds one charge; cast, its charge comes back after its cooldown in turns, and its buff lasts the next 5 attacks.

| Ability | Effect | Cooldown |
|---|---|---|
| Spell Surge | Next 5 attacks: +20% MAtk, +100% MCrit damage | 60 |
| Renewing Rush | Next 5 attacks: +100% attack speed; +50 MHP on cast | 120 |
| Arcane Barrage | Next 5 attacks: every undead also takes 20% of a hit past its MDef | 90 |

- Each unlocked ability's button sits over the menus, the turns until its charge (or *Ready*) under it, and a tooltip on hover or hold.
- A slim **Auto** toggle above each, saved, casts it by itself at the start of any turn it is ready.

## Spirit upgrades

The Spirit menu's purchases (`spirit-upgrades.ts`); more come later.

| Upgrade | Level | Price |
|---|---|---|
| Unlock Ability | 1, 2, 3 | 10 Uncommon, 75 Rare, 150 Epic Spirit |
| Magic ATK +1 | 1 to 25 | 50, 60, 72, 86, 104, 124, 149, 179, 215, 258, 310, 372, 446, 535, 642, 770, 924, 1,109, 1,331, 1,597, 1,917, 2,300, 2,760, 3,312, 3,975 Uncommon Spirit (question 19) |

## Save

`save.catacombs` (new; `defaults()`, `Save` in `save/shape.ts`, `decodeCatacombs` from `decode()`, and the profile file's `towers` section, the run left out like the others; no version step, since a save without it decodes to the defaults):

```ts
type CatacombSave = {
  number: number;             // the tower number the run belongs to
  run: CatacombRun | null;    // null before the first entry
  best: Record<number, number>; // best hall, by number
  rng: Record<"spawns" | "drops" | "crits" | "crosshairs" | "potions", number | null>; // each saved stream's state
  clock: { lastTurnAt: number; bank: number; haste: 1 | 5 | 10 | 100 };
  mxp: number;
  points: Record<MagicSkillId, number>; // skill points in each Magic skill
  spirit: Record<SpiritRarity, number>;  // fractional: Spirit gain is a percent
  ingots: Record<IngotId, number>;
  speed: number;                         // Speed Drop attacks left
  abilities: Record<AbilityId, { charges: number; cooldown: number; auto: boolean }>;
  buffs: Record<AbilityId, number>;      // attacks left on each buff
  upgrades: Record<SpiritUpgradeId, number>;
};
type CatacombRun = {
  hall: number;
  hero: { x: number; y: number; mhp: number };
  slots: ({ id: UndeadId; strength: "normal" | "strong" | "elite" | "boss"; mhp: number;
    drops?: Partial<Record<DropId, number>>; mark?: "crosshair" | "gold" } | null)[]; // E1–E6, emptied as beaten
  potions: [number, number][];  // potions lying on the side tiles
  target: number;             // index into the hall's targets (living undead and pickups); every earlier one is done
  fell?: true;                // a restart is next
};
```

- Lore is credited through `earn(save, "cells", n)`; Spirit, Ingots and MXP are not lifetime tallies yet.
- `tests/fixtures/save-decode.golden.json` is re-recorded for the new field.

## Currencies

- The currencies dialog (`currencyRows`) and the Codex's Currencies gain the seven Spirits and four Ingots after Lore, once the Catacombs are open (all in Dev mode).
- Icons: seven native Spirit subjects distinguished by shape and rarity color, matching Ingot inventory bars, four menu subjects and the Catacomb button.
- They aren't Shop currencies, so `CurrencyId` is unchanged.

## Art and sound

- New PNGs: the mausoleum (72 × 72), crypt floor, wall and stairs-down tiles, the seven undead, Lore and four ingot pickups, Spirit and ingot icons, the purple training arrow, the bank's clock; registered through `npm run sprites:manifest` and the atlases.
- Until the art lands, placeholders: Tower III's tiles under a dark falloff, the Mausoleum and undead in code-drawn pixels, the Lore tablet from the kit.
- Sound is still to come (Follow-ups): cues reusing the fight, pickup and stairs sounds, for drawn turns on the Catacomb screen.

## Build log

All seven steps are built, each with its tests, docs and DEVLOG line; docs/agents/catacombs.md describes the code.

1. **Engine.** `src/catacombs/`: `catalog`, `hall`, `magic`, `state`, `turn`, `clock`, `save`, and the saved spawn stream on `stream("catacombs")`; `tests/catacombs-engine.test.ts`, and the engine joins `tests/engine-independence.test.ts`.
2. **Unlock.** Tower VI's floor 20 Goal, the node's `revealGoal`, Reveal Catacombs, `catacombsOpen`, and `save.catacombs` in the save and the profile file; the save-decode golden and five Dev-mode UI snapshots re-recorded.
3. **Mausoleum and menu.** `OutsideWorld.mausoleum`, its tap, `CatacombDesk`, and the menu's `#catacombs-button`; `tests/catacombs-forest.test.ts`; every UI snapshot re-recorded for the hidden button; the render golden unmoved.
4. **Catacomb screen.** `CatacombView`, `CatacombPlayer`, `CatacombBoard`, the HUD swaps, Switch Back and Escape, the undead table, the bank and haste, and the background clock on every page; `tests/catacombs-player.test.ts` and `tests/catacombs.mjs` (in `npm run test:browser`).
   The magic skill points sit in the portrait's corner, since the level row has no room beside the MXP bar.
5. **Stats menu.** The Stats, Spirit, Forge and Academy row, the Stats boxes and the stats table; `tests/catacombs-menus.test.ts`.
6. **Offline and currencies.** Start-up banking reported in the Offline dialog, and Spirit and Ingots in the currencies table; `tests/catacombs-offline.test.ts`.
7. **Docs and Codex.** The Codex's Catacombs category (how it works, and each undead once a hall it can stand in is reached) and Spirit and Ingots in its Currencies; `tests/codex.test.ts`.
8. **The designer's first TODOs.** The spawn table and set halls, the five Magic skills (Stats renamed Skills), Drops, MCrits and Armor Penetration, crosshairs and potions, the three abilities and their Auto, and the Spirit menu's two upgrades; `tests/catacombs-active.test.ts`.

## Follow-ups

- **Art.** The Mausoleum, seven undead, Spirit, board and UI Ingots, menu tabs, Catacomb button and enemy Drop marks now have native PNGs. The dedicated terrain set and purple training arrow remain separate future work; see Art and sound.
- **Sound.** The Catacomb screen is silent: fight, pickup and stairs cues for drawn turns.
- **Codex discovery.** An undead counts as seen once a hall it can stand in is reached; once Spirit can be spent, keep sightings in `save.codex` instead.

## Later (designer TODOs)

- **Ability upgrades** (spec to come from the designer): upgrades that shorten the abilities' cooldowns and raise their effects and charges (`MAX_CHARGES` is 1 for now).
- **Divination and Corruption**: two more Magic skills, opened by Ascension.
- **Skill upgrades**: upgrades that raise a skill's effects and its cap.
- **More Spirit upgrades** for the Spirit menu.
- **Forge**: spend Ingots to upgrade the Blacksmith's forge (design to come).
- **Academy**: spend Spirit on boosts outside the Catacombs.
- **An MDef source**: nothing raises the Magician's MDef since Ward left (question 33).

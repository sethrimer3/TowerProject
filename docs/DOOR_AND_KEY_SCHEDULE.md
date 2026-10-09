# Door and key schedule

How often each kind of door, and the keys to open them, appear on a Tower floor, by tower and floor. The goal is one steady difficulty ramp: every floor a little harder than the one below, every tower a little harder than the one before, so the player needs to keep investing in progress upgrades (Key Efficiency, the Find Key research, Key Siphon, badges) to keep up.

The Delve follows the same schedules by equivalent floor, each delve the tower of its number's (section 6).

Notation: `t` is the tower number (1–9), `f` the floor counted from 1, and `⌊x⌋` rounds down. The code counts floors from 0 (`depth = f − 1`).

## 1. The schedules

| Door | First floor | How often | Limit |
|---|---|---|---|
| **Wooden** (replaces Steel) | 1 | Share of yellow locks made wooden: `100% − 10%·(t−1) − 1%·⌊(f−1)/10⌋`, never below 0 | Gone from floor 1001 in Tower I, 901 in II, … 201 in IX |
| **Blue** | `51 − 5(t−1)`: 51 in Tower I … 11 in IX | Expected doors per floor: `0.10 + 0.01·⌊(min(f, 1000) − first)/5⌋` | Stops rising at floor 1000 (1.99 in Tower I) |
| **Red** | `101 − 10(t−1)`: 101 … 21 | `0.10 + 0.01·⌊(min(f, 1000) − first)/10⌋`: half blue's growth, so red stays the rarer door and guards greater rewards | Stops rising at floor 1000 (0.99 in Tower I) |
| **Heart** | `201 − 10(t−1)`: 201 … 121 | `0.10 + 0.01·⌊(f − first)/10⌋` | Stops rising at 1 per floor (floor 1101 in Tower I, 1021 in IX) |

Example values:

| | Floor 101 | Floor 201 | Floor 501 | Floor 1000 |
|---|---|---|---|---|
| Tower I: wooden / blue / red / heart | 90% / 0.20 / 0.10 / 0 | 80% / 0.40 / 0.20 / 0.10 | 50% / 1.00 / 0.50 / 0.40 | 1% / 1.99 / 0.99 / 0.89 |
| Tower V | 50% / 0.24 / 0.14 / 0 | 40% / 0.44 / 0.24 / 0.14 | 10% / 1.04 / 0.54 / 0.44 | 0 / 2.03 / 1.03 / 0.93 |
| Tower IX | 10% / 0.28 / 0.18 / 0 | 0 / 0.48 / 0.28 / 0.18 | 0 / 1.08 / 0.58 / 0.48 | 0 / 2.07 / 1.07 / 0.97 |

Starting at 0.10 a floor, about two times in three a colour's first ten floors hold at least one of its doors (1 − 0.9¹⁰). Once a rate reaches 1, every floor holds at least that many: blue from floor 501 in Tower I. Tower I's red tops out at 0.99, so about one floor in a hundred past floor 1000 has no red door.

Key colours follow their doors: a blue or red key appears only from that colour's first floor (`towerKeyColorsOn`). A key of a colour not yet open still comes as a yellow key, as now.

These rules stay as they are:
- Floor 1's way to the stairs stands open.
- Floors 2–5 keep their yellow stairs door (now usually wooden) and a key behind every door.
- Tower I's potion gates on floors 1–10 stay.
- In Tower I, a blue or red door never stands alone on the way to the stairs (`bypassesRareKeys`).

All schedule numbers live in one module, `src/key-schedule.ts`, as named constants with one function per schedule, so changing a number is a one-line edit.

## 2. The door stage (a new step in floor planning)

Today blue, red and Heart Doors come from about six weighted tables (main gate, stairs gate, patterns, forks, shortcuts, the resource planner's key rooms). How many a floor gets falls out of all of them together, and no single number controls it. The new stage sets the count directly.

1. **The tables stop offering them.** The main and stairs gate tables, shortcuts and forks no longer choose blue, red or Heart Doors. Patterns built around one, listed below, are placed only by this stage:
   - blue door → yellow keys
   - red door → blue keys
   - blue door stat vault
   - blue key behind yellow door
   - key chain
   - temptation's blue and red gates

   The same goes for fork patterns with a blue, red or Heart lane: ordinary fork planning no longer picks them, and only the door stage places them (step 3c).
2. **The stage rolls a quota per colour.** It runs after the branches, shortcuts and ordinary forks are planned, before the resource planner. For each of blue, red and heart it places the whole part of the rate, plus one more with the leftover fraction as a chance, drawn from the floor's own random stream. Generation stays the same for a seed in every engine.
3. **Each quota door is placed by one of these, with a seeded choice among the ones that fit:**
   - a. **Upgrade a gate:** an existing plain yellow-door gate becomes blue or red, or any paid gate (an enemy, a steel door or a plain yellow door) becomes a Heart Door.
   - a2. **Combine:** a door that doesn't take the colour yet takes it as well, in the same tile: yellow becomes *Amber + Azure* (yellow + blue), blue becomes *Azure + Crimson*, and so on up to the *Triune Door*. A combined door counts toward the quota of each colour it adds and costs every key it lists. A door run is never combined: each of its doors would take the colour while it counted for one. The door rules, names and art already exist (`door_ab.png` … `door_abc.png`). A Heart Door with a colour (keys *and* the drain to 1 HP) needs a new door rule, so it comes with the wooden door's rule work in phase 3.
   - b. **Add a pattern** built around that door, if the region budget has room.
   - c. **Place a fork built around it.** A gate with no fork yet takes a fork pattern holding that door, priced near the gate it replaces like any fork:
     - *blueDoorOrStrongMonster*
     - *keysBlueOrStrong*
     - *twoLowerDoorsOrHigherDoor*
     - *blueForYellow*
     - *yellowOrBlueDoor*
     - *twoBlueDoorsOrRedDoor*
     - *blueOrRedDoor*
     - *doorTypes*
     - *doorMonsterOrHeart*

     The region's fallback single gate becomes the quota door itself, so a fork that doesn't fit the floor still leaves the door standing. In Tower I a lone blue or red gate may not stand on the way to the stairs, so there this way is used only on branches.

     On the way to the stairs, a quota fork holds only one quota door, so the core path stays on schedule whether or not the fork fits. On a branch, a fork may hold others too (*blueOrRedDoor*, *twoBlueDoorsOrRedDoor*): extra doors, a chance for a well-prepared hero, counted like the rest at 1/k (section 7). *redDoorOrElite* (a red door, or an elite enemy) is a fork built around a red door alone; the Delve leaves it out (`towerOnly`). About one quota fork in five fits the floor; the rest stand as their single door.

   - d. **Lengthen into a run:** a single blue, red or Heart Door becomes a door run of two, or a run of two one of three (section 7).

   The quota is kept in hundredths of a door. The stage places doors until what they count for meets the rate, and a fraction left owed is placed at its chance. A single door counts 1, each door of a run 1, and a fork's lane doors 1/k (section 7). A door that fits nowhere stays owed, and the census shows it (section 5).
4. **Wooden doors:** every yellow lock left (gates, the stairs door, shortcuts, fork lanes, and a fork lane that offers a Wooden Door of its own) rolls the wooden share (`placeWoodenDoors`), so the share decides every Wooden Door in the Tower.
5. **Keys:** the resource planner then plans keys for whatever doors the floor has, as now, under the key-supply curve (section 4).

In Tower I, a blue or red quota door goes only on a branch or in a fork beside a lane that needs no blue or red key. From Tower II on, the way to the stairs is open to them too.

## 3. Wooden doors (replace Steel Doors)

A wooden door opens with any one key: the cheapest held, yellow before blue before red, as a Steel Door does today. **A hero with no key can break it**, at a cost in HP:

| Rule | Value |
|---|---|
| Durability | `2 ×` the floor's normal, balanced enemy ATK (`enemyStats("tower", tower, floor, "normal", "balanced").attack`), × the tower's stat factor (through `tierTile`, like enemy stats) |
| Breaking it | Costs HP equal to its durability. DEF, shroud and anything else defensive don't reduce it. |
| Holding a key | The key is spent; no HP lost. |
| When breaking would bring HP to 0 | The door refuses, like a blocked step. Planners and the hand treat it as closed. Breaking never kills. |
| Revive | Doesn't apply (not a fight). |
| Effective / Dampen badges | Scale the HP cost as they scale a fight's damage, and the key cost as now. |
| Undo | One step, as for any door. |
| Shown | Inspect: *Wooden Door*, *Durability 38*, and without a key *Break: HP 100 → 62* (or that the hero is too weak to break it). Damage Visual shows the HP cost on the door while the hero holds no key, red when it would fell the hero. Breaking it raises the HP lost as a heart, as a Heart Door's toll does, with no fight animation; like that toll, it never costs an area's mastery. |
| Cards | DOOR and WOODEN DOOR (was STEEL DOOR) head for a Wooden Door the hero holds a key for or can break down and survive, so the starting hand breaks one down when no key is held. |

Possible later change (to decide after the census): `HP cost = max(0, durability − ATK)`, so a strong hero breaks it for free, with DEF still not helping.

### Heart Door with a colour

A door that takes its keys **and** drains the hero to 1 HP, as a Heart Door does (Heart Door Resilience applies to the drain). For the heart quota, the door stage's combine way gives an existing blue, red or combined door the heart (a gate's `heart`), counting toward the heart quota. The door rule has a heart flag (`{ type: "keys", …, heart: true }`, `drainsHp`), `resolveStep` applies both costs, and it is named after its keys (*Azure Heart Door*). The hand-drawn art is a placeholder: the keys' door with a heart crest above (`door_bh.png`, `door_abch.png` …, from `npm run tiles:area1`); the procedural and neon doors draw the heart over the coloured door. HEART DOOR heads for one while its keys are held.

What changes in the code:
- **Door rule** (`entities.ts`, `doors.ts`): a new `{ type: "wood"; durability: number }` takes the steel rule's place in generation (the steel rule, `keys: all three, mode: "any"`, still works but nothing places it). `doorCost` returns the key, or none when the hero would survive breaking it (a caller passing no HP, like the floor analyzer, counts it as breakable). `resolveStep` (`step-effects.ts`) takes the HP. Every other caller reads it from there.
- **Planning** (`tower/types.ts`, furnisher, forks, analyzer): the gate `steel` becomes `wood`. The analyzer's map shows `W`.
- **Card and skill**: the STEEL DOOR card and its skill (`cardSteelDoor` in `config.ts`) become WOODEN DOOR. It heads for a wooden door the hero holds a key for or can break without dying. The renamed ids drop the old card from saved hands. During the prototype phase old saves don't need to convert.
- **Art**: a new wooden-door sprite (`public/assets/doors/door_wood.png`, replacing `door_steel.png`), a wooden painter in `tile-painters.ts`, and a neon look.
- **The Delve**: its steel gates become wooden doors with durability from the Delve's own enemy curve. Since phase 5 the wooden share decides how many (section 6).

## 4. Key supply

Keys get scarcer per door as the floors and towers rise, each colour on its own curve. Progress upgrades are meant to close the gap.

Each colour aims for a number of **keys per lock**, counted from its own first floor (yellow's floor 1; blue's and red's are their doors' first floors), so each colour arrives with a surplus and tightens from there (`TOWER_KEY_RATIO` and `towerKeyRatio` in `src/key-schedule.ts`, in ten-thousandths so every engine rolls alike):

| Colour | On its first floor | Falls | Lowest |
|---|---|---|---|
| Yellow | 1.3 | 0.005 every 10 floors, 0.1 each later tower | 0.5 |
| Blue | 1.2 | the same | 0.4 |
| Red | 1.1 | the same | 0.3 |

On the way to the stairs, each falls half as fast, so the main route is the last place to run short.

Nothing places keys by count. The resource planner works toward each aim by chance:
- **Thinning** (`thinToAim`): each pattern key of a colour is kept at the chance that leaves the aim's worth of keys for the floor's locks of that colour. For blue and red, it plans for at least the schedule's doors a floor, so keys stock up on floors without their doors. The start hall's keys stay. A room whose only item is a thinned key holds a potion instead, so no room is left empty.
- **Coverage** (`coverDoor`): for each door, while the keys reachable without it fall short of the aim's worth for the doors of its colour so far, the planner rolls to add a key source, at the chance of how short it is. It never adds past the floor's aim for the colour (the ratio's worth for all its locks): most rooms stand behind a yellow lock, so a door's own supply is small, and covering each door alone heaped up keys well past the aim. Below 1 key per lock, that leaves some doors without a key on purpose. Above 1, the surplus is rolled for at its fraction: at 1.3, a 30% chance of a second key.
- **Locks counted:** a forked region counts as its single gate, which stands whenever its fork doesn't fit (about three times in four). After layout, each fork that fits settles the difference (`settleKeys`): 1/k of each lane's locks, less the gate, at the aim's ratio, adds or removes keys by chance. A door run counts each of its doors, but a yellow run counts once: a key sink (section 7).
- **Unguarded loot:** a key there is kept at the colour's aim while it is below 1.

**A key at the entrance:** the first floor a blue or red key can appear on in a tower lays one in the start hall: blue on Tower I's floor 51 (Tower IX's 11), red on floor 101 (IX's 21).

Floors 2–5's keys behind every door aren't thinned. The census prints each colour's aim beside its measured keys per lock (`Y aim`, `B aim`, `R aim`).

First measurement (`--towers 1,5,9 --floors 1-1200 --band 200 --seeds 10 --stride 3`), measured against aim:

| Floors | Tower I: yellow, blue, red | Tower V | Tower IX |
|---|---|---|---|
| 1–200 | 1.67/1.55, 1.55/1.46, 1.15/1.28 | 1.33/1.15, 1.19/1.06, 0.91/0.87 | 0.97/0.75, 0.80/0.65, 0.39/0.46 |
| 401–600 | 1.56/1.35, 1.11/1.28, 0.86/1.10 | 1.16/0.95, 0.82/0.87, 0.55/0.68 | 0.74/0.55, 0.52/0.46, 0.29/0.30 |
| 801–1000 | 1.42/1.15, 0.81/1.08, 0.67/0.90 | 1.02/0.75, 0.61/0.67, 0.45/0.48 | 0.72/0.50, 0.42/0.40, 0.30/0.30 |

Yellow runs 0.1–0.3 above its aim: keys in guarded niches and keyed floors' keys aren't thinned. (Measured with yellow at 1.6, blue at 1.5 and red at 1.3; since lowered to 1.3, 1.2 and 1.1.)

**Spare keys build up while a ratio is above 1:** each lock leaves the ratio less one key spare, and Tower I has about three yellow locks a floor. A player who opens every door and takes every key in Tower I ends with about this many spare yellow keys (40 seeds; floors 2–5's key behind every door adds about 24 over floors 1–10 whatever the ratio):

| Yellow start | After floor 20 | After floor 40 | After floor 100 |
|---|---|---|---|
| 1.6 (before) | 37 | 78 | 207 |
| 1.5 | 36 | 72 | 186 |
| 1.3 (now) | 26 | 52 | 126 |
| 1.2 | 21 | 42 | 100 |
| 1.1 | 18 | 33 | 71 |

A surplus is intended: it dwindles as the ratio falls below 1 higher up, and a run warping to a later floor starts without it. Blue and red fall up to 0.25 under theirs at depth, where the planner can't always find room for a key source. Thinned keys made potions commoner: about 6 a floor, from 5.

What helps the player keep up:
- **Already in the game:** Key Efficiency, Find Yellow Key, Key Siphon, the Effective badge, breaking wooden doors.
- **Proposed, each as its own spec later:** Find Blue Key and Find Red Key research, research or a Training row cutting wooden-door durability, a badge for door cards that lowers a door's cost or gives a key back.

## 5. Census tool

The census measures what Tower floors actually hold, averaged over many seeds, by tower and band of floors. Use it to check a schedule change, see a change's side effects (fewer yellow doors, more keys asked for), and tune numbers before and after a phase. The code is `src/tower/census.ts`, run from `tools/tower-report.ts`; the Delve's is `src/delve/census.ts`, run from `tools/delve-report.ts` (section 6).

```sh
npm run tower:report -- --census                                   # Tower I, floors 1-200 in bands of 10, 20 seeds
npm run tower:report -- --census --towers 1,5,9 --floors 1-1200 --band 100 --seeds 8 --stride 3   # a quick wide look (~1 minute)
npm run tower:report -- --census --towers 1,2,5,9 --floors 1-1200 --band 100 --seeds 20          # a full baseline (~6 minutes)
```

| Option | Default | Meaning |
|---|---|---|
| `--towers` | `1` | Towers to measure, comma separated |
| `--floors` | `1-200` | Floors counted from 1, inclusive |
| `--band` | `10` | Floors per printed row |
| `--seeds` | `20` | Run seeds per floor (the report's usual seeds, `censusSeed`) |
| `--stride` | `1` | Measure every Nth floor of the range. Pick an odd stride, so a band's boss floors (10, 20 …) are measured too |

Every figure is an average per floor over the band's floors and seeds. Two tables are printed per tower.

**Doors and keys:**

| Column | Meaning |
|---|---|
| Y door | Doors taking a yellow key (combined ones too) |
| wood, wood% | Wooden Doors, and their share of yellow locks (`wood ÷ (Y door + wood)`) |
| W want | The wooden share the schedule asks for (section 1) |
| combined | Doors taking more than one colour. Each also counts in the column of every colour it takes |
| B / R / H want | The schedule's rate for that door on those floors (section 1) |
| B / R / H alone | That door standing on its own, not in a fork lane; each door of a run counts |
| B / R / H fork | That door in a fork lane the floor built, each counting 1/k in a fork of k lanes (the hero opens one) |
| dropped | Quota doors still owed, all kinds together: those that found no place, and run doors that found no tile. Below 0, the floor holds more than its rate. *want ≈ alone + fork + dropped*; a gap there means doors are lost after placement (a bug) |
| Y / B / R key | Keys lying on the floor, by colour |
| Y/lock, B/lock, R/lock, all/lock | Keys found per lock of that colour (a Wooden Door counts as a yellow lock, a fork's lane doors 1/k). Each door of a yellow run counts, so yellow runs, the key sink, read below the aim. Below 1, the floor doesn't hold enough keys for all its doors of that colour; `-` when there are no such doors |
| Y / B / R aim | The keys per lock that colour aims for (section 4), averaged over the floors it is open on |

**Enemies and items:** enemies by strength (weak, normal, strong, elite, boss) and potions, ATK and DEF shards and treasure chests.

What to watch:
- **Schedule:** *alone + fork + dropped* should match *want* in each band. A test checks the stage keeps every door it places, and the quota's average against the schedule (`tests/door-quota.test.ts`).
- **Keys per lock:** the key economy as floors and towers rise, the figure phase 4's key-supply curve tunes.
- **Side effects:** a change to one table moves others, such as yellow doors as more become blue, or enemies as Heart Doors replace them.

To compare against an older generator, run the same command in a worktree checked out at the older commit (`git worktree add --detach <dir> <commit>`) and compare the two outputs. The baseline before the door stage: Tower I had about 1.05 blue doors, 0.25 red doors and 0.18 Heart Doors a floor at every height from floor 21 (101 for hearts) up, Tower II from floor 1.

## 6. The Delve

Each delve follows the schedules of the tower of the same number, by equivalent floor (an area is ten floors). The Delve has no strategic graph, so its labyrinth (`src/delve/labyrinth.ts`) runs its own versions of the stages, after its pockets, forks and corridor guards are placed:

- **Key colours** open on the same floors (`towerKeyColorsOn`): blue from floor 51 of the first delve, red from 101. No ordinary pattern or fork offers a blue, red or Heart Door (`withoutQuotaDoors`).
- **The door stage** (`placeQuotaDoors`): each of an area's ten floors rolls its quota from `towerDoorHundredths`, and each door goes on its own floor if it can, else on any of the area's floors from its first. The ways, chosen at random among those that fit:
  - **upgrade**: a yellow door in a pocket's throat turns blue or red. A Heart Door can replace any paid gate, including a corridor guard.
  - **combine**: a door takes the colour as well, or a coloured door takes the heart (never a run's).
  - **corridor**: a door on a corridor off the way to the milestone gate, one that no other way round passes.
  - **pattern** (blue only): a pocket takes *RareKeyCommonReward* or *RareKeyCommonBundle*.
  - **fork**: a pocket's throat becomes a fork holding the door. Other quota doors in it are extra doors, if their first floor has come. Delve forks always fit, so the lane doors count 1/k from the start.
  - **lengthen**: a single blue, red or Heart Door, or a run of two, grows a door along its throat or corridor (section 7).

  Blue and red doors never stand on the way to the milestone gate, in any delve, since the Delve plans no key to be reachable before a door. A region records what it rolled and dropped in `doorQuota`.
- **Wooden Doors** (`placeWoodenDoors`): first, yellow runs grow in pockets' throats (section 7). Then every yellow lock left (throats, corridors, fork lanes) rolls the wooden share for its floor, a run once.
- **Keys** (`supplyKeys`): for each colour the area aims for the keys-per-lock ratio's worth for its locks. A fork's lane doors count 1/k, runs each door, and a yellow run once. For blue and red, the aim is at least the scheduled doors' worth. Keys in pockets are kept at the chance that leaves the aim (a pocket left empty gets a potion); while short, junctions roll for keys at the chance of how short. This replaces the old 32% junction key. On the floor a blue or red key first appears, the cell nearest the entrance from that floor holds one.

At shallow depths this matches the Delve's old mix, about 1–2 blue doors an area. The schedule then grows as in the Tower. Areas hold far fewer yellow keys than before: about 5.5 in the first areas, from about 14.

```sh
npm run delve:report -- --census                                       # the first delve, floors 1-200 in bands of 50, 20 seeds
npm run delve:report -- --census --tiers 1,5,9 --floors 1-1000 --band 100 --seeds 10   # about 15 seconds a delve
```

The options and columns are the Tower census's (section 5), with `--tiers` for `--towers` and no `--stride`. Each band covers every area holding one of its floors, and every figure is per equivalent floor.

First measurement (`--tiers 1,5,9 --floors 1-1000 --band 100 --seeds 10`), measured against wanted or aimed:

| Floors | Delve 1: blue doors, red, heart · yellow, blue keys per lock | Delve 5 | Delve 9 |
|---|---|---|---|
| 1–100 | 0.05/0.07, 0/0, 0/0 · 1.30/1.28, 2.00/1.19 | 0.12/0.12, 0.05/0.05, 0/0 · 0.89/0.88, 1.07/0.78 | 0.20/0.17, 0.11/0.11, 0/0 · 0.50/0.50, 0.51/0.40 |
| 401–500 | 0.94/0.90, 0.43/0.45, 0.34/0.34 · 1.15/1.08, 1.04/1.00 | 0.97/0.94, 0.47/0.48, 0.39/0.39 · 0.73/0.68, 0.60/0.59 | 0.99/0.97, 0.51/0.53, 0.41/0.42 · 0.51/0.50, 0.41/0.40 |
| 901–1000 | 1.73/1.90, 0.93/0.95, 0.84/0.84 · 0.89/0.83, 0.79/0.75 | 1.75/1.93, 0.96/0.98, 0.88/0.88 · 0.56/0.50, 0.44/0.40 | 1.76/1.97, 1.00/1.02, 0.92/0.93 · 0.59/0.50, 0.45/0.40 |

Doors placed (alone plus in forks) track the schedule. About 0.2 a floor is dropped past floor 900, where an area runs out of places. Blue keys per lock on floors 1–100 include floor 51's entrance key, set against few blue doors.

## 7. Door runs and fork accounting

**Fork lanes count 1/k.** A hero opens one lane of a fork, so each door in a fork of k lanes counts 1/k, toward the door quota and toward the keys a floor plans:
- **Delve:** forks always fit, so they count 1/k from the start, and the door stage places the rest of the quota elsewhere.
- **Tower:** about three quota forks in four don't fit and stand as their single gate, the door itself. So the door stage counts each as that door. After layout, each fork that fit settles the difference with runs (`settleQuota` in `embedder.ts`), a door at a time, a fraction at its chance:
  - a door owed lengthens a single door or run of two of that kind into a run;
  - extra doors in a branch fork's lanes shorten a run.

  What can't be settled stays owed, in the census's *dropped*. Keys settle the same way (section 4).

**Door runs** are two or three of the same door in a row in one gate, each paid in turn:
- **Blue, red and Heart Door runs** come from the door stage's *lengthen* way and from settling, and count every door toward the quota. A Heart Door run compounds its drain: with Heart Door Resilience each door drains its share of the HP above 1, so 101 HP at 50% goes to 51, then 26.
- **Yellow runs are a key sink.** From floor 6, a plain yellow door off the way to the stairs becomes a run 15% of the time (`YELLOW_RUNS`: of three 30% of those, else two). In the Delve this applies to doors in a pocket's throat. The run rolls the wooden share once, so its doors are all Wooden or all yellow. The key supply plans one key for the whole run, so each run spends keys the surplus would otherwise keep.
- **Where they stand:**
  - **Tower:** the doorway, then the tile just inside the region it opens, then (a run of three) the tile just outside in the parent's chamber. The doorway is the only way between those two tiles, so neither can be walked round. They're laid after the chambers are furnished (`layRuns`), only on open floor that keeps its chamber in one piece and stands by no other doorway, the entrance or the stairs. A door that finds no place stays owed. About 9 run doors in 10 find their tile.
  - **Delve:** the next single-width tiles of the same throat or corridor.
- **The hand:** the door cards head for a run only while the hero can pay for every door of it (`paysRun` in `cards.ts`), so a hand never spends keys on a run it would stop partway through.

Measured (`--towers 1,9 --floors 1-1000 --band 200 --seeds 4 --stride 7`), wanted against standing (alone plus fork):

| Floors | Tower I: blue, red, heart doors · yellow, blue keys per lock (aim) | Tower IX |
|---|---|---|
| 1–200 | 0.18/0.19, 0.07/0.05, 0/0 · 1.22 (1.25), 1.33 (1.16) | 0.27/0.24, 0.16/0.16, 0.05/0.06 · 0.61 (0.50), 0.64 (0.40) |
| 401–600 | 0.99/0.94, 0.49/0.52, 0.39/0.38 · 1.16 (1.05), 1.04 (0.98) | 1.07/1.05, 0.57/0.60, 0.47/0.43 · 0.65 (0.50), 0.54 (0.40) |
| 801–1000 | 1.79/1.74, 0.89/0.82, 0.79/0.80 · 1.00 (0.85), 0.85 (0.78) | 1.87/1.84, 0.97/0.91, 0.87/0.87 · 0.67 (0.50), 0.49 (0.40) |

Tower keys per lock now sit near their aims; before the coverage cap, yellow ran 0.1–0.3 above it. As a result Tower I's floors 1–200 hold about 0.5 fewer yellow keys a floor than before (3.6, from 4.1). Raise the yellow ratio if the old surplus is wanted back.

## 8. Build order

1. **Census tool** on today's generator, to record a baseline.
2. **Door stage:** blue, red and heart quotas, and the new first floors.
3. **Wooden doors:** the rule, art, card and skill, and the wooden share.
4. **Key supply curve.**
5. **The Delve** adopts the same schedules by equivalent floor (section 6; done).
6. **Door runs and fork accounting** (section 7; done).

After each phase: re-run the census and bump `TOWER_LAYOUT_VERSION`. Phase 3 also bumps the Delve's `LAYOUT_VERSION`, because its steel doors become wooden.

Goldens re-recorded, as they fail:
- **Phases 2–4:** `tower-layout`, `tower-planning`, `tower-forks`, `world-boards`, `decor-plan`, `step-trace`, `undo-clear-trace`, `tower-automation`, `render-calls`, `render.golden.json`, `ui.golden.json`.
- **Phase 3 also:** `delve-labyrinth`, `delve-automove`, `tournament-trace`, `save-decode` (renamed card ids).
- **Phase 5:** the Delve goldens again.

`AGENTS.md`, `CONTEXT.md` (Wooden Door, Durability, Key Supply, door quota) and `docs/PROGRESSION_AND_DIFFICULTY.md` change in the same commits as the code.

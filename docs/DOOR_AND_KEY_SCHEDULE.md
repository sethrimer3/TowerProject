# Door and key schedule

How often each kind of door, and the keys to open them, appear on a Tower floor, by tower and floor. The goal is one steady difficulty ramp: every floor a little harder than the one below, every tower a little harder than the one before, so the player needs to keep investing in progress upgrades (Key Efficiency, the Find Key research, Key Siphon, badges) to keep up.

The Delve keeps its current doors and keys until the Tower schedules have been checked. Then it is meant to adopt the same schedules by equivalent floor (phase 5).

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

Key colours follow their doors: a blue or red key appears only from that colour's first floor (`keyColorsOn` takes the new first floors). A key of a colour not yet open still comes as a yellow key, as now.

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
   - a2. **Combine:** a door that doesn't take the colour yet takes it as well, in the same tile: yellow becomes *Amber + Azure* (yellow + blue), blue becomes *Azure + Crimson*, and so on up to the *Triune Door*. A combined door counts toward the quota of each colour it adds and costs every key it lists. The door rules, names and art already exist (`door_ab.png` … `door_abc.png`). A Heart Door with a colour (keys *and* the drain to 1 HP) needs a new door rule, so it comes with the wooden door's rule work in phase 3.
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

     A quota fork holds only one quota door, so the fallback gate keeps the count whether or not the fork fits. *blueOrRedDoor* and *twoBlueDoorsOrRedDoor* hold both a blue and a red door, so they're no longer built. About one quota fork in five fits the floor; the rest stand as their single door.

   A door that fits nowhere is dropped, and the census counts it (section 5). A door in a fork counts fully toward the quota. The census reports forked and unforked doors separately, so we can see whether forks take too much of the quota, given that a forked door can be walked around.
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
| Cards | WOODEN DOOR (was STEEL DOOR) heads for a Wooden Door the hero holds a key for or can break down and survive. DOOR heads for one only with a key: it never breaks one down. |

Possible later change (to decide after the census): `HP cost = max(0, durability − ATK)`, so a strong hero breaks it for free, with DEF still not helping.

### Heart Door with a colour

A door that takes its keys **and** drains the hero to 1 HP, as a Heart Door does (Heart Door Resilience applies to the drain). For the heart quota, the door stage's combine way gives an existing blue, red or combined door the heart (a gate's `heart`), counting toward the heart quota. The door rule has a heart flag (`{ type: "keys", …, heart: true }`, `drainsHp`), `resolveStep` applies both costs, and it is named after its keys (*Azure Heart Door*). The hand-drawn art is a placeholder: the keys' door with a heart crest above (`door_bh.png`, `door_abch.png` …, from `npm run tiles:area1`); the procedural and neon doors draw the heart over the coloured door. HEART DOOR heads for one while its keys are held.

What changes in the code:
- **Door rule** (`entities.ts`, `doors.ts`): a new `{ type: "wood"; durability: number }` takes the steel rule's place in generation (the steel rule, `keys: all three, mode: "any"`, still works but nothing places it). `doorCost` returns the key, or none when the hero would survive breaking it (a caller passing no HP, like the floor analyzer, counts it as breakable). `resolveStep` (`step-effects.ts`) takes the HP. Every other caller reads it from there.
- **Planning** (`tower/types.ts`, furnisher, forks, analyzer): the gate `steel` becomes `wood`. The analyzer's map shows `W`.
- **Card and skill**: the STEEL DOOR card and its skill (`cardSteelDoor` in `config.ts`) become WOODEN DOOR. It heads for a wooden door the hero holds a key for or can break without dying. The renamed ids drop the old card from saved hands. During the prototype phase old saves don't need to convert.
- **Art**: a new wooden-door sprite (`public/assets/doors/door_wood.png`, replacing `door_steel.png`), a wooden painter in `tile-painters.ts`, and a neon look.
- **The Delve**: its steel gates become wooden doors with durability from the Delve's own enemy curve. How often they appear doesn't change yet.

## 4. Key supply

Keys get scarcer per door as the floors and towers rise. Progress upgrades are meant to close the gap.

`supply(t, f) = max(S_min, S₀ − a·(t−1) − b·⌊(f−1)/10⌋)` with S₀ = 1.5, a = 0.1, b = 0.005, S_min = 0.4 to start.

It is applied as a share kept, `keep = supply / S₀` (1 on Tower I's first ten floors, down to 0.27 at the lowest: floor 2201 in Tower I, 601 in Tower IX), at three points (`TOWER_KEY_SUPPLY`, `keepsKey` and `towerKeyKeep` in `src/key-schedule.ts`, in ten-thousandths so every engine rolls alike):
- **Pattern key rewards:** each key in a pattern's package stays with chance `keep`. Packages thin out rather than vanish: a package's last item is never removed.
- **Resource planner:** its chance to add a key for a door with none is multiplied by `keep` on branches. On the way to the stairs it uses a gentler curve, half the slopes (`a/2`, `b/2`), so the main route is the last place to run short.
- **Unguarded loot:** its keys are kept with chance `keep`. When one isn't kept, the roll gives nothing.

Floors 2–5's keys behind every door aren't thinned, nor are the keys the planner adds as sources (their chance is what it thins). Because the curve scales today's generator, S₀ isn't an actual ratio of keys to locks. The census reports the real ratio, and the four numbers get tuned from it.

First measurement (`--towers 1,5,9 --floors 1-1000 --band 200`, keys per lock, all colours): Tower I falls from 1.50 (floors 1–200) to 0.92 (801–1000), Tower V from 1.30 to 0.72, Tower IX from 1.02 to 0.63. By colour, at floors 801–1000 of Tower I: yellow 1.40, blue 0.49, red 0.19. Two things the single curve doesn't address:
- **Blue keys outnumber blue doors early** (2.75 keys per lock on Tower I's floors 1–200), because ordinary patterns give blue keys freely while blue doors come only by quota.
- **Red keys are scarce everywhere** (0.1–0.3 per lock), since red keys come almost only from the planner's sources and red trade rooms.

Both could be handled by a supply per colour, or by placing blue and red keys by quota alongside their doors.

What helps the player keep up:
- **Already in the game:** Key Efficiency, Find Yellow Key, Key Siphon, the Effective badge, breaking wooden doors.
- **Proposed, each as its own spec later:** Find Blue Key and Find Red Key research, research or a Training row cutting wooden-door durability, a badge for door cards that lowers a door's cost or gives a key back.

## 5. Census tool

The census measures what Tower floors actually hold, averaged over many seeds, by tower and band of floors. Use it to check a schedule change, see a change's side effects (fewer yellow doors, more keys asked for), and tune numbers before and after a phase. The code is `src/tower/census.ts`, run from `tools/tower-report.ts`.

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
| steel, steel% | Steel doors, and their share of yellow locks (`steel ÷ (Y door + steel)`): the wooden share once phase 3 lands |
| combined | Doors taking more than one colour. Each also counts in the column of every colour it takes |
| B / R / H want | The schedule's rate for that door on those floors (section 1) |
| B / R / H alone | That door standing on its own, not in a fork lane |
| B / R / H fork | That door in a fork lane the floor built |
| dropped | Quota doors the door stage found no place for, all kinds together. *want ≈ alone + fork + dropped*; a gap there means doors are lost after placement (a bug) |
| Y / B / R key | Keys lying on the floor, by colour |
| Y/lock, B/lock, R/lock, all/lock | Keys found per lock of that colour (a steel door counts as a yellow lock). Below 1, the floor doesn't hold enough keys for all its doors of that colour; `-` when there are no such doors |

**Enemies and items:** enemies by strength (weak, normal, strong, elite, boss) and potions, ATK and DEF shards and treasure chests.

What to watch:
- **Schedule:** *alone + fork + dropped* should match *want* in each band. A test checks the stage keeps every door it places, and the quota's average against the schedule (`tests/door-quota.test.ts`).
- **Keys per lock:** the key economy as floors and towers rise, the figure phase 4's key-supply curve tunes.
- **Side effects:** a change to one table moves others, such as yellow doors as more become blue, or enemies as Heart Doors replace them.

To compare against an older generator, run the same command in a worktree checked out at the older commit (`git worktree add --detach <dir> <commit>`) and compare the two outputs. The baseline before the door stage: Tower I had about 1.05 blue doors, 0.25 red doors and 0.18 Heart Doors a floor at every height from floor 21 (101 for hearts) up, Tower II from floor 1.

## 6. Build order

1. **Census tool** on today's generator, to record a baseline.
2. **Door stage:** blue, red and heart quotas, and the new first floors.
3. **Wooden doors:** the rule, art, card and skill, and the wooden share.
4. **Key supply curve.**
5. **The Delve** adopts the same schedules by equivalent floor, after the Tower is checked.
6. **Door runs (later):** two or three doors of the same colour in a row in a single gate, to make one gate dearer than a combined door can. A gate is one tile today. Fork lanes already run one to three tiles deep (the embedder carves a band of rows for them), so a door run would be a one-lane crossing built the same way, counting each door toward the quota. Left until the rest has been checked, since it needs embedder work.

After each phase: re-run the census and bump `TOWER_LAYOUT_VERSION`. Phase 3 also bumps the Delve's `LAYOUT_VERSION`, because its steel doors become wooden.

Goldens re-recorded, as they fail:
- **Phases 2–4:** `tower-layout`, `tower-planning`, `tower-forks`, `world-boards`, `decor-plan`, `step-trace`, `undo-clear-trace`, `tower-automation`, `render-calls`, `render.golden.json`, `ui.golden.json`.
- **Phase 3 also:** `delve-labyrinth`, `delve-automove`, `tournament-trace`, `save-decode` (renamed card ids).
- **Phase 5:** the Delve goldens again.

`AGENTS.md`, `CONTEXT.md` (Wooden Door, Durability, Key Supply, door quota) and `docs/PROGRESSION_AND_DIFFICULTY.md` change in the same commits as the code.

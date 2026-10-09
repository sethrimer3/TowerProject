# Door and key schedule (spec, for approval)

How often each kind of door, and the keys to open them, appear on a Tower floor, by tower and floor. The goal is one steady difficulty ramp: every floor a little harder than the one below, every tower a little harder than the one before, so the player needs to keep investing in progress upgrades (Key Efficiency, the Find Key research, Key Siphon, badges) to keep up.

The Delve keeps its current doors and keys until the Tower schedules have been checked. Then it is meant to adopt the same schedules by equivalent floor (phase 5).

Notation: `t` is the tower number (1–9), `f` the floor counted from 1, and `⌊x⌋` rounds down. The code counts floors from 0 (`depth = f − 1`).

## 1. The schedules

| Door | First floor | How often | Limit |
|---|---|---|---|
| **Wooden** (replaces Steel) | 1 | Share of yellow locks made wooden: `100% − 10%·(t−1) − 1%·⌊(f−1)/10⌋`, never below 0 | Gone from floor 1001 in Tower I, 901 in II, … 201 in IX |
| **Blue** | `51 − 5(t−1)`: 51 in Tower I … 11 in IX | Expected doors per floor: `0.01·(1 + ⌊(min(f, 1000) − first)/10⌋)` | Stops rising at floor 1000 |
| **Red** | `101 − 10(t−1)`: 101 … 21 | The same formula | Stops rising at floor 1000 |
| **Heart** | `201 − 10(t−1)`: 201 … 121 | `0.01·(1 + ⌊(f − first)/10⌋)` | Stops rising at 1 per floor (floor 1191 in Tower I, 1111 in IX) |

Example values:

| | Floor 101 | Floor 201 | Floor 501 | Floor 1000 |
|---|---|---|---|---|
| Tower I: wooden / blue / red / heart | 90% / 0.06 / 0.01 / 0 | 80% / 0.16 / 0.11 / 0.01 | 50% / 0.46 / 0.41 / 0.31 | 1% / 0.95 / 0.90 / 0.80 |
| Tower V | 50% / 0.08 / 0.05 / 0 | 40% / 0.18 / 0.15 / 0.05 | 10% / 0.48 / 0.45 / 0.35 | 0 / 0.97 / 0.94 / 0.84 |
| Tower IX | 10% / 0.10 / 0.09 / 0 | 0 / 0.20 / 0.19 / 0.09 | 0 / 0.50 / 0.49 / 0.39 | 0 / 0.99 / 0.98 / 0.88 |

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
   - a. **Upgrade a gate:** an existing yellow-door gate becomes blue or red, or any paid gate becomes a Heart Door.
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

   A door that fits nowhere is dropped, and the census counts it (section 5). A door in a fork counts fully toward the quota. The census reports forked and unforked doors separately, so we can see whether forks take too much of the quota, given that a forked door can be walked around.
4. **Wooden doors:** every yellow lock left (gates, the stairs door, shortcuts, fork lanes) rolls the wooden share.
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
| Shown | Inspect: *Wooden Door*, *Durability 38*, and without a key *Break: −38 HP*. Damage Visual shows the HP cost on the door. Breaking it shows the damage number on the hero, with no fight animation. |

Possible later change (to decide after the census): `HP cost = max(0, durability − ATK)`, so a strong hero breaks it for free, with DEF still not helping.

What changes in the code:
- **Door rule** (`entities.ts`, `doors.ts`): a new `{ type: "wood"; durability: number }` replaces the steel rule (`keys: all three, mode: "any"`). `doorCost` returns the key, or none and the HP cost. `resolveStep` (`step-effects.ts`) applies it. Every other caller reads it from there.
- **Planning** (`tower/types.ts`, furnisher, forks, analyzer): the gate `steel` becomes `wood`. The analyzer's map shows `W`.
- **Card and skill**: the STEEL DOOR card and its skill (`cardSteelDoor` in `config.ts`) become WOODEN DOOR. It heads for a wooden door the hero holds a key for or can break without dying. The renamed ids drop the old card from saved hands. During the prototype phase old saves don't need to convert.
- **Art**: a new wooden-door sprite (`public/assets/doors/door_wood.png`, replacing `door_steel.png`), a wooden painter in `tile-painters.ts`, and a neon look.
- **The Delve**: its steel gates become wooden doors with durability from the Delve's own enemy curve. How often they appear doesn't change yet.

## 4. Key supply

Keys get scarcer per door as the floors and towers rise. Progress upgrades are meant to close the gap.

`supply(t, f) = max(S_min, S₀ − a·(t−1) − b·⌊(f−1)/10⌋)` with S₀ = 1.5, a = 0.1, b = 0.005, S_min = 0.4 to start.

It is applied as a share kept, `keep = supply / S₀` (1 on Tower I's floor 1, down to 0.27 at the lowest), at three points:
- **Pattern key rewards:** each key in a pattern's package stays with chance `keep`. Packages thin out rather than vanish: a package's last item is never removed.
- **Resource planner:** its chance to add a key for a door with none is multiplied by `keep` on branches. On the way to the stairs it uses a gentler curve, half the slopes (`a/2`, `b/2`), so the main route is the last place to run short.
- **Unguarded loot:** its keys are kept with chance `keep`. When one isn't kept, the roll gives nothing.

Floors 2–5's keys behind every door aren't thinned. Because the curve scales today's generator, S₀ isn't yet an actual ratio of keys to locks. The census reports the real ratio, and the four numbers get tuned from it.

What helps the player keep up:
- **Already in the game:** Key Efficiency, Find Yellow Key, Key Siphon, the Effective badge, breaking wooden doors.
- **Proposed, each as its own spec later:** Find Blue Key and Find Red Key research, research or a Training row cutting wooden-door durability, a badge for door cards that lowers a door's cost or gives a key back.

## 5. Census tool

`npm run tower:report -- --census [--towers 1,2,9] [--floors 1-1200] [--seeds 60]` prints, by tower and by band of floors:
- doors per floor by kind;
- keys per floor by colour;
- keys per lock, by colour and overall;
- the share of wooden doors;
- blue, red and Heart Doors split into those in a fork and those standing alone;
- quota doors dropped (section 2, step 3).

Each schedule's number is printed beside what was measured, so a mismatch shows. A test checks the census on a small sample against the formulas in section 1, within a tolerance.

## 6. Build order

1. **Census tool** on today's generator, to record a baseline.
2. **Door stage:** blue, red and heart quotas, and the new first floors.
3. **Wooden doors:** the rule, art, card and skill, and the wooden share.
4. **Key supply curve.**
5. **The Delve** adopts the same schedules by equivalent floor, after the Tower is checked.

After each phase: re-run the census and bump `TOWER_LAYOUT_VERSION`. Phase 3 also bumps the Delve's `LAYOUT_VERSION`, because its steel doors become wooden.

Goldens re-recorded, as they fail:
- **Phases 2–4:** `tower-layout`, `tower-planning`, `tower-forks`, `world-boards`, `decor-plan`, `step-trace`, `undo-clear-trace`, `tower-automation`, `render-calls`, `render.golden.json`, `ui.golden.json`.
- **Phase 3 also:** `delve-labyrinth`, `delve-automove`, `tournament-trace`, `save-decode` (renamed card ids).
- **Phase 5:** the Delve goldens again.

`AGENTS.md`, `CONTEXT.md` (Wooden Door, Durability, Key Supply, door quota) and `docs/PROGRESSION_AND_DIFFICULTY.md` change in the same commits as the code.

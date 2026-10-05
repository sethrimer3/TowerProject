# Progression and Difficulty Curve

**Status:** Design source of truth for planned progression balancing. Exact numerical tuning is expected to change after simulation and playtesting, but the relationships and gating rules in this document should remain stable unless deliberately redesigned.

This document defines how Tower height, Delve depth, Inspiration, research, equipment progression, mastery rewards, and run-start checkpoints should fit together.

---

## 1. Core progression scale

Tower and Delve progress at different spatial rates, but they should use the same underlying difficulty/economy scale.

Define the shared progression value `E` (equivalent Tower floor):

```ts
E = towerFloor                 // Tower
E = floor(delveDepth / 10)     // Delve
```

Therefore:

| Tower | Delve | Equivalent progression |
|---:|---:|---:|
| Floor 1 | Depth 10 | E = 1 |
| Floor 5 | Depth 50 | E = 5 |
| Floor 10 | Depth 100 | E = 10 |
| Floor 20 | Depth 200 | E = 20 |
| Floor 50 | Depth 500 | E = 50 |
| Floor 70 | Depth 700 | E = 70 |
| Floor 100 | Depth 1000 | E = 100 |

**Design rule:** if an enemy, material, equipment tier, recipe, or other progression feature is intended for Tower floor `F`, its Delve counterpart should normally appear around depth `F × 10`.

This does **not** require Tower and Delve to have identical encounter density, layouts, or rewards. It means that an enemy encountered at Tower floor 30 and an enemy encountered around Delve depth 300 should be built against approximately the same player-power budget.

---

## 2. Reach progression vs. mastery progression

The Tower should have two related but distinct forms of progress.

### Reach progression

**Reach progression** is the highest Tower floor the player has successfully reached.

Reaching new heights should:

- award the player's predictable baseline supply of **Inspiration**;
- unlock Tower checkpoints;
- unlock or contribute toward research availability;
- unlock higher material/equipment bands;
- establish the player's current progression tier.

The player should be able to **reach a floor before they are powerful enough to fully master it**.

### Mastery progression

**Mastery progression** is returning to earlier areas and clearing and mastering them after persistent upgrades make those challenges realistically achievable.

The intended loop is:

1. Push upward as far as possible.
2. Earn Inspiration from new height.
3. Purchase persistent research upgrades.
4. Find/craft stronger equipment.
5. Return to earlier Tower floors.
6. Clear and master areas that were previously too difficult.
7. Use those mastery rewards to accelerate further progression.
8. Push upward again.

**Core design principle:** *first access demonstrates progression; later mastery demonstrates accumulated power.*

An area should not generally be balanced so that a player is expected to reach it, fully clear it, and master it on the same first visit.

---

## 3. Tower area rewards

Every ten Tower floors ending at a Goals checkpoint (1–10, 11–20 …) are an **area** (a section: its first floor is sealed below). Climbing onto the next area's first floor judges the area left behind (`src/tower/area-ledger.ts`):

### Cleared

No enemy is left on any of the area's floors. It pays 10 Inspiration (about one a floor), at any height.

Clearing should primarily test **sufficient overall power to fully clear content that could previously be bypassed**.

### Mastered

The hero took no fight damage anywhere in the area, in one run (a Heart Door's toll, draining to 1 HP, doesn't count: it can stand on the only way up). Mastering an area that ends at a checkpoint unlocks warping to that checkpoint (once Warp, Tower I's floor 40 reward, is owned); areas past the last checkpoint can't be mastered until checkpoints are defined there.

Mastery should test a substantially stronger build than merely reaching or clearing the area, and may reasonably lag significantly behind the player's current maximum Tower height.

Each reward is paid the moment it is earned, once per area in each tower, and kept for good. A chest for each (gold for mastered, silver for cleared) stands in front of the hero on the next floor; opening it shows the reward but pays nothing more.

### No artificial medal lock

Area rewards have no rule such as "mastery cannot be earned until Floor 20 is reached."

Instead, enemy difficulty and persistent-power progression should make mastery *practically* unobtainable until the player has acquired enough research/equipment. A sufficiently clever or unusually optimized player may master an area somewhat earlier than the expected curve.

---

## 4. Inspiration economy and anti-circularity rule

Inspiration is the Tower's persistent research currency and is the main bridge between reaching new floors and becoming strong enough to master older ones.

### Baseline Inspiration

The current progression model awards approximately **1 Inspiration for each new maximum Tower floor reached**, up to floor 100. This provides a predictable guaranteed budget tied directly to progression. Past floor 100 it slows: 1 for every 10 new floors up to floor 1,000, then 1 for every 100 new floors up to floor 10,000, and none after (100, 190 and 280 Inspiration in all at those floors; `milestonePoints` in `src/modes.ts`). Courage follows the same schedule over equivalent floors (10 Delve depth each).

### Mastery Inspiration

Clearing an area grants 10 more Inspiration, once per area in each tower. This is **bonus/acceleration income**, not the baseline progression budget.

### Balance rule

If an upgrade is required to make reaching a future progression milestone realistic, that upgrade must be affordable using rewards obtainable **before** that milestone.

Do not create circular requirements such as:

> Floor 20 requires Upgrade A → Upgrade A requires 22 Inspiration → the only practical way to have 22 Inspiration is to clear Floor 20.

Instead:

- **mandatory progression upgrades** should be affordable primarily from guaranteed reach income and earlier content;
- **mastery rewards** should let strong/efficient players buy upgrades sooner or buy additional optional upgrades;
- area rewards should not be required for ordinary forward progression unless that dependency is explicitly designed and tested.

### Current Inspiration-tree reference

Every Inspiration skill is an unlock, bought once; more of what one gives comes from other panels (Rehearsed steps, 5 Inspiration after the Archives, gives the first undo and opens four levels of Undo Count research).

With the current first-level costs, the direct prerequisite path to unlock Delve is approximately:

- Combat Stance: 1 Inspiration
- Buildout: 1 Inspiration
- Training: 1 Inspiration
- Larger Hand: 1 Inspiration
- Archives: 5 Inspiration
- Into the depths: 3 Inspiration
- **Total minimum path: 12 Inspiration**

Gear (1 Inspiration) branches off Buildout, left of it, then ATK Up (5 Inspiration, below Gear: the ATK UP card, heading for ATK pickups) and DEF Up (5 Inspiration, below ATK Up: the DEF UP card, heading for DEF pickups). Trainers (1 Inspiration, on the path between Buildout and Larger Hand) hires the first trainer on the Training tab, which is open from the start for training points. On the Job (1 Inspiration, right of Buildout: Training bought with Silver inside a run) branches off Buildout, then Regen (1 Inspiration, below On the Job: Regen training) and Heal (3 Inspiration) below Regen, so those five are off that path. Then Blue Key (2 Inspiration, after the Archives, below DEF Up) adds the BLUE KEY card, and Faster Trainers (2 Inspiration, after the Archives, right of Into the depths) opens Faster Trainers research (+2% training speed a level for 100 levels; the n-th level costs 250 × n Gold and takes 1.75 × n hours, about 368 days and 1.26 million Gold in all, against Potion HP's seven weeks); both are off the path too. In the Courage tree, Rush (1 Courage, after Movement Speed) opens Rush research (+1 tile rushed a level for 25 levels: the n-th level costs 250 × n × 2^(n−1) Gold and takes 1.75 × n × 1.2^(n−1) hours, Faster Trainers' levels made steeper, about 201 billion Gold and 697 days in all), since a faster pace of play is worth the most; it took the place of Stone skin (+1 DEF a rank). Badges (2 Courage, after Focus) opens card badges, drawn with Gems (20 each, 200 for ten) by rarity (common 70%, rare 27%, epic 3%; 5 commons, 4 rares and 4 epics in the stock pool), 80 copies taking one to level 7, after which it leaves the pool and its rarity's share goes to those still drawable. Simulated, a given common reaches level 7 after about 540 draws (11k Gems), a rare about 740 (15k), an epic about 1,030 (21k), and every stock badge about 1,040 draws (21k Gems), since the last draws all land on the few badges still open; each badge added to the pool raises these. The XP badge pays its value (1, 4, 9 … 49) times `xpBase(floor) / xpBase(0)`, so it stays the same share of a kill's XP at every height: about 0.11×, 1.8× and 5.4× a normal kill at levels 1, 4 and 7. On MONSTER (one activation a kill) that multiplies a run's XP by about 1.1, 2.8 and 6.4, and since levels grow with the cube root of lifetime XP, a hero's level by about 1.04, 1.41 and 1.86 in the long run. If the player earned only the guaranteed reach-based Inspiration, this places the current Delve unlock around floor 11 in Tower progression. Areas cleared can move that timing earlier.

This is a useful reference point, **not a commitment that 12 is the final desired Delve-unlock cost**.

### Key colours by floor

Tower I and Delve I hold only yellow keys and doors (and steel doors) through floor 20: blue keys and doors first appear on floor 21 (the Delve's equivalent floor 21), the first floor of the section after the floor 20 boss, and red ones on floor 51 (`FIRST_TIER_KEY_FLOORS` in `src/key-schedule.ts`), so the Blue Key card and blue-key skills earn their place as the climb reaches them. In Tower I a blue or red door is never the only way to the stairs, so a run without the key never dead-ends on one (`bypassesRareKeys`): a main-route or stairs gate is never one, and a fork on the main route offers one only beside a lane that needs neither colour, paying another way (a yellow door, a fight); should the fork not fit, the embedder falls back to the single gate, which is never blue or red. Optional rooms may still hide treasure or keys behind them. Tower II and later keep the old rule, since a hero there has the upgrades to get past such a door. From Tower II and Delve II on, every colour appears from the first floor, as in Tower I's old schedule: a hero who reaches them has met blue and red keys already. Heart Doors, in every tier, first appear on floor 31 (`HEART_DOOR_FLOOR`, `heartDoorsOn`), on main-route gates and in fork lanes alike.

### Gems and the hand's slots

Gems are the premium currency, kept between runs. A run's floors give one Gem at a time: the next new floor reached (Tower floor, or each 10 Delve depth) holds one, then none for 30 minutes after it is collected; one missed (its floor left, or its run ended) comes back every 3 new floors until collected. The ad button pays 7 Gems every 10 minutes (not yet a real ad). The hand holds 4 cards, 5 with Larger Hand, and Larger Hand sells six more slots for 50, 200, 400, 600, 800 and 1,000 Gems (3,050 in all, 11 slots), sold whether or not the deck has cards to fill them yet. A Training stat resets for 2 Gems, returning every point spent on it. Still to come: a Shop page with free Gems once a day (resetting at 00:00 GMT) and Gems bought with real money.

### Higher towers (tiers)

Claiming floor 100's Goals checkpoint in a tower (claimable once its boss is beaten) opens the next, up to Tower IX (`src/goals.ts`); the Delve's caves follow the towers: each tower opened opens the cave of its number, and a Delve boss opens nothing. Each cave pays its own milestones, so a new one pays Courage again for every new equivalent floor reached in it, as a new tower pays Inspiration (`src/tiers.ts`). Tier *n*'s enemies have 3^(n−1) times tier 1's HP, ATK and DEF on the same layouts. Combat is linear in those stats (each strike deals ATK − DEF, against HP), so a hero with three times the ATK, DEF, max HP and shroud fights each enemy exactly as before: the same rounds, the same share of HP lost. What doesn't scale makes the next tier a little harder still: flat potions (35 HP), ATK/DEF pickups and the enemy's ATK rising at least 1 a round (negligible at these numbers); improving potions and pickups is left to upgrade trees. Silver pays the same, so a run buys about the same run training levels, each worth a third as much against the enemies: surviving as far takes a higher baseline (Training through levels, gear, research).

Each tier pays more Gold (kills, treasure, the Delve's end-of-run Gold), per tier in tenths: ×1, ×2, ×3.1, ×4.3, ×5.6, ×7, ×8.5, ×10.1, ×11.8 (each step one more than the last, plus a tenth more every tier after the second), Gold keeping its fraction (1 Gold is 3.1 in Tower III). Kill XP grows by the same factor as the enemies' stats: ×3 in Tower II, ×9 in III, up to ×6,561 in IX, so the hero levels as much faster as the enemies are stronger. So a hero strong enough for a higher tier farms more Gold and XP per unit time there. Each tier keeps its own records and pays its milestones again from its first floor (on the schedule above), so climbing more towers raises the Inspiration and Courage available overall. Areas mastered and cleared are tracked per tower too.

---

## 5. Intended mastery lag

The player should usually be several progression steps ahead of the floors they can reliably master.

A useful initial tuning target is:

- **Reach ceiling:** current maximum Tower progression.
- **Clearing ceiling:** generally several floors behind the reach ceiling.
- **Mastery ceiling:** farther behind clearing.

This lag should come from combat math, research, equipment, and player optimization—not from explicit medal locks.

### First-pass balancing targets

These are approximate playtest targets, not hard rules:

| Highest Tower floor reached | Delve-equivalent depth | Rough clearing target | Rough mastery target |
|---:|---:|---:|---:|
| 10 | 100 | none | none |
| 20 | 200 | Floors 1–10 | none |
| 30 | 300 | Floors 1–20 | Floors 1–10 |
| 50 | 500 | Floors 1–40 | Floors 1–30 |
| 75 | 750 | Floors 1–60 | Floors 1–50 |
| 100 | 1000 | Floors 1–90 | Floors 1–80 |

These targets are intentionally broad. Actual mastery will vary based on build quality and player decisions.

The important relationship is:

```text
maximum reached > reliable clearing ceiling > reliable mastery ceiling
```

---

## 6. Difficulty scaling rules

Enemy power in both modes should derive from the shared equivalent-floor value `E` rather than maintaining unrelated Tower and Delve difficulty curves.

### Design requirements

1. **One shared reference curve.** Tower floor `F` and Delve depth `10F` should target approximately the same player power.
2. **Enemy identity may modify the curve.** Tanks, glass cannons, guardians, etc. can redistribute HP/Attack/Defense without changing the overall progression tier.
3. **Bosses/elites may exceed the local budget.** Their multiplier should be explicit and data-driven. In the Tower this is `TOWER_ENEMY_STRENGTH` (`src/scaling.ts`): normal enemies use their floor's zone roster as is, weak enemies are its balanced enemy with HP and ATK ×0.75 (as in the Delve), strong enemies use it with every stat ×1.25 (tier 2), elite enemies come from the next zone's roster (tier 3; generation places strong enemies only from floor 11 and elites only from floor 41, standing one asked for below that one strength lower, `strengthOnFloor`; the Delve counts its equivalent floor), and a boss is a strong enemy with twice its HP and ATK (`BOSS_OVER_STRONG`; tier 4; the Delve's `DELVE_ENEMY_STRENGTH` doubles its strong enemy the same way). On top of all that, every enemy's DEF compounds with progress (`ENEMY_DEFENSE_GROWTH` in `src/scaling.ts`, rounded once at the end): ×1.01 for every five Tower floors (floors 6–10 ×1.01, floor 100 ×1.21, floor 200 ×1.47; an elite grows with the floor it stands on, not its roster's) and ×1.01 for every 20 Delve depth, applied to its whole DEF (base, strength and profile bonuses), a steeper curve: ×1.27 at depth 500, ×1.63 at 1000, ×4.4 at 3000. Small DEF values round the early growth away, so it first shows around floor 30. A boss guards the way up at the end of every ten floors: in the Tower it stands on the one tile beside the stairs of each section's last floor (floors 10, 20, …; `isBossFloor` in `src/tower/index.ts`), in place of any other stairs guard, and in the Delve it holds each milestone gate's shaft (every hundred depth, ten equivalent floors). Kills pay XP by strength and equivalent floor, the same in both modes (`xpForKill` in `src/config.ts`): a base of 3 × √(1 + floor / 10) (floor 0 is the first; 3 on floor 1, 6 by floor 31, 10 by floor 101, 30 by floor 1001), times `XP_MULTIPLIER` for the enemy's strength (weak 2, normal 3, strong 5, elite 8, boss 12), rounded. Reaching level L takes 20 × L × (L + 1) × (1 + L / 5) XP in all (`xpForLevel`: 48 for level 1, 1,200 for 5, 6,600 for 10, 42,000 for 20), growing with the cube of the level, faster than the base, so each floor climbed is worth a smaller share of a level than the one before, even though every run replays the floors below. Assuming each run climbs about 1.5 floors past the last and clears every floor below again, the hero reaches about level 7 by floor 10, 18 by floor 30, 28 by floor 50, 39 by floor 75 and 49 by floor 100, gaining about one level a floor early on and 0.4 a floor by floor 100.

   Each level earns two training points, spent on the Training tab, open from the start. A rank is bought with points at once, or, once the Trainers skill is owned, by a trainer for Gold over time, on its own schedule per stat that counts only the ranks trainers finished (`save.trainerRanks`), so points never raise it (`trainingGold`: 20 Gold a point of its cost times the trainer's rank number; `trainingSeconds`, divided by 1 + the Faster Trainers speed, and halved while the training boost lasts); a Gem reset returns the points, the Gold, and all the training time spent on the stat into the time bank, which any stat's next trainer ranks use after their own time credit. A training rank (1 point for every row; `TRAINING` in `src/config.ts`) is worth `base × (1 + level / growth)` at the hero's current level (`trainingWorth`): max HP 10 + L, ATK 1 + L/5, DEF 1 + L/12, Shroud 1 + L/10 (once the Shroud skill opens it), each stat's ranks summed with their fractions kept (`trained`; the hero's stats keep fractions everywhere and show rounded down). Levelling up raises every rank already bought, so saving points never pays. Since ATK and DEF cost 1 point a rank like max HP, training alone no longer falls behind by itself: at those levels, an evenly trained hero (points split three ways) with nothing else beats a normal balanced Tower enemy for almost nothing on floors 10 to 60, 3% of its HP on floor 75 (8% in the Delve, 11% against a strong Tower enemy), and still wins on floor 100 (16%, and 54% in the Delve). TODO: rebalance the curves so research, gear and upgrades are needed from the mid-game on. Putting every point into one stat is worse: DEF or HP alone leaves the hero's ATK below enemy DEF by about floor 40, and ATK alone leaves it too little HP. `tests/loadout.test.ts` checks the floor 10, 50, 75 and 100 cases. Strength also sets the Gold it pays in both modes (`ENEMY_GOLD` in `src/config.ts`: weak 1, normal 1, strong 2, elite 4, boss 5); the Delve's end of a run adds one Gold per treasure opened. Kills also pay Silver, held in the run alone (`run.silver`) and spent on run training: `silverForKill` (`src/config.ts`) pays 1 on equivalent floors 1–10, 1 more every ten floors after, times `SILVER_MULTIPLIER` for the enemy's strength (weak 1, normal 2, strong 3, elite 4, boss 5). Run training sells Training levels for the run alone, starting from the hero's own level: each row's first costs `RUN_TRAINING_PRICES[id].base` Silver (3 for max HP, 5 for ATK and DEF, 10 for the rows a skill opens, such as Shroud, Potion % and the currency rows, 20 for Find Potion and Revive), and the k-th after it costs `step + growth × ⌊(k − 1) / 5⌋ + k` more than the one before (`silverPrice`): max HP +1+k for five ranks, then +3+k, +5+k … (3, 5, 8, 12, 17, 23, 32 …); the base-5 rows +1+k for five ranks, then +4+k, +7+k …; the base-10 rows +2+k, +5+k, +8+k …; the base-20 rows +4+k, +8+k, +12+k …. ATK costs 5, 7, 10, 14, 19, 25, 35 …, 85 for the 11th, about 300 for the 21st and 7,850 for the 100th; prices grow with the square of the rank, so Training points bought with Inspiration stay worth more than Silver past the first few ranks. A row stops at its `max`, or at level 1,000 (`RUN_TRAINING_CAP`). Every enemy carries its `strength`, which the board shows: a dark red rim for normal, a bright red rim and one chevron for strong, bright red inside a gold rim and two chevrons for elite, and the same with three chevrons and a wider glow for a boss.
4. **Careless play can die from the first floor.** `ENEMY_STAT_SCALE` (`src/scaling.ts`) multiplies every enemy's stats in both modes (HP ×2, ATK ×2, DEF ×1), so it is the one knob for overall difficulty. On top of it, the Tower's zone rosters (`TOWER_ZONE_ENEMIES`, one per `TOWER_ZONE_FLOORS` floors) make the first ten floors' enemies Goblin 30 HP / 16 ATK / 1 DEF, Thief 32 / 12 / 2 and Armored Knight 36 / 10 / 3: no one of them, even strong, beats a new hero (100 HP, 12 ATK, 0 DEF) in a single fight (a strong Armored Knight costs the most, 75 HP), so the first floors are lost to a poor route through several fights rather than to one, while the floor 10 boss (a strong Thief with twice its HP and ATK) costs 268 and does beat that hero. The first section has no elites (the furnisher places a strong enemy instead), since an elite is the next zone's roster. Each later zone rises about 50% over the one before, so every zone builds on that baseline; every zone was scaled down from the earlier rosters by the same ratios, by profile (attack-heavy HP ×5/6 and ATK ×8/9, balanced HP ×4/5, defense-heavy HP ×9/13 and DEF ×3/4), so the steps between zones are unchanged. The Delve's enemies come from `DELVE_ENEMY_BASE` (`delveEnemyBase` in `src/delve/labyrinth.ts`): the Tower's first balanced enemy (32 HP / 12 ATK / 2 DEF in play) with every stat ×1.0414 for each equivalent floor (ten depth), so ×1.5 every ten floors like the Tower's zones and ×58 every hundred where the Tower's cycle is ×60, keeping the two modes on one curve. A Delve area (ten equivalent floors) also holds about as many enemies as ten Tower floors, about 64 (the milestone gate's boss, pocket and fork costs, and the corridor guards of `placeGuards`), with about the Tower's potions and shards (the guards' rewards). An ATK or DEF shard raises its stat by 1 in the first tower and 2.75 times as much in each tower after (`tierShard` in `src/tiers.ts`: 2.75, 7.5625, …), against the enemies' ×3 a tower, so shards fall slowly behind the stats they answer.
5. **Do not balance only for first reach.** The curve must also leave room for research/equipment to convert previously difficult areas into content to clear and master.
6. **Persistent power should matter more than temporary floor pickups at checkpoint milestones.** See the checkpoint section below.

### Difficulty data should be centralized

Avoid separate hard-coded Tower and Delve enemy formulas scattered through generation code.

The eventual implementation should have a central function or data source conceptually similar to:

```ts
powerBudget(E, encounterType)
```

Both modes should request their enemy stats from that shared progression budget.

Exact HP/Attack/Defense formulas should be finalized only after the equipment and research power curves are modeled together.

---

## 7. Equipment and progression gates

Equipment should participate in the same progression curve rather than existing as an independent loot system.

Three different gates can be used, each for a different purpose:

### A. Material-access gate

Higher metals/gems begin appearing only after reaching their progression band.

This is already defined in `CRAFTING_AND_EQUIPMENT.md` using equivalent Tower floor / Delve depth.

### B. Recipe/research gate

The player may be required to purchase an Inspiration research node before crafting a newly discovered equipment tier or advanced equipment feature.

This makes Tower progression relevant to crafting even if the player obtains materials in Delve.

### C. Character-level equip gate

Particularly powerful equipment may require a minimum character level to equip.

Character-level requirements should prevent extreme low-level power spikes without requiring the player to re-buy the recipe.

### Recommended responsibility split

Use the gates consistently:

- **Tower/Delve progression** determines when materials can start dropping.
- **Inspiration research** determines whether the player knows how to craft/use advanced crafting systems.
- **Character level** can limit equipping exceptionally high-tier items.

Avoid making every item require all three gates unless there is a clear balancing reason; excessive stacked gates make earned loot feel unusable.

### Initial equipment-tier alignment

The crafting document currently uses these progression bands:

| Equipment material | Tower availability | Delve availability | Intended progression role |
|---|---:|---:|---|
| Iron | 0 | 0 | Starting tier |
| Steel | 15 | 150 | Early persistent-power jump |
| Silversteel | 30 | 300 | Established early/mid progression |
| Embersteel | 50 | 500 | Mid progression |
| Starsteel | 75 | 750 | Advanced progression |
| Voidsteel | 100 | 1000 | High progression |

These thresholds are useful anchors for difficulty tuning. A new equipment tier should make a noticeable band of earlier areas newly clearable or masterable without instantly trivializing the current reach ceiling.

---

## 8. Research timing around equipment tiers

The preferred rhythm is:

1. Player reaches a new progression band.
2. New materials begin to appear at low frequency.
3. Player earns additional Inspiration by continuing to push and/or mastering older floors.
4. Relevant crafting/research nodes become affordable.
5. Player crafts stronger equipment.
6. The new equipment makes a meaningful set of earlier mastery goals achievable.
7. Player returns to the frontier with greater power.

This is preferable to having a new metal tier become available and immediately granting enough material/research to craft a full set on the same floor.

**Target feel:** discovery first, accumulation second, payoff third.

### The Archives

The Archives skill (5 Inspiration, after Larger Hand, on the Delve path: Into the depths follows it) opens the second progression axis: research paid in Gold and real time, running between sessions. Its limits are Gold, the archivists (one at first, up to five, hired for 200, 500, 900 and 1400 Gems) and the clock. The first project is Focus Count (after the Focus skill): nine levels, each +1 Focus use a run; level n takes 8n hours, and costs 500 Gold for level 1 and 500 × (n − 1) more than level n − 1 after it (500, 1000, 2000, 3500, 5500, 8000, 11000, 14500, 18500; 64,500 Gold and 360 hours in all). Undo Count (listed after Focus Count) costs and takes what Focus Count does, each level +1 undo stored, for eight levels (9 undos in all with Rehearsed steps' first): Rehearsed steps (Inspiration) and Echoes of time (5 Courage, one rank, below Pathfinder, leading nowhere) each open four, whichever comes first opening the project. With Echoes of time alone, the undos are research's only. Find Yellow Key, Key Efficiency, Interest %, Max Interest and Mug come from the Courage skills of those names (10 Courage each, down the middle under Focus, where An enduring legacy stood; it is no longer sold, so the Legacy, Wisdom and Renown trees and Defend show only in Dev mode): Find Yellow Key gives each floor climbed for the first time in a run (each new equivalent floor in the Delve) a 0.4% chance a level, for 50 levels (20%), to hand the hero a yellow key, the roll fixed per run seed and floor so undo and replays find the same keys; Key Efficiency makes each key a door takes cost 0.5% less a level, for 100 levels (half a key at the end), multiplied with Effective or Dampen, and the door cards plan by that cost; Interest % adds 0.1% a level, for 100 levels (10%), of the Silver held on each floor climbed for the first time in a run, after its Wishing Well Silver and not raised by Silver Bonus, at most 50 Silver a floor; Max Interest raises that limit through 100, 200, 350, 500, 750, 1,000, 1,500, 2,000, 2,750, 3,750, 5,000, 6,500, 8,250, 10,000, 12,500, 15,000, 20,000, 25,000, 35,000 and 50,000 over 20 levels, priced on Focus Count's schedule with its Gold raised 20% compounding a level (500 Gold at level 1, about 3 million at 20, 11.5 million in all; 8 × n hours): at the full limit, and counting Silver as Gold, a level pays its Gold back in about 10 floors at first and 100 to 370 from level 8 on, and reaching the limit takes ten times it in Silver held at the full rate; Mug raises a kill's Gold by 2% a level, for 100 levels (×3), when the hero's first strike wins it, multiplied with Gold / Kill, the tier's bonus and the passes. Find Yellow Key, Key Efficiency, Interest % and Mug follow Potion HP's schedule (Find Yellow Key its first 50 levels). These numbers live in `src/archives.ts` and `tests/archives.test.ts` asserts them. Potion HP (after the Greater Heal skill, 3 Inspiration after Into the depths, so 14 Inspiration down the path; listed first as the easier to reach) raises what every potion restores by 3% a level, for 100 levels (×4 at the top), the Cinder Tonic included and the red potion not; the first four levels draw players in (15 s for 10 Gold, 1 min for 25, 5 min for 50, 10 min for 75), then the formula starts over from level 5 for a smooth seam: the m-th level after the first four takes m/4 hours and costs 100 × m Gold (15 min and 100 Gold at level 5, 24 h and 9,600 Gold at level 100; 465,760 Gold and about 1,164 hours in all). Research counts the moment it completes, even mid-run: a run counts the Focus uses it has spent, not those left, and potions read the research as the hero steps on them.


Recovery (10 Inspiration below Regen Research, which follows Greater Heal, 26 down the path) brings percent potions onto the floors of runs that go inside with it: each of the Tower's potions and the Delve's corridor-guard potions (not the pockets' sized ones) is one with a chance fixed when the run goes inside, 2% at first, each restoring the regular 35 HP plus 1% of max HP, and 0.25% more per rank of Potion % training (1 training point a rank, the same at every level). Before Recovery each is a regular potion, so buying it only adds healing; over time the percent share grows to dominate the flat one, which keeps potions useful as max HP scales in long-term progression.

Find Potion (10 Inspiration below Recovery, 34 down the path) opens Find Potion training: each rank (1 training point, the same at every level) adds 0.25% to that chance, up to 20% at 72 ranks. Each potion has a fixed number of its own, and is a percent potion when that falls under the run's chance, so a higher chance only ever adds percent potions.

Revive (10 Inspiration below Shroud, 34 down the path; formerly a Courage skill that took a fatal fight back) gives every enemy strike that would fell the hero a chance to raise it at full HP instead, 0.5% at first and 0.5% more per rank of Revive training (1 training point a rank, the same at every level), up to 50% at 99 ranks; the fight goes on from the next round. Each strike's roll is a fixed number for its run, floor, tile and strike, so undo cannot reroll it and a higher chance only ever adds revivals. Forecasts and the planners ignore it: nothing should be planned on a 0.5% chance.

Pocket Money (1 Inspiration after Into the depths, beside Greater Heal, 12 down the path) opens Pocket Money research (100 levels, the same Gold and hours as Faster Trainers': the n-th level 250 × n Gold and 1.75 × n hours), listed before Gold / Floor: every run goes inside with 5 Silver more in hand a level (500 at 100), counted when it goes inside, so a level completed mid-run waits for the next run. It spends no other bonus (Silver Bonus doesn't multiply it).

Spare Change (3 Inspiration below Pocket Money, 15 down the path) pays Gold for each floor climbed for the first time in a run (the Tower's stairs up, the Delve's each new ten depth): 3, and 1 more per rank of Gold / Floor training (1 training point a rank, the same at every level; 10 Silver for the first run rank), raised 5% a level by Gold / Floor research (100 levels, the same Gold and hours as Potion HP's, listed after Undo Count) and then by the tower's Gold bonus. A floor pays once a run, gated like a kill's Gold (`lootedTiles`), so undo can't repeat it. It rewards climbing over farming: a run that goes deeper banks more, and by floor 50 the starting 3 Gold a floor matches a normal monster or two per floor.

Below Spare Change stand three skills of 2 Inspiration each (17 down the path), each opening a Utility training row (1 training point a rank, the same at every level; 10 Silver for the first run rank) and Archives research of the same name (100 levels, the same Gold and hours as Gold / Floor's, listed after it in this order):

| Skill | Opens | Training | Research | Applies to |
|---|---|---|---|---|
| Wishing Well | Silver / Floor | 3 Silver, +3 a rank | +5% a level | each floor climbed above the run's highest so far (the Tower), or each new ten depth (the Delve); Silver belongs to the run, so undo takes it back with the climb |
| Wealthy | Silver Bonus | ×1, +1% a rank | +3% a level | all Silver a run finds: kills and Silver / Floor |
| Loot | Gold / Kill | ×1, +3% a rank | +3% a level | each kill's Gold, before the tier's bonus |

Training and research multiply: 30% from each makes ×1.3 × 1.3 = ×1.69 (Gold / Kill at 10 ranks and 10 levels; Silver Bonus needs 30 ranks for its 30%). Silver therefore keeps its fractions, like Gold (`snap`), shown rounded down.

Shroud (10 Inspiration below Regen Research, beside Recovery, 26 down the path) gives the hero a shroud that blocks the first 1 damage of every fight, whole again at each fight's start, and opens Shroud training (1 training point a rank, each worth 1 + L/10 at level L, like the other stats). Because it renews every fight, a point of shroud is worth far more over a run than a point of max HP, so its ranks are worth a tenth of max HP's. The shroud comes off the damage after DEF, so it matters most against enemies DEF has fallen behind; fight forecasts count it.

Key Siphon (5 Inspiration, below Into the depths, between Pocket Money and Greater Heal) begins the tree's middle path, which is to run on down past the money and healing branches. It adds the KEY SIPHON card: when the hand plays it, the hero stands still for a turn and trades Max HP training levels for a yellow key, losing the max HP those levels give at the hero's level (10 + L each) for the rest of the run only, HP falling only as far as the new max. The first use in a run takes 1 level and each later use 1 more (2, 3 …), so n uses take n(n+1)/2 levels. Its levels are the hero's own Max HP ranks and any bought with Silver in the run; without enough left for the next use the card is skipped. Buy Quantity (5 Inspiration, below Key Siphon) shows a quantity choice for Training (x1 at first; its research opens x5, x10, x100 and Max at 1,000, 5,000, 25,000 and 100,000 Gold and 4, 12, 24 and 48 hours, 131,000 Gold and 88 hours in all): one press of a training-points or run-training Silver button buys that many ranks for their summed price, Max as many as what is held pays for. It changes no price, only how many clicks a purchase takes. Below Buy Quantity the middle path goes on with fifteen card skills, each adding a card to the deck, and two that open research, 160 Inspiration in all: Yellow Door (5), Heart Door Resilience (10; Heart Door, 5, to its left), Weak Enemy (10; Base Enemy then Strong Enemy, 10 each, branch to its left, Elite Enemy then Boss Enemy, 10 each, to its right), Chest (10), BK Siphon (10; BK Trader then YK to HP, 10 each, to its left, Red Key then RK Siphon, 10 each, to its right) and Floor Skip Reward (10; Torch, 10, to its left, Steel Door, 10, to its right). Heart Door Resilience opens its research: each of ten levels makes every Heart Door drain 5% less of its toll (half of it at level 10), on Focus Count's curve with a tenth level (23,000 Gold, 80 hours; 87,500 Gold and 440 hours in all). Floor Skip Reward opens its research: when Skip on STAIRS climbs past a Tower floor, that floor pays 10% a level, for eleven levels (up to 110%), of the Gold its battles and chests still held (each enemy's kill Gold with Gold / Kill, each closed treasure chest's average Gold, then the tier's bonus), those enemies and chests then paying no Gold if met later; on Focus Count's curve with two more levels (115,500 Gold and 528 hours in all). STEEL DOOR heads for a Steel Door (any one key opens it) while a key is held. BK Siphon and RK Siphon work like Key Siphon on DEF and ATK training levels (1 + L/12 DEF and 1 + L/5 ATK each), for a blue and a red key, each counting its own uses; BK Trader trades 3 yellow keys for a blue one, and YK to HP a yellow key for 10% of max HP. Regen Research (2 Inspiration, below Greater Heal, above Recovery and Shroud, which now follow it) opens Regen research: +3% to what Regen training gives a step, a level, not compounding, for 100 levels, with Potion HP's Gold and hours (465,760 Gold and about seven weeks in all).

Regen (1 Inspiration, below On the Job, above Heal) opens Regen training in the Defense group: each rank gives 0.1 × (1 + L/12) HP back with every step taken in a run at level L (DEF's growth on a tenth of its base), priced like DEF (1 training point, a trainer's Gold and time like any row, and 5 Silver for the first rank bought in a run, on DEF's schedule). The HP comes after whatever the step did (a fight won, a door, a potion), up to max HP, never to a hero a fight felled, and not in the forest. A Rush turn counts as one step, so the tiles it rushes across after its first regain nothing. Route previews, the inspect panel and Automove count it like any other part of the step.
---

## 9. Tower checkpoints / starting-floor selection

To prevent repeated early floors from becoming busywork, the Tower should unlock permanent start checkpoints.

### Unlock rule

Every 10 Tower floors reached unlocks that floor as a selectable starting checkpoint.

Examples:

- Reach Floor 10 → unlock start at Floor 10.
- Reach Floor 20 → unlock start at Floors 10 or 20.
- Reach Floor 30 → unlock start at Floors 10, 20, or 30.

Floor 0/the Tower entrance is always available.

### Run-start behavior

When beginning a Tower run, the player chooses:

- the Tower entrance / Floor 0; or
- any unlocked 10-floor checkpoint at or below their lifetime highest checkpoint.

Starting at Floor 30 does **not** automatically clear Floors 0–29.

Skipped floors grant no:

- Gold;
- XP;
- enemy materials;
- chest materials;
- Inspiration;
- area rewards (mastered or cleared);
- other per-floor rewards.

A checkpoint is a convenience feature, not an offline-reward or skip-reward mechanic.

### Lower floors remain intentionally replayable

If the player wants to clear or master an earlier area, farm its enemy drops, or gather its chest materials, they can deliberately begin from Floor 0 or a lower checkpoint.

### Checkpoint as run lower bound

For implementation simplicity, the selected checkpoint should normally be treated as the lower bound of that run. If the player wants to revisit floors below it, they start a new run from a lower checkpoint.

### Temporary-power warning

Checkpoint balancing must not assume that the player collected temporary Attack/Defense pickups from every skipped floor.

Once checkpoints matter, the player's ability to survive at a checkpoint should come primarily from:

- persistent research;
- character level;
- equipped crafted gear;
- other persistent systems.

Temporary pickups may still help within a run, but they should not be mandatory prerequisites for using an unlocked checkpoint.

---

## 10. Suggested progression-band targets

This table combines the major systems into a single first-pass balancing map.

| Tower band | Delve band | Main purpose | Persistent-power expectation |
|---|---|---|---|
| 0–9 | 0–99 | Learn combat, first research choices, basic Iron crafting | Reach new floors; begin mastering the very earliest rooms |
| 10–14 | 100–149 | First Tower checkpoint, accumulate Inspiration | Silver becomes realistic across much of the opening Tower |
| 15–29 | 150–299 | Steel progression | Steel/research upgrades make early Gold and broader Silver clears realistic |
| 30–49 | 300–499 | Silversteel progression | Earlier Tower increasingly becomes mastery/farming content |
| 50–74 | 500–749 | Embersteel progression | Mid-Tower Gold becomes a realistic return objective |
| 75–99 | 750–999 | Starsteel progression | Advanced mastery and high-value enhancement crafting |
| 100+ | 1000+ | Voidsteel/high progression | Long-term scaling; tune through simulation rather than fixed handcrafted assumptions |

This is a pacing framework, not a statement that a particular piece of gear automatically defeats a particular floor.

---

## 11. Progression invariants

Future balancing should preserve these rules:

1. **Tower Floor 10 ≈ Delve Depth 100** in underlying difficulty/progression tier.
2. Reaching content happens before fully mastering that same content.
3. Persistent upgrades should convert older difficult content into mastery opportunities.
4. Inspiration needed for mandatory progression must be obtainable before the content it enables.
5. Mastery rewards accelerate progression but should not normally be required to avoid progression deadlock.
6. Higher equipment tiers should create noticeable power spikes without trivializing the current frontier.
7. Checkpoints remove repetition but never award rewards for skipped content.
8. Starting from a checkpoint must be viable using persistent power rather than assuming skipped temporary pickups.
9. Area rewards are judged over one run's climb through the area.
10. Difficulty formulas, equipment power, and research costs must be tuned together rather than independently.

---

## 12. Balance validation / telemetry targets

Before treating exact numbers as final, automated simulations and playtests should track at minimum:

- highest Tower floor reached;
- deepest Delve depth reached;
- character level at each major progression milestone;
- Inspiration earned from reach progression;
- Inspiration earned from areas cleared;
- Inspiration spent and research nodes owned;
- currently equipped metal tier;
- total Attack/Defense/Max HP from equipment;
- clearing and mastery ceilings relative to maximum reached floor;
- death rate by equivalent floor;
- time/runs required to unlock each 10-floor checkpoint;
- time/runs required to craft the first item and full set from each metal tier.

### Warning signs

Rebalance if simulation shows any of the following:

- players routinely master the same area on first reach;
- players can reach far beyond areas they are capable of clearing;
- an upgrade required for progression is unaffordable without clearing the content it is supposed to enable;
- a newly unlocked equipment tier immediately trivializes the current frontier;
- a newly unlocked equipment tier does not noticeably improve mastery of earlier floors;
- checkpoint starts are unusable without farming temporary pickups on lower floors first;
- skipping to checkpoints becomes more rewarding than actually playing lower floors;
- area rewards become mandatory rather than aspirational/accelerative.

---

## 13. Relationship to other design documentation

- `CRAFTING_AND_EQUIPMENT.md` defines materials, chest drops, enemy drops, equipment recipes, and metal/gem unlock bands.
- This document defines **when those bands should matter to player power and difficulty**.
- The research/skill-tree implementation should use this document when setting Inspiration costs and prerequisites.
- Enemy generation/scaling should use this document when converting Tower floor or Delve depth into a shared difficulty budget.

When these systems disagree, the intended progression loop in this document should be resolved first, then loot/research numbers should be retuned around it.
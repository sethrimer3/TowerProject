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

**Mastery progression** is returning to earlier floors and earning their Silver, Gold, and eventually Platinum clear status after persistent upgrades make those challenges realistically achievable.

The intended loop is:

1. Push upward as far as possible.
2. Earn Inspiration from new height.
3. Purchase persistent research upgrades.
4. Find/craft stronger equipment.
5. Return to earlier Tower floors.
6. Earn Silver/Gold/Platinum status on floors that were previously too difficult to master.
7. Use those mastery rewards to accelerate further progression.
8. Push upward again.

**Core design principle:** *first access demonstrates progression; later mastery demonstrates accumulated power.*

A floor should not generally be balanced so that a player is expected to reach it, fully clear it, and earn Gold on the same first visit.

---

## 3. Tower clear tiers

The current game has Silver, Gold, and Platinum clear rewards. The intended long-term meanings are:

### Silver

Clear the floor's required combat/obstacles and complete the floor.

Silver should primarily test **sufficient overall power to fully clear content that could previously be bypassed**.

### Gold

Meet Silver requirements without taking damage on that floor.

Gold should test a substantially stronger build than merely reaching or Silver-clearing the floor.

### Platinum

Meet Gold requirements while also satisfying the floor's additional optimization condition (currently avoiding key expenditure).

Platinum should remain the high-mastery reward and may reasonably lag significantly behind the player's current maximum Tower height.

### Important implementation rule: mastery conditions are floor-local

Damage or resource expenditure on another Tower floor should not invalidate mastery on the floor currently being attempted.

For example, taking damage on Floor 18 must not prevent the player from earning Gold on Floor 19 if Floor 19 itself is completed without damage.

When this progression system is implemented/refactored, mastery tracking should therefore be stored **per floor attempt**, rather than treating damage anywhere in the entire ascent as damage for every later floor.

### No artificial medal lock

Silver/Gold/Platinum should not normally have a rule such as "Gold cannot be earned until Floor 20 is reached."

Instead, enemy difficulty and persistent-power progression should make Gold *practically* unobtainable until the player has acquired enough research/equipment. A sufficiently clever or unusually optimized player may earn a mastery tier somewhat earlier than the expected curve.

---

## 4. Inspiration economy and anti-circularity rule

Inspiration is the Tower's persistent research currency and is the main bridge between reaching new floors and becoming strong enough to master older ones.

### Baseline Inspiration

The current progression model awards approximately **1 Inspiration for each new maximum Tower floor reached**. This provides a predictable guaranteed budget tied directly to progression.

### Mastery Inspiration

First-time Silver/Gold/Platinum rewards may grant additional Inspiration. These are **bonus/acceleration income**, not the baseline progression budget.

### Balance rule

If an upgrade is required to make reaching a future progression milestone realistic, that upgrade must be affordable using rewards obtainable **before** that milestone.

Do not create circular requirements such as:

> Floor 20 requires Upgrade A → Upgrade A requires 22 Inspiration → the only practical way to have 22 Inspiration is to clear Floor 20.

Instead:

- **mandatory progression upgrades** should be affordable primarily from guaranteed reach income and earlier content;
- **mastery rewards** should let strong/efficient players buy upgrades sooner or buy additional optional upgrades;
- Gold/Platinum rewards should not be required for ordinary forward progression unless that dependency is explicitly designed and tested.

### Current Inspiration-tree reference

With the current first-level costs, the direct prerequisite path to unlock Delve is approximately:

- Battle-tested: 4 Inspiration
- Keen instinct: 5 Inspiration
- Iron resolve: 5 Inspiration
- Into the depths: 3 Inspiration
- **Total minimum path: 17 Inspiration**

If the player earned only the guaranteed reach-based Inspiration, this naturally places the current Delve unlock around the high teens in Tower progression. Silver/Gold/Platinum rewards can move that timing earlier.

This is a useful reference point, **not a commitment that 17 is the final desired Delve-unlock cost**.

---

## 5. Intended mastery lag

The player should usually be several progression steps ahead of the floors they can reliably master.

A useful initial tuning target is:

- **Reach ceiling:** current maximum Tower progression.
- **Silver ceiling:** generally several floors behind the reach ceiling.
- **Gold ceiling:** farther behind Silver.
- **Platinum ceiling:** farther behind Gold.

This lag should come from combat math, research, equipment, and player optimization—not from explicit medal locks.

### First-pass balancing targets

These are approximate playtest targets, not hard rules:

| Highest Tower floor reached | Delve-equivalent depth | Rough Silver mastery target | Rough Gold mastery target | Rough Platinum target |
|---:|---:|---:|---:|---:|
| 10 | 100 | Floors 0–5 | Floors 0–2 | Floor 0 or none |
| 20 | 200 | Floors 0–15 | Floors 0–8 | Floors 0–3 |
| 30 | 300 | Floors 0–25 | Floors 0–18 | Floors 0–10 |
| 50 | 500 | Floors 0–45 | Floors 0–35 | Floors 0–25 |
| 75 | 750 | Floors 0–70 | Floors 0–58 | Floors 0–45 |
| 100 | 1000 | Floors 0–95 | Floors 0–83 | Floors 0–70 |

These targets are intentionally broad. Actual mastery will vary based on build quality and player decisions.

The important relationship is:

```text
maximum reached > reliable Silver ceiling > reliable Gold ceiling > reliable Platinum ceiling
```

---

## 6. Difficulty scaling rules

Enemy power in both modes should derive from the shared equivalent-floor value `E` rather than maintaining unrelated Tower and Delve difficulty curves.

### Design requirements

1. **One shared reference curve.** Tower floor `F` and Delve depth `10F` should target approximately the same player power.
2. **Enemy identity may modify the curve.** Tanks, glass cannons, guardians, etc. can redistribute HP/Attack/Defense without changing the overall progression tier.
3. **Bosses/elites may exceed the local budget.** Their multiplier should be explicit and data-driven.
4. **Do not balance only for first reach.** The curve must also leave room for research/equipment to convert previously difficult floors into Silver/Gold mastery content.
5. **Persistent power should matter more than temporary floor pickups at checkpoint milestones.** See the checkpoint section below.

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

These thresholds are useful anchors for difficulty tuning. A new equipment tier should make a noticeable band of earlier floors newly Silver/Gold-capable without instantly trivializing the current reach ceiling.

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
- Silver/Gold/Platinum status;
- other per-floor rewards.

A checkpoint is a convenience feature, not an offline-reward or skip-reward mechanic.

### Lower floors remain intentionally replayable

If the player wants to pursue Silver/Gold/Platinum on an earlier floor, farm its enemy drops, or gather its chest materials, they can deliberately begin from Floor 0 or a lower checkpoint.

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
9. Silver/Gold/Platinum conditions should be evaluated per floor attempt.
10. Difficulty formulas, equipment power, and research costs must be tuned together rather than independently.

---

## 12. Balance validation / telemetry targets

Before treating exact numbers as final, automated simulations and playtests should track at minimum:

- highest Tower floor reached;
- deepest Delve depth reached;
- character level at each major progression milestone;
- Inspiration earned from reach progression;
- Inspiration earned from Silver/Gold/Platinum mastery;
- Inspiration spent and research nodes owned;
- currently equipped metal tier;
- total Attack/Defense/Max HP from equipment;
- Silver/Gold/Platinum ceiling relative to maximum reached floor;
- death rate by equivalent floor;
- time/runs required to unlock each 10-floor checkpoint;
- time/runs required to craft the first item and full set from each metal tier.

### Warning signs

Rebalance if simulation shows any of the following:

- players routinely Gold-clear the same floor on first reach;
- players can reach far beyond floors they are capable of Silver-clearing;
- an upgrade required for progression is unaffordable without clearing the content it is supposed to enable;
- a newly unlocked equipment tier immediately trivializes the current frontier;
- a newly unlocked equipment tier does not noticeably improve mastery of earlier floors;
- checkpoint starts are unusable without farming temporary pickups on lower floors first;
- skipping to checkpoints becomes more rewarding than actually playing lower floors;
- Gold/Platinum rewards become mandatory rather than aspirational/accelerative.

---

## 13. Relationship to other design documentation

- `CRAFTING_AND_EQUIPMENT.md` defines materials, chest drops, enemy drops, equipment recipes, and metal/gem unlock bands.
- This document defines **when those bands should matter to player power and difficulty**.
- The research/skill-tree implementation should use this document when setting Inspiration costs and prerequisites.
- Enemy generation/scaling should use this document when converting Tower floor or Delve depth into a shared difficulty budget.

When these systems disagree, the intended progression loop in this document should be resolved first, then loot/research numbers should be retuned around it.
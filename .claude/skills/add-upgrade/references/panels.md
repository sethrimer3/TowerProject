# The upgrade panels

What each panel's rows look like, how they're priced, how their effect reaches the game, how unlocks between panels work, and what a new row touches. Read the live code too: this describes the mechanisms, and the values move.

Contents: [Skill trees](#skill-trees) · [Archives research](#archives-research) · [Training](#training) · [Defend Armory](#defend-armory) · [Unlocks between panels](#unlocks-between-panels)

---

## Skill trees

The Upgrades page's trees: Inspiration (Tower currency), Courage, Wayfinding, Legacy (Courage), Wisdom (Inspiration), Renown (Courage).

**Row** (`UPGRADES` in `src/config.ts`): `{ id, name, description?, grants?, words?, card?, base, max, currency }`.
- `grants` (e.g. `{ attack: 2 }`, per rank) makes it a stat upgrade: `loadout()` adds it and `upgradeText` writes the description from it, so leave `description` out. `words` renames a stat in that text.
- Otherwise `description` is the player-facing text, and the effect is code that checks `save.upgrades.<id>` (look at how `focus` and `training` are read in `state.ts`, `hud.ts`, `ui/skill-tree-page.ts`, or `revive` through `reviveChance` in `loadout.ts`).
- A card badge is not an upgrade row: it is a `BADGES` entry in `src/badges.ts`, drawn with Gems on the Deck page. One that should join the draw pool only once a skill is owned names it in `unlock`.
- `card` adds a card to the deck (`deckCards` in `cards.ts`); the card itself needs a `CARDS` entry and face art.

**Inspiration tree:** its skills are unlocks (`unlocks: true` on the tree): each has `max: 1`, is bought once and shows no rank count (a test holds every node to one rank). More of what one gives comes from another panel, usually Archives research it opens (Rehearsed steps gives the first undo and opens five levels of Undo Count).

**Price:** `cost(id, rank) = ceil(base × 1.65^rank)`, the same curve for every node, paid in `currency`. Existing bases run from 1 (roots) to about 12 (deep one-offs). Total for all ranks = Σ over rank 0…max−1.

**Node** (`TREES` in `src/skill-trees.ts`): `{ id, icon, x, y, requires }`.
- `x`, `y` are percentages of one view (0–100). Roots sit near the top (y ≈ 10–20), each tier about 18 lower. Keep nodes about 20+ apart horizontally on a shared row and 15+ apart vertically so their labels don't collide; check the neighbours' positions. A tree that needs more room gets a `height` (in the same units, e.g. 136) and scrolls; nodes may then sit below y = 100. Leave about 12 below the lowest node.
- A skill that only matters once another is owned (one that opens Archives research, say) goes below that one in the tree, even when that takes more height.
- `requires` lists `UpgradeId`s that must each have a rank; they may be in another tree (`auto` requires `delve`).
- A tree's `gate` hides the whole tree until that upgrade is owned. `gate: null` means nothing opens it yet: only Dev mode shows it, and its skills can't be bought (`treeOpen`).
- `icon` is the glyph in `TREES`; the sprite shown comes from `skillSprite` in `src/ui/dom.ts` (`SKILL_UI_SPRITES`, `SKILL_ITEM_SPRITES`, or `SKILL_CARDS` for card skills; default is the upgrades sprite). Add a mapping when a fitting sprite exists.

**Buying:** `Game.buy` checks `skillAvailable` (gate + requires), `max` and the balance. No other code is needed to make a node buyable.

**Touches:** `config.ts` (row), `skill-trees.ts` (node), `ui/dom.ts` (sprite, optional), wherever the effect is read. Tests: `tests/skill-trees.test.ts` (it asserts the tree list and currencies), plus a test of the effect in its area's file. Docs: `docs/PROGRESSION_AND_DIFFICULTY.md` lists the Inspiration path's costs. Goldens: `save-decode` (the saved `upgrades` record gains a key), `ui.golden.json` (the tree).

---

## Archives research

Research that lasts, paid in Gold and real (wall-clock) time, run by archivists. Unlocked by the `archives` skill.

**Row** (`RESEARCH` in `src/archives.ts`, listed in this order within its category's group on the page): `{ name, description, categories, requires, levels }`.
- `categories`: keys of `RESEARCH_CATEGORIES` (qualityOfLife, progression, abilities, offense, defense, economy, equipment, special, in the order the library lists its groups), used by the library's filters and headings: a project is listed under its first category.
- `requires`: any of `{ upgrade: UpgradeId }`, `{ anyUpgrade: UpgradeId[] }` (one of them owned), `{ research: id, level }`, `{ playerLevel: n }`.
- `levelsPer` (optional): `{ upgrades, levels }` opens only `levels` of the project for each of `upgrades` owned (Undo Count: five each for Rehearsed steps and Echoes of time); `maxLevel` reads it. The library lists a project only once these are met (Dev mode lists all).
- `levels`: one `{ gold, hours, effect }` per level; the max level is the array's length. Write them as a small formula with a comment, like `countLevels` (Focus Count's and Undo Count's: 500 × (1 + n(n+1)/2) Gold, 8 × n hours).
- `effect`: `{ target, op: "add" | "multiply" | "set", value }`. Adds sum, then multipliers apply, a `set` overrides.

**Effect in code:** a target in `RESEARCH_TARGETS` (with its `text` for the page) and one place that reads it with `researched(save.archives, target, base)`, e.g. `Game.focusPerRun`, or `Game.stepRules` for what changes a step's outcome (`potionHeal`). A new kind of effect = one target + that one read. A target that changes step outcomes goes in `StepRules` (`step-effects.ts`), which `resolveStep` takes and every caller passes on: `Game.move`, `previewRouteEffects`, the inspect box (`tile-info.ts`) and Delve Automove (`DelveMind.rules`). Read it when it's used rather than copying it into the run, so it applies the moment a level completes and undo can't roll it back. Research speed divides `hours` (`duration`), so quote hours before speed; `hours` may be a fraction (15 seconds is `15 / 3600`).

**Time:** say both per-level hours and the total, and compare with existing projects: players plan around real time.

**Touches:** `archives.ts` (row, maybe target), the reading site, `tests/archives.test.ts`. Docs: the Archives section in `docs/PROGRESSION_AND_DIFFICULTY.md` if it lists projects; `CONTEXT.md` for new terms. Goldens: `ui.golden.json` if the UI suite opens the Archives. The save keeps `levels` as a partial record, so `save-decode` normally doesn't change.

---

## Training

Hero stats bought with training points (`TRAINING_PER_LEVEL` per hero level) at once, or by a trainer for Gold over time once the Trainers skill is owned (`trainingGold` and `trainingMs` in `training-jobs.ts`, by the ranks trainers finished, `save.trainerRanks`), on the Upgrades page's Training tab, open from the start.

**Row** (`TRAINING` in `src/config.ts`): `{ id, name, group, stat, base, growth, cost, requires?, max?, description }`. `description` is what the run's training card says it does. A stat row's rank is worth `base × (1 + level / growth)` of `stat` at the hero's current level, ranks already bought included (`trainingWorth`, `trained`). `cost` is points per rank. `stat` must be one of the loadout's stats (`Stat` in `loadout.ts`). `group` is a key of `TRAINING_GROUPS` (Offense, Defense, Utility), under which the tab, and the run's training bar, list it. A new stat (like `shroud`) is added to `Stat` and `Loadout` in `loadout.ts`, carried on the run's hero (`Player`, set in `newRun` and shifted by `changeLoadout`) and read where it acts (the shroud in `combat.ts`). A row without `stat` (Potion %, Find Potion, Revive, Gold / Floor, Silver / Floor, Silver Bonus, Gold / Kill) raises something else: give it its own branch in `trainingStep` (its `unit`, now and next) and read its ranks where it's used (Potion % through `potionPercent` and `game.stepRules`, Find Potion through `percentPotionChance`, fixed on the run as it goes inside, Gold / Floor through `floorGold` when a floor pays). A multiplier row (Silver Bonus, Gold / Kill) returns unit `×`, which `trainingText` shows as ×1.30, its `worth` the percent a rank adds. `max` caps the ranks: `game.training.train` refuses past it, the tab shows the row as Max, and the save decoder drops a count above it. A run still in the forest takes every purchase at once (`readyForestRuns` in `game/hero-sync.ts`), so nothing extra is needed for that.

**Balance:** training alone is meant to fall behind enemy growth in the mid game (research and gear have to make up the rest). `tests/loadout.test.ts` models an evenly spread hero winning at floors 10 and 50 and losing at 75; a new row must keep that true, or the model and docs change with it.

**Unlocks:** a row with `requires: <UpgradeId>` is hidden, and `game.training.train` refuses it, until that upgrade is owned (`trainingOpen`).

**Run training:** every row is also sold for Silver inside a run (`run-training.ts`). Give it a price schedule in `RUN_TRAINING_PRICES` (`config.ts`: `cheap`, base 5 and +1+N, +4+N … every five ranks, for a row open from the start; `opened`, base 10 and +2+N, +5+N …, for one a skill opens; `deep`, base 20 and +4+N, +8+N …, for one a deeper skill opens; a dearer row gets its own `{ base, step, growth }`). A stat row then works with nothing more; a row without `stat` needs its run ranks read where it acts (through `ranksInRun`, as `game.trainingNow` does for Potion % and Revive, and `trainInRun` for Find Potion), and its value in `runTrainingValue`.

**Reset:** every row gets a reset button for free: `game.training.reset` spends `TRAINING_RESET_GEMS` Gems (`gems.ts`) to set its ranks to 0 and returns what its ranks were paid with (`save.trainingPaid`: points, Gold, and trainers' time into the shared time bank, `save.trainingBank`), so a new row needs nothing for it.

**Auto-continue:** every row also gets an auto-continue box for free (`save.trainingAuto`): when its trainer finishes a rank, `game.training.settle` starts the next if the Gold is there, so a new row needs nothing for it.

**Touches:** `config.ts`, `tests/loadout.test.ts`, `docs/PROGRESSION_AND_DIFFICULTY.md` (training paragraph), `README.md` (the Training tab paragraph), `CONTEXT.md` (Training point), `ui.golden.json` (Training tab), `save-decode` (the `training` record).

---

## Defend Armory

Defend's upgrades, bought with Gold and metal bars on the Defend page, shown grouped by `group` in the order the groups first appear.

**Row** (`UPGRADES` in `src/defend/catalog.ts`): `{ id, group, name, maxLevel, describe(level), price? }`. Also add the id to the `UpgradeId` union there.
- `describe(level)` writes the current effect from the same function the sim uses (`trainSeconds(l)`, `archerDamage(l)`, …), so the number lives in one place.
- Price: `upgradePrice(level)` = 200 × 1.6^level Gold, 2 + 2·level iron bars, level − 2 steel bars from level 3; or a fixed `price` for a one-off (like Hunter's instinct).

**Effect in code:** a function in `catalog.ts` taking the level, read by the unit or structure module that needs it (`troops.ts`, `towers.ts`, `civilians.ts`, `sim.ts`) through `save.defend.levels.<id>` or the level the sim was given.

**Unlocks:** the whole Armory is behind the `legacy` skill; individual rows have no requirements. Gating one needs new code.

Keep Defend changes inside `src/defend/` (it may be split out later).

**Touches:** `defend/catalog.ts`, the reading module, `tests/defend*.test.ts`, `docs/DEFEND.md`. Goldens: `defend-replay` if the sim's default levels or behaviour change, `defend-fences-save` (its decode corpus includes `levels`), `defend-pointer` if the Armory layout moves.

---

## Unlocks between panels

What works today without new mechanism code:

| Owning… | can unlock… | via |
|---|---|---|
| a skill | another skill (any tree) | the node's `requires` |
| a skill | a whole tree | the tree's `gate` |
| a skill | a research project | `requires: [{ upgrade }]` (or `anyUpgrade`) |
| a skill | more levels of a research project | the project's `levelsPer` |
| a skill | a tab or page | the checks in `main.ts` `navigate`, `ui/hud.ts` `renderLockedTab`, `skill-tree-page.ts` (Archives tab) |
| a skill | a Settings row | the map in `ui/settings-page.ts` |
| a skill | a deck card | the row's `card` |
| a skill | a Training row | the row's `requires` |
| a skill | the Defend Armory | `legacy` only |
| research level | another project | `requires: [{ research, level }]` |
| hero level | a research project | `requires: [{ playerLevel }]` |

Needs new code (flag it in the spec as a mechanism change, not just a row):
- a skill node requiring research or a hero level (`skillAvailable` only reads `save.upgrades`),
- gating an individual Armory upgrade,
- research unlocking a tab, card or setting.

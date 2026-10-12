# Shrines

Shrines and their boons (`src/shrines.ts`, `src/game/shrine-desk.ts`), their research, and their UI.

**What they are.**
Once the Archives' Unlock Shrines is researched (opened by Tower II's floor 150 Goal), a Tower run earns a **boon** every so many floors and the player picks each from an **offer**.
A boon lasts the rest of the run.
The Delve has none: `ShrineDesk.open`, `Game.boons` and `RunPurse.boons` all test the mode.

**The schedule** (`boonsEarned`, `nextBoonFloor`, `floorsFor`).
The boons a run has earned are worked out from its highest floor reached (by number, `maxHeight + 1`) and its picks, never counted as it climbs, so undo can't earn one twice.
Boon k is earned on the floor that is the sum of the first k intervals; each interval is `floor((base − Floors Required research) × (10,000 − floorReq) / 10,000)`, at least 1, where `base` is 200 for boons 1–20, 250 to 30, 300 to 40, then 350 (`baseFloors`), and `floorReq` is the Boon Floor Requirement boons' total in hundredths of a percent (whole numbers, so the schedule is exact).
The schedule is recomputed every time, so a Boon Floor Requirement boon can earn several boons at once.
Unspent = earned − picked (`ShrineDesk.unspent`).

**Boons** (`BOONS`): standard boons (several copies each) and trade-offs (one copy each).
A standard boon's total with n copies is `(1 + value × n) × (1 + SBB/100)` for a multiplier, `value × n × (1 + SBB/100)` for an addition, nothing with no copy (`standardTotal`; SBB is Standard Boon Bonus research).
A trade-off's benefit is scaled by `t = 1 + Improve Trade-off Boons%` (`1 + 0.5t` for ×1.50 ATK, `1 − 0.5t` for −50% enemy HP), its cost never; Fast Enemies Strike Second is `fixed`.
`boonEffects(picked, owner)` folds them into one `BoonEffects`.
Spell boons, Bounce Shot, Orbs, Unlock a Random Spell and the ranged enemies' trade-off wait for what they act on.

**Where effects apply.**
- Hero stats (ATK, max HP, shroud, Regen, Lifesteal, Parry %) are stored in the run, so `ShrineDesk.sync` rescales them from the factors the run last applied (`run.shrine.applied`) to the factors its boons give now (`rescaleHero`; HP keeps its share of max HP).
  Parry % is the hero's own times its factor (the Lifesteal trade-off's 0.3) plus the Parry % boon's `parryBonus`, up to `PARRY_CAP`.
  It runs on every pick and whenever research completes (`DeskHost.researchDone`, called by `ResearchDesk.settle`).
  Anything the hero gains or loses mid-run is multiplied by the same factor (`boonFactor`): training and gear shifts (`hero-sync.ts`), run training and siphons, the Max HP badge, and ATK shards (`Game.stepRules.shardAttack`).
- Enemies: `RoomWorld.foes` (from `run.shrine.applied.foes`) passes every tile, changes included (a Greater Boss is summoned into `run.changes`), through `foeTile`: HP and ATK scaled, boss HP on top, a boss striking first (`fast`), and a Fast enemy striking second (`fast` dropped) with ATK ×2.5.
  `Game.boonsChanged` sets it on the board and drops the hand's plan.
- Economy: `RunPurse` (Gold banked, Silver found, kill Silver, Silver / Floor, Interest's rate); the Gold bonus breakdown's Shrine Boons line (`goldBonuses`' `shrine`, `Game.shrineGold`); Free Up Chance (`rollFreeTraining`'s `boonChance`); Max Play Speed (`Game.maxSpeed`, scaled by SBB, so it may be fractional).

**Undo.**
A pick (and the offer's draws) is copied into every undo snapshot of the run and a fall's (`ShrineDesk.share`), and `sync` rescales each, as Training bought mid-run is: undo takes back steps, never a boon.

**Offers** (`rollOffer`).
Each slot is a trade-off 15 times in 80 (the standard boons' 65 against them; Spell boons' 20 waits for spells), drawn from boons with copies left, not banned and not already offered; a kind with none left gives way to the other.
The draws come from `drawAt(seed ^ SHRINE_SALT, run.shrine.rolls++)`, so undo and a replay offer the same.
The offer waiting is kept in `run.shrine.offer` until a pick.
Size: 2 plus Boon Option Quantity (`offerSize`).
The run's first offer starts with the First Boon Choice when researched, set and not banned (`firstChoice`).
Auto Pick (`ShrineDesk.autoPick`, on after a pick, a new Tower floor, research completing and turning it on) takes the best ranked boon offered (`ranked`: the ranking less banned ones, cut to Auto Pick Ranking's level), else the top one, so ranking overrides the First Boon Choice.

**Saves.**
`save.shrines` (`ShrinesSave`, `decodeShrines`): Auto Pick on or off, the First Boon Choice, the banned boons (only the first `boonBans` count, `bans`) and the ranking.
`TowerRun.shrine` (`ShrineRun`) is kept whole or dropped (`validShrineRun`), since a part left out would leave the hero scaled by boons it no longer has.

**Research** (`archives.ts`, category `shrines`; each needs Unlock Shrines, and its Goal):
Unlock Shrines (Tower II F150, 1.5M Gold, 4,999 min), Floors Required (−1 floor a level, 100 levels), Standard Boon Bonus (+1% a level, 25 levels, hand-set Gold table), First Boon Choice (Tower II F250), Improve Trade-off Boons (Tower II F400, +1% a level, 10 levels), Auto Pick Boons (Tower IV F50), Boon Option Quantity (Tower IV F80, 2 levels), Ban Boons (Tower V F40, 8 levels), Auto Pick Ranking (Tower VI F10, after Auto Pick Boons, 32 levels).
Their tables are hard-coded (no `Math.pow` at load).
Goals run every ten floors to 100, then every 50 to 400 (`CHECKPOINT_FLOORS`).

**UI.**
The run's limited-use list holds the Shrine button (`#shrine-stat`, lit while boons wait) and the height column a line of floors to the next boon (`#shrine-next`), both from `renderShrine` in `ui/hud.ts`.
The button opens `ui/shrine-dialog.ts`: the offer (again while more wait), or the boons taken in a scrolling table, and the Auto Pick toggle once researched.
The forest's menu has Shrine Boons (`#shrines-button`) once Shrines are researched, opening `ui/shrines-page.ts` (`ShrinesPage`, tab `shrines`): First Boon Choice, bans and the ranking (dragged by its grips or moved by arrows, the rows counted lit, banned ones last in red), each shown once researched; the desk refuses changes inside a run.

**Tests.** `tests/shrines.test.ts`.

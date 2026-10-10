# Missions

Status: **built** (`src/missions/`, `game/mission-desk.ts`, `ui/missions-page.ts`, `tests/missions.test.ts`).
Missions are small tasks the game gives the player, each paying a reward when claimed, and a weekly track of rewards for completing enough of them.

## Daily missions

- **Given:** two every 8 hours, on 8-hour periods from 00:00 GMT (00:00, 08:00, 16:00), the first two at once.
  The clock is the server's GMT time as estimated from the Shop's last confirmed time (`estimatedServerTime`), as the Shop's day is.
  Periods missed while away each give two, up to the room left.
- **Room:** at most **8 incomplete** missions (`MISSION_CAPACITY`).
  A completed mission waiting to be claimed takes no room; no new mission comes while 8 are incomplete.
- **Never expire.** Progress is a running tally across runs, and shows as *X/Y* on a bar until it reaches the target, then *Complete!*.
- **Kinds:** each new mission is drawn evenly among the kinds the player can work on now and has no incomplete mission of.
  The draw continues a saved stream (`save.missions.rng`, seeded once from `stream("missions")`), so reloading can't redraw it.

| Mission | Target | Offered |
|---|---|---|
| Advance 10 floors | 10 | always |
| Defeat 3 bosses | 3 | always (a Greater Boss counts) |
| Train 1 skill | 1 | always |
| Defeat 50 basic enemies | 50 | always (weak and normal) |
| Defeat 30 strong enemies | 30 | once a floor holding them has been reached (`enemyFirstFloor`) |
| Defeat 10 elite enemies | 10 | once a floor holding them has been reached |
| Pick up 20 potions | 20 | always |
| Buy 1 badge | 1 | the Badges skill owned, with copies left to draw |
| Buy 10 run training upgrades | 10 | On the Job owned |
| Pick up 10 blue keys | 10 | once blue keys' first floor has been reached (`keyFirstFloor`) |
| Pick up 5 red keys | 5 | once red keys' first floor has been reached |
| Focus on 2 cards | 2 | the Focus skill owned |

"Reached" means any open tower's record (`best`, the selected tower's or one kept in `tierRecords`) is at or past that tower's first floor for it, or the Delve's equivalent floor in the delve of the same number.
Strong and elite enemies and Buy 1 badge are offered only once possible, so no new player is handed a mission they can't work on.

### What counts

- **Floors:** each floor climbed for the first time in a run (the Tower's run `maxHeight`; the Delve's new equivalent floors), a floor Skip climbs past included.
- **Kills** by strength, **potions** and **blue and red keys** picked up: each tile once (`save.missions.counted`, keyed by mode and the mode's loot key), so undo bringing a tile back never counts it twice.
- **Training:** each rank bought with training points, or finished by a trainer (`TrainingDesk`).
- **Badges:** each badge drawn (`BadgeDesk.draw`).
- **Run training** and **Focus:** what undo can take back counts only past the most the run has had (`save.missions.marks`, by mode and run seed).
- Tournament runs count like any other.

### Reward

Claiming a completed mission removes it and pays (`missionReward`):

- **3 Gems**.
- **Gold** by the highest tower open: 100 / 1,000 / 10,000 / 30,000 / 100,000 / 300,000 / 1,000,000 / 3,000,000 / 10,000,000 (`MISSION_GOLD`).
- **One equipment upgrade material**, the kind drawn when the mission was given, by the highest tower open: 0 / 3 / 5 / 8 / 12 / 15 / 20 / 25 / 30 (`MISSION_MATERIALS`).

## Weekly rewards

Every 5 daily missions **completed** in the week (counted as each reaches its target, claimed or not) opens a reward, up to 35.
The week runs from Monday 00:00 GMT; the tally and rewards claimed start over then, and a reward left unclaimed is gone.
Gold is the daily mission's Gold for the highest tower open, times the multiplier (`WEEKLY_REWARDS`, `weeklyReward`).

| Completed | Gold | Gems | Medals | Ascension Shards |
|---|---|---|---|---|
| 5 | ×3 | 10 | 0 | 0 |
| 10 | ×4 | 15 | 10 | 0 |
| 15 | ×5 | 20 | 15 | 0 |
| 20 | ×7 | 25 | 20 | 0 |
| 25 | ×10 | 30 | 25 | 10 |
| 30 | ×15 | 35 | 30 | 15 |
| 35 | ×20 | 50 | 35 | 20 |

**Medals** (`save.medals`) are a new limited currency, kept between runs; nothing spends them yet.
They show in the forest's purse once held (where it has room), and on the currencies bar.

## Screens

- **Missions button:** a check mark over *X/8*, the incomplete missions out of 8, with a dot while a mission or weekly reward waits to be claimed.
  In the forest it stands in the actions column under Settings; when that column would hold more than three buttons (the Tournament's and Mail's shown too), the hamburger appears in the forest and holds Settings and Mail.
  Inside a run it is in the run's menu, whose hamburger wears its dot.
- **Missions screen** (`ui/missions-page.ts`): an X at the top right returns to the page that opened it.
  Near the top, the weekly bar fills from 0 to 35 with the week's count, a prize box over each multiple of 5: dim until reached, glowing while it can be claimed, checked once claimed; pressing a glowing box claims it.
  Below, how many missions are open and when the next two come, then each mission: what it asks, what it pays, its bar, and once complete a Claim button.
  What a claim pays rises to the middle of the screen (`revealReward`).

## Future

- More mission kinds, some asking for a card and badge arrangement.
- Ways to spend Medals.
- Missions are kept on the device; like the Tournament's prizes they could move to the server.

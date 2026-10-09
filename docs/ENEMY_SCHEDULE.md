# Enemy schedule

How many enemies a Tower floor holds and how strong they are, by tower and floor. It is the counterpart of the door and key schedule (`docs/DOOR_AND_KEY_SCHEDULE.md`): one steady ramp, every floor a little harder than the one below and every tower harder than the one before.

Enemy stats are already scheduled: the enemy curves (`src/enemy-curves.ts`) give each strength and profile its HP, ATK and DEF on every floor, and the tier multiplies them. This schedule decides only who stands on a floor: how many enemies, which strengths, and which profiles.

The Delve follows the same schedule by equivalent floor, each delve following the tower of its number.

Notation: `t` is the tower number (1–9), `f` the floor counted from 1, and `⌊x⌋` rounds down. The code counts floors from 0 (`depth = f − 1`).

## 1. Where things stand

Before the schedule, no single number decided the enemies. Strengths came from many tables: the main and stairs gate tables, patterns' guards and rings, forks, the furnisher's niches, and the Delve's corridor guards (a fixed mix, `guardStrengths`, now gone). The only floor rule was `STRENGTH_FROM_FLOOR`: no strong enemy below floor 11 and no elite below 41, the same in every tower.

The census (section 5) showed the result was flat. From floor 1 to floor 1,200, in every tower, a Tower floor holds about 9.5 enemies: about 33% weak, 40% normal, 25% strong and 3–4% elite, plus a boss on every tenth floor. A Delve area holds about 6.3 enemies per equivalent floor in much the same mix. Floors get harder only through the stat curves and the tier's ×3.

## 2. The schedules

All the numbers live in `src/enemy-schedule.ts` (`ENEMY_SCHEDULE`), as whole percents, one function per schedule, so every engine rolls the same and a change is a one-line edit.

**First floors.** These come earlier each tower. Tower I keeps today's floors, so its early-floor promise holds: no enemy on floors 1 to 10 but the boss beats a new hero in one fight. `STRENGTH_FROM_FLOOR` reads Tower I's values from here.

| Strength | First floor (`enemyFirstFloor`) | Tower I | Tower V | Tower IX |
|---|---|---|---|---|
| Weak, normal | 1 | 1 | 1 | 1 |
| Strong | `11 − (t−1)` | 11 | 7 | 3 |
| Elite | `41 − 4(t−1)` | 41 | 25 | 9 |

**Strength mix.** Each strength's share of a floor's enemies, bosses left out (`enemyShare`). Normal enemies take what is left, never less than 35%.

| Strength | Share |
|---|---|
| Weak | `40 − 3(t−1) − 4·⌊(f−1)/100⌋`, never below 0 |
| Strong | From its first floor: `20 + 2·⌊(f − first)/100⌋`, up to 45 |
| Elite | From its first floor: `3 + ⌊(f − first)/50⌋`, up to 20 |
| Normal | `100 −` the others |

Weak enemies are gone from floor 1,001 in Tower I (floor 401 in Tower IX). In Tower I, strong enemies reach 45% on floor 1,311 and elites 20% on floor 891.

**Count.** A floor's enemies in percent of what its generation places, the **baseline** (`enemyCountPercent`): `100 + ⌊f/30⌋`, up to 300. That is one point every 30 floors, three times the baseline from floor 6,000, the same in every tower. The baseline is whatever the floor's patterns, gates and rooms place: about 9.5 a Tower floor and 6.3 a Delve equivalent floor, as measured in section 1.

Example values (weak / normal / strong / elite, then the count):

| | Floor 1 | Floor 101 | Floor 501 | Floor 1000 | Floor 3000 | Floor 6000 |
|---|---|---|---|---|---|---|
| Tower I | 40 / 60 / 0 / 0, 100% | 36 / 40 / 20 / 4, 103% | 20 / 40 / 28 / 12, 116% | 4 / 38 / 38 / 20, 133% | 0 / 35 / 45 / 20, 200% | 0 / 35 / 45 / 20, 300% |
| Tower V | 28 / 72 / 0 / 0, 100% | 24 / 52 / 20 / 4, 103% | 8 / 52 / 28 / 12, 116% | 0 / 42 / 38 / 20, 133% | 0 / 35 / 45 / 20, 200% | 0 / 35 / 45 / 20, 300% |
| Tower IX | 16 / 84 / 0 / 0, 100% | 12 / 64 / 20 / 4, 103% | 0 / 60 / 28 / 12, 116% | 0 / 42 / 38 / 20, 133% | 0 / 35 / 45 / 20, 200% | 0 / 35 / 45 / 20, 300% |

Strong and elite shares grow by floors since their first floor, so later towers trade their weak enemies for normal ones on the same floor, and meet strong and elite enemies sooner.

**Profiles.** Every strength may wear every profile (attack-heavy, balanced, defense-heavy; bosses stay balanced). Each profile's share of a floor's enemies, whatever their strength (`profileShare`):

| Profile | Share |
|---|---|
| Balanced | `60 − 3(t−1) − 2·⌊(f−1)/100⌋`, never below 20 |
| Attack-heavy | Half the rest, rounded down |
| Defense-heavy | The rest |

Floor 1 is 20 / 60 / 20 (attack / balanced / defense) in Tower I and 32 / 36 / 32 in Tower IX. Balanced reaches its floor of 20%, 40 / 20 / 40, on floor 2,001 in Tower I and floor 801 in Tower IX. Lopsided enemies make the hero's balance of ATK and DEF matter more on later floors and towers.

**Rosters.** A profile names a Tower enemy: each ten-floor zone's roster has one enemy per profile (`TOWER_ZONE_ENEMIES`), repeating every hundred floors. Tower `t` starts the cycle `t − 1` zones along (`towerZoneIndex`), so Tower II opens with Bat, Slime and Stone Warden, and each tower's first floors meet other enemies. The Delve's names stay by population.

These rules stay as they are:
- Bosses (each section's last floor, the Delve's milestone shafts) and Greater Bosses stand where their floors put them, outside the shares and the count.
- Tower I's potion gates on floors 1–10 stay, and floor 1's way to the stairs stays open.
- Stats come from the enemy curves. A shifted mix makes floors harder on top of them, on purpose. If the player's powers fall short, the curves are lowered, not the schedule.

## 3. The enemy stage

The last step of a Tower floor's generation (`src/tower/enemy-stage.ts`, `placeEnemies`), after embedding and the boss, before the rare unguarded loot. It draws from its own random stream, seeded from the floor's, so nothing before it draws differently. It doesn't replace the tables: they keep asking for "weak" or "strong" as relative roles, so a key room's guard is still among the weakest enemies on its floor. The rules shared with the Delve live in `src/enemy-stage.ts`.

1. **Count.** The floor's **baseline** is the enemies it holds outside fork lanes and bosses. The stage adds `baseline × (count − 100%)` more, the fraction placed at its chance (`extraEnemies`). Extras stand where the floor's own enemies do, not out of the way: on any plain floor tile, drawn at random, so on and around the main paths and in the rooms. Never on the way in, the tile just inside, the tile beside the stairs (the stairs guard's or the boss's) or a fork's lane. Where no tile is left, the enemy is owed. The graph records what the stage found, added and owed as `enemyCount`.
2. **Re-rank.** Take the floor's enemies, extras among them, in order of the strength they asked for (an extra asks for one drawn from the shares, `drawStrength`), ties broken by a random key drawn for each first (never inside a sort). Deal the shares' strengths out from weakest to strongest (`rankStrengths`): the enemy at rank `i` of `n` takes the strength whose share covers `(i + offset)/n` of the floor, one offset drawn per floor. Each strength's count is then within one of its share and right on average. The profiles are dealt the same way over the same enemies, in a random order (`dealProfiles`), so each profile's count is within one of its share, whatever the strengths. Every enemy is then made anew for the floor at its strength and profile (`enemyTile`).
3. **Left alone:** bosses and Greater Bosses, and the enemies in fork lanes. Forks are priced so no lane is cheaper in every way, and re-ranking one lane's enemy would break that. A lane's enemy wears the profile its fork names, or one drawn evenly. Their enemies (about 1.5 a floor, mostly weak and normal) stay outside the shares, so the census's found shares sit a point or two off the wanted ones.

Strong and elite enemies stand only from each tower's own first floors (`strengthOnFloor` reads `enemyFirstFloor` for the floor's tower), which also holds for fork lanes and the tables' asks. Floors 1–29 add no extras, so the first floors' rules (floor 1's open way, floors 2–5's keys) hold.

The More Enemies badge adds its percent of the floor's generated enemies, the extras among them.

**The Delve** runs the same stage as its area's last (`placeEnemies` in `src/delve/labyrinth.ts`), after the door, wood and key stages, on its own stream, so none of them draws differently. Each of the area's ten equivalent floors, by tile depth, counts its own baseline and extras and is dealt its own shares from the tower of the delve's number. Extras never stand on the way in or beside it, within two tiles of the milestone gate or its boss, or in a fork's lane. Corridor guards now ask for "normal" (pockets' gates still ask their own strengths), so the ranking alone decides theirs. An enemy whose strength holds keeps its population (its name) and takes its dealt profile's stats; one whose strength changes is made anew (`gateTile`). The region records the area's sums as `enemyCount`. `gateTile` passes the tier to `strengthOnFloor`, so fork lanes and the tables' asks wait for each delve's own first floors too.

## 4. What pays for it

- **Loot follows the enemies.** Each kill pays Gold, Silver and XP by its strength and floor, so more and stronger enemies pay more on later floors. That trains more levels in a run (Silver's run training, XP's training points) and buys higher research levels.
- **Player powers to come:** ways to handle crowds, beside what the game already has (Rush, Ignore, Target, Skip, Deprioritize, crits, Revive).
- **The stat curves** are the last resort, lowered if the rest isn't enough.

## 5. Census

The Tower and Delve censuses (`docs/DOOR_AND_KEY_SCHEDULE.md` section 5 for the options) print an **Enemies** table per tower or delve, per floor by band:

| Column | Meaning |
|---|---|
| enemies | Every enemy but bosses: the ones the schedule shares out |
| count want% | The schedule's count, in percent of the baseline |
| weak, normal, strong, elite | Enemies of that strength a floor |
| weak% … elite% | Their share of the enemies |
| weak want% … elite want% | The share the schedule asks for |
| boss | Bosses a floor (0.10: one each tenth floor) |
| weight | The floor's fighting, each enemy priced on the forks' scale (`GATE_VALUE`: weak 0.75, normal 1.5, strong 2.5, elite 4, boss 6) |
| atk%, bal%, def% | The shared-out enemies' profiles, fork lanes' among them |
| atk want% … def want% | The profile shares the schedule asks for |

Potions, shards and treasure chests follow in an **Items** table.

Two more columns show the stage's work: *baseline*, the enemies it found (fork lanes and bosses left out), and *dropped*, the extras it found no tile for. Each found share should sit within a point or two of its want (fork lanes' enemies make the gap), and *enemies* should be about *baseline × count want%* plus the fork lanes' enemies.

With the stage, Tower I (`--towers 1 --floors 1-6000 --band 1000 --seeds 3 --stride 41`): no extra is ever dropped, and at floors 5,001–6,000 a floor holds about 21.8 enemies (a baseline of 7.2 at 283%, and the fork lanes'), 1 / 37 / 43 / 19% against 0 / 35 / 45 / 20%, weighing 52 against about 15 today.

With the stage, Delve I and IX (`delve:report -- --census --tiers 1,9 --floors 1-1000 --band 200 --seeds 10`): every found share is within a point of its want but the fork lanes' weak enemies (about 1% in Delve IX), nothing is dropped, and a floor holds about 6.5 enemies at floors 1–200 (a baseline of 6.0) and 6.8 at 801–1,000 (5.0 at 130%; the door stage turns more guards into doors as its quotas rise). At floors 5,001–6,000 of Delve I (`--seeds 6`): 14.5 enemies a floor (a baseline of 4.9 at 291%), 1 / 35 / 45 / 20%, weighing 36, with nothing dropped.

With profiles dealt (`--towers 1,9 --floors 1-1200 --band 400 --seeds 4 --stride 7`), Tower I's floors 801–1,200 hold 31 / 38 / 31% attack / balanced / defense against 30 / 41 / 30%, and Tower IX's 41 / 19 / 40% against 40 / 20 / 40%. Fork lanes' enemies (about 1.5 a floor) draw their profiles evenly, which pulls a Tower's balanced share a few points toward a third. The Delve's are within a point or two (Delve I, floors 1–300: 21 / 58 / 21% against 21 / 58 / 21%).

First measurement, before the stage (`--towers 1,9 --floors 1-1200 --band 200 --seeds 4 --stride 7`):

| Floors | Tower I: enemies, weak% / normal% / strong% / elite%, weight | wanted | Tower IX: found | wanted |
|---|---|---|---|---|
| 1–200 | 9.70, 33 / 42 / 22 / 3, 15.6 | 38 / 39 / 20 / 3 | 9.69, 33 / 40 / 24 / 3 | 14 / 62 / 20 / 4 |
| 601–800 | 9.29, 30 / 41 / 25 / 4, 15.8 | 14 / 37 / 33 / 16 | 9.12, 29 / 42 / 25 / 3 | 0 / 51 / 33 / 16 |
| 1001–1200 | 8.68, 30 / 40 / 26 / 4, 14.9 | 0 / 39 / 41 / 20 | 8.84, 32 / 38 / 26 / 3 | 0 / 39 / 41 / 20 |

## 6. Future work: enemy traits

Abilities an enemy may carry beyond its stats, the enemies' counterpart of blue, red and Heart Doors. They are meant for Tournament leagues and future towers, each with knobs for its chance to appear (or to trigger) by floor, tower area or league. Candidates, each mirroring a power the hero has:

- **Armored:** a shroud that blocks the fight's first damage.
- **Piercing:** ignores a share of the hero's DEF.
- **Swift:** strikes first.
- **Enraged:** its ATK climbs faster than the usual 1% a round.

Each would go through `combat.ts` and `resolveStep`, so previews, the planners, Automove and `crit-forecast.ts` agree with the fight played, and would wear a mark on its art. They are not scheduled yet.

## 7. Build order

1. **Schedule and census** (done): `src/enemy-schedule.ts`, this document, the census's Enemies table. No floor changes.
2. **The enemy stage, Tower** (done): count, then re-rank, and strong and elite first floors by tower. `TOWER_LAYOUT_VERSION` 22.
3. **The enemy stage, Delve** (done), by equivalent floor, replacing `guardStrengths`' fixed mix. `LAYOUT_VERSION` 25.
4. **Profiles** (done): every strength may wear every profile, with scheduled shares, and rosters by tower. `TOWER_LAYOUT_VERSION` 23, `LAYOUT_VERSION` 26.
5. **Traits** (section 6), one at a time.

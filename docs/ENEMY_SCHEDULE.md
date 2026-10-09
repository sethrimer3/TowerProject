# Enemy schedule

How many enemies a Tower floor holds and how strong they are, by tower and floor. It is the counterpart of the door and key schedule (`docs/DOOR_AND_KEY_SCHEDULE.md`): one steady ramp, every floor a little harder than the one below and every tower harder than the one before.

Enemy stats are already scheduled: the enemy curves (`src/enemy-curves.ts`) give each strength and profile its HP, ATK and DEF on every floor, and the tier multiplies them. This schedule decides only who stands on a floor: how many enemies, and which strengths.

The Delve follows the same schedule by equivalent floor, each delve following the tower of its number.

Notation: `t` is the tower number (1–9), `f` the floor counted from 1, and `⌊x⌋` rounds down. The code counts floors from 0 (`depth = f − 1`).

## 1. Where things stand

Today no single number decides the enemies. Strengths come from many tables: the main and stairs gate tables, patterns' guards and rings, forks, the furnisher's niches, and the Delve's corridor guards (`guardStrengths`). The only floor rule is `STRENGTH_FROM_FLOOR`: no strong enemy below floor 11 and no elite below 41, the same in every tower.

The census (section 5) shows the result is flat. From floor 1 to floor 1,200, in every tower, a Tower floor holds about 9.5 enemies: about 33% weak, 40% normal, 25% strong and 3–4% elite, plus a boss on every tenth floor. A Delve area holds about 6.3 enemies per equivalent floor in much the same mix. Floors get harder only through the stat curves and the tier's ×3.

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

These rules stay as they are:
- Bosses (each section's last floor, the Delve's milestone shafts) and Greater Bosses stand where their floors put them, outside the shares and the count.
- Tower I's potion gates on floors 1–10 stay, and floor 1's way to the stairs stays open.
- Stats come from the enemy curves. A shifted mix makes floors harder on top of them, on purpose. If the player's powers fall short, the curves are lowered, not the schedule.

## 3. The enemy stage (phase 2)

A new last step of floor generation, after the furnisher (the Delve's after its corridor guards), on its own random stream so nothing before it draws differently. It doesn't replace the tables: they keep asking for "weak" or "strong" as relative roles, so a key room's guard is still the weakest enemy on its floor.

1. **Count.** Add enemies until the floor holds its count, a fraction left over placed at its chance. Extras stand where the floor's own enemies do, not out of the way: on and around the main paths and in the rooms, on plain floor tiles drawn at random. Never on the way in or the tile just inside, the stairs guard's tile, an item, a torch or the Gem's tile. Where no tile is left, the enemy is owed, recorded beside the floor as the door stage records `dropped`.
2. **Re-rank.** Take the floor's enemies, the extras among them, in order of the strength they asked for (an extra asks for one drawn from the shares), ties broken by a random key drawn for each first (never inside a sort). Roll each strength's count from the floor's shares, a fraction left over placed at its chance, as `owesDoor` does for doors. Hand the strengths out from weakest to strongest. The floor hits the schedule, and every pattern keeps its meaning: a key room's guard is still among the weakest.
3. **Left alone:** bosses and Greater Bosses, the enemies in a fork's lanes (forks are priced so no lane is cheaper in every way; they count 1/k toward the shares, as fork doors count toward the door quota), and the floors 1–10 rules.

The More Enemies badge then adds its percent of the scheduled count.

The Delve runs the same stage per equivalent floor of an area.

The stage changes every floor, so it bumps both layout versions (`TOWER_LAYOUT_VERSION`, the Delve's `LAYOUT_VERSION`) and re-records the generation goldens and every golden that plays on those boards.

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

Potions, shards and treasure chests follow in an **Items** table.

Until phase 2, the found shares stay flat while the wanted ones move. After it, each share should sit on its want, and *enemies* should grow with *count want%*.

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
2. **The enemy stage, Tower:** re-rank, then count, then strong and elite first floors by tower (`strengthOnFloor` reading `enemyFirstFloor` for the floor's tower). A layout version bump.
3. **The enemy stage, Delve,** by equivalent floor, replacing `guardStrengths`' fixed mix. A layout version bump.
4. **Profiles:** every strength may wear every profile, with scheduled shares, and rosters by tower.
5. **Traits** (section 6), one at a time.

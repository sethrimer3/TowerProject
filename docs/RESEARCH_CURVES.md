# Research cost and benefit curves

How to price a long Archives research project (one with 20 or more levels). Short projects (a handful of levels, such as Buy Quantity or Target Count) can be priced by hand.

## The rule

For a project's level n:

| | Grows as | Why |
|---|---|---|
| **Benefit** | linear: the same effect every level (`op: "add"`, one `value`) | Each level reads the same on the page ("+2%"), and totals are easy to reason about. |
| **Time** | quadratic: about C × n² | Time is the scarcer resource. Quadratic growth keeps late levels a long-term goal without stretching them beyond any player's patience. |
| **Gold** | cubic: about C × n³ | Gold income grows as the player climbs. The cubic curve keeps each level a real decision at every stage of the game. |

The coefficient C need not be constant. It may rise slowly (monotonically) across the levels, so late levels cost a little more than the pure power would. Below the 10th level it may also start low, so the first levels are cheap and quick and draw the player in.

Quote `hours` before Research Speed. `duration` divides them by the speed when a level starts, and `price` takes the Research Cost Discount off the Gold, so a definition holds the undiscounted numbers. A late level's quoted time is therefore longer than what a player who has researched Research Speed actually waits. Research Speed's own level 100 is quoted at 100 days but takes about 34 at the 298% speed its first 99 levels give.

## Building one: `curve` in `src/archives.ts`

```ts
curve(first, power, length, end, bend)
```

- `first`: the first levels, set by hand (usually ten), with any quick, cheap start.
- `power`: 3 for Gold, 2 for time.
- `length`: the number of levels.
- `end`: C at the last level. Pick the last level's price or time first, then divide by `length^power`.
- `bend`: how C moves from the last hand-set level's C (`first[k−1] / k^power`) to `end`. C(n) = top − k / (n + bend), which rises fastest just after the hand-set levels and levels off. A small `bend` (about 10) gives a sharp early rise; a large one (100 or more) makes C nearly a straight line. Choose it so the first computed level's step up is a little larger than the last hand-set level's, so the seam doesn't show.

Every computed value is rounded to three significant figures (`neat`). The hand-set levels are kept as given. The schedule uses only `+ − × /` and `intPow` (see the engine-independence rule in AGENTS.md).

Research Speed and Research Cost Discount share one schedule:

```ts
const ARCHIVE_GOLD = curve([40, 83, 211, 522, 1120, 2100, 3580, 5670, 8470, 12120], 3, 100, 20, 12);
const ARCHIVE_MINUTES = curve([1, 9, 23, 44, 73, 112, 162, 225, 301, 391], 2, 100, 14.4, 137);
```

Gold's C rises from 12.1 at level 10 to 20 at 100 (20 million Gold). The minutes' C rises from 3.9 to 14.4 (144,000 minutes, 100 days). In all: about 497 million Gold, and 2,874 days quoted (about 1,154 days for Research Speed itself, each level sped up by those before it).

## Older projects: a linear start with a power term

Projects first priced linearly keep their early levels and add a gentle power term, so no level gets cheaper and the late levels rise well above their old prices:

| Project | Gold | Hours |
|---|---|---|
| Potion HP's schedule (Potion HP, Regen, Pocket Money, Find Yellow Key, Interest %, Mug); m = level − 4, after four hand-set quick levels | 100m + m³ | m/4 + m²/100 |
| Gold / Floor, Silver / Floor, Silver Bonus, Gold / Kill; Key Efficiency | Potion HP's schedule plus q(m)·m², q(m) = Q·B/(m+B): Q 200, B 100; Key Efficiency Q 400, B 50. Levels 1–4 rise by an even ratio to level 5: 10, 25, 55, 130 (Key Efficiency 10, 25, 70, 185) | as Potion HP's |
| Faster Trainers | 250n + 2n³ | 1.75n + n²/20 |
| Refocus | 500(1 + n(n−1)/2) + 8n³ | n²/10 |
| Ignore More, Target More | 500(1 + n(n−1)/2) × 1.05ⁿ⁻¹ or 1.1ⁿ⁻¹ (steeper than cubic, kept as is) | n²/10 |

The five economy multipliers above add a quadratic Gold term whose coefficient *falls* by level, so their early and middle levels (where a linear multiplier pays back fastest) cost several times Potion HP's, and level 100 about twice. Unlike the rule above, their Gold / n³ falls with the level.

The power term takes over from the linear one at about level 10 to 35. The regain projects' time is purely quadratic, so their early levels are quicker than before (6 minutes at level 1); they pass the old 4.25n hours at level 43.

## Checking a new schedule

- Every level costs more Gold and takes longer than the one before.
- Gold / n³ and time / n² don't fall from level 4 on (`tests/archives.test.ts` checks this for the Archives' own two).
- Compare its totals with the existing projects (time especially: players plan around real time).

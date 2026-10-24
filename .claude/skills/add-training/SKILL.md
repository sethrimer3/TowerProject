---
name: add-training
description: Add a new Training row to Tower Delve (a rank the hero buys with training points, a trainer's Gold over time, or a run's Silver). Reads the Training system, writes a spec covering every per-row decision (group, effect, level cap, point cost, trainer Gold and time curves, the run's Silver schedule, unlock, how the effect is read) for approval, then builds it with tests, docs and goldens. Use whenever the user wants a new Training item, row or stat, or to change an existing row's cap or prices.
---

# Add a Training row

A Training row is one entry in `TRAINING` (`src/config.ts`, typed by `TrainingDef`): its value, unit, research and both price curves sit together, and generic code reads them, so a row is added by writing its entry plus the code where its effect acts. One row is bought three ways, each with its own price curve, so a request ("add a Crit training") leaves most of them open. The work goes **read → spec → build**, with the user approving the spec before any code changes. Changing an existing row's cap or prices follows the same steps, with the spec listing only what changes.

## 1. Read the Training system

Read these as they are now; the numbers here are examples of the conventions, and the files win where they differ.

- `src/config.ts`: `TrainingDef` and `TRAINING` (each row's `id`, `name`, `group`, `requires`/`goal`, `cost`, `max`, `breaks`, `description`, its rank `curve` (`TrainingCurve`), a stat row's `stat`, a value row's `base`, `cap`, `scale`, `unit`, `needs` and `off`, its `research`, its Silver schedule `silver` and its trainers' Gold curve `gold`), `TRAINING_GROUPS`, `TRAINING_PER_LEVEL`, `trained`, `trainingWorth`, `amountAt`, `trainedAmount`, the named Silver schedules (`vital`, `cheap`, `opened`, `deep`, and the rows' own), `schedulePrice`, and the named trainer curves (`gentleTrainers`, `mildTrainers`, `firmTrainers`, `steepTrainers`, `critTrainers`).
- `src/progression/training-jobs.ts`: the trainer's Gold (`trainingGold(row, ranks)`: `TRAINING_GOLD_PER_POINT` × `cost` × (ranks + 1) × (1 + ranks / `growth`), rounded up, `growth` from the row's `gold` curve) and time (`trainingSeconds`, shared: 15 s, 1 min, 5 min, 10 min, then ten minutes more a rank, `TRAINING_STEP_SECONDS`).
- `src/progression/loadout.ts`: `Stat`/`Loadout` and `loadout()` (stat rows), `trainingStep`, `rowValue` (the tab's and the run cards' value, with its Silver / Floor, Silver Bonus and Free Upgrade branches), `rowWorth`, `rowResearchFactor`, `trainingText` (one format per `unit`), `critRule`, `trainingMaxed`, `trainingBulk`.
- `src/progression/run-training.ts`: `runTrainingOffer`, `runTrainingValue`, `ranksInRun`, `silverPrice`; `Game.trainingNow` and `Game.trainInRun` in `src/state.ts`.
- Neighbouring rows in the same group: the defaults below are judged against them.
- `docs/PROGRESSION_AND_DIFFICULTY.md` (the training paragraph and the run training prices) for what a hero earns and when.

## 2. Write the spec

Fill this for the row. Mark every value you chose rather than the user with *(proposed)*, with a one-line reason by comparison with a neighbour.

```markdown
### <Name> (`<camelCaseId>`)
- **Group:** Offense | Defense | Utility (a new group adds a `TRAINING_GROUPS` key)
- **What it does:** <the row's `description`, player-facing; the run's training card shows it too>
- **Kind:** stat row (`stat`: <loadout stat, new or existing>, `curve`: n ranks give `per` × n + `square` × n² + `cube` × (n − 1)³ + `fourth` × (n − 1)⁴, super-linear, never on the hero's level) | value row (<flat amount / multiplier ×1.xx / percent>, <constant> a rank)
- **Shown as:** <unit and format on the Training tab and the run card: whole, two decimals, ×, %>; the value at 0, 1, 10 and max ranks
- **Level cap (`max`):** <ranks>, the same on the Training tab and in a run (hero ranks and Silver ranks together)
- **Training points a rank (`cost`):** <points>
- **Trainer Gold curve:** <`gentleTrainers` / `mildTrainers` / `firmTrainers` / `steepTrainers` / its own `{ growth }`> at this `cost`: rank 1, 10, 100, max cost <…>
- **Trainer time curve:** shared `trainingSeconds` | its own: <formula> (needs a per-row schedule, as above)
- **Silver curve in a run:** <`vital` / `cheap` / `opened` / `deep` / its own `{ base, step, growth }`, `{ base, ratio }` or `{ base, ratio, rise }` (each rank `ratio` times the last, the ratio itself rising, `risingPrice`; a trainer curve takes it as `{ start, ratio, rise }`)>: rank 1, 5, 10, 50 cost <…>
- **Unlock (`requires`):** <the skill that shows and sells it, or "open from the start">
- **Read where:** <the function and moment the effect applies (see Build), and whether it counts at once mid-run or from the next run>
- **Interacts with:** <research or equipment that multiplies or adds to the same thing, Dev free purchases, Buy Quantity, anything that should leave it out>
- **Affordable around:** <hero level / floor where points, Gold and Silver reach rank 1 and the cap>
- **Open questions:** <only what you couldn't infer>
```

Below it, list what the build touches (from Build) and ask for approval.

### Choosing defaults

- **Group:** where the effect belongs: hitting harder → Offense; surviving → Defense; currency, loot and potions-found → Utility.
- **Cap:** stat rows 6,000; value rows that pay currency 150; Shroud 1,000; a percent that must stop below a ceiling (Find Potion's 20% chance, Revive's 50%) at the rank that reaches it. Every row has a `max`.
- **Point cost:** 1, like every row so far; raise it only for a rank worth several of a neighbour's.
- **Silver and trainer Gold are two curves, chosen apart.** Pick each from the row's base cost (its first Silver rank, which follows from how deep a skill opens it), never by copying one into the other: Silver is spent inside one run and resets, Gold is banked between runs. Each row has its own `silver` and `gold`, so either can be changed for one row alone.
- **Trainer Gold:** by the row's first Silver rank, the dearer the steeper: 3 Silver (`vital`) → `gentleTrainers` (growth 60), 5 (`cheap`) → `mildTrainers` (40), 10 (`opened`) → `firmTrainers` (20), 20 (`deep`) → `steepTrainers` (10). A row at a new base cost gets its own growth placed between its neighbours' (the test in `tests/training-jobs.test.ts` checks a dearer Silver start never has a softer trainer curve).
- **Trainer time:** the shared `trainingSeconds`, unless the user asks for a row that should be slower than its neighbours.
- **Silver:** `vital` for Max HP-like rows, `cheap` for rows open from the start, `opened` for rows a skill opens, `deep` for rows a deeper skill opens.
- **Unlock:** a row whose effect only exists after a skill (Shroud, Recovery) requires that skill; a new mechanic usually gets its own Inspiration or Courage node through the `add-upgrade` skill, specced alongside.

## 3. Build (after approval)

Work in an isolated worktree, cherry-pick onto `main`, push and clean up, per the user's memory notes.

**The row.** Add it to `TRAINING` in the order the tab should list it within its group. `defaults()` and the decoders in `save/save.ts` build `training`, `trainingPaid`, `trainerRanks` and `trainingCredit` from `TRAINING`, and the decoder clamps ranks to `max`, so saves need nothing else. Reset, auto-continue, Buy Quantity, the Training dot (`trainingWaiting`) and the run's training bar come for free.

**A stat row** needs nothing more when its stat already exists. A new stat goes into `Stat` and `Loadout` in `progression/loadout.ts`, the hero (`Player`, set in `newRun` and shifted by `changeLoadout`), `shownStat` if it isn't shown whole, and the code where it acts (the shroud in `combat.ts`; anything a step does goes through `resolveStep` in `step-effects.ts`, so previews and planners agree).

**A value row** has no stat; its entry says what its ranks are worth:
- `curve` (usually `{ per }`, a flat amount a rank), `base` (its amount at no ranks), `cap` if it must stop below a ceiling, all in whole units of its own (hundredths of a percent, of a tile …), `scale` of them to one shown `unit` (`TrainingUnit`; a new kind of unit adds a case to `trainingText`).
- Its gate: the amount is `off` (default 0; 100 for a ×1 multiplier) until its `needs` upgrade (default its `requires`) is owned, and its ranks count once `requires` is.
- `research`, if a research target multiplies it.
- The Training tab, the run's card and what a rank adds then need nothing more. Read the amount with `trainedAmount(game.trainingNow, id)` where the effect applies (the hero's ranks plus the run's Silver ranks, `ranksInRun`), never `save.training` alone, so ranks bought in the run count.

**Read it when it's used.** Undo and Revive restore copies of the run, so read the value at the moment it applies (as `game.stepRules` does for Potion %), not copied into the run when bought. A value fixed as the run goes inside (Find Potion's `run.percentPotions`) also needs `trainInRun` to update it when a Silver rank is bought mid-run.

**Gold and time curves.** Give the row its `gold` curve (`TrainingDef` requires one, so the build fails without it); `trainingGold` reads it, and a new shape of Gold curve widens `TrainerCurve` and `trainingGold` alone. Every row shares `trainingSeconds`; a row with its own time curve makes `trainingMs` take the row, updating its callers (`trainingPrices` in `progression/loadout.ts`; `start`, `continueAfter` and `toNextRank` in `game/training-desk.ts`). A refund returns what the job recorded as paid, so cancel and reset need no change.

**Silver.** Give the row its `silver` schedule (required by `TrainingDef` too).

**Tests.** Extend `tests/loadout.test.ts` (its value at several ranks; the evenly spread hero still wins at floors 10 and 50 and loses at 75 if it's a combat stat), `tests/run-training.test.ts` (bought with Silver, it counts in the run and stops at `max`) and `tests/training-jobs.test.ts` if it has its own Gold or time curve. Every row is checked to have a positive whole `max`.

**Docs.** `docs/gameplay/training.md` (the Training tab paragraph and the run training caps sentence), `docs/PROGRESSION_AND_DIFFICULTY.md` (training and run training prices), `CONTEXT.md` (the Training point entry lists the rows), `docs/agents/progression.md` (the caps list, and any mechanism added).

**Goldens.** The Training tab shows the row, so `ui.golden.json` changes (record it on the unchanged code first, per `docs/agents/goldens.md`); a new row changes the saved records, so `save-decode` changes. A combat or currency effect can move `step-trace`, `undo-clear-trace`, `tower-automation` and `delve-automove`. Check only the expected keys changed before re-recording, and name them in the commit message.

Run the area's tests, then `CI=1 npm test` and `npm run build`. Finish with a short report: the final spec values, what was verified, and which goldens were re-recorded and why.

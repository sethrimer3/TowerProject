---
name: add-upgrade
description: Define and add a new upgrade the player can unlock in Tower Delve — a skill-tree node (Inspiration, Courage, Wayfinding, Legacy, Wisdom, Renown), an Archives research project, or a Defend Armory upgrade. Writes a spec (panel, name, cost, levels, placement, research hours, what it unlocks elsewhere) for approval, then builds it with tests, docs and goldens. Use this whenever the user wants a new upgrade, skill, perk, research, lab project, unlock, tree node or Armory item, or wants to fill in a placeholder Wisdom/Renown node, even if they only describe the effect ("I want something that gives more Focus").
---

# Add an upgrade

An upgrade here is anything the player buys between runs that lasts: a skill-tree node, an Archives research project, or a Defend Armory upgrade. A Training row has its own skill, `add-training`, which covers its three price curves; when a request here also needs a Training row (a skill that opens one), spec the row with `add-training` alongside. Adding one well means deciding a dozen small things (price curve, rank count, where it sits, what it opens up) that the user usually only half-specifies. So the work has two halves with a checkpoint between them:

1. **Spec.** Turn the request into a filled-in spec, proposing sensible values for everything the user left out, and show it to them.
2. **Build.** Once they approve (or amend) it, implement, test, document and commit.

Don't start editing code before the user has approved the spec. A wrong price or placement is cheap to fix in a table and tedious to fix after goldens are re-recorded.

## 1. Read the current state first

The numbers in this skill are examples of the conventions, not the live values. Before proposing anything, read what the game has now, because neighbouring upgrades are what your defaults should be judged against:

- Skill trees: `UPGRADES` and `cost()` in `src/config.ts`; `TREES` in `src/skill-trees.ts`.
- Archives: `RESEARCH`, `RESEARCH_TARGETS`, `ResearchRequirement` in `src/archives.ts`.
- Defend Armory: `UPGRADES`, `upgradePrice`, `UpgradeDef` in `src/defend/catalog.ts`.
- Income, to judge when something becomes affordable: `docs/PROGRESSION_AND_DIFFICULTY.md` (Inspiration ≈ 1 per new best Tower floor plus 10 per area cleared, slowing past floor 100; Courage ≈ 1 per new best equivalent floor, likewise; Gold from kills, treasure and run ends).

`references/panels.md` has, for each panel, the fields a row takes, how its price works, how its effect reaches the game, how it can unlock or be unlocked by others, and the files, tests and goldens a new row touches. Read the section for each panel the upgrade involves.

## 2. Pick the panel

If the user didn't say, choose by what the upgrade is:

| The upgrade… | Panel |
|---|---|
| unlocks a feature, card, tab, mode or behaviour, or gives a flat per-rank stat bought with a run currency | skill tree (Inspiration if Tower-earned, Courage if Delve-earned) |
| is a long-term number that should take real time and Gold, often many levels (more Focus uses, research speed, bigger multipliers) | Archives research |
| raises a hero stat that should keep pace with levelling | Training: use the `add-training` skill |
| changes the Defend city or battle (troops, towers, walls, civilians) | Defend Armory |

One request can span panels: a skill node that unlocks a research project, or research that needs a skill. That's the "unlocks" part of the spec.

## 3. Write the spec

Fill this template for each upgrade. Mark every value you chose rather than the user with *(proposed)*, and give a one-line reason for the non-obvious ones (usually by comparison with a neighbour: "priced like Rehearsed steps, one step deeper in the tree"). Leave out rows that don't apply to the panel.

```markdown
### <Name> (`<camelCaseId>`)
- **Panel:** Skill tree › <Tree> | Archives › <category> | Defend Armory › <group>
- **What it does:** <one sentence, player-facing, as the row's description will read>
- **Effect in code:** <stat grant / new behaviour read from save.upgrades.<id> / research target <target> (op, value per level) / Defend function it feeds>
- **Scope:** <what it applies to and what it deliberately leaves out (e.g. which potions, crafted items too?), which modes (Tower and Delve alike unless one is named), and when it takes effect: at once, even mid-run, or from the next run>
- **Levels:** <max ranks>
- **Cost:** <formula and currency>, per level: <l1, l2, …> (total <sum>)
- **Time (research only):** <hours per level: …> (total <sum>)
- **Placement:** <tree node x,y and requires / research list position / Armory group and position>
- **Icon:** <tree glyph and sprite>
- **Requires:** <what must be owned first>
- **Unlocks:** <what owning it opens in this or another panel, or "nothing">
- **Affordable around:** <floor / depth / hero level where a typical player has the currency>
- **Open questions:** <only what you genuinely couldn't infer>
```

Then, below the spec(s), list briefly what the build will touch (files, tests, goldens), so the user can see the size of the change, and ask for approval. If there are open questions, ask them here rather than guessing silently.

### Choosing defaults

Aim for the upgrade to sit naturally among its neighbours:

- **Cost.** Skill nodes share one curve, `ceil(base × 1.65^rank)`, so only `base` and `max` are yours to pick; nodes deeper in a tree have a higher `base`. Research lists each level's Gold and hours explicitly; follow the shape of existing projects (each level dearer and longer than the last) and write it as a small formula with a comment, like `focusCountLevels`. Defend uses `upgradePrice(level)` unless the upgrade is a one-off that deserves a fixed `price`.
- **Levels.** One rank for an unlock or a yes/no behaviour; 4–5 for a capability that improves in steps; 10–50 for a flat stat grant players will pour currency into.
- **Balance rule.** An upgrade needed to reach a milestone must be affordable from income earned before that milestone (see the progression doc). Say which floor or level your price corresponds to.
- **Names.** Player-facing names are short and evocative ("Vital ember", "Tempered edge", "Rehearsed steps"); ids are camelCase and describe the function. If the upgrade introduces a new domain term, it goes in `CONTEXT.md`.
- **Quick first levels.** A long research project can open with a few hand-set levels that take seconds or minutes and little Gold, so the player sees it work right away, before the formula takes over. Offer this for any project the player meets early.
- **Research order.** The Archives list projects in `RESEARCH` order; put one that unlocks earlier before those that unlock later.
- **Placeholders.** Wisdom and Renown hold placeholder nodes ("A placeholder … upgrade"). If the new upgrade fits one of those trees, propose replacing a placeholder rather than crowding in a new node, and say so in the spec.

## 4. Build (after approval)

Follow the repo's own rules in `AGENTS.md`; the ones that matter most here:

- Work in an isolated worktree, cherry-pick onto `main`, push, then clean up (see the user's memory notes on worktrees).
- Put the effect where the game already reads that kind of thing (see `references/panels.md`): stat grants through `grants` so `loadout()` and the description pick them up; research through a `RESEARCH_TARGETS` entry and one `researched(...)` call where the number is used; behaviour behind `save.upgrades.<id>` checks.
- **Taking effect at once.** Research completes on the wall clock, often mid-run, and the user usually wants it to count immediately. Undo and Revive restore copies of the run, so a value copied into the run (or the hero) when research completes would be rolled back by an undo. Instead, read the research at the moment it's used (as `game.stepRules` does for potions), or keep in the run only what the player did (Focus uses *spent*, not left) and work the rest out from the research. Pure rule functions like `resolveStep` take what research changed as an argument; pass it from every caller, planners included.
- Saves need no migration code: `defaults()` and the decoders build from the `UPGRADES`/`RESEARCH` tables, and this project is in its prototype phase.
- Add or extend a test for the rule the upgrade adds (it can be bought only when its requirements are met; its effect shows up where it should), in the test file for that area.
- Update docs in the same change: `docs/PROGRESSION_AND_DIFFICULTY.md` when it lists that tree's costs, `CONTEXT.md` for new terms, the topic doc in `docs/agents/` for the area if a module or mechanism changed, the README if the player-facing gameplay description changes.
- Goldens: a new row changes the saved upgrade/research records and the Upgrades page, so expect `save-decode` and `ui.golden.json` to change (record the UI golden on the unchanged code first, per `docs/agents/goldens.md`). Gameplay effects can move `step-trace`, `undo-clear-trace`, `tower-automation`, `delve-automove`; Defend effects move `defend-replay`. Check that only the keys you expect changed before re-recording, and name the re-recorded goldens in the commit message.
- Run the area's tests while iterating, then `CI=1 npm test` and `npm run build` before committing.

Finish with a short report: what was added (the final spec values), what was verified, which goldens were re-recorded and why.

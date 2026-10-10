---
name: add-badge
description: Add a new card badge to Tower Delve (a token drawn for Gems and attached to a hand card, changing what the card does). Reads the badge system, then asks the user the questions the badge's wording leaves open, each with a proposed default, then writes a spec for approval and builds it with tests, docs and goldens. Use whenever the user wants a new badge, or describes a per-card effect by rarity and levels ("COMMON – Effective: +5/10/…%").
---

# Add a card badge

A badge is one row in `BADGES` (`src/badges.ts`) plus whatever its effect needs elsewhere. The user usually describes its effect with an example or two, and that leaves the effect on most cards undefined. So the work goes **read → questions → spec → build**, with the user answering between each stage. Code changes start once the user approves the spec.

## 1. Read the badge system

Read these as they are now. They change often, so trust the files over this list:

- `src/badges.ts`: `BADGES` (rarity, `kind`: `reward` / `gate` / `aim`, glyph, colour, `values` for levels 1–7, `text`, `unit`, `lead`, `unlock`), `RARITY_WEIGHTS`, `COPIES_FOR_LEVEL`, `badgeValue`, `runBadges`, `decodeBadges`.
- `src/cards.ts`: `CARDS` (each card's target), `CardRules` and how `planHand` reads it, `IN_PLACE` cards.
- `src/state.ts`: `cardRules(card)` (planning), `activate(card, key)` (rewards when the card reaches its target), `badgeFloor`, `cooled` / `markUsed` (cooldowns by floor, in `run.badgeFloors`), the skipped-tile marks (`run.skipped`), and `setDevMode` (the Dev grant).
- `src/step-effects.ts` (`resolveStep`, `StepRules`): any badge that changes what a step does to the hero goes here, so previews, the planners and Automove agree.
- `src/ui/badge-token.ts`, `src/ui/deck-page.ts`, `src/ui/hud.ts` (the `unable` greying), and the renderer, if the badge marks tiles.
- `tests/badges.test.ts`: one test per behaviour; copy its style.
- `docs/agents/hand-and-automation.md`: the "Card badges" passage, which you'll update.

The step is done when you can say, for **every** card in `CARDS`, which tile or action the card activates on.

## 2. Ask the questions

Make a **card matrix**: one row per badge, one column per card in `CARDS`, and in each cell what the badge does there, including "nothing". Most questions come out of the cells the user's examples didn't cover. Then probe each item below and ask about every one the request leaves open. Give a proposed default for each, so the user can reply "default" for any of them. Number them, group them by badge, and keep each to two or three lines.

- **Contradictions.** Paired or mirror badges whose wording doesn't mirror (a pasted line left unchanged). Propose the reading that keeps the pair symmetric.
- **Trigger.** Does it fire only when its card activates on its target, on any touch of that card's item type (whichever card led the step), or while planning? This decides whether it lives in `activate`, `resolveStep` or `CardRules`.
- **Odd cards.** STAIRS (Tower stairs vs the Delve's climb, which has no stairs tile), the cards that act in place (`IN_PLACE`: the siphons and key trades, no target tile), TORCH (its target is a torch on a floor tile, nothing to vanish), and any card with no item type.
- **Existing rules it runs into.** Read the rule each affected tile already follows. For example, a Heart Door already leaves the hero at exactly 1 HP, so "takes more" does nothing there. Name each conflict.
- **Fractions in whole quantities.** A percentage applied to keys, door costs or counts makes them fractional everywhere they're read: saves, `snap`, display rounding (`whole.ts`), the "holds keys for" checks in pathing and previews. Spell out the case where it blocks (for example, 1 key held against a 1.05 cost).
- **Lethality.** Can the extra damage kill? Do `isLethal`, the previews and the planners count it?
- **Bosses and structure.** Bosses, the Greater Boss, boss floors (`isBossFloor`), sections, the `AreaLedger` judgement, tier gates. Default: a badge never bypasses something meant to block the way up.
- **Per floor in the Delve.** Default: `badgeFloor` (the equivalent floor), as cooldowns already use.
- **Greying and recovery.** When the card greys out, what greys it (the HUD's `unable`), and whether `handStuck` brings it back.
- **Chance and undo.** Default: a roll is a fixed `tileRandom` number per run seed, floor, tile and badge, so undo can't reroll it. Per-run state lives in the run (with a `dropInvalid` decoder) so undo rewinds it.
- **Marks on the board.** Which symbol goes where, when it's removed, and whether it's saved.
- **Dev grant.** Whether Dev mode's grant (`setDevMode`) owns this badge at max copies, and the skills that open the Badges box (if the user mentions a button that doesn't exist, say so and propose the closest real one).

Stop and wait for the answers.

## 3. Write the spec

One block per badge. Mark values you chose with *(proposed)*.

```markdown
### <Name> (`<camelCaseId>`): <rarity>, <kind>
- **Text (level value v):** <the `text(v)` the player reads>
- **Values L1–L7:** <…> <unit>; `lead`: <…>
- **Glyph / colour:** <symbol> <#hex>
- **Trigger and site:** <activate / resolveStep rule / CardRules field / new hook>
- **Per card:** <the card matrix row>
- **Run state:** <new run fields and their decoder, or none>
- **Board / HUD:** <marks, greying, messages, poofs>
- **Dev grant:** <yes/no>
```

Below the spec, list the files, tests and goldens the build will touch, and ask for approval.

## 4. Build (after approval)

Follow `AGENTS.md`. The points that matter most for badges:

- Work in an isolated worktree, cherry-pick onto `main`, push, and clean up.
- Add the new rows at the end of their rarity's group in `BADGES`. The draw picks evenly within a rarity, so a new row changes which badge a given seed draws. Expect `tests/badges.test.ts`'s draw expectations to change, and update them on purpose.
- Planning rules go through `CardRules` and `planHand`. Step outcomes go through `resolveStep` / `StepRules`, never a separate path in `Game`. Rewards go through `activate` and the `RunPurse`, so undo and the `lootedTiles` gate keep working.
- Runs with no badge must play exactly as before. `step-trace`, `undo-clear-trace`, `tower-automation` and `delve-automove` must still match. If one fails, the badge leaked into the plain path.
- Add one test per behaviour to `tests/badges.test.ts`, covering the card matrix's interesting cells, undo, the per-floor limits and the Dev grant.
- Re-record only what the change should move: `ui.golden.json` if the Deck page or HUD shows it (`npm run test:ui`, recorded on the unchanged code first), `render-calls` / `render.golden.json` for new board marks or animations, and `save-decode` if `BadgesSave` or the run's saved fields change.
- Update the "Card badges" passage in `docs/agents/hand-and-automation.md`, and add any new domain term to `CONTEXT.md`.
- Run `npm test` and `npm run build`, then commit with the re-recorded goldens and the reason for each.

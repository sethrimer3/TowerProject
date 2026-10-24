# Golden tests

Which goldens each kind of change moves, when to run the browser goldens, and how to record them.

Most tests here are characterization goldens (`tests/fixtures/*.golden.json`): they pin current output, so an *intended* change to art, assets or content fails them until they are re-recorded. Treat re-recording as part of that change, never a separate cleanup.

| When you change… | Re-record |
|---|---|
| Pixels of a PNG in `public/assets/` (edited art, `npm run tiles:area1` / `tiles:outside`) | `render.golden.json` (`npm run test:render`) |
| A PNG's name, path or size, or add/remove one the game loads | the above, plus `render-calls` (it reads real PNG sizes; sprite-sheet frames depend on width), and `art-modules` / `lighting-passes` if the renamed file is one they draw |
| Board drawing code (`render/rendering.ts`, `render/tile-painters.ts`, lighting, decor, route line, Defend render/art) | `render-calls`, `render.golden.json`, and the module's own golden (`lighting-passes`, `art-modules`, `terrain-paint`, `outdoor-art`, `defend-fences-save`) |
| A Game theme board (`*-board.ts` but Classic's) | `themed-boards` (every board's contents, heart, torches, hero, ground and `over`, call by call), and `theme-popups` if what rises off the board changes |
| Procedural terrain art (`render/themes.ts`) | `terrain-paint`, `render-calls`, `render.golden.json` |
| World or content generation (Tower floors, Delve labyrinth, decor plans, Defend cities) | the generation golden (`tower-layout`, `tower-planning`, `delve-labyrinth`, `decor-plan`, `world-boards`, `defend-city`), then every golden that plays on those boards (`step-trace`, `undo-clear-trace`, `tower-automation`, `delve-automove`, `defend-replay`, `render-calls`, `render.golden.json`); saved maps change, so also bump `LAYOUT_VERSION` |
| Gameplay rules or balance (`progression/upgrades.ts`, `progression/training.ts`, `economy/kill-pay.ts`, `step-effects.ts`, enemies, pickups, Defend units) | `step-trace`, `undo-clear-trace`, `tower-automation`, `delve-automove`, `tournament-trace`, `defend-replay` as they fail |
| The assemble's melt (`ui/slag-merge.ts`) | `slag-merge` |
| UI text, pages, HUD or dialogs | `ui.golden.json` (`npm run test:ui`) (the Defend page is left out while Defend is on hold) |
| Save format | `save-decode` |

Run a browser golden only when the change reaches what it captures: `test:ui` for pages, HUD and dialogs; `test:render` for board drawing, art, or anything that changes the render scenes' boards (`test:snapshots` for both at once); `test:pointer` only for a Defend page change (Defend is on hold; see defend.md).
When a change reaches only some of what a suite captures, or you are rerunning what failed, run that part alone (next section).

## Running part of a browser suite

`ONLY` limits `test:render`, `test:ui` and `test:snapshots` to the golden keys that start with one of its comma-separated prefixes, the names a failure prints (`ONLY=rich.goals,floor. npm run test:ui`).
`ONLY=failed` reruns the keys still failing from the suite's earlier runs, and passes at once when none are.
Each suite keeps that list in `test-results/<suite>-failed.json`: a run takes off the keys it checked and adds the ones that failed, and a full run starts the list afresh.
A partial run takes a fraction of the full suite's time, which is about 45s for render and 120s for UI.
- The render suite draws only the scenes whose names a prefix reaches (a key is `<scene>.<frame>`, so `ONLY=towerDim` draws one scene and `ONLY=tower` draws every `tower…` scene).
- The UI suite walks only the sections a prefix reaches, each from its own fixture save (`fresh`, `fallen`, `floor`, `rich`, `dev`, `badges`, `badgeSlots`, `notes`, `equipment`, `mail`, `missions`, `events` with `relics`, `tournament`, `shrines`: the `section(...)` calls in `tests/ui-golden.mjs`).
  A snapshot can't run without the steps before it in its section, so `ONLY=rich.goals` walks the whole `rich` section (about 50s) and compares only the `rich.goals…` keys.
- A partial run compares only the matching keys, so a key outside the filter can't fail it.
  With `UPDATE_GOLDEN=1` it records only the matching keys into the golden file, in their places, and leaves every other hash as it was.
- A filter that matches no key fails the suite (exit 2), so a mistyped prefix can't pass.
  `test:snapshots` passes `ONLY` to both suites, skips a suite with no match, and fails only when neither suite has one.
- A new UI section starts with its own `load(fixture)`, is wrapped in `section("<prefix>", …)` naming the prefixes of its snapshots, and must pass when run alone (`ONLY=<prefix>`).
  A section must not depend on state that an earlier section leaves behind.

Typical uses:
- After a full run fails, fix the cause and run `ONLY=failed npm run test:render` until it passes.
- For a change that touches one page or scene, run that prefix alone while you iterate, then the full suite once before committing.
- To re-record what the change should move, use `ONLY=<those prefixes> UPDATE_GOLDEN=1`, then check `git diff tests/fixtures/` shows only those keys.

How:
1.
**Refactor (no visible change intended):** re-record nothing.
Every golden must still match after the change.
The browser goldens' hashes are machine-specific, so if one fails, record it on the unchanged code (save your change as a patch file, `git diff > change.patch`, and set it aside rather than stashing, since the stash is shared between worktrees; record with `UPDATE_GOLDEN=1`, or `ONLY=failed UPDATE_GOLDEN=1` for only the keys that failed), restore the change, and compare again (`ONLY=failed`); only a failure then is yours.
A UI hash that flips between two values from one machine to the next usually measures text at a fractional font size (`smaller`, an `em` of an odd size): text engines disagree slightly on its width, and a box placed by its own size (the inspect box is centred on its tile) moves with it, so give that text a whole-pixel size rather than re-recording.
2.
**Intended change:** make it, run `npm test` (and the browser goldens if visuals or UI changed) and check that only the keys the change should touch fail; for pixels, look at the PNGs in `test-results/render*/`.
Then re-record those goldens with `UPDATE_GOLDEN=1` (a browser suite's own keys only: `ONLY=<prefixes> UPDATE_GOLDEN=1`; one Node file: `UPDATE_GOLDEN=1 node --experimental-transform-types --import ./tests/pin-random.ts --test tests/<name>.test.ts`), commit the fixtures in the same commit, and say in the message which goldens were re-recorded and why.
3.
The browser goldens build and serve their own copy of the app (no dev server needed) and aren't run by CI; when visuals or UI change, run them yourself.
The Node goldens run in CI on Linux, so they must hash the same on every OS: one whose hashes depend on `Math.pow` imports `tests/portable-math.ts` first.

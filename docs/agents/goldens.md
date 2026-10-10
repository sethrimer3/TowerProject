# Golden tests

Which goldens each kind of change moves, when to run the browser goldens, and how to record them.

Most tests here are characterization goldens (`tests/fixtures/*.golden.json`): they pin current output, so an *intended* change to art, assets or content fails them until they are re-recorded. Treat re-recording as part of that change, never a separate cleanup.

| When you change… | Re-record |
|---|---|
| Pixels of a PNG in `public/assets/` (edited art, `npm run tiles:area1` / `tiles:outside`) | `render.golden.json` (`npm run test:render`) |
| A PNG's name, path or size, or add/remove one the game loads | the above, plus `render-calls` (it reads real PNG sizes; sprite-sheet frames depend on width), and `art-modules` / `lighting-passes` if the renamed file is one they draw |
| Board drawing code (`rendering.ts`, `tile-painters.ts`, lighting, decor, route line, Defend render/art) | `render-calls`, `render.golden.json`, and the module's own golden (`lighting-passes`, `art-modules`, `terrain-paint`, `outdoor-art`, `defend-fences-save`) |
| Procedural terrain art (`themes.ts`) | `terrain-paint`, `render-calls`, `render.golden.json` |
| World or content generation (Tower floors, Delve labyrinth, decor plans, Defend cities) | the generation golden (`tower-layout`, `tower-planning`, `delve-labyrinth`, `decor-plan`, `world-boards`, `defend-city`), then every golden that plays on those boards (`step-trace`, `undo-clear-trace`, `tower-automation`, `delve-automove`, `defend-replay`, `render-calls`, `render.golden.json`); saved maps change, so also bump `LAYOUT_VERSION` |
| Gameplay rules or balance (`config.ts`, `step-effects.ts`, enemies, pickups, Defend units) | `step-trace`, `undo-clear-trace`, `tower-automation`, `delve-automove`, `tournament-trace`, `defend-replay` as they fail |
| UI text, pages, HUD or dialogs | `ui.golden.json` (`npm run test:ui`), and `defend-pointer.golden.json` for the Defend page |
| Save format | `save-decode` |

Run a browser golden only when the change reaches what it captures: `test:ui` for pages, HUD and dialogs; `test:render` for board drawing, art, or anything that changes the render scenes' boards (`test:snapshots` for both at once); `test:pointer` for the Defend page.

How:
1.
**Refactor (no visible change intended):** re-record nothing.
Every golden must still match after the change.
The browser goldens' hashes are machine-specific, so if one fails, record it on the unchanged code (save your change as a patch file, `git diff > change.patch`, and set it aside rather than stashing, since the stash is shared between worktrees; record with `UPDATE_GOLDEN=1`), restore the change, and compare again; only a failure then is yours.
2.
**Intended change:** make it, run `npm test` (and the browser goldens if visuals or UI changed) and check that only the keys the change should touch fail; for pixels, look at the PNGs in `test-results/render*/`.
Then re-record those goldens with `UPDATE_GOLDEN=1` (one file: `UPDATE_GOLDEN=1 node --experimental-transform-types --import ./tests/pin-random.ts --test tests/<name>.test.ts`), commit the fixtures in the same commit, and say in the message which goldens were re-recorded and why.
3.
The browser goldens build and serve their own copy of the app (no dev server needed) and aren't run by CI; when visuals or UI change, run them yourself.
The Node goldens run in CI on Linux, so they must hash the same on every OS: one whose hashes depend on `Math.pow` imports `tests/portable-math.ts` first.

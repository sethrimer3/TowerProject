# Saves

How the save loads and decodes, adding save state, settings rows, and the save golden.

**Saves.** `src/save.ts` loads defensively: `defaults()` defines every field, and loading must tolerate missing or old fields.
When adding save state, add it to `defaults()`, the `Save` type in `entities.ts`, and a small decoder called from `decode()` (per-version steps live in `VERSION_STEPS`).
Every decoder (the save's and each module's own, such as `decodeArchives`, `decodeGemDrop`, `decodeGoals`, `decodeShop`) reads fields through the shared readers in `src/decode.ts` (`isRecord`, `finite`, `whole`, `wholeIn`, `time`, `count`, `fraction`, and `dropInvalid` for a run's optional fields).
Each mode's run has its own decoder (`decodeTowerRun`, `decodeDelveRun`), which checks the player's column against that mode's board width and drops the other mode's fields.
Unsupported versions reset safely.
Player settings are the exception: each is one row in `SETTINGS` (`src/settings.ts`: its default, the values a save may hold, and its control on the Settings page), from which the `Settings` type, the defaults and the decoder all come, so every setting is always present and readers never re-default it.
Rows are in saved key order; the page lists its own order.
`tests/settings.test.ts` checks every row round-trips and defaults bad values.
`tests/save.test.ts` pins `decode()` behaviour with a corpus of mutated saves hashed against `tests/fixtures/save-decode.golden.json`; if a decode change is intended, regenerate it with `UPDATE_GOLDEN=1 node --experimental-transform-types --import ./tests/pin-random.ts --test tests/save.test.ts` and review which cases changed.

# Saves

How the save loads and decodes, adding save state, settings rows, and the save golden.

**Saves.** `src/save.ts` loads defensively: `defaults()` defines every field, and loading must tolerate missing or old fields.
When adding save state, add it to `defaults()`, the `Save` type in `entities.ts`, and a small decoder called from `decode()` (per-version steps live in `VERSION_STEPS`).
Every decoder (the save's and each module's own, such as `decodeArchives`, `decodeGemDrop`, `decodeGoals`, `decodeShop`) reads fields through the shared readers in `src/decode.ts` (`isRecord`, `finite`, `whole`, `wholeIn`, `time`, `count`, `fraction`, and `dropInvalid` for a run's optional fields).
Each mode's run has its own decoder (`decodeTowerRun`, `decodeDelveRun`), which checks the player's column against that mode's board width and drops the other mode's fields.
Unsupported versions reset safely.
Old saves needn't convert while the game is a prototype, but a simple rename gets a conversion so a player keeps what they bought: the decoder reads the old key when the new one holds nothing (`RENAMED_UPGRADES` in `save.ts`, the Evade skill now Parry, and the Rush skills now Dash, whose research projects and badge `renameRush` renames in the raw save before it decodes).
Each conversion carries a `TODO` to remove it in a future save version; add a rename to the same map (or one like it beside the decoder it belongs to) rather than writing a migration.
**The player profile** (`src/profile.ts`, `save.profile`) keeps lifetime tallies as they happen: `createdAt` (0 in `defaults()`; `stampProfile` sets it from the clock in `main.ts` on start-up and in `Game.eraseAll`, so `decode` stays deterministic), `earned` per currency in `LIFETIME_CURRENCIES` (Gold, Silver, Gems, Ascension Shards, Cells, Medals, Inspiration, Courage, Tickets), and the counts `trainingLevels`, `researchLevels`, `trainingGold` and `researchGold`.
Every gain calls `earn` where the currency is credited: `RunPurse` (Gold, Silver, Interest, Cells), `CURRENCIES[…].credit` (the Shop, Mail, Goals, the Tournament's prizes), the mission and event desks and `boostEvent` (Medals), `GemFinder`, `MODES[mode].credit` and the area ledger (Inspiration, Courage), and the Tickets' grants (Mail, `TournamentDesk`); a new way to gain a currency must call it too.
Silver belongs to the run, so each `MoveSnapshot` keeps the lifetime Silver then (`silver`) and `Game.restore` sets it back, as it does XP.
`decodeProfile` reads it, and `backfillProfile` raises each tally to at least what the save proves (currencies held, Training ranks and their Gold, research levels), so a save from before the profile starts from there.
`tests/profile.test.ts` covers it.
**Run Notes** (`src/run-notes.ts`) are counted on every run, researched or not, in two places by what undo does to them.
What undo takes back with the run is in it, `run.notes` (`RunNotes`: `startedAt`, the wall clock as the run went inside, set by `enterFromOutside`, or by `newRun` for a run begun inside; steps, keys by colour, doors by `doorName`, potions, ATK and DEF shards, Silver found), counted by `Game` (`take`), `Finds` (`door`, `notePickup`) and `noteKey` in `run-notes.ts` (which also counts the keys Blue Trader, the siphons and Find Yellow Key give) and `RunPurse` (`noteSilver`); `notesOf` gives none in the forest.
What undo never takes back sits beside the run in the mode's slice, `runFinds` (`RunFinds`: materials by id, chests' bars and Equipment's materials and salvage, Cells, Gems, equipment pieces kept), counted where `RunPurse` and `GemFinder` pay them and reset by `newRun`, like `runGold`.
The run decoder drops malformed notes (`validNotes`) and `decodeFinds` reads the finds; kills, chests, XP, Gold and the run's currency come from what the run already kept.
`tests/run-notes.test.ts` covers them.
Player settings are the exception: each is one row in `SETTINGS` (`src/settings.ts`: its default, the values a save may hold, and its control on the Settings page), from which the `Settings` type, the defaults and the decoder all come, so every setting is always present and readers never re-default it.
Rows are in saved key order; the page lists its own order.
`tests/settings.test.ts` checks every row round-trips and defaults bad values.
`tests/save.test.ts` pins `decode()` behaviour with a corpus of mutated saves hashed against `tests/fixtures/save-decode.golden.json`; if a decode change is intended, regenerate it with `UPDATE_GOLDEN=1 node --experimental-transform-types --import ./tests/pin-random.ts --test tests/save.test.ts` and review which cases changed.

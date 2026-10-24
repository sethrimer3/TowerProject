# Saves

How the save loads and decodes, adding save state, settings rows, and the save golden.

**Saves.** `src/save.ts` loads defensively: `defaults()` defines every field, and loading must tolerate missing or old fields.
When adding save state, add it to `defaults()`, the `Save` type in `save-shape.ts`, and a small decoder called from `decode()` (per-version steps live in `VERSION_STEPS`).
Every decoder (the save's and each module's own, such as `decodeArchives`, `decodeGemDrop`, `decodeGoals`, `decodeShop`) reads fields through the shared readers in `src/decode.ts` (`isRecord`, `finite`, `whole`, `wholeIn`, `time`, `count`, `fraction`, and `dropInvalid` for a run's optional fields).
Each card's XP (`save.cardXp`, `decodeCardXp` in `card-levels.ts`: known cards, whole, at most `MAX_CARD_XP`) is outside the run, so each undo snapshot keeps a copy, `cardXp` (dropped by the snapshot decoder when malformed), as it keeps `xp`.
The levels card buys opened (`save.cardBuys`, `decodeCardBuys` in `card-buys.ts`: known nodes, each within its room, and the buys' stream, null until `stampProfile` seeds it) decode first; the card points spent on each card's tree (`save.cardTrees`, `decodeCardTrees` in `card-trees.ts`) decode against the cards' XP and those opened levels, so a tree never spends more than its card's level under its max level gives, nor more than a node holds; a run's copy (`run.cardTrees`) is dropped unless each card is in its hand and each node known and in range.
Each mode's run has its own decoder (`decodeTowerRun`, `decodeDelveRun`), which checks the player's column against that mode's board width and drops the other mode's fields.
Unsupported versions reset safely.
Old saves needn't convert while the game is a prototype, but a simple rename gets a conversion so a player keeps what they bought: the decoder reads the old key when the new one holds nothing (`RENAMED_UPGRADES` in `save.ts`, the Evade skill now Parry, and the Rush skills now Dash, whose research projects and badge `renameRush` renames in the raw save before it decodes).
`renameDoorNodes` renames DOOR's legendary node `masterKey` to `secretKnock` (KEY's tree took the name) and its epic `locksmith` to `lockPick` (KEY's keeps its own) in the raw save's spent and opened levels and a run inside's trees, and a run's `doorOdds.locksmith` to `lockPick`.
`retireYellowKey` does the same for KEY taking GOLD KEY's place in the base hand: a save with no KEY card that hasn't earned GOLD KEY (the `cardYellowKey` skill) holds KEY where it held GOLD KEY, in the hand, its links and the badges on it, and in a run inside's.
Version 4 (provisions became uses a run carries, at a hundred times the price) decodes as version 3 did, but a version 3 save's provision counts are dropped (`resetProvisions`, last in its `VERSION_STEPS`), no Gold returned.
Each conversion carries a `TODO` to remove it in a future save version; add a rename to the same map (or one like it beside the decoder it belongs to) rather than writing a migration.
**The player profile** (`src/profile.ts`, `save.profile`) keeps lifetime tallies as they happen: `createdAt` (0 in `defaults()`; `stampProfile` sets it from the clock in `main.ts` on start-up and in `Game.eraseAll`, so `decode` stays deterministic), `earned` per currency in `LIFETIME_CURRENCIES` (Gold, Silver, Gems, Ascension Shards, Cells, Medals, Inspiration, Courage, Tickets, Trial Points), and the counts `trainingLevels`, `researchLevels`, `trainingGold` and `researchGold`.
Every gain calls `earn` where the currency is credited: `RunPurse` (Gold, Silver, Interest, Cells), `CURRENCIES[…].credit` (the Shop, Mail, Goals, the Tournament's prizes), the mission and event desks and `boostEvent` (Medals), `GemFinder`, `MODES[mode].credit` and the area ledger (Inspiration, Courage), the Tickets' grants (Mail, `TournamentDesk`), and `settleTrialVictory` (Trial Points); a new way to gain a currency must call it too.
Silver belongs to the run, so each `MoveSnapshot` keeps the lifetime Silver then (`silver`) and `Game.restore` sets it back, as it does XP.
`decodeProfile` reads it, and `backfillProfile` raises each tally to at least what the save proves (currencies held, Training ranks and their Gold, research levels), so a save from before the profile starts from there.
`tests/profile.test.ts` covers it.
**The profile file** (`src/profile-file.ts`) is the save with no run in progress, as pretty JSON headed by `format` (`PROFILE_FORMAT`), `version` and `exportedAt`, its fields grouped by `PROFILE_SECTIONS`.
`exportProfile` keeps each mode's records, tiers and currency (`KEPT_SLICE`, plus Inspiration or Courage) and clears `gemDrop`'s Gem on a floor and runs reached; the run, history, fall, looted tiles, the run's tallies, Automove memory and `provingGrounds` stay out.
`importProfile` refuses a file of another format or a version `decodableVersion` rejects, flattens the sections and runs them through `decode`, so whatever the file leaves out takes its default; `Game.replaceSave` puts it in place and starts outside the Tower.
A new save field goes in a section (or `UNSECTIONED`); `tests/profile-file.test.ts` fails until it does, and checks a round trip comes back byte for byte.
**Run Notes** (`src/run-notes.ts`) are counted on every run, researched or not, in two places by what undo does to them.
What undo takes back with the run is in it, `run.notes` (`RunNotes`: `startedAt`, the wall clock as the run went inside, set by `enterFromOutside`, or by `newRun` for a run begun inside; steps, keys by colour, doors by `doorName`, potions, ATK and DEF shards, Silver found), counted by `Game` (`take`), `Finds` (`door`, `notePickup`) and `noteKey` in `run-notes.ts` (which also counts the keys Blue Trader, the siphons and Find Gold Key give) and `RunPurse` (`noteSilver`); `notesOf` gives none in the forest.
What undo never takes back sits beside the run in the mode's slice, `runFinds` (`RunFinds`: materials by id, Supply Chests' materials and salvage, Cells, Gems, equipment pieces kept), counted where `RunPurse` and `GemFinder` pay them and reset by `newRun`, like `runGold`.
The run decoder drops malformed notes (`validNotes`) and `decodeFinds` reads the finds; kills, chests, XP, Gold and the run's currency come from what the run already kept.
`tests/run-notes.test.ts` covers them.
Player settings are the exception: each is one row in `SETTINGS` (`src/settings.ts`: its default, the values a save may hold, and its control on the Settings page), from which the `Settings` type, the defaults and the decoder all come, so every setting is always present and readers never re-default it.
Rows are in saved key order; the page lists its own order.
`uiSprites` is an opt-in boolean, false for new saves and missing or malformed saved values, independent of `spritesOff` for existing board artwork.
`spriteAnimations` and `squareDoors` also default false, decode as booleans, and retain their independent preferences when Sprites is switched off.
Their controls appear only while `uiSprites` is checked; non-default Game themes and the board-art opt-out still override their rendering.
`tests/settings.test.ts` checks every row round-trips and defaults bad values.
`tests/save.test.ts` pins `decode()` behaviour with a corpus of mutated saves hashed against `tests/fixtures/save-decode.golden.json`; if a decode change is intended, regenerate it with `UPDATE_GOLDEN=1 node --experimental-transform-types --import ./tests/pin-random.ts --test tests/save.test.ts` and review which cases changed.

The optional `save.provingGrounds` holds an isolated trial attempt (layout version, control mode, copied hand and autoplay state, seed, room, hero stats, boss HP, turn count, jumping slimes, consumed potions and scorch timestamps), decoded defensively by `decodeTrial`; old saves omit it and ordinary mode runs remain separate.

Unversioned Proving Grounds attempts from the 50×50 layout restart safely in the version 2 staging room with their copied stats; `decodeTrial` validates the new mode, hand and slime state.

Proving Grounds version 2 also saves the elemental's position/ghost phase and teleport origin/turn, plus the most recent laser origin/axis/turn.
Attempts predating those additive fields retain their progress with a corporeal center boss; a reload preserves an existing ghost phase but skips replaying its visual flight.

Trial `displayHand` stores the equipped faces shown in the normal hand bar, including disabled cards in manual mode.
Trial `purchases` stores bounded Silver and known integer training ranks; their effects are already included in the saved trial hero, so resume restores ranks without applying them twice.
`save.trialAccess` defaults to `{day:0,spent:0,points:0,progress:{}}` and decodes UTC day index, 0–2 spent daily keys, a bounded integer Trial Points balance and per-boss progress without consulting the clock.
Known trial IDs only are accepted; each progress record has `cleared` in 0–10,000 and deduplicated, sorted `claimed` difficulty receipts in 1–10,000.
Valid receipts raise `cleared` to at least their highest difficulty; a legacy selected `level` is ignored rather than treated as a victory.
The Trial Points lifetime tally backfills to at least the held wallet, and first-clear settlement updates both tally and wallet.
These default/profile fields intentionally change the save-decode corpus.
Only runtime entry/menu checks refill the allowance on a later UTC day; it is outside the attempt and cannot be reset by retry, leaving or reloading.
Attempts also save a known `trialId` (legacy attempts default to `light-elemental`); `hybrid` accepts both input sources and keeps its hand and autoplay state.
Trials save a fixed `level` (legacy attempts default to 1), and each beam may include its fired ray `count` (absent means the legacy two rays).
Slime hop times validate against either the three-turn hop cadence or the level's release cadence; old IDs remain valid while new releases use their arena turn as ID.
Trial `destroyed` maps known edge crate/torch coordinates to their first destruction turn, bounded by the attempt's current turn; unknown positions and invalid turns are dropped, malformed containers rejected, and older attempts receive an empty map.
Destruction stays inside the optional attempt; decoding a save without a trial never creates an attempt.

Keymaster attempts add `keymaster`: an encounter-only golden key inventory, Use keys preference, hit/spawn counters, up to eight counted key piles, up to six unique mimics with current/max HP, and up to four door flights with elapsed milliseconds and impact receipts.
`decodeKeymaster` rejects malformed counts, collisions, invalid landing positions and contradictory flight/impact flags; `decodeTrial` also rejects elemental teleports, lasers, slimes and scars on this boss.
An opened cardinal door is a valid saved hero position, including row or column 0; closed wall cells remain invalid.
Light Elemental attempts retain their old shape, and save-decode golden hashes remain unchanged.
Both known trial IDs decode independent clear/reward records under `trialAccess.progress`.

# The Codex

The Codex is the player's reference to the game: a page of categories, each a tab, opened from the HUD's menu in the forest and inside a climb.

**Modules.**
`src/codex/codex.ts` builds every category as plain data from the save and the game's own catalogs (`codexCategories(source)`): each `CodexCategory` has its `open` flag, a summary, `links`, and `sections` of `CodexEntry`s (an icon reference, a name, a brief, optional `facts`, `lines`, `card` for the card's powers, `link`, `ready`).
`src/codex/briefs.ts` holds the one-line briefs for cards, arcana, enemy strengths, attributes and builds, typed as `Record`s over each catalog, so a new card, arcanum or enemy kind fails the type check until it has a brief; `tests/codex.test.ts` caps their length.
`src/codex/discovery.ts` keeps `save.codex` (`CodexSave`: arcana seen and Uniques owned, which the rest of the save forgets once an offer is rerolled, a climb's lent arcanum ends or a piece is merged), filled by `noteDiscoveries`, which `main.ts`'s `update()` and the page's render call; `decodeCodex` reads it, and it sits in the profile file's `profile` section.
`src/ui/codex-page.ts` (`CodexPage`) draws a category: the tab grid (a category not `open` is a disabled ??? tab), the summary, links, and `<details>` sections, entries expanding to their facts; enemy sections with `table` draw as rows like the run's enemy stats box (marks from `enemy-odds-box.ts`'s `strengthMarks` and `traitMarks`).
It resolves each `CodexIcon` to the game's existing PNG helpers (`iconHtml`).

**Rules.**
An entry whose only detail is one stat or rank carries it as `status`, drawn after its name, and never `facts`, which make it expand.
A rank's boost is `trainedBoost` (loadout.ts) for Training and `researchBoost` (archives.ts) for research, which reads the target's own `shown` and falls back to the value reached where that is no plain amount.
A card entry's `card.upTo` is `powersShownTo` (cards/levels.ts), as the Deck page's pop-up uses: the rank of the rarity after its own, or mythic's with Access to Everything.
A door is a `door` icon (`CodexDoor`), a canvas `paintDoors` fills with `drawSquareDoor`'s coloured tile whatever the Square doors setting, since the default board's doors differ only by a small key mark; `beside` puts one next to a key.
What the player hasn't reached shows as ??? with no name, brief, facts or link; Access to Everything (`seesAll`) opens every category and reveals every entry, saving nothing.
An enemy strength or attribute counts as discovered once a tower that can roll it is open (`enemiesKnown` samples `enemyShare` and `traitOdds` over each open tower's floors); a Greater Boss once one has paid Cells, so its secret keeps.
Tower elements' blue, red and Heart doors show once a tower's record passes the floor they first appear on (docs/gameplay/floors.md), and Multi Doors with red, since it pictures a Triune Door.
There is no Steel Doors entry, since generation places none.
The torch's line about the Greater Boss waits for the `cardTorch` skill.
A locked skill's cost to reach (`costToReach`) sums its next rank's price and that of every skill above it not yet owned, since a node needs all it requires.
Links name a `CodexTarget`; `main.ts`'s `followCodex` opens the page on what it points at (`DeckPage.focus` opens a card's details, `SkillTreePage.focus`/`showTree`, `ResearchPage.show`, `GearPage.openEquipment`/`openArcana`, `ShopPage.focusOffer` scrolls to and lights an offer).
A link to a page only the forest opens (Deck, Upgrades, Gear, Goals, Relics, Shrine Boons) is disabled inside a climb, with a note.

The Familiars category opens with Events (or a familiar hatched) and shows each with its brief (`FAMILIAR_BRIEFS`), a hatched one its levels.

**Adding to it.**
A future major game experience that doesn't break down into a category of its own gets a topic in `GENERAL_TOPICS` (codex.ts).
A new category is a function in codex.ts listed in `codexCategories`, with an id in `CodexCategoryId`.
Briefs say what a thing is or is for in a line, never its numbers in full.

**Tests.**
`tests/codex.test.ts` covers which categories a new profile opens, Access to Everything, hidden entries, brief length, links inside a climb, `costToReach`, skill grouping, ascension links, enemy discovery, `noteDiscoveries` and decoding.
`node tests/codex.mjs` (dev server, or `TEST_URL`) opens the page in the browser at phone width, checks locked tabs, the Free Daily Gems link landing on its Shop offer, Access to Everything and overflow, with screenshots in `test-results/codex/`.

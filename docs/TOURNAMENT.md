# The Tournament (plan)

Status: **steps 1 to 4 of the build order built** (the rules, save and stub server, the tournament run, the screens, and the Ending and Results phases with *Claim rewards* and expiry; `src/tournament/`, `ui/tournament-page.ts`); left are Tickets in the purse and the goldens. This is the design and the build order for the Tournament, a twice-weekly global competition in the Delve.

## Summary

- Tower I's floor 70 Goal becomes **Unlock the Tournament** (a new `GoalUnlock`, `tournament`).
- Once it is claimed, a **Tournament Hall** stands at the top right of the forest clearing (both forests, every tier), with a trophy banner on its roof, and a **Tournament button** (trophy) stands under Settings in the forest.
- A tournament opens every **Wednesday and Saturday, 00:00 to 24:00 GMT**, on the server's clock. Entries close at the end of the day; runs already inside get **4 more hours**; then the server tabulates the final results.
- Each player belongs to one **league**: Copper, Silver, Gold, Platinum, Champion. A tournament run is a **Delve run in cave 1, 3, 5, 7 or 9** by league (shown as *Delve 1+*, *3+* …), with every enemy's stats ×1.1. Every entrant plays from the **same server seeds**. The **score is the depth reached**, ranked against the league worldwide.
- Entering costs one **Ticket**. Each new tournament grants one, with a celebration. When out of Tickets: one more for an ad (straight away with Ad-Disable), then more for **10, 20, 30 … Gems**, rising by 10 each, starting over each tournament.
- Placement pays **Gems and Ascension Shards** in ten prize levels by global percentile, once the server finalizes the results, claimed within **24 hours** with *Claim rewards*.

## The tournament's timeline

All times are GMT on the server's clock (`src/shop/clock.ts`'s confirmed server time; the device clock is only used to estimate between confirmations, for display).

| Phase | When | Button shows | Can enter |
|---|---|---|---|
| **Upcoming** | between tournaments | `2d5h` until the next opens | no |
| **Open** | Wed or Sat, 00:00–24:00 | `Open` | yes, with a Ticket |
| **Ending** | the 4 hours after entry closes, and until the server reports the results final | `Ending` | no; runs inside still count until the 4 hours are up |
| **Results** | from finalization, 24 hours | `Claim` (with a dot) while a reward waits, else the countdown to the next | no |

A tournament's id is the GMT date its entry day starts (`2026-10-07`). Wednesday's Results phase ends well before Saturday opens, and Saturday's before Wednesday's, so at most one tournament is ever live. The schedule is pure functions of a server time (`phaseAt(now)`, `tournamentAt(now)`, `nextOpen(now)`), so it is unit-tested without a server.

Depth a run reaches after the 4 hours are up never counts (`TournamentDesk.counts`, which `recordScore` checks). A run still inside then plays on as a normal Delve run, its score what it reached before.

## Leagues

| League | Delve cave | Shown as | Trophy |
|---|---|---|---|
| Copper | 1 | Delve 1+ | copper cup |
| Silver | 3 | Delve 3+ | silver cup |
| Gold | 5 | Delve 5+ | gold cup |
| Platinum | 7 | Delve 7+ | platinum cup |
| Champion | 9 | Delve 9+ | jewelled cup |

A tournament run plays its league's cave whether or not the player has opened it through Goals. The *+* marks the ×1.1 enemies.

**Moving between leagues** (decided by the server after each tournament; the client shows the last league it reported, `save.tournament.league`):

- Every player starts in Copper.
- The **top 13%** of a league's entrants move up a league (none above Champion).
- The **bottom 20%** move down, **only in Platinum and Champion**: once promoted out of Copper, a player can never be demoted back into it, and once promoted out of Silver, never back into it. So Silver and Gold have no demotion zone, and Copper and Silver hold early and mid-game players competing among themselves.
- A player who didn't enter stays in their league.

The two zones line up with the prize levels: promotion is levels 1–3 (3% + 4% + 6% = 13%), demotion is level 10 (the bottom 20%).

## Score, places and ties

- **Score:** the deepest depth the run reached (the Delve's depth at its highest). The client sends it to the server when the run ends.
- **Ties:** players with the same score all take the **lowest** place of their cohort. If five players tie for 3rd to 7th, all five are 7th. When a run completed never matters, so no time zone has an advantage.
- **Percentile:** the share of the league's entrants placed ahead of the player (`withinTop`), so first place is always in the top 3%, however few entered. The server reports each player's place and the league's entrant count; the prize level comes from them, so a tie at a level boundary falls to the lower level. Promotion and demotion use the same measure.
- **Prizes come from the server.** A player can edit local data and change what the game shows, but the server works out the final prizes and will push them to each player's profile (TODO). *Claim rewards* only collects what the server granted.

## Prizes

**Ascension Shards** and **Gems** (`CURRENCIES`), in ten levels per league by global percentile. The page shows the player's league's top prize; **All prizes** shows every level in every league. The server will send the live table, so this one is the client's fallback and the design reference.

| Level | Percentile | Copper | Silver | Gold | Platinum | Champion |
|---|---|---|---|---|---|---|
| 1 | top 3% | 20 ◆ 100 💎 | 40 ◆ 200 💎 | 80 ◆ 300 💎 | 180 ◆ 425 💎 | 300 ◆ 550 💎 |
| 2 | 3–7% | 17 ◆ 80 💎 | 33 ◆ 150 💎 | 70 ◆ 240 💎 | 150 ◆ 360 💎 | 230 ◆ 475 💎 |
| 3 | 7–13% | 14 ◆ 60 💎 | 26 ◆ 100 💎 | 56 ◆ 175 💎 | 110 ◆ 300 💎 | 170 ◆ 400 💎 |
| 4 | 13–20% | 12 ◆ 40 💎 | 20 ◆ 50 💎 | 38 ◆ 110 💎 | 65 ◆ 220 💎 | 120 ◆ 325 💎 |
| 5 | 20–28% | 10 ◆ 35 💎 | 18 ◆ 48 💎 | 34 ◆ 100 💎 | 56 ◆ 200 💎 | 100 ◆ 300 💎 |
| 6 | 28–36% | 9 ◆ 30 💎 | 16 ◆ 46 💎 | 32 ◆ 90 💎 | 50 ◆ 180 💎 | 80 ◆ 275 💎 |
| 7 | 36–44% | 8 ◆ 25 💎 | 15 ◆ 45 💎 | 30 ◆ 80 💎 | 44 ◆ 160 💎 | 65 ◆ 250 💎 |
| 8 | 44–52% | 7 ◆ 20 💎 | 14 ◆ 44 💎 | 27 ◆ 70 💎 | 38 ◆ 140 💎 | 50 ◆ 225 💎 |
| 9 | 52–80% | 6 ◆ 15 💎 | 13 ◆ 42 💎 | 24 ◆ 60 💎 | 30 ◆ 120 💎 | 35 ◆ 200 💎 |
| 10 | bottom 20% | 5 ◆ 10 💎 | 12 ◆ 40 💎 | 20 ◆ 50 💎 | 20 ◆ 100 💎 | 20 ◆ 175 💎 |

◆ Ascension Shards, 💎 Gems. Levels 1 and 10 are as specified; the levels between are designed to satisfy the rule below.

**The oscillation rule.** Moving up must never pay less than holding back. Concretely, for each currency, where *L4* is a league's level 4 (the best level outside the promotion zone), *L3* its level 3 (the worst inside it) and *Up10* the next league's level 10:

- **Copper → Silver, Silver → Gold** (promotion is permanent, so a promoted player who then always finishes last stays up for good): each later tournament at the bottom of the upper league pays at least the lower league's L4: *Up10 ≥ L4*.
- **Gold ↔ Platinum, Platinum ↔ Champion** (a player can promote, then be demoted): the two tournaments of the cycle, promoting at the lowest promotion level and then demoted from the upper league's bottom, pay at least two tournaments at the lower league's L4: *L3 + Up10 ≥ 2 × L4*.

| Pair | Shards | Gems |
|---|---|---|
| Copper → Silver | 12 ≥ 12 | 40 ≥ 40 |
| Silver → Gold | 20 ≥ 20 | 50 ≥ 50 |
| Gold ↔ Platinum | 56 + 20 = 76 ≥ 76 | 175 + 100 = 275 ≥ 220 |
| Platinum ↔ Champion | 110 + 20 = 130 ≥ 130 | 300 + 175 = 475 ≥ 440 |

Gold's and Platinum's Shards meet the rule exactly at level 4, the most it allows with their level 3; levels 2 and 5–9 don't enter the rule, so they are raised as far toward their neighbours as reads well. Every column also only rises toward level 1. `tests/tournament.test.ts` checks both properties over the table, so a retune can't break them.

**Consequence of the given endpoints:** Gold's bottom (20 ◆ 50 💎) is close to Silver's bottom (12 ◆ 40 💎), so Silver's levels 4–10 are squeezed between 40 and 50 Gems, and Silver's prizes jump from 50 to 100 Gems at the promotion zone. The same is true, less sharply, of Copper's Shards. Raising Gold's bottom would spread Silver's middle levels out.

## Tickets

**Tickets** are held in `save.tournament.tickets` (not a `CURRENCIES` row, since the Shop neither sells nor prices them), with a ticket icon, shown on the Tournament page, and beside Gems in the forest's purse once the Tournament is unlocked. Unused Tickets carry over between tournaments.

- **Free Ticket:** the first time the client confirms a server time in a tournament's Open phase, it grants one Ticket and plays the celebration (`revealReward`, rays and all, with *A new Tournament has begun!*). Once per tournament id (`save.tournament.granted`).
- **Ad Ticket:** pressing *Begin* with no Ticket offers one for watching an ad, once per tournament. With Ad-Disable owned (`adsOff`), the press grants it with no ad, as the ad Gem button does.
- **Gem Tickets:** after that, *Begin* with no Ticket offers one for 10 Gems, then 20, 30, 40 … (10 × (Gem Tickets already bought this tournament + 1), `save.tournament.gemTickets`, starting over each tournament). A Gem price follows the game's Gem rule: never greyed out, red when short, and pressing it short opens `askForGems`.

Each entry spends one Ticket. A player may enter as often as they have Tickets; the best score counts.

## The tournament run

*Begin Tournament* starts a run at once, inside, from either forest, like Warp. `TournamentClient.begin` (`tournament/client.ts`, which does everything that waits on the server, so the game's commands never do) asks the server for the live tournament, registers the entry (`enter`), and then `Game.beginTournament(info, entry)` spends the Ticket and goes in; it refuses, spending nothing, unless the Tournament is unlocked and neither mode's run is inside.

- **Mode:** the Delve, whether or not the player has opened it (`Game.enterMode`, which `switchMode` gates on Into the depths).
- **Tier:** the league's cave: the Delve's selected tier switches to it (`switchTier`), so the run's records are the cave's. **Depth:** the start. **Hero:** the player's own loadout, at full HP, as any run.
- **The same run for everyone:** the server sends the tournament's seeds, by name, and every chance in the run draws from them:
  - `layout`: the run seed (the labyrinth, torches, decor, percent potions, Skip and Revive rolls, which all derive from the run seed already);
  - `game`: the run's other chances (treasure loot, and every other draw `RunPurse` makes), in place of the game's shared `game` stream;
  - `equipment`: Equipment's material and boss drops (`RunPurse`'s `equipmentRng`).

  Each is a stream of its own (`runStream` in `tournament/run.ts`): draw *n* is the *n*th number of the stream the seed starts, and the run counts the draws it has taken (`tournament.drawn`), so undo takes draws back and a reload carries on where it stopped.

  Any other chance a run gains later takes a named seed too. Players still differ in their loadout, training, hand and badges, and that difference is the competition.
- **Harder enemies:** every enemy's HP, ATK and DEF ×1.1 (`TOURNAMENT_STAT_TENTHS`, 11/10, `tournamentCells`), applied after the tier's factor as the Delve `World` builds each chunk, `snap`ped, so it is exact in every engine. Bosses included. Rewards that follow enemy stats (XP by `tierXp`) stay as for the tier.
- **Rewards:** it plays and pays as a normal Delve run of that tier: Gold, Silver, Courage, XP, milestones and records.
- The run carries `tournament: { id, league, entry, seeds, drawn, back }` (`TournamentRun` on the `DelveRun`, checked by `isTournamentRun` in `decodeDelveRun`), so a reload mid-run is still a tournament run (and opens in the Delve, opened or not), and the HUD's height column reads *Delve 3+* over the depth.
- **Undo** works as usual; the score is the deepest depth reached, as the HUD counts it (`tournamentScore`), which undo can't raise.
- The forest sign can't be reached from inside, so a tournament run can't be swapped out. Ending it, by defeat or End Run, goes through `finalizeRun` as every run does, which keeps the score to send (`TournamentDesk.recordScore`: the entry's best, and `pending` until the server takes it), then returns the Delve to the tier the player had selected and the player to the forest they began from (`back`).
- **Sending the score:** the once-a-second tick keeps the depth of a tournament run inside as it rises (`TournamentClient.tick`, through `recordScore`, only while it counts), so depth reached before the grace ends is sent even when the run goes on past it; the run's end dialog sends it as it opens (`TournamentClient.sendRun`) and shows the place once the server answers; a score the server already holds isn't kept to send again. One that couldn't be sent waits in `pending` and is tried again every 30 seconds until the server takes it or its tournament's grace is over.

## Screens and controls

**Goals:** Tower I floor 70 reads *Unlock the Tournament*. Claiming it shows what it does (the hall, the button, Tickets) and offers to open the Tournament page, as Equipment's claim offers the Blacksmith.

**Forest — Tournament Hall:** `TOURNAMENT_HALL` in `outside.ts`, mirroring `BLACKSMITH` across the path (`{ dx: 4, width: 3, y: 8, height: 3 }`) with a yard cleared round it; `OutsideWorld` takes a `hall` flag beside `blacksmith` (Tower I's floor 70 Goal claimed; Dev mode alone doesn't raise it), `isTournamentHall(x, y)`, and `drawTournamentHall` paints a pale stone hall under a blue roof, its lit doorway toward the path, with a pennant bearing a trophy on its gable. `Game.atTournamentHall`, from `BoardOverlay.tap`, opens the Tournament page. Claiming the Goal in the forest raises it at once.

**HUD — Tournament button:** `#tournament-button` (trophy icon), at the top of the forest's actions column, over Settings, labelled with the phase (`2d5h` until the next opens, `OPEN`, `ENDING`, `CLAIM`), refreshed by the once-a-second tick (`renderTournamentButton` in `ui/hud.ts`). A dot while a final prize waits to be claimed (worn by the run menu's hamburger too). Inside a run, it goes into the run menu (`.run-menu-items`, before End Run) once the player has entered the current tournament, and is gone otherwise.

**Talking to the server:** the app asks for the live tournament as it starts, as the Tournament page opens, and whenever the tick sees the Tournament unlocked or its phase change (`refreshTournament` in `main.ts`), so a tournament opening while the game is open grants its Ticket, with its celebration; past the grace it asks again each minute until the results are final (`TournamentDesk.awaitingResults`). The server's report counts only while it is of the latest tournament to have opened (`TournamentDesk.live`): once the next opens on the clock, the desk reads the schedule until the server is asked again, so the next shows open even before it answers. Until the server has answered, a tournament past its grace counts as over (`upcoming`), not ending for good.

**Tournament page** (`ui/tournament-page.ts`, `TournamentPage`, a `section.page` with a Back button to whichever screen opened it, like the Shop's; the tick redraws only its countdown, and the whole page only when the phase changes, so no button is redrawn under a press):

1. *The Tournament*, then the league's trophy and name, and its cave (*Delve 3+*).
2. The phase and its countdown: *Opens in 2d 5h*, *Entry closes in 7h 12m*, *Ending — results in about 3h*, *Final results — claim within 18h*.
3. Tickets held, with the ticket icon.
4. While Open: **Begin Tournament**, or the ad / Gem Ticket offer when out of Tickets.
5. The player's best score this tournament, their place and percentile in the league (*12th of 1,480 · top 1%*), and the anticipated prize level; or the league's top prize when they haven't entered.
6. In Results: the final place and prize, **Claim rewards** (gone once claimed, or after 24 hours: *Rewards expired*), and the league the results move the player to (*Promoted to Silver League*, *Moved down to …*, *Staying in the …*; `TournamentDesk.final`). After the Results, until the next opens, the same under *Last tournament*, over the next tournament's top prize.
7. **All prizes**: a dialog with every league's ten levels, the player's league first, the promotion and demotion zones marked.
8. A version that is too old sees only *Update the game to take part in the Tournament* (TODO, below).

**Run end dialog:** a tournament run's `RunEndDialog` adds a *Tournament* block over its usual totals: the score, then *Place: …* once the server answers (*Checking your place…* until then, *Offline — your score will be sent later* if it can't be reached). A run ended after the grace shows the score kept before it, and *The tournament has ended: depth reached since doesn't count.*

## The server (stubbed)

`src/tournament/server.ts` holds `TournamentServer`, everything the Tournament asks of the outside world, and `stubTournament`, which stands in until the server exists, as `stubServer` does for the Shop:

```ts
interface TournamentServer {
  time(): Promise<number | null>;
  /** The lowest app version the server accepts. */
  minVersion(): Promise<string>;
  /** The live tournament: id, phase times, finalized?, the player's league, its seeds, the prize table. */
  current(): Promise<TournamentInfo | null>;
  /** Registers an entry (after the Ticket is spent); returns an entry id. */
  enter(id: string, league: League): Promise<string | null>;
  /** Sends a finished run's score; returns the player's best, place, entrants and percentile, if known. */
  submit(entry: string, depth: number): Promise<Standing | null>;
  /** The player's standing in the tournament (live, or final once finalized). */
  standing(id: string): Promise<Standing | null>;
  /** Collects the prize the server granted for the final placement, once. */
  claim(id: string): Promise<Prize | null>;
}
```

The stub keeps its schedule on the device clock, derives the seeds from the tournament id and league, and makes up each league's other entrants from a seeded stream fixed by the tournament and league (`stubField`), so the screens can be tried end to end. It keeps nothing itself: it reads the player's own record for their scores and claims, and works out their league from it (starting in Copper, moved by each finalized tournament entered).

A score that couldn't be sent is kept (`save.tournament.pending`) and sent when the server next answers, if the Ending phase isn't over.

## Save

`save.tournament` (in `defaults()`, the `Save` type and `decodeTournament`, read through `src/decode.ts`'s readers):

| Field | Holds |
|---|---|
| `tickets` | Tickets held |
| `league` | the league the server last reported (`copper` at first) |
| `granted` | the tournament id whose free Ticket was granted |
| `adTicket` | the tournament id whose ad Ticket was taken |
| `gemTickets` | `{ id, bought }`: Gem Tickets bought this tournament |
| `entries` | by tournament id: best score, last known place, entrants and percentile, pending score |
| `claimed` | tournament ids whose reward was claimed (the last few) |

The confirmed server time is the Shop's (`save.shop`'s clock), shared, so there's one notion of server time.

## Modules

| Where | What |
|---|---|
| `src/goals.ts` | `tournament` `GoalUnlock`; Tower I floor 70's reward |
| `src/tournament/schedule.ts` | phases, ids and countdowns from a server time |
| `src/tournament/leagues.ts` | the leagues, their caves, labels and trophies; promotion and demotion zones and the floors no demotion passes |
| `src/tournament/prizes.ts` | the prize levels and the fallback table, `prizeLevel(percentile)`, `prizeFor(league, level)` |
| `src/tournament/tickets.ts` | the free, ad and Gem Tickets, and the Gem price |
| `src/tournament/progress.ts` | `save.tournament`, its decoder |
| `src/tournament/server.ts` | `TournamentServer`, `stubTournament` |
| `src/tournament/run.ts` | `TournamentRun`, the ×1.1 enemies, the run's chance streams, its score |
| `src/tournament/client.ts` | `TournamentClient`: what waits on the server (refreshing, entering, sending scores, claiming) |
| `src/game/tournament-desk.ts` | `TournamentDesk` (the game's `tournament`): grant, buy and spend Tickets, begin a run, submit, refresh standing, claim |
| `src/state.ts` | `atTournamentHall`; `newRun` taking `tier` and `tournament`; the run's seeded streams; `finalizeRun` submitting the score |
| `src/tiers.ts` / `src/delve/world.ts` | the ×1.1 tournament stats on the run's cells |
| `src/outside.ts`, `src/rendering.ts` | the hall's tiles, yard and art |
| `src/ui/tournament-page.ts` | the page and the All prizes dialog |
| `src/ui/hud.ts`, `ui/shell.ts`, `ui/run-menu.ts` | the button in the forest and in the run menu |
| `src/ui/dialogs.ts` | the run end dialog's Tournament block |
| `src/ui/dom.ts` | trophy and ticket icons |
| `tests/tournament.test.ts` | schedule (phases across week boundaries), leagues and zones, ties, prize levels and the oscillation rule, Tickets and their prices, entry, scoring, two runs on the same seeds drawing the same chances, the ×1.1 stats, claims and expiry, the save |

`CONTEXT.md` gains *Tournament*, *League*, *Ticket*, *Entry*, *Score* and *Prize level*; `AGENTS.md` and the README's overview gain the Tournament.

## Build order

1. **Rules without screens** (built): the Goal, schedule, leagues, prizes (with the oscillation test), Tickets, save and stub server, all in Node tests.
2. **The run** (built): begin a tournament run (league cave, server seeds and the run's own streams, ×1.1 enemies, the flag), its score, submission on `finalizeRun`, the end dialog's block.
3. **Screens** (built, but for Tickets in the purse): the forest hall, the HUD button and its phases, the Tournament page, All prizes, the free Ticket's celebration, the ad and Gem Ticket offers, the run-menu button.
4. **Ending and claims** (built): the Ending and Results phases (depth counted until the grace ends, the results asked for each minute after it, the final place and league move), *Claim rewards* (`TournamentClient.claim`), expiry, and the next tournament opening over an old report; `tests/tournament-ending.test.ts`.
5. **Goldens:** `ui.golden.json` (the Goals page's floor 70 text, plus new UI-suite steps for the page and button), `save-decode` (the new save field), and a forest-with-hall scene added to `LATER_BOARD_SCENES` (`render-calls`, `render.golden.json`). Tournament runs are new, so no gameplay golden changes; one golden of a seeded tournament run (`step-trace` style) pins its seeds and stats.

## Future (TODO)

- **App version gate:** the build stamps `package.json`'s version (Vite `define`); the page compares it with `minVersion()` and, below it, shows only the update message.
- **Live standing:** while a tournament run is inside, report the depth as it rises and refresh the place in the background, so the run menu's button and the page are current.
- **Server-pushed prizes:** the server credits each player's profile with the prize for their final placement; the client only collects and shows it.
- **Score validation:** the client's score can be forged. Since generation and `resolveStep` are deterministic and engine-independent, and every entrant plays from the same seeds, the server could receive a run's starting loadout and steps and replay them with the same code (it runs in Node as is) to confirm the depth.
- **Real server and ads.**

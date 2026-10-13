# Events

Status: **built, on a stand-in server** (`src/events/`, `src/relics.ts`, `game/event-desk.ts`, `ui/events-page.ts`, `ui/relics-page.ts`, `tests/events.test.ts`).
Events are fortnightly sets of challenges whose missions pay **Medals**; the Medals an event pays count toward its **relics**, unique keepsakes that each give a permanent bonus.
Events open by claiming Tower I's floor 70 Goal (the `events` `GoalUnlock`); nothing counts before then.

## The schedule

- An event lasts **14 days**, from a Monday 00:00 GMT (`eventAt`, `eventStartsAt`, `eventEndsAt` in `events/catalog.ts`), and the next begins as it ends.
  The clock is the server's GMT time as estimated from the Shop's last confirmed time, as the daily missions' is.
- Its missions are released over its first **8 days**: **7** on the first day, then **2** more on each of the next 7, **21** in all (`releasedBy`, `nextReleaseAt`).
  The last 6 days bring none, leaving time to finish them.
- Missions stay until the event ends; a new event starts over with new missions (Medals already claimed are kept).
- A player who opens Events mid-event gets the missions released so far.

## Missions

Every mission has **3 tiers**, each a higher target paying more Medals: **10, 15 and 20** (`TIER_MEDALS`).
A tier done waits to be claimed: its mission's bar reads *Claim*, and pressing it pays every tier done and not yet claimed into `save.medals` (`EventDesk.claim`; each mission's `claimed` counts its tiers claimed).
Nothing is claimed for the player, before or on opening the Events screen.
Medals left unclaimed when the event ends come as Mail (`event:<id>`, sent as it ended, doubled if boosted), and count toward its relics as if claimed; until the event server sends it, the stand-in posts it to `save.mail.stub` as the next event starts (`TODO(server)`).
A save from before claims counts its tiers done as claimed, as they were paid.
Progress is a running tally across runs; three missions (`best`) keep the most reached at once instead: a floor, or a streak.

Every event opens with four fixed missions (`FIXED_MISSIONS`), in this order:

| Mission | Tiers | What counts |
|---|---|---|
| Log in on X days | 7, 10, 13 | each GMT day the game runs during the event, once |
| Claim the Shop's free Gems X times | 7, 10, 13 | each Daily Free Gems claim |
| Take part in X tournaments | 1, 2, 3 | each tournament entered, once a tournament |
| Buy X badges | 20, 40, 80 | each badge drawn; completes outright once every badge is owned and maxed |

The rest are drawn among (`DRAWN_MISSIONS`):

| Mission | Tiers | What counts |
|---|---|---|
| Defeat X base enemies | 5k, 20k, 90k | weak and normal kills, once a tile |
| Defeat X strong enemies | 1k, 5k, 20k | once a tile |
| Defeat X elite enemies | 500, 2.5k, 10k | once a tile |
| Defeat X bosses | 150, 500, 2,500 | bosses and Greater Bosses, once a tile |
| Reach floor X in any tower | 500, 1,000, 1,500 | the highest Tower floor reached (`best`) |
| Tap X floating Gems | 12, 24, 50 | each floor Gem collected, tapped or stepped on |
| Complete X Training upgrades | 50, 150, 400 | each rank bought with training points or finished by a trainer |
| Take no damage for X floors in a row | 100, 250, 500 | the run's floors climbed without fight damage in a row (`best`) |
| Obtain X Equipment pieces | 40, 80, 150 | boss drops (auto-salvaged included) and Gem pulls; merging doesn't count |
| Obtain X Equipment by merging | 10, 20, 40 | each merge |
| Claim ad Gems X times | 10, 25, 60 | each ad Gems claim, with Ad-Disable too |
| Obtain X potions | 2k, 10k, 30k | once a tile |
| Obtain X chests | 200, 1k, 3k | treasure chests opened, once a tile |
| Land X critical hits | 2k, 40k, 3M | each critical strike of the hero's, several on one enemy counting |
| Get X free upgrades | 3k, 6k, 15k | each level Free Training gives |
| Earn max Interest X floors in a row | 60, 300, 500 | the run's floors in a row paying the most Interest (`best`) |

- **Once a tile:** kills and pickups are keyed by mode and loot key (`save.events.counted`), so undo bringing a tile back never counts it twice.
- **Streaks** (`save.events.streaks`) belong to one run (mode and seed) and start over with the next.
  A fight costing HP breaks the floors without damage from the floor it was on; undo doesn't take that back.
  Floors count as each is climbed for the first time in the run, a floor Skip climbs past included; the Delve counts its equivalent floors.
- Tournament runs count like any other.

### The stand-in

The event server will say each event's name, banner, missions and the day each is released, and the relics its milestones give (`TODO(server)` at `stubEvent` in `events/catalog.ts`).
Until then:

- Each event is named by its first day: *Event of 5 Oct 2026*.
- Missions are drawn at random from the table above (`EventDesk.release`), each kind at most once an event, from a stream saved with the profile (`save.events.rng`, seeded once from `stream("events")`), so a reload never redraws them.
- Only what the player can work on now is drawn: strong and elite enemies once their first floor is reached (as the daily missions do), Equipment and merging once Equipment is open, critical hits with Critical, free upgrades with Free Training, max Interest with Interest.
  With 16 kinds to draw from and 17 places to fill, an event can't hold all 21 yet, and a player with fewer kinds open gets fewer; a place left empty fills as soon as a kind opens.
- The relics are placeholders (`STUB_MILESTONES`, `relic: null`) and join no one's relics.

## Relics and the track

The Medals an event's missions have paid (the tiers claimed) count toward its relics (`relicMedals`); Medals carried over, or from the weekly mission rewards, never do.
Reaching a milestone wins its relic at once, without spending anything:

| Milestone | Relic |
|---|---|
| 350 Medals | Relic 1 (rare) |
| 550 Medals | Premium relic 1 (rare), Event Booster only |
| 700 Medals | Relic 2 (epic) |
| 1,100 Medals | Premium relic 2 (epic), Event Booster only |

Relics won are kept for good in `save.relics` (`relics.ts`: `RELICS`, each a name, rarity and bonus; each owned at most once).
**TODO:** no relic is defined yet; relics, their bonuses (such as +2% ATK or +5% Max HP) and their sprites come in a later task, and `grantRelics` will hand them out from the server's milestones.

## The Event Booster

A Shop offer (`eventBoost`, $9.99, sku `event_booster`, sold on the Events page, not the Shop page) bought once each event (`boostRefusal`):

- Doubles every Medal the event pays, those already claimed too (`boostEvent` credits them again), and those claimed or mailed after.
- The doubled Medals count toward the relics.
- Opens the event's two premium relics.

It is real money: until the store is connected it is granted only in Dev mode or with free purchases.
The events boosted are kept by Erase All (`save.events.boosted`), since they were paid for.

## Screens

- **Events button** (`#events-button`, a pennant, `eventIcon` in `ui/dom.ts`): the time the event has left (*7d20h*), with a dot while a mission is new to the Events screen, has a tier to claim, or is finished and hasn't been seen moved under the rest (`EventDesk.waiting`).
  In the forest it stands in the actions column under the Tournament's; inside a run, in the run's menu.
- **Events screen** (`ui/events-page.ts`): an X back to the page that opened it; the banner (the event's name over a placeholder pennant) and the days and hours left; the relic track (a bar filling with the Medals toward the relics, to the last milestone, its relics above and its premium relics below, each lit and checked once won, a premium one locked without the booster); the booster's offer, or that it is active; how many missions are out and when the next come; then the missions.
  Each mission shows what its next tier to claim asks, *X/3* (the tiers claimed) and the Medals that tier pays (doubled once boosted) at the right of its name, and its bar; new ones wear *NEW*.
  Once a tier is done, the mission's border and bar turn gold and the bar reads *Claim* (with the Medals of every tier waiting beside it); pressing it pays them, rising to the middle of the screen (`revealReward`).
  A mission whose third tier is claimed stays where it is for 2 seconds, then slides under the rest (`save.events.moved`).
- **Relics button** (`#relics-button`) in the forest's menu, once Events are open, opens the **Relics screen** (`ui/relics-page.ts`): every relic won, small, in a grid.
  Pressing one, or a mouse resting on it, raises it to the middle of the screen at full size with golden rays and sparkles, its rarity and bonus written under it.
  Dev mode adds two placeholder relics, so the screen can be seen before any relic exists.

### The forest's menu

The hamburger now stands at the top of the forest's actions column too, holding Settings, Missions, Relics and Mail (while there is mail) in one row; the Tournament's and Events' buttons stand under it, always in sight.
Inside a run the menu holds Settings, Research, the Tournament's (once entered), Missions, Events and End Run.

## Future

- The event server: each event's missions, their release days, banner and relics.
- Relic definitions, bonuses and sprites, and their bonuses applied.
- Ways to spend Medals.

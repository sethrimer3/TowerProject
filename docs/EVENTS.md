# Events

Status: **built, on a stand-in server** (`src/events/`, `src/economy/relics.ts`, `relic-catalog.ts`, `relic-effects.ts`, `game/event-desk.ts`, `ui/events-page.ts`, `ui/relics-page.ts`, `tests/events.test.ts`, `tests/event-store.test.ts`).
Events are fortnightly sets of challenges whose missions pay **Medals**; the Medals an event pays count toward its **relics**, unique keepsakes that each give a permanent bonus.
Events open by claiming Tower I's floor 70 Goal (the `events` `GoalUnlock`); nothing counts before then.

## The schedule

- An event lasts **14 days**, from a Monday 00:00 GMT (`eventAt`, `eventStartsAt`, `eventEndsAt` in `events/catalog.ts`), and the next begins as it ends.
  The clock is the server's GMT time as estimated from the Shop's last confirmed time, as the daily missions' is.
- Its missions are released over its first **8 days**: **7** on the first day, then **2** more on each of the next 7, **21** in all (`releasedBy`, `nextReleaseAt`).
  The last 6 days bring none, leaving time to finish them.
- Missions stay until the event ends; a new event starts over with new missions (Medals already claimed are kept).
- A player who opens Events mid-event gets the missions released so far.

## Themes

Every event wears a theme, by the calendar (`events/themes.ts`), which names it.
Each year opens with **New Year**, the event holding 1 January, and the rest follow in this order, one an event, the same every year:

New Year, Blizzard, Lunar New Year, Heartbloom, Aurora, Spring Rain, Jester's Revel, Dragon's Hatchery, Cherry Blossom, Honeycomb, Fairy Ring, Sunken Kingdom, Midsummer, Ember, Sandstorm, Neon, Orbit, Tempest, Crystal Caverns, Autumn Wood, Spider's Lair, Haunted Keep, Arcade, Harvest Feast, Wizard's Tower, Longest Night.

- 26 fortnights make 364 days, so about one year in seven holds a 27th event: the rare **Blue Moon**, just before the next New Year, its relics twice as strong.
- A holiday's event holds its day in most years, a few days either side in the rest.
- The first public event is New Year 2027, from 28 December 2026; events before it count back through the cycle, so none is ever without a theme.

## Missions

Every mission has **3 tiers**, each a higher target paying more Medals: **10, 15 and 20** (`TIER_MEDALS`).
A tier done waits to be claimed: its mission's bar reads *Claim*, and each press pays one tier, the first not yet claimed, into `save.medals` (`EventDesk.claim`; each mission's `claimed` counts its tiers claimed), so a mission past two tiers is claimed twice, the bar showing the next tier ready between them.
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
| Obtain X Equipment pieces | 40, 80, 150 | Equipment Chests' pieces (auto-salvaged included) and Gem pulls; merging doesn't count |
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

- Each event is named by its theme on the calendar.
- Missions are drawn at random from the table above (`EventDesk.release`), each kind at most once an event, from a stream saved with the profile (`save.events.rng`, seeded once from `stream("events")`), so a reload never redraws them.
- Only what the player can work on now is drawn: strong and elite enemies once their first floor is reached (as the daily missions do), Equipment and merging once Equipment is open, critical hits with Critical, free upgrades with Free Training, max Interest with Interest.
  With 16 kinds to draw from and 17 places to fill, an event can't hold all 21 yet, and a player with fewer kinds open gets fewer; a place left empty fills as soon as a kind opens.
- Its milestones give its theme's relics (`STUB_MILESTONES`, `trackRelics`).

## Relics and the track

The Medals an event's missions have paid (the tiers claimed) count toward its relics (`relicMedals`); Medals carried over, or from the weekly mission rewards, never do.
Reaching a milestone wins its relic at once, without spending anything:

| Milestone | Relic |
|---|---|
| 350 Medals | Relic 1 (rare) |
| 550 Medals | Premium relic 1 (rare), Event Booster only |
| 700 Medals | Relic 2 (epic) |
| 1,100 Medals | Premium relic 2 (epic), Event Booster only |

Relics won are kept for good in `save.relics` (each owned at most once).
Each relic has a rarity (`RelicRarity`): an event's first relic of each pair, free and premium, is **rare** and its second **epic**; a Store relic is epic; **legendary** ones come from the towers (below).
Every event theme has four relics: two free and two premium, the second of each pair the stronger.
Their names, what each raises and by how much are all in one place, `economy/relic-catalog.ts` (`RELIC_SETS`), by theme and the year a set begins: a later year can bring a theme new relics by adding a set, the earlier ones staying owned.
Saves keep a relic's id (`<theme>.<year>.<place>`), so names, stats and amounts can be changed freely.
A theme can also sell relics in its event's Store (`STORE_RELICS`, none yet).

### Tower relics

Every tower's last Goal, at floor 4,500, gives two relics (`TOWER_RELICS` in `relic-catalog.ts`, ids `tower.<n>.epic` and `tower.<n>.legendary`): an epic one as its reward and a legendary one as its premium reward.
Each name starts with its tower (*T:I*, *T:II*, …), to remind the player which gave it.

| Tower | Epic | Legendary |
|---|---|---|
| I | Cosmos Sack: +2% Gold Bonus | Spatial Ring: +5% Gold Bonus |
| II | Cosmic Workbench: Archives research 2% faster | Chrono Gate: Archives research 5% faster |
| III | Delver's Cloak: +2% Critical Factor | Auric Lens: +5% Critical Factor |
| IV | Really Big Sword: +2% ATK | Axe of Duality: +5% ATK |
| V | Monster Steaks: +2% Max HP | Orb of All: +5% Max HP |
| VI | Death's Rival: +5% Shroud | Starcloak: +10% Shroud |
| VII | Weapon Aura: +5% ATK / m | Stomping Boots: +10% ATK / m |
| VIII | Lucky Blade: +5% Gold Bonus | Blueprint Engine: +10% Gold Bonus |
| IX | Godshard: +5% Max HP | Mighty Shorts: Parry +2% |

Each raises its stat as a free event relic does (below), except research speed and Parry, which work as the premium effects of those names.

- **Free relics** (and the tower relics on a Training row) raise a Training row's value by their percent: the relics on one row add into one factor, which multiplies everything else on it, so +1% on a 50% stat makes it 50.5%, and a stat can go past what training alone reaches.
  On a row read as a multiplier (Gold Bonus' ×1.5), the bonus over ×1 grows (×1.505).
- **Premium relics** give what training can't: a stat past its cap (Super Critical Chance, Parry, Lifesteal, Multishot Targets), chances (Golden, Treasure and Stellar Floors, a chest's Double or Triple, a potion healing twice, a second free upgrade), cuts (Heart Doors' drain, Wooden Doors' toll, a boss's ATK, Training's cost) or more of something (Arcana, Overheal, Revive's HP, Interest's cap, research and trainer speed, materials, XP, Arcanite).
  Their texts and where each applies are in `economy/relic-effects.ts` (`RELIC_SPECIALS`); a boss's ATK cut and the shroud's share on later strikes count in every fight's prediction and its playback alike.
- A relic's Gold Bonus is its own factor, apart from the Event Collection's.

## The Event Booster

A Shop offer (`eventBoost`, $9.99, sku `event_booster`, sold on the Events page, not the Shop page) bought once each event (`boostRefusal`):

- Doubles every Medal the event pays, those already claimed too (`boostEvent` credits them again), and those claimed or mailed after.
- The doubled Medals count toward the relics.
- Opens the event's two premium relics.

It is real money: until the store is connected it is granted only in Dev mode or with free purchases.
The events boosted are kept by Erase All (`save.events.boosted`), since they were paid for.

## The Store

The Events screen has two tabs: **Missions** (the relic track, the booster and the missions) and **Store**, which sells for Medals (`events/store.ts`):

- **Currencies**: 150 Gems and 15 Arcanite on one row, 40 Medals each; then one box an Equipment supply, 250 for 30 Medals.
  Each bought raises its price (25 Medals for Gems and Arcanite, 5 for a supply), until the next event starts every price over (`save.events.bought`).
- **Themes**: one UI theme (250 Medals) and one Game theme (450 Medals), each bought once for good, adding +1% and +2% to all Gold banked (the *Event Collection*).
  An event named as a theme features that theme, and no other event does; the others take turns, each kind on its own, one an event.
  A theme added later joins the turns from its `since` day on, leaving what earlier events featured as it was.
- **Music**: bonus tracks, sold in every event, each joining the play sequence for good and adding +0.8% to all Gold banked (`events/music.ts`).
  None yet: the section reads *Come back in the future for new songs!*
- Classic, each kind's free look, is every hero's from the start and pays nothing.
- A price short of Medals turns red; pressing it says the missions pay more.

## Screens

- **Events button** (`#events-button`, a pennant, `eventIcon` in `ui/dom.ts`): the time the event has left (*7d20h*), with a dot while a mission is new to the Events screen, has a tier to claim, or is finished and hasn't been seen moved under the rest (`EventDesk.waiting`).
  In the forest it stands in the actions column under the Tournament's; inside a run, in the run's menu.
- **Events screen** (`ui/events-page.ts`): an X back to the page that opened it; the currencies bar over it, as over the Upgrades page; the banner (the event's name over a placeholder pennant) and the days and hours left; the Missions and Store tabs (see The Store above), Missions first each time the screen opens, holding the relic track (a bar filling with the Medals toward the relics, to the last milestone, and reading the Medals won, its free relics above and its Event Boost relics below, each row named on its left, each relic lit and checked once won, a premium one locked without the booster, and each pressed, or a mouse resting on it, showing its name and bonus as the Relics screen does); the booster's offer, or that it is active; how many missions are out and when the next come; then the missions.
  Each mission shows what its next tier to claim asks, *X/3* (the tiers claimed) and the Medals that tier pays (doubled once boosted) at the right of its name, and its bar; new ones wear *NEW*.
  Once a tier is done, the mission's border and bar turn gold and the bar reads *Claim* followed by that tier's Medals and the Medal icon (shown there instead of beside the tier count); pressing it pays them, flying from the bar to the Medals in the banner, which count them as they land (`flyToPurse`), nothing to press away, and the mission already shows its next tier, *Claim* again if that one is done too.
  A mission whose third tier is claimed stays where it is for 2 seconds, then slides under the rest (`save.events.moved`).
- **Relics button** (`#relics-button`) in the forest's menu, once Events are open or a relic is owned, opens the **Relics screen** (`ui/relics-page.ts`): a section for each rarity (Rare, Epic, Legendary), each with a grid of the relics of that rarity won, small (*None yet.* while it has none).
  Pressing one, or a mouse resting on it, raises it to the middle of the screen at full size with golden rays and sparkles, only its name and bonus written under it (`ui/relic-pop.ts`, shared with the Events screen's track and the Goals page).
  The **?** beside the title says that every relic's bonus stacks and that relics come from progress in the towers' Goals and in limited-time Events, over a table of the relics owned's bonuses totalled by stat, with how many relics give each (`relicTotals`).
  Dev mode adds New Year's and Tower I's relics as placeholders, so the screen can be seen before any relic is won.

### The forest's menu

The hamburger now stands at the top of the forest's actions column too, holding Settings, Missions, Relics and Mail (while there is mail) in one row; the Tournament's and Events' buttons stand under it, always in sight.
Inside a run the menu holds Settings, Research, the Tournament's (once entered), Missions, Events and End Run.

## Future

- The event server: each event's missions, their release days, banner and relics.
- Relic sprites of their own, for the Relics screen and the Events screen; until then the legendary pendant is the epic one turned gold (`.relic-legendary`).
- The bonus tracks, and the music that plays them.

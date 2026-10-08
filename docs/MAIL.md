# Mail (plan)

Status: **the client is built** (the Tournament change; the rules, save, stub server and client, `src/mail/`, `game/mail-desk.ts`, `tests/mail.test.ts`; the button and popup, `ui/mail-dialog.ts`; the goldens). What is left is on the server, and a few choices before launch: see Future, below. This is the design and build order for **Mail**: messages the game server pushes to a player, each with a subject line, body text, and possibly items to claim.

Examples:

- **Outage notice:** after a brief systemic issue, every player gets *We're sorry about this morning's outage* with 20 Gems as compensation.
- **Missed Tournament prize:** if a player doesn't claim their Tournament prize within its 24 hours, the server pushes it to them as Mail instead. The Tournament page then shows only when the next tournament opens, never *Rewards expired*.

## Summary

- The server owns a player's Mail. The client fetches the inbox, shows it, and claims items through the server, which grants each message's items once. Like Tournament prizes, a forged save can change what the game shows, but not what the server grants.
- **Recent mail** is any message that the player hasn't removed and that was either sent in the last **7 days** (`MAIL_DAYS`) or still holds unclaimed items. A message with unclaimed items stays until they are claimed, or until **90 days** after it was sent (`MAIL_KEEP_DAYS`), the upper bound on how long any message is kept, by the server and the save alike. Time is the server's, from the Shop's confirmed clock.
- **Mail button:** an envelope in the forest's actions column, under Settings. It shows only while the player has recent mail, and wears a dot while any of it is unread.
- **Mail list:** a popup listing the recent messages, newest first. Each row shows its subject, with a dot while unread, a gift box while its items wait to be claimed, and an X to remove it once nothing waits.
- **Message view:** the subject, the body, and each item's icon and amount. While items wait, the view shows *Claim*. Opening a message marks it read.

## What a message holds

```ts
type MailItem =
  | { kind: "currency"; currency: CurrencyId; amount: number }  // Gems, Ascension Shards, Gold
  | { kind: "tickets"; amount: number }                          // Tournament Tickets
  | { kind: "unknown" };                                         // a kind this client doesn't know

type MailMessage = {
  id: string;          // the server's, unique; a missed Tournament prize is `tournament:2026-10-07`
  sentAt: number;      // server time (ms)
  subject: string;     // plain text, one line
  body: string;        // plain text; blank lines separate paragraphs
  items: MailItem[];   // may be empty
  read: boolean;       // as the server last reported it
  claimed: boolean;
};
```

- **Text is plain:** the client escapes it, so a message can't inject markup into the page.
- **Item kinds:** a new kind of item (materials, Equipment, a card) is one more case in `MailItem` and in its grant.
- **Unknown kinds:** an item of a kind this client doesn't know decodes as `{ kind: "unknown" }` and still lists, as *Update the game to claim this reward*. While it waits, *Claim* is refused for the whole message without asking the server, so nothing is half-claimed, and it can't be removed either. The server keeps the message, so the player can claim it after updating.
- **Malformed messages:** the server's answers are decoded like the save (`decodeMessage`): a message with a malformed field or item is dropped whole, and subject and body are cut to 200 and 4,000 characters.

## Behaviour

**Which messages show** (`MailDesk.recent`): not removed, and either sent within `MAIL_DAYS` of the server's time now, or holding unclaimed items and sent within `MAIL_KEEP_DAYS`. Past 90 days a message is gone, claimed or not. The list is newest first. Once nothing is recent, the Mail button is gone.

**Unread and the dots:**

- A message is unread until its view has been opened.
- The Mail button wears a dot while any recent message is unread. In the list, each unread row wears its own.
- Claiming isn't needed to clear a dot. A row still holding items shows a gift box icon (`giftIcon()`) beside its subject, whether read or not, so a reward waiting is plain to see.

**Claiming** (`MailClient.claim(id)`; a second press while one is under way asks nothing):

1. The client asks the server to claim the message.
2. The server answers with the items it granted, or nothing: offline, already claimed, or expired.
3. `MailDesk.grant` credits the items (currencies through `CURRENCIES[c].credit`, Tickets into `save.tournament.tickets`) and records the id in `save.mail.claimed`.
4. The id is recorded before the next claim is asked, so a retry or a replayed answer never grants twice.
5. The reward rises with `revealReward` (`mailShown`: the first item, the rest written under its name, as a bundle shows), kicker *MAIL*.
6. After a claim, the view shows the items with a check over each, and *Claimed*.
7. If the claim fails, the view keeps *Claim* and says *Couldn't reach the server — try again later*.

**Removing** (the row's X):

- The message is hidden from the list at once (`save.mail.hidden`), and the client tells the server (`hide(id)`) so it stays hidden on the player's other devices.
- A message with unclaimed items has no X: it can only be claimed, so no reward is ever thrown away. `MailDesk.hide` refuses one too, and so does the server.
- Removing the last recent message closes the popup, and the button disappears.

**Where:** only the forest, since the button stands in its actions column, so Mail never opens inside a run. A claim credits the save directly, so a claim made in the forest needs nothing from a run.

**When the client asks the server** (`refreshMail` in `main.ts`, beside `refreshTournament`):

- as the app starts;
- as the player arrives in the forest (a run ends, or a page returns to the board);
- as the Mail popup opens;
- every 5 minutes while in the forest (`MailClient.POLL_MS`);
- whenever the Tournament's phase changes, since a missed prize is pushed as its Results end.

A failed fetch keeps the last inbox (saved), so the list still reads offline. Only claiming needs the server.

## The Tournament change

Once a tournament's claim window closes, the Tournament page and HUD show only when the next tournament opens, whether or not the prize was claimed:

- `TournamentPage.standing()` returns the next tournament's top prize when the phase is upcoming. There is no *Last tournament* block and no *Rewards expired*.
- The Results phase already ends in `upcoming` (`phaseOf`).
- `docs/TOURNAMENT.md`'s page item 6 and its Future item *Server-pushed prizes* point here.

The missed prize comes as Mail:

- **id** `tournament:<id>`
- **subject** *Your Tournament prize*
- **body** the date, the final place and league (*Wednesday 7 October · 12th of 1,000 in the Copper League*), and that the prize waits here.
- **items** the prize level's Gems and Ascension Shards.

The server sends it only once the window has closed, and refuses the Tournament claim from then on, so a prize is claimable in exactly one place.

## The server (stubbed)

`src/mail/server.ts`:

```ts
interface MailServer {
  /** The server's time and the player's messages (kept and not removed), or null when unreachable. */
  inbox(): Promise<{ time: number; messages: unknown[] } | null>;
  /** Grants message `id`'s items once; returns them, or null when refused or unreachable. */
  claim(id: string): Promise<unknown[] | null>;
  /** Records messages as read, or one as removed, on the player's profile. */
  markRead(ids: string[]): Promise<boolean>;
  hide(id: string): Promise<boolean>;
}
```

The inbox carries the server's time, which the desk confirms as the Shop's clock, so the 7 and 90 days are counted on the server's clock.

`stubMail(save, now)` stands in until the server exists. Its mailbox is kept in the player's save (`save.mail.stub`), so what it has sent stays sent:

- **Tournament mail:** each tournament entered whose claim window has closed unclaimed is posted once, as the window closes. The final place comes from `stubResults` in `tournament/server.ts`, which the Tournament stand-in uses too.
- **Dev mail:** `postStubMail(save, { subject, body, items }, now)`, which the `mailDebug.send({ subject, body, items }?)` console helper (`debug-hooks.ts`; with nothing given, `OUTAGE_MAIL`) calls, so the screens can be tried end to end, the outage message included.
- **Read, claimed and removed:** recorded on each message in its mailbox; mail past its time is dropped from it, as the server will.

## Save

`save.mail` (in `defaults()`, the `Save` type and `decodeMail`, read through `src/decode.ts`'s readers):

| Field | Holds |
|---|---|
| `inbox` | the messages the server last reported (each decoded field by field; unknown item kinds kept as `{ kind: "unknown" }`), read and claimed as known here |
| `unsynced` | `{ read, hidden }`: ids opened and removed here that the server hasn't confirmed; each is kept only while the server still reports it otherwise, and sent again on the next refresh |
| `claimed` | ids granted here: no grant is ever made for one twice, whatever the server says |
| `stub` | the stand-in's mailbox (empty once a real server answers) |

Mail past its time (`kept`) is dropped from the inbox as the server's next answer comes in, and no list keeps more than 200 ids (`MAIL_IDS_KEPT`), so what is stored stays bounded. Erasing progress (`eraseAll`) keeps `save.mail`, since Mail is the server's.

## Screens

- **Mail button:** `#mail-button`, the envelope (`mailIcon()` in `ui/dom.ts`) over *MAIL*, inserted after Settings (`#run-menu`) in the forest's actions column. Its state comes from `renderMailButton` in `ui/hud.ts`: hidden inside a run or with no recent mail, with a dot (`notify`) while any is unread. Check that the column still fits at phone height (360×640) with the Tournament button, Settings and Mail.
- **Mail popup** (`ui/mail-dialog.ts`, `MailDialog`, in the shared dialog):
  - **List:** *INBOX* over *Mail*, and *Close* at the foot. One row a message: the unread dot, the subject (ellipsized), the gift box while items wait, and how long ago it came (*now*, *5m*, *2h*, *3d*). A row with nothing to claim has its own X button; one with unclaimed items has none.
  - **Message:** *MAIL* and the date it was sent (*5 October 2026 at 12:00 GMT*), the subject, and the body as paragraphs. Then the items, each item's icon (`gemIcon`, `shardIcon`, `goldIcon`, `ticketIcon`), amount and name, with a check once claimed. Then *Back* to the list and *Claim*, or *Claimed*. While claiming, *Claiming…*; if it fails, *Couldn't reach the server. Try again later.*
  - Claiming closes the dialog for the reward's reveal, and pressing the reveal away opens it again on the message, now claimed.
  - The phone's Back closes the message view, then the popup.
  - Every word from the server is escaped (`escapeHtml` in `ui/dom.ts`).

## Modules

| Where | What |
|---|---|
| `src/mail/message.ts` | `MailMessage`, `MailItem`, `MAIL_DAYS`, `MAIL_KEEP_DAYS`, `recent`, item grants |
| `src/mail/progress.ts` | `save.mail`, `decodeMail` |
| `src/mail/server.ts` | `MailServer`, `stubMail` |
| `src/mail/client.ts` | `MailClient`: fetching, claiming, syncing read and removed |
| `src/game/mail-desk.ts` | `MailDesk` (the game's `mail`): recent, unread, open, grant, hide |
| `src/tournament/*`, `ui/tournament-page.ts` | no *Rewards expired*; the missed prize's message |
| `src/ui/hud.ts`, `ui/shell.ts`, `ui/dom.ts` | the button, its dot, the envelope and gift box icons |
| `src/ui/mail-dialog.ts` | the list and the message view |
| `src/ui/reward-reveal.ts` | `mailShown` |
| `src/main.ts`, `ui/debug-hooks.ts` | `refreshMail`; `mailDebug` |
| `tests/mail.test.ts` | decode; the 7-day window, unclaimed items kept to 90 days and dropped after; unread and dots; claim once (retried, replayed, offline); unknown kinds refused; removing, refused with unclaimed items; the Tournament's missed-prize message appearing exactly when its claim window closes and never beside a Tournament claim |

`CONTEXT.md` gains *Mail* and *Message*; `AGENTS.md` and the README's overview gain Mail.

## Build order

1. **Tournament: no *Rewards expired*** (built). The page shows only the next opening once the claim window closes.
2. **Rules without screens** (built): the message and item types, `save.mail` and its decoder, `MailDesk`, `MailServer` and `stubMail` (with the Tournament's missed prize), `MailClient`, and `tests/mail.test.ts`.
3. **Screens** (built): the button and its dot, the popup's list and message view, claiming with its reveal, removing with its confirmation, `refreshMail`'s timing, and `mailDebug`.
4. **Goldens and docs** (built):
   - **Goldens:** `ui.golden.json`'s `mail` fixture: a forest whose stand-in mailbox holds an unread outage notice with 20 Gems and yesterday's notice, read, with nothing to claim; the button and dot (`mail.forest`), the list with the gift box and the notice's X (`mail.list`), the message (`mail.message`), the reveal (`mail.reveal`), the message claimed (`mail.claimed`), the list with an X on each (`mail.listAfter`), one removed (`mail.removed`), and both, the button gone (`mail.forestAfter`). (`save-decode`'s `mail` base, with its hostile values, came with step 2.)
   - **Docs:** AGENTS.md, the README, CONTEXT.md and `docs/TOURNAMENT.md`.

## Future (TODO)

**Needed before Mail works for real players** (all on the server; the client changes only `src/mail/server.ts`):

- **Connect the client:** a `MailServer` that calls the game server, in place of `stubMail`. `save.mail.stub` then stays empty; `postStubMail` and `mailDebug` stay for Dev use or go.
- **The mailbox:** each player's messages with their read, claimed and removed state, as the interface describes:
  - send only what is kept (`kept`: under 90 days, and under 7 unless items wait), and drop the rest, so storage stays bounded;
  - grant a message's items once, atomically, even for two claims at once (the client guards too, `save.mail.claimed`, but only the server's grant counts);
  - refuse to remove a message whose items wait;
  - take read and removed ids again without harm, since the client resends what it hasn't heard confirmed (`unsynced`).
- **Missed Tournament prizes:** as a tournament's claim window closes (`CLAIM_MS` after finalization), post each entrant's unclaimed prize as the message `tournament:<id>` (subject, body and items as `postMissedPrizes` in `stubMail` writes them), and refuse the Tournament's own claim from then on, so a prize is claimable in exactly one place. `tests/mail.test.ts` pins this behaviour against the stand-in.
- **Sending mail:** an admin tool to write a message to every player or a chosen group (by league, app version, or a list of players), such as the outage notice with its Gems.

**To decide before launch:**

- **Version gate:** an item of a kind the client doesn't know shows *Update the game to claim this reward* and holds its message back until the update. If the client sends its app version with `inbox()`, the server could hold such messages back instead, or send a note to update. This goes with the Tournament's version gate (`docs/TOURNAMENT.md`, Future), which stamps the build's version.
- **Push rather than poll:** the client asks for the inbox at start-up, on arriving in the forest, every 5 minutes there (`MailClient.POLL_MS`), as the popup opens and as the Tournament's phase changes. A push from the server (a socket, or a store notification) would bring mail at once; the poll is enough for outage notices and missed prizes.

**Later, if wanted:**

- **More item kinds:** materials, Equipment pieces or cards. Each is a case in `MailItem` and `decodeItem` (`mail/message.ts`), its grant in `MailDesk.grant`, its icon in `ui/mail-dialog.ts` and its reveal in `mailShown`.
- **Mail inside a run:** none for now (decided below); the button could join the run's menu, as the Tournament button does.

## Decisions

- **Button dot:** shows while any recent message is unread.
- **Unclaimed rewards:** the message stays until they are claimed, or 90 days after it was sent, the bound on stored mail.
- **Removing:** only a message with nothing left to claim has an X; unclaimed ones wear a gift box instead.
- **Mail inside a run:** none; the button is the forest's.

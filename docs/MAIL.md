# Mail (plan)

Status: **planned, nothing built.** This is the design and build order for **Mail**: messages the game server pushes to a player, each with a subject line, body text, and possibly items to claim.

Examples:

- **Outage notice:** after a brief systemic issue, every player gets *We're sorry about this morning's outage* with 20 Gems as compensation.
- **Missed Tournament prize:** if a player doesn't claim their Tournament prize within its 24 hours, the server pushes it to them as Mail instead. The Tournament page then shows only when the next tournament opens, never *Rewards expired*.

## Summary

- The server owns a player's Mail. The client fetches the inbox, shows it, and claims items through the server, which grants each message's items once. Like Tournament prizes, a forged save can change what the game shows, but not what the server grants.
- **Recent mail** is any message sent in the last **7 days** (`MAIL_DAYS`) that the player hasn't removed. Time is the server's, from the Shop's confirmed clock.
- **Mail button:** an envelope in the forest's actions column, under Settings. It shows only while the player has recent mail, and wears a dot while any of it is unread.
- **Mail list:** a popup listing the recent messages, newest first. Each row shows its subject, with a dot while unread and an X to remove it.
- **Message view:** the subject, the body, and each item's icon and amount. While items wait, the view shows *Claim*. Opening a message marks it read.

## What a message holds

```ts
type MailItem =
  | { kind: "currency"; currency: CurrencyId; amount: number }  // Gems, Ascension Shards, Gold
  | { kind: "tickets"; amount: number };                         // Tournament Tickets

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
- **Unknown kinds:** an item of a kind this client doesn't know still lists, as *Update the game to claim this reward*. While it waits, *Claim* is refused for the whole message, so nothing is half-claimed. The server keeps the message, so the player can claim it after updating.

## Behaviour

**Which messages show** (`MailDesk.recent`): sent within `MAIL_DAYS` of the server's time now, and not removed. The list is newest first. Once nothing is recent, the Mail button is gone.

**Unread and the dots:**

- A message is unread until its view has been opened.
- The Mail button wears a dot while any recent message is unread. In the list, each unread row wears its own.
- Claiming isn't needed to clear a dot. A row still holding items shows a small gift marker beside its subject, without a dot.

**Claiming** (`MailClient.claim(id)`):

1. The client asks the server to claim the message.
2. The server answers with the items it granted, or nothing: offline, already claimed, or expired.
3. `MailDesk.grant` credits the items (currencies through `CURRENCIES[c].credit`, Tickets into `save.tournament.tickets`) and records the id in `save.mail.claimed`.
4. The id is recorded before the next claim is asked, so a retry or a replayed answer never grants twice.
5. The reward rises with `revealReward` (`mailShown`: the first item, the rest written under its name, as a bundle shows), kicker *MAIL*.
6. After a claim, the view shows the items with a check over each, and *Claimed*.
7. If the claim fails, the view keeps *Claim* and says *Couldn't reach the server — try again later*.

**Removing** (the row's X):

- The message is hidden from the list at once (`save.mail.hidden`), and the client tells the server (`hide(id)`) so it stays hidden on the player's other devices.
- A message whose items are unclaimed asks first: *This message's rewards haven't been claimed. Remove it anyway?* The rewards are then lost.
- Removing the last recent message closes the popup, and the button disappears.

**Where:** only the forest, since the button stands in its actions column, so Mail never opens inside a run. A claim credits the save directly, so a claim made in the forest needs nothing from a run.

**When the client asks the server** (`refreshMail` in `main.ts`, beside `refreshTournament`):

- as the app starts;
- as the player arrives in the forest (a run ends, or a page returns to the board);
- as the Mail popup opens;
- every 5 minutes while in the forest (`MAIL_POLL_MS`);
- when the Tournament's Results phase ends for a tournament the player entered and didn't claim, since the server pushes the missed prize then.

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
  /** The player's messages (recent and not removed), or null when unreachable. */
  inbox(): Promise<MailMessage[] | null>;
  /** Grants message `id`'s items once; returns them, or null when refused or unreachable. */
  claim(id: string): Promise<MailItem[] | null>;
  /** Records messages as read, or one as removed, on the player's profile. */
  markRead(ids: string[]): Promise<boolean>;
  hide(id: string): Promise<boolean>;
}
```

`stubMail(save, tournament)` stands in until the server exists, and like `stubTournament` it keeps nothing itself:

- **Tournament mail:** for each tournament entered whose claim window has closed unclaimed, it makes the missed-prize message. It works out the final place from `stubField`, as the Tournament stub does.
- **Dev mail:** messages written into the save by the `mailDebug.send({ subject, body, items })` console helper (`debug-hooks.ts`), so the screens can be tried end to end, the outage message included.
- **Read, claimed and removed:** taken from the player's own record.

## Save

`save.mail` (in `defaults()`, the `Save` type and `decodeMail`, read through `src/decode.ts`'s readers):

| Field | Holds |
|---|---|
| `inbox` | the messages the server last reported (each decoded field by field; unknown item kinds kept as `{ kind: "unknown" }`) |
| `read` | ids opened, until the server reports them read |
| `claimed` | ids claimed: no grant is ever made for one twice |
| `hidden` | ids removed |
| `dev` | Dev mail the stub reports (empty outside Dev use) |

Ids older than `MAIL_DAYS` are dropped as the save loads, so the lists stay short.

## Screens

- **Mail button:** `#mail-button`, the envelope (`mailIcon()` in `ui/dom.ts`) over *MAIL*, inserted after Settings (`#run-menu`) in the forest's actions column. Its state comes from `renderMailButton` in `ui/hud.ts`: hidden inside a run or with no recent mail, with a dot (`notify`) while any is unread. Check that the column still fits at phone height (360×640) with the Tournament button, Settings and Mail.
- **Mail popup** (`ui/mail-dialog.ts`, `MailDialog`, in the shared dialog):
  - **List:** *Mail* with a close X. One row a message: the unread dot, the subject (ellipsized), the gift marker, and how long ago it came (*2h*, *3d*). Each row has its own X button.
  - **Message:** a Back arrow to the list, the subject, the date, and the body as paragraphs. Then the items row, each item's icon (`gemIcon`, `shardIcon`, `goldIcon`, `ticketIcon`) and amount. Then *Claim*, or *Claimed*.
  - The phone's Back closes the message view, then the popup.

## Modules

| Where | What |
|---|---|
| `src/mail/message.ts` | `MailMessage`, `MailItem`, `MAIL_DAYS`, `recent`, item grants |
| `src/mail/progress.ts` | `save.mail`, `decodeMail` |
| `src/mail/server.ts` | `MailServer`, `stubMail` |
| `src/mail/client.ts` | `MailClient`: fetching, claiming, syncing read and removed |
| `src/game/mail-desk.ts` | `MailDesk` (the game's `mail`): recent, unread, open, grant, hide |
| `src/tournament/*`, `ui/tournament-page.ts` | no *Rewards expired*; the missed prize's message |
| `src/ui/hud.ts`, `ui/shell.ts`, `ui/dom.ts` | the button, its dot, the envelope icon |
| `src/ui/mail-dialog.ts` | the list and the message view |
| `src/ui/reward-reveal.ts` | `mailShown` |
| `src/main.ts`, `ui/debug-hooks.ts` | `refreshMail`; `mailDebug` |
| `tests/mail.test.ts` | decode; the 7-day window; unread and dots; claim once (retried, replayed, offline); unknown kinds refused; removing, with unclaimed items; the Tournament's missed-prize message appearing exactly when its claim window closes and never beside a Tournament claim |

`CONTEXT.md` gains *Mail* and *Message*; `AGENTS.md` and the README's overview gain Mail.

## Build order

1. **Tournament: no *Rewards expired*.** The page shows only the next opening once the claim window closes. Its tests and the UI golden's affected keys are updated. This is independent of the rest and could ship first.
2. **Rules without screens:** the message and item types, `save.mail` and its decoder, `MailDesk`, `MailServer` and `stubMail` (with the Tournament's missed prize), `MailClient`, and `tests/mail.test.ts`.
3. **Screens:** the button and its dot, the popup's list and message view, claiming with its reveal, removing with its confirmation, `refreshMail`'s timing, and `mailDebug`.
4. **Goldens and docs:**
   - **Goldens:** `ui.golden.json` gets a `mail` fixture (a forest with an unread outage message: the button and dot, the list, the message, the claim, the reveal, a second message removed, the button gone). `save-decode` gets a `mail` base with its hostile values.
   - **Docs:** AGENTS.md, the README, CONTEXT.md and `docs/TOURNAMENT.md`.

## Open questions (defaults chosen above)

- **Button dot:** it shows while any message is **unread**. Alternatively, it could clear as soon as the list is opened, leaving only the rows' dots.
- **Unclaimed rewards after 7 days:** the message disappears with them. Alternatively, a message with unclaimed items could stay until claimed.
- **Removing a message with unclaimed items:** it asks first. Alternatively, X could be refused until the items are claimed.
- **Mail inside a run:** none, since the button is the forest's. It could join the run's menu like the Tournament button.

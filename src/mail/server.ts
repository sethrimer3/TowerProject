import type { Save } from "../entities.ts";
import { DAY_MS } from "../shop/clock.ts";
import { LEAGUE_INFO } from "../tournament/leagues.ts";
import { prizeFor } from "../tournament/prizes.ts";
import { CLAIM_MS, tournamentById } from "../tournament/schedule.ts";
import { stubResults } from "../tournament/server.ts";
import { kept, MAIL_KEEP_DAYS, waiting, type MailItem, type MailMessage } from "./message.ts";
import { MAIL_IDS_KEPT } from "./progress.ts";

// Mail's server, as the game sees it. It is stubbed for now: the interface
// is everything Mail asks of the outside world, so connecting the real
// server later changes only this file. Its answers are untrusted: the
// client decodes them (`decodeMessage`, `decodeItem`).

export interface MailServer {
  /** The server's time now and the player's messages (kept and not
   * removed), or null when it can't be reached. */
  inbox(): Promise<{ time: number; messages: unknown[] } | null>;
  /** Grants message `id`'s items, once; returns them, or null when refused
   * (claimed already, removed, past its time) or unreachable. */
  claim(id: string): Promise<unknown[] | null>;
  /** Records messages as read on the player's profile; true once done. */
  markRead(ids: string[]): Promise<boolean>;
  /** Records a message as removed; refused (false) while items in it wait
   * to be claimed. */
  hide(id: string): Promise<boolean>;
}

/** What the stand-in posts: a message's subject, body and items. */
export type MailDraft = { subject: string; body: string; items: MailItem[] };

/** Posts `draft` to the stand-in's mailbox (Dev mail, from `mailDebug`). */
export function postStubMail(save: Save, draft: MailDraft, now: number) {
  const stub = save.mail.stub;
  stub.push({ ...draft, id: `dev:${now}:${stub.length}`, sentAt: now, read: false, claimed: false, hidden: false });
  save.mail.stub = stub.slice(-MAIL_IDS_KEPT);
}

/** The GMT date a tournament opened, as a message writes it: *Wednesday 7 October*. */
const tournamentDate = (id: string) =>
  new Date(Date.parse(id)).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** Posts to the stand-in's mailbox the prize of each tournament the player
 * entered and left unclaimed past its claim window, once, as the server
 * will: from then on the Tournament refuses the claim, so a prize is
 * claimable in exactly one place. */
function postMissedPrizes(save: Save, now: number) {
  const results = stubResults(() => save.tournament, () => now), stub = save.mail.stub;
  for (const [id, e] of Object.entries(save.tournament.entries)) {
    const at = results.finalizedAt(tournamentById(id)), mailId = `tournament:${id}`;
    if (at === null || save.tournament.claimed.includes(id) || stub.some((m) => m.id === mailId)) continue;
    const sentAt = at + CLAIM_MS;
    if (now < sentAt || now - sentAt >= MAIL_KEEP_DAYS * DAY_MS) continue;
    const league = results.leagueFor(id), st = results.standing(id, e.best), prize = prizeFor(league, st.place, st.entrants);
    stub.push({
      id: mailId, sentAt, read: false, claimed: false, hidden: false,
      subject: "Your Tournament prize",
      body: `${tournamentDate(id)} · ${st.place.toLocaleString("en-US")}${ordinal(st.place)} of ${st.entrants.toLocaleString("en-US")} in the ${LEAGUE_INFO[league].name} League.\n\nYour prize wasn't claimed in time, so here it is.`,
      items: [{ kind: "currency", currency: "shards", amount: prize.shards }, { kind: "currency", currency: "gems", amount: prize.gems }],
    });
  }
}

/** `1st`, `2nd`, `3rd`, `4th` … `11th`, `21st`: the suffix alone. */
function ordinal(n: number) {
  const ten = n % 100;
  return ten >= 11 && ten <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
}

/** The stand-in until the server exists. Its mailbox is kept in the
 * player's save (`save.mail.stub`), with Dev mail posted there by
 * `mailDebug` and each tournament prize left unclaimed posted as its claim
 * window closes. It answers on `now` (the device clock).
 * TODO: call the game server instead, once it keeps each player's mailbox,
 * posts unclaimed Tournament prizes and refuses the Tournament's claim
 * after (docs/MAIL.md, Future). */
export function stubMail(save: () => Save, now: () => number = Date.now): MailServer {
  /** The mailbox, with mail past its time dropped, as the server will. */
  const box = () => {
    const s = save(), t = now();
    postMissedPrizes(s, t);
    s.mail.stub = s.mail.stub.filter((m) => kept(m, t));
    return s.mail.stub;
  };
  const strip = ({ hidden: _, ...m }: MailMessage & { hidden: boolean }): MailMessage => ({ ...m, items: m.items.map((i) => ({ ...i })) });
  return {
    inbox: async () => ({ time: now(), messages: box().filter((m) => !m.hidden).map(strip) }),
    claim: async (id) => {
      const m = box().find((m) => m.id === id);
      if (!m || m.hidden || !waiting(m)) return null;
      m.claimed = true;
      return m.items.map((i) => ({ ...i }));
    },
    markRead: async (ids) => {
      for (const m of box()) if (ids.includes(m.id)) m.read = true;
      return true;
    },
    hide: async (id) => {
      const m = box().find((m) => m.id === id);
      if (m && waiting(m)) return false;
      if (m) m.hidden = true;
      return true;
    },
  };
}

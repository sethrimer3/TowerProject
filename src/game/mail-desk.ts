import { kept, known, waiting, type MailItem, type MailMessage } from "../mail/message.ts";
import { MAIL_IDS_KEPT, type MailSave } from "../mail/progress.ts";
import { confirmServerTime, estimatedServerTime } from "../shop/clock.ts";
import { CURRENCIES } from "../shop/currency.ts";
import type { DeskHost } from "./desk.ts";

/** Mail's commands (the game's `mail`): taking in the inbox the server
 * reports, reading, removing, and granting what a claim brought. The
 * server's answers come in through these, fetched by `MailClient`, so the
 * desk never waits on the network. */
export class MailDesk {
  constructor(private host: DeskHost) {}

  private get m(): MailSave {
    return this.host.save.mail;
  }

  /** The server time now, estimated from the last confirmed. */
  get now() {
    return estimatedServerTime(this.host.save.shop.clock, this.host.clock());
  }

  /** Takes in the inbox the server reported at the confirmed time
   * `serverNow`. What the player did here and the server hasn't confirmed
   * yet still shows: messages read stay read, removed ones stay gone, and
   * claimed ones stay claimed. Each id done here is kept to sync only while
   * the server still reports it otherwise. */
  receive(messages: MailMessage[], serverNow: number) {
    confirmServerTime(this.host.save.shop.clock, serverNow, this.host.clock());
    const m = this.m, byId = new Map(messages.map((x) => [x.id, x]));
    m.unsynced.read = m.unsynced.read.filter((id) => byId.get(id)?.read === false);
    m.unsynced.hidden = m.unsynced.hidden.filter((id) => byId.has(id));
    m.inbox = messages
      .filter((x) => !m.unsynced.hidden.includes(x.id))
      .map((x) => ({ ...x, read: x.read || m.unsynced.read.includes(x.id), claimed: x.claimed || m.claimed.includes(x.id) }))
      .slice(-MAIL_IDS_KEPT);
    this.prune();
  }

  /** Drops mail past its time, so what is stored stays bounded. */
  private prune() {
    const now = this.now;
    this.m.inbox = this.m.inbox.filter((x) => kept(x, now));
  }

  /** The messages to show, newest first (of two sent together, the later
   * in the server's list): kept and not removed. */
  get recent(): MailMessage[] {
    const now = this.now;
    return this.m.inbox.filter((x) => kept(x, now)).reverse().sort((a, b) => b.sentAt - a.sentAt);
  }

  /** Whether any message to show is unread (the Mail button's dot). */
  get unread() {
    return this.recent.some((x) => !x.read);
  }

  private find(id: string) {
    return this.recent.find((x) => x.id === id);
  }

  /** Opens message `id`, marking it read; true when it was unread. */
  open(id: string) {
    const x = this.find(id);
    if (!x || x.read) return false;
    x.read = true;
    this.m.unsynced.read = [...this.m.unsynced.read, id].slice(-MAIL_IDS_KEPT);
    return true;
  }

  /** Whether message `id`'s items can be claimed: shown, waiting, and all
   * of kinds this client knows. */
  canClaim(id: string) {
    const x = this.find(id);
    return !!x && waiting(x) && known(x) && !this.m.claimed.includes(id);
  }

  /** Grants the items the server granted for message `id`, once. */
  grant(id: string, items: MailItem[]) {
    const x = this.m.inbox.find((x) => x.id === id);
    if (!x || this.m.claimed.includes(id)) return false;
    const save = this.host.save, gained: string[] = [];
    for (const i of items) {
      if (i.kind === "currency") CURRENCIES[i.currency].credit(save, i.amount), gained.push(`+${i.amount} ${CURRENCIES[i.currency].name}`);
      else if (i.kind === "tickets") (save.tournament.tickets += i.amount), gained.push(`+${i.amount} Ticket${i.amount === 1 ? "" : "s"}`);
    }
    x.claimed = true;
    this.m.claimed = [...this.m.claimed, id].slice(-MAIL_IDS_KEPT);
    if (gained.length) this.host.message = gained.join(", ");
    return true;
  }

  /** Whether message `id` can be removed: nothing in it waits to be claimed. */
  canHide(id: string) {
    const x = this.find(id);
    return !!x && !waiting(x);
  }

  /** Removes message `id` from view, here at once and on the server when
   * next synced; refused while items in it wait to be claimed. */
  hide(id: string) {
    if (!this.canHide(id)) return false;
    this.m.inbox = this.m.inbox.filter((x) => x.id !== id);
    this.m.unsynced.hidden = [...this.m.unsynced.hidden, id].slice(-MAIL_IDS_KEPT);
    return true;
  }

  /** Ids read and removed here that the server hasn't confirmed. */
  get unsynced() {
    return this.m.unsynced;
  }

  /** The server confirmed `ids` read, or removed. */
  synced(what: "read" | "hidden", ids: string[]) {
    this.m.unsynced[what] = this.m.unsynced[what].filter((id) => !ids.includes(id));
  }
}

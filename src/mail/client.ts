import type { MailDesk } from "../game/mail-desk.ts";
import { decodeItem, decodeMessages, type MailItem } from "./message.ts";
import type { MailServer } from "./server.ts";

// Between the game and Mail's server: fetching the inbox, claiming, and
// telling the server what was read and removed. The desk's commands never
// wait on the network; this does, then hands it the answers. The server's
// answers are decoded here, since nothing from the network is trusted.

export class MailClient {
  /** How often the inbox is asked for again while the player is in the forest. */
  static readonly POLL_MS = 5 * 60_000;

  constructor(
    private desk: MailDesk,
    private server: MailServer,
  ) {}

  /** Asks the server for the inbox and hands it to the desk, then sends
   * what was read or removed since; false when it can't be reached (the
   * last inbox, saved, still shows). */
  async refresh(): Promise<boolean> {
    const answer = await this.server.inbox().catch(() => null);
    if (!answer || typeof answer.time !== "number" || !Number.isFinite(answer.time)) return false;
    this.desk.receive(decodeMessages(answer.messages), answer.time);
    await this.sync();
    return true;
  }

  /** Opens message `id`, telling the server it was read. */
  open(id: string) {
    if (this.desk.open(id)) void this.sync();
  }

  /** Removes message `id`, telling the server; false when refused. */
  hide(id: string) {
    if (!this.desk.hide(id)) return false;
    void this.sync();
    return true;
  }

  /** Claims under way, so a second press asks nothing. */
  private claiming = new Set<string>();

  /** Claims message `id`'s items through the server and grants what it
   * granted; returns them, or null when refused or unreachable. */
  async claim(id: string): Promise<MailItem[] | null> {
    if (!this.desk.canClaim(id) || this.claiming.has(id)) return null;
    this.claiming.add(id);
    try {
      const raw = await this.server.claim(id).catch(() => null);
      if (!Array.isArray(raw)) return null;
      const items = raw.map(decodeItem).filter((i): i is MailItem => !!i && i.kind !== "unknown");
      return this.desk.grant(id, items) ? items : null;
    } finally {
      this.claiming.delete(id);
    }
  }

  /** The sync under way, which the next waits for. */
  private syncing: Promise<void> | null = null;

  /** Sends what was read and removed here and not yet confirmed, after any
   * sync under way; what the server doesn't confirm waits for the next. */
  async sync() {
    while (this.syncing) await this.syncing;
    this.syncing = this.syncEach().finally(() => (this.syncing = null));
    return this.syncing;
  }

  private async syncEach() {
    const { read, hidden } = this.desk.unsynced;
    if (read.length && (await this.server.markRead([...read]).catch(() => false))) this.desk.synced("read", [...read]);
    for (const id of [...hidden]) if (await this.server.hide(id).catch(() => false)) this.desk.synced("hidden", [id]);
  }
}

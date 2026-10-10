import { finite, isRecord, time } from "../decode.ts";
import { DAY_MS } from "../shop/clock.ts";
import type { CurrencyId } from "../shop/currency.ts";

// Mail: messages the game server pushes to a player, each a subject line,
// body text and possibly items to claim (docs/MAIL.md). The server owns
// them; the client shows what it last reported and claims through it.

/** What a message can hold. An item of a kind this client doesn't know
 * (sent for a newer version) is kept as `unknown`, so it still lists, and
 * its message can't be claimed until the game is updated. */
export type MailItem =
  | { kind: "currency"; currency: CurrencyId; amount: number }
  | { kind: "tickets"; amount: number }
  | { kind: "unknown" };

export type MailMessage = {
  /** The server's, unique; a missed Tournament prize is `tournament:<id>`. */
  id: string;
  /** When the server sent it (server time, ms). */
  sentAt: number;
  /** Plain text, one line. */
  subject: string;
  /** Plain text; blank lines separate paragraphs. */
  body: string;
  items: MailItem[];
  read: boolean;
  claimed: boolean;
};

/** How long a message shows once nothing in it waits to be claimed. */
export const MAIL_DAYS = 7;
/** How long any message is kept, claimed or not: the bound on stored mail. */
export const MAIL_KEEP_DAYS = 90;

/** Whether `m` holds items not yet claimed. */
export const waiting = (m: MailMessage) => m.items.length > 0 && !m.claimed;

/** Whether `m` is still kept at server time `now`: under 90 days old, and
 * under 7 unless items in it wait to be claimed. */
export function kept(m: MailMessage, now: number) {
  const age = now - m.sentAt;
  return age < (waiting(m) ? MAIL_KEEP_DAYS : MAIL_DAYS) * DAY_MS;
}

/** Whether every item in `m` is of a kind this client can grant. */
export const known = (m: MailMessage) => m.items.every((i) => i.kind !== "unknown");

const CURRENCY_IDS: readonly CurrencyId[] = ["gems", "shards", "gold", "medals"];
/** The longest subject and body kept, so a message can't swell the save. */
const SUBJECT_MAX = 200, BODY_MAX = 4000, ITEMS_MAX = 20, ID_MAX = 100;

const text = (raw: unknown, max: number) => (typeof raw === "string" ? raw.slice(0, max) : "");
/** A message id: a short non-empty string. */
export const isMailId = (raw: unknown): raw is string => typeof raw === "string" && raw.length > 0 && raw.length <= ID_MAX;

/** An item as the server or the save gives it: a known kind with a
 * positive whole amount, an unknown kind, or null when malformed. */
export function decodeItem(raw: unknown): MailItem | null {
  if (!isRecord(raw) || typeof raw.kind !== "string") return null;
  const amount = raw.amount;
  if (raw.kind === "currency" || raw.kind === "tickets") {
    if (!Number.isInteger(amount) || !finite(amount) || amount <= 0) return null;
    if (raw.kind === "tickets") return { kind: "tickets", amount };
    return CURRENCY_IDS.includes(raw.currency) ? { kind: "currency", currency: raw.currency, amount } : null;
  }
  return { kind: "unknown" };
}

/** A message as the server or the save gives it, or null when malformed.
 * Every field is read with care, since neither is trusted. A message with
 * a malformed item is dropped whole rather than shown short of it. */
export function decodeMessage(raw: unknown): MailMessage | null {
  if (!isRecord(raw) || !isMailId(raw.id) || !Array.isArray(raw.items) || raw.items.length > ITEMS_MAX) return null;
  const items = raw.items.map(decodeItem);
  if (items.some((i) => i === null)) return null;
  const sentAt = time(raw.sentAt);
  if (!sentAt) return null;
  return {
    id: raw.id, sentAt, subject: text(raw.subject, SUBJECT_MAX), body: text(raw.body, BODY_MAX),
    items: items as MailItem[], read: raw.read === true, claimed: raw.claimed === true,
  };
}

/** Messages decoded from `raw`, each id once (the first). */
export function decodeMessages(raw: unknown): MailMessage[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>(), out: MailMessage[] = [];
  for (const m of raw.map(decodeMessage)) if (m && !seen.has(m.id)) seen.add(m.id), out.push(m);
  return out;
}

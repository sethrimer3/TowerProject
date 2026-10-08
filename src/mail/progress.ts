import { isRecord } from "../decode.ts";
import { decodeMessage, decodeMessages, isMailId, type MailMessage } from "./message.ts";

// Mail's saved state (`save.mail`): the inbox the server last reported,
// with what the player did since that the server hasn't confirmed yet, and
// which messages' items were granted, so none is ever granted twice.

export type MailSave = {
  /** The messages the server last reported, read and claimed as known here. */
  inbox: MailMessage[];
  /** Ids opened and removed here that the server hasn't confirmed yet. */
  unsynced: { read: string[]; hidden: string[] };
  /** Ids whose items were granted here. */
  claimed: string[];
  /** The stand-in server's own mailbox (`stubMail`): every message it has
   * sent, with what the player did to each. Empty once a real server
   * answers. */
  stub: (MailMessage & { hidden: boolean })[];
};

/** The most ids any list keeps: far more than 90 days of mail. */
export const MAIL_IDS_KEPT = 200;

export const defaultMail = (): MailSave => ({ inbox: [], unsynced: { read: [], hidden: [] }, claimed: [], stub: [] });

const ids = (raw: unknown) => (Array.isArray(raw) ? [...new Set(raw.filter(isMailId))].slice(-MAIL_IDS_KEPT) : []);

/** A saved MailSave, field by field; anything malformed is dropped. Mail
 * past its time is dropped by the desk, which knows the server's clock. */
export function decodeMail(raw: unknown): MailSave {
  const d = defaultMail();
  if (!isRecord(raw)) return d;
  const r = raw, unsynced = isRecord(r.unsynced) ? r.unsynced : {};
  d.inbox = decodeMessages(r.inbox).slice(-MAIL_IDS_KEPT);
  d.unsynced = { read: ids(unsynced.read), hidden: ids(unsynced.hidden) };
  d.claimed = ids(r.claimed);
  const stub = Array.isArray(r.stub) ? r.stub : [], seen = new Set<string>();
  for (const s of stub.slice(-MAIL_IDS_KEPT)) {
    const m = decodeMessage(s);
    if (m && !seen.has(m.id)) seen.add(m.id), d.stub.push({ ...m, hidden: s.hidden === true });
  }
  return d;
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults, decode } from "../src/save.ts";
import { MailClient } from "../src/mail/client.ts";
import { decodeMessage, MAIL_DAYS, MAIL_KEEP_DAYS, type MailItem } from "../src/mail/message.ts";
import { decodeMail } from "../src/mail/progress.ts";
import { postStubMail, stubMail, type MailDraft, type MailServer } from "../src/mail/server.ts";
import { DAY_MS } from "../src/shop/clock.ts";
import { TournamentClient } from "../src/tournament/client.ts";
import { placeOf, prizeFor } from "../src/tournament/prizes.ts";
import { CLAIM_MS, tournamentById } from "../src/tournament/schedule.ts";
import { stubField, stubTournament, STUB_TABULATE_MS } from "../src/tournament/server.ts";

const MINUTE = 60_000, HOUR = 60 * MINUTE;
const START = Date.parse("2026-10-05T12:00:00Z");

const OUTAGE: MailDraft = {
  subject: "Sorry about this morning's outage",
  body: "The servers were down for an hour.\n\nHere are some Gems for your trouble.",
  items: [{ kind: "currency", currency: "gems", amount: 20 }],
};
const NOTICE: MailDraft = { subject: "Maintenance on Friday", body: "A short break at 02:00 GMT.", items: [] };

/** A server that can be taken down: each call fails while `down.now`. */
function flaky(server: MailServer) {
  const down = { now: false }, calls: string[] = [];
  const guard = <A extends unknown[], R>(name: string, f: (...a: A) => Promise<R>) => (...a: A) => {
    calls.push(name);
    return down.now ? Promise.reject(new Error("offline")) : f(...a);
  };
  const s: MailServer = { inbox: guard("inbox", server.inbox), claim: guard("claim", server.claim), markRead: guard("markRead", server.markRead), hide: guard("hide", server.hide) };
  return { s, down, calls };
}

/** A game on a clock the test moves, with a client of the stub on it. */
function setup() {
  const clock = { now: START }, g = new Game(defaults());
  g.clock = () => clock.now;
  g.newRun({ outside: true });
  const server = flaky(stubMail(() => g.save, () => clock.now)), client = new MailClient(g.mail, server.s);
  const post = (d: MailDraft) => postStubMail(g.save, d, clock.now);
  return { g, clock, client, post, ...server };
}

test("messages from the server or the save are read field by field; malformed ones are dropped, unknown item kinds kept", () => {
  const good = { id: "a", sentAt: START, subject: "Hi", body: "Text", items: [{ kind: "currency", currency: "gems", amount: 5 }], read: true };
  assert.deepEqual(decodeMessage(good), { ...good, claimed: false });
  assert.deepEqual(decodeMessage({ ...good, items: [{ kind: "card", id: "x" }] })?.items, [{ kind: "unknown" }], "a newer kind still lists");
  assert.deepEqual(decodeMessage({ ...good, items: [{ kind: "tickets", amount: 2 }] })?.items, [{ kind: "tickets", amount: 2 }]);
  for (const bad of [
    null, [], { ...good, id: "" }, { ...good, id: 7 }, { ...good, sentAt: -1 }, { ...good, sentAt: "now" }, { ...good, items: "gems" },
    { ...good, items: [{ kind: "currency", currency: "rubies", amount: 5 }] },
    { ...good, items: [{ kind: "currency", currency: "gems", amount: 0 }] },
    { ...good, items: [{ kind: "currency", currency: "gems", amount: 1.5 }] },
    { ...good, items: [{ kind: "tickets", amount: Infinity }] },
    { ...good, items: [null] },
  ]) assert.equal(decodeMessage(bad), null, JSON.stringify(bad));
  const long = decodeMessage({ ...good, subject: "x".repeat(1000), body: 5 })!;
  assert.equal(long.subject.length, 200);
  assert.equal(long.body, "");
  assert.equal(decodeMessage({ ...good, subject: "<b>bold</b>" })!.subject, "<b>bold</b>", "kept as text: the page escapes it");

  const saved = decodeMail({
    inbox: [good, good, { ...good, id: "b" }, "junk"], unsynced: { read: ["a", "a", 3], hidden: "x" }, claimed: ["b", ""],
    stub: [{ ...good, hidden: true }, null],
  });
  assert.deepEqual(saved.inbox.map((m) => m.id), ["a", "b"], "each id once");
  assert.deepEqual(saved.unsynced, { read: ["a"], hidden: [] });
  assert.deepEqual(saved.claimed, ["b"]);
  assert.deepEqual(saved.stub.map((m) => [m.id, m.hidden]), [["a", true]]);
  assert.deepEqual(decodeMail("nonsense"), defaults().mail);
  assert.deepEqual(decode(JSON.stringify({ ...defaults(), mail: undefined })).mail, defaults().mail, "an older save has no mail");
});

test("a message shows for 7 days, or while its items wait to be claimed, up to 90", async () => {
  const { g, clock, client, post } = setup();
  post(NOTICE);
  clock.now += HOUR;
  post(OUTAGE);
  assert.equal(await client.refresh(), true);
  assert.deepEqual(g.mail.recent.map((m) => m.subject), [OUTAGE.subject, NOTICE.subject], "newest first");
  clock.now = START + MAIL_DAYS * DAY_MS;
  assert.deepEqual(g.mail.recent.map((m) => m.subject), [OUTAGE.subject], "the notice is gone after a week; the Gems wait");
  clock.now = START + HOUR + MAIL_KEEP_DAYS * DAY_MS - MINUTE;
  await client.refresh();
  assert.equal(g.mail.recent.length, 1, "kept up to 90 days unclaimed");
  clock.now += MINUTE;
  assert.deepEqual(g.mail.recent, []);
  await client.refresh();
  assert.deepEqual(g.save.mail.inbox, [], "and dropped from the save");
  assert.deepEqual(g.save.mail.stub, [], "and from the server");
});

test("a claimed message shows its week out; opening a message clears its dot and tells the server", async () => {
  const { g, clock, client, post, down, calls } = setup();
  post(OUTAGE);
  await client.refresh();
  const [m] = g.mail.recent;
  assert.equal(g.mail.unread, true, "the Mail button's dot");
  down.now = true;
  client.open(m!.id);
  assert.equal(g.mail.unread, false, "read at once, offline or not");
  await client.sync();
  assert.deepEqual(g.save.mail.unsynced.read, [m!.id], "waits to be sent");
  down.now = false;
  await client.refresh();
  assert.equal(g.mail.recent[0]!.read, true, "the server's unread report doesn't bring the dot back");
  assert.deepEqual(g.save.mail.unsynced.read, [], "sent");
  assert.equal(g.save.mail.stub[0]!.read, true);
  assert.ok(calls.includes("markRead"));

  assert.deepEqual(await client.claim(m!.id), OUTAGE.items);
  clock.now = START + MAIL_DAYS * DAY_MS - MINUTE;
  assert.equal(g.mail.recent.length, 1);
  clock.now += MINUTE;
  assert.equal(g.mail.recent.length, 0, "claimed: a week, like any other");
});

test("a message's items are granted once: retried, replayed, pressed twice or offline", async () => {
  const { g, client, post, down } = setup();
  post(OUTAGE);
  post({ subject: "Tickets", body: "", items: [{ kind: "tickets", amount: 2 }, { kind: "currency", currency: "shards", amount: 3 }] });
  await client.refresh();
  const [tickets, outage] = g.mail.recent.map((m) => m.id) as [string, string];
  assert.equal(g.mail.recent[1]!.subject, OUTAGE.subject, "of two sent together, the later first");
  const gems = g.save.gems;

  down.now = true;
  assert.equal(await client.claim(outage), null, "offline: nothing");
  assert.equal(g.save.gems, gems);
  assert.equal(g.mail.canClaim(outage), true, "still claimable");
  down.now = false;

  const [a, b] = await Promise.all([client.claim(outage), client.claim(outage)]);
  assert.deepEqual([a, b], [OUTAGE.items, null], "a second press asks nothing");
  assert.equal(g.save.gems, gems + 20);
  assert.equal(await client.claim(outage), null, "claimed");
  assert.equal(g.mail.grant(outage, OUTAGE.items), false, "a replayed answer grants nothing");
  assert.equal(g.save.gems, gems + 20);
  g.save.mail.stub.find((m) => m.id === outage)!.claimed = false;
  await client.refresh();
  assert.equal(g.mail.canClaim(outage), false, "the client's own record holds even if the server forgets");

  const shards = g.save.ascensionShards;
  assert.ok(await client.claim(tickets));
  assert.equal(g.save.tournament.tickets, 2);
  assert.equal(g.save.ascensionShards, shards + 3);
});

test("an item of a kind this client doesn't know holds the whole message back", async () => {
  const { g, client, clock, calls } = setup();
  g.save.mail.stub.push({ id: "new", sentAt: clock.now, subject: "A new card", body: "", items: [{ kind: "card" } as unknown as MailItem], read: false, claimed: false, hidden: false });
  await client.refresh();
  const [m] = g.mail.recent;
  assert.deepEqual(m!.items, [{ kind: "unknown" }]);
  assert.equal(g.mail.canClaim("new"), false);
  calls.length = 0;
  assert.equal(await client.claim("new"), null);
  assert.deepEqual(calls, [], "the server isn't asked");
  assert.equal(g.mail.canHide("new"), false, "nor removed: it waits for an update");
});

test("a message with items waiting can't be removed; one without is removed at once and stays removed", async () => {
  const { g, client, post, down } = setup();
  post(OUTAGE);
  post(NOTICE);
  await client.refresh();
  const notice = g.mail.recent.find((m) => !m.items.length)!.id, outage = g.mail.recent.find((m) => m.items.length)!.id;
  assert.equal(client.hide(outage), false, "rewards waiting: no X");
  assert.equal(await stubMail(() => g.save).hide(outage), false, "and the server refuses too");

  down.now = true;
  assert.equal(client.hide(notice), true);
  assert.deepEqual(g.mail.recent.map((m) => m.id), [outage], "gone at once");
  await client.sync();
  down.now = false;
  assert.equal(g.save.mail.stub.find((m) => m.id === notice)!.hidden, false, "the server hasn't heard");
  const inbox = await stubMail(() => g.save).inbox();
  assert.equal(inbox!.messages.length, 2);
  // The server still reports it until it hears: it stays removed here.
  g.mail.receive(inbox!.messages as never, inbox!.time);
  assert.deepEqual(g.mail.recent.map((m) => m.id), [outage]);
  await client.refresh();
  assert.equal(g.save.mail.stub.find((m) => m.id === notice)!.hidden, true, "sent");
  assert.deepEqual(g.save.mail.unsynced.hidden, []);
  await client.refresh();
  assert.deepEqual(g.mail.recent.map((m) => m.id), [outage]);

  await client.claim(outage);
  assert.equal(client.hide(outage), true, "claimed: the X");
  assert.equal(g.mail.recent.length, 0, "nothing to show: the button goes");
});

test("erasing progress keeps Mail: it is the server's", async () => {
  const { g, client, post } = setup();
  post(OUTAGE);
  await client.refresh();
  const [m] = g.mail.recent;
  await client.claim(m!.id);
  g.eraseAll();
  assert.equal(g.mail.recent.length, 1);
  assert.equal(g.mail.canClaim(m!.id), false);
});

test("a Tournament prize left unclaimed comes as Mail as its claim window closes, never claimable in both places", async () => {
  const ID = "2026-10-07", T = tournamentById(ID), FINAL = T.graceEndsAt + STUB_TABULATE_MS;
  const play = async (claimInTime: boolean) => {
    const { g, clock, client } = setup();
    g.save.goals.claimed[1] = [70];
    clock.now = T.opensAt + HOUR;
    const tournament = new TournamentClient(g, stubTournament(() => g.save.tournament, () => clock.now));
    await tournament.refresh();
    assert.equal(await tournament.begin(), null);
    g.run.maxHeight = 30;
    tournament.tick(clock.now);
    await tournament.sendPending();
    g.acceptDefeat();
    clock.now = FINAL + MINUTE;
    await tournament.refresh();
    assert.equal(g.tournament.claimable, true);
    if (claimInTime) assert.ok(await tournament.claim());
    clock.now = FINAL + CLAIM_MS - MINUTE;
    await client.refresh();
    assert.deepEqual(g.mail.recent, [], "no mail while the Tournament can still pay it");
    clock.now = FINAL + CLAIM_MS;
    await client.refresh();
    return { g, client, tournament };
  };

  const { g: claimed } = await play(true);
  assert.deepEqual(claimed.mail.recent, [], "claimed in time: no mail");

  const { g, client, tournament } = await play(false);
  const best = g.save.tournament.entries[ID]!.best, scores = [...stubField(ID, "copper"), best];
  const prize = prizeFor("copper", placeOf(scores, best), scores.length);
  const [m] = g.mail.recent;
  assert.equal(m!.id, `tournament:${ID}`);
  assert.equal(m!.subject, "Your Tournament prize");
  assert.match(m!.body, /^Wednesday 7 October · \d+(st|nd|rd|th) of 1,000 in the Copper League\./);
  assert.deepEqual(m!.items, [{ kind: "currency", currency: "shards", amount: prize.shards }, { kind: "currency", currency: "gems", amount: prize.gems }]);
  assert.equal(g.tournament.phase, "upcoming", "the Tournament page shows only the next opening");
  assert.equal(await tournament.claim(), null, "the Tournament refuses it now");
  assert.equal(await stubTournament(() => g.save.tournament, () => FINAL + CLAIM_MS).claim(ID), null, "its server too");
  const gems = g.save.gems, shards = g.save.ascensionShards;
  assert.ok(await client.claim(m!.id));
  assert.equal(g.save.gems, gems + prize.gems);
  assert.equal(g.save.ascensionShards, shards + prize.shards);
  await client.refresh();
  assert.equal(g.save.mail.stub.filter((x) => x.id === m!.id).length, 1, "posted once");
});

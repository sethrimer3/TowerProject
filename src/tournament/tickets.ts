import type { TournamentSave } from "./progress.ts";

// Tickets: each tournament entry spends one. Every tournament grants one
// free; when out, one more for an ad (or nothing, with Ad-Disable), then
// more for Gems, 10 more each time, starting over each tournament. Unused
// Tickets carry over.

/** How many more Gems each Gem Ticket costs than the last in a tournament. */
export const GEM_TICKET_STEP = 10;

/** Grants tournament `id`'s free Ticket, once; whether it was granted now. */
export function grantFreeTicket(t: TournamentSave, id: string) {
  if (t.granted === id) return false;
  t.granted = id;
  t.tickets++;
  return true;
}

/** Whether tournament `id`'s ad Ticket is still to be taken. */
export const adTicketReady = (t: TournamentSave, id: string) => t.adTicket !== id;

/** Takes tournament `id`'s ad Ticket, once; whether it was taken now. */
export function takeAdTicket(t: TournamentSave, id: string) {
  if (!adTicketReady(t, id)) return false;
  t.adTicket = id;
  t.tickets++;
  return true;
}

/** Gem Tickets already bought in tournament `id`. */
const gemTicketsBought = (t: TournamentSave, id: string) => (t.gemTickets.id === id ? t.gemTickets.bought : 0);

/** The next Gem Ticket's price in tournament `id`: 10, 20, 30 … */
export const gemTicketPrice = (t: TournamentSave, id: string) => GEM_TICKET_STEP * (gemTicketsBought(t, id) + 1);

/** Counts a Gem Ticket bought in tournament `id` (the Gems already paid). */
export function addGemTicket(t: TournamentSave, id: string) {
  t.gemTickets = { id, bought: gemTicketsBought(t, id) + 1 };
  t.tickets++;
}

/** How a player out of Tickets gets the next one in tournament `id`: the
 * ad Ticket while it is still to be taken, then Gems. */
export const nextTicket = (t: TournamentSave, id: string): "ad" | "gems" => (adTicketReady(t, id) ? "ad" : "gems");

/** Spends a Ticket on an entry; false when none is held. */
export function spendTicket(t: TournamentSave) {
  if (t.tickets < 1) return false;
  t.tickets--;
  return true;
}

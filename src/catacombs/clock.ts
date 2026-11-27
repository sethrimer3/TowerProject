// The Catacombs' clock (docs/CATACOMBS.md): one real turn a second on every
// screen, the bank of seconds the app was away, and haste, which spends them.
// Pure: the caller passes the wall clock and runs the turns it returns.
import type { ClockSave, Haste } from "./state.ts";

/** A frame gap longer than this (ms: a hidden tab, a sleeping device, the
 * app closed) goes to the bank instead of playing out at once. */
export const BANK_GAP_MS = 10_000;
const SECOND = 1000;

/** What a tick leaves the caller to do: real turns, hasted turns (each
 * paid with a banked second), and seconds just banked from a gap. */
export type Due = { real: number; hasted: number; banked: number; slowed: boolean };

/** The part of a hasted turn owed but not yet taken, carried from tick to
 * tick while the app runs (never saved: a reload starts it at 0). */
export type HasteCarry = { prev: number; owed: number };
export const newCarry = (): HasteCarry => ({ prev: 0, owed: 0 });

/** The turns due by wall-clock time `now`. A first tick (no `lastTurnAt`)
 * starts the clock; a gap over `BANK_GAP_MS` banks its whole seconds; else
 * each whole second gone is a real turn, and at ×N each second also owes
 * N − 1 hasted turns, paid from the bank: what the bank can't pay is
 * dropped and the haste falls to ×1 (`slowed`). */
export function tick(clock: ClockSave, now: number, carry: HasteCarry): Due {
  const due: Due = { real: 0, hasted: 0, banked: 0, slowed: false };
  if (!clock.lastTurnAt || now < clock.lastTurnAt) {
    clock.lastTurnAt = now;
    carry.prev = now;
    return due;
  }
  const gone = now - clock.lastTurnAt;
  if (gone > BANK_GAP_MS) {
    due.banked = Math.floor(gone / SECOND);
    clock.bank += due.banked;
    clock.lastTurnAt += due.banked * SECOND;
    carry.prev = now;
    carry.owed = 0;
    return due;
  }
  due.real = Math.floor(gone / SECOND);
  clock.lastTurnAt += due.real * SECOND;
  const since = carry.prev && now > carry.prev ? now - carry.prev : 0;
  carry.prev = now;
  if (clock.haste > 1) {
    carry.owed += (since * (clock.haste - 1)) / SECOND;
    const want = Math.floor(carry.owed);
    carry.owed -= want;
    due.hasted = Math.min(want, clock.bank);
    clock.bank -= due.hasted;
    if (due.hasted < want) {
      setHaste(clock, 1, carry);
      due.slowed = true;
    }
  } else carry.owed = 0;
  return due;
}

/** Chooses the haste; above ×1 only while seconds are banked. */
export function setHaste(clock: ClockSave, haste: Haste, carry?: HasteCarry) {
  clock.haste = haste > 1 && clock.bank < 1 ? 1 : haste;
  if (carry) carry.owed = 0;
}

/** The seconds the next tick will bank by `now`, as the Offline dialog
 * reports them on start-up. */
export const offlineSeconds = (clock: ClockSave, now: number) => {
  const gone = clock.lastTurnAt ? now - clock.lastTurnAt : 0;
  return gone > BANK_GAP_MS ? Math.floor(gone / SECOND) : 0;
};

/** The most turns played on the board in a second; past it a frame's turns
 * run together and only the last is drawn (`MAX_MOVE_RATE` in config.ts). */
export { MAX_MOVE_RATE as MAX_DRAWN_TURNS } from "../config.ts";

import { snap } from "./exact.ts";

// Readers for untrusted saved data, shared by every part of the save's
// decoder: each checks one field's shape, or reads it with a fallback.

/** A plain object (not null, not an array). */
export const isRecord = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);

/** A finite number from 0 to `max`. */
export const finite = (n: unknown, max = 1e9): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max;

/** A whole number, 0 or more. */
export const whole = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0;

/** A whole number from `min` to `max`. */
export const wholeIn = (n: unknown, min: number, max: number): n is number =>
  Number.isInteger(n) && (n as number) >= min && (n as number) <= max;

/** A time (ms) or other non-negative finite number, else 0. */
export const time = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0);

/** A floored count from `raw` when it is a finite number within `max`. */
export const count = (raw: unknown, fallback: number, max?: number) => (finite(raw, max) ? Math.floor(raw) : fallback);

/** An amount kept with its fraction (Gold), on the `snap` grid. */
export const fraction = (raw: unknown, fallback: number) => (finite(raw) ? snap(raw) : fallback);

/** Deletes each optional field of `r` that is present but fails its check,
 * in the order given (a check may read a field checked before it). */
export function dropInvalid(r: Record<string, any>, checks: Record<string, (v: any, r: Record<string, any>) => boolean>) {
  for (const [key, valid] of Object.entries(checks)) if (r[key] !== undefined && !valid(r[key], r)) delete r[key];
}

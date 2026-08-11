/** Join conditional class names. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Format an ISO date string as a short, human-readable date. */
export function formatDate(iso: string, locale = "en-US"): string {
  return toDate(iso).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/*
 * ── Calendar dates ──────────────────────────────────────────────
 * Daily logs are keyed by calendar date, so they must use the
 * VIEWER's day, not UTC. `new Date().toISOString()` rolls over at
 * 00:00 UTC — 03:30 in Tehran — so between midnight and 03:30 it
 * returns yesterday, and an upsert on (episode_id, date) would
 * overwrite the previous day's entry.
 *
 * TODO: once clinics carry a timezone setting, take it from the
 * clinic rather than the browser so a clinic's reports agree.
 */

/** Today as `yyyy-mm-dd` in the viewer's local timezone. */
export function todayLocal(): string {
  return localDateStr(new Date());
}

/** `yyyy-mm-dd` for a Date, in the viewer's local timezone. */
export function localDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today shifted by `days`, as a local `yyyy-mm-dd`. */
export function localDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

/**
 * Parse either a full ISO timestamp or a bare `yyyy-mm-dd`. A bare
 * date is read as local midnight — `new Date("2026-08-12")` parses as
 * UTC and can display as the previous day west of Greenwich.
 */
export function toDate(iso: string): Date {
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (bare) {
    return new Date(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3]));
  }
  return new Date(iso);
}

/** Simple id generator for mock/local data. */
export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/** UUID for records that may be persisted to Supabase (uuid columns). */
export function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

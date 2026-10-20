/**
 * Date & time helpers for Floria Mood Journal — pure, deterministic, and
 * timezone/DST-immune.
 *
 * We treat every stored timestamp as a LOCAL WALL CLOCK ("YYYY-MM-DDTHH:mm",
 * no zone). All arithmetic runs through Date.UTC, i.e. we pretend the wall
 * clock is UTC. That means the machine's timezone never leaks into a result and
 * there are no DST jumps (UTC has none) — a mood logged at 02:00 always buckets
 * the same way no matter where/when the test or device runs. This is exactly
 * the "use the user's day-start consistently" behaviour the PRD asks for.
 */
export type DateKey = string; // "YYYY-MM-DD" (local day)
export type ISODateTime = string; // "YYYY-MM-DDTHH:mm" (local wall clock)

const pad = (n: number) => String(n).padStart(2, "0");

export interface DateParts {
  y: number;
  mo: number; // 1-12
  d: number;
  h: number; // 0-23
  mi: number; // 0-59
}

const DT_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/;

export function parseDateTime(ts: string): DateParts {
  const m = DT_RE.exec(ts);
  if (!m) throw new Error(`bad datetime: ${ts}`);
  return { y: +m[1], mo: +m[2], d: +m[3], h: m[4] ? +m[4] : 0, mi: m[5] ? +m[5] : 0 };
}

const toMs = (p: DateParts): number => Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
function fromMs(ms: number): DateParts {
  const d = new Date(ms);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
}

export const formatDate = (p: DateParts): DateKey => `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
export const formatDateTime = (p: DateParts): ISODateTime => `${formatDate(p)}T${pad(p.h)}:${pad(p.mi)}`;

/** The calendar date part of a timestamp (no day-start applied). */
export const dateKeyOf = (ts: string): DateKey => formatDate(parseDateTime(ts));

/** Shift a DateKey by whole days (safe across months/years/leap days). */
export function addDays(key: DateKey, n: number): DateKey {
  const p = parseDateTime(key);
  return formatDate(fromMs(toMs({ ...p, h: 12, mi: 0 }) + n * 86_400_000));
}

/** Shift a timestamp by minutes, keeping the wall-clock format. */
export function addMinutes(ts: ISODateTime, n: number): ISODateTime {
  return formatDateTime(fromMs(toMs(parseDateTime(ts)) + n * 60_000));
}

/** Whole minutes from a → b (b - a). Negative when b is earlier. */
export function minutesBetween(a: ISODateTime, b: ISODateTime): number {
  return Math.round((toMs(parseDateTime(b)) - toMs(parseDateTime(a))) / 60_000);
}

/** <0 if a<b, 0 if equal, >0 if a>b — on the wall clock. */
export function compareDateTime(a: ISODateTime, b: ISODateTime): number {
  return toMs(parseDateTime(a)) - toMs(parseDateTime(b));
}

/**
 * The day a timestamp belongs to once the user's day-start is applied. With
 * dayStartHour = 4, anything before 04:00 rolls back to the previous day.
 */
export function dayBucket(ts: ISODateTime, dayStartHour: number): DateKey {
  return formatDate(fromMs(toMs(parseDateTime(ts)) - dayStartHour * 3_600_000));
}

/**
 * The day a timestamp counts toward for STREAK fairness. The grace window lets
 * the first `graceMinutes` after day-start still count for the day that just
 * ended — so a 05:30 log (day-start 04:00, grace 120) keeps yesterday's streak.
 */
export function graceBucket(ts: ISODateTime, dayStartHour: number, graceMinutes: number): DateKey {
  return formatDate(fromMs(toMs(parseDateTime(ts)) - (dayStartHour * 60 + graceMinutes) * 60_000));
}

export const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function weekdayIndex(key: DateKey): number {
  const p = parseDateTime(key);
  return new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay();
}
export const weekdayLabel = (key: DateKey): string => WEEKDAY[weekdayIndex(key)];

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";
/** Bucket a timestamp's wall-clock hour into one of four parts of the day. */
export function timeOfDay(ts: ISODateTime): TimeOfDay {
  const h = parseDateTime(ts).h;
  if (h >= 5 && h <= 11) return "morning";
  if (h >= 12 && h <= 16) return "afternoon";
  if (h >= 17 && h <= 21) return "evening";
  return "night";
}
export const TIMES_OF_DAY: TimeOfDay[] = ["morning", "afternoon", "evening", "night"];

/** True for a valid "HH:mm" 24-hour clock string. */
export function isValidTime(hhmm: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return false;
  const h = +m[1];
  const mi = +m[2];
  return h >= 0 && h <= 23 && mi >= 0 && mi <= 59;
}

/** Minutes since midnight for an "HH:mm" string (for ordering reminders). */
export function timeToMinutes(hhmm: string): number {
  const [h, mi] = hhmm.split(":").map(Number);
  return h * 60 + mi;
}
export function minutesToTime(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

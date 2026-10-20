/**
 * Reminders & preferences (UF3 multiple reminders, day-start/grace settings).
 *
 * Reminders are local-notification schedules: a single time on chosen days, or
 * an hourly range within a window. Nothing here fires notifications — that's the
 * app layer; this module validates schedules and expands them into fire times.
 */
import { addMinutes, isValidTime, minutesToTime, timeToMinutes, type ISODateTime } from "./dates";
import {
  type HourlyRange,
  type MoodState,
  type Prefs,
  type Reminder,
  type DomainError,
  DAY_START_MAX,
  DAY_START_MIN,
  GRACE_MAX,
  GRACE_MIN,
  SNOOZE_OPTIONS,
  allocId,
} from "./model";

export interface ReminderInput {
  time: string;
  daysOfWeek?: number[];
  enabled?: boolean;
  hourlyRange?: HourlyRange;
}

const uniqueSortedDays = (days: number[]): number[] => [...new Set(days)].sort((a, b) => a - b);

export function validateReminder(input: ReminderInput): DomainError | null {
  if (!isValidTime(input.time)) return "bad_time";
  const days = input.daysOfWeek ?? [];
  if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return "bad_days";
  const r = input.hourlyRange;
  if (r) {
    if (!isValidTime(r.start) || !isValidTime(r.end)) return "bad_time";
    if (!Number.isInteger(r.intervalMinutes) || r.intervalMinutes < 15 || r.intervalMinutes > 720) return "bad_range";
    if (timeToMinutes(r.end) <= timeToMinutes(r.start)) return "bad_range";
  }
  return null;
}

export function addReminder(s: MoodState, input: ReminderInput): { state: MoodState; error: DomainError | null; id?: string } {
  const error = validateReminder(input);
  if (error) return { state: s, error };
  const { id, nextId } = allocId(s, "r");
  const reminder: Reminder = {
    id,
    time: input.time,
    enabled: input.enabled ?? true,
    daysOfWeek: uniqueSortedDays(input.daysOfWeek ?? []),
    hourlyRange: input.hourlyRange,
  };
  return { state: { ...s, reminders: [...s.reminders, reminder], nextId }, error: null, id };
}

export function updateReminder(s: MoodState, id: string, input: ReminderInput): { state: MoodState; error: DomainError | null } {
  if (!s.reminders.some((r) => r.id === id)) return { state: s, error: "not_found" };
  const error = validateReminder(input);
  if (error) return { state: s, error };
  return {
    state: {
      ...s,
      reminders: s.reminders.map((r) =>
        r.id === id ? { ...r, time: input.time, daysOfWeek: uniqueSortedDays(input.daysOfWeek ?? []), hourlyRange: input.hourlyRange, enabled: input.enabled ?? r.enabled } : r,
      ),
    },
    error: null,
  };
}

export function toggleReminder(s: MoodState, id: string, enabled: boolean): MoodState {
  return { ...s, reminders: s.reminders.map((r) => (r.id === id ? { ...r, enabled } : r)) };
}
export function deleteReminder(s: MoodState, id: string): MoodState {
  return { ...s, reminders: s.reminders.filter((r) => r.id !== id) };
}

/** Does a reminder run on weekday `dow` (0..6)? Empty day list = every day. */
export const runsOnDay = (r: Reminder, dow: number): boolean => r.daysOfWeek.length === 0 || r.daysOfWeek.includes(dow);

/** All fire times (HH:mm) a reminder produces on a day it runs — expands ranges. */
export function occurrences(r: Reminder): string[] {
  if (!r.hourlyRange) return [r.time];
  const { start, end, intervalMinutes } = r.hourlyRange;
  const out: string[] = [];
  for (let m = timeToMinutes(start); m <= timeToMinutes(end); m += intervalMinutes) out.push(minutesToTime(m));
  return out;
}

/** The notification snooze → a future wall-clock time. Only 15/30/60 allowed. */
export function snoozeUntil(now: ISODateTime, minutes: number): ISODateTime {
  const m = (SNOOZE_OPTIONS as readonly number[]).includes(minutes) ? minutes : 15;
  return addMinutes(now, m);
}

// ── Preferences ────────────────────────────────────────────────────────────
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

export function setDayStartHour(s: MoodState, hour: number): MoodState {
  return { ...s, prefs: { ...s.prefs, dayStartHour: clamp(hour, DAY_START_MIN, DAY_START_MAX) } };
}
export function setGraceMinutes(s: MoodState, minutes: number): MoodState {
  return { ...s, prefs: { ...s.prefs, graceMinutes: clamp(minutes, GRACE_MIN, GRACE_MAX) } };
}
export function setIntensityEnabled(s: MoodState, on: boolean): MoodState {
  return { ...s, prefs: { ...s.prefs, intensityEnabled: on } };
}
export function setTheme(s: MoodState, theme: Prefs["theme"]): MoodState {
  return { ...s, prefs: { ...s.prefs, theme } };
}
export function setAnonymousMode(s: MoodState, on: boolean): MoodState {
  return { ...s, prefs: { ...s.prefs, anonymousMode: on } };
}

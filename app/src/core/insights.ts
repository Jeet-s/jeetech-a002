/**
 * Streaks, trends and insights (UF5 weekly summary, Home "today" ring).
 *
 * Streaks apply the user's day-start AND grace window: a day is "covered" if
 * any entry's normal bucket OR grace bucket lands on it, so a late-night / early
 * morning log keeps the streak fair. Averages are weighted by mood score and
 * (when enabled) intensity, so multi-mood entries aggregate sensibly.
 */
import {
  addDays,
  compareDateTime,
  dayBucket,
  graceBucket,
  timeOfDay,
  type DateKey,
  type ISODateTime,
  type TimeOfDay,
} from "./dates";
import { activeEntries } from "./entries";
import { moodById } from "./moods";
import {
  type Entry,
  type MoodState,
  type Prefs,
  MIN_INSIGHT_DAYS,
  MOOD_SCORE_MAX,
  MOOD_SCORE_MIN,
} from "./model";

/** Which day (day-start applied) an entry belongs to for display. */
export const bucketOf = (e: Entry, prefs: Prefs): DateKey => dayBucket(e.timestamp, prefs.dayStartHour);

/**
 * Weighted mood score of a single entry on the 1..5 scale. When intensity is
 * enabled, each mood is weighted by its intensity (default 5 if unset); else
 * every mood weighs the same. Returns null if no mood resolves.
 */
export function entryScore(s: MoodState, e: Entry, prefs: Prefs): number | null {
  let sum = 0;
  let weight = 0;
  for (const m of e.moods) {
    const mood = moodById(s, m.moodId);
    if (!mood) continue;
    const w = prefs.intensityEnabled ? (m.intensity ?? 5) : 1;
    sum += mood.score * w;
    weight += w;
  }
  return weight ? sum / weight : null;
}

/** Every day covered by a non-deleted entry (normal bucket or grace bucket). */
export function coveredDays(s: MoodState, prefs: Prefs): Set<DateKey> {
  const days = new Set<DateKey>();
  for (const e of s.entries) {
    if (e.deleted) continue;
    days.add(dayBucket(e.timestamp, prefs.dayStartHour));
    days.add(graceBucket(e.timestamp, prefs.dayStartHour, prefs.graceMinutes));
  }
  return days;
}

/** Consecutive covered days ending today — or yesterday if today isn't logged yet. */
export function currentStreak(s: MoodState, todayTs: ISODateTime, prefs: Prefs): number {
  const covered = coveredDays(s, prefs);
  const today = dayBucket(todayTs, prefs.dayStartHour);
  let day = covered.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (covered.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

/** Longest run of consecutive covered days ever. */
export function bestStreak(s: MoodState, prefs: Prefs): number {
  const days = [...coveredDays(s, prefs)].sort();
  let best = 0;
  let run = 0;
  let prev: DateKey | null = null;
  for (const d of days) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/**
 * Non-deleted entries whose day-bucket falls in [from, to], in STORAGE order
 * (unsorted). This is the hot path for every aggregation below — sums, counts
 * and sets don't care about order, and skipping the sort keeps per-render cost
 * O(n) instead of O(n log n). One linear pass, no intermediate copies.
 */
function activeInRange(s: MoodState, from: DateKey, to: DateKey, prefs: Prefs): Entry[] {
  const out: Entry[] = [];
  for (const e of s.entries) {
    if (e.deleted) continue;
    const b = bucketOf(e, prefs);
    if (b >= from && b <= to) out.push(e);
  }
  return out;
}

/** Non-deleted entries whose day-bucket falls in [from, to] inclusive, newest first (for display lists). */
export function entriesInRange(s: MoodState, from: DateKey, to: DateKey, prefs: Prefs): Entry[] {
  return activeInRange(s, from, to, prefs).sort((a, b) => compareDateTime(b.timestamp, a.timestamp));
}

export const entriesOnDay = (s: MoodState, day: DateKey, prefs: Prefs): Entry[] => entriesInRange(s, day, day, prefs);

/** Average mood (1..5) across a range, or null when nothing is logged. */
export function averageMood(s: MoodState, from: DateKey, to: DateKey, prefs: Prefs): number | null {
  let sum = 0;
  let n = 0;
  for (const e of activeInRange(s, from, to, prefs)) {
    const sc = entryScore(s, e, prefs);
    if (sc !== null) {
      sum += sc;
      n++;
    }
  }
  return n ? sum / n : null;
}

/** Average mood of a single day, used to colour a calendar cell. */
export const dayAverage = (s: MoodState, day: DateKey, prefs: Prefs): number | null => averageMood(s, day, day, prefs);

/** The 7 days ending today (oldest first): average mood + entry count per day. */
export function weekSeries(s: MoodState, todayTs: ISODateTime, prefs: Prefs): { day: DateKey; avg: number | null; count: number }[] {
  const today = dayBucket(todayTs, prefs.dayStartHour);
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6);
    const es = entriesOnDay(s, day, prefs);
    return { day, avg: averageMood(s, day, day, prefs), count: es.length };
  });
}

/** Per-day count + average mood for ONE logged day. */
export interface DayAgg {
  count: number;
  avg: number | null;
}

/**
 * Count + average mood for EVERY logged day in a single linear pass over the
 * store. The Calendar grid used to call `entriesOnDay` + `dayAverage` per cell
 * (~84 full filter+sort passes over all entries each render), which froze the
 * JS thread once a journal grew large. Build this map once (memoised on the
 * store) and every cell / sparkline point is an O(1) lookup instead.
 */
export function dayAggregates(s: MoodState, prefs: Prefs): Map<DateKey, DayAgg> {
  const acc = new Map<DateKey, { count: number; sum: number; n: number }>();
  for (const e of s.entries) {
    if (e.deleted) continue;
    const key = dayBucket(e.timestamp, prefs.dayStartHour);
    let a = acc.get(key);
    if (!a) {
      a = { count: 0, sum: 0, n: 0 };
      acc.set(key, a);
    }
    a.count++;
    const sc = entryScore(s, e, prefs);
    if (sc !== null) {
      a.sum += sc;
      a.n++;
    }
  }
  const out = new Map<DateKey, DayAgg>();
  for (const [k, a] of acc) out.set(k, { count: a.count, avg: a.n ? a.sum / a.n : null });
  return out;
}

/** Tag usage counts across a range, most-used first. */
export function topTags(s: MoodState, from: DateKey, to: DateKey, prefs: Prefs, limit = 5): { tagId: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of activeInRange(s, from, to, prefs)) for (const t of e.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .map(([tagId, count]) => ({ tagId, count }))
    .sort((a, b) => b.count - a.count || a.tagId.localeCompare(b.tagId))
    .slice(0, limit);
}

/** Entry count and average mood per part of the day (morning/afternoon/...). */
export function timeOfDayBreakdown(s: MoodState, from: DateKey, to: DateKey, prefs: Prefs): Record<TimeOfDay, { count: number; avg: number | null }> {
  const acc: Record<TimeOfDay, { sum: number; n: number }> = {
    morning: { sum: 0, n: 0 },
    afternoon: { sum: 0, n: 0 },
    evening: { sum: 0, n: 0 },
    night: { sum: 0, n: 0 },
  };
  for (const e of activeInRange(s, from, to, prefs)) {
    const sc = entryScore(s, e, prefs);
    const slot = acc[timeOfDay(e.timestamp)];
    slot.n++;
    if (sc !== null) slot.sum += sc;
  }
  const out = {} as Record<TimeOfDay, { count: number; avg: number | null }>;
  (Object.keys(acc) as TimeOfDay[]).forEach((k) => (out[k] = { count: acc[k].n, avg: acc[k].n ? acc[k].sum / acc[k].n : null }));
  return out;
}

/** How often each mood was used in a range (for the donut), most-used first. */
export function moodDistribution(s: MoodState, from: DateKey, to: DateKey, prefs: Prefs): { moodId: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of activeInRange(s, from, to, prefs)) for (const m of e.moods) counts.set(m.moodId, (counts.get(m.moodId) ?? 0) + 1);
  return [...counts.entries()].map(([moodId, count]) => ({ moodId, count })).sort((a, b) => b.count - a.count);
}

export interface TagCorrelation {
  tagId: string;
  /** Entries in range that carry this tag AND resolve to a mood score. */
  count: number;
  /** Average mood (1..5) of those entries. */
  avg: number;
  /** How far that sits from the range's overall average (+ = lifts, − = weighs). */
  delta: number;
}

/**
 * On-device tag→mood correlations for a range — Floria's "smarter insights
 * without setup" edge over a plain mood log. For every tag used on at least
 * `minCount` scored entries, the average mood of entries carrying it and how
 * far that sits from the range's overall average. Strongest effect first, ties
 * broken by sample size then id so the order is deterministic. Pure + offline:
 * no network, no model, no setup. Returns [] until there's an overall average.
 */
export function tagCorrelations(s: MoodState, from: DateKey, to: DateKey, prefs: Prefs, minCount = 2): TagCorrelation[] {
  const overall = averageMood(s, from, to, prefs);
  if (overall === null) return [];
  const acc = new Map<string, { sum: number; n: number }>();
  for (const e of activeInRange(s, from, to, prefs)) {
    const sc = entryScore(s, e, prefs);
    if (sc === null) continue;
    for (const t of new Set(e.tags)) {
      const a = acc.get(t) ?? { sum: 0, n: 0 };
      a.sum += sc;
      a.n++;
      acc.set(t, a);
    }
  }
  return [...acc.entries()]
    .filter(([, a]) => a.n >= minCount)
    .map(([tagId, a]) => ({ tagId, count: a.n, avg: a.sum / a.n, delta: a.sum / a.n - overall }))
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || y.count - x.count || x.tagId.localeCompare(y.tagId));
}

/** Average note sentiment across a range (only entries with a sentiment). */
export function averageSentiment(s: MoodState, from: DateKey, to: DateKey, prefs: Prefs): number | null {
  let sum = 0;
  let n = 0;
  for (const e of activeInRange(s, from, to, prefs)) {
    if (e.sentiment) {
      sum += e.sentiment.score;
      n++;
    }
  }
  return n ? sum / n : null;
}

export interface RangeStats {
  from: DateKey;
  to: DateKey;
  entries: number;
  daysLogged: number;
  avgMood: number | null;
  streak: number;
  bestStreak: number;
  topTags: { tagId: string; count: number }[];
  tagLinks: TagCorrelation[];
  timeOfDay: Record<TimeOfDay, { count: number; avg: number | null }>;
  byMood: { moodId: string; count: number }[];
  avgSentiment: number | null;
  enoughData: boolean;
}

/** One concise bundle powering the Insights screen for [from, to]. */
export function rangeStats(s: MoodState, from: DateKey, to: DateKey, todayTs: ISODateTime, prefs: Prefs): RangeStats {
  const es = activeInRange(s, from, to, prefs);
  const days = new Set(es.map((e) => bucketOf(e, prefs)));
  return {
    from,
    to,
    entries: es.length,
    daysLogged: days.size,
    avgMood: averageMood(s, from, to, prefs),
    streak: currentStreak(s, todayTs, prefs),
    bestStreak: bestStreak(s, prefs),
    topTags: topTags(s, from, to, prefs),
    tagLinks: tagCorrelations(s, from, to, prefs),
    timeOfDay: timeOfDayBreakdown(s, from, to, prefs),
    byMood: moodDistribution(s, from, to, prefs),
    avgSentiment: averageSentiment(s, from, to, prefs),
    enoughData: days.size >= MIN_INSIGHT_DAYS,
  };
}

/** A short "This week" range ending today (day-start applied). */
export function weekRange(todayTs: ISODateTime, prefs: Prefs): { from: DateKey; to: DateKey } {
  const to = dayBucket(todayTs, prefs.dayStartHour);
  return { from: addDays(to, -6), to };
}
export function monthRange(todayTs: ISODateTime, prefs: Prefs): { from: DateKey; to: DateKey } {
  const to = dayBucket(todayTs, prefs.dayStartHour);
  return { from: addDays(to, -29), to };
}

/** 0..1 "today is logged" signal for the Home ring. */
export function loggedTodayRatio(s: MoodState, todayTs: ISODateTime, prefs: Prefs): number {
  const today = dayBucket(todayTs, prefs.dayStartHour);
  return entriesOnDay(s, today, prefs).length > 0 ? 1 : 0;
}

/** Normalise a 1..5 mood average to 0..1 (for rings/progress). */
export function moodToRatio(avg: number | null): number {
  if (avg === null) return 0;
  return (avg - MOOD_SCORE_MIN) / (MOOD_SCORE_MAX - MOOD_SCORE_MIN);
}

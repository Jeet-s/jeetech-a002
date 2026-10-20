/// <reference types="node" />
/**
 * Core-logic tests for Floria Mood Journal — run by QA with `npm run validate`.
 * Every rule in src/core is exercised through the real functions: dates &
 * day-start/grace, moods & tags, entries (logging, de-dupe, backfill, edit),
 * streaks & insights, reminders, security lock, backup/restore, exports, Pro
 * gating, AI-result handling, and the sim round-trip.
 *
 * Final stdout line is JSON: {"tests","passed","failures","features"}.
 */
import {
  // dates
  addDays,
  addMinutes,
  compareDateTime,
  dayBucket,
  graceBucket,
  isValidTime,
  minutesBetween,
  timeOfDay,
  weekdayLabel,
  // model
  AUDIT_LIMIT,
  DEFAULT_MOODS,
  DEFAULT_TAGS,
  MAX_ACTIVE_MOODS,
  MAX_MOODS_PER_ENTRY,
  MAX_PIN_ATTEMPTS,
  STATE_VERSION,
  VERSION_HISTORY_LIMIT,
  emptyMoodState,
  idNum,
  type MoodState,
  // moods
  activeMoods,
  addMood,
  addTag,
  deleteMood,
  deleteTag,
  moodById,
  moodInUse,
  renameMood,
  renameTag,
  reorderMood,
  setMoodScore,
  sortedTags,
  validateMoodName,
  validateTagName,
  // entries
  activeEntries,
  addEntry,
  applySentiment,
  applyTagSuggestions,
  deleteEntry,
  editEntry,
  entryById,
  logMood,
  restoreEntry,
  setNote,
  toggleEntryMood,
  validateIntensity,
  // insights
  averageMood,
  averageSentiment,
  bestStreak,
  bucketOf,
  coveredDays,
  currentStreak,
  entryScore,
  moodDistribution,
  moodToRatio,
  rangeStats,
  tagCorrelations,
  timeOfDayBreakdown,
  topTags,
  weekRange,
  weekSeries,
  // reminders & prefs
  addReminder,
  occurrences,
  runsOnDay,
  setDayStartHour,
  setGraceMinutes,
  setIntensityEnabled,
  snoozeUntil,
  toggleReminder,
  validateReminder,
  // security
  disableLock,
  hashPin,
  isCoolingDown,
  setBiometric,
  setPin,
  shouldAutoLock,
  validatePin,
  verifyPin,
  // backup
  canExportPDF,
  canUseAdvancedInsights,
  checksum,
  createBackup,
  exportCSV,
  exportJSON,
  isUnlocked,
  restoreBackup,
  validateBackup,
} from "../src/core";
import { sim } from "../src/core/sim";

const results: { name: string; ok: boolean; why?: string }[] = [];
const features = new Set<string>();
function test(feature: string, name: string, fn: () => void) {
  features.add(feature);
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, why: String((e as Error)?.message ?? e).slice(0, 200) });
  }
}
function eq<T>(a: T, b: T, msg = "") {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function ok(cond: boolean, msg = "expected true") {
  if (!cond) throw new Error(msg);
}
function approx(a: number | null, b: number, eps = 1e-6) {
  if (a === null || Math.abs(a - b) > eps) throw new Error(`expected ~${b}, got ${a}`);
}

const NOON = "2026-03-10T12:00";
const base = emptyMoodState();
const [M1, M2, M3, , M5] = base.moods.map((m) => m.id); // Great(5) Good(4) Okay(3) Low(2) Awful(1)
const T1 = base.tags[0].id;

const log = (s: MoodState, moodId: string, ts: string) => addEntry(s, { moods: [{ moodId }], timestamp: ts }, ts).state;

// ── Dates & day-start/grace ──────────────────────────────────────────────────
test("dates", "addDays forward", () => eq(addDays("2026-03-10", 1), "2026-03-11"));
test("dates", "addDays across month", () => eq(addDays("2026-01-31", 1), "2026-02-01"));
test("dates", "addDays across year backwards", () => eq(addDays("2026-01-01", -1), "2025-12-31"));
test("dates", "addDays leap day", () => eq(addDays("2028-02-28", 1), "2028-02-29"));
test("dates", "weekday label", () => eq(weekdayLabel("2026-03-10"), "Tue"));
test("dates", "addMinutes rolls the clock", () => eq(addMinutes("2026-03-10T23:30", 45), "2026-03-11T00:15"));
test("dates", "minutesBetween", () => eq(minutesBetween("2026-03-10T09:00", "2026-03-10T10:30"), 90));
test("dates", "compareDateTime orders", () => ok(compareDateTime("2026-03-10T09:00", "2026-03-10T10:00") < 0));
test("dates", "isValidTime accepts/rejects", () => eq([isValidTime("08:00"), isValidTime("25:00"), isValidTime("8:0")], [true, false, false]));
test("time-of-day", "buckets by hour", () =>
  eq([timeOfDay("2026-03-10T08:00"), timeOfDay("2026-03-10T13:00"), timeOfDay("2026-03-10T19:00"), timeOfDay("2026-03-10T23:00")], ["morning", "afternoon", "evening", "night"]));
test("day-start", "before day-start rolls back to previous day", () => eq(dayBucket("2026-03-10T02:00", 4), "2026-03-09"));
test("day-start", "after day-start stays on the day", () => eq(dayBucket("2026-03-10T05:00", 4), "2026-03-10"));
test("day-start", "afternoon unaffected by day-start", () => eq(dayBucket("2026-03-10T14:00", 4), "2026-03-10"));
test("grace", "grace window keeps an early entry on the previous day", () => eq(graceBucket("2026-03-10T05:30", 4, 180), "2026-03-09"));
test("grace", "day-start is tz/DST-immune (deterministic regardless of machine zone)", () => eq(dayBucket("2026-11-01T02:30", 4), "2026-10-31"));

// ── State seed & ids ─────────────────────────────────────────────────────────
test("seed", "starts with 5 active moods", () => eq(activeMoods(base).length, DEFAULT_MOODS.length));
test("seed", "starts with 4 tags", () => eq(sortedTags(base).length, DEFAULT_TAGS.length));
test("seed", "version + nextId beyond seeded ids", () => ok(base.version === STATE_VERSION && base.moods.every((m) => idNum(m.id) < base.nextId)));

// ── Moods ────────────────────────────────────────────────────────────────────
test("moods", "add a custom mood", () => eq(addMood(base, { name: "Calm", emoji: "😌" }).state.moods.length, DEFAULT_MOODS.length + 1));
test("moods", "reject empty name", () => eq(validateMoodName(base, "   "), "empty_name"));
test("moods", "reject too-long name", () => eq(validateMoodName(base, "x".repeat(25)), "too_long"));
test("moods", "reject duplicate active name (case-insensitive)", () => eq(validateMoodName(base, "great"), "duplicate"));
test("moods", "enforce active-mood limit", () => {
  let s = base;
  while (activeMoods(s).length < MAX_ACTIVE_MOODS) s = addMood(s, { name: `Mood ${activeMoods(s).length}` }).state;
  eq(addMood(s, { name: "One too many" }).error, "limit");
});
test("moods", "rename", () => eq(renameMood(base, M1, "Amazing").state.moods[0].name, "Amazing"));
test("moods", "rename to self is allowed", () => eq(renameMood(base, M1, "Great").error, null));
test("moods", "rename onto another mood is rejected", () => eq(renameMood(base, M1, "good").error, "duplicate"));
test("moods", "mood score clamps to 1..5", () => eq([setMoodScore(base, M1, 99).moods[0].score, setMoodScore(base, M1, -4).moods[0].score], [5, 1]));
test("moods", "cannot delete the last active mood", () => {
  let s = base;
  for (const m of base.moods.slice(1)) s = deleteMood(s, m.id).state;
  eq(deleteMood(s, M1).error, "min_one");
});
test("moods", "deleting an unused mood removes it", () => eq(deleteMood(base, M1).state.moods.some((m) => m.id === M1), false));
test("moods", "deleting an in-use mood deactivates (history still resolves)", () => {
  const s = log(base, M1, NOON);
  const after = deleteMood(s, M1).state;
  ok(moodInUse(after, M1) && !!moodById(after, M1) && moodById(after, M1)!.active === false);
});
test("moods", "reorder moves a mood and renumbers", () => {
  const ids = activeMoods(reorderMood(base, M1, 4)).map((m) => m.id);
  eq([ids[4], ids.length], [M1, DEFAULT_MOODS.length]);
});

// ── Tags ─────────────────────────────────────────────────────────────────────
test("tags", "add a tag", () => eq(addTag(base, { name: "Focus" }).state.tags.length, DEFAULT_TAGS.length + 1));
test("tags", "reject duplicate tag", () => eq(validateTagName(base, "work"), "duplicate"));
test("tags", "rename a tag", () => eq(renameTag(base, T1, "Deep Work").state.tags[0].name, "Deep Work"));
test("tags", "deleting a tag strips it from entries", () => {
  const s = addEntry(base, { moods: [{ moodId: M1 }], tags: [T1] }, NOON).state;
  const after = deleteTag(s, T1);
  ok(after.tags.every((t) => t.id !== T1) && activeEntries(after)[0].tags.length === 0);
});

// ── Entries: logging, de-dupe, validation, backfill, edit ────────────────────
test("entries", "one-tap log creates a single-mood entry", () => {
  const r = logMood(base, M1, NOON);
  eq([activeEntries(r.state).length, r.state.entries[0].moods.length], [1, 1]);
});
test("entries", "rapid double-tap of the same mood de-dupes", () => {
  const first = logMood(base, M1, NOON);
  const second = logMood(first.state, M1, NOON);
  ok(second.deduped === true && activeEntries(second.state).length === 1);
});
test("entries", "a different mood makes a separate entry", () => {
  const s = logMood(base, M1, NOON).state;
  eq(activeEntries(logMood(s, M2, NOON).state).length, 2);
});
test("entries", "log rejects an unknown mood", () => eq(logMood(base, "nope", NOON).error, "unknown_mood"));
test("entries", "multi-mood entry up to 3 is allowed", () => eq(addEntry(base, { moods: [{ moodId: M1 }, { moodId: M2 }, { moodId: M3 }] }, NOON).error, null));
test("entries", "more than 3 moods is rejected", () => eq(addEntry(base, { moods: [{ moodId: M1 }, { moodId: M2 }, { moodId: M3 }, { moodId: M5 }] }, NOON).error, "too_many_moods"));
test("entries", "an entry needs at least one mood", () => eq(addEntry(base, { moods: [] }, NOON).error, "no_mood"));
test("entries", "unknown tag is rejected", () => eq(addEntry(base, { moods: [{ moodId: M1 }], tags: ["ghost"] }, NOON).error, "unknown_tag"));
test("entries", "a future timestamp is rejected", () => eq(addEntry(base, { moods: [{ moodId: M1 }], timestamp: "2026-03-11T09:00" }, NOON).error, "future"));
test("entries", "backfilling a past day is allowed", () => eq(addEntry(base, { moods: [{ moodId: M1 }], timestamp: "2026-03-03T09:00" }, NOON).error, null));
test("entries", "intensity must be an integer 1..10", () => eq([validateIntensity(5), validateIntensity(0), validateIntensity(11), validateIntensity(2.5)], [true, false, false, false]));
test("entries", "bad intensity is rejected", () => eq(addEntry(base, { moods: [{ moodId: M1, intensity: 99 }] }, NOON).error, "bad_intensity"));
test("entries", "edit replaces moods and re-validates", () => {
  const s = logMood(base, M1, NOON).state;
  const id = s.entries[0].id;
  eq(editEntry(s, id, { moods: [{ moodId: M2 }] }, NOON).state.entries[0].moods[0].moodId, M2);
});
test("entries", "autosave keeps very long notes intact", () => {
  const s = logMood(base, M1, NOON).state;
  const big = "y".repeat(50_000);
  eq(setNote(s, s.entries[0].id, big, NOON).entries[0].note.length, 50_000);
});
test("entries", "soft delete then restore is lossless", () => {
  const s = logMood(base, M1, NOON).state;
  const id = s.entries[0].id;
  const gone = deleteEntry(s, id, NOON);
  ok(activeEntries(gone).length === 0 && !!entryById(gone, id));
  eq(activeEntries(restoreEntry(gone, id, NOON)).length, 1);
});
test("entries", "toggle mood within an entry respects the max and the min", () => {
  const s = addEntry(base, { moods: [{ moodId: M1 }, { moodId: M2 }, { moodId: M3 }] }, NOON).state;
  const id = s.entries[0].id;
  eq(toggleEntryMood(s, id, M5, NOON).error, "too_many_moods");
  const single = addEntry(base, { moods: [{ moodId: M1 }] }, NOON).state;
  eq(toggleEntryMood(single, single.entries[0].id, M1, NOON).error, "no_mood");
});

// ── AI results consumed as plain data ────────────────────────────────────────
test("ai", "sentiment is clamped into range", () => {
  const s = logMood(base, M1, NOON).state;
  const after = applySentiment(s, s.entries[0].id, { score: 5, magnitude: -2 });
  eq(after.entries[0].sentiment, { score: 1, magnitude: 0 });
});
test("ai", "tag suggestions create and attach tags, de-duping by name", () => {
  const s = logMood(base, M1, NOON).state;
  const after = applyTagSuggestions(s, s.entries[0].id, ["Work", "Gym", "gym"], (st, input) => addTag(st, input));
  const names = activeEntries(after)[0].tags.map((t) => after.tags.find((x) => x.id === t)!.name);
  ok(names.includes("Work") && names.includes("Gym") && names.length === 2 && after.tags.length === DEFAULT_TAGS.length + 1);
});

// ── Insights: scores, streaks, trends ────────────────────────────────────────
test("insights", "entry score is intensity-weighted when enabled", () => {
  const s = setIntensityEnabled(base, true);
  const e = { id: "e", timestamp: NOON, moods: [{ moodId: M1, intensity: 10 }, { moodId: M5, intensity: 2 }], tags: [], note: "", deleted: false, editedAt: NOON };
  approx(entryScore(s, e, s.prefs), (5 * 10 + 1 * 2) / 12);
});
test("insights", "entry score is unweighted when intensity is off", () => {
  const e = { id: "e", timestamp: NOON, moods: [{ moodId: M1 }, { moodId: M5 }], tags: [], note: "", deleted: false, editedAt: NOON };
  approx(entryScore(base, e, base.prefs), 3);
});
test("insights", "covered days include grace-window roll-back", () => {
  const s = log(base, M1, "2026-03-10T05:30"); // day-start 4, grace 180
  const days = coveredDays(s, s.prefs);
  ok(days.has("2026-03-10") && days.has("2026-03-09"));
});
test("streaks", "streak counts up to yesterday when today isn't logged", () => {
  let s = base;
  for (const d of ["2026-03-07", "2026-03-08", "2026-03-09"]) s = log(s, M1, `${d}T12:00`);
  eq(currentStreak(s, "2026-03-10T12:00", s.prefs), 3);
});
test("streaks", "streak includes today when logged", () => {
  let s = base;
  for (const d of ["2026-03-08", "2026-03-09", "2026-03-10"]) s = log(s, M1, `${d}T12:00`);
  eq(currentStreak(s, "2026-03-10T12:00", s.prefs), 3);
});
test("streaks", "a missed day breaks the streak", () => {
  const s = log(log(base, M1, "2026-03-05T12:00"), M1, "2026-03-06T12:00");
  eq(currentStreak(s, "2026-03-10T12:00", s.prefs), 0);
});
test("streaks", "grace keeps a streak alive for a 5:30am log", () => {
  // logged yesterday noon, then at 05:30 "today" (before the 4am+grace cutoff → counts for yesterday)
  const s = log(log(base, M1, "2026-03-08T12:00"), M1, "2026-03-09T05:30");
  // "today" = 2026-03-09 bucket; yesterday 03-08 logged, 03-09 covered via grace of the 05:30 entry? grace rolls it to 03-08.
  eq(bestStreak(s, s.prefs), 2);
});
test("streaks", "best streak finds the longest run", () => {
  let s = base;
  for (const d of ["2026-01-01", "2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07"]) s = log(s, M1, `${d}T12:00`);
  eq(bestStreak(s, s.prefs), 3);
});
test("insights", "average mood over a range", () => {
  const s = log(log(base, M1, "2026-03-09T12:00"), M5, "2026-03-10T12:00"); // 5 and 1
  approx(averageMood(s, "2026-03-01", "2026-03-10", s.prefs), 3);
});
test("insights", "week series spans 7 days ending today", () => {
  const s = log(base, M1, NOON);
  const w = weekSeries(s, NOON, s.prefs);
  eq([w.length, w[6].day, w[6].count, w[0].day], [7, "2026-03-10", 1, "2026-03-04"]);
  approx(w[6].avg, 5);
});
test("insights", "top tags are counted and ranked", () => {
  let s = addEntry(base, { moods: [{ moodId: M1 }], tags: [base.tags[0].id, base.tags[1].id] }, "2026-03-09T12:00").state;
  s = addEntry(s, { moods: [{ moodId: M2 }], tags: [base.tags[0].id] }, "2026-03-10T12:00").state;
  const top = topTags(s, "2026-03-01", "2026-03-10", s.prefs);
  eq([top[0].tagId, top[0].count], [base.tags[0].id, 2]);
});
test("insights", "time-of-day breakdown counts each part", () => {
  let s = log(base, M1, "2026-03-10T08:00");
  s = log(s, M2, "2026-03-10T19:00");
  const b = timeOfDayBreakdown(s, "2026-03-01", "2026-03-31", s.prefs);
  eq([b.morning.count, b.evening.count, b.afternoon.count], [1, 1, 0]);
});
test("insights", "mood distribution ranks most-used moods", () => {
  let s = log(log(base, M1, "2026-03-10T08:00"), M1, "2026-03-10T20:00");
  s = log(s, M2, "2026-03-09T12:00");
  eq(moodDistribution(s, "2026-03-01", "2026-03-31", s.prefs)[0], { moodId: M1, count: 2 });
});
test("correlations", "tag correlations rank the strongest mood effect first", () => {
  // tags[0] rides two Awful(1) entries; tags[1] a single Great(5). Overall avg = 7/3.
  let s = addEntry(base, { moods: [{ moodId: M5 }], tags: [base.tags[0].id] }, "2026-03-08T12:00").state; // Awful(1)
  s = addEntry(s, { moods: [{ moodId: M5 }], tags: [base.tags[0].id] }, "2026-03-09T12:00").state; // Awful(1)
  s = addEntry(s, { moods: [{ moodId: M1 }], tags: [base.tags[1].id] }, "2026-03-10T12:00").state; // Great(5), used once
  const links = tagCorrelations(s, "2026-03-01", "2026-03-10", s.prefs);
  // Only tags[0] clears the 2-entry support threshold, and it pulls the mood down.
  eq([links.length, links[0].tagId, links[0].count], [1, base.tags[0].id, 2]);
  approx(links[0].avg, 1);
  ok(links[0].delta < 0, "the recurring low-mood tag should have a negative delta");
});
test("correlations", "a tag below the support threshold is dropped", () => {
  const s = addEntry(base, { moods: [{ moodId: M1 }], tags: [base.tags[0].id] }, NOON).state; // used once only
  eq(tagCorrelations(s, "2026-03-01", "2026-03-31", s.prefs), []);
});
test("correlations", "duplicate tag ids on one entry count once", () => {
  let s = addEntry(base, { moods: [{ moodId: M1 }], tags: [base.tags[0].id] }, "2026-03-09T12:00").state;
  s = addEntry(s, { moods: [{ moodId: M1 }], tags: [base.tags[0].id] }, "2026-03-10T12:00").state;
  const links = tagCorrelations(s, "2026-03-01", "2026-03-31", s.prefs);
  eq(links[0].count, 2); // two entries, not double-counted within an entry
});
test("correlations", "no overall average yields no correlations", () => eq(tagCorrelations(base, "2026-03-01", "2026-03-31", base.prefs), []));
test("correlations", "rangeStats carries tag links", () => {
  let s = addEntry(base, { moods: [{ moodId: M5 }], tags: [base.tags[0].id] }, "2026-03-09T12:00").state;
  s = addEntry(s, { moods: [{ moodId: M5 }], tags: [base.tags[0].id] }, "2026-03-10T12:00").state;
  const { from, to } = weekRange("2026-03-10T12:00", s.prefs);
  ok(rangeStats(s, from, to, "2026-03-10T12:00", s.prefs).tagLinks.length >= 1);
});
test("insights", "average note sentiment over a range", () => {
  let s = logMood(base, M1, "2026-03-10T09:00").state;
  s = applySentiment(s, s.entries[0].id, { score: 0.8, magnitude: 1 });
  s = logMood(s, M2, "2026-03-10T20:00").state;
  s = applySentiment(s, activeEntries(s)[0].id, { score: 0.2, magnitude: 1 });
  approx(averageSentiment(s, "2026-03-01", "2026-03-31", s.prefs), 0.5);
});
test("insights", "range stats flags not-enough-data under 3 days", () => {
  const s = log(log(base, M1, "2026-03-09T12:00"), M2, "2026-03-10T12:00");
  const { from, to } = weekRange("2026-03-10T12:00", s.prefs);
  eq(rangeStats(s, from, to, "2026-03-10T12:00", s.prefs).enoughData, false);
});
test("insights", "mood average maps to a 0..1 ratio", () => eq([moodToRatio(5), moodToRatio(3), moodToRatio(null)], [1, 0.5, 0]));
test("insights", "bucketOf applies the day-start", () => eq(bucketOf({ id: "e", timestamp: "2026-03-10T02:00", moods: [{ moodId: M1 }], tags: [], note: "", deleted: false, editedAt: NOON }, base.prefs), "2026-03-09"));

// ── Reminders & prefs ────────────────────────────────────────────────────────
test("reminders", "valid reminder passes", () => eq(validateReminder({ time: "08:00", daysOfWeek: [1, 2, 3, 4, 5] }), null));
test("reminders", "bad time is rejected", () => eq(validateReminder({ time: "9am" }), "bad_time"));
test("reminders", "bad day-of-week is rejected", () => eq(validateReminder({ time: "08:00", daysOfWeek: [7] }), "bad_days"));
test("reminders", "bad hourly range is rejected", () => eq(validateReminder({ time: "08:00", hourlyRange: { start: "21:00", end: "09:00", intervalMinutes: 60 } }), "bad_range"));
test("reminders", "create two reminders", () => {
  const s = addReminder(addReminder(base, { time: "08:00" }).state, { time: "21:00" }).state;
  eq(s.reminders.length, 2);
});
test("reminders", "hourly range expands to fire times", () =>
  eq(occurrences({ id: "r", time: "09:00", enabled: true, daysOfWeek: [], hourlyRange: { start: "09:00", end: "12:00", intervalMinutes: 60 } }), ["09:00", "10:00", "11:00", "12:00"]));
test("reminders", "a plain reminder has one occurrence", () => eq(occurrences({ id: "r", time: "08:00", enabled: true, daysOfWeek: [] }), ["08:00"]));
test("reminders", "empty day list means every day", () => eq([runsOnDay({ id: "r", time: "08:00", enabled: true, daysOfWeek: [] }, 3), runsOnDay({ id: "r", time: "08:00", enabled: true, daysOfWeek: [1] }, 3)], [true, false]));
test("reminders", "toggle a reminder off", () => {
  const s = addReminder(base, { time: "08:00" }).state;
  eq(toggleReminder(s, s.reminders[0].id, false).reminders[0].enabled, false);
});
test("reminders", "snooze only honours 15/30/60", () => eq([snoozeUntil("2026-03-10T09:00", 30), snoozeUntil("2026-03-10T09:00", 7)], ["2026-03-10T09:30", "2026-03-10T09:15"]));
test("prefs", "day-start clamps to 0..6", () => eq([setDayStartHour(base, 9).prefs.dayStartHour, setDayStartHour(base, -3).prefs.dayStartHour], [6, 0]));
test("prefs", "grace clamps to 0..180", () => eq([setGraceMinutes(base, 999).prefs.graceMinutes, setGraceMinutes(base, -5).prefs.graceMinutes], [180, 0]));

// ── Security lock ────────────────────────────────────────────────────────────
test("security", "pin must be 4..6 digits", () => eq([validatePin("1234"), validatePin("12"), validatePin("12a4")], [null, "bad_pin", "bad_pin"]));
test("security", "pin is hashed, never stored in plaintext", () => {
  const s = setPin(base, "1234", "salt").state;
  ok(s.lock.enabled && !!s.lock.pinHash && s.lock.pinHash !== "1234" && s.lock.pinHash.startsWith("h1$"));
});
test("security", "hash is deterministic and salt-dependent", () => ok(hashPin("1234", "a") === hashPin("1234", "a") && hashPin("1234", "a") !== hashPin("1234", "b")));
test("security", "correct pin verifies", () => {
  const s = setPin(base, "1234", "salt").state;
  ok(verifyPin(s, "1234", NOON).ok);
});
test("security", "wrong pin fails and counts attempts", () => {
  const s = setPin(base, "1234", "salt").state;
  const r = verifyPin(s, "0000", NOON);
  ok(!r.ok && r.state.lock.failedAttempts === 1 && r.error === "wrong_pin");
});
test("security", "too many wrong pins triggers a cool-down", () => {
  let s = setPin(base, "1234", "salt").state;
  for (let i = 0; i < MAX_PIN_ATTEMPTS; i++) s = verifyPin(s, "0000", NOON).state;
  ok(isCoolingDown(s.lock, NOON) && verifyPin(s, "1234", NOON).error === "locked");
});
test("security", "disable requires the correct pin", () => {
  const s = setPin(base, "1234", "salt").state;
  eq(disableLock(s, "9999", NOON).error, "wrong_pin");
  ok(disableLock(s, "1234", NOON).state.lock.enabled === false);
});
test("security", "auto-lock: immediate vs timed", () => {
  const s = setBiometric(setPin(base, "1234", "salt").state, true);
  ok(shouldAutoLock(s.lock, "2026-03-10T09:00", "2026-03-10T09:00")); // 0 = immediately
  const timed = { ...s.lock, autoLockMinutes: 5 };
  ok(!shouldAutoLock(timed, "2026-03-10T09:00", "2026-03-10T09:03") && shouldAutoLock(timed, "2026-03-10T09:00", "2026-03-10T09:06"));
});

// ── Backup / restore / export / Pro gating ───────────────────────────────────
test("backup", "checksum is deterministic", () => eq(checksum("hello"), checksum("hello")));
test("backup", "create → restore round-trips the data", () => {
  let s = log(log(base, M1, "2026-03-09T12:00"), M2, "2026-03-10T12:00");
  const { state, payload } = createBackup(s, NOON);
  // mutate after backup, then restore
  const mutated = log(state, M5, "2026-03-10T13:00");
  const restored = restoreBackup(mutated, payload, NOON).state;
  eq(activeEntries(restored).length, 2);
  ok(restored.audit.some((a) => a.event === "restore" && a.success));
});
test("backup", "a corrupt payload is rejected", () => {
  const { payload } = createBackup(base, NOON);
  eq(restoreBackup(base, { ...payload, checksum: "deadbeef" }, NOON).error, "corrupt");
});
test("backup", "a newer-version payload is unsupported", () => {
  const { payload } = createBackup(base, NOON);
  eq(restoreBackup(base, { ...payload, version: 99 }, NOON).error, "unsupported");
});
test("backup", "restore clears a forgotten-PIN lock", () => {
  const { payload } = createBackup(base, NOON);
  const locked = setPin(base, "1234", "salt").state;
  eq(restoreBackup(locked, payload, NOON).state.lock.enabled, false);
});
test("backup", "version history is capped at 10", () => {
  let s = base;
  for (let i = 0; i < VERSION_HISTORY_LIMIT + 5; i++) s = createBackup(s, `2026-03-10T12:${String(i).padStart(2, "0")}`).state;
  eq(s.backups.length, VERSION_HISTORY_LIMIT);
});
test("backup", "validateBackup previews counts for a good file without mutating", () => {
  const s = log(log(base, M1, "2026-03-09T12:00"), M2, "2026-03-10T12:00");
  const { payload } = createBackup(s, NOON);
  const v = validateBackup(payload);
  ok(v.ok && v.preview!.counts.entries === 2 && v.preview!.counts.moods === DEFAULT_MOODS.length && v.preview!.counts.tags === DEFAULT_TAGS.length);
});
test("backup", "validateBackup rejects corrupt/garbage/future without throwing", () => {
  const { payload } = createBackup(base, NOON);
  eq(validateBackup({ ...payload, checksum: "deadbeef" }).error, "corrupt");
  eq(validateBackup("not an object").error, "corrupt");
  eq(validateBackup(null).error, "corrupt");
  eq(validateBackup({ ...payload, version: 99 }).error, "unsupported");
});
test("export", "CSV starts with the full header row", () => {
  eq(exportCSV(base).split("\n")[0], "timestamp,moods,intensities,tags,sentiment_score,sentiment_magnitude,note_length");
});
test("export", "CSV escapes quotes/commas and reports note length", () => {
  const renamed = renameMood(base, M1, 'Great, "wow"').state; // mood name appears in the CSV
  const logged = addEntry(renamed, { moods: [{ moodId: M1 }] }, NOON).state;
  const withNote = setNote(logged, logged.entries[0].id, "hi!", NOON);
  const row = exportCSV(withNote).split("\n")[1];
  ok(row.includes('"Great, ""wow"""'), "mood name should be CSV-escaped");
  ok(row.endsWith(",3"), "row should end with the note length (3)");
});
test("export", "JSON export omits deleted entries and parses", () => {
  const s = logMood(base, M1, NOON).state;
  const withDeleted = deleteEntry(logMood(s, M2, "2026-03-10T13:00").state, s.entries[0].id, NOON);
  const parsed = JSON.parse(exportJSON(withDeleted));
  eq(parsed.entries.length, 1);
});
test("pro-gating", "PDF export is Pro-only; core export is free", () => eq([canExportPDF(false), canExportPDF(true), isUnlocked("pdf_report", false)], [false, true, false]));
test("pro-gating", "advanced insights is Pro-only", () => eq([canUseAdvancedInsights(false), canUseAdvancedInsights(true)], [false, true]));

// ── Sim contract & migrations ────────────────────────────────────────────────
test("migration", "store migrate falls back safely for unknown data", () => {
  // emptyMoodState is the v1 shape; nextId stays ahead of all seeded ids.
  const s = emptyMoodState();
  ok(s.version === STATE_VERSION && [...s.moods, ...s.tags].every((x) => idNum(x.id) < s.nextId));
});
test("sim", "every state satisfies invariants from init", () => eq(sim.invariants(sim.init()), []));
test("sim", "state survives serialize → deserialize", () => {
  let s = sim.init();
  for (const a of sim.actions(s).slice(0, 5)) s = sim.apply(s, a);
  eq(sim.deserialize(sim.serialize(s)), s);
});
test("sim", "a scripted session reaches a goal with no invariant breaks", () => {
  let s = sim.init();
  const moods = activeMoods(s.data);
  s = sim.apply(s, { t: "log", moodId: moods[0].id });
  s = sim.apply(s, { t: "next_day" });
  s = sim.apply(s, { t: "log", moodId: moods[1].id });
  ok(sim.goals.find((g) => g.id === "weekly_insights")!.done(s) && sim.invariants(s).length === 0);
});

const failures = results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.why}`);
for (const r of results) console.error(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.why ? ` — ${r.why}` : ""}`);
console.log(JSON.stringify({ tests: results.length, passed: results.length - failures.length, failures, features: [...features] }));
process.exit(failures.length ? 1 : 0);

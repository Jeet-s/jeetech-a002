/**
 * Simulation of Floria Mood Journal for the factory's journey bots
 * (scripts/journeys.ts), implemented on the REAL core logic — no UI.
 *
 *  - Focused users must reach every core goal (one per PRD user flow) in a few
 *    actions; long/impossible flows fail QA.
 *  - Careless users fire thousands of random actions — any crash, broken data
 *    invariant, lost data on save/restore, or dead end fails QA.
 *
 * Actions are exactly what the UI offers in a given state, INCLUDING invalid
 * input the UI lets you submit (an empty mood/tag name, a bad reminder time).
 */
import { addMinutes, compareDateTime, dayBucket, type ISODateTime } from "./dates";
import {
  type BackupPayload,
  type MoodState,
  AUDIT_LIMIT,
  DAY_START_MAX,
  DAY_START_MIN,
  DEFAULT_MOODS,
  GRACE_MAX,
  GRACE_MIN,
  INTENSITY_MAX,
  INTENSITY_MIN,
  MAX_MOODS_PER_ENTRY,
  MIN_ACTIVE_MOODS,
  VERSION_HISTORY_LIMIT,
  emptyMoodState,
  idNum,
} from "./model";
import { activeMoods, addMood, addTag, moodById, reorderMood, tagById } from "./moods";
import { activeEntries, addEntry, applySentiment, logMood, setNote } from "./entries";
import { bucketOf } from "./insights";
import { addReminder } from "./reminders";
import { setBiometric, setPin } from "./security";
import { createBackup, restoreBackup } from "./backup";

export interface Goal<S> {
  id: string;
  name: string;
  done(state: S): boolean;
}

export interface AppSim<S, A> {
  init(): S;
  actions(state: S): A[];
  apply(state: S, action: A): S;
  goals: Goal<S>[];
  invariants(state: S): string[];
  serialize(state: S): string;
  deserialize(raw: string): S;
}

interface SimState {
  data: MoodState;
  pro: boolean;
  now: ISODateTime;
  backup: BackupPayload | null;
}

type Action =
  | { t: "log"; moodId: string }
  | { t: "add_mood"; name: string }
  | { t: "reorder_mood" }
  | { t: "add_tag"; name: string }
  | { t: "backfill"; moodId: string }
  | { t: "add_note" }
  | { t: "sentiment" }
  | { t: "add_reminder"; time: string }
  | { t: "set_pin" }
  | { t: "biometric" }
  | { t: "backup" }
  | { t: "restore" }
  | { t: "buy_pro" }
  | { t: "next_day" };

const SIM_PIN = "1234";
const SIM_SALT = "sim-salt";
const SAMPLE_SENTIMENT = { score: 0.6, magnitude: 1.2 }; // a fixed AI proxy result

const latestEntryId = (s: MoodState): string | null => activeEntries(s)[0]?.id ?? null;

export const sim: AppSim<SimState, Action> = {
  init: () => ({ data: emptyMoodState(), pro: false, now: "2026-03-10T09:00", backup: null }),

  actions: (s) => {
    const out: Action[] = [];
    const moods = activeMoods(s.data);
    for (const m of moods.slice(0, 2)) out.push({ t: "log", moodId: m.id });
    out.push({ t: "add_mood", name: "Calm" }, { t: "add_mood", name: "" });
    out.push({ t: "reorder_mood" });
    out.push({ t: "add_tag", name: "Focus" }, { t: "add_tag", name: "" });
    if (moods[0]) out.push({ t: "backfill", moodId: moods[0].id });
    if (latestEntryId(s.data)) out.push({ t: "add_note" }, { t: "sentiment" });
    out.push({ t: "add_reminder", time: "08:00" }, { t: "add_reminder", time: "21:00" });
    out.push({ t: "set_pin" }, { t: "biometric" });
    out.push({ t: "backup" });
    if (s.backup) out.push({ t: "restore" });
    if (!s.pro) out.push({ t: "buy_pro" });
    out.push({ t: "next_day" });
    return out;
  },

  apply: (s, a) => {
    switch (a.t) {
      case "log":
        return { ...s, data: logMood(s.data, a.moodId, s.now).state };
      case "add_mood":
        return { ...s, data: addMood(s.data, { name: a.name }).state };
      case "reorder_mood": {
        const first = activeMoods(s.data)[0];
        return first ? { ...s, data: reorderMood(s.data, first.id, activeMoods(s.data).length - 1) } : s;
      }
      case "add_tag":
        return { ...s, data: addTag(s.data, { name: a.name }).state };
      case "backfill":
        return { ...s, data: addEntry(s.data, { moods: [{ moodId: a.moodId }], timestamp: addMinutes(s.now, -1440) }, s.now).state };
      case "add_note": {
        const id = latestEntryId(s.data);
        return id ? { ...s, data: setNote(s.data, id, "A calm, grateful day.", s.now) } : s;
      }
      case "sentiment": {
        const id = latestEntryId(s.data);
        return id ? { ...s, data: applySentiment(s.data, id, SAMPLE_SENTIMENT) } : s;
      }
      case "add_reminder":
        return { ...s, data: addReminder(s.data, { time: a.time, daysOfWeek: [] }).state };
      case "set_pin":
        return { ...s, data: setPin(s.data, SIM_PIN, SIM_SALT).state };
      case "biometric":
        return { ...s, data: setBiometric(s.data, true) };
      case "backup": {
        const { state, payload } = createBackup(s.data, s.now);
        return { ...s, data: state, backup: payload };
      }
      case "restore":
        return s.backup ? { ...s, data: restoreBackup(s.data, s.backup, s.now).state } : s;
      case "buy_pro":
        return { ...s, pro: true };
      case "next_day":
        return { ...s, now: addMinutes(s.now, 1440) };
    }
  },

  goals: [
    // UF1 — Ultra-fast mood log
    { id: "log_mood", name: "Log a mood in one tap", done: (s) => activeEntries(s.data).length > 0 },
    // UF2 — Customize moods (add a new mood)
    { id: "customize_moods", name: "Add a custom mood", done: (s) => s.data.moods.length > DEFAULT_MOODS.length },
    // UF3 — Set multiple reminders
    { id: "multiple_reminders", name: "Create two reminders", done: (s) => s.data.reminders.length >= 2 },
    // UF4 — Back up and restore
    { id: "backup_restore", name: "Back up and restore data", done: (s) => s.data.audit.some((e) => e.event === "restore" && e.success) },
    // UF5 — Weekly summary (data across multiple days)
    { id: "weekly_insights", name: "Log across multiple days", done: (s) => new Set(activeEntries(s.data).map((e) => bucketOf(e, s.data.prefs))).size >= 2 },
    // UF6 — Edit / backfill a missed day
    { id: "backfill_entry", name: "Backfill a missed day", done: (s) => activeEntries(s.data).some((e) => bucketOf(e, s.data.prefs) < dayBucket(s.now, s.data.prefs.dayStartHour)) },
    // UF7 — Enable app lock
    { id: "enable_lock", name: "Secure with PIN + biometric", done: (s) => s.data.lock.enabled && !!s.data.lock.pinHash && s.data.lock.biometric },
    // UF8 — Pro upgrade
    { id: "go_pro", name: "Unlock Pro", done: (s) => s.pro },
  ],

  invariants: (s) => {
    const out: string[] = [];
    const d = s.data;

    // Unique ids + nextId monotonicity across every entity.
    const ids = new Set<string>();
    const all = [
      ...d.moods.map((m) => m.id),
      ...d.tags.map((t) => t.id),
      ...d.entries.map((e) => e.id),
      ...d.reminders.map((r) => r.id),
      ...d.backups.map((b) => b.id),
      ...d.audit.map((a) => a.id),
    ];
    for (const id of all) {
      if (ids.has(id)) out.push(`duplicate id ${id}`);
      ids.add(id);
      if (idNum(id) >= d.nextId) out.push(`${id} >= nextId ${d.nextId}`);
    }
    if (!Number.isInteger(d.nextId) || d.nextId < 1) out.push(`bad nextId ${d.nextId}`);

    // Moods: at least one active.
    if (activeMoods(d).length < MIN_ACTIVE_MOODS) out.push("no active mood");

    // Entries: shape + referential integrity + no future timestamps.
    for (const e of d.entries) {
      if (e.moods.length < 1 || e.moods.length > MAX_MOODS_PER_ENTRY) out.push(`${e.id} has ${e.moods.length} moods`);
      for (const m of e.moods) {
        if (!moodById(d, m.moodId)) out.push(`${e.id} unknown mood ${m.moodId}`);
        if (m.intensity !== undefined && (!Number.isInteger(m.intensity) || m.intensity < INTENSITY_MIN || m.intensity > INTENSITY_MAX)) out.push(`${e.id} bad intensity ${m.intensity}`);
      }
      for (const t of e.tags) if (!tagById(d, t)) out.push(`${e.id} unknown tag ${t}`);
      if (compareDateTime(e.timestamp, s.now) > 0) out.push(`${e.id} is in the future`);
      if (e.sentiment && (e.sentiment.score < -1 || e.sentiment.score > 1 || e.sentiment.magnitude < 0)) out.push(`${e.id} bad sentiment`);
      if (typeof e.note !== "string") out.push(`${e.id} note not a string`);
    }

    // Prefs within bounds.
    if (d.prefs.dayStartHour < DAY_START_MIN || d.prefs.dayStartHour > DAY_START_MAX) out.push(`day start ${d.prefs.dayStartHour}`);
    if (d.prefs.graceMinutes < GRACE_MIN || d.prefs.graceMinutes > GRACE_MAX) out.push(`grace ${d.prefs.graceMinutes}`);

    // Lock: a PIN is never stored in plaintext.
    if (d.lock.enabled) {
      if (!d.lock.pinHash || !d.lock.salt) out.push("lock enabled without hash/salt");
      if (d.lock.pinHash === SIM_PIN || (d.lock.pinHash && !d.lock.pinHash.startsWith("h1$"))) out.push("pin looks like plaintext");
    }

    // Bounded history.
    if (d.audit.length > AUDIT_LIMIT) out.push(`audit overflow ${d.audit.length}`);
    if (d.backups.length > VERSION_HISTORY_LIMIT) out.push(`backups overflow ${d.backups.length}`);

    return out;
  },

  serialize: (s) => JSON.stringify(s),
  deserialize: (raw) => JSON.parse(raw) as SimState,
};

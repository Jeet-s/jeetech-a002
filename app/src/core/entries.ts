/**
 * Entries — the heart of the app (UF1 ultra-fast log, UF6 backfill/edit).
 *
 * Logging is one call: `logMood` creates a one-mood entry at `now`, with a
 * de-dupe guard so a rapid double-tap of the same mood doesn't make two
 * entries. Richer entries (multi-mood, tags, note, backfill) go through
 * `addEntry`/`editEntry`, which validate everything the UI can submit.
 * Deletes are soft so Undo and backup/restore never lose data.
 */
import {
  compareDateTime,
  minutesBetween,
  type ISODateTime,
} from "./dates";
import { moodById, tagById } from "./moods";
import {
  type Entry,
  type EntryMood,
  type MoodState,
  type Prefs,
  type Sentiment,
  type DomainError,
  DEDUP_SECONDS,
  INTENSITY_MAX,
  INTENSITY_MIN,
  MAX_MOODS_PER_ENTRY,
  allocId,
} from "./model";

export interface EntryInput {
  moods: EntryMood[];
  tags?: string[];
  note?: string;
  timestamp?: ISODateTime; // omitted = now; a past value is a backfill
}

/** Non-deleted entries, newest first. */
export const activeEntries = (s: MoodState): Entry[] =>
  s.entries.filter((e) => !e.deleted).sort((a, b) => compareDateTime(b.timestamp, a.timestamp));

/**
 * The single newest non-deleted entry (or undefined) in ONE linear pass — the
 * same value as `activeEntries(s)[0]` without sorting the whole store. Used on
 * the one-tap log path, which runs on every mood tap, so it must stay O(n).
 */
export function latestActiveEntry(s: MoodState): Entry | undefined {
  let latest: Entry | undefined;
  for (const e of s.entries) {
    if (e.deleted) continue;
    if (!latest || compareDateTime(e.timestamp, latest.timestamp) > 0) latest = e;
  }
  return latest;
}

export const entryById = (s: MoodState, id: string): Entry | undefined => s.entries.find((e) => e.id === id);

export function validateIntensity(v: number | undefined): boolean {
  if (v === undefined) return true;
  return Number.isInteger(v) && v >= INTENSITY_MIN && v <= INTENSITY_MAX;
}

/** Validate the moods/tags/timestamp of a would-be entry against current state. */
export function validateEntry(s: MoodState, input: EntryInput, now: ISODateTime): DomainError | null {
  const moods = input.moods ?? [];
  if (moods.length === 0) return "no_mood";
  if (moods.length > MAX_MOODS_PER_ENTRY) return "too_many_moods";
  for (const m of moods) {
    if (!moodById(s, m.moodId)) return "unknown_mood";
    if (!validateIntensity(m.intensity)) return "bad_intensity";
  }
  for (const t of input.tags ?? []) if (!tagById(s, t)) return "unknown_tag";
  if (input.timestamp && compareDateTime(input.timestamp, now) > 0) return "future";
  return null;
}

const normalizeMoods = (moods: EntryMood[]): EntryMood[] =>
  moods.map((m) => (m.intensity === undefined ? { moodId: m.moodId } : { moodId: m.moodId, intensity: m.intensity }));

/**
 * One-tap log of a single mood at `now`. Returns the same state (no new entry)
 * when the identical single mood was logged within DEDUP_SECONDS — the
 * rapid-double-tap guard the PRD asks for.
 */
export function logMood(
  s: MoodState,
  moodId: string,
  now: ISODateTime,
  opts: { intensity?: number } = {},
): { state: MoodState; error: DomainError | null; id?: string; deduped?: boolean } {
  if (!moodById(s, moodId)) return { state: s, error: "unknown_mood" };
  if (!validateIntensity(opts.intensity)) return { state: s, error: "bad_intensity" };
  const last = latestActiveEntry(s);
  if (
    last &&
    last.moods.length === 1 &&
    last.moods[0].moodId === moodId &&
    Math.abs(minutesBetween(last.timestamp, now)) * 60 <= DEDUP_SECONDS
  ) {
    return { state: s, error: null, id: last.id, deduped: true };
  }
  return addEntry(s, { moods: [{ moodId, intensity: opts.intensity }], timestamp: now }, now);
}

/** Create a full entry (defaults timestamp to now; a past timestamp = backfill). */
export function addEntry(s: MoodState, input: EntryInput, now: ISODateTime): { state: MoodState; error: DomainError | null; id?: string } {
  const error = validateEntry(s, input, now);
  if (error) return { state: s, error };
  const { id, nextId } = allocId(s, "e");
  const entry: Entry = {
    id,
    timestamp: input.timestamp ?? now,
    moods: normalizeMoods(input.moods),
    tags: [...(input.tags ?? [])],
    note: input.note ?? "",
    deleted: false,
    editedAt: now,
  };
  return { state: { ...s, entries: [...s.entries, entry], nextId }, error: null, id };
}

/** Edit moods/tags/note/timestamp of an existing entry; re-validates everything. */
export function editEntry(
  s: MoodState,
  id: string,
  patch: Partial<EntryInput>,
  now: ISODateTime,
): { state: MoodState; error: DomainError | null } {
  const current = entryById(s, id);
  if (!current) return { state: s, error: "not_found" };
  const merged: EntryInput = {
    moods: patch.moods ?? current.moods,
    tags: patch.tags ?? current.tags,
    note: patch.note ?? current.note,
    timestamp: patch.timestamp ?? current.timestamp,
  };
  const error = validateEntry(s, merged, now);
  if (error) return { state: s, error };
  const next: Entry = {
    ...current,
    timestamp: merged.timestamp!,
    moods: normalizeMoods(merged.moods),
    tags: [...(merged.tags ?? [])],
    note: merged.note ?? "",
    editedAt: now,
  };
  return { state: { ...s, entries: s.entries.map((e) => (e.id === id ? next : e)) }, error: null };
}

/** Autosave just the note text (every 2s / on blur in the UI). */
export function setNote(s: MoodState, id: string, note: string, now: ISODateTime): MoodState {
  if (!entryById(s, id)) return s;
  return { ...s, entries: s.entries.map((e) => (e.id === id ? { ...e, note, editedAt: now } : e)) };
}

/** Add/remove a mood within an entry, honouring the 1..MAX_MOODS_PER_ENTRY rule. */
export function toggleEntryMood(s: MoodState, id: string, moodId: string, now: ISODateTime): { state: MoodState; error: DomainError | null } {
  const entry = entryById(s, id);
  if (!entry) return { state: s, error: "not_found" };
  if (!moodById(s, moodId)) return { state: s, error: "unknown_mood" };
  const has = entry.moods.some((m) => m.moodId === moodId);
  if (!has && entry.moods.length >= MAX_MOODS_PER_ENTRY) return { state: s, error: "too_many_moods" };
  const moods = has ? entry.moods.filter((m) => m.moodId !== moodId) : [...entry.moods, { moodId }];
  if (moods.length === 0) return { state: s, error: "no_mood" };
  return { state: { ...s, entries: s.entries.map((e) => (e.id === id ? { ...e, moods, editedAt: now } : e)) }, error: null };
}

/** Soft-delete (reversible via restoreEntry / toast Undo). */
export function deleteEntry(s: MoodState, id: string, now: ISODateTime): MoodState {
  if (!entryById(s, id)) return s;
  return { ...s, entries: s.entries.map((e) => (e.id === id ? { ...e, deleted: true, editedAt: now } : e)) };
}
export function restoreEntry(s: MoodState, id: string, now: ISODateTime): MoodState {
  if (!entryById(s, id)) return s;
  return { ...s, entries: s.entries.map((e) => (e.id === id ? { ...e, deleted: false, editedAt: now } : e)) };
}

// ── AI results consumed as plain data (so validate/sim can feed fixed samples) ─
/** Clamp a sentiment result from the AI proxy into the valid range. */
export function clampSentiment(raw: { score: number; magnitude: number }): Sentiment {
  const score = Number.isFinite(raw.score) ? Math.max(-1, Math.min(1, raw.score)) : 0;
  const magnitude = Number.isFinite(raw.magnitude) ? Math.max(0, raw.magnitude) : 0;
  return { score, magnitude };
}

export function applySentiment(s: MoodState, id: string, raw: { score: number; magnitude: number }): MoodState {
  if (!entryById(s, id)) return s;
  const sentiment = clampSentiment(raw);
  return { ...s, entries: s.entries.map((e) => (e.id === id ? { ...e, sentiment } : e)) };
}

/**
 * Apply AI tag suggestions (an array of tag names) to an entry: create any new
 * tags, then attach up to the per-entry room, de-duplicating by name.
 */
export function applyTagSuggestions(
  s: MoodState,
  entryId: string,
  names: string[],
  addTag: (s: MoodState, input: { name: string }) => { state: MoodState; id?: string },
): MoodState {
  const entry = entryById(s, entryId);
  if (!entry) return s;
  let state = s;
  const attach = [...entry.tags];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    let tag = state.tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (!tag) {
      const res = addTag(state, { name });
      state = res.state;
      tag = res.id ? state.tags.find((t) => t.id === res.id) : undefined;
    }
    if (tag && !attach.includes(tag.id)) attach.push(tag.id);
  }
  return { ...state, entries: state.entries.map((e) => (e.id === entryId ? { ...e, tags: attach } : e)) };
}

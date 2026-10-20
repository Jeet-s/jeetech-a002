/**
 * Mood palette and tag management (UF2 "Customize moods").
 *
 * Moods are never hard-deleted while entries reference them — they are
 * deactivated so historical entries always resolve to a real mood. Tags, when
 * deleted, are also removed from every entry so no entry points at a dead tag.
 * Both rules are enforced here and checked as invariants in sim.ts.
 */
import {
  type Mood,
  type MoodState,
  type Tag,
  type DomainError,
  MAX_ACTIVE_MOODS,
  MAX_MOOD_NAME,
  MAX_TAG_NAME,
  MAX_TAGS,
  MIN_ACTIVE_MOODS,
  MOOD_SCORE_MAX,
  MOOD_SCORE_MIN,
  allocId,
} from "./model";

const clean = (s: string) => s.trim();

export const moodById = (s: MoodState, id: string): Mood | undefined => s.moods.find((m) => m.id === id);
export const tagById = (s: MoodState, id: string): Tag | undefined => s.tags.find((t) => t.id === id);

/** Active moods in display order — what Home shows. */
export const activeMoods = (s: MoodState): Mood[] => s.moods.filter((m) => m.active).sort((a, b) => a.order - b.order);
export const sortedTags = (s: MoodState): Tag[] => [...s.tags].sort((a, b) => a.order - b.order);

export function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 3;
  return Math.max(MOOD_SCORE_MIN, Math.min(MOOD_SCORE_MAX, Math.round(n)));
}

// ── Moods ────────────────────────────────────────────────────────────────────
export function validateMoodName(s: MoodState, raw: string, exceptId?: string): DomainError | null {
  const name = clean(raw);
  if (!name) return "empty_name";
  if (name.length > MAX_MOOD_NAME) return "too_long";
  if (s.moods.some((m) => m.active && m.id !== exceptId && m.name.toLowerCase() === name.toLowerCase())) return "duplicate";
  return null;
}

export function addMood(
  s: MoodState,
  input: { name: string; emoji?: string; color?: string; score?: number },
): { state: MoodState; error: DomainError | null; id?: string } {
  const error = validateMoodName(s, input.name);
  if (error) return { state: s, error };
  if (activeMoods(s).length >= MAX_ACTIVE_MOODS) return { state: s, error: "limit" };
  const { id, nextId } = allocId(s, "m");
  const order = s.moods.reduce((mx, m) => Math.max(mx, m.order), -1) + 1;
  const mood: Mood = {
    id,
    name: clean(input.name),
    emoji: input.emoji?.trim() || "🙂",
    color: input.color || "#6BCB77",
    score: clampScore(input.score ?? 3),
    order,
    active: true,
  };
  return { state: { ...s, moods: [...s.moods, mood], nextId }, error: null, id };
}

function patchMood(s: MoodState, id: string, patch: Partial<Mood>): MoodState {
  return { ...s, moods: s.moods.map((m) => (m.id === id ? { ...m, ...patch } : m)) };
}

export function renameMood(s: MoodState, id: string, name: string): { state: MoodState; error: DomainError | null } {
  if (!moodById(s, id)) return { state: s, error: "not_found" };
  const error = validateMoodName(s, name, id);
  if (error) return { state: s, error };
  return { state: patchMood(s, id, { name: clean(name) }), error: null };
}

export const setMoodColor = (s: MoodState, id: string, color: string): MoodState => patchMood(s, id, { color });
export const setMoodEmoji = (s: MoodState, id: string, emoji: string): MoodState =>
  emoji.trim() ? patchMood(s, id, { emoji: emoji.trim() }) : s;
export const setMoodScore = (s: MoodState, id: string, score: number): MoodState => patchMood(s, id, { score: clampScore(score) });

/** True when any (even deleted) entry references this mood. */
export const moodInUse = (s: MoodState, id: string): boolean => s.entries.some((e) => e.moods.some((m) => m.moodId === id));

/**
 * Delete a mood. Keeps at least one active mood. A mood with history is
 * deactivated (kept for lookup); an unused one is removed outright.
 */
export function deleteMood(s: MoodState, id: string): { state: MoodState; error: DomainError | null } {
  const mood = moodById(s, id);
  if (!mood) return { state: s, error: "not_found" };
  if (mood.active && activeMoods(s).length <= MIN_ACTIVE_MOODS) return { state: s, error: "min_one" };
  if (moodInUse(s, id)) return { state: patchMood(s, id, { active: false }), error: null };
  return { state: { ...s, moods: s.moods.filter((m) => m.id !== id) }, error: null };
}

/** Move an active mood to a new slot among the active moods; renumbers orders. */
export function reorderMood(s: MoodState, id: string, toIndex: number): MoodState {
  const list = activeMoods(s);
  const from = list.findIndex((m) => m.id === id);
  if (from < 0) return s;
  const dest = Math.max(0, Math.min(toIndex, list.length - 1));
  if (from === dest) return s;
  const reordered = [...list];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(dest, 0, moved);
  const orderById = new Map(reordered.map((m, i) => [m.id, i]));
  return { ...s, moods: s.moods.map((m) => (orderById.has(m.id) ? { ...m, order: orderById.get(m.id)! } : m)) };
}

// ── Tags ─────────────────────────────────────────────────────────────────────
export function validateTagName(s: MoodState, raw: string, exceptId?: string): DomainError | null {
  const name = clean(raw);
  if (!name) return "empty_name";
  if (name.length > MAX_TAG_NAME) return "too_long";
  if (s.tags.some((t) => t.id !== exceptId && t.name.toLowerCase() === name.toLowerCase())) return "duplicate";
  return null;
}

export function addTag(s: MoodState, input: { name: string; color?: string }): { state: MoodState; error: DomainError | null; id?: string } {
  const error = validateTagName(s, input.name);
  if (error) return { state: s, error };
  if (s.tags.length >= MAX_TAGS) return { state: s, error: "limit" };
  const { id, nextId } = allocId(s, "t");
  const order = s.tags.reduce((mx, t) => Math.max(mx, t.order), -1) + 1;
  return { state: { ...s, tags: [...s.tags, { id, name: clean(input.name), color: input.color, order }], nextId }, error: null, id };
}

export function renameTag(s: MoodState, id: string, name: string): { state: MoodState; error: DomainError | null } {
  if (!tagById(s, id)) return { state: s, error: "not_found" };
  const error = validateTagName(s, name, id);
  if (error) return { state: s, error };
  return { state: { ...s, tags: s.tags.map((t) => (t.id === id ? { ...t, name: clean(name) } : t)) }, error: null };
}

export const setTagColor = (s: MoodState, id: string, color: string): MoodState => ({
  ...s,
  tags: s.tags.map((t) => (t.id === id ? { ...t, color } : t)),
});

/** Delete a tag and strip it from every entry so no entry points at a dead tag. */
export function deleteTag(s: MoodState, id: string): MoodState {
  if (!tagById(s, id)) return s;
  return {
    ...s,
    tags: s.tags.filter((t) => t.id !== id),
    entries: s.entries.map((e) => (e.tags.includes(id) ? { ...e, tags: e.tags.filter((x) => x !== id) } : e)),
  };
}

/**
 * Small app-layer helpers shared across screens: the live wall-clock (the only
 * place a real clock enters the app — core stays pure), friendly copy for every
 * DomainError, and colour/label formatting for moods, dates and times.
 */
import {
  parseDateTime,
  type DateKey,
  type ISODateTime,
  type TimeOfDay,
} from "../core/dates";
import type { DomainError, Mood, MoodState } from "../core/model";
import { moodById } from "../core/moods";
import { palette } from "../ui";

const pad = (n: number) => String(n).padStart(2, "0");

/** Current local wall-clock as the core's "YYYY-MM-DDTHH:mm" string. */
export function nowISO(): ISODateTime {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** Today's calendar date (no day-start applied). */
export const todayKey = (): DateKey => nowISO().slice(0, 10);

/** Friendly, specific copy for every validation error the UI can surface. */
export const ERRORS: Record<DomainError, string> = {
  empty_name: "Give it a name.",
  too_long: "That name is a little too long.",
  duplicate: "You already have one with this name.",
  limit: "You've reached the limit.",
  min_one: "Keep at least one mood.",
  not_found: "That item no longer exists.",
  no_mood: "Pick at least one mood.",
  too_many_moods: "Up to 3 moods per entry.",
  unknown_mood: "That mood no longer exists.",
  unknown_tag: "That tag no longer exists.",
  bad_intensity: "Intensity must be 1–10.",
  future: "You can't log the future.",
  bad_time: "Enter a valid time.",
  bad_range: "Check the start, end and interval.",
  bad_days: "Pick valid days.",
  bad_pin: "Use a 4–6 digit PIN.",
  locked: "Too many tries — wait a moment.",
  wrong_pin: "Wrong PIN. Try again.",
  corrupt: "This backup file looks corrupted.",
  unsupported: "This backup is from a newer version.",
};

// ── Mood colour scale (1 worst … 5 best) ──────────────────────────────────────
/** Colour for a whole-number mood score — the Floria mood spectrum (see theme.moodScale). */
export const SCORE_COLORS: Record<number, string> = {
  1: "#E84D4F",
  2: "#F6943E",
  3: "#F1C94A",
  4: "#54C68A",
  5: "#3A86FF",
};
export const scoreColor = (score: number): string => SCORE_COLORS[Math.max(1, Math.min(5, Math.round(score)))];

/** A one-word label for an average mood (1..5), for captions and the hero card. */
export function moodWord(avg: number | null): string {
  if (avg === null) return "—";
  const w = ["Awful", "Low", "Okay", "Good", "Great"];
  return w[Math.max(0, Math.min(4, Math.round(avg) - 1))];
}

/** Colour a calendar cell / average gets from its mean mood (null = no data). */
export const dayColor = (avg: number | null): string => (avg === null ? palette.surfaceAlt : scoreColor(avg));

/** The emoji to show for an entry (first mood), falling back gracefully. */
export function entryEmoji(s: MoodState, moodIds: { moodId: string }[]): string {
  const first = moodIds[0] && moodById(s, moodIds[0].moodId);
  return first ? first.emoji : "🙂";
}

export const resolveMoods = (s: MoodState, ids: { moodId: string }[]): Mood[] =>
  ids.map((m) => moodById(s, m.moodId)).filter((m): m is Mood => !!m);

// ── Date & time formatting ────────────────────────────────────────────────────
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

/** "9:30 AM" from a wall-clock timestamp. */
export function timeLabel(ts: ISODateTime): string {
  const { h, mi } = parseDateTime(ts);
  const ap = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(mi)} ${ap}`;
}
/** "9:30 AM" from an "HH:mm" string. */
export function clockLabel(hhmm: string): string {
  const [h, mi] = hhmm.split(":").map(Number);
  const ap = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(mi)} ${ap}`;
}

/** "Mon, Oct 20" from a DateKey. */
export function dateLabel(key: DateKey): string {
  const { y, mo, d } = parseDateTime(key);
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow];
  return `${wd}, ${MONTHS_SHORT[mo - 1]} ${d}`;
}
/** "Monday, October 20" — longer, for headers. */
export function dateLabelLong(key: DateKey): string {
  const { y, mo, d } = parseDateTime(key);
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  const wd = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dow];
  return `${wd}, ${MONTHS[mo - 1]} ${d}`;
}
export const monthLabel = (y: number, mo: number): string => `${MONTHS[mo - 1]} ${y}`;

/** "Today" / "Yesterday" / a short date for an entry's day. */
export function relativeDay(key: DateKey): string {
  const t = todayKey();
  if (key === t) return "Today";
  const { y, mo, d } = parseDateTime(t);
  const yd = new Date(Date.UTC(y, mo - 1, d - 1));
  const ydKey = `${yd.getUTCFullYear()}-${pad(yd.getUTCMonth() + 1)}-${pad(yd.getUTCDate())}`;
  if (key === ydKey) return "Yesterday";
  return dateLabel(key);
}

// ── Offline pickers (no emoji-mart dependency) ────────────────────────────────
export const EMOJI_CHOICES = [
  "😄", "🙂", "😐", "😔", "😣", "😍", "🥰", "😌", "😎", "🤔", "😴", "😢",
  "😡", "😱", "🥳", "😤", "😇", "🙃", "😬", "😭", "😶", "🫠", "💪", "🌙",
];
export const COLOR_SWATCHES = [
  "#3A86FF", "#54C68A", "#F1C94A", "#F6943E", "#E84D4F", "#6BCB77",
  "#0EA5E9", "#14B8A6", "#8B5CF6", "#EC4899", "#5C7CFA", "#39B86B",
];

export const TOD_LABEL: Record<TimeOfDay, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
};

/**
 * Floria Mood Journal — domain model and constants.
 *
 * One persisted state object (`MoodState`) holds everything the app owns:
 * the mood palette, tags, entries, reminders, preferences, the app-lock config,
 * backup history and an audit log. Pro/entitlement lives in the factory store
 * (src/modules/store.ts) and is passed into gated functions as `pro: boolean`.
 *
 * Everything here is plain data — no React, no clocks. Functions that need the
 * current time take it explicitly as `now`/`today`.
 */
import type { DateKey, ISODateTime } from "./dates";

export type { DateKey, ISODateTime } from "./dates";

export interface Mood {
  id: string;
  name: string;
  emoji: string;
  color: string; // hex
  /** Positivity 1 (worst) .. 5 (best) — drives weighted mood averages. */
  score: number;
  order: number;
  active: boolean;
}

export interface Tag {
  id: string;
  name: string;
  color?: string;
  order: number;
}

export interface EntryMood {
  moodId: string;
  /** Optional 1-10 strength; only meaningful when prefs.intensityEnabled. */
  intensity?: number;
}

export interface Sentiment {
  score: number; // -1 .. 1
  magnitude: number; // >= 0
}

export interface Entry {
  id: string;
  /** Local wall-clock time the entry is FOR (backfill sets this to the past). */
  timestamp: ISODateTime;
  moods: EntryMood[]; // 1..MAX_MOODS_PER_ENTRY
  tags: string[]; // tag ids
  note: string; // markdown, no length cap
  sentiment?: Sentiment; // filled only when the user runs AI sentiment
  deleted: boolean; // soft-deleted so Undo + restore stay lossless
  editedAt: ISODateTime;
}

export interface HourlyRange {
  start: string; // "HH:mm"
  end: string; // "HH:mm"
  intervalMinutes: number;
}

export interface Reminder {
  id: string;
  time: string; // "HH:mm" (anchor time; ignored when hourlyRange is set)
  enabled: boolean;
  daysOfWeek: number[]; // subset of 0..6 (Sun..Sat); empty = every day
  hourlyRange?: HourlyRange;
}

export type ThemeMode = "system" | "light" | "dark" | "highContrast";

export interface Prefs {
  dayStartHour: number; // 0..6
  graceMinutes: number; // 0..180
  intensityEnabled: boolean;
  theme: ThemeMode;
  anonymousMode: boolean; // hides entry previews until unlocked
  sentimentEnabled: boolean; // whether AI sentiment features are offered
}

export interface LockConfig {
  enabled: boolean;
  pinHash: string | null; // KDF output — never the plaintext PIN
  salt: string | null;
  biometric: boolean;
  autoLockMinutes: number; // 0 = immediately
  failedAttempts: number;
  lockedUntil: ISODateTime | null; // cool-down after too many failures
}

export type AuditEvent = "backup" | "restore" | "export" | "purchase_restore" | "login";
export interface AuditEntry {
  id: string;
  event: AuditEvent;
  details: string;
  success: boolean;
  timestamp: ISODateTime;
}

export interface BackupRecord {
  id: string;
  checksum: string;
  createdAt: ISODateTime;
  sizeBytes: number;
  destination: "local" | "cloud";
}

/** The serializable contents of a backup file (encryption happens in the app). */
export interface BackupPayload {
  version: number;
  createdAt: ISODateTime;
  checksum: string;
  data: BackupData;
}
export interface BackupData {
  moods: Mood[];
  tags: Tag[];
  entries: Entry[];
  reminders: Reminder[];
  prefs: Prefs;
}

export interface MoodState {
  version: number;
  moods: Mood[];
  tags: Tag[];
  entries: Entry[];
  reminders: Reminder[];
  prefs: Prefs;
  lock: LockConfig;
  backups: BackupRecord[];
  audit: AuditEntry[];
  nextId: number;
}

// ── Limits & tunables ────────────────────────────────────────────────────────
export const MAX_MOOD_NAME = 24;
export const MAX_TAG_NAME = 24;
export const MAX_MOODS_PER_ENTRY = 3;
export const MAX_ACTIVE_MOODS = 24;
export const MAX_TAGS = 60;
export const MIN_ACTIVE_MOODS = 1;
export const INTENSITY_MIN = 1;
export const INTENSITY_MAX = 10;
export const MOOD_SCORE_MIN = 1;
export const MOOD_SCORE_MAX = 5;
export const DAY_START_MIN = 0;
export const DAY_START_MAX = 6;
export const GRACE_MIN = 0;
export const GRACE_MAX = 180;
export const PIN_MIN_LEN = 4;
export const PIN_MAX_LEN = 6;
export const MAX_PIN_ATTEMPTS = 5;
export const LOCK_COOLDOWN_MINUTES = 1;
/** Two taps of the same single mood within this window = one entry (de-dupe). */
export const DEDUP_SECONDS = 2;
export const BACKUP_VERSION = 1;
export const VERSION_HISTORY_LIMIT = 10;
export const AUDIT_LIMIT = 200;
export const SNOOZE_OPTIONS = [15, 30, 60] as const;
/** AI daily quota (enforced server-side; shown in the UI). */
export const AI_FREE_QUOTA = 5;
export const AI_PRO_QUOTA = 100;
/** A range needs at least this many logged days before Insights are meaningful. */
export const MIN_INSIGHT_DAYS = 3;

export const DEFAULT_PREFS: Prefs = {
  dayStartHour: 4,
  graceMinutes: 180,
  intensityEnabled: false,
  theme: "system",
  anonymousMode: false,
  sentimentEnabled: true,
};

export const DEFAULT_LOCK: LockConfig = {
  enabled: false,
  pinHash: null,
  salt: null,
  biometric: false,
  autoLockMinutes: 0,
  failedAttempts: 0,
  lockedUntil: null,
};

/**
 * The 5 starter moods. Colours follow the Floria mood spectrum
 * (awful→great = red→amber→yellow→green→blue) so each score reads as a distinct
 * hue on calendar tiles and charts; the drawn MoodFace uses the same scale.
 */
export const DEFAULT_MOODS: ReadonlyArray<Omit<Mood, "id" | "order" | "active">> = [
  { name: "Great", emoji: "😄", color: "#3A86FF", score: 5 },
  { name: "Good", emoji: "🙂", color: "#54C68A", score: 4 },
  { name: "Okay", emoji: "😐", color: "#F1C94A", score: 3 },
  { name: "Low", emoji: "😔", color: "#F6943E", score: 2 },
  { name: "Awful", emoji: "😣", color: "#E84D4F", score: 1 },
];

export const DEFAULT_TAGS: ReadonlyArray<Omit<Tag, "id" | "order">> = [
  { name: "Work", color: "#5C7CFA" },
  { name: "Sleep", color: "#6BCB77" },
  { name: "Social", color: "#FFCC00" },
  { name: "Health", color: "#4CD964" },
];

export const STATE_VERSION = 1;

/** A brand-new install: starter moods + tags, sensible defaults, nothing logged. */
export function emptyMoodState(): MoodState {
  let n = 1;
  const moods: Mood[] = DEFAULT_MOODS.map((m, i) => ({ ...m, id: `m${n++}`, order: i, active: true }));
  const tags: Tag[] = DEFAULT_TAGS.map((t, i) => ({ ...t, id: `t${n++}`, order: i }));
  return {
    version: STATE_VERSION,
    moods,
    tags,
    entries: [],
    reminders: [],
    prefs: { ...DEFAULT_PREFS },
    lock: { ...DEFAULT_LOCK },
    backups: [],
    audit: [],
    nextId: n,
  };
}

/** Allocate the next unique id with a type prefix (single global counter). */
export function allocId(state: MoodState, prefix: string): { id: string; nextId: number } {
  return { id: `${prefix}${state.nextId}`, nextId: state.nextId + 1 };
}

/** Numeric part of an id like "m12" → 12 (for the nextId invariant). */
export function idNum(id: string): number {
  const n = Number(id.replace(/^[a-z]+/i, ""));
  return Number.isFinite(n) ? n : -1;
}

export type DomainError =
  | "empty_name"
  | "too_long"
  | "duplicate"
  | "limit"
  | "min_one"
  | "not_found"
  | "no_mood"
  | "too_many_moods"
  | "unknown_mood"
  | "unknown_tag"
  | "bad_intensity"
  | "future"
  | "bad_time"
  | "bad_range"
  | "bad_days"
  | "bad_pin"
  | "locked"
  | "wrong_pin"
  | "corrupt"
  | "unsupported";

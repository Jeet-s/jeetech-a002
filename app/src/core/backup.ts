/**
 * Backup / restore, exports, audit log, and Pro gating (UF4, UF8).
 *
 * This models the backup FILE contents and the restore rules; the actual
 * AES-GCM encryption + passphrase (Argon2id) live in the app layer. A payload
 * carries a checksum so a corrupted file is caught, and a version so an older
 * backup can be migrated on restore. Every backup/restore/export appends to the
 * audit log, trimmed to AUDIT_LIMIT. Exports (CSV/JSON) are NEVER paywalled;
 * only the styled PDF and advanced reports are Pro.
 */
import { type ISODateTime } from "./dates";
import {
  type AuditEntry,
  type AuditEvent,
  type BackupData,
  type BackupPayload,
  type BackupRecord,
  type MoodState,
  type DomainError,
  AUDIT_LIMIT,
  BACKUP_VERSION,
  VERSION_HISTORY_LIMIT,
  allocId,
} from "./model";
import { moodById, tagById } from "./moods";
import { activeEntries } from "./entries";

/** Small, stable, order-independent string hash for integrity checks. */
export function checksum(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761) >>> 0;
    h2 = Math.imul(h2 ^ c, 1597334677) >>> 0;
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

const toBackupData = (s: MoodState): BackupData => ({
  moods: s.moods,
  tags: s.tags,
  entries: s.entries,
  reminders: s.reminders,
  prefs: s.prefs,
});

// ── Audit log ────────────────────────────────────────────────────────────────
export function appendAudit(s: MoodState, event: AuditEvent, details: string, success: boolean, now: ISODateTime): MoodState {
  const { id, nextId } = allocId(s, "a");
  const entry: AuditEntry = { id, event, details, success, timestamp: now };
  return { ...s, audit: [entry, ...s.audit].slice(0, AUDIT_LIMIT), nextId };
}
export const exportAuditJSON = (s: MoodState): string => JSON.stringify(s.audit, null, 2);

// ── Backup ─────────────────────────────────────────────────────────────────
/** Build a backup file for the current data and record it (version history capped). */
export function createBackup(s: MoodState, now: ISODateTime, destination: "local" | "cloud" = "local"): { state: MoodState; payload: BackupPayload } {
  const data = toBackupData(s);
  const body = JSON.stringify(data);
  const payload: BackupPayload = { version: BACKUP_VERSION, createdAt: now, checksum: checksum(body), data };
  const { id, nextId } = allocId(s, "b");
  const record: BackupRecord = { id, checksum: payload.checksum, createdAt: now, sizeBytes: body.length, destination };
  const withRecord: MoodState = { ...s, backups: [record, ...s.backups].slice(0, VERSION_HISTORY_LIMIT), nextId };
  return { state: appendAudit(withRecord, "backup", `${destination} ${record.sizeBytes}B`, true, now), payload };
}

export interface BackupPreview {
  createdAt: ISODateTime;
  version: number;
  /** What a restore from this file would bring in (deleted entries excluded). */
  counts: { entries: number; tags: number; moods: number; reminders: number };
}

/**
 * Validate a backup payload WITHOUT touching any data — the engine behind the
 * "Test restore" dry run and the pre-restore preview. Runs the same guards
 * restoreBackup does (supported version + intact checksum) and, on success,
 * summarises what a restore would bring in. Never throws on malformed input, so
 * the UI can feed it raw pasted/parsed JSON.
 */
export function validateBackup(payload: unknown): { ok: boolean; error?: DomainError; preview?: BackupPreview } {
  if (!payload || typeof payload !== "object") return { ok: false, error: "corrupt" };
  const p = payload as Partial<BackupPayload>;
  if (typeof p.version !== "number" || typeof p.checksum !== "string" || !p.data || typeof p.data !== "object") {
    return { ok: false, error: "corrupt" };
  }
  if (p.version > BACKUP_VERSION) return { ok: false, error: "unsupported" };
  if (checksum(JSON.stringify(p.data)) !== p.checksum) return { ok: false, error: "corrupt" };
  const d = p.data as BackupData;
  return {
    ok: true,
    preview: {
      createdAt: p.createdAt ?? "",
      version: p.version,
      counts: {
        entries: (d.entries ?? []).filter((e) => !e.deleted).length,
        tags: (d.tags ?? []).length,
        moods: (d.moods ?? []).length,
        reminders: (d.reminders ?? []).length,
      },
    },
  };
}

/** Migrate an older backup payload's data up to the current version. */
function migrateBackupData(data: BackupData, _fromVersion: number): BackupData {
  // v1 is the first version; future versions add migration steps here.
  return data;
}

/**
 * Restore from a backup payload. Rejects a bad checksum ("corrupt") or a future
 * version ("unsupported"). On success, replaces the user's data, clears any
 * forgotten-PIN lock, and audits the restore. Settings/lock schema is reset to
 * defaults for anything the payload doesn't carry.
 */
export function restoreBackup(s: MoodState, payload: BackupPayload, now: ISODateTime): { state: MoodState; error: DomainError | null } {
  if (payload.version > BACKUP_VERSION) return { state: appendAudit(s, "restore", "unsupported version", false, now), error: "unsupported" };
  const body = JSON.stringify(payload.data);
  if (checksum(body) !== payload.checksum) return { state: appendAudit(s, "restore", "checksum mismatch", false, now), error: "corrupt" };
  const data = migrateBackupData(payload.data, payload.version);
  const restored: MoodState = {
    ...s,
    moods: data.moods,
    tags: data.tags,
    entries: data.entries,
    reminders: data.reminders,
    prefs: data.prefs,
    // Forgot-PIN recovery: a restore resets the lock so the user is back in.
    lock: { enabled: false, pinHash: null, salt: null, biometric: false, autoLockMinutes: 0, failedAttempts: 0, lockedUntil: null },
  };
  return { state: appendAudit(restored, "restore", `${data.entries.length} entries`, true, now), error: null };
}

// ── Exports (free CSV/JSON; PDF/advanced are Pro) ─────────────────────────────
const csvCell = (v: string | number): string => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV of every non-deleted entry: timestamp, moods, intensities, tags, sentiment, note length. */
export function exportCSV(s: MoodState): string {
  const header = ["timestamp", "moods", "intensities", "tags", "sentiment_score", "sentiment_magnitude", "note_length"];
  const rows = activeEntries(s).map((e) => [
    e.timestamp,
    e.moods.map((m) => moodById(s, m.moodId)?.name ?? m.moodId).join("|"),
    e.moods.map((m) => (m.intensity ?? "")).join("|"),
    e.tags.map((t) => tagById(s, t)?.name ?? t).join("|"),
    e.sentiment ? e.sentiment.score.toFixed(3) : "",
    e.sentiment ? e.sentiment.magnitude.toFixed(3) : "",
    e.note.length,
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

/** Full JSON export (includes note text; nothing is truncated or locked). */
export function exportJSON(s: MoodState): string {
  return JSON.stringify(
    { exportedFrom: "Floria Mood Journal", moods: s.moods, tags: s.tags, entries: activeEntries(s), reminders: s.reminders, prefs: s.prefs },
    null,
    2,
  );
}

// ── Pro gating (core job is NEVER gated) ──────────────────────────────────────
export type ProFeature = "pdf_report" | "advanced_insights" | "themes" | "auto_cloud_backup" | "icon_packs";
export const PRO_FEATURES: ReadonlyArray<ProFeature> = ["pdf_report", "advanced_insights", "themes", "auto_cloud_backup", "icon_packs"];

export const requiresPro = (feature: ProFeature): boolean => PRO_FEATURES.includes(feature);
/** Is a Pro-only feature unlocked for this user? */
export const isUnlocked = (feature: ProFeature, pro: boolean): boolean => (requiresPro(feature) ? pro : true);

export const canExportPDF = (pro: boolean): boolean => isUnlocked("pdf_report", pro);
export const canUseAdvancedInsights = (pro: boolean): boolean => isUnlocked("advanced_insights", pro);
export const canUseCustomThemes = (pro: boolean): boolean => isUnlocked("themes", pro);
export const canAutoCloudBackup = (pro: boolean): boolean => isUnlocked("auto_cloud_backup", pro);

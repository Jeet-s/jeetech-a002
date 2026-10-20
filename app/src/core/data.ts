import { persisted, usePersisted } from "../modules/persist";
import { syncStore } from "../modules/cloud";
import { emptyMoodState, idNum, STATE_VERSION, type MoodState } from "./model";

/**
 * Floria Mood Journal — the app's own data, persisted on device.
 * Bump `version` + handle the old shape in `migrate` whenever the model changes;
 * users' entries must survive every update. All data stays offline-first; cloud
 * sync (Pro) just backs the same store.
 */
export const moodStore = persisted<MoodState>("floria_v1", emptyMoodState(), {
  version: STATE_VERSION,
  migrate: (old, fromVersion) => {
    // No older versions in the wild yet — start fresh on anything unknown.
    if (!old || typeof old !== "object") return emptyMoodState();
    void fromVersion;
    return { ...emptyMoodState(), ...(old as Partial<MoodState>) } as MoodState;
  },
});
export const useMood = () => usePersisted(moodStore);

/**
 * Cloud backup/sync of the mood store — a no-op unless the factory switched
 * cloud saving on (cloud.json). Pro-only; call after the store has loaded.
 * Idempotent: the same handle is shared by App boot and the account sheet.
 */
let moodSync: ReturnType<typeof syncStore<MoodState>> | null = null;
export function startMoodSync() {
  if (!moodSync) moodSync = syncStore(moodStore, "entries");
  return moodSync;
}

/** Union two mood states (used when signing into an account that already has data). */
function mergeMoodStates(local: MoodState, remote: MoodState): MoodState {
  const union = <T extends { id: string }>(a: T[], b: T[]): T[] => {
    const m = new Map(a.map((x) => [x.id, x]));
    for (const x of b) if (!m.has(x.id)) m.set(x.id, x);
    return [...m.values()];
  };
  const entries = new Map(local.entries.map((e) => [e.id, e]));
  for (const e of remote.entries) {
    const cur = entries.get(e.id);
    if (!cur || e.editedAt > cur.editedAt) entries.set(e.id, e);
  }
  const moods = union(local.moods, remote.moods);
  const tags = union(local.tags, remote.tags);
  const reminders = union(local.reminders, remote.reminders);
  const merged = { ...local, moods, tags, entries: [...entries.values()], reminders };
  const nextId = Math.max(local.nextId, remote.nextId, ...[...moods, ...tags, ...reminders, ...merged.entries].map((x) => idNum(x.id) + 1));
  return { ...merged, nextId };
}

/** After signing in: pull the cloud copy (merging if the account already had data). */
export async function pullMoodAfterSignIn(switched: boolean): Promise<void> {
  await startMoodSync().pullNow(switched ? { merge: mergeMoodStates } : undefined);
}

/**
 * Reconcile with the cloud right now (reads the newer copy, pushes local
 * changes). Backs the "Sync now" action in Settings so users can confirm their
 * backup on demand — day-to-day sync is automatic after every change.
 */
export async function syncMoodNow(): Promise<void> {
  await startMoodSync().pullNow();
}

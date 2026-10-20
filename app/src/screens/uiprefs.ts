/**
 * Lightweight, device-local UI preferences — view toggles and the like that are
 * NOT part of the journal data model, so they never touch backups, cloud sync
 * or the domain migrations. Persisted on their own tiny store.
 */
import { persisted, usePersisted } from "../modules/persist";

interface UiPrefs {
  /** Insights: whether the detailed charts below "Weekly Highlights" are open. */
  insightsExpanded: boolean;
}

const uiPrefs = persisted<UiPrefs>("floria_ui_v1", { insightsExpanded: false });

export const useUiPrefs = (): UiPrefs => usePersisted(uiPrefs);
export const setInsightsExpanded = (v: boolean): void => uiPrefs.set((p) => ({ ...p, insightsExpanded: v }));

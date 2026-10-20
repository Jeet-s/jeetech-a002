/**
 * Local reminder notifications (expo-notifications, POST_NOTIFICATIONS only).
 *
 * Everything here is best-effort and defensive: if permission is denied or the
 * module misbehaves, the app keeps working — reminders are still saved and
 * shown in Settings. The schedule itself is computed by pure core logic
 * (reminders.ts) and only *fired* here.
 */
import * as Notifications from "expo-notifications";
import type { Reminder } from "../core/model";
import { occurrences } from "../core/reminders";

let configured = false;
function configure() {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** Are OS notifications currently granted? */
export async function notificationsGranted(): Promise<boolean> {
  try {
    configure();
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Ask for notification permission (no-op/false if unavailable). */
export async function requestNotifications(): Promise<boolean> {
  try {
    configure();
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) return true;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Re-schedule every enabled reminder (replaces the previous schedule). */
export async function syncReminders(reminders: Reminder[]): Promise<void> {
  try {
    configure();
    await Notifications.cancelAllScheduledNotificationsAsync();
    const enabled = reminders.filter((r) => r.enabled);
    if (!enabled.length) return;
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    const content = { title: "How are you feeling?", body: "Take a second to log your mood." };
    let count = 0;
    const MAX = 60; // Android caps pending alarms; keep well under it.
    for (const r of enabled) {
      const days = r.daysOfWeek.length ? r.daysOfWeek : [null as number | null];
      for (const t of occurrences(r)) {
        const [hour, minute] = t.split(":").map(Number);
        for (const dow of days) {
          if (count >= MAX) return;
          const trigger =
            dow === null
              ? { type: Notifications.SchedulableTriggerInputTypes.DAILY as const, hour, minute }
              : { type: Notifications.SchedulableTriggerInputTypes.WEEKLY as const, weekday: dow + 1, hour, minute };
          await Notifications.scheduleNotificationAsync({ content, trigger });
          count++;
        }
      }
    }
  } catch {
    // notifications are non-critical — never surface an error to the user
  }
}

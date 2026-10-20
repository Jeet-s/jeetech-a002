/**
 * Reminders (UF3): multiple local-notification schedules — a time on chosen
 * days, optionally repeating through a daily window. Scheduling is best-effort
 * (notify.ts); schedules are always saved regardless of OS permission.
 */
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Card, EmptyState, IconButton, Pill, Segmented, Sheet, Tappable, Toggle, feedback, palette, radius, space, toast, type } from "../../ui";
import { addReminder, deleteReminder, occurrences, toggleReminder, updateReminder, validateReminder } from "../../core/reminders";
import type { Reminder } from "../../core/model";
import { moodStore, useMood } from "../../core/data";
import { analytics } from "../../modules/analytics";
import { ERRORS, clockLabel } from "../shared";
import { requestNotifications, syncReminders, notificationsGranted } from "../notify";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

function Stepper({ label, value, onDec, onInc }: { label: string; value: string; onDec: () => void; onInc: () => void }) {
  return (
    <View style={styles.stepper}>
      <Text style={type.caption}>{label}</Text>
      <View style={styles.stepRow}>
        <IconButton icon="chevronLeft" label={`${label} down`} size={40} onPress={onDec} />
        <Text style={[type.number, { fontSize: 22, minWidth: 48, textAlign: "center" }]}>{value}</Text>
        <IconButton icon="chevronRight" label={`${label} up`} size={40} onPress={onInc} />
      </View>
    </View>
  );
}

export function RemindersSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useMood();
  const reminders = s.reminders;
  const [mode, setMode] = useState<"list" | { id: string } | "new">("list");
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [days, setDays] = useState<number[]>([]);
  const [hourly, setHourly] = useState(false);
  const [endHour, setEndHour] = useState(21);
  const [interval, setIntervalMin] = useState(60);
  const [granted, setGranted] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) setMode("list");
    else notificationsGranted().then(setGranted);
  }, [visible]);

  const sync = () => syncReminders(moodStore.get().reminders);

  const openEditor = (r?: Reminder) => {
    setError(null);
    if (r) {
      const [h, mi] = r.time.split(":").map(Number);
      setHour(h);
      setMinute(mi);
      setDays(r.daysOfWeek);
      setHourly(!!r.hourlyRange);
      setEndHour(r.hourlyRange ? Number(r.hourlyRange.end.split(":")[0]) : 21);
      setIntervalMin(r.hourlyRange?.intervalMinutes ?? 60);
      setMode({ id: r.id });
    } else {
      setHour(9);
      setMinute(0);
      setDays([]);
      setHourly(false);
      setEndHour(21);
      setIntervalMin(60);
      setMode("new");
    }
  };

  const save = async () => {
    const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const input = hourly
      ? { time, daysOfWeek: days, hourlyRange: { start: time, end: `${String(endHour).padStart(2, "0")}:00`, intervalMinutes: interval } }
      : { time, daysOfWeek: days };
    const vErr = validateReminder(input);
    if (vErr) {
      feedback("error", "error");
      return setError(ERRORS[vErr]);
    }
    const editId = typeof mode === "object" ? mode.id : undefined;
    if (editId) {
      moodStore.set(updateReminder(moodStore.get(), editId, input).state);
      toast("Reminder updated");
    } else {
      const ok = await requestNotifications();
      setGranted(ok);
      moodStore.set(addReminder(moodStore.get(), input).state);
      analytics.track("reminder_created");
      toast(ok ? "Reminder set" : "Saved — enable notifications to be reminded");
    }
    feedback("success", "success");
    sync();
    setMode("list");
  };

  const remove = (id: string) => {
    moodStore.set(deleteReminder(moodStore.get(), id));
    feedback("pop", "warning");
    sync();
    toast("Reminder deleted");
    setMode("list");
  };

  const toggle = (id: string, on: boolean) => {
    moodStore.set(toggleReminder(moodStore.get(), id, on));
    sync();
  };

  const describe = (r: Reminder): string => {
    const dayStr = r.daysOfWeek.length === 0 ? "Every day" : r.daysOfWeek.length === 7 ? "Every day" : r.daysOfWeek.map((d) => DAYS[d]).join(" ");
    const occ = occurrences(r);
    const timeStr = r.hourlyRange ? `${clockLabel(r.hourlyRange.start)}–${clockLabel(r.hourlyRange.end)} · every ${r.hourlyRange.intervalMinutes}m` : clockLabel(r.time);
    return `${timeStr} · ${dayStr}${r.hourlyRange ? ` · ${occ.length}×/day` : ""}`;
  };

  const editing = typeof mode === "object";
  return (
    <Sheet visible={visible} onClose={onClose} title={mode === "list" ? "Reminders" : editing ? "Edit reminder" : "New reminder"}>
      {mode === "list" ? (
        <>
          {!granted && reminders.length > 0 ? (
            <Card style={{ backgroundColor: palette.warningSoft, shadowOpacity: 0, elevation: 0, gap: space.sm }}>
              <Text style={type.bodyStrong}>Notifications are off</Text>
              <Text style={type.caption}>Your schedules are saved. Allow notifications so Floria can nudge you.</Text>
              <Button label="Allow notifications" size="sm" onPress={async () => { const ok = await requestNotifications(); setGranted(ok); if (ok) sync(); }} />
            </Card>
          ) : null}
          {reminders.length === 0 ? (
            <EmptyState icon="bell" title="No reminders yet" body="Gentle nudges, never nags. Add a morning check-in or an evening reflection." />
          ) : (
            <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: space.sm }} showsVerticalScrollIndicator={false}>
              {reminders.map((r) => (
                <View key={r.id} style={styles.row}>
                  <Tappable label={`Edit reminder ${describe(r)}`} onPress={() => openEditor(r)} scale={0.99} style={{ flex: 1 }}>
                    <Text style={type.bodyStrong}>{r.hourlyRange ? clockLabel(r.hourlyRange.start) : clockLabel(r.time)}</Text>
                    <Text style={type.caption} numberOfLines={1}>{describe(r)}</Text>
                  </Tappable>
                  <Tappable label={`${r.enabled ? "Disable" : "Enable"} reminder`} role="switch" accessibilityState={{ checked: r.enabled }} sound="pop" onPress={() => toggle(r.id, !r.enabled)}>
                    <Pill label={r.enabled ? "On" : "Off"} tone={r.enabled ? "success" : "neutral"} />
                  </Tappable>
                </View>
              ))}
            </ScrollView>
          )}
          <Button label="Add reminder" icon="plus" size="lg" onPress={() => openEditor()} />
        </>
      ) : (
        <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ gap: space.lg }} showsVerticalScrollIndicator={false}>
          <View style={styles.timeRow}>
            <Stepper label="Hour" value={String(hour).padStart(2, "0")} onDec={() => setHour((h) => (h + 23) % 24)} onInc={() => setHour((h) => (h + 1) % 24)} />
            <Stepper label="Minute" value={String(minute).padStart(2, "0")} onDec={() => setMinute((m) => (m + 55) % 60)} onInc={() => setMinute((m) => (m + 5) % 60)} />
          </View>
          <Text style={[type.caption, { textAlign: "center" }]}>{hourly ? "Starts at " : "At "}{clockLabel(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`)}</Text>

          <View style={{ gap: space.sm }}>
            <Text style={type.label}>Repeat on (none = every day)</Text>
            <View style={styles.daysRow}>
              {DAYS.map((d, i) => {
                const on = days.includes(i);
                return (
                  <Tappable key={i} label={`Day ${d}`} role="checkbox" accessibilityState={{ checked: on }} sound="pop" onPress={() => setDays((ds) => (ds.includes(i) ? ds.filter((x) => x !== i) : [...ds, i]))} style={[styles.dayBtn, on && { backgroundColor: palette.primary, borderColor: palette.primary }]}>
                    <Text style={[type.label, { color: on ? palette.onPrimary : palette.ink }]}>{d}</Text>
                  </Tappable>
                );
              })}
            </View>
          </View>

          <Toggle label="Repeat through the day" description="Nudge every so often within a window" value={hourly} onChange={setHourly} />
          {hourly ? (
            <>
              <View style={styles.timeRow}>
                <Stepper label="Until" value={`${String(endHour).padStart(2, "0")}:00`} onDec={() => setEndHour((h) => Math.max(hour + 1, h - 1))} onInc={() => setEndHour((h) => Math.min(23, h + 1))} />
              </View>
              <View style={{ gap: space.sm }}>
                <Text style={type.label}>Every</Text>
                <Segmented options={[{ value: "30", label: "30 min" }, { value: "60", label: "1 hour" }, { value: "120", label: "2 hours" }]} value={String(interval)} onChange={(v) => setIntervalMin(Number(v))} />
              </View>
            </>
          ) : null}

          {error ? <Text style={[type.caption, { color: palette.danger }]}>{error}</Text> : null}
          <Button label={editing ? "Save reminder" : "Add reminder"} size="lg" icon="check" onPress={save} />
          {editing ? <Button label="Delete reminder" variant="danger" icon="trash" onPress={() => remove((mode as { id: string }).id)} /> : null}
          <Button label="Back" variant="ghost" sound={null} onPress={() => setMode("list")} style={{ borderWidth: 0 }} />
        </ScrollView>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 56 },
  timeRow: { flexDirection: "row", justifyContent: "center", gap: space.xl },
  stepper: { alignItems: "center", gap: space.xs },
  stepRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  daysRow: { flexDirection: "row", justifyContent: "space-between" },
  dayBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: palette.border, alignItems: "center", justifyContent: "center", backgroundColor: palette.surface },
});

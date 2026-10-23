/**
 * Journal preferences: the day-start + grace window that keep streaks fair for
 * late-night loggers, the optional 1–10 intensity scale, and anonymous mode
 * (masks note previews). All offline, applied instantly.
 *
 * Every control gives an unmistakable, immediate result: the day-start stepper
 * shows one big time that visibly jumps on each tap, the grace window is a
 * segmented picker, and a live streak card at the top recomputes with the
 * current settings so the effect of a change is always on screen.
 */
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon, IconButton, Pill, Segmented, Sheet, Toggle, feedback, palette, radius, space, type } from "../../ui";
import { setAnonymousMode, setDayStartHour, setGraceMinutes, setIntensityEnabled } from "../../core/reminders";
import { DAY_START_MAX, DAY_START_MIN } from "../../core/model";
import { minutesToTime } from "../../core/dates";
import { currentStreak, bestStreak, loggedTodayRatio } from "../../core/insights";
import { moodStore, useMood } from "../../core/data";
import { clockLabel, nowISO } from "../shared";

const pad = (n: number) => String(n).padStart(2, "0");

export function PreferencesSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useMood();
  const p = s.prefs;
  const set = (next: ReturnType<typeof setDayStartHour>) => {
    moodStore.set(next);
    feedback("pop", "select");
  };

  // The streak the current settings produce, recomputed on every change so the
  // card at the top of the sheet always reflects the day-start / grace choices.
  const { streak, best, loggedToday } = useMemo(() => {
    const now = nowISO();
    return {
      streak: currentStreak(s, now, p),
      best: bestStreak(s, p),
      loggedToday: loggedTodayRatio(s, now, p) > 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, p.dayStartHour, p.graceMinutes]);

  const dayStartClock = clockLabel(`${pad(p.dayStartHour)}:00`);
  const graceEndClock = clockLabel(minutesToTime(p.dayStartHour * 60 + p.graceMinutes));
  // The last minute that still counts toward "today" — one minute before the
  // next day starts (e.g. day start 3 AM → today closes 2:59 AM tomorrow).
  const dayCloseClock = clockLabel(minutesToTime((p.dayStartHour * 60 - 1 + 1440) % 1440));
  const atMin = p.dayStartHour <= DAY_START_MIN;
  const atMax = p.dayStartHour >= DAY_START_MAX;

  return (
    <Sheet visible={visible} onClose={onClose} title="Journal preferences">
      <View style={{ gap: space.xl }}>
        {/* Live result of the settings below — changes to day start / grace that
            move the streak show up here instantly. */}
        <View style={styles.streakCard}>
          <View style={styles.flame}>
            <Icon name="flame" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={type.overline}>Your streak with these settings</Text>
            <Text style={[type.number, { fontSize: 26 }]}>
              {streak} {streak === 1 ? "day" : "days"}
              {best > streak ? <Text style={[type.caption, { fontSize: 13 }]}>{`   best ${best}`}</Text> : null}
            </Text>
          </View>
          <Pill label={loggedToday ? "Logged today" : "Not yet today"} tone={loggedToday ? "success" : "warning"} />
        </View>

        <View style={{ gap: space.sm }}>
          <Text style={type.label}>Day starts at</Text>
          <View style={styles.stepRow}>
            <IconButton icon="chevronLeft" label="Earlier day start" size={52} onPress={() => set(setDayStartHour(moodStore.get(), p.dayStartHour - 1))} style={atMin ? styles.stepOff : undefined} />
            <View style={styles.valueBox}>
              <Text style={[type.hero, { fontSize: 34, lineHeight: 40 }]}>{dayStartClock}</Text>
            </View>
            <IconButton icon="chevronRight" label="Later day start" size={52} onPress={() => set(setDayStartHour(moodStore.get(), p.dayStartHour + 1))} style={atMax ? styles.stepOff : undefined} />
          </View>
          <Text style={[type.caption, { textAlign: "center" }]}>
            Today closes at {dayCloseClock} — late-night entries before then still count as today. Great for night owls.
          </Text>
        </View>

        <View style={{ gap: space.sm }}>
          <Text style={type.label}>Streak grace window</Text>
          <Segmented
            options={[{ value: "0", label: "Off" }, { value: "60", label: "1 hr" }, { value: "120", label: "2 hr" }, { value: "180", label: "3 hr" }]}
            value={String(p.graceMinutes)}
            onChange={(v) => set(setGraceMinutes(moodStore.get(), Number(v)))}
          />
          <Text style={type.caption}>
            {p.graceMinutes > 0
              ? `Log as late as ${graceEndClock} and still keep the previous day's streak.`
              : `Grace is off — a day only counts from ${dayStartClock}.`}
          </Text>
        </View>

        <Toggle label="Intensity scale (1–10)" description="Add a strength slider to each mood" value={p.intensityEnabled} onChange={(v) => set(setIntensityEnabled(moodStore.get(), v))} />
        <Toggle label="Anonymous mode" description="Hide note previews in lists" value={p.anonymousMode} onChange={(v) => set(setAnonymousMode(moodStore.get(), v))} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  streakCard: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.primarySoft, borderRadius: radius.lg, padding: space.md },
  flame: { width: 44, height: 44, borderRadius: 22, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center" },
  stepRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  valueBox: { flex: 1, alignItems: "center", backgroundColor: palette.surfaceAlt, borderRadius: radius.md, paddingVertical: space.sm },
  stepOff: { opacity: 0.3 },
});

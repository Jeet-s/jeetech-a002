/**
 * Journal preferences: the day-start + grace window that keep streaks fair for
 * late-night loggers, the optional 1–10 intensity scale, and anonymous mode
 * (masks note previews). All offline, applied instantly.
 */
import { StyleSheet, Text, View } from "react-native";
import { Icon, IconButton, Segmented, Sheet, Toggle, feedback, palette, radius, space, type } from "../../ui";
import { setAnonymousMode, setDayStartHour, setGraceMinutes, setIntensityEnabled } from "../../core/reminders";
import { DAY_START_MAX, DAY_START_MIN } from "../../core/model";
import { minutesToTime } from "../../core/dates";
import { moodStore, useMood } from "../../core/data";
import { clockLabel } from "../shared";

const pad = (n: number) => String(n).padStart(2, "0");

export function PreferencesSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useMood();
  const p = s.prefs;
  const set = (next: ReturnType<typeof setDayStartHour>) => {
    moodStore.set(next);
    feedback("pop", "select");
  };

  // Worked example from the live settings, so "day start + grace" is concrete.
  const dayStartClock = clockLabel(`${pad(p.dayStartHour)}:00`);
  const graceEndClock = clockLabel(minutesToTime(p.dayStartHour * 60 + p.graceMinutes));

  return (
    <Sheet visible={visible} onClose={onClose} title="Journal preferences">
      <View style={{ gap: space.xl }}>
        <View style={{ gap: space.sm }}>
          <Text style={type.label}>Day starts at</Text>
          <View style={styles.stepRow}>
            <IconButton icon="chevronLeft" label="Earlier day start" size={40} onPress={() => set(setDayStartHour(moodStore.get(), p.dayStartHour - 1))} style={{ opacity: p.dayStartHour <= DAY_START_MIN ? 0.3 : 1 }} />
            <Text style={[type.number, { fontSize: 22, minWidth: 110, textAlign: "center" }]}>{clockLabel(`${String(p.dayStartHour).padStart(2, "0")}:00`)}</Text>
            <IconButton icon="chevronRight" label="Later day start" size={40} onPress={() => set(setDayStartHour(moodStore.get(), p.dayStartHour + 1))} style={{ opacity: p.dayStartHour >= DAY_START_MAX ? 0.3 : 1 }} />
          </View>
          <Text style={type.caption}>Entries before this time count toward the day before — great for night owls.</Text>
        </View>

        <View style={{ gap: space.sm }}>
          <Text style={type.label}>Streak grace window</Text>
          <Segmented
            options={[{ value: "0", label: "Off" }, { value: "60", label: "1 hr" }, { value: "120", label: "2 hr" }, { value: "180", label: "3 hr" }]}
            value={String(p.graceMinutes)}
            onChange={(v) => set(setGraceMinutes(moodStore.get(), Number(v)))}
          />
          <Text style={type.caption}>Log a little late and still keep yesterday's streak.</Text>
        </View>

        {/* How streaks count, spelled out with the user's own times. */}
        <View style={styles.explainer}>
          <View style={styles.explainerHead}>
            <Icon name="flame" size={16} color={palette.primary} />
            <Text style={[type.label, { color: palette.ink }]}>How your streak counts</Text>
          </View>
          <View style={styles.exRow}>
            <Text style={styles.exBullet}>•</Text>
            <Text style={[type.caption, { flex: 1 }]}>A new day begins at <Text style={type.bodyStrong}>{dayStartClock}</Text> — a note before then counts for the day before (great for night owls).</Text>
          </View>
          <View style={styles.exRow}>
            <Text style={styles.exBullet}>•</Text>
            <Text style={[type.caption, { flex: 1 }]}>
              {p.graceMinutes > 0
                ? <>Log as late as <Text style={type.bodyStrong}>{graceEndClock}</Text> and it still keeps the previous day's streak.</>
                : <>Grace is off — a day only counts from <Text style={type.bodyStrong}>{dayStartClock}</Text>.</>}
            </Text>
          </View>
          <View style={styles.exRow}>
            <Text style={styles.exBullet}>•</Text>
            <Text style={[type.caption, { flex: 1 }]}>Times are read on the clock you logged at, so travel and daylight-saving shifts never drop a streak.</Text>
          </View>
        </View>

        <Toggle label="Intensity scale (1–10)" description="Add a strength slider to each mood" value={p.intensityEnabled} onChange={(v) => set(setIntensityEnabled(moodStore.get(), v))} />
        <Toggle label="Anonymous mode" description="Hide note previews in lists" value={p.anonymousMode} onChange={(v) => set(setAnonymousMode(moodStore.get(), v))} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stepRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.md },
  explainer: { backgroundColor: palette.primarySoft, borderRadius: radius.md, padding: space.md, gap: space.sm },
  explainerHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  exRow: { flexDirection: "row", gap: space.sm },
  exBullet: { color: palette.primary, fontFamily: type.bodyStrong.fontFamily },
});

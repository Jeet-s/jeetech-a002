/**
 * Calendar & History — a month grid of branded mood face-tiles (one per logged
 * day), a monthly summary row, a collapsible mood-scale legend, and a day-detail
 * sheet to review, edit, and backfill entries for any past day.
 */
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Card, EmptyState, IconButton, LineChart, MoodFace, Screen, Sheet, Stat, Tappable, moodSoft, palette, radius, shadow, space, type } from "../ui";
import { entriesOnDay, averageMood, bestStreak, dayAggregates } from "../core/insights";
import { dayBucket, parseDateTime, addDays, weekdayLabel } from "../core/dates";
import { useMood } from "../core/data";
import { art } from "../art";
import { EntryRow } from "./components";
import { EntrySheet, type EntryTarget } from "./EntrySheet";
import { nowISO, dayColor, dateLabelLong, monthLabel, moodWord, relativeDay } from "./shared";

const pad = (n: number) => String(n).padStart(2, "0");
const WD = ["S", "M", "T", "W", "T", "F", "S"];

export function CalendarScreen({ bottomInset, onPro }: { bottomInset: number; onPro: (from: string) => void }) {
  const s = useMood();
  const now = nowISO();
  const todayBucket = dayBucket(now, s.prefs.dayStartHour);
  const tp = parseDateTime(todayBucket);
  const [view, setView] = useState({ y: tp.y, mo: tp.mo });
  const [day, setDay] = useState<string | null>(null);
  const [target, setTarget] = useState<EntryTarget | null>(null);

  const daysIn = new Date(Date.UTC(view.y, view.mo, 0)).getUTCDate();
  const firstWd = new Date(Date.UTC(view.y, view.mo - 1, 1)).getUTCDay();
  const isCurrentMonth = view.y === tp.y && view.mo === tp.mo;

  const mFrom = `${view.y}-${pad(view.mo)}-01`;
  const mTo = `${view.y}-${pad(view.mo)}-${pad(daysIn)}`;

  // One linear pass over the store, reused by every grid cell and the sparkline
  // (was ~84 full filter+sort passes per render — the Calendar ANR). Memoised on
  // the store, so panning months or opening the day sheet never recomputes it.
  const byDay = useMemo(() => dayAggregates(s, s.prefs), [s]);
  const hasAny = useMemo(() => s.entries.some((e) => !e.deleted), [s]);
  const { monthAvg, monthDays, best } = useMemo(
    () => ({
      monthAvg: averageMood(s, mFrom, mTo, s.prefs),
      monthDays: [...byDay.keys()].filter((k) => k >= mFrom && k <= mTo).length,
      best: bestStreak(s, s.prefs),
    }),
    [s, byDay, mFrom, mTo],
  );

  const shift = (d: number) => {
    const m = view.mo - 1 + d;
    const y = view.y + Math.floor(m / 12);
    const mo = ((m % 12) + 12) % 12 + 1;
    if (y > tp.y || (y === tp.y && mo > tp.mo)) return; // no future months
    setView({ y, mo });
  };

  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWd; i++) cells.push(null);
  for (let d = 1; d <= daysIn; d++) cells.push(`${view.y}-${pad(view.mo)}-${pad(d)}`);

  const dayEntries = day ? entriesOnDay(s, day, s.prefs) : [];
  const daySheetAvg = day ? byDay.get(day)?.avg ?? null : null;
  // A 7-day sparkline ending on the selected day — the trend around it at a glance.
  const spark = day
    ? Array.from({ length: 7 }, (_, k) => {
        const key = addDays(day, -(6 - k));
        return { label: weekdayLabel(key).slice(0, 1), value: byDay.get(key)?.avg ?? null };
      })
    : [];
  const sparkHasData = spark.some((p) => p.value !== null);

  return (
    <>
      <Screen title="Calendar" subtitle="Browse your moods" bottomInset={bottomInset}>
        <Card style={styles.card}>
          <View style={styles.navRow}>
            <IconButton icon="chevronLeft" label="Previous month" size={40} onPress={() => shift(-1)} />
            <Text style={[type.heading, { flex: 1, textAlign: "center" }]}>{monthLabel(view.y, view.mo)}</Text>
            <IconButton icon="chevronRight" label="Next month" size={40} onPress={() => shift(1)} style={{ opacity: isCurrentMonth ? 0.3 : 1 }} />
          </View>

          <View style={styles.weekRow}>
            {WD.map((w, i) => (
              <Text key={i} style={[type.caption, styles.weekCell]}>{w}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((key, i) => {
              if (!key) return <View key={`e${i}`} style={styles.cell} />;
              const agg = byDay.get(key);
              const avg = agg ? agg.avg : null;
              const count = agg ? agg.count : 0;
              const future = key > todayBucket;
              const isToday = key === todayBucket;
              const isSel = key === day;
              const d = Number(key.slice(8));
              // Heatmap tint: days with more than one entry get a soft mood-coloured wash
              // behind the face, so a glance shows where the busy, feeling-full days were.
              const tint = count > 1 && avg !== null ? moodSoft(avg) : undefined;
              return (
                <View key={key} style={styles.cell}>
                  <Tappable
                    label={`${relativeDay(key)}${count ? `, ${count} ${count === 1 ? "entry" : "entries"}, feels ${moodWord(avg).toLowerCase()}` : future ? "" : ", no entries"}${future ? "" : ". Long-press to add"}`}
                    disabled={future}
                    sound="pop"
                    scale={0.92}
                    onPress={() => setDay(key)}
                    onLongPress={() => { if (!future) setTarget({ kind: "new", date: key }); }}
                    style={[
                      styles.dayBtn,
                      tint ? { backgroundColor: tint } : null,
                      isSel ? styles.daySel : isToday ? styles.dayToday : null,
                      future ? { opacity: 0.3 } : null,
                    ]}
                  >
                    <Text style={[type.caption, styles.dayNum, (isToday || isSel) && { color: palette.ink, fontFamily: type.bodyStrong.fontFamily }]}>{d}</Text>
                    {count ? (
                      <MoodFace score={avg ?? 3} color={dayColor(avg)} size={26} />
                    ) : future ? (
                      <View style={styles.futureDot} />
                    ) : (
                      // A hollow ring marks a past day you missed — an open invitation to backfill.
                      <View style={styles.missedDot} />
                    )}
                  </Tappable>
                </View>
              );
            })}
          </View>

          <View style={styles.summary}>
            <Stat value={String(monthDays)} label="days logged" tone={palette.primary} />
            <Stat value={monthAvg === null ? "—" : monthAvg.toFixed(1)} label={monthAvg === null ? "no data" : `avg · ${moodWord(monthAvg).toLowerCase()}`} tone={monthAvg === null ? palette.inkMuted : dayColor(monthAvg)} />
            <Stat value={String(best)} label="best streak" tone={palette.warning} />
          </View>

          {/* Compact mood-scale legend, always visible — the colour/face mapping is
              the key to reading the grid, so it never hides behind a tap. */}
          <View style={styles.legend}>
            {[1, 2, 3, 4, 5].map((sc) => (
              <View key={sc} style={styles.legItem}>
                <MoodFace score={sc} size={20} />
                <Text style={[type.caption, { fontSize: 11 }]} numberOfLines={1}>{moodWord(sc)}</Text>
              </View>
            ))}
          </View>
        </Card>

        {!hasAny ? (
          <Card>
            <EmptyState
              art={art.empty_calendar_history}
              title="No entries yet"
              body="Log a mood on the Today tab and it appears here, coloured by how your day felt."
            />
          </Card>
        ) : (
          <Text style={[type.caption, { textAlign: "center" }]}>Tap any day to see or add entries · past days can be backfilled.</Text>
        )}
      </Screen>

      <Sheet visible={!!day} onClose={() => setDay(null)} title={day ? dateLabelLong(day) : ""}>
        {sparkHasData ? (
          <View style={{ gap: space.sm }}>
            <View style={styles.daySummary}>
              <MoodFace score={daySheetAvg ?? 3} color={dayColor(daySheetAvg)} size={40} variant={daySheetAvg === null ? "soft" : "solid"} />
              <View style={{ flex: 1 }}>
                <Text style={type.bodyStrong} numberOfLines={1}>
                  {dayEntries.length ? `${dayEntries.length} ${dayEntries.length === 1 ? "entry" : "entries"} · feels ${moodWord(daySheetAvg).toLowerCase()}` : "Nothing logged this day"}
                </Text>
                <Text style={type.caption}>7-day trend ending here</Text>
              </View>
            </View>
            <LineChart data={spark} min={1} max={5} height={56} />
          </View>
        ) : null}
        {dayEntries.length === 0 ? (
          <EmptyState icon="calendar" title="Nothing logged" body="Add how this day felt — it still counts toward your history." />
        ) : (
          <View style={{ gap: space.sm }}>
            {dayEntries.map((e) => (
              <EntryRow key={e.id} s={s} entry={e} mask={s.prefs.anonymousMode} onPress={() => { setTarget({ kind: "edit", id: e.id }); setDay(null); }} />
            ))}
          </View>
        )}
        <Button
          label="Add entry"
          size="lg"
          icon="plus"
          onPress={() => { if (day) setTarget({ kind: "new", date: day }); setDay(null); }}
        />
      </Sheet>

      <EntrySheet target={target} onClose={() => setTarget(null)} onPro={onPro} />
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md, paddingHorizontal: space.md },
  navRow: { flexDirection: "row", alignItems: "center" },
  weekRow: { flexDirection: "row" },
  weekCell: { flex: 1, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 0.84, padding: 2, alignItems: "center", justifyContent: "center" },
  dayBtn: { width: "100%", height: "100%", borderRadius: radius.md, alignItems: "center", justifyContent: "center", gap: 2, borderWidth: 2, borderColor: "transparent" },
  dayToday: { borderColor: palette.primarySoft, backgroundColor: palette.primarySoft },
  // Selected reads unmistakably: a solid primary ring, soft fill and a gentle lift.
  daySel: { borderColor: palette.primary, backgroundColor: palette.primarySoft, ...shadow, shadowColor: palette.primary, shadowOpacity: 0.3 },
  dayNum: { fontVariant: ["tabular-nums"], lineHeight: 14 },
  missedDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: palette.border, backgroundColor: "transparent" },
  futureDot: { width: 8, height: 8 },
  summary: { flexDirection: "row", gap: space.sm, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
  daySummary: { flexDirection: "row", alignItems: "center", gap: space.md },
  legend: { flexDirection: "row", justifyContent: "space-around", alignItems: "flex-start", paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
  legItem: { alignItems: "center", gap: 3 },
});

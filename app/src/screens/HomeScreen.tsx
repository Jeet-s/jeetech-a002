/**
 * Home — the core job in one tap. A compact streak/avg hero, the branded mood
 * grid (one tap saves instantly, with an inline "Logged as …" confirmation that
 * offers a note, plus a 5-second Undo), and today's entries with swipe actions.
 * Everything else in the app orbits this screen.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown, LinearTransition } from "react-native-reanimated";
import {
  Button,
  Card,
  Confetti,
  EmptyState,
  HeroCard,
  Icon,
  MoodFace,
  ProgressRing,
  Screen,
  SectionHeader,
  Tappable,
  feedback,
  palette,
  radius,
  space,
  toast,
  type,
} from "../ui";
import { activeMoods, moodById } from "../core/moods";
import { logMood, deleteEntry, restoreEntry, activeEntries } from "../core/entries";
import { entriesOnDay, currentStreak, averageMood, weekRange, bestStreak, loggedTodayRatio, moodToRatio } from "../core/insights";
import { dayBucket } from "../core/dates";
import { moodStore, useMood } from "../core/data";
import { analytics } from "../modules/analytics";
import { MoodToken, EntryRow } from "./components";
import { EntrySheet, type EntryTarget } from "./EntrySheet";
import { nowISO, dateLabelLong, moodWord, timeLabel } from "./shared";

/** Streaks worth a confetti burst — keeps the celebration rare and meaningful. */
const STREAK_MILESTONES = new Set([3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 300, 365]);

/** Cap on today's rows mounted at once (each is a Swipeable) — bounds the heap. */
const MAX_TODAY_ROWS = 24;

// `n` is a per-tap nonce: it bumps on EVERY mood tap (even a de-duped re-tap of
// the same mood) so the confirmation card re-mounts and re-animates each time —
// the screen always visibly acknowledges the tap, never looks frozen.
type JustLogged = { id: string; moodId: string; n: number };

export function HomeScreen({ bottomInset, onPro, onOpenSettings }: { bottomInset: number; onPro: (from: string) => void; onOpenSettings?: () => void }) {
  const s = useMood();
  const [target, setTarget] = useState<EntryTarget | null>(null);
  const [burst, setBurst] = useState(0);
  const [just, setJust] = useState<JustLogged | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nonce = useRef(0);

  useEffect(() => () => { if (clearTimer.current) clearTimeout(clearTimer.current); }, []);

  const now = nowISO();
  const today = dayBucket(now, s.prefs.dayStartHour);
  const moods = activeMoods(s);
  // All entry-wide stats recompute only when the store or the current day
  // changes — never on a mood tap flipping `just`/`burst`/`target`. Keeps the
  // one-tap log path free of O(n) work on the JS thread.
  const { todays, streak, best, weekAvg, loggedToday, hasAny } = useMemo(() => {
    const { from, to } = weekRange(now, s.prefs);
    return {
      todays: entriesOnDay(s, today, s.prefs),
      streak: currentStreak(s, now, s.prefs),
      best: bestStreak(s, s.prefs),
      weekAvg: averageMood(s, from, to, s.prefs),
      loggedToday: loggedTodayRatio(s, now, s.prefs) > 0,
      hasAny: s.entries.some((e) => !e.deleted),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, today]);

  const flagJust = (j: Omit<JustLogged, "n"> | null) => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    setJust(j ? { ...j, n: ++nonce.current } : null);
    if (j) clearTimer.current = setTimeout(() => setJust(null), 7000);
  };

  const log = (moodId: string) => {
    const wasLoggedToday = loggedToday;
    const firstEver = !hasAny;
    const r = logMood(moodStore.get(), moodId, nowISO());
    if (r.error) {
      feedback("error", "error");
      return toast("Couldn't save — try again");
    }
    moodStore.set(r.state);
    const id = r.id!;
    // Rapid re-tap of the same mood: core de-dupes instead of making a twin
    // entry. Keep the feedback CONSISTENT — a light tap and the same
    // confirmation stays up — so every tap feels acknowledged, never silent.
    if (r.deduped) {
      feedback("pop", "light");
      // Re-flag (bumps the nonce) so the confirmation card re-animates, and say
      // so out loud — a rapid re-tap of the same mood is acknowledged, never silent.
      flagJust({ id, moodId });
      const name = moodById(s, moodId)?.name ?? "that mood";
      toast(`Already logged · ${name}`);
      return;
    }
    feedback("success", "success");
    analytics.track("core_action", { feature: "log_mood" });
    flagJust({ id, moodId });
    // Celebrate the aha (first ever) and real streak milestones only — not every day, so confetti stays special.
    // Re-logging a day already covered can't change the streak, so skip the
    // extra O(n) streak pass on that hot path (keeps rapid taps cheap).
    const newStreak = wasLoggedToday ? streak : currentStreak(r.state, nowISO(), s.prefs);
    const milestone = !wasLoggedToday && !firstEver && STREAK_MILESTONES.has(newStreak);
    if (!wasLoggedToday && (firstEver || milestone)) setBurst((b) => b + 1);
    toast(milestone ? `${newStreak}-day streak! 🎉` : "Mood saved", {
      label: "Undo",
      onPress: () => { moodStore.set(deleteEntry(moodStore.get(), id, nowISO())); flagJust(null); },
    });
  };

  const removeEntry = (id: string) => {
    moodStore.set(deleteEntry(moodStore.get(), id, nowISO()));
    feedback("pop", "warning");
    if (just?.id === id) flagJust(null);
    toast("Entry deleted", { label: "Undo", onPress: () => moodStore.set(restoreEntry(moodStore.get(), id, nowISO())) });
  };

  // Press-and-hold a mood → quick-add sheet, seeded with that mood and the tags
  // from your most recent entry, so habitual loggers reach a detailed entry fast.
  const quickAdd = (moodId: string) => {
    feedback("pop", "medium");
    const last = activeEntries(s)[0];
    setTarget({ kind: "new", seedMoodId: moodId, seedTags: last ? [...last.tags] : [] });
  };

  const openNote = (id: string) => { flagJust(null); setTarget({ kind: "edit", id }); };
  const justMood = just ? moodById(s, just.moodId) : undefined;
  // Persistent, above-the-fold proof that a tap landed: a live count of today's
  // entries and the most recent time. Both sit right above the mood grid and
  // recompute on every save, so even an identical re-tap of the same mood
  // leaves a visible change here (the count climbs) — the fix for "taps had no
  // visible effect" when the new row scrolled in below the fold.
  const lastTime = todays[0] ? timeLabel(todays[0].timestamp) : null;

  const heroValue = !hasAny ? "Hi there" : `${streak}`;
  const heroOverline = !hasAny ? "Welcome to Floria" : streak > 0 ? "Current streak" : "Today";
  const heroCaption = !hasAny
    ? "Tap a mood below to log your first."
    : streak > 0
      ? `day streak${best > streak ? ` · best ${best}` : ""}`
      : "Log today to start a streak.";

  return (
    <>
      <Screen title="Today" subtitle={dateLabelLong(today)} bottomInset={bottomInset}>
        <TrustBar locked={s.lock.enabled} onPress={onOpenSettings} />
        <HeroCard
          overline={heroOverline}
          value={heroValue}
          caption={heroCaption}
          status={{
            label: loggedToday ? "Logged today" : "Not logged yet",
            tone: loggedToday ? "success" : "warning",
            icon: loggedToday ? (
              <View style={styles.heroCheck}><Icon name="check" size={11} color="#fff" /></View>
            ) : undefined,
          }}
          right={
            <ProgressRing
              value={weekAvg === null ? 0 : moodToRatio(weekAvg)}
              size={88}
              stroke={12}
              color="#fff"
              track="rgba(255,255,255,0.26)"
              labelColor="#fff"
              label={weekAvg === null ? "–" : weekAvg.toFixed(1)}
              sublabel="7-day avg"
            />
          }
          tray={
            <>
              {/* Primary action lives right in the hero: one tap logs instantly. */}
              <View style={styles.trayHead}>
                <Text style={type.heading}>How are you feeling?</Text>
                <Text style={[type.caption, { marginTop: 1 }]}>One tap saves it — press & hold to add a note.</Text>
              </View>
              {/* Live today-counter: climbs on every save and stays on screen, so
                  the tap always produces a visible, lasting change up here. */}
              <View style={styles.todayRow}>
                <View style={[styles.statPill, loggedToday && styles.statPillOn]}>
                  <Icon name="check" size={13} color={loggedToday ? palette.success : palette.inkMuted} />
                  <Text style={[type.label, { color: loggedToday ? palette.ink : palette.inkMuted }]} numberOfLines={1}>
                    {todays.length === 0 ? "None logged yet today" : `${todays.length} logged today`}
                  </Text>
                </View>
                {lastTime ? (
                  <View style={styles.statPill}>
                    <Text style={[type.caption, { color: palette.inkSoft }]}>Last</Text>
                    <Text style={[type.label, { color: palette.ink, fontVariant: ["tabular-nums"] }]}>{lastTime}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.grid}>
                {moods.map((m) => (
                  // The most recently logged mood shows a check so a single tap
                  // leaves an unmistakable, persistent mark right on the grid.
                  <MoodToken key={m.id} mood={m} size={56} selected={just?.moodId === m.id} onPress={() => log(m.id)} onLongPress={() => quickAdd(m.id)} />
                ))}
              </View>

              {just && justMood ? (
                // Keyed by the per-tap nonce so EVERY mood tap re-mounts this
                // cleanly (one crossfade, never two overlapping) — the screen
                // visibly acknowledges each tap, even a de-duped re-tap.
                <Animated.View key={just.n} entering={FadeInDown.duration(220)}>
                  <Tappable label={`Logged as ${justMood.name}. Add a note`} onPress={() => openNote(just.id)} style={styles.confirm}>
                    <View style={styles.confirmCheck}>
                      <Icon name="check" size={15} color="#fff" />
                    </View>
                    <MoodFace score={justMood.score} color={justMood.color} size={32} />
                    <View style={{ flex: 1 }}>
                      <Text style={type.bodyStrong} numberOfLines={1}>Logged · {justMood.name}</Text>
                      <Text style={[type.caption, { color: palette.inkSoft }]} numberOfLines={1}>
                        {streak > 0 ? `${streak}-day streak going · tap to add a note` : "Tap to add a note or tags"}
                      </Text>
                    </View>
                    <View style={styles.addNote}>
                      <Icon name="plus" size={14} color={palette.primary} />
                      <Text style={[type.label, { color: palette.primary }]}>Note</Text>
                    </View>
                  </Tappable>
                </Animated.View>
              ) : (
                <Text style={[type.caption, { textAlign: "center" }]}>Logs instantly — add a note any time.</Text>
              )}
            </>
          }
        />

        {/* Always-visible route to a richer entry (multiple moods, tags and a
            note). Kept directly under the hero — not buried at the end of the
            list — so detailed logging is one obvious tap from Home. */}
        <Button
          label="Add a detailed entry"
          variant="secondary"
          icon="plus"
          onPress={() => setTarget({ kind: "new" })}
        />

        <SectionHeader
          title={todays.length ? `Today · ${todays.length} ${todays.length === 1 ? "entry" : "entries"}` : "Today"}
          action={weekAvg !== null ? <Text style={type.caption}>Week feels {moodWord(weekAvg).toLowerCase()}</Text> : undefined}
        />
        {todays.length === 0 ? (
          <Card>
            <EmptyState
              icon="flame"
              title={hasAny ? "Nothing logged today" : "Your first mood is one tap away"}
              body="Tap a mood above to capture how you feel right now. Add a note or tags any time."
            />
          </Card>
        ) : (
          <View style={{ gap: space.sm }}>
            {/* Render only the most recent rows: each is a Swipeable + animated
                view, so an unbounded list is the main heap growth under the soak
                test. A heavy logging day shows the latest MAX_TODAY_ROWS here and
                points the rest to Calendar (where the full day lives). */}
            {todays.slice(0, MAX_TODAY_ROWS).map((e) => (
              <Animated.View key={e.id} layout={LinearTransition.duration(200)} entering={FadeIn.duration(200)}>
                <EntryRow s={s} entry={e} mask={s.prefs.anonymousMode} onPress={() => setTarget({ kind: "edit", id: e.id })} onDelete={() => removeEntry(e.id)} />
              </Animated.View>
            ))}
            {todays.length > MAX_TODAY_ROWS ? (
              <Text style={[type.caption, { textAlign: "center" }]}>
                Showing the latest {MAX_TODAY_ROWS} of {todays.length} — see the full day in Calendar.
              </Text>
            ) : null}
            <Button label="Add note or detailed entry" variant="ghost" icon="plus" onPress={() => setTarget({ kind: "new" })} />
          </View>
        )}
      </Screen>

      <EntrySheet target={target} onClose={() => setTarget(null)} onPro={onPro} />
      <Confetti trigger={burst} />
    </>
  );
}

/**
 * Always-present trust strip: Floria is private and on-device, and the app lock
 * state is visible at a glance (a free feature — tap to turn it on). This is the
 * "trust by design" promise made obvious on the screen users open most.
 */
function TrustBar({ locked, onPress }: { locked: boolean; onPress?: () => void }) {
  return (
    <Tappable
      label={locked ? "Private and on-device. App lock is on. Open privacy settings." : "Private and on-device. Tap to add an app lock."}
      sound={null}
      onPress={onPress}
      disabled={!onPress}
      style={styles.trust}
    >
      <Icon name="shield" size={15} color={palette.primary} />
      <Text style={[type.caption, { color: palette.inkSoft }]} numberOfLines={1}>Private · on-device</Text>
      <View style={styles.trustDivider} />
      <Icon name="lock" size={14} color={locked ? palette.success : palette.inkMuted} />
      <Text style={[type.caption, { color: locked ? palette.success : palette.inkMuted, flexShrink: 1 }]} numberOfLines={1}>
        {locked ? "Locked" : "Add a lock"}
      </Text>
      <View style={{ flex: 1 }} />
      {onPress ? <Icon name="chevronRight" size={16} color={palette.inkMuted} /> : null}
    </Tappable>
  );
}

const styles = StyleSheet.create({
  trust: { flexDirection: "row", alignItems: "center", gap: space.xs, backgroundColor: palette.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: space.md, minHeight: 36, marginBottom: space.xs },
  trustDivider: { width: 1, height: 14, backgroundColor: palette.border, marginHorizontal: 4 },
  trayHead: { gap: 0 },
  todayRow: { flexDirection: "row", alignItems: "center", gap: space.xs, flexWrap: "wrap" },
  statPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: palette.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 10, minHeight: 30 },
  statPillOn: { backgroundColor: palette.successSoft },
  heroCheck: { width: 16, height: 16, borderRadius: 8, backgroundColor: palette.success, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", justifyContent: "space-between" },
  confirm: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.successSoft, borderRadius: radius.md, padding: space.sm + 2 },
  confirmCheck: { width: 24, height: 24, borderRadius: 12, backgroundColor: palette.success, alignItems: "center", justifyContent: "center" },
  addNote: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: palette.primarySoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
});

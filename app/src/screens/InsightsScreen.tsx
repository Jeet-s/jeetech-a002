/**
 * Insights — concise, no-setup patterns for the selected range: average mood,
 * streaks, a 7-day trend, mood mix, top tags, time-of-day, and an optional
 * AI-written weekly reflection drawn from the user's own notes. Advanced
 * correlations and shareable reports are Pro.
 */
import { useEffect, useMemo, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import {
  BarChart,
  Button,
  Card,
  DonutChart,
  EmptyState,
  HeroCard,
  Icon,
  Legend,
  LineChart,
  Pill,
  ProgressBar,
  ProgressRing,
  Screen,
  SectionHeader,
  Segmented,
  Skeleton,
  Stat,
  feedback,
  palette,
  radius,
  space,
  type,
  toast,
} from "../ui";
import { rangeStats, weekSeries, weekRange, monthRange, entriesInRange, averageMood, moodToRatio, type TagCorrelation } from "../core/insights";
import { moodById, tagById } from "../core/moods";
import type { MoodState } from "../core/model";
import { weekdayLabel, addDays, dayBucket, TIMES_OF_DAY } from "../core/dates";
import { useMood } from "../core/data";
import { useSettings } from "../modules/store";
import { analytics } from "../modules/analytics";
import { art } from "../art";
import { nowISO, moodWord, scoreColor, TOD_LABEL, dateLabel } from "./shared";
import { ai } from "../modules/ai";
import { aiEnabled, handleAiFailure, reportAiOutput, AI_DISCLAIMER } from "./useAi";
import { canExportPDF, canUseAdvancedInsights } from "../core/backup";
import { useUiPrefs, setInsightsExpanded } from "./uiprefs";
import { Tappable, type IconName } from "../ui";

export function InsightsScreen({ bottomInset, onPro }: { bottomInset: number; onPro: (from: string) => void }) {
  const s = useMood();
  const { pro } = useSettings();
  const [range, setRange] = useState<"week" | "month">("week");
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const aiOn = aiEnabled && s.prefs.sentimentEnabled;
  const expanded = useUiPrefs().insightsExpanded;

  useEffect(() => {
    analytics.track("insights_viewed", { range });
  }, [range]);

  const now = nowISO();
  const today = dayBucket(now, s.prefs.dayStartHour);
  // Every pattern here walks all entries several times (rangeStats alone is ~8
  // passes). Recompute only when the store, range or day changes — not when the
  // AI summary/busy state flips — so the screen stays responsive on a big store.
  const { from, to, stats, series, lastWeekAvg, weekDelta, weekNotes } = useMemo(() => {
    const { from, to } = range === "week" ? weekRange(now, s.prefs) : monthRange(now, s.prefs);
    const wk = weekRange(now, s.prefs);
    const thisWeekAvg = averageMood(s, wk.from, wk.to, s.prefs);
    const lastWeekAvg = averageMood(s, addDays(wk.from, -7), addDays(wk.from, -1), s.prefs);
    return {
      from,
      to,
      stats: rangeStats(s, from, to, now, s.prefs),
      series: weekSeries(s, now, s.prefs),
      lastWeekAvg,
      weekDelta: thisWeekAvg !== null && lastWeekAvg !== null ? thisWeekAvg - lastWeekAvg : null,
      weekNotes: entriesInRange(s, wk.from, wk.to, s.prefs).map((e) => e.note.trim()).filter(Boolean),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, range, today]);

  const genSummary = async () => {
    if (!weekNotes.length) return toast("Add notes to your entries first");
    setBusy(true);
    const r = await ai.run("weekly_summary", weekNotes.join("\n\n"));
    setBusy(false);
    if (r.ok) {
      setSummary(r.text.trim());
      feedback("success", "success");
    } else handleAiFailure(r, () => onPro("ai_summary"), genSummary);
  };

  const exportReport = async () => {
    analytics.track("pdf_export_attempt");
    const lines = [
      `Floria — ${range === "week" ? "This week" : "This month"} (${dateLabel(from)} – ${dateLabel(to)})`,
      ``,
      `Average mood: ${stats.avgMood === null ? "—" : `${stats.avgMood.toFixed(1)} (${moodWord(stats.avgMood)})`}`,
      `Entries: ${stats.entries} · Days logged: ${stats.daysLogged}`,
      `Current streak: ${stats.streak} · Best streak: ${stats.bestStreak}`,
      stats.topTags.length ? `Top tags: ${stats.topTags.map((t) => `${tagById(s, t.tagId)?.name ?? "?"} (${t.count})`).join(", ")}` : "",
      summary ? `\nReflection: ${summary}` : "",
    ].filter(Boolean);
    try {
      await Share.share({ message: lines.join("\n") });
      analytics.track("pdf_export_success");
    } catch {
      /* user cancelled — no nag */
    }
  };

  const noData = stats.entries === 0;

  return (
    <Screen title="Insights" subtitle="Your patterns, simply" bottomInset={bottomInset}>
      <Segmented
        options={[{ value: "week", label: "This week" }, { value: "month", label: "This month" }]}
        value={range}
        onChange={setRange}
      />

      {noData ? (
        <Card>
          <EmptyState
            art={art.empty_insights}
            title="Collect a few days"
            body="Log your mood for a few days and your trends, streaks and highlights appear here. Reminders help you keep the habit."
          />
        </Card>
      ) : (
        <>
          <HeroStats stats={stats} range={range} />

          <WeeklyHighlights stats={stats} range={range} s={s} />

          {/* The detailed charts are opt-in so the screen opens calm, not crowded.
              The choice is remembered across sessions. */}
          <Tappable
            label={expanded ? "Hide detailed charts" : "Show detailed charts"}
            onPress={() => { setInsightsExpanded(!expanded); feedback("pop", "select"); }}
            style={styles.moreBtn}
          >
            <Text style={[type.bodyStrong, { color: palette.primary, flex: 1 }]}>{expanded ? "Fewer insights" : "More insights"}</Text>
            <Icon name={expanded ? "chevronDown" : "chevronRight"} size={18} color={palette.primary} />
          </Tappable>

          {expanded ? (
          <>
          <Card style={{ gap: space.md }}>
            <SectionHeader title="7-day trend" />
            <LineChart
              data={series.map((d) => ({ label: weekdayLabel(d.day).slice(0, 1), value: d.avg, color: d.avg ? scoreColor(d.avg) : undefined }))}
              min={1}
              max={5}
              yTicks={[{ value: 5, label: "5" }, { value: 4, label: "4" }, { value: 3, label: "3" }, { value: 2, label: "2" }, { value: 1, label: "1" }]}
              reference={lastWeekAvg ? { value: lastWeekAvg, color: palette.inkMuted } : undefined}
              annotation={
                weekDelta !== null
                  ? {
                      text: `${weekDelta >= 0 ? "+" : ""}${weekDelta.toFixed(1)} vs last week`,
                      tone: weekDelta > 0.05 ? palette.success : weekDelta < -0.05 ? palette.danger : palette.inkSoft,
                    }
                  : undefined
              }
            />
            <View style={styles.trendKey}>
              {lastWeekAvg ? (
                <View style={styles.refKey}>
                  <View style={styles.refDash} />
                  <Text style={type.caption}>Last week avg {lastWeekAvg.toFixed(1)}</Text>
                </View>
              ) : (
                <View />
              )}
              <Text style={type.caption}>1 low · 5 great</Text>
            </View>
          </Card>

          {stats.byMood.length ? (
            <Card style={styles.donutCard}>
              <DonutChart
                data={stats.byMood.map((m) => ({ label: moodById(s, m.moodId)?.name ?? "?", value: m.count, color: moodById(s, m.moodId)?.color }))}
                size={128}
                stroke={18}
                label={String(stats.entries)}
                sublabel="entries"
              />
              <View style={{ flex: 1 }}>
                <Legend
                  items={stats.byMood.slice(0, 5).map((m) => ({
                    label: moodById(s, m.moodId)?.name ?? "?",
                    value: String(m.count),
                    color: moodById(s, m.moodId)?.color,
                  }))}
                />
              </View>
            </Card>
          ) : null}

          {stats.tagLinks.length ? (
            <>
              <SectionHeader
                title="What moves your mood"
                action={<Text style={type.caption}>On-device · no setup</Text>}
              />
              <Card style={{ gap: space.sm }} accent={palette.primary}>
                <Text style={[type.caption, { marginBottom: 2 }]}>How days with each tag compare to your {range === "week" ? "week" : "month"} average.</Text>
                {stats.tagLinks.slice(0, 5).map((t) => {
                  const up = t.delta >= 0.05;
                  const down = t.delta <= -0.05;
                  const tone = up ? "success" : down ? "danger" : "neutral";
                  return (
                    <View key={t.tagId} style={styles.linkRow}>
                      <Icon name={up ? "trendUp" : down ? "trendDown" : "minus"} size={16} color={up ? palette.success : down ? palette.danger : palette.inkMuted} />
                      <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>#{tagById(s, t.tagId)?.name ?? "?"}</Text>
                      <Text style={[type.caption, { width: 60, textAlign: "right" }]}>{t.count} {t.count === 1 ? "day" : "days"}</Text>
                      <Pill tone={tone} label={`${t.delta >= 0 ? "+" : ""}${t.delta.toFixed(1)}`} />
                    </View>
                  );
                })}
                <Text style={[type.caption, { marginTop: 2 }]}>{moodLinkLine(stats.tagLinks, s)}</Text>
              </Card>
            </>
          ) : stats.topTags.length ? (
            <>
              <SectionHeader title="Top tags" />
              <Card style={{ gap: space.md }}>
                {stats.topTags.map((t) => (
                  <View key={t.tagId} style={styles.tagRow}>
                    <Text style={[type.body, { width: 110 }]} numberOfLines={1}>#{tagById(s, t.tagId)?.name ?? "?"}</Text>
                    <View style={{ flex: 1 }}>
                      <ProgressBar value={t.count / stats.topTags[0].count} tone="primary" />
                    </View>
                    <Text style={[type.amount, { width: 28, textAlign: "right" }]}>{t.count}</Text>
                  </View>
                ))}
                <Text style={type.caption}>Log a few more tagged days to see what lifts or weighs on your mood.</Text>
              </Card>
            </>
          ) : null}

          <SectionHeader title="Time of day" />
          <Card style={{ gap: space.md }}>
            <BarChart
              data={TIMES_OF_DAY.map((t) => ({ label: TOD_LABEL[t].slice(0, 3), value: stats.timeOfDay[t].count }))}
              color={palette.accent}
              showValues
            />
            <Text style={[type.caption, { textAlign: "center" }]}>{bestTimeLine(stats)}</Text>
          </Card>
          </>
          ) : null}

          {aiOn ? (
            <Card style={{ gap: space.md }} accent={palette.primary}>
              <View style={styles.aiHead}>
                <Icon name="sparkle" size={18} color={palette.primary} />
                <Text style={type.heading}>Weekly reflection</Text>
              </View>
              {busy ? (
                <View style={{ gap: 8 }} accessibilityLabel="Writing your reflection">
                  <Skeleton width="100%" height={13} />
                  <Skeleton width="94%" height={13} />
                  <Skeleton width="68%" height={13} />
                </View>
              ) : summary ? (
                <>
                  <Text style={[type.body, { color: palette.inkSoft }]}>{summary}</Text>
                  <Tappable
                    label="Report this AI response"
                    sound={null}
                    onPress={() => reportAiOutput("weekly_summary")}
                    style={styles.reportBtn}
                  >
                    <Icon name="flag" size={13} color={palette.inkMuted} />
                    <Text style={[type.caption, { color: palette.inkMuted }]}>Report this response</Text>
                  </Tappable>
                </>
              ) : (
                <Text style={[type.body, { color: palette.inkSoft }]}>
                  A short, warm summary written from your own notes this week. {weekNotes.length ? "" : "Add a note to an entry to enable it."}
                </Text>
              )}
              <Button
                label={summary ? "Regenerate" : "Write my reflection"}
                icon="sparkle"
                variant="secondary"
                loading={busy}
                disabled={!weekNotes.length}
                onPress={genSummary}
              />
              <Text style={type.caption}>On-demand · 5 free a day, more with Pro. Only your note text is sent.</Text>
              <Text style={type.caption}>{AI_DISCLAIMER}</Text>
            </Card>
          ) : null}

          <Card style={styles.proCard} accent={palette.accent}>
            <Text style={type.heading}>{canUseAdvancedInsights(pro) ? "Share a report" : "Deeper insights"}</Text>
            <Text style={[type.body, { color: palette.inkSoft }]}>
              {canUseAdvancedInsights(pro)
                ? "Export this summary to share or keep — tags, streaks and your reflection in one note."
                : "Correlations and trends are free. Pro adds custom date ranges, shareable styled reports and a higher daily AI limit."}
            </Text>
            {canExportPDF(pro) ? (
              <Button label="Export report" icon="download" onPress={exportReport} />
            ) : (
              <Button label="Unlock Pro" icon="star" onPress={() => onPro("insights")} />
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}

function HeroStats({ stats, range }: { stats: ReturnType<typeof rangeStats>; range: "week" | "month" }) {
  return (
    <>
      <HeroCard
        overline={range === "week" ? "This week" : "This month"}
        value={moodWord(stats.avgMood)}
        caption={`${stats.avgMood === null ? "No mood yet" : `${stats.avgMood.toFixed(1)} average`} · ${stats.entries} ${stats.entries === 1 ? "entry" : "entries"}`}
        status={{
          label: `${stats.streak}-day streak`,
          tone: stats.streak > 0 ? "success" : "neutral",
          icon: stats.streak > 0 ? <Icon name="flame" size={13} color="#fff" /> : undefined,
        }}
        right={
          <ProgressRing
            value={stats.avgMood === null ? 0 : moodToRatio(stats.avgMood)}
            size={88}
            stroke={12}
            color="#fff"
            track="rgba(255,255,255,0.26)"
            labelColor="#fff"
            label={stats.avgMood === null ? "–" : stats.avgMood.toFixed(1)}
            sublabel="avg"
          />
        }
      />
      <Card>
        <View style={styles.statRow}>
          <Stat value={String(stats.daysLogged)} label="days logged" tone={palette.primary} />
          <Stat value={String(stats.streak)} label="day streak" tone={palette.warning} />
          <Stat value={String(stats.bestStreak)} label="best streak" />
        </View>
        {!stats.enoughData ? <Text style={[type.caption, { marginTop: space.sm }]}>Log a few more days for richer patterns.</Text> : null}
      </Card>
    </>
  );
}

/**
 * The at-a-glance card the screen opens on: at most three plain-language wins
 * for the range (average mood, the strongest tag correlation, the best/worst
 * time of day). No charts to interpret — the detail lives under "More insights".
 */
function WeeklyHighlights({ stats, range, s }: { stats: ReturnType<typeof rangeStats>; range: "week" | "month"; s: MoodState }) {
  const lines = highlightLines(stats, s, range);
  return (
    <Card style={{ gap: space.md }} accent={palette.primary}>
      <View style={styles.aiHead}>
        <Icon name="sparkle" size={18} color={palette.primary} />
        <Text style={type.heading}>{range === "week" ? "Weekly highlights" : "Monthly highlights"}</Text>
      </View>
      <View style={{ gap: space.sm }}>
        {lines.map((l, i) => (
          <View key={i} style={styles.hiRow}>
            <View style={[styles.hiIcon, { backgroundColor: `${l.color}1F` }]}>
              <Icon name={l.icon} size={15} color={l.color} />
            </View>
            <Text style={[type.body, { flex: 1 }]}>{l.text}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

/** Up to three highlight bullets for the Weekly/Monthly Highlights card. */
function highlightLines(stats: ReturnType<typeof rangeStats>, s: MoodState, range: "week" | "month"): { icon: IconName; color: string; text: string }[] {
  const out: { icon: IconName; color: string; text: string }[] = [];
  const period = range === "week" ? "week" : "month";

  // 1 — average mood
  if (stats.avgMood === null) {
    out.push({ icon: "chart", color: palette.inkMuted, text: `Nothing logged this ${period} yet — tap a mood on Today to begin.` });
  } else {
    out.push({
      icon: "chart",
      color: scoreColor(stats.avgMood),
      text: `Your ${period} averages ${stats.avgMood.toFixed(1)} — feeling ${moodWord(stats.avgMood).toLowerCase()} across ${stats.daysLogged} ${stats.daysLogged === 1 ? "day" : "days"}.`,
    });
  }

  // 2 — strongest tag correlation (or a graceful fallback)
  const link = stats.tagLinks.find((l) => Math.abs(l.delta) >= 0.05);
  if (link) {
    const up = link.delta >= 0;
    out.push({
      icon: up ? "trendUp" : "trendDown",
      color: up ? palette.success : palette.danger,
      text: `#${tagById(s, link.tagId)?.name ?? "?"} days feel ${up ? "brighter" : "lower"} than usual (${up ? "+" : ""}${link.delta.toFixed(1)}).`,
    });
  } else if (stats.topTags.length) {
    out.push({ icon: "tag", color: palette.primary, text: `Your most-logged tag is #${tagById(s, stats.topTags[0].tagId)?.name ?? "?"} (${stats.topTags[0].count}×).` });
  } else {
    out.push({ icon: "tag", color: palette.primary, text: "Add tags to entries to see what lifts or weighs on your mood." });
  }

  // 3 — best / worst time of day
  let best: { t: string; a: number } | null = null;
  let worst: { t: string; a: number } | null = null;
  for (const t of TIMES_OF_DAY) {
    const a = stats.timeOfDay[t].avg;
    if (a === null) continue;
    if (!best || a > best.a) best = { t: TOD_LABEL[t], a };
    if (!worst || a < worst.a) worst = { t: TOD_LABEL[t], a };
  }
  if (best) {
    out.push({
      icon: "flame",
      color: palette.accent,
      text: worst && worst.t !== best.t ? `${best.t} tends to feel your best, ${worst.t.toLowerCase()} your hardest.` : `${best.t} tends to feel your best.`,
    });
  }
  return out.slice(0, 3);
}

/** One plain-language takeaway from the strongest tag correlation. */
function moodLinkLine(links: TagCorrelation[], s: MoodState): string {
  // links are sorted strongest-effect first, so find() yields the strongest of each sign.
  const lift = links.find((l) => l.delta >= 0.05);
  const weigh = links.find((l) => l.delta <= -0.05);
  const name = (id: string) => tagById(s, id)?.name ?? "?";
  if (lift && weigh && lift.tagId !== weigh.tagId) return `#${name(lift.tagId)} days feel brighter; #${name(weigh.tagId)} days tend lower.`;
  if (lift) return `#${name(lift.tagId)} days tend to feel brighter than usual.`;
  if (weigh) return `#${name(weigh.tagId)} days tend to feel a little lower.`;
  return "Your tagged days feel pretty even — keep logging to spot patterns.";
}

function bestTimeLine(stats: ReturnType<typeof rangeStats>): string {
  let best: { t: string; avg: number } | null = null;
  for (const t of TIMES_OF_DAY) {
    const a = stats.timeOfDay[t].avg;
    if (a !== null && (!best || a > best.avg)) best = { t: TOD_LABEL[t], avg: a };
  }
  return best ? `${best.t} tends to feel your best.` : "Log at different times to see patterns.";
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", gap: space.lg, padding: space.lg },
  statRow: { flexDirection: "row", gap: space.md },
  donutCard: { flexDirection: "row", alignItems: "center", gap: space.lg },
  tagRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  linkRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  aiHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  reportBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 32 },
  moreBtn: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.primarySoft, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: 48 },
  hiRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  hiIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  proCard: { gap: space.md, backgroundColor: palette.primarySoft, shadowOpacity: 0, elevation: 0 },
  trendKey: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  refKey: { flexDirection: "row", alignItems: "center", gap: space.sm },
  refDash: { width: 20, borderTopWidth: 1.5, borderStyle: "dashed", borderColor: palette.inkMuted },
});

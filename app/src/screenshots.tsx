import { useState } from "react";
import { View } from "react-native";
import { HomeScreen } from "./screens/HomeScreen";
import { CalendarScreen } from "./screens/CalendarScreen";
import { InsightsScreen } from "./screens/InsightsScreen";
import { ProSheet } from "./screens/ProSheet";
import { EntrySheet } from "./screens/EntrySheet";
import { TAB_BAR_HEIGHT, TabBar, palette } from "./ui";
import type { IconName } from "./ui";
import { emptyMoodState, type MoodState } from "./core/model";
import { activeMoods, sortedTags } from "./core/moods";
import { addEntry, applySentiment } from "./core/entries";
import { addReminder } from "./core/reminders";
import { addDays } from "./core/dates";
import { moodStore } from "./core/data";
import { store } from "./modules/store";
import { setInsightsExpanded } from "./screens/uiprefs";

/**
 * Screenshot mode: the factory opens the app with <scheme>://shot/<id> on an
 * emulator and captures the screen for the Play Store listing. Every scene
 * renders a REAL state of the app with realistic seeded data (a user a few
 * weeks in — never an empty app). Ads and billing are off here.
 */
const noop = () => {};
const pad = (n: number) => String(n).padStart(2, "0");

// Deterministic 3-week history: mood index per day (0 best … 4 worst-ish).
// Tags: 0 Work · 1 Sleep · 2 Social · 3 Health. The RECENT week (indices 11–17)
// is shaped so the on-device correlation card has a clear, honest story to tell:
// #Social days run brighter, #Work days run lower.
const DAYS: { mi: number[]; tags?: number[]; note?: string }[] = [
  { mi: [1], tags: [0], note: "Shipped the big update — proud and a little wiped out." },
  { mi: [0, 2] },
  { mi: [2], tags: [1] },
  { mi: [1] },
  { mi: [0], tags: [2], note: "Long walk with friends. The good kind of tired." },
  { mi: [3], tags: [1], note: "Rough sleep, foggy all day." },
  { mi: [2] },
  { mi: [1], tags: [3] },
  { mi: [0] },
  { mi: [1, 2] },
  { mi: [2], tags: [0] },
  // ── last 7 days ──
  { mi: [0], tags: [2], note: "Finally caught up. Calm evening with friends, tea and a book." },
  { mi: [1], tags: [0] },
  { mi: [3], tags: [0] },
  { mi: [1], tags: [2] },
  { mi: [0], tags: [2] },
  { mi: [2], tags: [0] },
  { mi: [1], tags: [3] },
];

function seed(): { state: MoodState; noteId: string } {
  let st = emptyMoodState();
  const moods = activeMoods(st); // m1..m5, best→worst
  const tagIds = sortedTags(st).map((t) => t.id);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  let noteId = "";
  DAYS.forEach((d, i) => {
    const day = addDays(todayKey, -(DAYS.length - 1 - i));
    d.mi.forEach((mi, j) => {
      const ts = `${day}T${pad(9 + j * 6)}:${pad((i * 7) % 60)}`;
      const r = addEntry(
        st,
        { moods: [{ moodId: moods[mi].id }], tags: (d.tags ?? []).map((t) => tagIds[t]), note: j === 0 ? d.note ?? "" : "", timestamp: ts },
        ts,
      );
      st = r.state;
      if (d.note && j === 0) noteId = r.id!;
    });
  });
  // one AI-analysed note, a couple of reminders
  if (noteId) st = applySentiment(st, noteId, { score: 0.62, magnitude: 1.3 });
  st = addReminder(st, { time: "08:30", daysOfWeek: [1, 2, 3, 4, 5] }).state;
  st = addReminder(st, { time: "21:00", daysOfWeek: [] }).state;
  return { state: st, noteId };
}

function Tabs({ active }: { active: "home" | "calendar" | "insights" }) {
  const tabs: { id: string; label: string; icon: IconName }[] = [
    { id: "home", label: "Today", icon: "home" },
    { id: "calendar", label: "Calendar", icon: "calendar" },
    { id: "insights", label: "Insights", icon: "chart" },
    { id: "settings", label: "Settings", icon: "settings" },
  ];
  return <TabBar tabs={tabs} active={active} onChange={noop} />;
}

export function ScreenshotScene({ id }: { id: string }) {
  const seeded = useState(() => {
    const { state, noteId } = seed();
    store.set({ onboarded: true, pro: id === "insights", adsRemoved: true, sessions: 30 });
    // Show the full insights (charts expanded) in the store screenshot.
    setInsightsExpanded(id === "insights");
    moodStore.set(state);
    return noteId;
  })[0];

  const root = { flex: 1, backgroundColor: palette.bg };
  switch (id) {
    case "calendar":
      return (
        <View style={root}>
          <CalendarScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />
          <Tabs active="calendar" />
        </View>
      );
    case "insights":
      return (
        <View style={root}>
          <InsightsScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />
          <Tabs active="insights" />
        </View>
      );
    case "entry":
      return (
        <View style={root}>
          <HomeScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />
          <Tabs active="home" />
          <EntrySheet target={{ kind: "edit", id: seeded }} onClose={noop} onPro={noop} />
        </View>
      );
    case "pro":
      return (
        <View style={root}>
          <HomeScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />
          <Tabs active="home" />
          <ProSheet visible from="screenshot" onClose={noop} />
        </View>
      );
    case "home":
    default:
      return (
        <View style={root}>
          <HomeScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />
          <Tabs active="home" />
        </View>
      );
  }
}

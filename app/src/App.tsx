import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, Linking, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeIn } from "react-native-reanimated";
import * as SplashScreen from "expo-splash-screen";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { CalendarScreen } from "./screens/CalendarScreen";
import { InsightsScreen } from "./screens/InsightsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { ProSheet } from "./screens/ProSheet";
import { LockScreen } from "./screens/LockScreen";
import { syncReminders } from "./screens/notify";
import { nowISO } from "./screens/shared";
import { TAB_BAR_HEIGHT, TabBar, ToastHost, initAudio, palette } from "./ui";
import type { IconName } from "./ui";
import { analytics } from "./modules/analytics";
import { layout, useBannerHeight } from "./modules/layout";
import { ads } from "./modules/ads";
import { iap } from "./modules/iap";
import { store, useSettings } from "./modules/store";
import { moodStore, useMood, startMoodSync } from "./core/data";
import { shouldAutoLock } from "./core/security";
import { ScreenshotScene } from "./screenshots";

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Root of the app runtime. Boot order matters: fonts → persisted data →
 * audio → consent + ads → billing. The builder adds screens/flows but keeps
 * this shell: providers, fonts, the onboarding gate, the banner slot and
 * screenshot mode.
 */
export default function App() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [shot, setShot] = useState<string | null | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    Linking.getInitialURL()
      .then((u) => setShot(u?.match(/shot\/([\w-]+)/)?.[1] ?? null))
      .catch(() => setShot(null));
    Promise.all([store.load(), moodStore.load()]).finally(() => {
      setLoaded(true);
      startMoodSync(); // cloud backup/sync when enabled (Pro); no-op offline
      syncReminders(moodStore.get().reminders); // re-arm local reminders, best-effort
    });
  }, []);
  const ready = fontsLoaded && loaded && shot !== undefined;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return <View style={styles.root} />;
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {shot ? <ScreenshotScene id={shot} /> : <Main />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

type Tab = "home" | "calendar" | "insights" | "settings";
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "home", label: "Today", icon: "home" },
  { id: "calendar", label: "Calendar", icon: "calendar" },
  { id: "insights", label: "Insights", icon: "chart" },
  { id: "settings", label: "Settings", icon: "settings" },
];

function Main() {
  const settings = useSettings();
  const mood = useMood();
  const insets = useSafeAreaInsets();
  const banner = useBannerHeight();
  const [showBanner, setShowBanner] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [pro, setPro] = useState<string | null>(null);
  const [locked, setLocked] = useState(() => moodStore.get().lock.enabled);
  const lastActive = useRef(nowISO());

  useEffect(() => {
    store.set({ sessions: store.get().sessions + 1 });
    analytics.track("app_open");
    (async () => {
      await initAudio();
      await ads.init();
      setShowBanner(ads.canShowBanner());
      await iap.init();
    })();
    return store.subscribe(() => setShowBanner(ads.canShowBanner()));
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      const l = moodStore.get().lock;
      if (st === "active") {
        if (l.enabled && shouldAutoLock(l, lastActive.current, nowISO())) setLocked(true);
      } else {
        lastActive.current = nowISO();
      }
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!showBanner) layout.setBannerHeight(0);
  }, [showBanner]);
  useEffect(() => {
    if (settings.onboarded) analytics.track("screen_view", { screen: tab });
  }, [tab, settings.onboarded]);
  const openPro = useCallback((from: string) => setPro(from), []);
  const closePro = useCallback(() => setPro(null), []);

  if (!settings.onboarded) return <OnboardingScreen onDone={() => setTab("home")} />;
  if (locked && mood.lock.enabled) return <LockScreen onUnlock={() => setLocked(false)} />;

  const bottom = TAB_BAR_HEIGHT;
  return (
    <View style={styles.root}>
      <Animated.View key={tab} entering={FadeIn.duration(180)} style={styles.root}>
        {tab === "home" ? (
          <HomeScreen bottomInset={bottom} onPro={openPro} onOpenSettings={() => setTab("settings")} />
        ) : tab === "calendar" ? (
          <CalendarScreen bottomInset={bottom} onPro={openPro} />
        ) : tab === "insights" ? (
          <InsightsScreen bottomInset={bottom} onPro={openPro} />
        ) : (
          <SettingsScreen bottomInset={bottom} onPro={openPro} />
        )}
      </Animated.View>
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
      <ProSheet visible={!!pro} from={pro ?? ""} onClose={closePro} />
      <ToastHost bottom={TAB_BAR_HEIGHT + insets.bottom + banner + 12} />
      {showBanner && (
        <View style={styles.banner} onLayout={(e) => layout.setBannerHeight(e.nativeEvent.layout.height)}>
          <BannerAd unitId={ads.bannerUnitId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  banner: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", backgroundColor: palette.surface },
});

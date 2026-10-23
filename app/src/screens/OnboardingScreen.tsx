/**
 * First run → the aha (a mood saved) in ≤ 3 screens, skippable: a privacy +
 * speed promise, a look at the starter moods, then the first real one-tap log.
 * Ends on Home with the core action already done.
 */
import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInRight, FadeOut, FadeOutLeft } from "react-native-reanimated";
import { Button, Confetti, FooterScreen, Icon, feedback, palette, radius, space, type } from "../ui";
import { activeMoods } from "../core/moods";
import { logMood } from "../core/entries";
import { moodStore, useMood } from "../core/data";
import { store } from "../modules/store";
import { analytics } from "../modules/analytics";
import { art } from "../art";
import { MoodToken } from "./components";
import { nowISO } from "./shared";

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const s = useMood();
  const moods = activeMoods(s);
  const [step, setStep] = useState(0);
  const [loggedName, setLoggedName] = useState<string | null>(null);
  const [loggedId, setLoggedId] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);

  const finish = () => {
    store.set({ onboarded: true });
    analytics.track("onboarding_done");
    onDone();
  };
  const next = () => {
    const n = step + 1;
    analytics.track("onboarding_step", { step: n });
    setStep(n);
  };

  const firstLog = (moodId: string, name: string) => {
    const r = logMood(moodStore.get(), moodId, nowISO());
    moodStore.set(r.state);
    analytics.track("core_action", { feature: "log_mood" });
    feedback("success", "success");
    setLoggedName(name);
    setLoggedId(moodId);
    setBurst((b) => b + 1);
  };

  const top = (
    <View style={styles.dots} accessibilityLabel={`Step ${step + 1} of 3`}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.dot, i === step && styles.dotOn]} />
      ))}
    </View>
  );

  const footer =
    step === 0 ? (
      <>
        <Button label="Get started" size="lg" onPress={next} />
        <Button label="Skip" variant="ghost" sound={null} onPress={finish} style={styles.skip} />
      </>
    ) : step === 1 ? (
      <>
        <Button label="Use these moods" size="lg" onPress={next} />
        <Button label="Skip" variant="ghost" sound={null} onPress={finish} style={styles.skip} />
      </>
    ) : (
      <>
        <Button label={loggedName ? "Continue" : "Skip for now"} size="lg" icon={loggedName ? "check" : undefined} onPress={finish} />
      </>
    );

  return (
    <>
      <FooterScreen top={top} footer={footer}>
        <Animated.View key={step} entering={FadeInRight.duration(260)} exiting={FadeOutLeft.duration(140)} style={styles.body}>
          {step === 0 ? (
            <>
              <Image source={art.onboarding_welcome} style={styles.art} resizeMode="contain" accessibilityIgnoresInvertColors />
              <Text style={[type.display, styles.center]}>How are you,{"\n"}really?</Text>
              <Text style={[type.body, styles.sub]}>
                Log your mood in a single tap. Private by default — everything stays on your phone, with a free lock and encrypted-in-transit backups.
              </Text>
            </>
          ) : step === 1 ? (
            <>
              <Image source={art.onboarding_pick_moods} style={styles.art} resizeMode="contain" accessibilityIgnoresInvertColors />
              <Text style={[type.title, styles.center]}>Your starter moods</Text>
              <Text style={[type.body, styles.sub]}>Five to begin with. Rename them, pick emoji and colours, or add your own anytime in Settings.</Text>
              <View style={styles.grid}>
                {moods.slice(0, 5).map((m) => (
                  <MoodToken key={m.id} mood={m} size={52} onPress={() => {}} />
                ))}
              </View>
            </>
          ) : (
            <Animated.View key="try" entering={FadeIn.duration(200)} exiting={FadeOut.duration(140)} style={styles.body}>
              <Text style={[type.title, styles.center]}>{loggedName ? `Saved · feeling ${loggedName.toLowerCase()}` : "Try it — tap how you feel"}</Text>
              <Text style={[type.body, styles.sub]}>
                {loggedName ? "That's it — one tap. Tap another to change it, or Continue." : "Go on, tap a mood. It saves instantly."}
              </Text>
              {/* The grid stays put so the tapped mood shows an inline check right
                  where you pressed — the clearest "it worked" for a first-timer. */}
              <View style={styles.grid}>
                {moods.slice(0, 5).map((m) => (
                  <MoodToken key={m.id} mood={m} size={52} selected={loggedId === m.id} onPress={() => firstLog(m.id, m.name)} />
                ))}
              </View>
              {loggedName ? (
                <Animated.View key="saved" entering={FadeIn.duration(200)} style={styles.savedBanner}>
                  <View style={styles.savedTick}>
                    <Icon name="check" size={16} color={palette.onPrimary} />
                  </View>
                  <Text style={[type.body, { flex: 1, color: palette.ink }]}>Mood saved. Add notes, tags and reminders whenever you like.</Text>
                </Animated.View>
              ) : null}
            </Animated.View>
          )}
        </Animated.View>
      </FooterScreen>
      <Confetti trigger={burst} />
    </>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: "row", gap: 6, alignSelf: "center" },
  // Inactive dots use a mid grey (≥ 3:1 vs the background, per WCAG 1.4.11 for
  // non-text UI) so the step indicator is legible — palette.border was invisible.
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#9AA3B2" },
  dotOn: { width: 22, backgroundColor: palette.primary },
  body: { gap: space.lg, alignItems: "center" },
  art: { width: 220, height: 200, alignSelf: "center" },
  center: { textAlign: "center" },
  sub: { textAlign: "center", color: palette.inkSoft },
  grid: { flexDirection: "row", justifyContent: "space-between", alignSelf: "stretch", marginTop: space.sm },
  savedBanner: { flexDirection: "row", alignItems: "center", gap: space.md, alignSelf: "stretch", backgroundColor: palette.successSoft, borderRadius: radius.lg, padding: space.md, marginTop: space.sm },
  savedTick: { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.success, alignItems: "center", justifyContent: "center" },
  skip: { borderWidth: 0 },
});

/**
 * App-lock gate (UF7). Shown over everything when the lock is on and the app is
 * locked: biometric prompt on open, a PIN pad, a privacy line, and a safe
 * "forgot PIN" escape (wipe or restore) since the PIN is unrecoverable.
 */
import { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { Icon, Tappable, feedback, palette, radius, space, type } from "../ui";
import { verifyPin, isCoolingDown } from "../core/security";
import { PIN_MAX_LEN } from "../core/model";
import { moodStore, useMood } from "../core/data";
import { nowISO } from "./shared";
import { authenticateBiometric } from "./biometric";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const s = useMood();
  const insets = useSafeAreaInsets();
  const lock = s.lock;
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const shake = useSharedValue(0);
  const tried = useRef(false);

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  useEffect(() => {
    if (lock.biometric && !tried.current && !isCoolingDown(lock, nowISO())) {
      tried.current = true;
      authenticateBiometric().then((ok) => {
        if (ok) {
          feedback("unlock", "success");
          onUnlock();
        }
      });
    }
  }, []);

  const submit = (value: string) => {
    const r = verifyPin(moodStore.get(), value, nowISO());
    moodStore.set(r.state);
    if (r.ok) {
      feedback("unlock", "success");
      onUnlock();
      return;
    }
    feedback("error", "error");
    shake.value = withSequence(withTiming(-8, { duration: 50 }), withTiming(8, { duration: 50 }), withTiming(0, { duration: 50 }));
    setPin("");
    setError(r.error === "locked" ? "Too many tries — wait a minute." : "Wrong PIN. Try again.");
  };

  const tap = (k: string) => {
    if (k === "del") {
      setError(null);
      return setPin((p) => p.slice(0, -1));
    }
    if (!k) return;
    setError(null);
    const next = (pin + k).slice(0, PIN_MAX_LEN);
    setPin(next);
    if (next.length === PIN_MAX_LEN) setTimeout(() => submit(next), 80);
  };

  const forgot = () =>
    Alert.alert(
      "Forgot your PIN?",
      "For your privacy the PIN can't be recovered. You can restore an encrypted backup after reinstalling, or reset the app now (this deletes all data on this phone).",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset app", style: "destructive", onPress: () => { moodStore.reset(); feedback("success", "success"); onUnlock(); } },
      ],
    );

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.top}>
        <View style={styles.badge}>
          <Icon name="lock" size={30} color={palette.onPrimary} />
        </View>
        <Text style={type.title}>Floria is locked</Text>
        <Text style={[type.caption, { textAlign: "center" }]}>Enter your PIN. Your journal stays private on this device.</Text>
      </View>

      <Animated.View style={[styles.dotsRow, shakeStyle]}>
        {Array.from({ length: Math.max(PIN_MAX_LEN, pin.length) }).slice(0, PIN_MAX_LEN).map((_, i) => (
          <View key={i} style={[styles.pinDot, i < pin.length && styles.pinDotOn]} />
        ))}
      </Animated.View>
      <Text style={[type.caption, { color: palette.danger, height: 18, textAlign: "center" }]}>{error ?? ""}</Text>

      <View style={styles.pad}>
        {KEYS.map((k, i) =>
          k === "" ? (
            <View key={i} style={styles.key} />
          ) : (
            <Tappable key={i} label={k === "del" ? "Delete" : k} sound="pop" scale={0.9} onPress={() => tap(k)} style={styles.key}>
              {k === "del" ? <Icon name="chevronLeft" size={24} color={palette.ink} /> : <Text style={styles.keyTxt}>{k}</Text>}
            </Tappable>
          ),
        )}
      </View>

      <Tappable label="Forgot PIN" role="button" sound={null} onPress={forgot} style={styles.forgot}>
        <Text style={[type.label, { color: palette.primary }]}>Forgot PIN?</Text>
      </Tappable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg, paddingHorizontal: space.xl, alignItems: "center", justifyContent: "space-between" },
  top: { alignItems: "center", gap: space.sm },
  badge: { width: 72, height: 72, borderRadius: 36, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center", marginBottom: space.sm },
  dotsRow: { flexDirection: "row", gap: space.md, justifyContent: "center" },
  pinDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: palette.inkMuted },
  pinDotOn: { backgroundColor: palette.primary, borderColor: palette.primary },
  pad: { flexDirection: "row", flexWrap: "wrap", width: 260, justifyContent: "space-between", rowGap: space.md },
  key: { width: 76, height: 72, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", backgroundColor: palette.surface },
  keyTxt: { fontFamily: type.number.fontFamily, fontSize: 26, color: palette.ink },
  forgot: { padding: space.sm },
});

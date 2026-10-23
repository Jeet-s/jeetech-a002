/**
 * App lock (UF7, free for everyone): a 4–6 digit PIN hashed with a salted KDF
 * (never stored in plaintext), optional biometric unlock, and an auto-lock
 * timer. Forgetting the PIN is recoverable only by restoring a backup.
 */
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Segmented, Sheet, TextField, Toggle, feedback, palette, space, toast, type } from "../../ui";
import { disableLock, setAutoLockMinutes, setBiometric, setPin, validatePin } from "../../core/security";
import { moodStore, useMood } from "../../core/data";
import { analytics } from "../../modules/analytics";
import { ERRORS, nowISO } from "../shared";
import { biometricAvailable } from "../biometric";

const AUTO_OPTS = [
  { value: "0", label: "Immediately" },
  { value: "1", label: "After 1 min" },
  { value: "5", label: "After 5 min" },
];
const randomSalt = () => Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

export function SecuritySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useMood();
  const lock = s.lock;
  const [step, setStep] = useState<"status" | "enter" | "confirm" | "disable">("status");
  const [pin, setPinText] = useState("");
  const [first, setFirst] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [bioOk, setBioOk] = useState(false);

  useEffect(() => {
    if (visible) biometricAvailable().then(setBioOk);
    else {
      setStep("status");
      setPinText("");
      setFirst("");
      setError(null);
    }
  }, [visible]);

  const beginEnter = () => {
    setPinText("");
    setFirst("");
    setError(null);
    setStep("enter");
  };

  const submitEnter = () => {
    const vErr = validatePin(pin);
    if (vErr) {
      feedback("error", "error");
      return setError(ERRORS[vErr]);
    }
    setFirst(pin);
    setPinText("");
    setError(null);
    setStep("confirm");
  };

  const submitConfirm = () => {
    if (pin !== first) {
      feedback("error", "error");
      setPinText("");
      return setError("PINs don't match. Try again.");
    }
    moodStore.set(setPin(moodStore.get(), pin, randomSalt()).state);
    feedback("success", "success");
    analytics.track("lock_enabled");
    toast("App lock on");
    setStep("status");
  };

  const submitDisable = () => {
    const r = disableLock(moodStore.get(), pin, nowISO());
    if (r.error) {
      feedback("error", "error");
      moodStore.set(r.state);
      setPinText("");
      return setError(ERRORS[r.error]);
    }
    moodStore.set(r.state);
    feedback("success", "success");
    toast("App lock off");
    setStep("status");
  };

  const toggleBio = (on: boolean) => {
    if (on && !bioOk) return toast("No biometrics enrolled on this device");
    moodStore.set(setBiometric(moodStore.get(), on));
    if (on) analytics.track("biometric_enabled");
    feedback("pop", "select");
  };

  const setAuto = (v: string) => {
    moodStore.set(setAutoLockMinutes(moodStore.get(), Number(v)));
    feedback("pop", "select");
  };

  // A visible row of dots that fills as digits are typed — so every keypad tap
  // produces an unmistakable on-screen change even though the field is masked.
  const pinField = (label: string, onSubmit: () => void) => (
    <View style={{ gap: space.md }}>
      <View style={styles.dots} accessibilityLabel={`${pin.length} of 6 digits entered`}>
        {Array.from({ length: 6 }, (_, i) => (
          <View key={i} style={[styles.dot, i < pin.length ? styles.dotOn : null]} />
        ))}
      </View>
      <TextField
        label={label}
        value={pin}
        onChangeText={(t) => { setPinText(t.replace(/\D/g, "").slice(0, 6)); setError(null); }}
        error={error}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={6}
        autoFocus
        placeholder="••••"
        returnKeyType="done"
        onSubmitEditing={onSubmit}
      />
    </View>
  );

  return (
    <Sheet visible={visible} onClose={onClose} title="App lock">
      {step === "status" ? (
        <View style={{ gap: space.lg }}>
          <Text style={[type.body, { color: palette.inkSoft }]}>
            {lock.enabled ? "Your journal is protected with a PIN." : "Lock Floria with a PIN so only you can open it. Free, on-device, always."}
          </Text>
          {lock.enabled ? (
            <>
              <View style={{ gap: space.sm }}>
                <Toggle label="Biometric unlock" description={bioOk ? "Use fingerprint / face" : "No biometrics enrolled"} value={lock.biometric} onChange={toggleBio} />
              </View>
              <View style={{ gap: space.sm }}>
                <Text style={type.label}>Auto-lock</Text>
                <Segmented options={AUTO_OPTS} value={String(lock.autoLockMinutes)} onChange={setAuto} />
              </View>
              <Button label="Change PIN" icon="lock" variant="secondary" onPress={beginEnter} />
              <Button label="Turn off lock" variant="danger" onPress={() => { setPinText(""); setError(null); setStep("disable"); }} />
            </>
          ) : (
            <Button label="Set up a PIN" icon="lock" size="lg" onPress={beginEnter} />
          )}
        </View>
      ) : step === "enter" ? (
        <View style={{ gap: space.lg }}>
          <Text style={[type.body, { color: palette.inkSoft }]}>Choose a 4–6 digit PIN.</Text>
          {pinField("New PIN", submitEnter)}
          <Button label="Continue" size="lg" disabled={pin.length < 4} onPress={submitEnter} />
          <Button label="Cancel" variant="ghost" sound={null} onPress={() => setStep("status")} style={{ borderWidth: 0 }} />
        </View>
      ) : step === "confirm" ? (
        <View style={{ gap: space.lg }}>
          <Text style={[type.body, { color: palette.inkSoft }]}>Re-enter your PIN to confirm.</Text>
          {pinField("Confirm PIN", submitConfirm)}
          <Button label="Turn on lock" size="lg" icon="check" disabled={pin.length < 4} onPress={submitConfirm} />
          <Button label="Back" variant="ghost" sound={null} onPress={beginEnter} style={{ borderWidth: 0 }} />
        </View>
      ) : (
        <View style={{ gap: space.lg }}>
          <Text style={[type.body, { color: palette.inkSoft }]}>Enter your current PIN to turn off the lock.</Text>
          {pinField("Current PIN", submitDisable)}
          <Button label="Turn off lock" size="lg" variant="danger" disabled={pin.length < 4} onPress={submitDisable} />
          <Button label="Cancel" variant="ghost" sound={null} onPress={() => setStep("status")} style={{ borderWidth: 0 }} />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.md },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: palette.border, backgroundColor: palette.surfaceAlt },
  dotOn: { borderColor: palette.primary, backgroundColor: palette.primary },
});

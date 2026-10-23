import { useEffect, useState } from "react";
import { Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";
import Animated, { Easing, FadeInDown, FadeOutDown, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton } from "./Button";
import { Icon, type IconName } from "./Icon";
import { CONTENT_MAX, SHEET_MAX, palette, radius, shadowStrong, space, springs, type } from "./theme";
import { play } from "../audio/sfx";

/** Bottom sheet over a dimmed backdrop — for add/edit forms, pickers and the Pro offer. */
export function Sheet({ visible, title, onClose, children }: { visible: boolean; title?: string; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const y = useSharedValue(1);
  useEffect(() => {
    if (visible) play("whoosh", 0.4);
    // Blur any focused field the instant the sheet starts closing. A still-focused
    // TextInput that gets unmounted makes its parent ScrollView try to scroll to a
    // detached child (ViewGroup.offsetRectBetweenParentAndChild → crash), so drop
    // the keyboard before the subtree below unmounts.
    else Keyboard.dismiss();
    y.value = visible ? withSpring(0, springs.gentle) : withTiming(1, { duration: 180 });
  }, [visible, y]);
  // Close path shared by the backdrop, the X button and the hardware back —
  // always blur first so the focused input is gone before the sheet tears down.
  const requestClose = () => {
    Keyboard.dismiss();
    onClose();
  };
  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: y.value * 600 }] }));
  const dim = useAnimatedStyle(() => ({ opacity: withTiming(visible ? 1 : 0, { duration: 200, easing: Easing.out(Easing.quad) }) }));
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={requestClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: palette.scrim }, dim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} accessibilityLabel="Close" />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.bottom} pointerEvents="box-none">
        <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }, sheet]}>
          <View style={styles.grabber} />
          {title ? (
            <View style={styles.titleRow}>
              <Text style={[type.title, { flex: 1 }]} accessibilityRole="header">{title}</Text>
              <IconButton icon="close" label="Close" size={40} onPress={requestClose} />
            </View>
          ) : null}
          {/* Only mount the body while the sheet is open. The Modal hides its
              native view instantly on close (there's no animated exit), so this
              frees each closed sheet's subtree — Settings keeps ~7 of these
              mounted at once, a steady drain seen in the soak test. */}
          {visible ? children : null}
        </Animated.View>
      </KeyboardAvoidingView>
      {/* The app's ToastHost lives in the root tree — BEHIND this Modal — so a
          confirmation fired from inside a sheet ("Mood added", "Reminder set")
          would otherwise be invisible. Mount a host inside the sheet too so the
          result shows ON TOP of the sheet; both hosts get every message, so it
          also survives a sheet that closes the instant it fires. */}
      {visible ? <ToastHost placement="top" /> : null}
    </Modal>
  );
}

/** Friendly empty state: illustration/icon, one line of why, one clear action. */
export function EmptyState({
  icon = "plus",
  art,
  title,
  body,
  action,
}: {
  icon?: IconName;
  /** An illustration from src/art (preferred over the icon on first-run screens). */
  art?: ImageSourcePropType;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      {art ? (
        <Image source={art} style={styles.emptyArt} resizeMode="contain" accessibilityIgnoresInvertColors />
      ) : (
        <View style={styles.emptyIcon}>
          <Icon name={icon} size={30} color={palette.primary} />
        </View>
      )}
      <Text style={[type.heading, { textAlign: "center" }]}>{title}</Text>
      {body ? <Text style={[type.body, { color: palette.inkSoft, textAlign: "center" }]}>{body}</Text> : null}
      {action}
    </View>
  );
}

type ToastMsg = { id: number; text: string; action?: { label: string; onPress: () => void } };
type Pusher = (m: Omit<ToastMsg, "id">) => void;
// Every mounted host subscribes. The root host (App) and the host each open
// Sheet mounts both receive the message: while a sheet is open its host shows
// the toast on top of the sheet, and the root host keeps it alive once the
// sheet closes. A Set (insertion-ordered) means no host ever misses a toast.
const listeners = new Set<Pusher>();

/** Show a short confirmation ("Saved", "Deleted · Undo"). Mount <ToastHost/> once in App. */
export function toast(text: string, action?: ToastMsg["action"]): void {
  listeners.forEach((fn) => fn({ text, action }));
}

export function ToastHost({ bottom = 96, placement = "bottom" }: { bottom?: number; placement?: "bottom" | "top" }) {
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  useEffect(() => {
    let n = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const push: Pusher = (m) => {
      if (timer) clearTimeout(timer);
      setMsg({ ...m, id: ++n });
      timer = setTimeout(() => setMsg(null), m.action ? 5000 : 2200);
    };
    listeners.add(push);
    return () => {
      listeners.delete(push);
      if (timer) clearTimeout(timer);
    };
  }, []);
  if (!msg) return null;
  const pos = placement === "top" ? { top: insets.top + space.md } : { bottom };
  return (
    <Animated.View key={msg.id} entering={FadeInDown.duration(200)} exiting={FadeOutDown.duration(160)} style={[styles.toastWrap, pos]} accessibilityLiveRegion="polite" pointerEvents="box-none">
      <View style={styles.toast}>
        <Text style={[type.bodyStrong, { color: "#fff", flex: 1 }]}>{msg.text}</Text>
        {msg.action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={msg.action.label}
            hitSlop={10}
            onPress={() => {
              msg.action?.onPress();
              setMsg(null);
            }}
          >
            <Text style={[type.button, { color: "#A5B4FC" }]}>{msg.action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bottom: { flex: 1, justifyContent: "flex-end", alignItems: "center" },
  sheet: { width: "100%", maxWidth: SHEET_MAX, backgroundColor: palette.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: space.lg, gap: space.lg, ...shadowStrong },
  grabber: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: palette.border, marginTop: space.sm },
  titleRow: { flexDirection: "row", alignItems: "center" },
  empty: { alignItems: "center", gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  emptyArt: { width: 180, height: 140 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  toastWrap: { position: "absolute", left: space.lg, right: space.lg, alignItems: "center" },
  toast: { width: "100%", maxWidth: CONTENT_MAX, backgroundColor: palette.ink, borderRadius: radius.md, paddingHorizontal: space.lg, minHeight: 52, flexDirection: "row", alignItems: "center", gap: space.md, ...shadowStrong },
});

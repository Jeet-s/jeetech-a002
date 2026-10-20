import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Tappable } from "./Pressable";
import { Icon, type IconName } from "./Icon";
import { palette, radius, shadow, TOUCH, type } from "./theme";
import type { Sfx } from "../audio/sfx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
const COLORS: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: palette.primary, fg: palette.onPrimary },
  secondary: { bg: palette.primarySoft, fg: palette.primary },
  ghost: { bg: "transparent", fg: palette.inkSoft, border: palette.border },
  danger: { bg: palette.dangerSoft, fg: palette.danger },
};

/** Primary UI button. Use for every text action; icon-only actions use IconButton. */
export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  disabled,
  loading,
  sound = "tap",
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  sound?: Sfx | null;
  style?: StyleProp<ViewStyle>;
}) {
  const c = COLORS[variant];
  const h = size === "lg" ? 56 : size === "sm" ? 40 : TOUCH;
  return (
    <Tappable
      label={label}
      onPress={onPress}
      disabled={disabled || loading}
      sound={sound}
      style={[
        styles.base,
        { height: h, backgroundColor: c.bg, borderColor: c.border ?? c.bg, paddingHorizontal: size === "sm" ? 14 : 20 },
        // Disabled reads clearly muted (not just un-tappable) so its state is obvious.
        disabled && !loading ? styles.disabled : null,
        variant === "primary" && !disabled ? styles.primaryLift : null,
        style,
      ]}
    >
      {/* Keep the label laid out while loading (opacity 0) so the button keeps
          its width and the spinner sits on top — no blip, no reflow. */}
      <View style={[styles.row, loading && { opacity: 0 }]} accessibilityElementsHidden={loading}>
        {icon ? <Icon name={icon} size={size === "sm" ? 18 : 20} color={c.fg} /> : null}
        <Text style={[type.button, { color: c.fg, fontSize: size === "lg" ? 17 : size === "sm" ? 14 : 16 }]}>{label}</Text>
      </View>
      {loading ? (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <ActivityIndicator color={c.fg} />
        </View>
      ) : null}
    </Tappable>
  );
}

/** Round icon-only button (≥ 48dp target). `label` is read by screen readers. */
export function IconButton({
  icon,
  label,
  onPress,
  tone = "default",
  size = TOUCH,
  style,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  tone?: "default" | "primary" | "danger";
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = tone === "primary" ? palette.primary : tone === "danger" ? palette.dangerSoft : palette.surfaceAlt;
  const fg = tone === "primary" ? palette.onPrimary : tone === "danger" ? palette.danger : palette.ink;
  return (
    <Tappable
      label={label}
      onPress={onPress}
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }, style]}
    >
      <Icon name={icon} size={Math.round(size * 0.46)} color={fg} />
    </Tappable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  // The one primary button on a screen gets a soft tinted lift so it reads as THE action.
  primaryLift: { ...shadow, shadowColor: palette.primary, shadowOpacity: 0.28 },
  disabled: { opacity: 0.45 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  center: { alignItems: "center", justifyContent: "center" },
});

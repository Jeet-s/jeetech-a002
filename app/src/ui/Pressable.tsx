import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { springs } from "./theme";
import { haptic, play, type Haptic, type Sfx } from "../audio/sfx";

const APressable = Animated.createAnimatedComponent(Pressable);

/**
 * Base tappable: the pressed state is driven ENTIRELY on the UI thread and
 * fired on touch-down, so a tap always reads as instant (≈ one frame), never
 * gated behind the JS work the press triggers:
 *   • a spring scale-down + a subtle dim land the frame the finger touches;
 *   • the haptic fires on press-IN (the tactile "got it" you feel immediately),
 *     not on release — the old timing made taps feel ~0.5s late;
 *   • the sound (cosmetic, off by default) plays on the completed press.
 * Never await I/O before this — callers do their save/navigation in onPress,
 * which runs after the visual has already started. Every custom tappable
 * surface in the app is built on this — never a bare Pressable/Touchable.
 */
export function Tappable({
  onPress,
  label,
  sound = "tap",
  haptic: hapticKind = "light",
  scale = 0.97,
  style,
  children,
  disabled,
  role = "button",
  ...rest
}: Omit<PressableProps, "style" | "children"> & {
  label: string;
  sound?: Sfx | null;
  /** Tactile feedback on touch-down; null for none (e.g. the quiet trust bar). */
  haptic?: Haptic | null;
  scale?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  role?: "button" | "link" | "checkbox" | "tab" | "switch";
}) {
  const p = useSharedValue(0);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - p.value * (1 - scale) }],
    // A small dim alongside the scale so the pressed state is visible even where
    // the scale is subtle — reads as a clear "pressed" tint within a frame.
    opacity: 1 - p.value * 0.12,
  }));
  // Snap down the instant the finger lands (stiff, low-mass) so the press reads
  // as immediate; release eases back with the gentler shared preset.
  const pressIn = { damping: 26, stiffness: 700, mass: 0.4 };
  return (
    <APressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={6}
      onPressIn={() => {
        p.value = withSpring(1, pressIn);
        // Immediate tactile acknowledgement on touch-down (fire-and-forget).
        if (hapticKind) haptic(hapticKind);
      }}
      onPressOut={() => (p.value = withSpring(0, springs.press))}
      onPress={(e) => {
        if (sound) play(sound);
        onPress?.(e);
      }}
      style={[anim, style, disabled ? { opacity: 0.45 } : null]}
      {...rest}
    >
      {children}
    </APressable>
  );
}

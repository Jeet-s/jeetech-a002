import { useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBannerHeight } from "../modules/layout";
import { CONTENT_MAX, palette, radius, shadow, space, type } from "./theme";

/**
 * Screen scaffold: safe areas, the large title header, scrolling content and
 * bottom padding that clears the tab bar + banner. Every screen starts here.
 */
export function Screen({
  title,
  subtitle,
  right,
  children,
  scroll = true,
  bottomInset = 0,
  contentStyle,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  /** Extra space the screen must leave at the bottom (e.g. the tab bar height). */
  bottomInset?: number;
  contentStyle?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  const banner = useBannerHeight();
  const header = title ? (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        {subtitle ? <Text style={[type.label, styles.subtitle]}>{subtitle}</Text> : null}
        <Text style={type.display} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit>
          {title}
        </Text>
      </View>
      {right}
    </View>
  ) : null;
  const pad = { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + bottomInset + banner + space.xl };
  return (
    <View style={styles.root}>
      {scroll ? (
        <ScrollView contentContainerStyle={[styles.content, pad, contentStyle]} keyboardShouldPersistTaps="handled" removeClippedSubviews={false}>
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, pad, { flex: 1 }, contentStyle]}>
          {header}
          {children}
        </View>
      )}
      <StatusBarScrim height={insets.top} />
    </View>
  );
}

/**
 * Opaque strip the exact height of the status bar, drawn on top of the content.
 * The Android status bar is translucent, so scrolled content slides up behind
 * it; without this, the system icons (time/Wi‑Fi/battery) overlap whatever
 * scrolls under them. Matching `palette.bg` keeps it invisible when nothing is
 * behind it and clean when content scrolls past.
 */
export function StatusBarScrim({ height }: { height: number }) {
  if (height <= 0) return null;
  return <View pointerEvents="none" style={[styles.statusScrim, { height }]} />;
}

/**
 * Scrolling body between a FIXED top (progress dots, step header) and a FIXED
 * bottom action bar (Continue / Save) — onboarding steps, editors, long forms.
 * Use this instead of hand-rolling ScrollView + footer: on a 720x1280 phone the
 * body scrolls, and soft fades at the scroll edges show that content continues,
 * so nothing ever looks covered by the header or the button bar.
 */
export function FooterScreen({
  top,
  footer,
  children,
  contentStyle,
}: {
  top?: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
  contentStyle?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  const [edge, setEdge] = useState({ above: false, below: false });
  const [box, setBox] = useState(0);
  const m = useRef({ y: 0, content: 0 });
  const update = () => {
    const above = m.current.y > 2;
    const below = m.current.y + box < m.current.content - 2;
    if (above !== edge.above || below !== edge.below) setEdge({ above, below });
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    m.current.y = e.nativeEvent.contentOffset.y;
    update();
  };
  return (
    <View style={[styles.root, { paddingTop: insets.top + space.md }]}>
      {top ? <View style={styles.fixedTop}>{top}</View> : null}
      <View style={{ flex: 1 }} onLayout={(e) => setBox(e.nativeEvent.layout.height)}>
        <ScrollView
          contentContainerStyle={[styles.footerBody, { minHeight: box }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={false}
          showsVerticalScrollIndicator={edge.below || edge.above}
          scrollEventThrottle={32}
          onScroll={onScroll}
          onContentSizeChange={(_, h) => {
            m.current.content = h;
            update();
          }}
        >
          {children}
        </ScrollView>
        {edge.above ? <LinearGradient pointerEvents="none" colors={[palette.bg, `${palette.bg}00`]} style={[styles.fade, { top: 0 }]} /> : null}
        {edge.below ? <LinearGradient pointerEvents="none" colors={[`${palette.bg}00`, palette.bg]} style={[styles.fade, { bottom: 0 }]} /> : null}
      </View>
      <View style={[styles.footerBar, { paddingBottom: insets.bottom + space.lg }]}>{footer}</View>
      <StatusBarScrim height={insets.top} />
    </View>
  );
}

/**
 * White rounded surface for grouped content. `accent` adds a tinted left edge
 * (a category's colour) — cards in a list read as distinct items, not one flat sheet.
 */
export function Card({ children, style, padded = true, accent }: { children: React.ReactNode; style?: ViewStyle; padded?: boolean; accent?: string }) {
  return (
    <View style={[styles.card, padded && { padding: space.lg }, accent ? { borderLeftWidth: 4, borderLeftColor: accent } : null, style]}>{children}</View>
  );
}

/**
 * Section header — sentence-case (not all-caps) with a small leaf-petal brand tick
 * so every section quietly carries the Floria motif without shouting.
 */
export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionTitle}>
        <View style={styles.leafTick} />
        <Text style={type.section} numberOfLines={1}>{title}</Text>
      </View>
      {action ? <View style={styles.sectionAction}>{action}</View> : null}
    </View>
  );
}

/** Big number + label, for stats rows. */
export function Stat({ value, label, tone = palette.ink }: { value: string; label: string; tone?: string }) {
  return (
    <View style={{ flex: 1 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[type.number, { color: tone }]}>{value}</Text>
      <Text style={type.caption}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  content: { paddingHorizontal: space.lg, gap: space.lg, width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "flex-end", gap: space.md, marginBottom: space.xs },
  subtitle: { marginBottom: 2 },
  fixedTop: { paddingHorizontal: space.lg, paddingBottom: space.sm, backgroundColor: palette.bg, zIndex: 1 },
  footerBody: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.lg, justifyContent: "center", width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" },
  fade: { position: "absolute", left: 0, right: 0, height: 28 },
  footerBar: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm, backgroundColor: palette.bg, width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" },
  // Subtle ambient shadow PLUS a hairline outline (M3-style): the outline gives a
  // crisp edge on light backgrounds so cards read as defined without a heavy shadow.
  card: { backgroundColor: palette.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, ...shadow },
  section: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, marginTop: space.sm },
  sectionTitle: { flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1 },
  sectionAction: { flexShrink: 0 },
  // A soft leaf-petal tick: a rounded teardrop in brand green, the quiet Floria accent.
  leafTick: { width: 7, height: 16, borderRadius: 4, borderTopLeftRadius: 1, backgroundColor: palette.accent, transform: [{ rotate: "12deg" }] },
  statusScrim: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: palette.bg },
});

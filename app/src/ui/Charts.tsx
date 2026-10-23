import { memo, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Canvas, Circle, Group, Path, Skia } from "@shopify/react-native-skia";
import { categorical, palette, radius, space, type } from "./theme";

/**
 * Animated circular progress (0..1) with a centred label. Memoised: it's a Skia
 * <Canvas> on the Home/Insights hero that would otherwise redraw on every store
 * change (each mood tap). Primitive props → the shallow compare skips the redraw
 * unless the value/label actually changed. Key to keeping the soak test responsive.
 */
export const ProgressRing = memo(function ProgressRing({
  value,
  size = 120,
  stroke = 12,
  color = palette.primary,
  track = palette.primarySoft,
  label,
  sublabel,
  labelColor = palette.ink,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  label?: string;
  sublabel?: string;
  /** On a HeroCard: "#fff" with color="#fff" and track="rgba(255,255,255,0.22)". */
  labelColor?: string;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(Math.max(0, Math.min(1, value)), { duration: 600 });
  }, [value, p]);
  const r = (size - stroke) / 2;
  const circle = useMemo(() => Skia.PathBuilder.Make().addCircle(size / 2, size / 2, r).build(), [size, r]);
  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Path path={circle} color={track} style="stroke" strokeWidth={stroke} />
        {/* The circle starts at 3 o'clock: rotate so progress grows from 12 o'clock. */}
        <Group transform={[{ rotate: -Math.PI / 2 }]} origin={{ x: size / 2, y: size / 2 }}>
          <Path path={circle} color={color} style="stroke" strokeWidth={stroke} strokeCap="round" start={0} end={p} />
        </Group>
      </Canvas>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        {label ? <Text style={[type.number, { fontSize: size * 0.26, lineHeight: size * 0.3, color: labelColor }]}>{label}</Text> : null}
        {sublabel ? (
          <Text
            numberOfLines={1}
            style={[type.label, { fontSize: size * 0.12, lineHeight: size * 0.15, marginTop: 1 }, labelColor !== palette.ink ? { color: labelColor, opacity: 0.85 } : { color: palette.inkMuted }]}
          >
            {sublabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

function Bar({ frac, color, height }: { frac: number; color: string; height: number }) {
  const h = useSharedValue(0);
  useEffect(() => {
    h.value = withTiming(Math.max(0.04, frac) * height, { duration: 500 });
  }, [frac, height, h]);
  const style = useAnimatedStyle(() => ({ height: h.value }));
  return <Animated.View style={[styles.bar, { backgroundColor: color }, style]} />;
}

/**
 * Simple animated bar chart (e.g. last 7 days). `highlight` marks one bar
 * (today). Each datum may carry its own `color` (e.g. the mood colour for that
 * day); `reference` draws a dotted baseline in the same units (e.g. last week's
 * average) so the viewer sees the trend vs a benchmark at a glance.
 */
export function BarChart({
  data,
  height = 140,
  color = palette.primary,
  highlight,
  showValues = false,
  format,
  reference,
}: {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  color?: string;
  highlight?: number;
  /** Print each bar's value above it (use `format` for money/durations). */
  showValues?: boolean;
  format?: (v: number) => string;
  /** Dotted horizontal benchmark line, value in the same units as the bars. */
  reference?: { value: number; color?: string };
}) {
  const max = Math.max(1, ...data.map((d) => d.value), reference?.value ?? 0);
  const refBottom = reference && reference.value > 0 ? (reference.value / max) * height : null;
  return (
    <View accessible accessibilityLabel={data.map((d) => `${d.label} ${d.value}`).join(", ")}>
      {showValues ? (
        <View style={styles.labels}>
          {data.map((d, i) => (
            <Text key={`v-${d.label}-${i}`} style={[type.caption, styles.colLabel, { fontVariant: ["tabular-nums"] }, i === highlight && { color: palette.ink }]} numberOfLines={1}>
              {format ? format(d.value) : d.value}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={[styles.bars, { height }]}>
        {[0, 0.5, 1].map((g) => (
          <View key={g} pointerEvents="none" style={[styles.grid, { bottom: g * height }]} />
        ))}
        {refBottom !== null ? (
          <View pointerEvents="none" style={[styles.refLine, { bottom: refBottom, borderColor: reference?.color ?? palette.inkMuted }]} />
        ) : null}
        {data.map((d, i) => (
          <View key={`${d.label}-${i}`} style={styles.col}>
            <Bar frac={d.value / max} height={height} color={d.color ?? (i === highlight ? color : `${color}66`)} />
          </View>
        ))}
      </View>
      <View style={styles.labels}>
        {data.map((d, i) => (
          <Text key={`${d.label}-${i}`} style={[type.caption, styles.colLabel, i === highlight && { color: palette.ink }]}>{d.label}</Text>
        ))}
      </View>
    </View>
  );
}

const n2 = (n: number) => n.toFixed(2);
/** Catmull-Rom → cubic Bézier as an SVG `d` string: a smooth curve through every point (tension 1/6). */
function smoothLineSVG(pts: { x: number; y: number }[]): string {
  if (!pts.length) return "";
  let d = `M ${n2(pts[0].x)} ${n2(pts[0].y)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const pPrev = pts[i - 2] ?? p0;
    const pNext = pts[i + 1] ?? p1;
    const c1x = p0.x + (p1.x - pPrev.x) / 6;
    const c1y = p0.y + (p1.y - pPrev.y) / 6;
    const c2x = p1.x - (pNext.x - p0.x) / 6;
    const c2y = p1.y - (pNext.y - p0.y) / 6;
    d += ` C ${n2(c1x)} ${n2(c1y)} ${n2(c2x)} ${n2(c2y)} ${n2(p1.x)} ${n2(p1.y)}`;
  }
  return d;
}

/**
 * Smoothed area/line chart for a short time series (e.g. the 7-day mood trend).
 * Reads "pro": a soft area fill under a smooth curve, subtle horizontal gridlines
 * with y-axis labels, a dotted benchmark line, a dot on every point (the last one
 * emphasised), an optional inline annotation near that last point, and x labels
 * below. `null` values are gaps — the line breaks rather than diving to zero.
 */
export function LineChart({
  data,
  height = 150,
  min = 1,
  max = 5,
  color = palette.primary,
  yTicks,
  reference,
  annotation,
}: {
  data: { label: string; value: number | null; color?: string }[];
  height?: number;
  min?: number;
  max?: number;
  color?: string;
  /** Horizontal gridlines + left-gutter labels, top → bottom. */
  yTicks?: { value: number; label: string }[];
  /** Dotted benchmark line in the same units (e.g. last week's average). */
  reference?: { value: number; color?: string };
  /** A short note pinned by the last point (e.g. "+0.2 vs last week"). */
  annotation?: { text: string; tone?: string };
}) {
  const [w, setW] = useState(0);
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = 0;
    p.value = withTiming(1, { duration: 650 });
  }, [data, w, p]);

  const gutter = yTicks?.length ? 24 : 0;
  const plotW = Math.max(0, w - gutter);
  const span = Math.max(0.0001, max - min);
  const yOf = (v: number) => (1 - (v - min) / span) * height;
  const xOf = (i: number) => ((i + 0.5) / data.length) * plotW;

  // Break the series into runs of consecutive non-null points.
  const segments = useMemo(() => {
    const segs: { i: number; x: number; y: number }[][] = [];
    let cur: { i: number; x: number; y: number }[] = [];
    data.forEach((d, i) => {
      if (d.value == null) {
        if (cur.length) segs.push(cur);
        cur = [];
      } else {
        cur.push({ i, x: xOf(i), y: yOf(Math.max(min, Math.min(max, d.value))) });
      }
    });
    if (cur.length) segs.push(cur);
    return segs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, plotW, height, min, max]);

  const lastPt = segments.length ? segments[segments.length - 1].slice(-1)[0] : null;
  const refY = reference && reference.value > 0 ? yOf(Math.max(min, Math.min(max, reference.value))) : null;

  return (
    <View accessible accessibilityLabel={data.map((d) => `${d.label} ${d.value == null ? "no data" : d.value}`).join(", ")}>
      <View style={{ flexDirection: "row" }}>
        {gutter ? (
          <View style={{ width: gutter, height }}>
            {yTicks!.map((t) => (
              <Text key={t.label} style={[type.caption, styles.yLabel, { top: yOf(t.value) - 8 }]} numberOfLines={1}>
                {t.label}
              </Text>
            ))}
          </View>
        ) : null}
        <View style={{ flex: 1, height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
          {/* gridlines */}
          {(yTicks ?? [{ value: min, label: "" }, { value: (min + max) / 2, label: "" }, { value: max, label: "" }]).map((t, gi) => (
            <View key={`g${gi}`} pointerEvents="none" style={[styles.grid, { top: yOf(t.value) }]} />
          ))}
          {refY !== null ? <View pointerEvents="none" style={[styles.refLine, { top: refY, borderColor: reference?.color ?? palette.inkMuted }]} /> : null}
          {plotW > 0 ? (
            <Canvas style={StyleSheet.absoluteFill}>
              {segments.map((seg, si) => {
                if (seg.length < 2) return null;
                const d = smoothLineSVG(seg);
                const line = Skia.Path.MakeFromSVGString(d);
                const area = Skia.Path.MakeFromSVGString(`${d} L ${n2(seg[seg.length - 1].x)} ${n2(height)} L ${n2(seg[0].x)} ${n2(height)} Z`);
                if (!line || !area) return null;
                return (
                  <Group key={`seg${si}`}>
                    <Path path={area} color={`${color}1F`} />
                    <Path path={line} color={color} style="stroke" strokeWidth={3} strokeCap="round" strokeJoin="round" start={0} end={p} />
                  </Group>
                );
              })}
              {segments.flat().map((pt) => {
                const isLast = lastPt != null && pt.i === lastPt.i;
                const c = data[pt.i].color ?? color;
                return (
                  <Group key={`pt${pt.i}`}>
                    <Circle cx={pt.x} cy={pt.y} r={isLast ? 5.5 : 3.5} color={c} />
                    {isLast ? <Circle cx={pt.x} cy={pt.y} r={2.3} color={palette.surface} /> : null}
                  </Group>
                );
              })}
            </Canvas>
          ) : null}
          {annotation && lastPt ? (
            <View
              pointerEvents="none"
              style={[
                styles.annotation,
                { top: Math.max(0, lastPt.y - 30), right: Math.max(0, plotW - lastPt.x - 8), backgroundColor: (annotation.tone ?? palette.ink) + "F2" },
              ]}
            >
              <Text style={[type.caption, { color: "#fff", fontFamily: type.bodyStrong.fontFamily }]} numberOfLines={1}>{annotation.text}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={[styles.labels, gutter ? { marginLeft: gutter } : null]}>
        {data.map((d, i) => (
          <Text key={`${d.label}-${i}`} style={[type.caption, styles.colLabel, i === data.length - 1 && { color: palette.ink }]}>{d.label}</Text>
        ))}
      </View>
    </View>
  );
}

/**
 * Donut for parts of a whole (spend by category, time by project): one stroke width,
 * categorical colours in order, the total in the centre, gaps between segments.
 * Pair with <Legend> — never make users guess what a colour means.
 */
export function DonutChart({
  data,
  size = 160,
  stroke = 22,
  label,
  sublabel,
}: {
  data: { label: string; value: number; color?: string }[];
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
}) {
  const total = data.reduce((a, d) => a + Math.max(0, d.value), 0);
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = 0;
    p.value = withTiming(1, { duration: 700 });
  }, [total, p]);
  const r = (size - stroke) / 2;
  const segments = useMemo(() => {
    const oval = Skia.XYWHRect(stroke / 2, stroke / 2, size - stroke, size - stroke);
    const gap = data.length > 1 ? 2.5 : 0; // degrees
    let at = -90;
    return data
      .filter((d) => d.value > 0 && total > 0)
      .map((d, i) => {
        const sweep = (d.value / total) * 360;
        const path = Skia.PathBuilder.Make().addArc(oval, at + gap / 2, Math.max(0.5, sweep - gap)).build();
        at += sweep;
        return { path, color: d.color ?? categorical[i % categorical.length] };
      });
  }, [data, total, size, stroke]);
  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityLabel={`${label ?? ""} ${data.map((d) => `${d.label} ${total ? Math.round((d.value / total) * 100) : 0}%`).join(", ")}`}
    >
      <Canvas style={StyleSheet.absoluteFill}>
        <Path path={Skia.PathBuilder.Make().addCircle(size / 2, size / 2, r).build()} color={palette.surfaceAlt} style="stroke" strokeWidth={stroke} />
        {segments.map((s, i) => (
          <Path key={i} path={s.path} color={s.color} style="stroke" strokeWidth={stroke} strokeCap="butt" end={p} />
        ))}
      </Canvas>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        {label ? <Text style={[type.number, { fontSize: size * 0.15 }]} numberOfLines={1} adjustsFontSizeToFit>{label}</Text> : null}
        {sublabel ? <Text style={type.caption}>{sublabel}</Text> : null}
      </View>
    </View>
  );
}

/** Colour key for a chart: dot + label + value, in the same order/colours as the chart. */
export function Legend({ items }: { items: { label: string; value?: string; color?: string }[] }) {
  return (
    <View style={{ gap: space.sm }}>
      {items.map((it, i) => (
        <View key={`${it.label}-${i}`} style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: it.color ?? categorical[i % categorical.length] }]} />
          <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{it.label}</Text>
          {it.value ? <Text style={type.amount}>{it.value}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { position: "absolute", left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: palette.border },
  refLine: { position: "absolute", left: 0, right: 0, borderTopWidth: 1.5, borderStyle: "dashed", borderRadius: 1 },
  yLabel: { position: "absolute", left: 0, right: 4, textAlign: "right" },
  annotation: { position: "absolute", borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 3, maxWidth: 150 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 28 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  center: { alignItems: "center", justifyContent: "center" },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  col: { flex: 1, justifyContent: "flex-end" },
  bar: { borderRadius: 6, width: "100%" },
  labels: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  colLabel: { flex: 1, textAlign: "center" },
});

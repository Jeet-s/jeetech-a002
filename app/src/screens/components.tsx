/**
 * Small Floria-specific building blocks composed from the UI kit: the branded
 * mood token (a drawn MoodFace — the star of the app), the swipeable entry card,
 * the 1–10 intensity picker, and a tag selector. Reused by Home, the entry
 * editor and onboarding so moods look and feel identical everywhere.
 */
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { Icon, MoodFace, Tappable, palette, radius, shadow, space, type } from "../ui";
import type { Entry, Mood, MoodState, Tag } from "../core/model";
import { tagById } from "../core/moods";
import { resolveMoods, timeLabel } from "./shared";

/** One entry as a swipeable card — used on Home and in the Calendar day detail. */
export function EntryRow({
  s,
  entry,
  onPress,
  onDelete,
  mask,
}: {
  s: MoodState;
  entry: Entry;
  onPress: () => void;
  /** When provided, the row reveals Edit/Delete on left-swipe. */
  onDelete?: () => void;
  mask?: boolean;
}) {
  const ms = resolveMoods(s, entry.moods);
  const primary = ms[0];
  const accent = primary?.color ?? palette.primary;
  const title = ms.map((m) => m.name).join(" · ") || "Entry";
  const tagNames = mask ? [] : (entry.tags.map((id) => tagById(s, id)?.name).filter(Boolean) as string[]);
  const notePreview = mask ? (entry.note ? "Note hidden" : "") : entry.note ? entry.note.replace(/\s+/g, " ").trim() : "";

  const card = (
    <Tappable
      label={`Entry at ${timeLabel(entry.timestamp)}: ${ms.map((m) => m.name).join(", ")}`}
      onPress={onPress}
      scale={0.99}
      style={[styles.entry, { borderLeftColor: accent }]}
    >
      <MoodFace score={primary?.score ?? 3} color={accent} size={40} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.entryTop}>
          <Text style={[type.bodyStrong, { flex: 1 }]} numberOfLines={1}>{title}</Text>
          <Text style={[type.caption, { fontVariant: ["tabular-nums"] }]}>{timeLabel(entry.timestamp)}</Text>
        </View>
        {notePreview ? (
          <Text style={type.caption} numberOfLines={1}>{notePreview}</Text>
        ) : tagNames.length === 0 ? (
          <Text style={[type.caption, { color: palette.inkMuted }]} numberOfLines={1}>No note</Text>
        ) : null}
        {tagNames.length ? (
          <View style={styles.entryTags}>
            {tagNames.slice(0, 4).map((n) => (
              <View key={n} style={styles.miniTag}>
                <Text style={[type.caption, { color: palette.inkSoft }]} numberOfLines={1}>#{n}</Text>
              </View>
            ))}
            {entry.sentiment ? <Icon name="sparkle" size={13} color={palette.inkMuted} /> : null}
          </View>
        ) : entry.sentiment ? (
          <Icon name="sparkle" size={13} color={palette.inkMuted} />
        ) : null}
      </View>
      <Icon name="chevronRight" size={20} color={palette.inkMuted} />
    </Tappable>
  );

  if (!onDelete) return card;
  return (
    <Swipeable
      renderRightActions={() => (
        <View style={styles.actions}>
          <Tappable label="Edit entry" onPress={onPress} style={[styles.action, { backgroundColor: palette.primarySoft }]}>
            <Icon name="edit" size={20} color={palette.primary} />
            <Text style={[type.caption, { color: palette.primary }]}>Edit</Text>
          </Tappable>
          <Tappable label="Delete entry" onPress={onDelete} style={[styles.action, { backgroundColor: palette.dangerSoft }]}>
            <Icon name="trash" size={20} color={palette.danger} />
            <Text style={[type.caption, { color: palette.danger }]}>Delete</Text>
          </Tappable>
        </View>
      )}
      friction={1.6}
      rightThreshold={36}
      overshootRight={false}
    >
      {card}
    </Swipeable>
  );
}

/** A branded mood tile (drawn MoodFace) — tap to log or to select. */
export function MoodToken({
  mood,
  selected,
  onPress,
  onLongPress,
  size = 64,
  showLabel = true,
  badge,
}: {
  mood: Mood;
  selected?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  size?: number;
  showLabel?: boolean;
  badge?: number;
}) {
  // A tight ring (just +4) lets the face itself fill more of the tile — a bigger,
  // friendlier target — while still leaving room for the selection outline.
  const ring = size + 4;
  return (
    <View style={{ alignItems: "center", gap: 6, width: ring }}>
      <Tappable
        label={`${mood.name}${selected ? ", selected" : ""}`}
        role="checkbox"
        accessibilityState={{ checked: !!selected }}
        onPress={onPress}
        onLongPress={onLongPress}
        sound="pop"
        scale={0.9}
        style={[
          styles.token,
          { width: ring, height: ring, borderRadius: ring * 0.36, borderColor: selected ? mood.color : "transparent" },
        ]}
      >
        <MoodFace score={mood.score} color={mood.color} size={size} />
        {selected ? (
          <Animated.View entering={FadeIn.duration(140)} style={[styles.badge, { backgroundColor: mood.color }]}>
            <Icon name="check" size={13} color="#fff" />
          </Animated.View>
        ) : badge ? (
          <View style={[styles.badge, { backgroundColor: mood.color }]}>
            <Text style={styles.badgeTxt}>{badge}</Text>
          </View>
        ) : null}
      </Tappable>
      {showLabel ? (
        <Text style={[type.caption, selected && { color: palette.ink, fontFamily: type.bodyStrong.fontFamily }]} numberOfLines={1}>
          {mood.name}
        </Text>
      ) : null}
    </View>
  );
}

/** Compact 1–10 intensity picker (a tappable dot per level). */
export function IntensityPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.dots} accessibilityLabel={`Intensity ${value} of 10`}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <Tappable
          key={n}
          label={`Intensity ${n}`}
          sound="pop"
          scale={0.88}
          onPress={() => onChange(n)}
          style={[styles.intDot, n <= value ? styles.intDotOn : null]}
        >
          <Text style={[styles.intTxt, { color: n <= value ? palette.onPrimary : palette.inkMuted }]}>{n}</Text>
        </Tappable>
      ))}
    </View>
  );
}

/** Wrap of selectable tag chips (coloured dot + name). */
export function TagPicker({ tags, selected, onToggle }: { tags: Tag[]; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <View style={styles.tagWrap}>
      {tags.map((t) => {
        const on = selected.includes(t.id);
        return (
          <Tappable
            key={t.id}
            label={t.name}
            role="checkbox"
            accessibilityState={{ checked: on }}
            sound="pop"
            onPress={() => onToggle(t.id)}
            style={[styles.tagChip, on ? { backgroundColor: palette.primary, borderColor: palette.primary } : null]}
          >
            <View style={[styles.tagDot, { backgroundColor: t.color ?? palette.inkMuted, opacity: on ? 0 : 1 }]} />
            <Text style={[type.label, { color: on ? palette.onPrimary : palette.ink }]} numberOfLines={1}>
              {t.name}
            </Text>
          </Tappable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  entry: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.surface, borderRadius: radius.lg, borderLeftWidth: 4, paddingVertical: space.sm + 2, paddingHorizontal: space.md, minHeight: 60, ...shadow },
  entryTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  entryTags: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 1 },
  miniTag: { backgroundColor: palette.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 1 },
  actions: { flexDirection: "row", alignItems: "stretch", marginLeft: space.sm },
  action: { width: 64, alignItems: "center", justifyContent: "center", gap: 2, borderRadius: radius.lg, marginLeft: space.xs },
  token: { alignItems: "center", justifyContent: "center", borderWidth: 2.5 },
  badge: { position: "absolute", right: -1, top: -1, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: palette.surface },
  badgeTxt: { color: "#fff", fontSize: 11, fontFamily: type.bodyStrong.fontFamily },
  dots: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  intDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: palette.surfaceAlt, alignItems: "center", justifyContent: "center" },
  intDotOn: { backgroundColor: palette.primary },
  intTxt: { fontSize: 12, fontFamily: type.bodyStrong.fontFamily },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tagChip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  tagDot: { width: 8, height: 8, borderRadius: 4 },
});

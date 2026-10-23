/**
 * Manage the mood palette (UF2): reorder, rename, recolour, re-emoji, set
 * positivity, add and delete. A mood with history is deactivated (kept for
 * lookup) rather than destroyed, so old entries always resolve.
 */
import { useEffect, useState } from "react";
import { Keyboard, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, IconButton, MoodFace, Segmented, Sheet, Tappable, TextField, feedback, palette, radius, space, toast, type } from "../../ui";
import { activeMoods, addMood, deleteMood, moodInUse, renameMood, reorderMood, setMoodColor, setMoodEmoji, setMoodScore, validateMoodName } from "../../core/moods";
import { MAX_ACTIVE_MOODS } from "../../core/model";
import { moodStore, useMood } from "../../core/data";
import { analytics } from "../../modules/analytics";
import { ERRORS, EMOJI_CHOICES, COLOR_SWATCHES, scoreColor } from "../shared";

const SCORE_OPTS = [
  { value: "1", label: "Awful" },
  { value: "2", label: "Low" },
  { value: "3", label: "Okay" },
  { value: "4", label: "Good" },
  { value: "5", label: "Great" },
];

export function MoodsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useMood();
  const moods = activeMoods(s);
  const [mode, setMode] = useState<"list" | { id: string } | "new">("list");
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🙂");
  const [color, setColor] = useState(COLOR_SWATCHES[1]);
  const [score, setScore] = useState(3);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) setMode("list");
  }, [visible]);

  const openEditor = (id?: string) => {
    setError(null);
    if (id) {
      const m = moods.find((x) => x.id === id);
      if (!m) return;
      setName(m.name);
      setEmoji(m.emoji);
      setColor(m.color);
      setScore(m.score);
      setMode({ id });
    } else {
      setName("");
      setEmoji("🙂");
      setColor(COLOR_SWATCHES[1]);
      setScore(3);
      setMode("new");
    }
  };

  const move = (id: string, dir: -1 | 1) => {
    const idx = moods.findIndex((m) => m.id === id);
    const to = idx + dir;
    if (to < 0 || to >= moods.length) return;
    moodStore.set(reorderMood(moodStore.get(), id, to));
    feedback("pop", "select");
    analytics.track("mood_reordered");
  };

  const save = () => {
    // Blur the Name field before the editor (and its ScrollView) unmounts, so the
    // list never scrolls to a detached, still-focused input.
    Keyboard.dismiss();
    const editId = typeof mode === "object" ? mode.id : undefined;
    const vErr = validateMoodName(moodStore.get(), name, editId);
    if (vErr) {
      feedback("error", "error");
      return setError(ERRORS[vErr]);
    }
    if (editId) {
      let st = renameMood(moodStore.get(), editId, name).state;
      st = setMoodEmoji(st, editId, emoji);
      st = setMoodColor(st, editId, color);
      st = setMoodScore(st, editId, score);
      moodStore.set(st);
      toast("Mood updated");
    } else {
      const r = addMood(moodStore.get(), { name, emoji, color, score });
      if (r.error) {
        feedback("error", "error");
        return setError(ERRORS[r.error]);
      }
      moodStore.set(r.state);
      analytics.track("mood_added");
      toast("Mood added");
    }
    feedback("success", "success");
    // Saving a mood finishes the task: close the whole sheet so the result is
    // unmistakable (toast + the new/updated mood is now live on the Home grid),
    // rather than dropping back into the list where the change is easy to miss.
    onClose();
  };

  const remove = (id: string) => {
    Keyboard.dismiss();
    const r = deleteMood(moodStore.get(), id);
    if (r.error) {
      feedback("error", "warning");
      return toast(ERRORS[r.error]);
    }
    moodStore.set(r.state);
    feedback("pop", "warning");
    analytics.track("mood_deleted");
    toast(moodInUse(s, id) ? "Mood archived (history kept)" : "Mood deleted");
    setMode("list");
  };

  const editing = typeof mode === "object";
  return (
    <Sheet visible={visible} onClose={onClose} title={mode === "list" ? "Moods" : editing ? "Edit mood" : "New mood"}>
      {mode === "list" ? (
        <>
          <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={{ gap: space.sm }} removeClippedSubviews={false} showsVerticalScrollIndicator={false}>
            {moods.map((m, i) => (
              <View key={m.id} style={styles.row}>
                <MoodFace score={m.score} color={m.color} size={40} />
                <Tappable label={`Edit ${m.name}`} onPress={() => openEditor(m.id)} scale={0.99} style={{ flex: 1 }}>
                  <Text style={type.bodyStrong} numberOfLines={1}>{m.name}</Text>
                  <Text style={type.caption}>Positivity {m.score}/5</Text>
                </Tappable>
                <IconButton icon="chevronDown" label={`Move ${m.name} up`} size={38} onPress={() => move(m.id, -1)} style={[styles.up, { opacity: i === 0 ? 0.3 : 1 }]} />
                <IconButton icon="chevronDown" label={`Move ${m.name} down`} size={38} onPress={() => move(m.id, 1)} style={{ opacity: i === moods.length - 1 ? 0.3 : 1 }} />
              </View>
            ))}
          </ScrollView>
          <Button label="Add mood" icon="plus" size="lg" disabled={moods.length >= MAX_ACTIVE_MOODS} onPress={() => openEditor()} />
          {moods.length >= MAX_ACTIVE_MOODS ? <Text style={[type.caption, { textAlign: "center" }]}>You've reached {MAX_ACTIVE_MOODS} moods.</Text> : null}
        </>
      ) : (
        // Fields scroll, but the Save/Delete/Back actions stay PINNED below the
        // scroll so the primary action is always on screen (never buried under a
        // long emoji grid). A hand-rolled scroll+footer, kept inside the sheet.
        <>
          {/* Live preview is PINNED above the scroll so it's always on screen:
              every emoji / colour / positivity tap updates this face instantly,
              a visible effect even while the keyboard is open. The name field no
              longer autofocuses — the keyboard used to open on top of the emoji
              and colour pickers, so the tester's taps landed on the keyboard and
              "did nothing". The user taps Name only when they want to type. */}
          <View style={styles.preview}>
            <MoodFace score={score} color={color} size={72} />
          </View>
          <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ gap: space.lg }} keyboardShouldPersistTaps="handled" removeClippedSubviews={false} showsVerticalScrollIndicator={false}>
            <TextField label="Name" value={name} onChangeText={(t) => { setName(t); setError(null); }} error={error} maxLength={24} placeholder="e.g. Calm" />
            <View style={{ gap: space.sm }}>
              <Text style={type.label}>Emoji</Text>
              <View style={styles.emojiGrid}>
                {EMOJI_CHOICES.map((e) => (
                  <Tappable key={e} label={e} sound="pop" scale={0.9} onPress={() => setEmoji(e)} style={[styles.emojiCell, e === emoji && { backgroundColor: palette.primarySoft, borderColor: palette.primary }]}>
                    <Text style={{ fontSize: 22 }}>{e}</Text>
                  </Tappable>
                ))}
              </View>
            </View>
            <View style={{ gap: space.sm }}>
              <Text style={type.label}>Colour</Text>
              <View style={styles.swatchRow}>
                {COLOR_SWATCHES.map((c) => (
                  <Tappable key={c} label={`Colour ${c}`} sound="pop" scale={0.88} onPress={() => setColor(c)} style={[styles.colorDot, { backgroundColor: c }, c === color && styles.colorOn]} />
                ))}
              </View>
            </View>
            <View style={{ gap: space.sm }}>
              <Text style={type.label}>Positivity (drives your averages)</Text>
              <Segmented options={SCORE_OPTS} value={String(score)} onChange={(v) => setScore(Number(v))} />
              <View style={[styles.scoreBar, { backgroundColor: scoreColor(score) }]} />
            </View>
          </ScrollView>
          <Button label={editing ? "Save mood" : "Add mood"} size="lg" icon="check" onPress={save} />
          {editing ? <Button label="Delete mood" variant="danger" icon="trash" onPress={() => remove((mode as { id: string }).id)} /> : null}
          <Button label="Back" variant="ghost" sound={null} onPress={() => { Keyboard.dismiss(); setMode("list"); }} style={{ borderWidth: 0 }} />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56 },
  swatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  up: { transform: [{ rotate: "180deg" }] },
  preview: { alignItems: "center" },
  previewToken: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  emojiGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  emojiCell: { width: 44, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, alignItems: "center", justifyContent: "center" },
  swatchRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 3, borderColor: "transparent" },
  colorOn: { borderColor: palette.ink },
  scoreBar: { height: 6, borderRadius: 3 },
});

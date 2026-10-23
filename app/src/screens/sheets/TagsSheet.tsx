/**
 * Tag manager (add / rename / recolour / delete). Deleting a tag also strips it
 * from every entry, so no entry ever points at a dead tag.
 */
import { useEffect, useState } from "react";
import { Keyboard, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, EmptyState, IconButton, Sheet, Tappable, TextField, feedback, palette, radius, space, toast, type } from "../../ui";
import { addTag, deleteTag, renameTag, setTagColor, sortedTags, validateTagName } from "../../core/moods";
import { MAX_TAGS } from "../../core/model";
import { moodStore, useMood } from "../../core/data";
import { analytics } from "../../modules/analytics";
import { ERRORS, COLOR_SWATCHES } from "../shared";

export function TagsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useMood();
  const tags = sortedTags(s);
  const [mode, setMode] = useState<"list" | { id: string } | "new">("list");
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_SWATCHES[7]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) setMode("list");
  }, [visible]);

  const openEditor = (id?: string) => {
    setError(null);
    if (id) {
      const t = tags.find((x) => x.id === id);
      if (!t) return;
      setName(t.name);
      setColor(t.color ?? COLOR_SWATCHES[7]);
      setMode({ id });
    } else {
      setName("");
      setColor(COLOR_SWATCHES[7]);
      setMode("new");
    }
  };

  const save = () => {
    // Blur the Name field before leaving the editor, so nothing tries to scroll
    // to a focused input that's about to unmount.
    Keyboard.dismiss();
    const editId = typeof mode === "object" ? mode.id : undefined;
    const vErr = validateTagName(moodStore.get(), name, editId);
    if (vErr) {
      feedback("error", "error");
      return setError(ERRORS[vErr]);
    }
    if (editId) {
      let st = renameTag(moodStore.get(), editId, name).state;
      st = setTagColor(st, editId, color);
      moodStore.set(st);
      toast("Tag updated");
    } else {
      const r = addTag(moodStore.get(), { name, color });
      if (r.error) {
        feedback("error", "error");
        return setError(ERRORS[r.error]);
      }
      moodStore.set(r.state);
      analytics.track("tag_added");
      toast("Tag added");
    }
    feedback("success", "success");
    setMode("list");
  };

  const remove = (id: string) => {
    Keyboard.dismiss();
    moodStore.set(deleteTag(moodStore.get(), id));
    feedback("pop", "warning");
    toast("Tag deleted");
    setMode("list");
  };

  const editing = typeof mode === "object";
  return (
    <Sheet visible={visible} onClose={onClose} title={mode === "list" ? "Tags" : editing ? "Edit tag" : "New tag"}>
      {mode === "list" ? (
        <>
          {tags.length === 0 ? (
            <EmptyState icon="tag" title="No tags yet" body="Tags like Work or Sleep add context to your entries and power your insights." />
          ) : (
            <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={{ gap: space.sm }} removeClippedSubviews={false} showsVerticalScrollIndicator={false}>
              {tags.map((t) => (
                <View key={t.id} style={styles.row}>
                  <View style={[styles.dot, { backgroundColor: t.color ?? palette.inkMuted }]} />
                  <Tappable label={`Edit ${t.name}`} onPress={() => openEditor(t.id)} scale={0.99} style={{ flex: 1 }}>
                    <Text style={type.bodyStrong} numberOfLines={1}>#{t.name}</Text>
                  </Tappable>
                  <IconButton icon="trash" label={`Delete ${t.name}`} tone="danger" size={40} onPress={() => remove(t.id)} />
                </View>
              ))}
            </ScrollView>
          )}
          <Button label="Add tag" icon="plus" size="lg" disabled={tags.length >= MAX_TAGS} onPress={() => openEditor()} />
        </>
      ) : (
        <View style={{ gap: space.lg }}>
          <TextField label="Name" value={name} onChangeText={(t) => { setName(t); setError(null); }} error={error} maxLength={24} placeholder="e.g. Work" autoFocus={!editing} />
          <View style={{ gap: space.sm }}>
            <Text style={type.label}>Colour</Text>
            <View style={styles.swatchRow}>
              {COLOR_SWATCHES.map((c) => (
                <Tappable key={c} label={`Colour ${c}`} sound="pop" scale={0.88} onPress={() => setColor(c)} style={[styles.colorDot, { backgroundColor: c }, c === color && styles.colorOn]} />
              ))}
            </View>
          </View>
          <Button label={editing ? "Save tag" : "Add tag"} size="lg" icon="check" onPress={save} />
          {editing ? <Button label="Delete tag" variant="danger" icon="trash" onPress={() => remove((mode as { id: string }).id)} /> : null}
          <Button label="Back" variant="ghost" sound={null} onPress={() => { Keyboard.dismiss(); setMode("list"); }} style={{ borderWidth: 0 }} />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  swatchRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 3, borderColor: "transparent" },
  colorOn: { borderColor: palette.ink },
});

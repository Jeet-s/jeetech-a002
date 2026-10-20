/**
 * Add / edit / backfill / delete an entry — the one sheet behind every write in
 * the app (Home "New entry", Calendar "+ Add entry", tapping an entry to edit).
 * Multi-mood (up to 3), optional 1–10 intensity, tags, a note (with a
 * full-screen editor + AI tag suggestions), and backfill to a past day. Deletes
 * are soft with a 5-second Undo.
 */
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  Button,
  Card,
  Icon,
  MoodFace,
  Pill,
  Sheet,
  Tappable,
  feedback,
  palette,
  radius,
  space,
  toast,
  type,
} from "../ui";
import { activeMoods, sortedTags, addTag } from "../core/moods";
import { addEntry, editEntry, entryById, deleteEntry, restoreEntry, setNote, applySentiment } from "../core/entries";
import { MAX_MOODS_PER_ENTRY, type EntryMood } from "../core/model";
import { addDays } from "../core/dates";
import { moodStore, useMood } from "../core/data";
import { analytics } from "../modules/analytics";
import { MoodToken, IntensityPicker, TagPicker } from "./components";
import { NoteEditor } from "./NoteEditor";
import { ERRORS, nowISO, todayKey, relativeDay, timeLabel } from "./shared";
import { ai } from "../modules/ai";
import { aiEnabled, handleAiFailure } from "./useAi";

export type EntryTarget =
  // `seedMoodId`/`seedTags` power press-and-hold quick capture from the Home
  // grid: the held mood (and your last-used tags) are preselected so a habitual
  // logger lands one tap from a richer entry.
  | { kind: "new"; date?: string; seedMoodId?: string; seedTags?: string[] }
  | { kind: "edit"; id: string };

export function EntrySheet({ target, onClose, onPro }: { target: EntryTarget | null; onClose: () => void; onPro: (from: string) => void }) {
  const s = useMood();
  const moods = activeMoods(s);
  const tags = sortedTags(s);
  const intensityOn = s.prefs.intensityEnabled;
  const aiOn = aiEnabled && s.prefs.sentimentEnabled;

  const [picked, setPicked] = useState<EntryMood[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [note, setNoteText] = useState("");
  const [ts, setTs] = useState<string>(nowISO());
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [busy, setBusy] = useState(false);

  const editing = target?.kind === "edit";
  const current = editing ? entryById(s, target.id) : undefined;

  // Reset the form each time the sheet opens on a new target.
  useEffect(() => {
    if (!target) return;
    setError(null);
    setSaveState("idle");
    if (target.kind === "edit") {
      const e = entryById(moodStore.get(), target.id);
      setPicked(e ? e.moods.map((m) => ({ ...m })) : []);
      setTagIds(e ? [...e.tags] : []);
      setNoteText(e?.note ?? "");
      setTs(e?.timestamp ?? nowISO());
    } else {
      // Quick-add seed (press-and-hold on the Home grid): preselect the held
      // mood with a default intensity and carry over the last-used tags.
      setPicked(target.seedMoodId ? [intensityOn ? { moodId: target.seedMoodId, intensity: 5 } : { moodId: target.seedMoodId }] : []);
      setTagIds(target.seedTags ? [...target.seedTags] : []);
      setNoteText("");
      const t = nowISO();
      setTs(target.date && target.date !== todayKey() ? `${target.date}T12:00` : t);
    }
  }, [target]);

  // Autosave the note on an existing entry (every ~1.2s while typing).
  useEffect(() => {
    if (!editing || !current) return;
    if (note === current.note) return;
    setSaveState("saving");
    const h = setTimeout(() => {
      moodStore.set(setNote(moodStore.get(), target.id, note, nowISO()));
      setSaveState("saved");
      analytics.track("note_saved");
    }, 1200);
    return () => clearTimeout(h);
  }, [note, editing]);

  if (!target) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;

  const toggleMood = (id: string) => {
    setError(null);
    setPicked((p) => {
      if (p.some((m) => m.moodId === id)) return p.filter((m) => m.moodId !== id);
      if (p.length >= MAX_MOODS_PER_ENTRY) {
        feedback("error", "warning");
        setError(ERRORS.too_many_moods);
        return p;
      }
      return [...p, intensityOn ? { moodId: id, intensity: 5 } : { moodId: id }];
    });
  };
  const setIntensity = (id: string, v: number) => setPicked((p) => p.map((m) => (m.moodId === id ? { ...m, intensity: v } : m)));
  const toggleTag = (id: string) => setTagIds((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  const pickDay = (key: string) => {
    const time = ts.slice(11) || "12:00";
    setTs(`${key}T${time}`);
  };

  const save = () => {
    const now = nowISO();
    if (target.kind === "edit") {
      const r = editEntry(moodStore.get(), target.id, { moods: picked, tags: tagIds, note, timestamp: ts }, now);
      if (r.error) return fail(r.error);
      moodStore.set(r.state);
      feedback("success", "success");
      toast("Entry updated");
      onClose();
    } else {
      const r = addEntry(moodStore.get(), { moods: picked, tags: tagIds, note, timestamp: ts }, now);
      if (r.error) return fail(r.error);
      moodStore.set(r.state);
      feedback("success", "success");
      analytics.track("core_action", { feature: "log_mood" });
      const id = r.id!;
      toast("Entry saved", { label: "Undo", onPress: () => moodStore.set(deleteEntry(moodStore.get(), id, nowISO())) });
      onClose();
    }
  };
  const fail = (e: keyof typeof ERRORS) => {
    feedback("error", "error");
    setError(ERRORS[e]);
  };

  const del = () => {
    if (target.kind !== "edit") return;
    const id = target.id;
    moodStore.set(deleteEntry(moodStore.get(), id, nowISO()));
    feedback("pop", "warning");
    toast("Entry deleted", { label: "Undo", onPress: () => moodStore.set(restoreEntry(moodStore.get(), id, nowISO())) });
    onClose();
  };

  const suggestTags = async () => {
    if (!note.trim()) return toast("Write a note first");
    setBusy(true);
    const r = await ai.run("tag_suggestion", note);
    setBusy(false);
    if (!r.ok) return handleAiFailure(r, () => onPro("ai_tags"), suggestTags);
    const names = (r.json as { tags?: string[] })?.tags ?? [];
    let working = moodStore.get();
    const ids = [...tagIds];
    for (const raw of names) {
      const name = raw.trim();
      if (!name) continue;
      let tag = working.tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (!tag) {
        const res = addTag(working, { name });
        working = res.state;
        tag = res.id ? working.tags.find((t) => t.id === res.id) : undefined;
        if (tag) analytics.track("tag_added");
      }
      if (tag && !ids.includes(tag.id)) ids.push(tag.id);
    }
    moodStore.set(working);
    setTagIds(ids);
    feedback("success", "success");
    toast(names.length ? "Tags suggested" : "No tags to suggest");
  };

  const analyze = async () => {
    if (!editing || !note.trim()) return toast("Write a note first");
    setBusy(true);
    const r = await ai.run("note_sentiment", note);
    setBusy(false);
    if (!r.ok) return handleAiFailure(r, () => onPro("ai_sentiment"), analyze);
    const raw = r.json as { score?: number; magnitude?: number };
    moodStore.set(applySentiment(moodStore.get(), target.id, { score: raw?.score ?? 0, magnitude: raw?.magnitude ?? 0 }));
    feedback("success", "success");
    toast("Sentiment analyzed");
  };

  const dayKeys = Array.from({ length: 14 }, (_, i) => addDays(todayKey(), -i));
  const chosenDay = ts.slice(0, 10);
  const sentiment = editing ? current?.sentiment : undefined;

  return (
    <>
      <Sheet visible onClose={onClose} title={editing ? "Edit entry" : target.date && target.date !== todayKey() ? "Backfill entry" : "New entry"}>
        <ScrollView style={styles.scroll} contentContainerStyle={{ gap: space.lg }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View>
            <Text style={[type.label, styles.lbl]}>How are you feeling? {picked.length > 0 ? `(${picked.length}/${MAX_MOODS_PER_ENTRY})` : ""}</Text>
            <View style={styles.grid}>
              {moods.map((m) => (
                <MoodToken key={m.id} mood={m} size={56} selected={picked.some((p) => p.moodId === m.id)} onPress={() => toggleMood(m.id)} />
              ))}
            </View>
          </View>

          {intensityOn && picked.length ? (
            <View style={{ gap: space.sm }}>
              <Text style={[type.label, styles.lbl]}>Intensity</Text>
              {picked.map((pm) => {
                const mood = moods.find((m) => m.id === pm.moodId);
                return (
                  <View key={pm.moodId} style={styles.intRow}>
                    <MoodFace score={mood?.score ?? 3} color={mood?.color} size={28} />
                    <IntensityPicker value={pm.intensity ?? 5} onChange={(v) => setIntensity(pm.moodId, v)} />
                  </View>
                );
              })}
            </View>
          ) : null}

          {tags.length ? (
            <View style={{ gap: space.sm }}>
              <Text style={[type.label, styles.lbl]}>Tags</Text>
              <TagPicker tags={tags} selected={tagIds} onToggle={toggleTag} />
            </View>
          ) : null}

          <View style={{ gap: space.sm }}>
            <Text style={[type.label, styles.lbl]}>Note</Text>
            <Tappable
              label="Open note editor"
              sound={null}
              onPress={() => { setEditor(true); analytics.track("note_opened"); }}
              style={styles.noteBox}
            >
              <Text style={[type.body, { color: note ? palette.ink : palette.inkMuted, flex: 1 }]} numberOfLines={3}>
                {note || "Add a note — tap to write…"}
              </Text>
              <Icon name="edit" size={18} color={palette.inkMuted} />
            </Tappable>
            {aiOn ? (
              <View style={styles.aiRow}>
                <Button label="Suggest tags" icon="sparkle" variant="secondary" size="sm" loading={busy} onPress={suggestTags} />
                {editing ? <Button label="Analyze mood" icon="sparkle" variant="ghost" size="sm" loading={busy} onPress={analyze} /> : null}
              </View>
            ) : null}
            {sentiment ? (
              <Pill
                tone={sentiment.score > 0.15 ? "success" : sentiment.score < -0.15 ? "danger" : "neutral"}
                label={`Note feels ${sentiment.score > 0.15 ? "positive" : sentiment.score < -0.15 ? "low" : "neutral"} (${sentiment.score.toFixed(2)})`}
              />
            ) : null}
          </View>

          <View style={{ gap: space.sm }}>
            <Text style={[type.label, styles.lbl]}>When · {relativeDay(chosenDay)} · {timeLabel(ts)}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingVertical: 2 }}>
              {dayKeys.map((k) => {
                const on = k === chosenDay;
                return (
                  <Tappable key={k} label={relativeDay(k)} sound="pop" onPress={() => pickDay(k)} style={[styles.dayChip, on && { backgroundColor: palette.primary, borderColor: palette.primary }]}>
                    <Text style={[type.label, { color: on ? palette.onPrimary : palette.ink }]}>{relativeDay(k)}</Text>
                  </Tappable>
                );
              })}
            </ScrollView>
          </View>
        </ScrollView>

        {error ? <Text style={[type.caption, { color: palette.danger }]}>{error}</Text> : null}
        <Button label={editing ? "Save changes" : "Save entry"} size="lg" icon="check" disabled={picked.length === 0} onPress={save} />
        {editing ? <Button label="Delete entry" variant="danger" icon="trash" onPress={del} /> : null}
      </Sheet>

      <NoteEditor
        visible={editor}
        value={note}
        onChange={setNoteText}
        onClose={() => setEditor(false)}
        saveState={editing ? saveState : "idle"}
        onSuggestTags={aiOn ? suggestTags : undefined}
        suggesting={busy}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 380 },
  lbl: { color: palette.ink },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: space.sm, marginTop: space.sm },
  intRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  noteBox: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 64, backgroundColor: palette.surfaceAlt, borderRadius: radius.md, padding: space.md },
  aiRow: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  dayChip: { minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, justifyContent: "center" },
});

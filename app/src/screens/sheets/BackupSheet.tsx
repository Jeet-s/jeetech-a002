/**
 * Backup & Restore (UF4). A backup is a portable file you keep — save it to
 * Files/Drive or move to a new phone, then restore by pasting it back. The file
 * carries no PIN or secrets, and a checksum + version guard catch corrupt or
 * unsupported files. Every backup/restore is written to the audit log.
 */
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Share, Text, View } from "react-native";
import { Button, Card, Icon, Pill, Sheet, TextField, feedback, palette, radius, space, toast, type } from "../../ui";
import { createBackup, restoreBackup, exportAuditJSON, validateBackup, type BackupPreview } from "../../core/backup";
import type { BackupPayload } from "../../core/model";
import { moodStore, useMood } from "../../core/data";
import { analytics } from "../../modules/analytics";
import { ERRORS, nowISO, timeLabel, dateLabel } from "../shared";

export function BackupSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useMood();
  const [mode, setMode] = useState<"home" | "restore">("home");
  const [paste, setPaste] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const lastBackup = s.backups[0];

  const create = async () => {
    const { state, payload } = createBackup(moodStore.get(), nowISO());
    moodStore.set(state);
    analytics.track("backup_created");
    feedback("success", "success");
    try {
      await Share.share({ message: JSON.stringify(payload), title: "Floria backup" });
    } catch {
      /* cancelled */
    }
    toast("Backup created");
  };

  const parsePayload = (): BackupPayload | null => {
    try {
      const pl = JSON.parse(paste.trim());
      return pl && typeof pl === "object" ? (pl as BackupPayload) : null;
    } catch {
      return null;
    }
  };

  // Dry run: verify the file's version + checksum and show what it holds —
  // WITHOUT overwriting anything. Lets users trust a restore before committing.
  const testRestore = () => {
    const v = validateBackup(parsePayload());
    if (!v.ok) {
      feedback("error", "error");
      setPreview(null);
      return setError(ERRORS[v.error!]);
    }
    setError(null);
    setPreview(v.preview!);
    feedback("success", "success");
    toast("Backup is valid — nothing was changed");
  };

  const doRestore = () => {
    analytics.track("restore_attempt");
    const payload = parsePayload();
    const v = validateBackup(payload);
    if (!v.ok || !payload) {
      feedback("error", "error");
      analytics.track("restore_failure");
      return setError(ERRORS[v.error ?? "corrupt"]);
    }
    const c = v.preview!.counts;
    Alert.alert(
      "Restore this backup?",
      `This replaces everything on this phone with ${c.entries} ${c.entries === 1 ? "entry" : "entries"}, ${c.moods} moods and ${c.tags} tags from the backup. Your current data is overwritten and can't be recovered.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          style: "destructive",
          onPress: () => {
            const r = restoreBackup(moodStore.get(), payload, nowISO());
            moodStore.set(r.state);
            if (r.error) {
              feedback("error", "error");
              analytics.track("restore_failure");
              setError(ERRORS[r.error]);
            } else {
              feedback("success", "success");
              analytics.track("restore_success");
              toast(`Restored ${c.entries} ${c.entries === 1 ? "entry" : "entries"}`);
              setPaste("");
              setPreview(null);
              setMode("home");
              onClose();
            }
          },
        },
      ],
    );
  };

  const exportAudit = async () => {
    try {
      await Share.share({ message: exportAuditJSON(moodStore.get()), title: "Floria audit log" });
    } catch {
      /* cancelled */
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={mode === "home" ? "Backup & restore" : "Restore a backup"}>
      {mode === "home" ? (
        <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ gap: space.lg }} showsVerticalScrollIndicator={false}>
          {/* Last-backup status, front and centre so it's obvious whether you're covered. */}
          <View style={[styles.status, lastBackup ? styles.statusOk : styles.statusWarn]}>
            <Icon name={lastBackup ? "shield" : "bell"} size={18} color={lastBackup ? palette.success : palette.warning} />
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong}>{lastBackup ? "Last backup" : "No backup yet"}</Text>
              <Text style={type.caption} numberOfLines={1}>
                {lastBackup ? `${dateLabel(lastBackup.createdAt.slice(0, 10))} · ${timeLabel(lastBackup.createdAt)}` : "Create one below to keep a copy safe."}
              </Text>
            </View>
            {lastBackup ? <Pill label="Saved" tone="success" /> : null}
          </View>

          {/* Plain-language promise so restores feel trustworthy, not risky. */}
          <View style={styles.note}>
            <Text style={[type.caption, { color: palette.inkSoft }]}>
              A backup is a single data file holding your moods, tags, entries and reminders. It never includes your PIN or passwords.
              Keep it somewhere private (Files, Drive) — anyone with the file can read your journal.
            </Text>
          </View>

          <Button label="Create backup" icon="download" size="lg" onPress={create} />
          <Button label="Restore from a backup" icon="undo" variant="secondary" onPress={() => { setPaste(""); setError(null); setPreview(null); setMode("restore"); }} />

          <View style={{ gap: space.sm }}>
            <Text style={type.label}>Recent backups ({s.backups.length})</Text>
            {s.backups.length === 0 ? (
              <Text style={type.caption}>No backups yet.</Text>
            ) : (
              s.backups.slice(0, 10).map((b) => (
                <View key={b.id} style={styles.row}>
                  <Icon name="shield" size={16} color={palette.success} />
                  <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{dateLabel(b.createdAt.slice(0, 10))} · {timeLabel(b.createdAt)}</Text>
                  <Text style={type.caption}>{(b.sizeBytes / 1024).toFixed(1)} KB</Text>
                </View>
              ))
            )}
          </View>

          {s.audit.length ? (
            <Card style={{ gap: space.sm, backgroundColor: palette.surfaceAlt, shadowOpacity: 0, elevation: 0 }}>
              <View style={styles.row}>
                <Text style={[type.label, { flex: 1 }]}>Audit log</Text>
                <Button label="Export" variant="ghost" size="sm" icon="download" onPress={exportAudit} />
              </View>
              {s.audit.slice(0, 4).map((a) => (
                <Text key={a.id} style={type.caption} numberOfLines={1}>
                  {a.success ? "✓" : "✕"} {a.event} · {a.details} · {timeLabel(a.timestamp)}
                </Text>
              ))}
            </Card>
          ) : null}
        </ScrollView>
      ) : (
        <View style={{ gap: space.lg }}>
          <Text style={[type.body, { color: palette.inkSoft }]}>Paste the contents of a backup file below. Test it first to see what it holds — nothing changes until you restore.</Text>
          <TextField
            label="Backup data"
            value={paste}
            onChangeText={(t) => { setPaste(t); setError(null); setPreview(null); }}
            error={error}
            multiline
            placeholder='{"version":1,…}'
            style={{ minHeight: 120, textAlignVertical: "top", paddingTop: space.md }}
          />
          {preview ? (
            <Card style={{ gap: space.sm, backgroundColor: palette.successSoft, shadowOpacity: 0, elevation: 0 }}>
              <View style={styles.row}>
                <Icon name="check" size={16} color={palette.success} />
                <Text style={[type.bodyStrong, { flex: 1 }]}>Valid backup{preview.createdAt ? ` · ${dateLabel(preview.createdAt.slice(0, 10))}` : ""}</Text>
              </View>
              <Text style={type.caption}>
                Restoring brings in {preview.counts.entries} {preview.counts.entries === 1 ? "entry" : "entries"} · {preview.counts.moods} moods · {preview.counts.tags} tags · {preview.counts.reminders} reminders.
              </Text>
            </Card>
          ) : null}
          <Button label="Test restore (no changes)" icon="shield" variant="secondary" disabled={!paste.trim()} onPress={testRestore} />
          <Button label="Restore" size="lg" icon="undo" disabled={!paste.trim()} onPress={doRestore} />
          <Button label="Back" variant="ghost" sound={null} onPress={() => { setPreview(null); setMode("home"); }} style={{ borderWidth: 0 }} />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hero: { alignSelf: "center", width: 64, height: 64, borderRadius: 32, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 32 },
  status: { flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.md, padding: space.md },
  statusOk: { backgroundColor: palette.successSoft },
  statusWarn: { backgroundColor: palette.warningSoft },
  note: { backgroundColor: palette.surfaceAlt, borderRadius: radius.md, padding: space.md },
});

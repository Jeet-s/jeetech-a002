/**
 * Settings hub: account & cloud backup, Pro, the mood/tag/reminder managers,
 * journal preferences, the free app lock, backup/restore, export, privacy, and
 * delete-all. A thin router opens each manager as a sheet.
 */
import { useState } from "react";
import { Alert, Linking, StyleSheet, Text, View } from "react-native";
import {
  AccountSheet,
  Button,
  Card,
  ListItem,
  Pill,
  Screen,
  SectionHeader,
  Sheet,
  Toggle,
  palette,
  space,
  toast,
  type,
  useCloudUser,
} from "../ui";
import { cloud } from "../modules/cloud";
import { store, useSettings } from "../modules/store";
import { iap } from "../modules/iap";
import { moodStore, useMood, pullMoodAfterSignIn, syncMoodNow } from "../core/data";
import { activeMoods, sortedTags } from "../core/moods";
import product from "../../product.json";
import { MoodsSheet } from "./sheets/MoodsSheet";
import { TagsSheet } from "./sheets/TagsSheet";
import { RemindersSheet } from "./sheets/RemindersSheet";
import { SecuritySheet } from "./sheets/SecuritySheet";
import { BackupSheet } from "./sheets/BackupSheet";
import { ExportSheet } from "./sheets/ExportSheet";
import { PreferencesSheet } from "./sheets/PreferencesSheet";
import { syncReminders } from "./notify";
import { clockLabel } from "./shared";

type SheetId = "moods" | "tags" | "reminders" | "security" | "backup" | "export" | "prefs" | "account" | "privacy" | null;

const PRIVACY = [
  "Your journal lives on this device. No account is required to use Floria.",
  "Your PIN is never stored — only a salted, one-way hash. Forgetting it is recoverable by restoring a backup.",
  "AI features are opt-in and send only the note text you choose — never your media, moods or identity.",
  "Cloud backup (Pro) is encrypted in transit and at rest, but is not end-to-end encrypted.",
  "You can export everything, or delete all data, at any time.",
];

export function SettingsScreen({ bottomInset, onPro }: { bottomInset: number; onPro: (from: string) => void }) {
  const s = useSettings();
  const mood = useMood();
  const user = useCloudUser();
  const [sheet, setSheet] = useState<SheetId>(null);
  const close = () => setSheet(null);

  const moodCount = activeMoods(mood).length;
  const tagCount = sortedTags(mood).length;
  const reminderCount = mood.reminders.filter((r) => r.enabled).length;
  const nextReminder = mood.reminders.find((r) => r.enabled);

  const deleteAll = () =>
    Alert.alert("Delete all data?", "This permanently removes every mood, entry, tag, reminder and backup record from this phone. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete everything", style: "destructive", onPress: () => { moodStore.reset(); syncReminders([]); toast("All data deleted"); } },
    ]);

  return (
    <>
      <Screen title="Settings" bottomInset={bottomInset}>
        {cloud.online && cloud.emailSignIn ? (
          <Card padded={false} style={styles.group}>
            <ListItem
              icon="cloud"
              title={user && !user.anonymous ? "Account & cloud backup" : "Back up to the cloud"}
              subtitle={user && !user.anonymous ? user.email ?? "Signed in" : cloud.proOnly && !s.pro ? "Pro · sign in to sync across phones" : "Sign in with email to sync across phones"}
              trailing={user && !user.anonymous ? <Pill label="Synced" tone="success" /> : undefined}
              onPress={() => (cloud.proOnly && !s.pro ? onPro("cloud") : setSheet("account"))}
            />
            {cloud.enabled && user && !user.anonymous ? (
              <ListItem
                icon="undo"
                title="Sync now"
                subtitle="Auto-syncs after every change · encrypted in transit & at rest"
                onPress={async () => {
                  toast("Syncing…");
                  await syncMoodNow().catch(() => {});
                  toast("Backed up to the cloud");
                }}
              />
            ) : null}
          </Card>
        ) : null}

        <Card padded={false} style={styles.group}>
          {s.pro ? (
            <ListItem icon="star" iconTint={palette.warning} title="Floria Pro" subtitle="Thanks for supporting the app" trailing={<Pill label="Active" tone="success" />} />
          ) : (
            <ListItem icon="star" iconTint={palette.warning} title="Upgrade to Pro" subtitle="Reports, themes, auto cloud sync & more AI" onPress={() => onPro("settings")} />
          )}
          {s.proSource === "subscription" ? <ListItem icon="star" title="Manage subscription" onPress={() => iap.manageSubscriptions()} /> : null}
        </Card>

        <SectionHeader title="Personalize" />
        <Card padded={false} style={styles.group}>
          <ListItem icon="home" title="Moods" subtitle={`${moodCount} active`} onPress={() => setSheet("moods")} />
          <ListItem icon="tag" title="Tags" subtitle={tagCount ? `${tagCount} tags` : "None yet"} onPress={() => setSheet("tags")} />
          <ListItem icon="bell" title="Reminders" subtitle={reminderCount ? `${reminderCount} on · next ${clockLabel(nextReminder!.hourlyRange?.start ?? nextReminder!.time)}` : "Off"} onPress={() => setSheet("reminders")} />
          <ListItem icon="palette" title="Journal preferences" subtitle={`Day starts ${clockLabel(`${String(mood.prefs.dayStartHour).padStart(2, "0")}:00`)}${mood.prefs.intensityEnabled ? " · intensity on" : ""}`} onPress={() => setSheet("prefs")} />
        </Card>

        <SectionHeader title="Privacy & data" />
        <Card padded={false} style={styles.group}>
          <ListItem icon="lock" title="App lock" subtitle={mood.lock.enabled ? "PIN on" : "Off · free PIN & biometric"} onPress={() => setSheet("security")} />
          <ListItem icon="cloud" title="Backup & restore" subtitle={mood.backups.length ? `${mood.backups.length} saved` : "No backups yet"} onPress={() => setSheet("backup")} />
          <ListItem icon="download" title="Export data" subtitle="CSV / JSON — never locked" onPress={() => setSheet("export")} />
          <ListItem icon="shield" title="Privacy" subtitle="How your data is protected" onPress={() => setSheet("privacy")} />
          <ListItem icon="trash" title="Delete all data" destructive onPress={deleteAll} />
        </Card>

        <SectionHeader title="Feedback" />
        <Card padded={false} style={styles.group}>
          <Toggle label="Vibration" description="A light tap on every action" value={s.haptics !== false} onChange={(v) => store.set({ haptics: v })} />
          <Toggle label="Sounds" description="Subtle confirmation sounds" value={s.sound === true} onChange={(v) => store.set({ sound: v })} />
        </Card>

        <SectionHeader title="Purchases" />
        <Card padded={false} style={styles.group}>
          <ListItem icon="undo" title="Restore purchases" onPress={async () => { const n = await iap.restore().catch(() => 0); toast(n ? "Purchases restored" : "No purchases found"); }} />
        </Card>

        <View style={styles.footer}>
          <Text style={type.caption}>{product.title}</Text>
          <Text style={type.caption}>Private by default · offline-first · no ads for Pro</Text>
        </View>
      </Screen>

      <MoodsSheet visible={sheet === "moods"} onClose={close} />
      <TagsSheet visible={sheet === "tags"} onClose={close} />
      <RemindersSheet visible={sheet === "reminders"} onClose={close} />
      <PreferencesSheet visible={sheet === "prefs"} onClose={close} />
      <SecuritySheet visible={sheet === "security"} onClose={close} />
      <BackupSheet visible={sheet === "backup"} onClose={close} />
      <ExportSheet visible={sheet === "export"} onClose={close} onPro={onPro} />
      <AccountSheet
        visible={sheet === "account"}
        onClose={close}
        onSignedIn={(r) => pullMoodAfterSignIn(r.switched)}
      />

      <Sheet visible={sheet === "privacy"} onClose={close} title="Your privacy">
        <View style={{ gap: space.md }}>
          {PRIVACY.map((p, i) => (
            <View key={i} style={styles.privRow}>
              <Text style={[type.body, { color: palette.primary }]}>•</Text>
              <Text style={[type.body, { color: palette.inkSoft, flex: 1 }]}>{p}</Text>
            </View>
          ))}
          <Button label="Close" variant="secondary" onPress={close} />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  group: { paddingHorizontal: space.lg },
  footer: { alignItems: "center", gap: 2, marginTop: space.sm },
  privRow: { flexDirection: "row", gap: space.sm },
});

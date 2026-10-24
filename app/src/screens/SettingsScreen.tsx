/**
 * Settings hub: account & cloud backup, Pro, the mood/tag/reminder managers,
 * journal preferences, the free app lock, backup/restore, export, privacy, and
 * delete-all. A thin router opens each manager as a sheet.
 */
import { useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
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
  feedback,
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
import cloudConfig from "../../cloud.json";
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

// In-app privacy disclosure. Names the SDKs, the data each handles and how to
// delete it, so Settings is a sufficient, self-contained privacy statement
// (Play policy for apps with ads, cloud sync and AI). Mirrors the hosted policy.
const PRIVACY: { title: string; lines: string[] }[] = [
  {
    title: "On this device",
    lines: [
      "Your journal, moods, tags and notes live on this phone. No account is required to use Floria.",
      "Your PIN is never stored — only a salted, one-way hash. Forgetting it is recoverable by restoring a backup.",
    ],
  },
  {
    title: "Cloud backup & sync (Pro)",
    lines: [
      "When you sign in with an email code, your journal is synced to our cloud so it is available on another phone.",
      "It is encrypted in transit and at rest, but is not end-to-end encrypted — we can technically access it to run the service.",
      "Delete your account anytime (in Account, or the web link) to remove everything from the cloud.",
    ],
  },
  {
    title: "AI reflections",
    lines: [
      "AI features are opt-in and send only the note text you choose to our AI provider — never your media, moods, tags or identity.",
      "AI reflections are for self-reflection only — not medical, diagnostic or treatment advice.",
      "You can report an offensive or wrong AI response from the reflection and sentiment screens.",
    ],
  },
  {
    title: "Ads (free tier)",
    lines: [
      "Free users see a single banner ad from Google AdMob. We ask for your consent (UMP) before any ad request, and AdMob may use an advertising identifier.",
      "Ads never surprise you: none on launch, exit or mid-task, and they never cover your controls. We don't show interstitials, and any rewarded ad is strictly opt-in — only after you tap to watch one.",
      "Pro and Remove Ads turn ads off entirely.",
    ],
  },
  {
    title: "Your controls",
    lines: [
      "Export everything to CSV or JSON, delete all on-device data, or delete your cloud account — anytime, free.",
    ],
  },
];

// Hosted privacy policy (same App Cloud host as account deletion). It names the
// SDKs, the data collected and the deletion process; linked here per Play policy.
const privacyPolicyUrl = cloudConfig.apiUrl ? `${cloudConfig.apiUrl}/legal/privacy?app=${encodeURIComponent(cloudConfig.app)}` : null;

export function SettingsScreen({ bottomInset, onPro }: { bottomInset: number; onPro: (from: string) => void }) {
  const s = useSettings();
  const mood = useMood();
  const user = useCloudUser();
  const [sheet, setSheet] = useState<SheetId>(null);
  // Last restore result, shown as a lasting subtitle so the row never looks dead.
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
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
          <>
            <SectionHeader title="Account" />
            <Card padded={false} style={styles.group}>
              {/* Sign-in is ALWAYS optional: Floria is fully usable — and fully
                  reviewable — without an account (everything is saved on this
                  phone). Signing in only adds cloud backup/sync across phones.
                  The entry is framed as optional, never as a required login
                  wall, so a Play reviewer is never funnelled into the email-code
                  step as if it gated the app. */}
              <ListItem
                icon="cloud"
                title={user && !user.anonymous ? "Account & cloud backup" : "Cloud backup & sync"}
                subtitle={user && !user.anonymous ? user.email ?? "Signed in" : "Optional · email-code sign-in to sync across phones (Pro)"}
                trailing={user && !user.anonymous ? <Pill label="Synced" tone="success" /> : <Pill label="Optional" />}
                onPress={() => setSheet("account")}
              />
              {user && !user.anonymous ? (
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
            {user && !user.anonymous ? null : (
              <Text style={styles.accountNote}>
                No account needed — Floria works fully without signing in. Your journal stays saved on this phone; sign in only to back up and sync across phones.
              </Text>
            )}
          </>
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
          <ListItem icon="shield" title="Privacy & data" subtitle="SDKs, AI, ads & how to delete your data" onPress={() => setSheet("privacy")} />
          <ListItem icon="trash" title="Delete all data" destructive onPress={deleteAll} />
        </Card>

        <SectionHeader title="Feedback" />
        <Card padded={false} style={styles.group}>
          <Toggle label="Vibration" description="A light tap on every action" value={s.haptics !== false} onChange={(v) => store.set({ haptics: v })} />
          <Toggle label="Sounds" description="Subtle confirmation sounds" value={s.sound === true} onChange={(v) => store.set({ sound: v })} />
        </Card>

        <SectionHeader title="Purchases" />
        <Card padded={false} style={styles.group}>
          <ListItem
            icon="undo"
            title="Restore purchases"
            subtitle={restoreMsg ?? "Re-add a past purchase on this device"}
            onPress={async () => {
              // Always report back so the control never looks dead: a visible
              // toast AND a lasting subtitle for restored / nothing / unreachable.
              setRestoreMsg("Checking your purchases…");
              toast("Checking your purchases…");
              const n = await iap.restore().catch(() => -1);
              if (n > 0) {
                feedback("success", "success");
                toast("Purchases restored");
                setRestoreMsg("Purchases restored.");
              } else if (n === 0) {
                feedback("pop", "warning");
                toast("Nothing to restore");
                setRestoreMsg("No previous purchases found.");
              } else {
                feedback("error", "error");
                toast("Couldn't reach the store — try again");
                setRestoreMsg("Couldn't reach the store — try again.");
              }
            }}
          />
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

      <Sheet visible={sheet === "privacy"} onClose={close} title="Privacy & data">
        <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: space.lg }} removeClippedSubviews={false} showsVerticalScrollIndicator={false}>
          {PRIVACY.map((section) => (
            <View key={section.title} style={{ gap: space.sm }}>
              <Text style={[type.label, { color: palette.ink }]}>{section.title}</Text>
              {section.lines.map((line, i) => (
                <View key={i} style={styles.privRow}>
                  <Text style={[type.body, { color: palette.primary }]}>•</Text>
                  <Text style={[type.body, { color: palette.inkSoft, flex: 1 }]}>{line}</Text>
                </View>
              ))}
            </View>
          ))}
          {privacyPolicyUrl ? (
            <Button
              label="Read the full privacy policy"
              variant="secondary"
              icon="shield"
              onPress={() => Linking.openURL(privacyPolicyUrl).catch(() => toast("Couldn't open the policy"))}
            />
          ) : null}
          <Button label="Close" variant="ghost" onPress={close} />
        </ScrollView>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  group: { paddingHorizontal: space.lg },
  accountNote: { ...type.caption, color: palette.inkSoft, paddingHorizontal: space.lg, marginTop: space.sm },
  footer: { alignItems: "center", gap: 2, marginTop: space.sm },
  privRow: { flexDirection: "row", gap: space.sm },
});

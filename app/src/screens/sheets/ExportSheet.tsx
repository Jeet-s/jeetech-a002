/**
 * Export (never paywalled): share your full data as CSV or JSON — complete,
 * untruncated, openable anywhere. A styled summary report is the Pro extra.
 */
import { Share, StyleSheet, Text, View } from "react-native";
import { Button, Icon, ListItem, Sheet, palette, space, toast, type } from "../../ui";
import { exportCSV, exportJSON, canExportPDF } from "../../core/backup";
import { activeEntries } from "../../core/entries";
import { rangeStats, monthRange } from "../../core/insights";
import { tagById } from "../../core/moods";
import { moodStore, useMood } from "../../core/data";
import { useSettings } from "../../modules/store";
import { analytics } from "../../modules/analytics";
import { nowISO, moodWord, dateLabel } from "../shared";

export function ExportSheet({ visible, onClose, onPro }: { visible: boolean; onClose: () => void; onPro: (from: string) => void }) {
  const s = useMood();
  const { pro } = useSettings();
  const count = activeEntries(s).length;

  const share = async (content: string, title: string) => {
    try {
      await Share.share({ message: content, title });
      toast("Export ready");
    } catch {
      /* cancelled — no nag */
    }
  };

  const report = async () => {
    analytics.track("pdf_export_attempt");
    const now = nowISO();
    const { from, to } = monthRange(now, s.prefs);
    const st = rangeStats(s, from, to, now, s.prefs);
    const text = [
      `Floria — Monthly report (${dateLabel(from)} – ${dateLabel(to)})`,
      ``,
      `Average mood: ${st.avgMood === null ? "—" : `${st.avgMood.toFixed(1)} (${moodWord(st.avgMood)})`}`,
      `Entries: ${st.entries} · Days logged: ${st.daysLogged}`,
      `Current streak: ${st.streak} · Best streak: ${st.bestStreak}`,
      st.topTags.length ? `Top tags: ${st.topTags.map((t) => `${tagById(s, t.tagId)?.name ?? "?"} (${t.count})`).join(", ")}` : "",
    ].filter(Boolean).join("\n");
    await share(text, "Floria report");
    analytics.track("pdf_export_success");
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Export data">
      <View style={styles.hero}>
        <Icon name="download" size={26} color={palette.primary} />
      </View>
      <Text style={[type.body, { color: palette.inkSoft, textAlign: "center" }]}>
        {count} {count === 1 ? "entry" : "entries"} · your data is never locked. Exports include full note text.
      </Text>
      <ListItem icon="download" title="Export as CSV" subtitle="Spreadsheet-friendly" onPress={() => share(exportCSV(moodStore.get()), "Floria export (CSV)")} />
      <ListItem icon="download" title="Export as JSON" subtitle="Complete raw data" onPress={() => share(exportJSON(moodStore.get()), "Floria export (JSON)")} />
      <ListItem
        icon="star"
        iconTint={palette.warning}
        title="Summary report"
        subtitle={canExportPDF(pro) ? "Monthly highlights to share" : "Pro — styled highlights"}
        onPress={() => (canExportPDF(pro) ? report() : onPro("export_report"))}
      />
      {!pro ? (
        <Text style={[type.caption, { textAlign: "center", color: palette.primary }]} accessibilityRole="button" onPress={() => onPro("export")}>
          Why Pro? See what's included
        </Text>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hero: { alignSelf: "center", width: 64, height: 64, borderRadius: 32, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
});

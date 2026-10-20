/**
 * Full-screen, distraction-free note editor (PRD "Quick Note Editor"): a large
 * comfortable writing area that scrolls naturally and holds very long text,
 * with a visible autosave state and optional AI tag suggestions. Opened from
 * the entry editor's note field.
 */
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Icon, IconButton, Pill, fonts, palette, space, type } from "../ui";

export function NoteEditor({
  visible,
  value,
  onChange,
  onClose,
  saveState = "idle",
  onSuggestTags,
  suggesting,
}: {
  visible: boolean;
  value: string;
  onChange: (t: string) => void;
  onClose: () => void;
  saveState?: "idle" | "saving" | "saved";
  onSuggestTags?: () => void;
  suggesting?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.header}>
          <IconButton icon="chevronLeft" label="Back to entry" size={40} onPress={onClose} />
          <Text style={[type.heading, { flex: 1 }]}>Note</Text>
          {saveState === "saving" ? <Pill label="Saving…" tone="neutral" /> : saveState === "saved" ? <Pill label="Saved" tone="success" icon={<Icon name="check" size={13} color={palette.success} />} /> : null}
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={insets.top + 8}>
          <TextInput
            value={value}
            onChangeText={onChange}
            multiline
            autoFocus
            placeholder="Write freely — what happened, how you felt, anything on your mind."
            placeholderTextColor={palette.inkMuted}
            style={styles.input}
            textAlignVertical="top"
            accessibilityLabel="Note text"
          />
          <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
            <Text style={type.caption}>{value.length.toLocaleString()} characters</Text>
            <View style={styles.footerBtns}>
              {onSuggestTags ? (
                <Button label="Suggest tags" icon="sparkle" variant="secondary" size="sm" loading={suggesting} onPress={onSuggestTags} />
              ) : null}
              <Button label="Done" icon="check" size="sm" onPress={onClose} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg, paddingHorizontal: space.lg },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.sm },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 17, lineHeight: 25, color: palette.ink, paddingTop: space.sm },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, paddingTop: space.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  footerBtns: { flexDirection: "row", gap: space.sm },
});

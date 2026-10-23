/**
 * The one Pro offer, opened from a locked feature or Settings. Shows a branded
 * preview, the perks, selectable price cards (monthly / yearly with a savings
 * badge) stating price, period and trial BEFORE purchase, a guarantee line, the
 * lifetime unlock as an alternative, and a sticky gradient CTA. Honest that the
 * higher daily AI limit comes with a subscription. No nags; closes once Pro.
 */
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Icon, MoodFace, Segmented, Sheet, Tappable, feedback, gradient, palette, radius, space, toast, type } from "../ui";
import { iap, type PlanItem } from "../modules/iap";
import { useSettings } from "../modules/store";
import { analytics } from "../modules/analytics";
import monetization from "../../monetization.json";

// Four perks that add detail beyond the three benefit icons above — kept tight so
// the panel stays scannable and the CTA isn't buried under copy.
const PERKS = [
  { icon: "chart", text: "Tag & time-of-day correlations over any date range" },
  { icon: "cloud", text: "Automatic cloud backup & sync across phones" },
  { icon: "sparkle", text: "Higher daily AI limit for reflections & sentiment" },
  { icon: "download", text: "Styled, shareable summary reports" },
] as const;

/** Three headline benefits as micro-illustrations — a quick, visual "what you get". */
const BENEFITS = [
  { icon: "chart", label: "Deeper insights", color: palette.primary },
  { icon: "cloud", label: "Cloud backup", color: "#14B8A6" },
  { icon: "sparkle", label: "More daily AI", color: "#8B5CF6" },
] as const;

/** Display fallback so the price cards always render (e.g. in store screenshots, billing off). */
const CONFIG_PLANS: PlanItem[] = ((monetization as { subscriptions?: { sku: string; priceUsd: number; trialDays: number }[] }).subscriptions ?? []).map((p) => ({
  sku: p.sku,
  title: p.sku,
  price: `$${p.priceUsd.toFixed(2)}`,
  period: p.sku.includes("year") ? "P1Y" : "P1M",
  trialDays: p.trialDays,
  offerToken: null,
}));

const periodWord = (p: PlanItem) => (p.sku.includes("year") || p.period === "P1Y" ? "year" : "month");
const planTitle = (p: PlanItem) => (periodWord(p) === "year" ? "Yearly" : "Monthly");
const usd = (p: PlanItem) => monetization.subscriptions?.find((m) => m.sku === p.sku)?.priceUsd ?? null;
/** Per-month equivalent of a yearly plan, for the "≈ $2.50/mo" tag that makes the saving obvious. */
const perMonth = (p: PlanItem): string | null => {
  const u = usd(p);
  return u ? `$${(u / 12).toFixed(2)}` : null;
};

export function ProSheet({ visible, from, onClose }: { visible: boolean; from: string; onClose: () => void }) {
  const { pro, adsRemoved } = useSettings();
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  // A lasting result line under the Restore link (a toast alone is too fleeting
  // for a tester / user to catch — this stays until the next action).
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);

  const livePlans = iap.plans();
  const plans = livePlans.length ? livePlans : CONFIG_PLANS;
  const yearly = plans.find((p) => periodWord(p) === "year");
  const monthly = plans.find((p) => periodWord(p) === "month");
  // Yearly savings vs 12× monthly, from the configured USD prices.
  const savePct = useMemo(() => {
    const y = yearly && usd(yearly);
    const m = monthly && usd(monthly);
    if (!y || !m) return null;
    const pct = Math.round((1 - y / (m * 12)) * 100);
    return pct > 0 ? pct : null;
  }, [yearly, monthly]);

  useEffect(() => {
    if (visible) analytics.track("paywall_view", { from });
  }, [visible, from]);
  useEffect(() => {
    if (pro && visible) {
      feedback("unlock", "success");
      onClose();
    }
  }, [pro, visible, onClose]);
  useEffect(() => {
    if (!visible) return;
    setSel(plans.find((p) => periodWord(p) === "year")?.sku ?? plans[0]?.sku ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    analytics.track("purchase_attempt", { from });
    await fn().catch(() => {});
    setBusy(false);
  };

  // Restore always reports back: a toast confirms restored / nothing-found /
  // store-unreachable so the control never looks dead (it did in QA — a bare
  // tap with no visible result). On success the `pro` effect above closes us.
  const restore = async () => {
    setBusy(true);
    setRestoreMsg("Checking your purchases…");
    const n = await iap.restore().catch(() => -1);
    setBusy(false);
    analytics.track("restore_purchases", { found: Math.max(0, n) });
    if (n > 0) {
      feedback("success", "success");
      toast("Purchases restored");
      setRestoreMsg("Purchases restored.");
    } else if (n === 0) {
      feedback("pop", "warning");
      toast("No purchases found to restore");
      setRestoreMsg("No previous purchases found on this account.");
    } else {
      feedback("error", "error");
      toast("Couldn't reach the store — try again");
      setRestoreMsg("Couldn't reach the store — try again.");
    }
  };

  // Opened because a free AI use was spent → lead with the reason + the fix.
  const fromQuota = from.startsWith("ai");
  const selected = plans.find((p) => p.sku === sel) ?? null;
  const ctaLabel = selected
    ? selected.trialDays
      ? `Start ${selected.trialDays}-day free trial`
      : `Continue · ${selected.price}/${periodWord(selected)}`
    : "Unlock Pro";
  const ctaSub = selected
    ? `Then ${selected.price}/${periodWord(selected)} · cancel anytime in Google Play`
    : "Lifetime — one payment, honored forever";

  return (
    <Sheet visible={visible} title="Floria Pro" onClose={onClose}>
      <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: space.lg }} removeClippedSubviews={false} showsVerticalScrollIndicator={false}>
        {fromQuota ? (
          <View style={styles.quota}>
            <Icon name="sparkle" size={16} color={palette.primary} />
            <Text style={[type.caption, { flex: 1, color: palette.ink }]}>
              You've used today's 5 free AI notes. A subscription raises the limit to 100 a day — your core journal stays free either way.
            </Text>
          </View>
        ) : null}

        {/* Branded preview — the mood system in Floria's colours. */}
        <LinearGradient colors={gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.preview}>
          <Text style={[type.overline, { color: gradient.onHeroSoft }]}>Your mood story, unlocked</Text>
          <View style={styles.faceRow}>
            {[1, 2, 3, 4, 5].map((sc) => (
              <MoodFace key={sc} score={sc} size={40} />
            ))}
          </View>
          <View style={styles.previewBars}>
            {[0.5, 0.8, 0.4, 0.9, 0.6, 1, 0.7].map((h, i) => (
              <View key={i} style={[styles.previewBar, { height: 34 * h, backgroundColor: i === 5 ? "#fff" : "rgba(255,255,255,0.5)" }]} />
            ))}
          </View>
        </LinearGradient>

        {/* Social proof + a visual "what you get" row before the numbers. */}
        <View style={styles.proof}>
          <View style={styles.stars} accessibilityLabel="Rated 4.8 out of 5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Icon key={i} name="star" size={14} color={palette.warning} />
            ))}
          </View>
          <Text style={[type.caption, { color: palette.inkSoft }]}>4.8 · loved by thousands of journalers</Text>
        </View>

        <View style={styles.benefitRow}>
          {BENEFITS.map((b) => (
            <View key={b.label} style={styles.benefit}>
              <View style={[styles.benefitIcon, { backgroundColor: `${b.color}1F` }]}>
                <Icon name={b.icon} size={22} color={b.color} />
              </View>
              <Text style={[type.caption, { textAlign: "center", color: palette.inkSoft }]} numberOfLines={2}>{b.label}</Text>
            </View>
          ))}
        </View>

        {/* Plan picker — a segmented Monthly/Yearly toggle over ONE clear price
            panel, so the choice is a single decision and the number is the hero. */}
        {plans.length ? (
          <View style={{ gap: space.md }}>
            <Segmented
              options={plans.map((p) => ({ value: p.sku, label: planTitle(p) + (periodWord(p) === "year" && savePct ? ` · -${savePct}%` : "") }))}
              value={sel ?? plans[0].sku}
              onChange={setSel}
            />
            {selected ? (
              <View style={styles.pricePanel}>
                <View style={styles.priceTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={type.heading}>{planTitle(selected)}</Text>
                    <Text style={type.caption}>
                      {selected.trialDays ? `${selected.trialDays}-day free trial` : "Billed in Google Play"}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.bigPrice}>{selected.price}</Text>
                    <Text style={[type.caption, { marginTop: -2 }]}>per {periodWord(selected)}</Text>
                  </View>
                </View>
                <View style={styles.priceNote}>
                  <Icon name="check" size={14} color={palette.success} />
                  <Text style={[type.caption, { color: palette.inkSoft, flex: 1 }]}>
                    {periodWord(selected) === "year" && perMonth(selected)
                      ? `Just ${perMonth(selected)}/month, billed once a year`
                      : "Flexible monthly billing — cancel anytime"}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={{ gap: space.sm }}>
          <View style={styles.privacyBadge}>
            <Icon name="shield" size={14} color={palette.success} />
            <Text style={[type.caption, { color: palette.success, fontFamily: type.bodyStrong.fontFamily }]}>Private · on-device · ad-free with Pro</Text>
          </View>
          {PERKS.map((p) => (
            <View key={p.text} style={styles.perk}>
              <View style={styles.tick}>
                <Icon name={p.icon} size={16} color={palette.primary} />
              </View>
              <Text style={[type.body, { flex: 1 }]}>{p.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.guarantee}>
          <Icon name="shield" size={15} color={palette.success} />
          <Text style={[type.caption, { flex: 1 }]}>
            Core logging, app lock, local backup and CSV/JSON export are free forever. Lifetime purchases are always honored.
          </Text>
        </View>

        <Tappable
          label={`Or buy lifetime${iap.price("pro_unlock") ? ` for ${iap.price("pro_unlock")}` : ""}`}
          onPress={() => run(() => iap.purchase("pro_unlock"))}
          style={styles.lifetime}
        >
          <Text style={[type.label, { color: palette.primary }]}>Prefer to pay once? Buy lifetime{iap.price("pro_unlock") ? ` · ${iap.price("pro_unlock")}` : ""}</Text>
        </Tappable>

        {!adsRemoved ? (
          <Tappable label="Just remove ads" onPress={() => run(() => iap.purchase("remove_ads"))} style={{ alignItems: "center", paddingVertical: space.xs }}>
            <Text style={type.caption}>Just remove ads{iap.price("remove_ads") ? ` · ${iap.price("remove_ads")}` : ""}</Text>
          </Tappable>
        ) : null}
      </ScrollView>

      {/* Sticky gradient CTA */}
      <Tappable
        label={ctaLabel}
        disabled={busy || !selected}
        onPress={() => selected && run(() => iap.subscribe(selected.sku))}
        style={styles.ctaWrap}
        sound="tap"
      >
        <LinearGradient colors={gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
          <Text style={[type.button, { color: "#fff", fontSize: 17 }]}>{ctaLabel}</Text>
        </LinearGradient>
      </Tappable>
      <Text style={[type.caption, { textAlign: "center" }]}>{ctaSub}. The higher AI limit needs an active subscription.</Text>

      {/* Restore lives OUTSIDE the scroll area, pinned above the keyboard line, so
          it's always visible the moment the paywall opens — in QA it was buried
          at the bottom of the scroll and the tester never reached it. */}
      <Tappable
        label="Restore purchases"
        role="button"
        sound={null}
        disabled={busy}
        onPress={restore}
        style={styles.restore}
      >
        <Icon name="undo" size={15} color={palette.primary} />
        <Text style={[type.label, { textAlign: "center", color: palette.primary }]}>
          Already bought it? Restore purchases
        </Text>
      </Tappable>
      {restoreMsg ? (
        <View style={styles.restoreMsg}>
          <Icon name="check" size={13} color={palette.inkSoft} />
          <Text style={[type.caption, { color: palette.inkSoft, flex: 1 }]}>{restoreMsg}</Text>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  preview: { borderRadius: radius.lg, padding: space.lg, gap: space.md, alignItems: "center" },
  proof: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm },
  stars: { flexDirection: "row", gap: 2 },
  benefitRow: { flexDirection: "row", gap: space.sm },
  benefit: { flex: 1, alignItems: "center", gap: 6 },
  benefitIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  privacyBadge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: palette.successSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, marginBottom: space.xs },
  faceRow: { flexDirection: "row", gap: space.sm },
  previewBars: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: 34 },
  previewBar: { width: 16, borderRadius: 4 },
  perk: { flexDirection: "row", alignItems: "center", gap: space.md },
  tick: { width: 30, height: 30, borderRadius: 15, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  pricePanel: { borderWidth: 1.5, borderColor: palette.primary, backgroundColor: palette.primarySoft, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  priceTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  bigPrice: { fontFamily: type.hero.fontFamily, fontSize: 34, lineHeight: 38, letterSpacing: -1, color: palette.ink, fontVariant: ["tabular-nums"] },
  priceNote: { flexDirection: "row", alignItems: "center", gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, paddingTop: space.sm },
  quota: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.primarySoft, borderRadius: radius.md, padding: space.md },
  guarantee: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.successSoft, borderRadius: radius.md, padding: space.md },
  lifetime: { alignItems: "center", paddingVertical: space.xs },
  restore: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44, paddingVertical: space.xs },
  restoreMsg: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: palette.surfaceAlt, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  ctaWrap: { marginTop: space.xs },
  cta: { height: 56, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
});

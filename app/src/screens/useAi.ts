/**
 * One place to call the AI proxy and handle EVERY failure the same way:
 *   quota   → open the Pro sheet (free users get 5/day, subscribers 100/day)
 *   offline → keep the input, tell the user to retry when connected
 *   other   → a friendly, non-blocking message
 * The core app never depends on AI succeeding.
 */
import { Alert } from "react-native";
import { ai, type AiResult } from "../modules/ai";
import { toast } from "../ui";
import { analytics } from "../modules/analytics";

export const aiEnabled = ai.enabled;

/**
 * Shown next to any AI-written text. Floria's AI reflects on moods — it is not a
 * clinical tool — so we state that plainly wherever AI output appears (Play
 * policy for health-adjacent apps: no medical/diagnostic claims, clear
 * disclaimer).
 */
export const AI_DISCLAIMER = "AI reflections are for self-reflection only — not medical, diagnostic or treatment advice.";

/**
 * In-app way to report or flag offensive / wrong AI output (required by Play for
 * generative features). We never send the note itself — only the feature name —
 * so reporting stays private. The flag is recorded for review and the user gets
 * a clear confirmation.
 */
export function reportAiOutput(feature: string): void {
  Alert.alert(
    "Report this AI response?",
    "Tell us this reflection felt offensive, wrong or unhelpful. We review flagged responses to improve safety. Your note text is never sent.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Report",
        style: "destructive",
        onPress: () => {
          analytics.track("ai_report", { feature });
          toast("Thanks — we'll review this response.");
        },
      },
    ],
  );
}

/**
 * Handle every AI failure the same way, right after a screen calls
 * `ai.run(...)` (screens own the call so the feature is visibly wired up):
 *   quota   → open the Pro sheet (free users get 5/day, subscribers 100/day)
 *   offline → keep the input, tell the user to retry when connected
 *   other   → a friendly, non-blocking message
 */
export function handleAiFailure(r: AiResult, onQuota: () => void, onRetry?: () => void): void {
  if (r.ok) return;
  if (r.reason === "quota") {
    // Clear next step: open the Pro sheet, which explains the daily limit and
    // the higher subscriber quota. A brief toast tells the user why it opened.
    toast("That's today's 5 free AI uses — upgrade for more.");
    onQuota();
  } else if (r.reason === "offline") {
    // The caller keeps the user's text in state, so nothing is lost — just
    // tell them plainly and offer a one-tap Retry for when they're back.
    toast("You're offline — your text is kept. Retry when connected.", onRetry ? { label: "Retry", onPress: onRetry } : undefined);
  } else {
    toast(r.message || "AI isn't available right now.", onRetry ? { label: "Retry", onPress: onRetry } : undefined);
  }
}

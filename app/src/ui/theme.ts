/**
 * Design tokens. Every screen uses these — never raw colours, sizes or system
 * fonts. The builder re-skins an app by editing `palette` (from the art bible /
 * PRD visual direction), not by hard-coding styles in components.
 */
export const palette = {
  // Brand — Floria "Tiny Mood Tap": calm indigo primary, fresh leaf-green accent.
  primary: "#5C7CFA",
  primaryDark: "#3E5BE6",
  primarySoft: "#E8EDFF",
  accent: "#6BCB77",
  success: "#39B86B",
  successSoft: "#DFF3E7",
  warning: "#F5A623",
  warningSoft: "#FDF0D9",
  danger: "#E5484D",
  dangerSoft: "#FDE7E7",
  // Surfaces
  bg: "#F7F9FC",
  surface: "#FFFFFF",
  surfaceAlt: "#EEF1F7",
  border: "#E2E8F0",
  // Text — grays meet WCAG AA (≥ 4.5:1 on white) with margin to spare on the
  // tinted surfaces too (surfaceAlt / primarySoft); inkMuted darkened from
  // #6B7280 so captions and helper text clear AA everywhere they appear.
  ink: "#0B0E11",
  inkSoft: "#454E5C",
  inkMuted: "#5C6775",
  onPrimary: "#FFFFFF",
  // Overlays
  scrim: "rgba(11,14,17,0.45)",
};

/**
 * Floria's ownable mood system: one high-contrast hue per 1..5 score, a soft
 * tint for backgrounds, and a dark feature ink for the drawn face. The spectrum
 * (awful→great = red→amber→yellow→green→blue) reads at a glance on calendar
 * tiles, charts and cards — this is the brand. `face` is the ink used for the
 * eyes/mouth drawn on a solid tile; it clears AA on every mood colour.
 */
export type MoodLevel = 1 | 2 | 3 | 4 | 5;
export const moodScale: Record<MoodLevel, { solid: string; soft: string }> = {
  1: { solid: "#E84D4F", soft: "#FCE4E4" }, // Awful
  2: { solid: "#F6943E", soft: "#FDEBD8" }, // Low
  3: { solid: "#F1C94A", soft: "#FCF3D6" }, // Okay
  4: { solid: "#54C68A", soft: "#DFF4E9" }, // Good
  5: { solid: "#3A86FF", soft: "#DEEAFF" }, // Great
};
export const moodFaceInk = "#2B2B33";
/** Solid mood colour for a 1..5 score (rounds + clamps). */
export const moodColor = (score: number): string => moodScale[Math.max(1, Math.min(5, Math.round(score))) as MoodLevel].solid;
export const moodSoft = (score: number): string => moodScale[Math.max(1, Math.min(5, Math.round(score))) as MoodLevel].soft;

/**
 * Hero gradient (top-left → bottom-right) for the ONE headline card per screen (HeroCard).
 * Re-skin it together with `primary` — two close hues read premium, a rainbow reads cheap.
 * Two CLOSE periwinkle-indigo hues with a gentle (not harsh) top→bottom ramp: the design
 * director flagged the old card as too heavy/saturated, so the stops sit closer together
 * and a touch desaturated — the hero reads calm, and the white action tray below carries
 * the weight. The bottom stop stays deep enough for white small-text to clear AA.
 */
export const gradient = { hero: ["#8496F2", "#5C70DD"] as [string, string], onHero: "#FFFFFF", onHeroSoft: "rgba(255,255,255,0.94)" };

/**
 * Categorical colours for charts, categories and tags — distinct from the status colours
 * (success/warning/danger mean state, never "category 3"). Same order everywhere.
 */
export const categorical = ["#5C7CFA", "#6BCB77", "#F5A623", "#FF6B6B", "#0EA5E9", "#8B5CF6", "#14B8A6", "#EC4899"];

/** Semantic tone → [strong, soft] colours. Use for pills, progress, amounts and banners. */
export type Tone = "primary" | "success" | "warning" | "danger" | "neutral";
export const tones: Record<Tone, { fg: string; bg: string }> = {
  primary: { fg: palette.primary, bg: palette.primarySoft },
  success: { fg: palette.success, bg: palette.successSoft },
  warning: { fg: "#B45309", bg: palette.warningSoft },
  danger: { fg: palette.danger, bg: palette.dangerSoft },
  neutral: { fg: palette.inkSoft, bg: palette.surfaceAlt },
};

export const fonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/** Minimum touch target (Android guideline: 48dp). */
export const TOUCH = 48;

/**
 * Max width a column of content is allowed to grow to. On a phone (≤ this) it's
 * a no-op; on a tablet the body centres instead of stretching edge-to-edge.
 * `sheet` is a touch narrower so bottom sheets read as a focused card.
 */
export const CONTENT_MAX = 640;
export const SHEET_MAX = 560;

/**
 * Type scale — a clear step between each level so hierarchy reads instantly.
 * Page title 28 → section 22 → card heading 17 → body 15 → secondary 13 →
 * caption 12. Large headings carry negative tracking; small text does not.
 */
export const type = {
  // H1 at semibold (not black bold): confident but calmer, with a hair of negative
  // tracking so the large title still reads tight and editorial, not loose.
  display: { fontFamily: fonts.semibold, fontSize: 29, lineHeight: 36, letterSpacing: -0.5, color: palette.ink },
  title: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4, color: palette.ink },
  /** Section headers: 18/24 medium, sentence case (not all-caps) for a calmer, more editorial feel. */
  section: { fontFamily: fonts.medium, fontSize: 18, lineHeight: 24, letterSpacing: -0.2, color: palette.ink },
  heading: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24, letterSpacing: -0.3, color: palette.ink },
  // Body copy sits at neutral-700 (not near-black): softer, more readable paragraphs
  // that let headings and figures carry the contrast. Hints/captions are neutral-600.
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: palette.inkSoft },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22, color: palette.ink },
  label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: palette.inkSoft },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: palette.inkMuted },
  button: { fontFamily: fonts.semibold, fontSize: 16, letterSpacing: 0.1 },
  number: { fontFamily: fonts.bold, fontSize: 26, letterSpacing: -0.5, color: palette.ink, fontVariant: ["tabular-nums"] as ["tabular-nums"] },
  /** Hero figure (balance, total, streak) — one per screen. */
  hero: { fontFamily: fonts.bold, fontSize: 38, lineHeight: 44, letterSpacing: -1, color: palette.ink, fontVariant: ["tabular-nums"] as ["tabular-nums"] },
  /** Money / quantities inside rows: tabular so columns of figures line up. */
  amount: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21, color: palette.ink, fontVariant: ["tabular-nums"] as ["tabular-nums"] },
  overline: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 15, letterSpacing: 0.8, textTransform: "uppercase" as const, color: palette.inkSoft },
};

/**
 * Soft elevation. Tight, low-opacity shadows read as crisp lift; wide muddy
 * blurs read as cheap. Cards blur 16 @ 10%, floating/sheets blur 24 @ 12%.
 */
export const shadow = {
  shadowColor: "#0F172A",
  shadowOpacity: 0.1,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
};

export const shadowStrong = {
  shadowColor: "#0F172A",
  shadowOpacity: 0.12,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 10 },
  elevation: 6,
};

/**
 * Elevation ladder (Material 3 levels 0/1/3/6). Large resting cards use `card`
 * (level 1 — a crisp, low lift over an outline); pressable surfaces lift to
 * `raised` on press; floating sheets/FABs use `shadowStrong`. Keeping the steps
 * discrete (not ad-hoc per component) is what reads as a designed system.
 */
export const elevation = {
  flat: { elevation: 0, shadowOpacity: 0 },
  card: shadow,
  raised: { shadowColor: "#0F172A", shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  floating: shadowStrong,
};

/** Motion presets — use these so every animation in the app feels consistent. */
export const springs = {
  press: { damping: 18, stiffness: 380, mass: 0.6 },
  pop: { damping: 12, stiffness: 240, mass: 0.7 },
  gentle: { damping: 20, stiffness: 160, mass: 1 },
};
export const durations = { fast: 140, base: 220, slow: 360 };

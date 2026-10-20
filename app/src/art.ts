/** Generated app art (assets/art/manifest.json has kind/usage/size for each). Use with expo Image or Skia useImage. */
export const art = {
  app_icon_primary: require("../assets/art/app_icon_primary.png"),
  splash_logo_light: require("../assets/art/splash_logo_light.png"),
  splash_logo_dark: require("../assets/art/splash_logo_dark.png"),
  onboarding_welcome: require("../assets/art/onboarding_welcome.png"),
  onboarding_pick_moods: require("../assets/art/onboarding_pick_moods.png"),
  onboarding_reminders: require("../assets/art/onboarding_reminders.png"),
  empty_calendar_history: require("../assets/art/empty_calendar_history.png"),
  empty_notes: require("../assets/art/empty_notes.png"),
  empty_insights: require("../assets/art/empty_insights.png"),
  pro_hero: require("../assets/art/pro_hero.png"),
} as const;
export type ArtId = keyof typeof art;

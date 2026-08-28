import { shouldShowAds, type PlanTier } from "./entitlements.ts";

export type AdPlacement = "home_feed" | "workout_complete" | "route_complete";

const MAX_IMPRESSIONS_PER_DAY = 3;
const MIN_INTERVAL_MS = 10 * 60 * 1_000;

/**
 * Sağlayıcıdan bağımsız reklam politikası. Sağlık/beslenme verisi hedefleme
 * için asla kullanılmaz; aktif antrenman, AI yanıtı, öğün kaydı ve onboarding
 * bu listeye bilinçli olarak dahil edilmez.
 */
export function canRequestAd(input: { tier: PlanTier; placement: AdPlacement; impressionsToday: number; lastShownAt?: number; now?: number }) {
  const now = input.now ?? Date.now();
  if (!shouldShowAds(input.tier)) return false;
  if (input.impressionsToday >= MAX_IMPRESSIONS_PER_DAY) return false;
  if (input.lastShownAt && now - input.lastShownAt < MIN_INTERVAL_MS) return false;
  return true;
}

export const adPolicy = { maxImpressionsPerDay: MAX_IMPRESSIONS_PER_DAY, minimumIntervalMs: MIN_INTERVAL_MS };

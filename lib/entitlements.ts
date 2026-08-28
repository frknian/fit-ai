export type PlanTier = "free" | "plus" | "pro";
export type EntitlementFeature = "ads" | "ai_coach" | "vision_food" | "weekly_review";

const PLAN_FEATURES: Record<PlanTier, Record<EntitlementFeature, boolean>> = {
  free: { ads: true, ai_coach: true, vision_food: true, weekly_review: true },
  plus: { ads: false, ai_coach: true, vision_food: true, weekly_review: true },
  pro: { ads: false, ai_coach: true, vision_food: true, weekly_review: true },
};

export function normalizePlanTier(value: unknown): PlanTier {
  return value === "plus" || value === "pro" ? value : "free";
}

export function hasEntitlement(tier: PlanTier, feature: EntitlementFeature): boolean {
  return PLAN_FEATURES[tier][feature];
}

export function shouldShowAds(tier: PlanTier): boolean {
  return hasEntitlement(tier, "ads");
}

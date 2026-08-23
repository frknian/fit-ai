import { localWeek } from "./workout-calendar.ts";
import { localDateKey } from "./streak.ts";
import { translatePainArea, type Dictionary, type Locale } from "./i18n/server.ts";

export interface WeeklyReviewSummary {
  weekStart: string;
  goalCategory: "Kilo verme" | "Yağ kaybı" | "Kas geliştirme" | "Kondisyon" | "Güçlenme" | "Genel fitness";
  sessionCount: number;
  completionRate: number;
  totalMinutes: number;
  easySessions: number;
  suitableSessions: number;
  hardSessions: number;
  averageFatigue: number | null;
  painAreas: string[];
  nutritionEntryCount: number;
  nutritionLoggedDays: number;
  averageCalories: number | null;
  averageProteinGrams: number | null;
  weightChangeKg: number | null;
  waistChangeCm: number | null;
}

export interface WeeklyReview {
  headline: string;
  summary: string;
  positives: string[];
  cautions: string[];
  recommendations: string[];
  safetyNote: string;
}

export type WeeklyReviewSource = "ai" | "local";

function finiteNumber(value: unknown, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : null;
}

function nullableNumber(value: unknown, min: number, max: number) {
  if (value === null || value === undefined) return null;
  return finiteNumber(value, min, max);
}

function cleanString(value: unknown, maxLength = 400) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanList(value: unknown, minItems: number, maxItems: number) {
  if (!Array.isArray(value)) return null;
  const list = value.map((item) => cleanString(item, 240)).filter(Boolean).slice(0, maxItems);
  return list.length >= minItems ? list : null;
}

export function validateWeeklySummary(value: unknown): WeeklyReviewSummary | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const weekStart = cleanString(item.weekStart, 10);
  const goal = cleanString(item.goalCategory, 40);
  const validGoals: WeeklyReviewSummary["goalCategory"][] = ["Kilo verme", "Yağ kaybı", "Kas geliştirme", "Kondisyon", "Güçlenme", "Genel fitness"];
  const sessionCount = finiteNumber(item.sessionCount, 0, 14);
  const completionRate = finiteNumber(item.completionRate, 0, 100);
  const totalMinutes = finiteNumber(item.totalMinutes, 0, 2_000);
  const easySessions = finiteNumber(item.easySessions, 0, 14);
  const suitableSessions = finiteNumber(item.suitableSessions, 0, 14);
  const hardSessions = finiteNumber(item.hardSessions, 0, 14);
  const nutritionEntryCount = finiteNumber(item.nutritionEntryCount, 0, 200);
  const nutritionLoggedDays = finiteNumber(item.nutritionLoggedDays, 0, 7);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !validGoals.includes(goal as WeeklyReviewSummary["goalCategory"]) || sessionCount === null || completionRate === null || totalMinutes === null || easySessions === null || suitableSessions === null || hardSessions === null || nutritionEntryCount === null || nutritionLoggedDays === null) return null;
  return {
    weekStart,
    goalCategory: goal as WeeklyReviewSummary["goalCategory"],
    sessionCount: Math.round(sessionCount),
    completionRate: Math.round(completionRate),
    totalMinutes: Math.round(totalMinutes),
    easySessions: Math.round(easySessions),
    suitableSessions: Math.round(suitableSessions),
    hardSessions: Math.round(hardSessions),
    averageFatigue: nullableNumber(item.averageFatigue, 1, 5),
    painAreas: Array.isArray(item.painAreas) ? item.painAreas.map((area) => cleanString(area, 30)).filter((area) => area && area !== "Yok").slice(0, 5) : [],
    nutritionEntryCount: Math.round(nutritionEntryCount),
    nutritionLoggedDays: Math.round(nutritionLoggedDays),
    averageCalories: nullableNumber(item.averageCalories, 0, 10_000),
    averageProteinGrams: nullableNumber(item.averageProteinGrams, 0, 1_000),
    weightChangeKg: nullableNumber(item.weightChangeKg, -50, 50),
    waistChangeCm: nullableNumber(item.waistChangeCm, -100, 100),
  };
}

export function validateWeeklyReview(value: unknown): WeeklyReview | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const headline = cleanString(item.headline, 100);
  const summary = cleanString(item.summary, 500);
  const positives = cleanList(item.positives, 1, 4);
  const cautions = cleanList(item.cautions, 1, 4);
  const recommendations = cleanList(item.recommendations, 2, 4);
  const safetyNote = cleanString(item.safetyNote, 300);
  if (!headline || !summary || !positives || !cautions || !recommendations || !safetyNote) return null;
  return { headline, summary, positives, cautions, recommendations, safetyNote };
}

export function weeklyReviewWeekStart(reference: Date | number = new Date()) {
  return localWeek(reference)[0] || localDateKey(reference);
}

export function weeklyGoalCategory(value: string): WeeklyReviewSummary["goalCategory"] {
  const normalized = value.toLocaleLowerCase("tr-TR");
  // Yağ kaybı ayrı kategori: tartıyı düşürmekle yağ oranını düşürmek aynı
  // hedef değil ve haftalık geri bildirim ikisine aynı dili konuşamaz.
  if (normalized.includes("yağ") || normalized.includes("tanımlı")) return "Yağ kaybı";
  if (normalized.includes("kilo")) return "Kilo verme";
  if (normalized.includes("kas")) return "Kas geliştirme";
  if (normalized.includes("kondisyon")) return "Kondisyon";
  if (normalized.includes("güç")) return "Güçlenme";
  return "Genel fitness";
}

export function hasEnoughWeeklyData(summary: WeeklyReviewSummary) {
  const supportingSignal = summary.nutritionLoggedDays >= 2 || summary.weightChangeKg !== null || summary.waistChangeCm !== null;
  return summary.sessionCount >= 2 || (summary.sessionCount >= 1 && supportingSignal);
}

export function weeklySafetyRisk(summary: WeeklyReviewSummary) {
  return summary.painAreas.length > 0 || (summary.averageFatigue !== null && summary.averageFatigue >= 4);
}

function signed(value: number, unit: string, locale: Locale) {
  return `${value > 0 ? "+" : ""}${value.toLocaleString(locale === "en" ? "en-US" : "tr-TR", { maximumFractionDigits: 1 })} ${unit}`;
}

function translatedPainAreas(painAreas: string[], t: Dictionary) {
  return painAreas.map((area) => translatePainArea(t, area)).join(t.common.andSeparator);
}

export function localWeeklyReview(summary: WeeklyReviewSummary, t: Dictionary, locale: Locale = "tr"): WeeklyReview {
  const risk = weeklySafetyRisk(summary);
  const positives: string[] = [];
  const cautions: string[] = [];
  if (summary.completionRate >= 85) positives.push(t.weeklyReview.positiveCompletionHigh(summary.completionRate));
  else if (summary.sessionCount > 0) positives.push(t.weeklyReview.positiveSessionCount(summary.sessionCount, summary.totalMinutes));
  if (summary.nutritionLoggedDays >= 3) positives.push(t.weeklyReview.positiveNutritionLogged(summary.nutritionLoggedDays));
  if (summary.weightChangeKg !== null) positives.push(t.weeklyReview.positiveWeightChange(signed(summary.weightChangeKg, "kg", locale)));
  if (summary.completionRate < 70) cautions.push(t.weeklyReview.cautionLowCompletion);
  if (summary.averageFatigue !== null && summary.averageFatigue >= 4) cautions.push(t.weeklyReview.cautionHighFatigue(summary.averageFatigue.toLocaleString(locale === "en" ? "en-US" : "tr-TR", { maximumFractionDigits: 1 })));
  if (summary.painAreas.length) cautions.push(t.weeklyReview.cautionPainAreas(translatedPainAreas(summary.painAreas, t)));
  if (summary.nutritionLoggedDays < 2) cautions.push(t.weeklyReview.cautionLowNutritionLog);
  if (!cautions.length) cautions.push(t.weeklyReview.cautionNoRiskSignal);
  const recommendations = risk ? [
    t.weeklyReview.recommendationRiskNoIncrease,
    t.weeklyReview.recommendationRestDay,
    t.weeklyReview.recommendationSeekHelp,
  ] : [
    summary.completionRate >= 85 ? t.weeklyReview.recommendationKeepPlan : t.weeklyReview.recommendationSchedulePlan,
    t.weeklyReview.recommendationLogFeedback,
    summary.nutritionLoggedDays < 3 ? t.weeklyReview.recommendationLogNutrition : t.weeklyReview.recommendationKeepNutritionLog,
  ];
  return {
    headline: risk ? t.weeklyReview.headlineRisk : t.weeklyReview.headlineNormal,
    summary: t.weeklyReview.summaryText(summary.sessionCount, summary.totalMinutes, summary.completionRate),
    positives: positives.length ? positives.slice(0, 4) : [t.weeklyReview.defaultPositive],
    cautions: cautions.slice(0, 4),
    recommendations: recommendations.slice(0, 4),
    safetyNote: t.weeklyReview.safetyNoteText,
  };
}

export function enforceWeeklySafety(review: WeeklyReview, summary: WeeklyReviewSummary, t: Dictionary) {
  if (!weeklySafetyRisk(summary)) return review;
  const increasePattern = /yük|ağırl|set|tekrar|hacim|yoğunluk|weight|reps?|sets?|volume|intensity|load/i;
  const unsafePattern = /artır|yükselt|ekle|çoğalt|increase|add|raise|boost/i;
  const safeRecommendations = review.recommendations.filter((item) => !(increasePattern.test(item) && unsafePattern.test(item)));
  const recovery = t.weeklyReview.safetyRecoveryRecommendation;
  const painText = summary.painAreas.length ? t.weeklyReview.safetyPainFollowUp(translatedPainAreas(summary.painAreas, t)) : t.weeklyReview.safetyFatigueFollowUp;
  return {
    ...review,
    headline: t.weeklyReview.headlineRisk,
    cautions: [...new Set([painText, ...review.cautions])].slice(0, 4),
    recommendations: [...new Set([recovery, ...safeRecommendations, t.weeklyReview.safetyMinimalRestDay])].slice(0, 4),
  };
}

export function weeklySummaryFingerprint(summary: WeeklyReviewSummary) {
  const raw = JSON.stringify(summary);
  return [...raw].reduce((hash, character) => (hash * 33 + character.charCodeAt(0)) % 2_147_483_647, 17).toString(36);
}

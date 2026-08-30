import type { Dictionary } from "./i18n/server.ts";

/**
 * "lose" ile "fatLoss" bilerek ayrı: tartıdaki sayıyı düşürmek ile yağ kütlesini
 * düşürmek aynı şey değildir. Sert açık ve düşük proteinle kaybın ciddi kısmı
 * kas ve su olur; tartı hızlı iner ama vücut kompozisyonu iyileşmez. Bu yüzden
 * yağ kaybı modunda açık daha ılımlı, protein daha yüksek tutulur ve ilerleme
 * tartı yerine ölçüden okunur. Eskiden iki hedef arayüzde ayrı sunuluyor ama
 * içeride tek kategoriye düşüyordu; kullanıcı var olmayan bir seçim yapıyordu.
 */
export type NutritionGoalType = "lose" | "fatLoss" | "maintain" | "gain";

/** Tartının düşmesi beklenen hedefler (açık üretenler). */
export function isDeficitGoal(goalType: NutritionGoalType) {
  return goalType === "lose" || goalType === "fatLoss";
}

export interface NutritionGoal {
  goalType: NutritionGoalType;
  calorieTarget: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  bmr: number;
  tdee: number;
  calorieAdjustment: number;
  activityFactor: number;
  workoutDays: number;
  isManual: boolean;
}

export interface NutritionTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface WeightMeasurement {
  measuredAt: string;
  weightKg: number | null;
}

export interface WeightTrend {
  weeklyKg: number;
  weeklyPercent: number;
  days: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function nutritionGoalLabel(goalType: NutritionGoalType, t: Dictionary) {
  if (goalType === "lose") return t.nutritionGoals.goalLose;
  if (goalType === "fatLoss") return t.nutritionGoals.goalFatLoss;
  if (goalType === "gain") return t.nutritionGoals.goalGain;
  return t.nutritionGoals.goalMaintain;
}

export function inferNutritionGoal(goalText: string): NutritionGoalType {
  const normalized = goalText.toLocaleLowerCase("tr-TR");
  // "yağ" önce bakılır: "yağ oranımı düşürmek" ifadesi "kilo" da içerebilir ve
  // eskiden ikisi de aynı kategoriye düşüyordu.
  if (normalized.includes("yağ") || normalized.includes("tanımlı")) return "fatLoss";
  if (normalized.includes("kilo") || normalized.includes("zayıf")) return "lose";
  if (normalized.includes("kas") || normalized.includes("hacim")) return "gain";
  return "maintain";
}

export function inferWorkoutDays(value: string) {
  const normalized = value.toLocaleLowerCase("tr-TR");
  if (normalized.includes("5+")) return 5;
  const values = normalized.match(/\d+/g)?.map(Number).filter(Number.isFinite) || [];
  if (!values.length) return 3;
  return clamp(Math.round(values.reduce((sum, item) => sum + item, 0) / values.length), 0, 7);
}

export function calculateNutritionGoal(input: {
  goalType: NutritionGoalType;
  bmr: number;
  tdee: number;
  weightKg: number;
  activityFactor: number;
  workoutDays: number;
}): NutritionGoal {
  const bmr = Math.round(clamp(input.bmr, 800, 4_500));
  const tdee = Math.round(clamp(input.tdee, bmr, 7_000));
  const weightKg = clamp(input.weightKg, 30, 350);
  const workoutDays = Math.round(clamp(input.workoutDays, 0, 7));
  // Yağ kaybında açık bilerek daha ılımlı: sert açık kaybın kas payını
  // büyütür, tartı hızlı iner ama yağ oranı beklendiği kadar düşmez.
  const desiredAdjustment = input.goalType === "lose"
    ? -Math.round(clamp(tdee * 0.15, 250, 500))
    : input.goalType === "fatLoss"
      ? -Math.round(clamp(tdee * 0.10, 200, 350))
      : input.goalType === "gain"
        ? Math.round(clamp(tdee * 0.08, 150, 300))
        : 0;
  const calorieTarget = isDeficitGoal(input.goalType)
    ? Math.max(bmr, tdee + desiredAdjustment)
    : tdee + desiredAdjustment;
  const calorieAdjustment = calorieTarget - tdee;
  // Genel kullanıcı hedefi klinik veya performans reçetesi değildir. Ağırlığın
  // ilk 90 kilosunu ve daha ılımlı aktivite çarpanlarını kullanmak, yüksek
  // kiloda protein hedefinin gereksiz biçimde büyümesini önler. Ayrıca protein
  // enerjisini %27,5 ile sınırlayarak yetişkin AMDR aralığının içinde tutarız.
  const proteinBaseKg = clamp(weightKg, 45, 90);
  const proteinMultiplier = workoutDays === 0 ? 1.0 : workoutDays <= 3 ? 1.2 : 1.4;
  const proteinUpper = Math.max(50, Math.min(140, Math.floor(calorieTarget * 0.275 / 4)));
  const proteinGrams = Math.round(clamp(proteinBaseKg * proteinMultiplier, 50, proteinUpper));
  // Yağ kalorinin %27,5'i; kalan enerji karbonhidrata gider. Böylece üç makro
  // yetişkinler için kullanılan 45–65 / 20–35 / 10–35 AMDR dağılımına yakın
  // ve enerji toplamıyla tutarlı kalır.
  const fatGrams = Math.round(calorieTarget * 0.275 / 9);
  const remainingCalories = Math.max(0, calorieTarget - proteinGrams * 4 - fatGrams * 9);
  const carbsGrams = Math.round(remainingCalories / 4);

  return {
    goalType: input.goalType,
    calorieTarget,
    proteinGrams,
    carbsGrams,
    fatGrams,
    bmr,
    tdee,
    calorieAdjustment,
    activityFactor: clamp(input.activityFactor, 1.1, 2.2),
    workoutDays,
    isManual: false,
  };
}

export function sanitizeNutritionGoal(value: unknown): NutritionGoal | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (!(["lose", "fatLoss", "maintain", "gain"] as unknown[]).includes(item.goalType)) return null;
  const number = (field: string, min: number, max: number) => {
    const parsed = Number(item[field]);
    return Number.isFinite(parsed) ? clamp(Math.round(parsed), min, max) : null;
  };
  const calorieTarget = number("calorieTarget", 800, 7_000);
  const proteinGrams = number("proteinGrams", 0, 220);
  const carbsGrams = number("carbsGrams", 0, 1_000);
  const fatGrams = number("fatGrams", 0, 400);
  const bmr = number("bmr", 800, 4_500);
  const tdee = number("tdee", 800, 7_000);
  const calorieAdjustment = number("calorieAdjustment", -3_000, 3_000);
  const workoutDays = number("workoutDays", 0, 7);
  const activityFactor = Number(item.activityFactor);
  if ([calorieTarget, proteinGrams, carbsGrams, fatGrams, bmr, tdee, calorieAdjustment, workoutDays].some((field) => field === null) || !Number.isFinite(activityFactor)) return null;
  return { goalType: item.goalType as NutritionGoalType, calorieTarget: calorieTarget!, proteinGrams: proteinGrams!, carbsGrams: carbsGrams!, fatGrams: fatGrams!, bmr: bmr!, tdee: tdee!, calorieAdjustment: calorieAdjustment!, activityFactor: clamp(activityFactor, 1.1, 2.2), workoutDays: workoutDays!, isManual: Boolean(item.isManual) };
}

export function nutritionGoalWarning(goal: NutritionGoal, t: Dictionary) {
  const adjustmentPercent = goal.tdee ? goal.calorieAdjustment / goal.tdee : 0;
  if (goal.calorieTarget < goal.bmr) return t.nutritionGoals.warningBelowBmr;
  if (adjustmentPercent <= -0.25 || goal.calorieAdjustment <= -750) return t.nutritionGoals.warningDeficitHigh;
  if (adjustmentPercent >= 0.15 || goal.calorieAdjustment >= 500) return t.nutritionGoals.warningSurplusHigh;
  return null;
}

export function nextMealSuggestion(totals: NutritionTotals, goal: NutritionGoal, t: Dictionary) {
  const calorieRatio = totals.calories / Math.max(1, goal.calorieTarget);
  const proteinRatio = totals.protein / Math.max(1, goal.proteinGrams);
  const carbsRatio = totals.carbs / Math.max(1, goal.carbsGrams);
  const fatRatio = totals.fat / Math.max(1, goal.fatGrams);
  if (calorieRatio >= 1.05) return t.nutritionGoals.mealOverTarget;
  if (proteinRatio < Math.min(carbsRatio, fatRatio) && proteinRatio < 0.85) return t.nutritionGoals.mealProteinBehind;
  if (carbsRatio < 0.7 && goal.workoutDays >= 3) return t.nutritionGoals.mealCarbsBehind;
  if (fatRatio < 0.65) return t.nutritionGoals.mealFatBehind;
  return t.nutritionGoals.mealBalanced;
}

export function calculateWeeklyWeightTrend(measurements: WeightMeasurement[]): WeightTrend | null {
  const valid = measurements
    .filter((item): item is { measuredAt: string; weightKg: number } => typeof item.weightKg === "number" && Number.isFinite(item.weightKg))
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  if (valid.length < 2) return null;
  const firstTime = new Date(`${valid[0].measuredAt}T12:00:00Z`).getTime();
  const lastTime = new Date(`${valid[valid.length - 1].measuredAt}T12:00:00Z`).getTime();
  const days = Math.round((lastTime - firstTime) / 86_400_000);
  if (days < 5) return null;
  const weeklyKg = (valid[valid.length - 1].weightKg - valid[0].weightKg) / days * 7;
  return { weeklyKg: Number(weeklyKg.toFixed(2)), weeklyPercent: Number((weeklyKg / valid[0].weightKg * 100).toFixed(2)), days };
}

export function weightTrendAdvice(trend: WeightTrend | null, goalType: NutritionGoalType, t: Dictionary) {
  if (!trend) return t.nutritionGoals.trendNeedTwo;
  const rate = trend.weeklyPercent;
  if (goalType === "lose") {
    if (rate < -1) return t.nutritionGoals.trendLoseTooFast;
    if (rate >= 0) return t.nutritionGoals.trendLoseNone;
    return t.nutritionGoals.trendLoseOk;
  }
  if (goalType === "fatLoss") {
    // Yağ kaybında düz tartı başarısızlık DEĞİL: aynı anda kas kazanılıyorsa
    // yağ kaybı tartıya yansımaz. Kullanıcıyı sayıya değil ölçüye yönlendirir.
    if (rate < -1) return t.nutritionGoals.trendFatLossTooFast;
    if (rate > 0.25) return t.nutritionGoals.trendFatLossGaining;
    if (rate >= -0.1) return t.nutritionGoals.trendFatLossFlat;
    return t.nutritionGoals.trendFatLossOk;
  }
  if (goalType === "gain") {
    if (rate > 0.75) return t.nutritionGoals.trendGainTooFast;
    if (rate <= 0) return t.nutritionGoals.trendGainNone;
    return t.nutritionGoals.trendGainOk;
  }
  if (Math.abs(rate) > 0.5) return t.nutritionGoals.trendMaintainOff;
  return t.nutritionGoals.trendMaintainOk;
}

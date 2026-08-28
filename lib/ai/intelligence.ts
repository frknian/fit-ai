// Hedefit Intelligence Engine — deterministik fitness motoru.
//
// TEMEL KURAL: LLM fitness hesaplarının kaynağı DEĞİLDİR.
//
// Göç öncesinde koç, istemcinin ürettiği düz metin bir özeti okuyup "kaç
// kalorin kaldı?" gibi sorulara kendi aritmetiğiyle yanıt veriyordu. Dil
// modelleri aritmetikte güvenilir değildir ve yanlış kalori/kilo sayısı bu
// uygulamada gerçek bir zarardır. Artık sayıyı BURASI üretir, model yalnızca
// anlatır.
//
// Bu dosya FORMÜL TEKRARLAMAZ. BMR/TDEE/makro hesabı lib/nutrition-goals.ts,
// kilo trendi yine orada, BMI lib/body-metrics.ts, hedef tahmini
// lib/goal-forecast.ts içindedir. Buradaki iş, o modülleri tek bir
// `CoachFacts` nesnesinde toplamak ve eksik veriyi UYDURMAMAKTIR: hesaplanamayan
// alan `undefined` kalır, böylece bağlam kurucusu onu modele hiç göndermez ve
// model de "bilmiyorum" diyebilir.

import { bodyMassIndex, bmiCategory, type BmiCategory } from "../body-metrics.ts";
import { calculateNutritionGoal, calculateWeeklyWeightTrend, type NutritionGoal, type NutritionGoalType, type NutritionTotals, type WeightMeasurement } from "../nutrition-goals.ts";
import { progressionSuggestion, recoveryScore, weeklyVolume } from "../training-intelligence.ts";

export type IntelligenceInput = {
  profile?: {
    age?: number | null;
    sex?: string | null;
    heightCm?: number | null;
    weightKg?: number | null;
    environment?: string | null;
    equipment?: string | null;
    assessmentAnswers?: string[];
  };
  goal?: {
    goalType?: NutritionGoalType | null;
    targetWeightKg?: number | null;
    /** Kullanıcı beslenme hedefini elle belirlediyse; yeniden hesaplamayız. */
    savedGoal?: NutritionGoal | null;
    activityFactor?: number | null;
    workoutDays?: number | null;
  };
  today?: {
    totals?: NutritionTotals | null;
    steps?: number | null;
    workoutCompleted?: boolean | null;
    waterMl?: number | null;
    sleepMinutes?: number | null;
    foods?: Array<{ meal: string; name: string; calories?: number; protein?: number; carbs?: number; fat?: number }>;
  };
  /** Tarihe göre sıralanmamış olabilir; alt modüller kendisi sıralar. */
  measurements?: WeightMeasurement[];
  /** Son 7 günün günlük kalori toplamları. */
  recentCalories?: number[];
  /** Son 7 günün günlük adım sayıları. */
  recentSteps?: number[];
  activity?: {
    workoutsThisWeek?: number | null;
    walkingDistanceKm?: number | null;
    runningDistanceKm?: number | null;
    streakDays?: number | null;
  };
  training?: {
    activeExercises?: Array<{ name: string; area?: string; sets?: number; reps?: string }>;
    recentSessions?: Array<{ completedAt: string; exerciseNames: string[]; durationMinutes?: number; fatigue?: number }>;
    recentPerformance?: Array<{ exerciseId?: string; exerciseName: string; sets: Array<{ weightKg?: number; reps?: number; rpe?: number }> }>;
  };
};

export type CoachFacts = {
  profile: {
    age?: number;
    sex?: string;
    heightCm?: number;
    weightKg?: number;
    bmi?: number;
    bmiCategory?: BmiCategory;
    environment?: string;
    equipment?: string;
    assessmentAnswers?: string[];
  };
  goals: {
    goalType?: NutritionGoalType;
    targetWeightKg?: number;
    calorieTarget?: number;
    proteinTargetGrams?: number;
    bmr?: number;
    tdee?: number;
    /** Hedef kiloya kalan fark (kg). Negatif = hedefin altındasın. */
    weightToGoalKg?: number;
  };
  today: {
    caloriesConsumed?: number;
    remainingCalories?: number;
    proteinGrams?: number;
    proteinRemainingGrams?: number;
    steps?: number;
    waterMl?: number;
    sleepMinutes?: number;
    workoutCompleted?: boolean;
    foods?: Array<{ meal: string; name: string; calories?: number; protein?: number; carbs?: number; fat?: number }>;
  };
  trends: {
    weightChange7dKg?: number;
    weeklyRateKg?: number;
    weeklyRatePercent?: number;
    trendDays?: number;
    averageCalories7d?: number;
    averageSteps7d?: number;
  };
  activity: {
    workoutsThisWeek?: number;
    walkingDistanceKm?: number;
    runningDistanceKm?: number;
    streakDays?: number;
  };
  training: {
    activeExercises?: Array<{ name: string; area?: string; sets?: number; reps?: string }>;
    recentSessions?: Array<{ completedAt: string; exerciseNames: string[]; durationMinutes?: number; fatigue?: number }>;
    recovery?: { score: number; decision: "heavy" | "moderate" | "rest"; reason: string };
    progression?: Array<{ exerciseName: string; action: string; suggestedWeightKg?: number; targetReps: string }>;
    weeklyVolume?: Array<{ area: string; sets: number; status: string }>;
  };
  /** Hesaplanamayan alanların NEDENİ. Model "veri yok" diyebilsin diye. */
  missing: string[];
};

function positive(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function finite(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function round(value: number, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[] | undefined): number | undefined {
  const valid = (values ?? []).filter((value) => Number.isFinite(value));
  if (!valid.length) return undefined;
  return round(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

/**
 * Mifflin-St Jeor. Kayıtlı bir beslenme hedefi YOKSA son çare olarak kullanılır;
 * uygulamanın asıl hedefi lib/nutrition-goals.ts üzerinden kurulur ve orada
 * kullanıcının elle verdiği değerler korunur. Burada yeniden türetmemizin tek
 * sebebi, hedefi hiç kurulmamış kullanıcıya da kalori bağlamı verebilmek.
 */
function estimateBmr(sex: string | undefined, age: number | undefined, heightCm: number | undefined, weightKg: number | undefined): number | undefined {
  if (!age || !heightCm || !weightKg) return undefined;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  // Cinsiyet bilinmiyorsa iki formülün ortasını alırız (+5 / −161 → −78);
  // tek bir cinsiyeti varsaymak sistematik hata üretirdi.
  const offset = sex === "male" || sex === "erkek" ? 5 : sex === "female" || sex === "kadın" ? -161 : -78;
  return Math.round(base + offset);
}

export function analyze(input: IntelligenceInput): CoachFacts {
  const missing: string[] = [];
  const age = positive(input.profile?.age);
  const heightCm = positive(input.profile?.heightCm);
  const weightKg = positive(input.profile?.weightKg);
  const sex = input.profile?.sex || undefined;

  const bmi = heightCm && weightKg ? bodyMassIndex(heightCm, weightKg) ?? undefined : undefined;
  if (!bmi) missing.push("bmi");

  // Beslenme hedefi: kayıtlı hedef her zaman kazanır (kullanıcı elle
  // değiştirmiş olabilir). Yoksa profilden tahmin edilir.
  const savedGoal = input.goal?.savedGoal ?? null;
  const goalType = savedGoal?.goalType ?? input.goal?.goalType ?? undefined;
  let goal: NutritionGoal | null = savedGoal;
  if (!goal && goalType && weightKg) {
    const bmr = estimateBmr(sex, age, heightCm, weightKg);
    const activityFactor = positive(input.goal?.activityFactor) ?? 1.4;
    if (bmr) goal = calculateNutritionGoal({
      goalType,
      bmr,
      tdee: Math.round(bmr * activityFactor),
      weightKg,
      activityFactor,
      workoutDays: positive(input.goal?.workoutDays) ?? 3,
    });
  }
  if (!goal) missing.push("calorieTarget");

  const totals = input.today?.totals ?? null;
  const caloriesConsumed = finite(totals?.calories);
  const proteinGrams = finite(totals?.protein);
  const calorieTarget = goal?.calorieTarget;
  const proteinTarget = goal?.proteinGrams;

  const targetWeightKg = positive(input.goal?.targetWeightKg);

  const trend = calculateWeeklyWeightTrend(input.measurements ?? []);
  if (!trend) missing.push("weightTrend");

  // 7 günlük ham kilo farkı: trendden ayrı, çünkü trend en az 5 gün aralık ve
  // 2 ölçüm ister; kullanıcı yalnız iki gün tartılmışsa yine de fark gösterilir.
  const sorted = (input.measurements ?? [])
    .filter((item): item is { measuredAt: string; weightKg: number } => typeof item.weightKg === "number" && Number.isFinite(item.weightKg))
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  // Pencere GÜN bazında karşılaştırılır, an bazında değil.
  //
  // Ölçümler tarih anahtarlıdır ("2026-08-12"); bunları `Date.now() - 7 gün`
  // gibi bir ANLA karşılaştırmak, tam 7 gün önceki kaydı günün saatine göre
  // bazen içeri bazen dışarı alıyordu. Sonuç kullanıcıya doğrudan yansıyordu:
  // aynı veriyle "son 7 günde -1,0 kg" sabah farklı, öğleden sonra farklı
  // görünebiliyordu. Tarihi tarihle karşılaştırmak bunu kesin olarak çözer.
  const todayKey = new Date().toISOString().slice(0, 10);
  const weekAgoKey = new Date(new Date(`${todayKey}T00:00:00Z`).getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const withinWeek = sorted.filter((item) => item.measuredAt >= weekAgoKey);
  const weightChange7dKg = withinWeek.length >= 2
    ? round(withinWeek[withinWeek.length - 1].weightKg - withinWeek[0].weightKg, 1)
    : undefined;

  const currentWeight = weightKg ?? sorted.at(-1)?.weightKg;
  const recovery = recoveryScore({ sleepMinutes: finite(input.today?.sleepMinutes), steps: finite(input.today?.steps), sessions: input.training?.recentSessions, fatigue: input.training?.recentSessions?.[0]?.fatigue });
  const progression = (input.training?.recentPerformance ?? []).flatMap((entry) => {
    const suggestion = progressionSuggestion(entry.sets, input.training?.activeExercises?.find((item) => item.name === entry.exerciseName)?.reps);
    return suggestion ? [{ exerciseName: entry.exerciseName, ...suggestion }] : [];
  }).slice(0, 6);

  return {
    profile: {
      ...(age !== undefined && { age }),
      ...(sex !== undefined && { sex }),
      ...(heightCm !== undefined && { heightCm }),
      ...(currentWeight !== undefined && { weightKg: round(currentWeight, 1) }),
      ...(input.profile?.environment && { environment: input.profile.environment }),
      ...(input.profile?.equipment && { equipment: input.profile.equipment }),
      ...(input.profile?.assessmentAnswers?.length && { assessmentAnswers: input.profile.assessmentAnswers }),
      ...(bmi !== undefined && { bmi, bmiCategory: bmiCategory(bmi) }),
    },
    goals: {
      ...(goalType !== undefined && { goalType }),
      ...(targetWeightKg !== undefined && { targetWeightKg }),
      ...(calorieTarget !== undefined && { calorieTarget }),
      ...(proteinTarget !== undefined && { proteinTargetGrams: proteinTarget }),
      ...(goal?.bmr !== undefined && { bmr: goal.bmr }),
      ...(goal?.tdee !== undefined && { tdee: goal.tdee }),
      ...(targetWeightKg !== undefined && currentWeight !== undefined && { weightToGoalKg: round(currentWeight - targetWeightKg, 1) }),
    },
    today: {
      ...(caloriesConsumed !== undefined && { caloriesConsumed: round(caloriesConsumed) }),
      ...(caloriesConsumed !== undefined && calorieTarget !== undefined && { remainingCalories: round(calorieTarget - caloriesConsumed) }),
      ...(proteinGrams !== undefined && { proteinGrams: round(proteinGrams) }),
      ...(proteinGrams !== undefined && proteinTarget !== undefined && { proteinRemainingGrams: round(Math.max(0, proteinTarget - proteinGrams)) }),
      ...(finite(input.today?.steps) !== undefined && { steps: round(input.today!.steps as number) }),
      ...(finite(input.today?.waterMl) !== undefined && { waterMl: round(input.today!.waterMl as number) }),
      ...(finite(input.today?.sleepMinutes) !== undefined && { sleepMinutes: round(input.today!.sleepMinutes as number) }),
      ...(typeof input.today?.workoutCompleted === "boolean" && { workoutCompleted: input.today.workoutCompleted }),
      ...(input.today?.foods?.length && { foods: input.today.foods }),
    },
    trends: {
      ...(weightChange7dKg !== undefined && { weightChange7dKg }),
      ...(trend && { weeklyRateKg: trend.weeklyKg, weeklyRatePercent: trend.weeklyPercent, trendDays: trend.days }),
      ...(average(input.recentCalories) !== undefined && { averageCalories7d: average(input.recentCalories) }),
      ...(average(input.recentSteps) !== undefined && { averageSteps7d: average(input.recentSteps) }),
    },
    activity: {
      ...(finite(input.activity?.workoutsThisWeek) !== undefined && { workoutsThisWeek: input.activity!.workoutsThisWeek as number }),
      ...(finite(input.activity?.walkingDistanceKm) !== undefined && { walkingDistanceKm: round(input.activity!.walkingDistanceKm as number, 1) }),
      ...(finite(input.activity?.runningDistanceKm) !== undefined && { runningDistanceKm: round(input.activity!.runningDistanceKm as number, 1) }),
      ...(finite(input.activity?.streakDays) !== undefined && { streakDays: input.activity!.streakDays as number }),
    },
    training: {
      ...(input.training?.activeExercises?.length && { activeExercises: input.training.activeExercises }),
      ...(input.training?.recentSessions?.length && { recentSessions: input.training.recentSessions }),
      recovery,
      ...(progression.length && { progression: progression.map((item) => ({ exerciseName: item.exerciseName, action: item.action, suggestedWeightKg: item.suggestedWeightKg, targetReps: item.targetReps })) }),
      ...(input.training?.activeExercises?.length && { weeklyVolume: weeklyVolume(input.training.activeExercises) }),
    },
    missing,
  };
}

// İstemciden gelen ham koç sinyallerinin doğrulanması.
//
// Bu, göçün doğruluk açısından en önemli parçalarından biri. Göç öncesinde
// istemci, modele gidecek bağlamı KENDİSİ üretiyordu — TÜRETİLMİŞ değerler
// dahil. Örneğin BMI istemcide hesaplanıyor ve boy/kilo eksikse yerine sabit
// "22.4" yazılıyordu; yani modele hiç ölçülmemiş bir vücut kitle indeksi
// gerçek veri gibi gidiyordu.
//
// Yeni kural: İSTEMCİ YALNIZCA HAM ÖLÇÜM GÖNDERİR (boy, kilo, adım, öğün
// toplamı). Türetilmiş her şeyi (BMI, kalan kalori, trend, hedefe kalan)
// sunucudaki deterministik motor hesaplar. Böylece modele giden sayıların tek
// bir kaynağı olur ve istemcideki bir hata modele "uydurulmuş gerçek" olarak
// sızamaz.
//
// Ayrıca her alan tür ve aralık olarak doğrulanır: bu veri doğrudan prompta
// gömülecek, güvenilmeyen girdidir.

import type { IntelligenceInput } from "./intelligence.ts";
import type { NutritionGoalType } from "../nutrition-goals.ts";
import { sanitizeNutritionGoal } from "../nutrition-goals.ts";

const GOAL_TYPES: NutritionGoalType[] = ["lose", "fatLoss", "maintain", "gain"];

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** Sayıyı doğrular ve makul bir aralığa kırpar. Aralık dışı değer ATILIR, kırpılmaz. */
function bounded(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value >= min && value <= max ? value : undefined;
}

function goalType(value: unknown): NutritionGoalType | undefined {
  return typeof value === "string" && (GOAL_TYPES as string[]).includes(value) ? value as NutritionGoalType : undefined;
}

function isoDate(value: unknown): string | undefined {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function numberList(value: unknown, min: number, max: number, limit = 14): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value.map((item) => bounded(item, min, max)).filter((item): item is number => item !== undefined).slice(-limit);
  return list.length ? list : undefined;
}

function text(value: unknown, limit = 100): string | undefined {
  return typeof value === "string" ? value.trim().slice(0, limit) || undefined : undefined;
}

function foodEntries(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const entries = value.flatMap((item) => {
    const source = record(item);
    const meal = text(source?.meal, 30);
    const name = text(source?.name, 100);
    if (!meal || !name) return [];
    return [{
      meal,
      name,
      calories: bounded(source?.calories, 0, 20_000),
      protein: bounded(source?.protein, 0, 1_000),
      carbs: bounded(source?.carbs, 0, 2_000),
      fat: bounded(source?.fat, 0, 1_000),
    }];
  }).slice(0, 30);
  return entries.length ? entries : undefined;
}

function training(value: unknown) {
  const source = record(value);
  if (!source) return undefined;
  const activeExercises = Array.isArray(source.activeExercises) ? source.activeExercises.flatMap((item) => {
    const exercise = record(item);
    const name = text(exercise?.name);
    if (!name) return [];
    return [{ name, area: text(exercise?.area, 60), sets: bounded(exercise?.sets, 1, 20), reps: text(exercise?.reps, 40) }];
  }).slice(0, 20) : undefined;
  const recentSessions = Array.isArray(source.recentSessions) ? source.recentSessions.flatMap((item) => {
    const session = record(item);
    const completedAt = typeof session?.completedAt === "string" ? session.completedAt.slice(0, 30) : undefined;
    const exerciseNames = Array.isArray(session?.exerciseNames) ? session.exerciseNames.map((name) => text(name)).filter((name): name is string => Boolean(name)).slice(0, 12) : [];
    if (!completedAt || !exerciseNames.length) return [];
    return [{ completedAt, exerciseNames, durationMinutes: bounded(session?.durationMinutes, 0, 600), fatigue: bounded(session?.fatigue, 1, 10) }];
  }).slice(0, 4) : undefined;
  const recentPerformance = Array.isArray(source.recentPerformance) ? source.recentPerformance.flatMap((item) => {
    const performance = record(item);
    const exerciseName = text(performance?.exerciseName);
    const sets = Array.isArray(performance?.sets) ? performance.sets.flatMap((set) => {
      const entry = record(set);
      const reps = bounded(entry?.reps, 1, 200);
      return reps === undefined ? [] : [{ weightKg: bounded(entry?.weightKg, 0, 1_000), reps, rpe: bounded(entry?.rpe, 1, 10) }];
    }).slice(0, 12) : [];
    return exerciseName && sets.length ? [{ exerciseId: text(performance?.exerciseId, 100), exerciseName, sets }] : [];
  }).slice(0, 20) : undefined;
  return activeExercises?.length || recentSessions?.length || recentPerformance?.length ? { activeExercises, recentSessions, recentPerformance } : undefined;
}

function totals(value: unknown) {
  const source = record(value);
  if (!source) return undefined;
  const calories = bounded(source.calories, 0, 20_000);
  if (calories === undefined) return undefined;
  return {
    calories,
    protein: bounded(source.protein, 0, 1_000) ?? 0,
    carbs: bounded(source.carbs, 0, 2_000) ?? 0,
    fat: bounded(source.fat, 0, 1_000) ?? 0,
  };
}

function measurements(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const list = value.flatMap((item) => {
    const entry = record(item);
    const measuredAt = isoDate(entry?.measuredAt);
    const weightKg = bounded(entry?.weightKg, 20, 400);
    return measuredAt && weightKg !== undefined ? [{ measuredAt, weightKg }] : [];
  })
    // 90 günden eskisi bağlamda işe yaramaz (bkz. bağlam bütçesi); trend
    // hesabı zaten kendi penceresini uygular.
    .slice(-90);
  return list.length ? list : undefined;
}

/**
 * @param legacyContext Göç öncesi istemcilerin gönderdiği düz metin bağlam.
 *   Yeni sunucu eski uygulama sürümleriyle de çalışmak zorunda (Capacitor ile
 *   yayımlanmış bir sürüm kullanıcının telefonunda güncellenmemiş olabilir).
 *   Bu metinden TÜRETİLMİŞ DEĞER OKUNMAZ; yalnız varlığı, hiç sinyal
 *   gelmediğini anlamak için kullanılır.
 */
export function sanitizeCoachSignals(value: unknown, legacyContext?: string): IntelligenceInput {
  const source = record(value);
  if (!source) {
    // Eski istemci: yapılandırılmış sinyal yok. Motor boş girdiyle çalışır ve
    // her alanı "eksik" olarak işaretler; model de "bu veriyi göremiyorum"
    // diyebilir. Uydurulmuş bir bağlam göndermekten iyidir.
    void legacyContext;
    return {};
  }

  const profile = record(source.profile);
  const goal = record(source.goal);
  const today = record(source.today);
  const activity = record(source.activity);

  return {
    profile: {
      age: bounded(profile?.age, 10, 120),
      sex: typeof profile?.sex === "string" ? profile.sex.slice(0, 20) : undefined,
      heightCm: bounded(profile?.heightCm, 80, 260),
      weightKg: bounded(profile?.weightKg, 20, 400),
      environment: text(profile?.environment, 40),
      equipment: text(profile?.equipment, 200),
      assessmentAnswers: Array.isArray(profile?.assessmentAnswers)
        ? profile.assessmentAnswers.map((answer) => text(answer, 100)).filter((answer): answer is string => Boolean(answer)).slice(0, 20)
        : undefined,
    },
    goal: {
      goalType: goalType(goal?.goalType),
      targetWeightKg: bounded(goal?.targetWeightKg, 20, 400),
      // Kayıtlı beslenme hedefi uygulamanın kendi doğrulayıcısından geçer.
      savedGoal: sanitizeNutritionGoal(goal?.savedGoal),
      activityFactor: bounded(goal?.activityFactor, 1.1, 2.2),
      workoutDays: bounded(goal?.workoutDays, 0, 7),
    },
    today: {
      totals: totals(today?.totals),
      steps: bounded(today?.steps, 0, 200_000),
      waterMl: bounded(today?.waterMl, 0, 20_000),
      sleepMinutes: bounded(today?.sleepMinutes, 0, 1_440),
      workoutCompleted: typeof today?.workoutCompleted === "boolean" ? today.workoutCompleted : undefined,
      foods: foodEntries(today?.foods),
    },
    measurements: measurements(source.measurements),
    recentCalories: numberList(source.recentCalories, 0, 20_000, 7),
    recentSteps: numberList(source.recentSteps, 0, 200_000, 7),
    activity: {
      workoutsThisWeek: bounded(activity?.workoutsThisWeek, 0, 50),
      walkingDistanceKm: bounded(activity?.walkingDistanceKm, 0, 500),
      runningDistanceKm: bounded(activity?.runningDistanceKm, 0, 500),
      streakDays: bounded(activity?.streakDays, 0, 10_000),
    },
    training: training(source.training),
  };
}

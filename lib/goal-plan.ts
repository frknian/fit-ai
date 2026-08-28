// Hedef planı: "100 kiloyum, hedefim 90, haftada 3 gün 45 dakika, ağır
// çalışmak istiyorum" cevaplarından tarih, haftalık hız, günlük kalori
// hedefi ve grafik için haftalık kilo eğrisi üretir.
//
// Eski kart yalnızca GEÇMİŞ kayıtlardan geriye dönük tahmin yapıyordu; kayıt
// yoksa "yeterli veri yok" diyip duruyordu. Bu dosya İLERİYE dönük çalışır:
// kullanıcının seçtiği tempo bir enerji açığına, o da bir takvime çevrilir.
//
// GÜVENLİK: bu bir tıbbi hesap değil. Hız vücut ağırlığının haftada %1'iyle
// sınırlanır ve günlük alım BMR'nin altına düşerse uyarı üretilir; sayı
// sessizce "başarılabilir" gösterilmez.

const KCAL_PER_KG = 7_700;

/** Harcamanın hareketsiz tabanı; kaydedilen antrenman bunun ÜSTÜNE eklenir. */
const SEDENTARY_MULTIPLIER = 1.2;

/** Haftada vücut ağırlığının en fazla %1'i — üstü sürdürülebilir değil. */
export const MAX_SAFE_WEEKLY_FRACTION = 0.01;

/** Bu kadar haftadan uzun planlar takvim olarak anlamını yitirir. */
export const MAX_PLAN_WEEKS = 104;

export type GoalIntensity = "easy" | "steady" | "hard";

/** Seçilen tempo → hedeflenen haftalık değişim (vücut ağırlığının oranı). */
const INTENSITY_FRACTION: Record<GoalIntensity, number> = {
  easy: 0.004,
  steady: 0.0065,
  hard: 0.01,
};

/** Seans yoğunluğunun MET karşılığı; antrenman yakımını hesaplamak için. */
const INTENSITY_MET: Record<GoalIntensity, number> = {
  easy: 4.5,
  steady: 6,
  hard: 7.5,
};

export const GOAL_INTENSITIES: GoalIntensity[] = ["easy", "steady", "hard"];
export const WEEKLY_DAY_OPTIONS = [2, 3, 4, 5, 6, 7];
export const SESSION_MINUTE_OPTIONS = [30, 45, 60, 75];

export type GoalPlanAnswers = {
  targetWeightKg: number;
  weeklyDays: number;
  sessionMinutes: number;
  intensity: GoalIntensity;
};

export type GoalPlanContext = {
  currentWeightKg: number;
  /** Bazal metabolizma. Yoksa günlük kalori önerisi üretilmez. */
  bmr?: number | null;
  today?: Date;
};

function isPositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Kaydedilmiş/gelen cevabı geçerli aralığa oturtur. */
export function normalizeAnswers(raw: unknown): GoalPlanAnswers | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const targetWeightKg = Number(value.targetWeightKg);
  if (!isPositive(targetWeightKg) || targetWeightKg > 500) return null;
  const weeklyDays = Number(value.weeklyDays);
  const sessionMinutes = Number(value.sessionMinutes);
  const intensity = String(value.intensity) as GoalIntensity;
  return {
    targetWeightKg: Math.round(targetWeightKg * 10) / 10,
    weeklyDays: WEEKLY_DAY_OPTIONS.includes(weeklyDays) ? weeklyDays : 3,
    sessionMinutes: SESSION_MINUTE_OPTIONS.includes(sessionMinutes) ? sessionMinutes : 45,
    intensity: GOAL_INTENSITIES.includes(intensity) ? intensity : "steady",
  };
}

/** Bir antrenman seansının yaklaşık yakımı (kcal). MET × 3.5 × kg / 200 × dk. */
export function sessionBurnKcal(answers: GoalPlanAnswers, weightKg: number): number {
  if (!isPositive(weightKg)) return 0;
  return Math.round((INTENSITY_MET[answers.intensity] * 3.5 * weightKg / 200) * answers.sessionMinutes);
}

/** Antrenmandan gelen günlük ortalama yakım (haftaya yayılmış). */
export function dailyTrainingBurnKcal(answers: GoalPlanAnswers, weightKg: number): number {
  return Math.round((sessionBurnKcal(answers, weightKg) * answers.weeklyDays) / 7);
}

export type GoalPlanWarning = "clampedToSafeRate" | "intakeBelowBmr" | "beyondHorizon" | "noBmr";

export type GoalPlanProjection = {
  /** Kilo verme mi, alma mı. */
  losing: boolean;
  remainingKg: number;
  /** İşaretli haftalık değişim (kg). Kilo vermede negatif. */
  weeklyRateKg: number;
  weeks: number;
  etaIso: string;
  /** Hedefe ulaşmak için gereken günlük enerji farkı (mutlak, kcal). */
  dailyDeltaKcal: number;
  dailyTrainingBurnKcal: number;
  /** Antrenman dışında kalan, beslenmeden gelmesi gereken günlük fark. */
  dailyDietDeltaKcal: number;
  /** Önerilen günlük alım (kcal). BMR bilinmiyorsa null. */
  dailyIntakeKcal: number | null;
  maintenanceKcal: number | null;
  warnings: GoalPlanWarning[];
};

export type GoalPlanResult = { status: "reached" } | { status: "invalid" } | ({ status: "ready" } & GoalPlanProjection);

/**
 * Cevapları takvime çevirir.
 *
 * Zincir: seçilen tempo → haftalık kg → haftalık kcal → günlük kcal farkı.
 * Antrenmanın getirdiği yakım bu farkın bir kısmını karşılar; kalanı
 * beslenmeden gelmelidir. Böylece "ağır çalışacağım" demek, gereken kalori
 * kısıtını gerçekten azaltır.
 */
export function planGoal(answers: GoalPlanAnswers, context: GoalPlanContext): GoalPlanResult {
  const current = context.currentWeightKg;
  if (!isPositive(current) || !isPositive(answers.targetWeightKg)) return { status: "invalid" };

  const difference = answers.targetWeightKg - current;
  const remainingKg = Math.abs(difference);
  if (remainingKg < 0.5) return { status: "reached" };
  const losing = difference < 0;

  const warnings: GoalPlanWarning[] = [];

  // Tempo seçimi hedeflenen hızı verir; güvenli tavanı aşarsa kırpılır.
  const requested = current * INTENSITY_FRACTION[answers.intensity];
  const maxSafe = current * MAX_SAFE_WEEKLY_FRACTION;
  const magnitude = Math.min(requested, maxSafe);
  if (requested > maxSafe + 1e-9) warnings.push("clampedToSafeRate");

  const weeklyRateKg = losing ? -magnitude : magnitude;
  const rawWeeks = remainingKg / magnitude;
  const weeks = Math.max(1, Math.round(rawWeeks));
  if (rawWeeks > MAX_PLAN_WEEKS) warnings.push("beyondHorizon");

  const today = context.today ?? new Date();
  const eta = new Date(today.getTime() + Math.min(rawWeeks, MAX_PLAN_WEEKS) * 7 * 86_400_000);

  const dailyDeltaKcal = Math.round((magnitude * KCAL_PER_KG) / 7);
  const trainingBurn = dailyTrainingBurnKcal(answers, current);
  // Kilo verirken antrenman farkın bir kısmını karşılar; kilo alırken ise
  // yakılan kaloriyi de fazladan almak gerekir, yani gereken alımı artırır.
  const dailyDietDeltaKcal = Math.max(0, dailyDeltaKcal - (losing ? trainingBurn : 0));

  const bmr = isPositive(context.bmr) ? context.bmr : null;
  let maintenanceKcal: number | null = null;
  let dailyIntakeKcal: number | null = null;
  if (bmr === null) {
    warnings.push("noBmr");
  } else {
    maintenanceKcal = Math.round(bmr * SEDENTARY_MULTIPLIER + trainingBurn);
    dailyIntakeKcal = Math.round(losing ? maintenanceKcal - dailyDietDeltaKcal : maintenanceKcal + dailyDeltaKcal);
    if (dailyIntakeKcal < bmr) warnings.push("intakeBelowBmr");
  }

  return {
    status: "ready",
    losing,
    remainingKg: Math.round(remainingKg * 10) / 10,
    weeklyRateKg: Math.round(weeklyRateKg * 100) / 100,
    weeks,
    etaIso: eta.toISOString().slice(0, 10),
    dailyDeltaKcal,
    dailyTrainingBurnKcal: trainingBurn,
    dailyDietDeltaKcal,
    dailyIntakeKcal,
    maintenanceKcal,
    warnings,
  };
}

export type ProjectionPoint = { week: number; weightKg: number };

/**
 * Grafik için haftalık kilo eğrisi. Hedefe ulaşınca düzleşir — devam eden
 * bir çizgi, hedefi geçip düşmeye devam ediyormuş gibi okunurdu.
 */
export function projectWeightSeries(startWeightKg: number, weeklyRateKg: number, targetWeightKg: number, weeks: number): ProjectionPoint[] {
  const total = Math.max(1, Math.min(MAX_PLAN_WEEKS, Math.round(weeks)));
  const losing = weeklyRateKg < 0;
  const points: ProjectionPoint[] = [];
  for (let week = 0; week <= total; week += 1) {
    const raw = startWeightKg + weeklyRateKg * week;
    const clamped = losing ? Math.max(targetWeightKg, raw) : Math.min(targetWeightKg, raw);
    points.push({ week, weightKg: Math.round(clamped * 10) / 10 });
  }
  return points;
}

// --- Yapay zekâ analizi -----------------------------------------------------
//
// Analiz her zaman yerel bir metinle üretilebilir; AI yalnız onu zenginleştirir.
// Böylece anahtar yokken ya da model yanıt vermezken kart boş kalmaz.

export type GoalAnalysis = {
  headline: string;
  assessment: string;
  steps: string[];
  safetyNote: string;
};

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

/** Model çıktısını doğrular; eksik ya da bozuk yanıt kullanılmaz. */
export function validateGoalAnalysis(value: unknown): GoalAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const headline = cleanText(raw.headline, 90);
  const assessment = cleanText(raw.assessment, 420);
  const safetyNote = cleanText(raw.safetyNote, 260);
  const steps = Array.isArray(raw.steps)
    ? raw.steps.map((step) => cleanText(step, 200)).filter((step): step is string => step !== null).slice(0, 4)
    : [];
  if (!headline || !assessment || !safetyNote || steps.length < 2) return null;
  return { headline, assessment, steps, safetyNote };
}

/**
 * Modele gönderilecek anonim özet. Ad, e-posta, doğum tarihi GÖNDERİLMEZ;
 * yalnız planın kendisi için gereken sayılar.
 */
export function goalPlanSummary(answers: GoalPlanAnswers, projection: GoalPlanProjection, currentWeightKg: number) {
  return {
    currentWeightKg: Math.round(currentWeightKg * 10) / 10,
    targetWeightKg: answers.targetWeightKg,
    direction: projection.losing ? "kilo verme" : "kilo alma",
    remainingKg: projection.remainingKg,
    weeklyRateKg: Math.abs(projection.weeklyRateKg),
    weeks: projection.weeks,
    weeklyDays: answers.weeklyDays,
    sessionMinutes: answers.sessionMinutes,
    intensity: answers.intensity,
    dailyTrainingBurnKcal: projection.dailyTrainingBurnKcal,
    dailyDietDeltaKcal: projection.dailyDietDeltaKcal,
    dailyIntakeKcal: projection.dailyIntakeKcal,
    maintenanceKcal: projection.maintenanceKcal,
    warnings: projection.warnings,
  };
}

/** Grafiği çizmek için noktaları 0-100 kutusuna oturtur. */
export function seriesToPath(points: ProjectionPoint[], width = 100, height = 100): string {
  if (points.length < 2) return "";
  const weights = points.map((point) => point.weightKg);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const span = max - min || 1;
  const lastWeek = points[points.length - 1].week || 1;
  return points
    .map((point, index) => {
      const x = (point.week / lastWeek) * width;
      // SVG'de y aşağı büyür; yüksek kilo yukarıda görünmeli.
      const y = height - ((point.weightKg - min) / span) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

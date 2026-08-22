// Günün görevleri.
//
// NEDEN VAR: ana ekran bugüne kadar ölçüm gösteriyordu, GÖREV değil. Kullanıcı
// kalori çemberine, adım kartına ve program listesine ayrı ayrı bakıp "bugün
// ne yapmam gerekiyor?" sorusunu kendi kafasında birleştirmek zorundaydı.
//
// Görevler TÜRETİLİR, ayrı bir tabloda tutulmaz: hepsi zaten kaydedilen
// verilerden çıkar (antrenman seansı, adım sayacı, aktivite kaydı, ölçüm).
// Böylece "tamamlandı" işaretini kullanıcının ayrıca basması gerekmez ve iki
// kayıt birbirinden ayrı düşemez.

export type DailyTaskId = "workout" | "steps" | "outdoor" | "weighIn";

export type DailyTask = {
  id: DailyTaskId;
  done: boolean;
  /** Metindeki sayı (adım hedefi, dakika…). Metnin kendisi sözlükten gelir. */
  target?: number;
  /** Bugün ulaşılan değer; ilerleme göstermek isteyen ekranlar kullanır. */
  current?: number;
};

export type DailyTaskInput = {
  /** Takvim tercihine göre bugün antrenman günü mü? */
  isWorkoutDay: boolean;
  /** Bugün tamamlanmış bir antrenman seansı var mı? */
  workoutDone: boolean;
  steps: number;
  stepGoal: number;
  /** Bugün açık havada geçirilen dakika (bkz. lib/outdoor.ts). */
  outdoorMinutes: number;
  /** Haftalık açık hava hedefi tutturuldu mu? Tutturulduysa görev düşer. */
  outdoorGoalMet: boolean;
  /** Son tartılmanın üzerinden geçen gün; hiç tartılmadıysa null. */
  daysSinceWeighIn: number | null;
};

/** Tartılma ritmi: haftada bir. Daha sık ölçüm gündelik dalgalanmayı ölçer. */
export const WEIGH_IN_INTERVAL_DAYS = 7;

/**
 * Bugünün görev listesi.
 *
 * Liste KISA tutulur: her koşulda en fazla dört madde. Ana ekranın işi
 * "bugün ne yapmalıyım" sorusunu bir bakışta yanıtlamak; tamamlanacak on
 * madde gösteren bir ekran o soruyu yanıtlamaz, erteletir.
 */
export function buildDailyTasks(input: DailyTaskInput): DailyTask[] {
  const tasks: DailyTask[] = [];

  // Antrenman yalnız planlı günlerde görev olur. Plansız günde "antrenman yap"
  // demek, dinlenmeyi ihmal edilmiş bir görev gibi gösterirdi.
  if (input.isWorkoutDay) tasks.push({ id: "workout", done: input.workoutDone });

  const stepGoal = Math.max(1, Math.round(input.stepGoal));
  tasks.push({ id: "steps", done: input.steps >= stepGoal, target: stepGoal, current: Math.max(0, Math.round(input.steps)) });

  // Doğa görevi haftalık hedef tutturulduysa düşer: amaç biriktirmek değil,
  // her hafta dışarı çıkma alışkanlığı (bkz. lib/outdoor.ts).
  if (!input.outdoorGoalMet) tasks.push({ id: "outdoor", done: input.outdoorMinutes > 0, current: Math.max(0, Math.round(input.outdoorMinutes)) });

  // Tartılma yalnız zamanı geldiyse görev olur.
  const { daysSinceWeighIn } = input;
  const weighInDue = daysSinceWeighIn === null || daysSinceWeighIn >= WEIGH_IN_INTERVAL_DAYS;
  if (weighInDue) tasks.push({ id: "weighIn", done: false });

  return tasks;
}

export type DailyTaskProgress = { done: number; total: number; percent: number };

export function summarizeDailyTasks(tasks: DailyTask[]): DailyTaskProgress {
  const total = tasks.length;
  const done = tasks.filter((task) => task.done).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

/**
 * İki yerel tarih arasındaki gün farkı ("2026-08-22" biçiminde).
 *
 * Saat dilimi taşımadan, gün anahtarları üzerinden hesaplanır: `new Date()`
 * farkı almak yaz saati geçişlerinde bir gün kayabiliyor.
 */
export function daysBetween(fromDateKey: string, toDateKey: string): number | null {
  const parse = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  };
  const from = parse(fromDateKey);
  const to = parse(toDateKey);
  if (from === null || to === null) return null;
  return Math.round((to - from) / 86_400_000);
}

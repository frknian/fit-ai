import type { Dictionary } from "./i18n/translate.ts";
import { formatWeight, type WeightUnit } from "./units.ts";

export type WorkoutSetDraft = {
  setNumber: number;
  weightKg: string;
  reps: string;
  durationSeconds: string;
  rpe: string;
  note: string;
  completed: boolean;
};

export type LoggedWorkoutSet = {
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  rpe: number | null;
  note: string | null;
};

export type PreviousExercisePerformance = {
  exerciseLogId: string;
  exerciseName: string;
  completedAt: string;
  isBodyweight: boolean;
  sets: LoggedWorkoutSet[];
};

export type CompletedExerciseLog = {
  exerciseId: string | null;
  exerciseName: string;
  exerciseKey: string;
  exerciseOrder: number;
  isBodyweight: boolean;
  sets: LoggedWorkoutSet[];
};

export function exerciseLogKey(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function positiveInteger(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function createWorkoutSetDrafts(totalSets: number, target: string): WorkoutSetDraft[] {
  const targetValue = String(Math.max(1, Number.parseInt(target, 10) || 10));
  const timed = /sn|saniye/i.test(target);
  return Array.from({ length: Math.max(1, totalSets) }, (_, index) => ({
    setNumber: index + 1,
    weightKg: "",
    reps: timed ? "" : targetValue,
    durationSeconds: timed ? targetValue : "",
    rpe: "",
    note: "",
    completed: false,
  }));
}

/**
 * Geçen seferin ağırlık/tekrar değerlerini set taslaklarına önceden yazar.
 *
 * Yalnızca kullanıcının HENÜZ DOKUNMADIĞI alanlar doldurulur: tamamlanmış set
 * veya elle girilmiş bir değer asla ezilmez, aksi halde otomatik doldurma
 * kullanıcının kaydını silerdi. Önceki seansta olmayan bir set numarası için
 * son bilinen set referans alınır (ör. geçen hafta 3 set, bu hafta 4 set).
 */
export function applyPreviousPerformance(drafts: WorkoutSetDraft[], previous: PreviousExercisePerformance | null | undefined): WorkoutSetDraft[] {
  if (!previous || !previous.sets.length) return drafts;
  return drafts.map((draft) => {
    if (draft.completed) return draft;
    const match = previous.sets.find((set) => set.setNumber === draft.setNumber) ?? previous.sets[previous.sets.length - 1];
    if (!match) return draft;
    const weightKg = draft.weightKg.trim() === "" && match.weightKg !== null ? String(match.weightKg) : draft.weightKg;
    const reps = draft.reps.trim() === "" && match.reps !== null ? String(match.reps) : draft.reps;
    const durationSeconds = draft.durationSeconds.trim() === "" && match.durationSeconds !== null ? String(match.durationSeconds) : draft.durationSeconds;
    return { ...draft, weightKg, reps, durationSeconds };
  });
}

/** Sette kaydedilmeye değer bir veri var mı? */
export function setDraftHasData(draft: WorkoutSetDraft): boolean {
  return Boolean(draft.weightKg.trim() || draft.reps.trim() || draft.durationSeconds.trim() || draft.rpe.trim() || draft.note.trim());
}

/**
 * Set satırına yapılan bir düzenlemeyi uygular ve kaydı KENDİLİĞİNDEN işaretler.
 *
 * Eskiden her satırın sonunda bir "Kaydet" düğmesi vardı; kullanıcı ağırlığı ve
 * tekrarı yazıp düğmeye basmayı unutuyor, set hiç kaydedilmemiş sayılıyordu.
 * Artık bir değer yazmak setin kendisini kaydeder, alanları temizlemek de
 * kaydı geri alır. Yalnız `completed` doğrudan verildiğinde (ör. süre sayacı
 * seti bitirdiğinde) bu türetme atlanır.
 */
export function applySetDraftPatch(draft: WorkoutSetDraft, patch: Partial<Omit<WorkoutSetDraft, "setNumber">>): WorkoutSetDraft {
  const next = { ...draft, ...patch };
  if ("completed" in patch) return next;
  return { ...next, completed: setDraftHasData(next) };
}

/** Set sayısını değiştirir: eklenen setler boş başlar, silinenler sondan gider. */
export function resizeWorkoutSetDrafts(drafts: WorkoutSetDraft[], totalSets: number, target: string): WorkoutSetDraft[] {
  const size = Math.max(1, Math.min(20, Math.round(totalSets)));
  if (size === drafts.length) return drafts;
  if (size < drafts.length) return drafts.slice(0, size);
  const additions = createWorkoutSetDrafts(size - drafts.length, target).map((draft, index) => ({
    ...draft,
    setNumber: drafts.length + index + 1,
    // Yeni set kullanıcının yazacağı değeri bekler; hedeften gelen tekrar
    // sayısı öneri olarak kalır ama set otomatik kaydedilmiş sayılmaz.
    completed: false,
  }));
  return [...drafts, ...additions];
}

export function normalizeWorkoutSet(draft: WorkoutSetDraft): LoggedWorkoutSet | null {
  const weightKg = nonNegativeNumber(draft.weightKg);
  const reps = positiveInteger(draft.reps);
  const durationSeconds = positiveInteger(draft.durationSeconds);
  const rpeValue = positiveInteger(draft.rpe);
  const rpe = rpeValue && rpeValue <= 10 ? rpeValue : null;
  const note = draft.note.trim() || null;
  if (weightKg === null && reps === null && durationSeconds === null && rpe === null && note === null) return null;
  return { setNumber: draft.setNumber, weightKg, reps, durationSeconds, rpe, note };
}

export function buildCompletedExerciseLog(input: {
  exerciseId?: string;
  exerciseName: string;
  exerciseOrder: number;
  isBodyweight: boolean;
  drafts: WorkoutSetDraft[];
}): CompletedExerciseLog | null {
  const sets = input.drafts.filter((draft) => draft.completed).map(normalizeWorkoutSet).filter((set): set is LoggedWorkoutSet => Boolean(set));
  if (!sets.length) return null;
  return {
    exerciseId: input.exerciseId || null,
    exerciseName: input.exerciseName,
    exerciseKey: exerciseLogKey(input.exerciseName),
    exerciseOrder: input.exerciseOrder,
    isBodyweight: input.isBodyweight,
    sets,
  };
}

export function progressionSuggestion(previous: PreviousExercisePerformance | null, t: Dictionary, unit: WeightUnit = "kg") {
  const copy = t.setLogger;
  if (!previous?.sets.length) return copy.progressionFirstTime;

  const rpeValues = previous.sets.map((set) => set.rpe).filter((value): value is number => value !== null);
  const averageRpe = rpeValues.length ? rpeValues.reduce((total, value) => total + value, 0) / rpeValues.length : null;
  const topWeight = Math.max(0, ...previous.sets.map((set) => set.weightKg || 0));
  const topReps = Math.max(0, ...previous.sets.map((set) => set.reps || 0));
  const topDuration = Math.max(0, ...previous.sets.map((set) => set.durationSeconds || 0));
  const safety = copy.progressionSafety;

  if (averageRpe === null) {
    return copy.progressionNoRpe(safety);
  }
  if (averageRpe >= 9) {
    return copy.progressionVeryHardRpe(averageRpe.toFixed(1), safety);
  }
  if (averageRpe > 7) {
    return copy.progressionBalancedRpe(averageRpe.toFixed(1), safety);
  }
  if (topWeight > 0) {
    return copy.progressionWeight(formatWeight(topWeight + 2.5, unit), safety);
  }
  if (topDuration > 0) {
    return copy.progressionDuration(topDuration + 5, safety);
  }
  if (topReps > 0) {
    return copy.progressionReps(topReps + 1, topReps + 2, safety);
  }
  return copy.progressionRepeat(safety);
}

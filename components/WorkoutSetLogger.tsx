"use client";

import type { PreviousExercisePerformance, WorkoutSetDraft } from "@/lib/workout-log";
import { progressionSuggestion } from "@/lib/workout-log";
import { formatWeight, type WeightUnit } from "@/lib/units";
import { useTranslations, type Dictionary } from "@/lib/i18n/translate";
import { useLocale } from "@/lib/i18n/locale";

type SetPatch = Partial<Omit<WorkoutSetDraft, "setNumber">>;

function previousSetLabel(set: PreviousExercisePerformance["sets"][number], unit: WeightUnit, t: Dictionary) {
  const values = [
    set.weightKg !== null ? formatWeight(set.weightKg, unit) : "",
    set.reps !== null ? t.setLogger.repsSuffix(set.reps) : "",
    set.durationSeconds !== null ? t.setLogger.durationSuffix(set.durationSeconds) : "",
    set.rpe !== null ? `${t.setLogger.effortLabel} ${set.rpe}${t.setLogger.effortScale}` : "",
  ].filter(Boolean);
  return values.join(" · ") || t.setLogger.noRecordNote;
}

/**
 * Set kaydı tablosu.
 *
 * İki ürün kuralı:
 *   • VERİ GİRMEK ZORUNLU DEĞİL. Boş bırakılan set kaydedilmez, antrenman
 *     yine tamamlanır (kaydın tamamı da ayardan kapatılabilir). Set sayısı
 *     oynatıcıdaki set şeridinden değiştirilir.
 *   • KAYDET DÜĞMESİ YOK. Ağırlık, tekrar, zorluk ya da not yazıldığı anda
 *     set kaydedilmiş sayılır; alanlar boşaltılınca kayıt geri alınır.
 */
export function WorkoutSetLogger({ exerciseName, activeSet, isBodyweight, sets, previous, loadingPrevious, unit, onChange }: {
  exerciseName: string;
  activeSet: number;
  isBodyweight: boolean;
  sets: WorkoutSetDraft[];
  previous: PreviousExercisePerformance | null | undefined;
  loadingPrevious: boolean;
  unit: WeightUnit;
  onChange: (setNumber: number, patch: SetPatch) => void;
}) {
  const t = useTranslations();
  const dateLocale = useLocale() === "en" ? "en-US" : "tr-TR";
  return <section className="set-log-card" aria-labelledby="set-log-title">
    <div className="set-log-heading">
      <div><span>{t.setLogger.eyebrow}</span><h2 id="set-log-title">{t.setLogger.title}</h2></div>
      <small>{isBodyweight ? t.setLogger.bodyweightHint : t.setLogger.weightedHint}</small>
    </div>

    <div className="previous-performance">
      {loadingPrevious ? <p className="previous-empty">{t.setLogger.searchingPrevious}</p> : previous ? <>
        <div className="previous-heading"><div><span>{t.setLogger.lastPerformance}</span><strong>{new Intl.DateTimeFormat(dateLocale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(previous.completedAt))}</strong></div><small>{exerciseName}</small></div>
        <div className="previous-sets">{previous.sets.map((set) => <span key={set.setNumber}><b>{t.setLogger.setOrdinal(set.setNumber)}</b>{previousSetLabel(set, unit, t)}</span>)}</div>
        <div className="progression-tip"><span>↗</span><p><strong>{t.setLogger.progressionTipTitle}</strong>{progressionSuggestion(previous, t, unit)}</p></div>
      </> : <div className="previous-empty"><span>＋</span><p><strong>{t.setLogger.noHistoryTitle}</strong>{t.setLogger.noHistoryBody}</p></div>}
    </div>

    <div className="set-log-table">
      <div className={`set-log-table-head ${isBodyweight ? "bodyweight" : "weighted"}`}><span>{t.setLogger.setLabel}</span>{isBodyweight ? <><span>{t.setLogger.repsLabel}</span><span>{t.setLogger.durationLabel}</span></> : <><span>{unit === "lb" ? "Lb" : "Kg"}</span><span>{t.setLogger.repsLabel}</span></>}<span>{t.setLogger.effortLabel}</span><span>{t.setLogger.noteLabel}</span><span>{t.setLogger.statusLabel}</span></div>
      {sets.map((set) => <div className={`set-log-row ${isBodyweight ? "bodyweight" : "weighted"} ${set.setNumber === activeSet ? "active" : ""}`} key={set.setNumber}>
        <strong>{String(set.setNumber).padStart(2, "0")}</strong>
        {isBodyweight ? <>
          <label><span>{t.setLogger.repsLabel}</span><input type="number" inputMode="numeric" min="1" max="999" value={set.reps} onChange={(event) => onChange(set.setNumber, { reps: event.target.value })} aria-label={t.setLogger.repsAria(set.setNumber)} placeholder="—" /></label>
          <label><span>{t.setLogger.durationLabel}</span><div className="set-input-unit"><input type="number" inputMode="numeric" min="1" max="3600" value={set.durationSeconds} onChange={(event) => onChange(set.setNumber, { durationSeconds: event.target.value })} aria-label={t.setLogger.durationAria(set.setNumber)} placeholder="—" /><i>sn</i></div></label>
        </> : <>
          <label><span>{t.setLogger.weightLabel}</span><div className="set-input-unit"><input type="number" inputMode="decimal" min="0" max="2200" step="0.5" value={set.weightKg} onChange={(event) => onChange(set.setNumber, { weightKg: event.target.value })} aria-label={t.setLogger.weightAria(set.setNumber, unit === "lb" ? t.setLogger.poundWord : t.setLogger.kilogramWord)} placeholder="—" /><i>{unit}</i></div></label>
          <label><span>{t.setLogger.repsLabel}</span><input type="number" inputMode="numeric" min="1" max="999" value={set.reps} onChange={(event) => onChange(set.setNumber, { reps: event.target.value })} aria-label={t.setLogger.repsAria(set.setNumber)} placeholder="—" /></label>
        </>}
        <label><span>{t.setLogger.effortLabel}</span><select value={set.rpe} onChange={(event) => onChange(set.setNumber, { rpe: event.target.value })} aria-label={t.setLogger.effortAria(set.setNumber)}><option value="">—</option>{Array.from({ length: 10 }, (_, index) => <option value={index + 1} key={index + 1}>{index + 1}{t.setLogger.effortScale}</option>)}</select></label>
        <label className="set-note"><span>{t.setLogger.noteLabel}</span><input type="text" maxLength={140} value={set.note} onChange={(event) => onChange(set.setNumber, { note: event.target.value })} aria-label={t.setLogger.noteAria(set.setNumber)} placeholder={t.setLogger.notePlaceholder} /></label>
        {/* Kaydet düğmesi yok: durum, satıra bir şey yazıldığı anda kendiliğinden değişir. */}
        <span className={set.completed ? "set-status complete" : "set-status"} role="status">{set.completed ? t.setLogger.saved : t.setLogger.notSaved}</span>
      </div>)}
    </div>
    <p className="rpe-help"><strong>{t.setLogger.effortLabel}{t.setLogger.effortScale}:</strong> {t.setLogger.effortHelp}</p>
    <p className="set-autosave-hint">{t.setLogger.autoSaveHint}</p>
  </section>;
}

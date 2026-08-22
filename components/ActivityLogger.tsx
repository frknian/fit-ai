"use client";

import { FormEvent, useEffect, useEffectEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createActivityRepository, summarizeActivities, type ActivityEntry } from "@/lib/activity-service";
import { activityIntensityOptions, allActivityCatalog, coreActivityCatalog, estimateActivityCalories, sportByKey, validActivityDuration, type SportDefinition, type SportMetricKey } from "@/lib/sports";
import { localDateKey, userTimeZone, type ActivityType } from "@/lib/streak";
import { ActivityIcon } from "@/components/ActivityIcon";
import { useTranslations, translateIntensity } from "@/lib/i18n/translate";
import { useLocale } from "@/lib/i18n/locale";

// Eskiden bir de "guide" kipi vardı: sporlar "Diğer spor ekle" başlığının
// altındaki ayrı bir ızgarada duruyordu. Artık bütün aktiviteler tek bir
// dikey listede olduğu için o ara adım kalktı.
type LoggerMode = "closed" | "form";
type StreakRow = { current_streak?: number };
type MetricValues = Partial<Record<SportMetricKey, string>>;

function activityByKey(key: string): SportDefinition | null {
  return coreActivityCatalog.find((activity) => activity.key === key) || sportByKey(key);
}

function numberOrNull(value: string) {
  const number = Number(value);
  return value !== "" && Number.isFinite(number) && number >= 0 ? number : null;
}

function formatActivityDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", weekday: "short" }).format(new Date(`${value}T12:00:00`));
}

function shiftDateKey(dateKey: string, amount: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

type ActivityMetric = "durationMinutes" | "estimatedCalories";

// Son 14 günün günlük özeti. Kayıt olmayan günler de sıfır değerli sütun olarak
// çizilir; aksi halde boşluklar grafikte görünmez ve düzen yanıltıcı olur.
function ActivityChart({ summaries, metric, locale, emptyLabel, unitLabel }: { summaries: ReturnType<typeof summarizeActivities>; metric: ActivityMetric; locale: string; emptyLabel: string; unitLabel: string }) {
  const today = localDateKey(new Date(), userTimeZone());
  const byDate = new Map(summaries.map((summary) => [summary.localDate, summary]));
  const days = Array.from({ length: 14 }, (_, index) => {
    const dateKey = shiftDateKey(today, index - 13);
    return { dateKey, value: byDate.get(dateKey)?.[metric] || 0 };
  });
  const peak = Math.max(...days.map((day) => day.value));
  if (!peak) return <p className="activity-chart-empty">{emptyLabel}</p>;

  const width = 560;
  const height = 170;
  const padding = { left: 34, right: 12, top: 14, bottom: 26 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const slot = plotWidth / days.length;
  const barWidth = Math.min(24, slot * 0.62);
  const shortDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "numeric" });

  return <svg className="activity-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${unitLabel} · ${days.length}`} preserveAspectRatio="xMidYMid meet">
    {[0, 0.5, 1].map((ratio) => {
      const y = padding.top + plotHeight * (1 - ratio);
      return <g key={ratio}>
        <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="activity-chart-grid" />
        <text x={padding.left - 7} y={y + 3} textAnchor="end" className="activity-chart-axis">{Math.round(peak * ratio)}</text>
      </g>;
    })}
    {days.map((day, index) => {
      const barHeight = day.value ? Math.max(2, (day.value / peak) * plotHeight) : 0;
      const x = padding.left + slot * index + (slot - barWidth) / 2;
      const y = padding.top + plotHeight - barHeight;
      return <g key={day.dateKey}>
        {barHeight > 0 && <rect x={x} y={y} width={barWidth} height={barHeight} rx={3} className={day.dateKey === today ? "activity-chart-bar today" : "activity-chart-bar"}><title>{`${formatActivityDate(day.dateKey, locale)} · ${day.value} ${unitLabel}`}</title></rect>}
        {index % 2 === 0 && <text x={x + barWidth / 2} y={height - 8} textAnchor="middle" className="activity-chart-axis">{shortDate.format(new Date(`${day.dateKey}T12:00:00`))}</text>}
      </g>;
    })}
  </svg>;
}

export function ActivityLogger({ userId, weightKg = 70 }: { userId?: string; weightKg?: number }) {
  const t = useTranslations();
  const dateLocale = useLocale() === "en" ? "en-US" : "tr-TR";
  const [mode, setMode] = useState<LoggerMode>("closed");
  const [activityKey, setActivityKey] = useState("");
  const [duration, setDuration] = useState("30");
  const [distance, setDistance] = useState("");
  const [manualCalories, setManualCalories] = useState("");
  const [caloriesManual, setCaloriesManual] = useState(false);
  const [steps, setSteps] = useState("");
  const [intensity, setIntensity] = useState<(typeof activityIntensityOptions)[number]>("Orta");
  const [metrics, setMetrics] = useState<MetricValues>({});
  const [notes, setNotes] = useState("");
  const [history, setHistory] = useState<ActivityEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(Boolean(userId));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [chartMetric, setChartMetric] = useState<ActivityMetric>("durationMinutes");
  const selectedActivity = activityByKey(activityKey);
  const dailySummaries = summarizeActivities(history);
  const automaticCalories = selectedActivity ? estimateActivityCalories(selectedActivity.key, Number(duration), weightKg, intensity) : 0;
  const calories = caloriesManual ? manualCalories : automaticCalories ? String(automaticCalories) : "";
  const reportHistoryLoadError = useEffectEvent(() => {
    setMessage(t.activityLogger.errorHistory);
  });

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    async function loadHistory() {
      const client = createClient();
      if (!client) { setHistoryLoading(false); return; }
      try {
        const entries = await createActivityRepository(client, userId as string).list();
        if (!cancelled) setHistory(entries);
      } catch {
        if (!cancelled) reportHistoryLoadError();
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }
    void loadHistory();
    return () => { cancelled = true; };
  }, [userId]);

  function resetForm(nextMode: LoggerMode) {
    setMode(nextMode);
    setDuration("30");
    setDistance("");
    setManualCalories("");
    setCaloriesManual(false);
    setSteps("");
    setIntensity("Orta");
    setMetrics({});
    setNotes("");
    setMessage("");
  }

  function selectActivity(key: string) {
    setActivityKey(key);
    resetForm("form");
  }

  function setMetric(key: SportMetricKey, value: string) {
    setMetrics((current) => ({ ...current, [key]: value }));
  }

  async function saveActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validActivityDuration(duration)) { setMessage(t.activityLogger.errorDuration); return; }
    if (!selectedActivity) { setMessage(t.activityLogger.errorSelectActivity); return; }
    if (!userId) { setMessage(t.activityLogger.errorSignIn); return; }
    const activityType: ActivityType = selectedActivity.key === "walking" ? "walk" : "sport";
    const numericDetails = Object.fromEntries(Object.entries(metrics).flatMap(([key, value]) => {
      const numericValue = numberOrNull(value);
      return numericValue === null ? [] : [[key, numericValue]];
    }));

    setSaving(true);
    setMessage("");
    const client = createClient();
    if (!client) { setSaving(false); setMessage(t.activityLogger.errorService); return; }
    const occurredAt = new Date().toISOString();
    try {
      const entry = await createActivityRepository(client, userId).create({
        activityType,
        activityKey: selectedActivity.key,
        activityName: selectedActivity.name,
        occurredAt,
        localDate: localDateKey(new Date(occurredAt), userTimeZone()),
        durationMinutes: Number(duration),
        distanceKm: numberOrNull(distance),
        estimatedCalories: numberOrNull(calories),
        steps: numberOrNull(steps),
        intensity: intensity.toLocaleLowerCase("tr-TR").replace("ü", "u") as "hafif" | "orta" | "yuksek",
        notes: notes.trim() || null,
        details: numericDetails,
      });
      setHistory((current) => [entry, ...current]);
      const { data, error: streakError } = await client.rpc("record_streak_activity", { p_activity_type: activityType, p_timezone: userTimeZone() });
      const row = Array.isArray(data) ? data[0] as StreakRow | undefined : data as StreakRow | null;
      setMessage(streakError ? t.activityLogger.savedNoStreak(entry.activityName) : t.activityLogger.savedWithStreak(entry.activityName, row?.current_streak || null));
      window.dispatchEvent(new CustomEvent("fit-ai-activity-recorded", { detail: { streak: Number(row?.current_streak) || undefined } }));
    } catch {
      setMessage(t.activityLogger.errorSave);
    } finally {
      setSaving(false);
    }
  }

  return <section className="activity-logger" aria-labelledby="activity-logger-title">
    <div className="activity-logger-head"><div><div className="eyebrow">{t.activityLogger.eyebrow}</div><h2 id="activity-logger-title">{t.activityLogger.title}</h2><p>{t.activityLogger.body}</p></div>{mode !== "closed" && <button type="button" className="activity-close" onClick={() => resetForm("closed")} aria-label={t.activityLogger.closeLabel}>×</button>}</div>

    {/* Bütün aktiviteler tek bir dikey listede, alt alta: önce en sık
        kaydedilen dördü, ardından geri kalan sporlar. */}
    {mode === "closed" && <div className="activity-entry-options activity-entry-stacked">{allActivityCatalog.map((activity) => <button type="button" key={activity.key} onClick={() => selectActivity(activity.key)}><span className="activity-option-icon"><ActivityIcon name={activity.key} /></span><div><strong>{activity.name}</strong><small>{activity.guide}</small></div><b>→</b></button>)}</div>}

    {mode === "form" && selectedActivity && <form className="activity-form" onSubmit={saveActivity}><button type="button" className="sport-guide-back" onClick={() => resetForm("closed")}>{t.activityLogger.backToSelection}</button><div className="activity-form-title"><span className="activity-option-icon"><ActivityIcon name={selectedActivity.key} /></span><div><small>{selectedActivity.name.toLocaleUpperCase("tr-TR")} {t.activityLogger.recordSuffix}</small><strong>{selectedActivity.guide}</strong></div></div><div className="activity-form-grid activity-core-fields"><label>{t.activityLogger.activityTypeLabel}<input value={selectedActivity.name} readOnly /></label><label>{t.activityLogger.durationLabel}<input required min="1" max="1440" inputMode="numeric" type="number" value={duration} onChange={(event) => { setDuration(event.target.value); setCaloriesManual(false); }} /></label><label>{t.activityLogger.distanceLabel}<input min="0" step="0.01" inputMode="decimal" type="number" value={distance} onChange={(event) => setDistance(event.target.value)} placeholder={t.activityLogger.optional} /></label><label>{t.activityLogger.estimatedCalorie} <small>{caloriesManual ? t.activityLogger.manual : t.activityLogger.automatic}</small><input min="0" inputMode="numeric" type="number" value={calories} onChange={(event) => { setManualCalories(event.target.value); setCaloriesManual(true); }} placeholder="kcal" /></label><label>{t.activityLogger.stepsLabel} <small>{t.activityLogger.optionalShort}</small><input min="0" inputMode="numeric" type="number" value={steps} onChange={(event) => setSteps(event.target.value)} placeholder="0" /></label><div className="activity-intensity-field"><span>{t.activityLogger.intensityLabel}</span><div className="segmented intensity-segmented" role="group" aria-label={t.activityLogger.intensityLabel}>{activityIntensityOptions.map((option) => <button type="button" key={option} aria-pressed={intensity === option} className={intensity === option ? "selected" : ""} onClick={() => { setIntensity(option); setCaloriesManual(false); }}>{translateIntensity(t, option)}</button>)}</div></div>{selectedActivity.metrics.filter((metric) => metric.key !== "distanceKm").map((metric) => <label key={metric.key}>{metric.label.toLocaleUpperCase("tr-TR")} ({metric.unit})<input min="0" step={metric.step || "1"} inputMode="decimal" type="number" value={metrics[metric.key] || ""} onChange={(event) => setMetric(metric.key, event.target.value)} placeholder={t.activityLogger.optional} /></label>)}</div><p className="activity-calorie-note">{t.activityLogger.calorieNote}</p><label className="activity-notes">{t.activityLogger.noteLabel}<textarea maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t.activityLogger.notePlaceholder(selectedActivity.name)} /></label><button className="activity-save" disabled={saving} type="submit">{saving ? t.activityLogger.saving : t.activityLogger.addRecord(selectedActivity.name)}</button></form>}

    {message && <p className="activity-logger-message" role="status">{message}</p>}

    <div className="activity-history"><div className="activity-history-head"><div><span>{t.activityLogger.dailySummariesLabel}</span><strong>{t.activityLogger.historyTitle}</strong></div><small>{t.activityLogger.lastRecords(history.length)}</small></div>{historyLoading ? <p className="activity-history-empty">{t.activityLogger.loadingHistory}</p> : history.length === 0 ? <p className="activity-history-empty">{t.activityLogger.emptyHistory}</p> : <><div className="activity-chart-card"><div className="activity-chart-head"><div><span>{t.activityLogger.chartEyebrow}</span><strong>{t.activityLogger.chartTitle}</strong></div><div className="activity-chart-toggle" role="group" aria-label={t.activityLogger.chartMetricLabel}>{(["durationMinutes", "estimatedCalories"] as ActivityMetric[]).map((option) => <button type="button" key={option} aria-pressed={chartMetric === option} className={chartMetric === option ? "active" : ""} onClick={() => setChartMetric(option)}>{option === "durationMinutes" ? t.activityLogger.chartMetricDuration : t.activityLogger.chartMetricCalories}</button>)}</div></div><ActivityChart summaries={dailySummaries} metric={chartMetric} locale={dateLocale} emptyLabel={t.activityLogger.chartEmpty} unitLabel={chartMetric === "durationMinutes" ? t.activityLogger.chartUnitMinutes : "kcal"} /></div><div className="activity-daily-summaries">{dailySummaries.slice(0, 3).map((summary) => <article key={summary.localDate}><span>{formatActivityDate(summary.localDate, dateLocale)}</span><strong>{t.activityLogger.durationUnit(summary.durationMinutes)}</strong><small>{t.activityLogger.activityCount(summary.activityCount)} · {summary.estimatedCalories} kcal{summary.distanceKm ? ` · ${summary.distanceKm.toFixed(1)} km` : ""}{summary.steps ? ` · ${t.activityLogger.stepsUnit(summary.steps)}` : ""}</small></article>)}</div><div className="activity-history-list">{history.slice(0, 8).map((entry) => <article key={entry.id}><span className="activity-history-icon"><ActivityIcon name={entry.activityKey} /></span><div><strong>{entry.activityName}</strong><small>{formatActivityDate(entry.localDate, dateLocale)} · {t.activityLogger.durationUnit(entry.durationMinutes)}{entry.distanceKm ? ` · ${entry.distanceKm} km` : ""}</small>{entry.notes && <p>{entry.notes}</p>}</div><b>{entry.estimatedCalories ? `${entry.estimatedCalories} kcal` : entry.steps ? t.activityLogger.stepsUnit(entry.steps) : translateIntensity(t, entry.intensity)}</b></article>)}</div></>}</div>
  </section>;
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { localDateKey } from "@/lib/streak";
import { isoWeekday } from "@/lib/workout-calendar";
import { readStoredStepGoal } from "@/lib/step-counter";
import { createActivityRepository } from "@/lib/activity-service";
import { DEFAULT_OUTDOOR_GOAL_MINUTES, isOutdoorActivity, summarizeOutdoorWeek } from "@/lib/outdoor";
import { buildDailyTasks, daysBetween, summarizeDailyTasks, type DailyTask } from "@/lib/daily-tasks";
import { useTranslations } from "@/lib/i18n/translate";

/**
 * "BUGÜN" görev listesi.
 *
 * Ana ekran bugüne kadar ÖLÇÜM gösteriyordu, görev değil: kullanıcı kalori
 * çemberine, adım kartına ve program listesine ayrı ayrı bakıp "bugün ne
 * yapmam gerekiyor?" sorusunu kendi kafasında birleştiriyordu.
 *
 * Görevler türetilir, ayrı bir tabloda tutulmaz (bkz. lib/daily-tasks.ts) —
 * hepsi zaten kaydedilen veriden çıkar. Bu yüzden bileşen kendi verisini
 * çeker; OutdoorGoalCard ile aynı kalıp.
 */
export function DailyTasksCard({ userId, onOpenTask }: { userId: string; onOpenTask: (task: DailyTask["id"]) => void }) {
  const t = useTranslations();
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Yükleme efektin İÇİNDE tanımlı (OutdoorGoalCard ile aynı kalıp): dışarıda
  // tanımlanıp efektten çağrıldığında React, senkron setState'i "efekt
  // gövdesinde durum güncellemesi" olarak işaretliyor.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const client = createClient();
      if (!client) { setLoaded(true); return; }
      const today = localDateKey();
      try {
        const [preferences, sessions, steps, measurement, activities] = await Promise.all([
          client.from("reminder_preferences").select("workout_days").eq("user_id", userId).maybeSingle(),
          client.from("workout_sessions").select("completed_at").eq("user_id", userId).gte("completed_at", `${today}T00:00:00`),
          client.from("daily_steps").select("steps").eq("user_id", userId).eq("local_date", today).maybeSingle(),
          client.from("body_measurements").select("measured_at").eq("user_id", userId).order("measured_at", { ascending: false }).limit(1).maybeSingle(),
          createActivityRepository(client, userId).list(120).catch(() => []),
        ]);

        const workoutDays = Array.isArray(preferences.data?.workout_days) ? preferences.data.workout_days.map(Number) : [];
        const week = summarizeOutdoorWeek(activities, { goalMinutes: DEFAULT_OUTDOOR_GOAL_MINUTES });
        const outdoorMinutes = activities
          .filter((entry) => entry.localDate === today && isOutdoorActivity(entry))
          .reduce((total, entry) => total + (Number(entry.durationMinutes) || 0), 0);
        const lastMeasured = typeof measurement.data?.measured_at === "string" ? measurement.data.measured_at.slice(0, 10) : null;

        if (cancelled) return;
        setTasks(buildDailyTasks({
          // Takvim tercihi hiç kaydedilmemişse antrenman görevi çıkarılmaz:
          // olmayan bir plandan görev üretmek yanlış bilgi olurdu.
          isWorkoutDay: workoutDays.includes(isoWeekday(today)),
          workoutDone: (sessions.data || []).length > 0,
          steps: Number(steps.data?.steps) || 0,
          stepGoal: readStoredStepGoal(),
          outdoorMinutes,
          outdoorGoalMet: week.minutes >= week.goalMinutes,
          daysSinceWeighIn: lastMeasured ? daysBetween(lastMeasured, today) : null,
        }));
      } catch {
        // Görev listesi ikincil bir özet: okunamazsa kart sessizce gizlenir,
        // ana ekranın geri kalanı çalışmaya devam eder.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    void load();
    function reload() { void load(); }
    // Antrenman, aktivite ve ölçüm kaydı görevleri doğrudan etkiler.
    window.addEventListener("fit-ai-activity-recorded", reload);
    window.addEventListener("fit-ai-progress-reset", reload);
    return () => {
      cancelled = true;
      window.removeEventListener("fit-ai-activity-recorded", reload);
      window.removeEventListener("fit-ai-progress-reset", reload);
    };
  }, [userId]);

  const progress = useMemo(() => summarizeDailyTasks(tasks), [tasks]);
  const label = useCallback((task: DailyTask) => {
    switch (task.id) {
      case "workout": return t.dailyTasks.workout;
      case "steps": return t.dailyTasks.steps(task.target ?? 0);
      case "outdoor": return t.dailyTasks.outdoor;
      case "weighIn": return t.dailyTasks.weighIn;
      default: return "";
    }
  }, [t]);

  if (!loaded || !tasks.length) return null;

  return <section className="daily-tasks" aria-labelledby="daily-tasks-title">
    <div className="daily-tasks-head">
      <div className="eyebrow" id="daily-tasks-title">{t.dailyTasks.eyebrow}</div>
      <span className="daily-tasks-count">{t.dailyTasks.progress(progress.done, progress.total)}</span>
    </div>
    <ul className="daily-tasks-list">
      {tasks.map((task) => (
        <li key={task.id}>
          <button type="button" className={task.done ? "daily-task done" : "daily-task"} onClick={() => onOpenTask(task.id)}>
            <span className="daily-task-box" aria-hidden="true">{task.done && <Check size={11} />}</span>
            <span>{label(task)}</span>
            {task.id === "steps" && task.current !== undefined && <b>{task.current.toLocaleString("tr-TR")}</b>}
          </button>
        </li>
      ))}
    </ul>
  </section>;
}

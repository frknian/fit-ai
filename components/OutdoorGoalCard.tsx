"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createActivityRepository, type ActivityEntry } from "@/lib/activity-service";
import { DEFAULT_OUTDOOR_GOAL_MINUTES, outdoorBadge, outdoorWeeklyStreak, summarizeOutdoorWeek } from "@/lib/outdoor";
import { ActivityIcon } from "@/components/ActivityIcon";
import { useTranslations } from "@/lib/i18n/translate";

/**
 * "Bu hafta doğada" kartı — ana sayfada durur.
 *
 * Uygulama açık hava sporunu hiç ölçmüyordu. Bu kart haftalık açık hava
 * süresini gösterir, hedefe kalanı söyler ve tek dokunuşla Hedefit Rota'yı
 * başlatır. Hangi aktivitenin "açık hava" sayıldığı lib/outdoor.ts'te,
 * gerekçesiyle birlikte tanımlıdır.
 *
 * Rozet haftalık kazanılır, toplamdan değil: amaç biriktirmek değil, her
 * hafta dışarı çıkma alışkanlığını sürdürmek.
 */
export function OutdoorGoalCard({ userId, onStartRoute }: { userId: string; onStartRoute: () => void }) {
  const t = useTranslations();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const client = createClient();
      if (!client) { setLoaded(true); return; }
      try {
        // Seri hesabı için birkaç haftalık kayıt gerekir; 120 satır bunun
        // fazlasıyla üzerinde ve tek istekte gelir.
        const list = await createActivityRepository(client, userId).list(120);
        if (!cancelled) setEntries(list);
      } catch {
        // Kayıt okunamazsa kart hedefi sıfır ilerlemeyle gösterir.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    void load();
    function reload() { void load(); }
    window.addEventListener("fit-ai-activity-recorded", reload);
    window.addEventListener("fit-ai-progress-reset", reload);
    return () => {
      cancelled = true;
      window.removeEventListener("fit-ai-activity-recorded", reload);
      window.removeEventListener("fit-ai-progress-reset", reload);
    };
  }, [userId]);

  const week = useMemo(() => summarizeOutdoorWeek(entries, { goalMinutes: DEFAULT_OUTDOOR_GOAL_MINUTES }), [entries]);
  const badge = outdoorBadge(week);
  const streak = useMemo(() => outdoorWeeklyStreak(entries), [entries]);

  return <section className="outdoor-card" aria-labelledby="outdoor-card-title">
    <div className="outdoor-card-head">
      <div>
        <div className="eyebrow">{t.outdoor.eyebrow}</div>
        <h3 id="outdoor-card-title">{t.outdoor.title}</h3>
      </div>
      <span className="outdoor-badge" data-badge={badge}>{t.outdoor.badges[badge]}</span>
    </div>

    <p className="outdoor-card-copy">
      {!loaded ? t.outdoor.loading
        : week.minutes >= week.goalMinutes ? t.outdoor.goalReached(week.minutes)
        : week.minutes > 0 ? t.outdoor.inProgress(week.minutes, week.remainingMinutes)
        : t.outdoor.notStarted(week.goalMinutes)}
    </p>

    <div className="outdoor-progress" role="img" aria-label={t.outdoor.progressLabel(week.minutes, week.goalMinutes)}>
      <span style={{ width: `${week.percent}%` }} />
    </div>
    <div className="outdoor-meta">
      <span>{t.outdoor.minutesOfGoal(week.minutes, week.goalMinutes)}</span>
      <span>{t.outdoor.daysOutside(week.days)}</span>
      {streak > 0 && <span>{t.outdoor.weeklyStreak(streak)}</span>}
    </div>

    <button type="button" className="outdoor-start" onClick={onStartRoute}>
      <ActivityIcon name="hiking" />
      <span>{t.outdoor.startAction}</span>
    </button>
  </section>;
}

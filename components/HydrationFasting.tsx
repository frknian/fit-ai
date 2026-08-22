"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { localDateKey } from "@/lib/streak";
import { dailyWaterGoalMl, fastingState, formatDuration, waterProgressPercent } from "@/lib/hydration-fasting";
import { useTranslations } from "@/lib/i18n/translate";
import { useLocale } from "@/lib/i18n/locale";

const QUICK_AMOUNTS = [200, 330, 500];
const TARGET_OPTIONS = [12, 14, 16, 18, 20];

type OpenFast = { id: string; startedAt: string; targetHours: number };

// db/migrations/20260729_hydration_fasting.sql uygulanmadıysa tablolar yoktur.
// Bu bir kullanıcı hatası değil, eksik bir kurulum adımıdır; kart kendini
// sessizce gizler yerine durumu söyler ve uygulamanın kalanını etkilemez.
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

export function HydrationFasting({ userId, weightKg, compact = false, onOpen }: {
  userId?: string;
  weightKg?: number | null;
  /**
   * Ana ekrandaki MİNİ kart: yalnız su ilerlemesi, oruç bölümü yok. Kartın
   * kendisi dokununca tam ekrana götürür — hızlı ekleme düğmeleri burada
   * durmaz, ikinci bir tıklama gerektirmesi bilinçli: ana ekranda yanlışlıkla
   * su eklemek istemiyoruz.
   */
  compact?: boolean;
  onOpen?: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [waterMl, setWaterMl] = useState(0);
  const [openFast, setOpenFast] = useState<OpenFast | null>(null);
  const [targetHours, setTargetHours] = useState(16);
  const [unavailable, setUnavailable] = useState(false);
  // Sayaç saniyede bir tazelensin diye; sunucuya gidilmez, süre istemcide hesaplanır.
  const [now, setNow] = useState(() => new Date());

  const today = localDateKey();
  const goalMl = dailyWaterGoalMl(weightKg);

  useEffect(() => {
    if (!openFast) return;
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [openFast]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    if (!supabase) return;
    let cancelled = false;
    void (async () => {
      const [waterResult, fastResult] = await Promise.all([
        supabase.from("water_logs").select("milliliters").eq("user_id", userId).eq("local_date", today).maybeSingle(),
        supabase.from("fasting_sessions").select("id, started_at, target_hours").eq("user_id", userId).is("ended_at", null).maybeSingle(),
      ]);
      if (cancelled) return;
      const failure = waterResult.error || fastResult.error;
      if (failure && MISSING_TABLE_CODES.has(failure.code || "")) { setUnavailable(true); return; }
      setWaterMl(Number(waterResult.data?.milliliters) || 0);
      const row = fastResult.data;
      setOpenFast(row ? { id: String(row.id), startedAt: String(row.started_at), targetHours: Number(row.target_hours) || 16 } : null);
    })();
    return () => { cancelled = true; };
  }, [today, userId]);

  async function changeWater(deltaMl: number) {
    const next = Math.max(0, waterMl + deltaMl);
    setWaterMl(next);
    if (!userId) return;
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("water_logs")
      .upsert({ user_id: userId, local_date: today, milliliters: next, updated_at: new Date().toISOString() }, { onConflict: "user_id,local_date" });
    if (error && MISSING_TABLE_CODES.has(error.code || "")) setUnavailable(true);
  }

  async function toggleFast() {
    if (!userId) return;
    const supabase = createClient();
    if (!supabase) return;
    if (openFast) {
      setOpenFast(null);
      await supabase.from("fasting_sessions").update({ ended_at: new Date().toISOString() }).eq("id", openFast.id).eq("user_id", userId);
      return;
    }
    const startedAt = new Date().toISOString();
    const { data, error } = await supabase.from("fasting_sessions")
      .insert({ user_id: userId, started_at: startedAt, target_hours: targetHours }).select("id").single();
    if (error) {
      if (MISSING_TABLE_CODES.has(error.code || "")) setUnavailable(true);
      return;
    }
    setOpenFast({ id: String(data.id), startedAt, targetHours });
    setNow(new Date());
  }

  if (unavailable) {
    return compact ? null : <section className="hydration-card" id="hydration-card"><p className="hydration-note">{t.hydration.notConfigured}</p></section>;
  }

  const percent = waterProgressPercent(waterMl, goalMl);
  const fast = openFast ? fastingState({ startedAt: openFast.startedAt, targetHours: openFast.targetHours }, now) : null;

  if (compact) {
    return <button type="button" className="hydration-mini" onClick={onOpen} aria-label={t.hydration.waterEyebrow}>
      <div className="hydration-mini-head"><span className="eyebrow">{t.hydration.waterEyebrow}</span><strong>{t.hydration.waterAmount(waterMl, goalMl)}</strong></div>
      <div className="hydration-bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${percent}%` }} /></div>
    </button>;
  }

  return <section className="hydration-card">
    <div className="hydration-water">
      <div className="hydration-head"><div className="eyebrow">{t.hydration.waterEyebrow}</div><strong>{t.hydration.waterAmount(waterMl, goalMl)}</strong></div>
      <div className="hydration-bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${percent}%` }} /></div>
      <div className="hydration-actions">
        {QUICK_AMOUNTS.map((amount) => <button type="button" key={amount} onClick={() => void changeWater(amount)}>{t.hydration.addAmount(amount)}</button>)}
        {waterMl > 0 && <button type="button" className="hydration-undo" onClick={() => void changeWater(-QUICK_AMOUNTS[0])}>{t.hydration.undo}</button>}
      </div>
      {percent >= 100 && <p className="hydration-note hydration-done">{t.hydration.waterDone}</p>}
    </div>

    <div className="hydration-fasting">
      <div className="hydration-head"><div className="eyebrow">{t.hydration.fastingEyebrow}</div>
        {fast && <strong>{t.hydration.fastingElapsed(formatDuration(fast.elapsedMinutes, locale === "en" ? "en" : "tr"))}</strong>}
      </div>
      {fast ? <>
        <div className="hydration-bar" role="progressbar" aria-valuenow={fast.percent} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${fast.percent}%` }} /></div>
        <p className="hydration-note">{fast.complete ? t.hydration.fastingComplete : t.hydration.fastingRemaining(formatDuration(fast.remainingMinutes, locale === "en" ? "en" : "tr"))}</p>
      </> : <>
        <p className="hydration-note">{t.hydration.fastingIdle}</p>
        <div className="hydration-targets" role="group" aria-label={t.hydration.targetLabel}>
          {TARGET_OPTIONS.map((hours) => <button type="button" key={hours} aria-pressed={hours === targetHours} className={hours === targetHours ? "active" : ""} onClick={() => setTargetHours(hours)}>{hours}s</button>)}
        </div>
      </>}
      <button type="button" className="hydration-toggle" onClick={() => void toggleFast()}>{openFast ? t.hydration.fastingStop : t.hydration.fastingStart}</button>
    </div>
  </section>;
}

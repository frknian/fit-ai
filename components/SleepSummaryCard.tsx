"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createSleepRepository, formatSleepDuration, summarizeSleep, type SleepEntry } from "@/lib/sleep-log";
import { useTranslations } from "@/lib/i18n/translate";
import { useLocale } from "@/lib/i18n/locale";

/**
 * Ana ekrandaki uyku MİNİ kartı.
 *
 * Tam kayıt formu (components/SleepLogger.tsx) Aktivite sekmesinde kalır;
 * burada yalnız son gecenin süresi ve son yedi gecenin ortalaması görünür.
 * Dokununca Aktivite'ye götürür — su kartıyla aynı desen: ana ekranda yanlışlıkla
 * veri girmeyi önlemek için tek dokunuş kayıt açmaz, yalnız gezinir.
 */
export function SleepSummaryCard({ userId, onOpen }: { userId: string; onOpen: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const [entries, setEntries] = useState<SleepEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Yükleme efektin İÇİNDE tanımlı (OutdoorGoalCard/DailyTasksCard ile aynı
  // kalıp): dışarıda tanımlanıp efektten çağrıldığında React, senkron
  // setState'i "efekt gövdesinde durum güncellemesi" olarak işaretliyor.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const client = createClient();
      if (!client) { setLoaded(true); return; }
      try {
        const list = await createSleepRepository(client, userId).list(7);
        if (!cancelled) setEntries(list);
      } catch {
        // Tablo henüz kurulmamışsa (migration çalıştırılmadıysa) kart
        // sessizce gizlenir; ana ekranın geri kalanı etkilenmez.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [userId]);

  const summary = summarizeSleep(entries);
  // DailyTasksCard ile aynı desen: yüklenene kadar ya da kayıt yoksa hiç çizilmez.
  if (!loaded || !summary.nights) return null;

  return <button type="button" className="sleep-mini" onClick={onOpen} aria-label={t.sleep.eyebrow}>
    <div className="sleep-mini-head"><span className="eyebrow">{t.sleep.eyebrow}</span>
      <strong>{summary.lastEntry ? formatSleepDuration(summary.lastEntry.minutes, locale) : "—"}</strong>
    </div>
    <small>{summary.nights ? t.sleep.nightsCount(summary.nights) : t.sleep.empty}</small>
  </button>;
}

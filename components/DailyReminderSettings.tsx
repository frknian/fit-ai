"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { setStoredDailyReminder, useStoredDailyReminder } from "@/lib/preferences";
import { DAILY_REMINDER_HOURS, normalizeDailyReminder, planDailyReminders, type DailyReminderPreferences } from "@/lib/daily-reminders";
import { isNativeApp, mobileNotificationPermission, requestMobileNotificationPermission, scheduleDailyReminders } from "@/lib/mobile";
import { useTranslations } from "@/lib/i18n/translate";

/**
 * "Her sabah hatırlat" ayarı.
 *
 * Uygulamada tek bildirim antrenman saatinden önce gelendi; antrenman
 * olmayan günlerde hiç ses çıkmıyordu. Bu ayar her sabah bir selam gönderir
 * ve o güne göre metni değiştirir: antrenman günüyse hatırlatır, değilse
 * hareketli kalmayı önerir; isteğe bağlı su ve doğa önerileri ekler.
 *
 * TASARIM KURALI: satır, ayarlar sayfasındaki diğer tercih satırlarıyla
 * (`profile-preferences` + `segmented`) aynı yapıdadır.
 *
 * Bildirimler cihaza kurulur, dolayısıyla YALNIZ mobil uygulamada anlamlıdır;
 * tarayıcıda satır hiç gösterilmez.
 */
export function DailyReminderSettings() {
  const t = useTranslations();
  const [native] = useState(() => typeof window !== "undefined" && isNativeApp());
  const stored = useStoredDailyReminder();
  const preferences = useMemo(() => normalizeDailyReminder(stored), [stored]);
  const [workoutDays, setWorkoutDays] = useState<number[]>([]);
  const [note, setNote] = useState("");

  // Antrenman günleri takvim tercihlerinden gelir: bildirimin "bugün
  // antrenman günün" demesi ancak gerçekten planlıysa doğru olur.
  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    void (async () => {
      const client = createClient();
      if (!client) return;
      const { data: { user } } = await client.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await client.from("reminder_preferences").select("workout_days").eq("user_id", user.id).maybeSingle();
      if (cancelled) return;
      setWorkoutDays(Array.isArray(data?.workout_days) ? data.workout_days.map(Number) : []);
    })();
    return () => { cancelled = true; };
  }, [native]);

  const labels = useMemo(() => ({
    greeting: t.dailyReminder.greeting,
    workoutDay: t.dailyReminder.workoutDayBody,
    restDay: t.dailyReminder.restDayBody,
    hydrationTips: t.dailyReminder.hydrationTips,
    natureTips: t.dailyReminder.natureTips,
  }), [t]);

  // Tercih ya da antrenman günleri değişince plan yeniden kurulur. Kurulum
  // idempotenttir: önce bu uygulamanın eski günlük bildirimleri iptal edilir.
  useEffect(() => {
    if (!native) return;
    void scheduleDailyReminders(planDailyReminders({ preferences, workoutDays, labels })).catch(() => undefined);
  }, [native, preferences, workoutDays, labels]);

  if (!native) return null;

  async function apply(patch: Partial<DailyReminderPreferences>) {
    const next = { ...preferences, ...patch };
    // Açılırken izin sorulur: izin yoksa kurulan bildirim sessizce kaybolur ve
    // kullanıcı "açtım ama gelmiyor" durumunda kalırdı.
    if (patch.enabled === true) {
      const current = await mobileNotificationPermission();
      const permission = current === "granted" ? current : await requestMobileNotificationPermission();
      if (permission !== "granted") {
        setNote(t.dailyReminder.permissionNeeded);
        return;
      }
    }
    setNote("");
    setStoredDailyReminder(next);
  }

  return <>
    <div className="profile-preferences daily-reminder-zone">
      <div>
        <span>{t.dailyReminder.eyebrow}</span>
        <strong>{t.dailyReminder.title}</strong>
        <small>{preferences.enabled ? t.dailyReminder.bodyOn(`${String(preferences.hour).padStart(2, "0")}:${String(preferences.minute).padStart(2, "0")}`) : t.dailyReminder.bodyOff}</small>
      </div>
      <div className="segmented">
        <button type="button" aria-pressed={preferences.enabled} className={preferences.enabled ? "selected" : ""} onClick={() => void apply({ enabled: true })}>{t.dailyReminder.on}</button>
        <button type="button" aria-pressed={!preferences.enabled} className={preferences.enabled ? "" : "selected"} onClick={() => void apply({ enabled: false })}>{t.dailyReminder.off}</button>
      </div>
    </div>

    {preferences.enabled && <div className="daily-reminder-detail">
      <label>{t.dailyReminder.timeLabel}
        <select value={`${preferences.hour}:${preferences.minute}`} onChange={(event) => {
          const [hour, minute] = event.target.value.split(":").map(Number);
          void apply({ hour, minute });
        }}>
          {DAILY_REMINDER_HOURS.flatMap((hour) => [0, 30].map((minute) => (
            <option key={`${hour}:${minute}`} value={`${hour}:${minute}`}>{String(hour).padStart(2, "0")}:{String(minute).padStart(2, "0")}</option>
          )))}
        </select>
      </label>
      <div className="daily-reminder-toggles">
        <button type="button" aria-pressed={preferences.hydration} className={preferences.hydration ? "answer selected" : "answer"} onClick={() => void apply({ hydration: !preferences.hydration })}>{t.dailyReminder.hydrationToggle}</button>
        <button type="button" aria-pressed={preferences.nature} className={preferences.nature ? "answer selected" : "answer"} onClick={() => void apply({ nature: !preferences.nature })}>{t.dailyReminder.natureToggle}</button>
      </div>
      <p className="set-autosave-hint">{t.dailyReminder.preview(workoutDays.length ? t.dailyReminder.workoutDayBody : t.dailyReminder.restDayBody)}</p>
    </div>}

    {note && <p className="profile-save-message" role="status">{note}</p>}
  </>;
}

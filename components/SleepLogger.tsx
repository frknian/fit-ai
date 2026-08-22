"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Moon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { localDateKey } from "@/lib/streak";
import {
  SLEEP_MINUTES,
  SLEEP_TARGET_MINUTES,
  createSleepRepository,
  formatSleepDuration,
  isValidSleepMinutes,
  minutesBetween,
  sleepQualityOptions,
  summarizeSleep,
  type SleepEntry,
  type SleepQuality,
} from "@/lib/sleep-log";
import { useTranslations } from "@/lib/i18n/translate";
import { useLocale } from "@/lib/i18n/locale";

/**
 * Manuel uyku kaydı.
 *
 * Uyku, yükü artırma kararında antrenman geçmişi kadar belirleyici; uygulama
 * bunu yalnızca profil testindeki tek bir soru olarak biliyordu. Kayıt
 * aktivite sekmesinde durur: kullanıcının "dün ne yaptım" diye baktığı yer.
 *
 * Süre İKİ yoldan girilebilir — doğrudan saat/dakika ya da yatış-kalkış
 * saatinden hesaplatarak. İkincisi gece yarısını aşan uykuyu da doğru çözer
 * (bkz. lib/sleep-log.ts → minutesBetween).
 */
export function SleepLogger({ userId }: { userId: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const dateLocale = locale === "en" ? "en-US" : "tr-TR";
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<SleepEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [date, setDate] = useState(() => localDateKey());
  const [hours, setHours] = useState("7");
  const [minutes, setMinutes] = useState("30");
  const [bedTime, setBedTime] = useState("");
  const [wakeTime, setWakeTime] = useState("");
  const [quality, setQuality] = useState<SleepQuality>("orta");
  const [note, setNote] = useState("");

  const summary = useMemo(() => summarizeSleep(entries), [entries]);
  const totalMinutes = (Number(hours) || 0) * 60 + (Number(minutes) || 0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const client = createClient();
      if (!client) { setLoading(false); return; }
      try {
        const list = await createSleepRepository(client, userId).list();
        if (!cancelled) setEntries(list);
      } catch {
        // Tablo henüz kurulmamışsa (migration çalıştırılmadıysa) kart boş
        // görünür; kayıt denemesi kullanıcıya açık bir hata verir.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [userId]);

  /**
   * Yatış/kalkış saati girildiği anda süreyi doldurur; kullanıcı aynı bilgiyi
   * iki kez yazmaz. Efektle değil doğrudan olay içinde: türetilmiş değeri
   * efektle senkronlamak fazladan bir render turu ve "hangisi kazanır"
   * belirsizliği demekti — burada son yazan alan kazanır.
   */
  function applyTimes(nextBedTime: string, nextWakeTime: string) {
    setBedTime(nextBedTime);
    setWakeTime(nextWakeTime);
    if (!nextBedTime || !nextWakeTime) return;
    const computed = minutesBetween(nextBedTime, nextWakeTime);
    if (computed === null) return;
    setHours(String(Math.floor(computed / 60)));
    setMinutes(String(computed % 60));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidSleepMinutes(totalMinutes)) { setMessage(t.sleep.invalidDuration); return; }
    const client = createClient();
    if (!client) { setMessage(t.sleep.saveFailed); return; }
    setSaving(true);
    setMessage("");
    try {
      const repository = createSleepRepository(client, userId);
      await repository.save({ localDate: date, minutes: totalMinutes, quality, bedTime: bedTime || null, wakeTime: wakeTime || null, note });
      setEntries(await repository.list());
      setMessage(t.sleep.saved);
      setNote("");
    } catch {
      setMessage(t.sleep.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  function formatDate(value: string) {
    return new Intl.DateTimeFormat(dateLocale, { day: "numeric", month: "short", weekday: "short" }).format(new Date(`${value}T12:00:00`));
  }

  return <section className="sleep-logger" aria-labelledby="sleep-logger-title">
    <div className="activity-logger-head">
      <div>
        <div className="eyebrow">{t.sleep.eyebrow}</div>
        <h2 id="sleep-logger-title">{t.sleep.title}</h2>
        <p>{t.sleep.body}</p>
      </div>
      <span className="sleep-logger-icon" aria-hidden="true"><Moon size={20} /></span>
    </div>

    {/* Özet: son yedi gecenin ortalaması ve kaçının 7–9 saat aralığında
        kaldığı. Ortalama yalnız KAYITLI geceler üzerinden alınır. */}
    <div className="sleep-summary">
      <div><span>{t.sleep.averageLabel}</span><strong>{summary.nights ? formatSleepDuration(summary.averageMinutes, locale) : "—"}</strong><small>{t.sleep.nightsCount(summary.nights)}</small></div>
      <div><span>{t.sleep.inRangeLabel}</span><strong>{summary.nights ? `${summary.nightsInRange}/${summary.nights}` : "—"}</strong><small>{t.sleep.rangeHint(SLEEP_TARGET_MINUTES.low / 60, SLEEP_TARGET_MINUTES.high / 60)}</small></div>
      <div><span>{t.sleep.lastNightLabel}</span><strong>{summary.lastEntry ? formatSleepDuration(summary.lastEntry.minutes, locale) : "—"}</strong><small>{summary.lastEntry ? formatDate(summary.lastEntry.localDate) : t.sleep.noRecord}</small></div>
    </div>

    <button type="button" className="sleep-toggle" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      {open ? t.sleep.closeForm : t.sleep.openForm}
    </button>

    {open && <form className="activity-form sleep-form" onSubmit={save}>
      <div className="activity-form-grid sleep-form-grid">
        <label>{t.sleep.dateLabel}
          <input type="date" required max={localDateKey()} value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label>{t.sleep.hoursLabel}
          <input type="number" inputMode="numeric" min="0" max="24" value={hours} onChange={(event) => setHours(event.target.value)} />
        </label>
        <label>{t.sleep.minutesLabel}
          <input type="number" inputMode="numeric" min="0" max="59" step={SLEEP_MINUTES.step} value={minutes} onChange={(event) => setMinutes(event.target.value)} />
        </label>
        <label>{t.sleep.bedTimeLabel} <small>{t.sleep.optional}</small>
          <input type="time" value={bedTime} onChange={(event) => applyTimes(event.target.value, wakeTime)} />
        </label>
        <label>{t.sleep.wakeTimeLabel} <small>{t.sleep.optional}</small>
          <input type="time" value={wakeTime} onChange={(event) => applyTimes(bedTime, event.target.value)} />
        </label>
        <div className="activity-intensity-field">
          <span>{t.sleep.qualityLabel}</span>
          <div className="segmented intensity-segmented" role="group" aria-label={t.sleep.qualityLabel}>
            {sleepQualityOptions.map((option) => (
              <button type="button" key={option} aria-pressed={quality === option} className={quality === option ? "selected" : ""} onClick={() => setQuality(option)}>{t.sleep.quality[option]}</button>
            ))}
          </div>
        </div>
      </div>
      <p className="activity-calorie-note">{t.sleep.durationPreview(formatSleepDuration(totalMinutes, locale))}</p>
      <label className="activity-notes">{t.sleep.noteLabel}
        <textarea maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t.sleep.notePlaceholder} />
      </label>
      <button className="activity-save" type="submit" disabled={saving}>{saving ? t.sleep.saving : t.sleep.save}</button>
      {message && <p className="activity-logger-message" role="status">{message}</p>}
    </form>}

    <div className="activity-history-list sleep-history">
      {loading && <p className="activity-history-empty">{t.sleep.loading}</p>}
      {!loading && !entries.length && <p className="activity-history-empty">{t.sleep.empty}</p>}
      {!loading && entries.slice(0, 7).map((entry) => (
        <article key={entry.id}>
          <span className="activity-history-icon"><Moon size={16} /></span>
          <div>
            <strong>{formatSleepDuration(entry.minutes, locale)}</strong>
            <small>{formatDate(entry.localDate)} · {t.sleep.quality[entry.quality]}{entry.bedTime && entry.wakeTime ? ` · ${entry.bedTime}–${entry.wakeTime}` : ""}</small>
            {entry.note && <p>{entry.note}</p>}
          </div>
        </article>
      ))}
    </div>
  </section>;
}

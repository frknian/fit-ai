// Manuel uyku kaydı.
//
// Hesaplar burada SAF fonksiyon olarak durur (tarayıcı olmadan test
// edilebilir); Supabase erişimi createSleepRepository ile ayrılmıştır —
// lib/activity-service.ts ile aynı kalıp.

import type { SupabaseClient } from "@supabase/supabase-js";

export const sleepQualityOptions = ["kotu", "orta", "iyi"] as const;
export type SleepQuality = (typeof sleepQualityOptions)[number];

export type SleepEntry = {
  id: string;
  /** Uyanılan gün. Gece yarısını aşan uyku tek bir güne yazılsın diye. */
  localDate: string;
  minutes: number;
  quality: SleepQuality;
  bedTime: string | null;
  wakeTime: string | null;
  note: string | null;
};

export type SleepDraft = {
  localDate: string;
  minutes: number;
  quality: SleepQuality;
  bedTime?: string | null;
  wakeTime?: string | null;
  note?: string | null;
};

export const SLEEP_MINUTES = { min: 15, max: 1440, step: 15 } as const;

/** Yaygın öneri aralığı; hedef değil, "yeterli mi" değerlendirmesi için eşik. */
export const SLEEP_TARGET_MINUTES = { low: 7 * 60, high: 9 * 60 } as const;

export function clampSleepMinutes(value: unknown): number {
  const minutes = Math.round(Number(value) || 0);
  if (!Number.isFinite(minutes)) return 0;
  return Math.min(SLEEP_MINUTES.max, Math.max(0, minutes));
}

export function isValidSleepMinutes(value: unknown): boolean {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= SLEEP_MINUTES.min && minutes <= SLEEP_MINUTES.max;
}

/**
 * Yatış ve kalkış saatinden uyku süresi. Gece yarısını geçen uyku (23:30 →
 * 07:00) negatif fark verir; bu durumda bir gün eklenir.
 */
export function minutesBetween(bedTime: string, wakeTime: string): number | null {
  const parse = (value: string) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
  };
  const bed = parse(bedTime);
  const wake = parse(wakeTime);
  if (bed === null || wake === null) return null;
  // Aynı saat girildiyse (23:00 → 23:00) fark sıfırdır. Bir gün eklemek bunu
  // "24 saat uyudu"ya çevirirdi; bu bir uyku değil, girdi hatasıdır.
  if (wake === bed) return null;
  const diff = wake - bed;
  const minutes = diff > 0 ? diff : diff + 24 * 60;
  return minutes > 0 && minutes <= SLEEP_MINUTES.max ? minutes : null;
}

/** "7s 30dk" biçimi; tam saatlerde dakika hanesi yazılmaz. */
export function formatSleepDuration(minutes: number, locale: "tr" | "en" = "tr"): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  const hourUnit = locale === "en" ? "h" : "s";
  const minuteUnit = locale === "en" ? "m" : "dk";
  if (!hours) return `${rest}${minuteUnit}`;
  return rest ? `${hours}${hourUnit} ${rest}${minuteUnit}` : `${hours}${hourUnit}`;
}

export type SleepSummary = {
  /** Kayıtlı gün sayısı. Ortalama bunun üzerinden hesaplanır. */
  nights: number;
  averageMinutes: number;
  /** Öneri aralığının (7–9 saat) içinde kalan gece sayısı. */
  nightsInRange: number;
  lastEntry: SleepEntry | null;
};

/**
 * Son gecelerin özeti.
 *
 * Ortalama YALNIZ kayıtlı geceler üzerinden alınır: kaydedilmemiş gün "0
 * saat uyudu" demek değildir ve ortalamayı olduğundan kötü gösterirdi.
 */
export function summarizeSleep(entries: SleepEntry[], nights = 7): SleepSummary {
  const recent = entries.slice().sort((a, b) => b.localDate.localeCompare(a.localDate)).slice(0, nights);
  if (!recent.length) return { nights: 0, averageMinutes: 0, nightsInRange: 0, lastEntry: null };
  const total = recent.reduce((sum, entry) => sum + entry.minutes, 0);
  return {
    nights: recent.length,
    averageMinutes: Math.round(total / recent.length),
    nightsInRange: recent.filter((entry) => entry.minutes >= SLEEP_TARGET_MINUTES.low && entry.minutes <= SLEEP_TARGET_MINUTES.high).length,
    lastEntry: recent[0],
  };
}

function fromRow(row: Record<string, unknown>): SleepEntry {
  const quality = String(row.quality || "orta");
  return {
    id: String(row.id),
    localDate: String(row.local_date),
    minutes: Number(row.minutes) || 0,
    quality: sleepQualityOptions.includes(quality as SleepQuality) ? quality as SleepQuality : "orta",
    bedTime: typeof row.bed_time === "string" ? row.bed_time.slice(0, 5) : null,
    wakeTime: typeof row.wake_time === "string" ? row.wake_time.slice(0, 5) : null,
    note: typeof row.note === "string" ? row.note : null,
  };
}

export function createSleepRepository(client: SupabaseClient, userId: string) {
  return {
    async list(limit = 14): Promise<SleepEntry[]> {
      const { data, error } = await client
        .from("sleep_logs")
        .select("*")
        .eq("user_id", userId)
        .order("local_date", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []).map((row) => fromRow(row as Record<string, unknown>));
    },
    /** Gün başına tek kayıt: aynı gün yeniden girilirse üzerine yazılır. */
    async save(draft: SleepDraft): Promise<void> {
      const { error } = await client.from("sleep_logs").upsert({
        user_id: userId,
        local_date: draft.localDate,
        minutes: clampSleepMinutes(draft.minutes),
        quality: draft.quality,
        bed_time: draft.bedTime || null,
        wake_time: draft.wakeTime || null,
        note: draft.note?.trim() ? draft.note.trim().slice(0, 500) : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,local_date" });
      if (error) throw error;
    },
    async remove(localDate: string): Promise<void> {
      const { error } = await client.from("sleep_logs").delete().eq("user_id", userId).eq("local_date", localDate);
      if (error) throw error;
    },
  };
}

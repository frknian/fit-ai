// Günlük hatırlatmalar: her sabah gönderilen selam + o güne özel öneri.
//
// Uygulamada eskiden yalnız TEK bir bildirim vardı: antrenman saatinden önce
// gelen hatırlatma (bkz. scheduleMobileWorkouts). Antrenman günü olmayan
// günlerde uygulama hiç ses çıkarmıyordu.
//
// Buradaki her şey SAF fonksiyondur: hangi gün ne yazılacağı tarayıcı olmadan
// test edilebilir. Bildirimi işletim sistemine kuran taraf lib/mobile.ts'tir.
//
// Metinler dışarıdan `labels` ile verilir — modül sözlüğe bağlı kalmaz ve
// Türkçe/İngilizce aynı mantığı kullanır.

import { addCalendarDays, isoWeekday, zonedDateTime } from "./workout-calendar.ts";
import { localDateKey, userTimeZone } from "./streak.ts";

export type DailyReminderPreferences = {
  enabled: boolean;
  /** Yerel saat. Sabah selamı olduğu için 5–12 arasına sıkıştırılır. */
  hour: number;
  minute: number;
  /** Su içme önerisi eklensin mi? */
  hydration: boolean;
  /** "Bugün dışarı çık" çağrısı eklensin mi? */
  nature: boolean;
};

export const DAILY_REMINDER_HOURS = [5, 6, 7, 8, 9, 10, 11, 12] as const;

export const DEFAULT_DAILY_REMINDER: DailyReminderPreferences = {
  // Varsayılan KAPALI: kullanıcı istemeden bildirim göndermek, izni kalıcı
  // olarak reddettiren en hızlı yoldur.
  enabled: false,
  hour: 8,
  minute: 0,
  hydration: true,
  nature: true,
};

export function normalizeDailyReminder(raw: unknown): DailyReminderPreferences {
  if (!raw || typeof raw !== "object") return DEFAULT_DAILY_REMINDER;
  const value = raw as Record<string, unknown>;
  const hour = Number(value.hour);
  const minute = Number(value.minute);
  return {
    enabled: value.enabled === true,
    hour: DAILY_REMINDER_HOURS.includes(hour as (typeof DAILY_REMINDER_HOURS)[number]) ? hour : DEFAULT_DAILY_REMINDER.hour,
    minute: minute === 30 ? 30 : 0,
    hydration: value.hydration !== false,
    nature: value.nature !== false,
  };
}

export type DailyReminderLabels = {
  /** Selamlama başlığı, ör. "Günaydın". */
  greeting: string;
  /** Antrenman günü gövdesi. */
  workoutDay: string;
  /** Antrenman olmayan gün gövdesi. */
  restDay: string;
  /** Su önerileri; gün sırasına göre dönüşümlü kullanılır. */
  hydrationTips: string[];
  /** Doğa çağrıları; gün sırasına göre dönüşümlü kullanılır. */
  natureTips: string[];
};

export type DailyReminderPlanEntry = {
  dateKey: string;
  at: Date;
  title: string;
  body: string;
  /** Bu gün antrenman planlı mı? Bildirim metnini bu belirler. */
  workoutDay: boolean;
};

/**
 * Önümüzdeki günler için bildirim planı.
 *
 * Neden tek bir "her gün tekrarla" bildirimi değil: tekrarlayan bildirimin
 * metni sabittir, oysa antrenman günü ile dinlenme günü farklı şey söyler ve
 * öneriler dönüşümlü olmalıdır. Bu yüzden her gün için ayrı bildirim kurulur;
 * uygulama her açıldığında liste yenilenir.
 *
 * Bugünün saati geçtiyse bugün atlanır — geçmişe bildirim kurulmaz.
 */
export function planDailyReminders(input: {
  preferences: DailyReminderPreferences;
  /** ISO hafta günleri (1 = Pazartesi). Profil/takvim tercihinden gelir. */
  workoutDays: number[];
  labels: DailyReminderLabels;
  now?: Date | number;
  timeZone?: string;
  days?: number;
}): DailyReminderPlanEntry[] {
  const { preferences, workoutDays, labels, now = new Date(), timeZone = userTimeZone(), days = 14 } = input;
  if (!preferences.enabled) return [];
  const nowTime = new Date(now).getTime();
  const startDate = localDateKey(now, timeZone);
  const entries: DailyReminderPlanEntry[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const dateKey = addCalendarDays(startDate, offset);
    const at = zonedDateTime(dateKey, `${String(preferences.hour).padStart(2, "0")}:${String(preferences.minute).padStart(2, "0")}`, timeZone);
    if (at.getTime() <= nowTime) continue;
    const workoutDay = workoutDays.includes(isoWeekday(dateKey));
    const lines = [workoutDay ? labels.workoutDay : labels.restDay];
    // Öneriler gün sırasına göre dönüşümlü: aynı cümle her sabah tekrarlanınca
    // bildirim okunmadan kapatılan bir gürültüye dönüşüyor.
    if (preferences.hydration && labels.hydrationTips.length) lines.push(labels.hydrationTips[offset % labels.hydrationTips.length]);
    if (preferences.nature && labels.natureTips.length) lines.push(labels.natureTips[offset % labels.natureTips.length]);
    entries.push({ dateKey, at, title: labels.greeting, body: lines.join(" "), workoutDay });
  }
  return entries;
}

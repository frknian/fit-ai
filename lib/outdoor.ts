// Doğada / açık havada geçirilen süre.
//
// Uygulama açık hava sporunu ölçmüyordu: GPS'li kayıt tutuluyordu ama
// "bu hafta ne kadar dışarıdaydım" sorusunun bir karşılığı yoktu. Buradaki
// saf fonksiyonlar aktivite kayıtlarından haftalık açık hava süresini çıkarır;
// bildirimdeki doğa çağrısı ve ana sayfadaki teşvik kartı bunu kullanır.

import type { ActivityEntry } from "./activity-service.ts";
import { addCalendarDays, isoWeekday } from "./workout-calendar.ts";
import { localDateKey, userTimeZone } from "./streak.ts";

/**
 * Doğası gereği açık havada yapılan sporlar.
 *
 * Yürüyüş ve koşu içeride de yapılabilir (bant), ama ezici çoğunlukla dışarıda
 * yapılır; bu yüzden dahil edilir. Yüzme (havuz), yoga, pilates, boks, dans ve
 * salon sporları dışarıda bırakıldı: bunları "doğada" saymak hedefi anlamsız
 * kılardı. GPS ile kaydedilen HER aktivite ayrıca açık hava sayılır — GPS
 * yalnızca dışarıda çalışır (bkz. isOutdoorActivity).
 */
export const OUTDOOR_ACTIVITY_KEYS = new Set(["walking", "running", "cycling", "hiking", "rowing", "skiing", "football"]);

export function isOutdoorActivity(entry: Pick<ActivityEntry, "activityKey" | "source">): boolean {
  return entry.source === "gps" || OUTDOOR_ACTIVITY_KEYS.has(entry.activityKey);
}

/** Haftalık hedef (dakika). DSÖ'nün 150 dk/hafta orta şiddet önerisiyle aynı sayı. */
export const DEFAULT_OUTDOOR_GOAL_MINUTES = 150;

export type OutdoorWeek = {
  /** Haftanın pazartesi günü (yerel). */
  weekStart: string;
  minutes: number;
  /** Dışarıda geçirilen ayrı gün sayısı — süreden bağımsız bir alışkanlık ölçüsü. */
  days: number;
  goalMinutes: number;
  percent: number;
  /** Hedefe kalan dakika; hedefe ulaşıldıysa 0. */
  remainingMinutes: number;
};

/** Verilen anın içinde bulunduğu haftanın pazartesisi. */
export function weekStartKey(now: Date | number = new Date(), timeZone: string = userTimeZone()): string {
  const today = localDateKey(now, timeZone);
  return addCalendarDays(today, -(isoWeekday(today) - 1));
}

export function summarizeOutdoorWeek(
  entries: ActivityEntry[],
  options: { goalMinutes?: number; now?: Date | number; timeZone?: string } = {},
): OutdoorWeek {
  const { goalMinutes = DEFAULT_OUTDOOR_GOAL_MINUTES, now = new Date(), timeZone = userTimeZone() } = options;
  const weekStart = weekStartKey(now, timeZone);
  const weekEnd = addCalendarDays(weekStart, 6);
  const days = new Set<string>();
  let minutes = 0;
  for (const entry of entries) {
    if (entry.localDate < weekStart || entry.localDate > weekEnd) continue;
    if (!isOutdoorActivity(entry)) continue;
    minutes += Math.max(0, Number(entry.durationMinutes) || 0);
    days.add(entry.localDate);
  }
  const percent = goalMinutes > 0 ? Math.min(100, Math.round((minutes / goalMinutes) * 100)) : 0;
  return { weekStart, minutes, days: days.size, goalMinutes, percent, remainingMinutes: Math.max(0, goalMinutes - minutes) };
}

/**
 * Rozet kademeleri.
 *
 * Kademe HAFTALIK süreye göre verilir, toplam süreye değil: amaç biriktirmek
 * değil, her hafta dışarı çıkma alışkanlığını sürdürmek.
 */
export type OutdoorBadge = "none" | "seed" | "sprout" | "tree" | "forest";

export function outdoorBadge(week: Pick<OutdoorWeek, "minutes" | "goalMinutes">): OutdoorBadge {
  const { minutes, goalMinutes } = week;
  if (minutes <= 0) return "none";
  if (minutes >= goalMinutes * 2) return "forest";
  if (minutes >= goalMinutes) return "tree";
  if (minutes >= goalMinutes / 2) return "sprout";
  return "seed";
}

/**
 * Üst üste kaç haftadır hedefi tutturduğu.
 *
 * İçinde bulunulan hafta HENÜZ BİTMEDİĞİ için, hedefi tutturmamışsa seriyi
 * kırmaz; yalnızca tutturduysa seriye eklenir. Aksi hâlde pazartesi sabahı
 * herkesin serisi sıfırlanmış görünürdü.
 */
export function outdoorWeeklyStreak(
  entries: ActivityEntry[],
  options: { goalMinutes?: number; now?: Date | number; timeZone?: string; maxWeeks?: number } = {},
): number {
  const { goalMinutes = DEFAULT_OUTDOOR_GOAL_MINUTES, now = new Date(), timeZone = userTimeZone(), maxWeeks = 52 } = options;
  const current = weekStartKey(now, timeZone);
  let streak = 0;
  for (let index = 0; index < maxWeeks; index += 1) {
    const start = addCalendarDays(current, -7 * index);
    const end = addCalendarDays(start, 6);
    const minutes = entries
      .filter((entry) => entry.localDate >= start && entry.localDate <= end && isOutdoorActivity(entry))
      .reduce((total, entry) => total + Math.max(0, Number(entry.durationMinutes) || 0), 0);
    if (minutes >= goalMinutes) { streak += 1; continue; }
    // İçinde bulunulan hafta henüz tamamlanmadı: hedefi tutturmamış olması
    // seriyi kırmaz, sadece seriye eklenmez.
    if (index === 0) continue;
    break;
  }
  return streak;
}

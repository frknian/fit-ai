"use client";

import { useSyncExternalStore } from "react";
import { notifyPreferenceChange } from "./preference-sync.ts";
import type { WeightUnit } from "./units";

const WEIGHT_UNIT_KEY = "fitai:weight-unit";

function readWeightUnit(): WeightUnit {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(WEIGHT_UNIT_KEY) === "lb" ? "lb" : "kg";
  } catch {
    return "kg";
  }
}

const listeners = new Set<() => void>();

export function setStoredWeightUnit(unit: WeightUnit) {
  try {
    localStorage.setItem(WEIGHT_UNIT_KEY, unit);
  } catch {
    // yerel depolama kapalıysa sessizce geç
  }
  listeners.forEach((listener) => listener());
  notifyPreferenceChange();
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  if (typeof window !== "undefined") window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    if (typeof window !== "undefined") window.removeEventListener("storage", callback);
  };
}

// Tüm bileşenlerde senkron kalan ağırlık birimi tercihi (localStorage tabanlı).
export function useWeightUnit(): WeightUnit {
  return useSyncExternalStore(subscribe, readWeightUnit, () => "kg");
}

// Hedef kilo. Profil tablosunda böyle bir alan yok; ağırlık birimiyle aynı
// yerel depoda tutulur ve oradan hesaba eşitlenir (components/PreferenceSync).
const TARGET_WEIGHT_KEY = "fitai:target-weight-kg";

function readTargetWeightRaw(): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(TARGET_WEIGHT_KEY) : null;
  } catch {
    return null;
  }
}

export function setStoredTargetWeightKg(weightKg: number | null) {
  try {
    if (weightKg === null || !Number.isFinite(weightKg) || weightKg <= 0) localStorage.removeItem(TARGET_WEIGHT_KEY);
    else localStorage.setItem(TARGET_WEIGHT_KEY, String(weightKg));
  } catch {
    // yerel depolama kapalıysa sessizce geç
  }
  listeners.forEach((listener) => listener());
  notifyPreferenceChange();
}

// Hedef planı cevapları (hedef kilo, haftalık gün, seans süresi, tempo).
// Ağırlık birimiyle aynı depoda: PreferenceSync bu anahtarı da hesaba
// eşitlediği için plan telefonda kurulup web'de görülebiliyor.
const GOAL_PLAN_KEY = "hedefit:goal-plan";

function readGoalPlanRaw(): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(GOAL_PLAN_KEY) : null;
  } catch {
    return null;
  }
}

export function setStoredGoalPlan(answers: unknown | null) {
  try {
    if (answers === null) localStorage.removeItem(GOAL_PLAN_KEY);
    else localStorage.setItem(GOAL_PLAN_KEY, JSON.stringify(answers));
  } catch {
    // yerel depolama kapalıysa plan yalnızca bu oturumda geçerli olur
  }
  listeners.forEach((listener) => listener());
  notifyPreferenceChange();
}

/** Ham JSON; çağıran normalizeAnswers ile doğrular. */
export function useStoredGoalPlan(): unknown | null {
  const raw = useSyncExternalStore(subscribe, readGoalPlanRaw, () => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Özel programlar ve program ilerleme günlüğü. İkisi de küçük JSON'lar;
// ayrı tablo açmak yerine tercih katmanında tutulur ve PreferenceSync ile
// cihazlar arasında eşitlenir.
function jsonPreference(key: string) {
  const read = () => {
    try {
      return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  };
  const write = (value: unknown | null) => {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // yerel depolama kapalıysa değişiklik yalnız bu oturumda geçerli olur
    }
    listeners.forEach((listener) => listener());
    notifyPreferenceChange();
  };
  return { read, write };
}

const customProgramsStore = jsonPreference("hedefit:custom-programs");
const programLogStore = jsonPreference("hedefit:program-log");
const smartProgramSwapsStore = jsonPreference("hedefit:smart-program-swaps");
// Kullanıcının kendi tanımladığı bölgesel gruplar (ör. "İtiş günü" = göğüs +
// omuz + kol). Özel programlarla aynı katmanda tutulur: küçük bir JSON, ayrı
// tablo açmayı gerektirmiyor ve PreferenceSync ile cihazlar arasında eşitlenir.
const customRegionsStore = jsonPreference("hedefit:custom-regions");
// Günlük sabah hatırlatması (bkz. lib/daily-reminders.ts).
const dailyReminderStore = jsonPreference("hedefit:daily-reminder");

export function setStoredCustomPrograms(programs: unknown) {
  customProgramsStore.write(programs);
}

/**
 * Akıllı programda kullanıcının değiştirdiği hareketler: orijinal hareket
 * adı → yerine geçen hareketin adı. Değişiklik ekrandan çıkınca kaybolmasın
 * diye (eskiden yalnız bileşen state'indeydi) kalıcı tercihe taşındı;
 * PreferenceSync ile cihazlar arasında da eşitlenir. İsme göre saklanır,
 * sıraya göre değil: plan yeniden üretilip hareketler yer değiştirse bile
 * "bu hareketi görürsen böyle değiştir" anlamı geçerliliğini korur.
 */
export function setStoredSmartProgramSwaps(swaps: Record<string, string>) {
  smartProgramSwapsStore.write(swaps);
}

export function useStoredSmartProgramSwaps(): Record<string, string> {
  const raw = useSyncExternalStore(subscribe, smartProgramSwapsStore.read, () => null);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "string")) as Record<string, string>;
  } catch {
    return {};
  }
}

export function setStoredDailyReminder(preferences: unknown) {
  dailyReminderStore.write(preferences);
}

/** Ham JSON; çağıran normalizeDailyReminder ile doğrular. */
export function useStoredDailyReminder(): unknown {
  const raw = useSyncExternalStore(subscribe, dailyReminderStore.read, () => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredCustomRegions(regions: unknown) {
  customRegionsStore.write(regions);
}

/** Ham JSON; çağıran normalizeCustomRegions ile doğrular. */
export function useStoredCustomRegions(): unknown {
  const raw = useSyncExternalStore(subscribe, customRegionsStore.read, () => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function useStoredCustomPrograms(): unknown {
  const raw = useSyncExternalStore(subscribe, customProgramsStore.read, () => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Program günlüğü sınırsız büyümesin: en yeni 200 kayıt tutulur. */
export function appendProgramLog(entry: { programKey: string; completedAt: string }) {
  let current: unknown[] = [];
  try {
    const raw = programLogStore.read();
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) current = parsed;
  } catch {
    current = [];
  }
  programLogStore.write([...current, entry].slice(-200));
}

export function useStoredProgramLog(): { programKey: string; completedAt: string }[] {
  const raw = useSyncExternalStore(subscribe, programLogStore.read, () => null);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.programKey === "string") : [];
  } catch {
    return [];
  }
}

export function useTargetWeightKg(): number | null {
  const raw = useSyncExternalStore(subscribe, readTargetWeightRaw, () => null);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Antrenman oynatıcısının iki isteğe bağlı özelliği.
 *
 * Set kaydı ve süre sayacı herkesin istediği şeyler değil: kimi kullanıcı
 * yalnız hareket listesini takip etmek, ağırlık/tekrar yazmadan ve geri sayım
 * olmadan çalışmak istiyor. İkisi de VARSAYILAN OLARAK AÇIK kalır; kapatma
 * tercihi cihazda saklanır ve antrenman ekranından değiştirilir.
 */
const SET_LOGGING_KEY = "hedefit:set-logging";
const WORKOUT_TIMER_KEY = "hedefit:workout-timer";

function readFlag(key: string): boolean {
  try {
    return typeof localStorage === "undefined" || localStorage.getItem(key) !== "0";
  } catch {
    return true;
  }
}

function writeFlag(key: string, enabled: boolean) {
  try {
    localStorage.setItem(key, enabled ? "1" : "0");
  } catch {
    // yerel depolama kapalıysa sessizce geç
  }
  listeners.forEach((listener) => listener());
  notifyPreferenceChange();
}

/**
 * Kullanma kılavuzu gösterildi mi?
 *
 * Diğer bayraklardan farklı olarak varsayılan KAPALI ("henüz görülmedi"):
 * readFlag anahtar yokken true döner, oysa burada anahtarın olmaması tam da
 * kılavuzun hiç gösterilmediği anlamına gelir.
 */
const GUIDE_SEEN_KEY = "hedefit:guide-seen";

function readGuideSeen(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(GUIDE_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function setStoredGuideSeen(seen: boolean) {
  try {
    if (seen) localStorage.setItem(GUIDE_SEEN_KEY, "1");
    else localStorage.removeItem(GUIDE_SEEN_KEY);
  } catch {
    // yerel depolama kapalıysa kılavuz her açılışta gösterilir
  }
  listeners.forEach((listener) => listener());
  notifyPreferenceChange();
}

/** Sunucuda "görüldü" varsayılır: kılavuz yalnız tarayıcıda anlamlıdır ve
    sunucu render'ında bir an görünüp kaybolmamalıdır. */
export function useGuideSeen(): boolean {
  return useSyncExternalStore(subscribe, readGuideSeen, () => true);
}

export function setStoredSetLoggingEnabled(enabled: boolean) {
  writeFlag(SET_LOGGING_KEY, enabled);
}

export function useSetLoggingEnabled(): boolean {
  return useSyncExternalStore(subscribe, () => readFlag(SET_LOGGING_KEY), () => true);
}

export function setStoredWorkoutTimerEnabled(enabled: boolean) {
  writeFlag(WORKOUT_TIMER_KEY, enabled);
}

export function useWorkoutTimerEnabled(): boolean {
  return useSyncExternalStore(subscribe, () => readFlag(WORKOUT_TIMER_KEY), () => true);
}

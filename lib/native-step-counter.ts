import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "./mobile.ts";

// Android'de adım sayarı bir foreground service'e bağlayan native köprü
// (android/app/src/main/java/com/hedefit/app/stepcounter/). Bu, npm paketi
// değil uygulamanın kendi kaynağı; HedefitLocalAI ile aynı sebeple burada
// registerPlugin ile elle bağlanır (capacitor.plugins.json'a girmez).
//
// iOS'ta bu köprü YOK: CMPedometer zaten sistemin hareket veritabanından
// geçmişe dönük sorgu yapabiliyor (uygulama kapalıyken de), bu yüzden
// @capgo/capacitor-pedometer'ın iOS tarafı ayrı bir arka plan servisine
// ihtiyaç duymaz — yalnız Android'de bu boşluk var.
interface HedefitStepCounterPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  start(): Promise<void>;
  stop(): Promise<void>;
  setGoal(options: { goal: number }): Promise<void>;
  getTodaySteps(): Promise<{ steps: number }>;
  checkPermissions(): Promise<Record<string, "granted" | "denied" | "prompt">>;
  requestPermissions(): Promise<Record<string, "granted" | "denied" | "prompt">>;
}

const HedefitStepCounter = registerPlugin<HedefitStepCounterPlugin>("HedefitStepCounter");

function isAndroid(): boolean {
  return isNativeApp() && typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
}

/**
 * "Bildirim çubuğunda adım göster" tercihi.
 *
 * Android'de kalıcı bildirim İSTEĞE BAĞLI DEĞİL: foreground service çalıştığı
 * sürece sistem bildirimi zorunlu gösterir. Bu yüzden tercih kapatıldığında
 * bildirimi gizlemenin tek yolu servisi tamamen durdurmaktır — o zaman adımlar
 * yalnız uygulama açıkken (pedometre eklentisiyle) sayılır. Ayar metni bunu
 * açıkça söyler.
 */
const NOTIFICATION_PREF_KEY = "hedefit:step-notification";

export function isStepNotificationEnabled(): boolean {
  try {
    return window.localStorage.getItem(NOTIFICATION_PREF_KEY) !== "0";
  } catch {
    return true;
  }
}

/** Tercih değişince adım kartının kaynağını yeniden kurmasını sağlayan olay. */
export const STEP_NOTIFICATION_EVENT = "hedefit:step-notification-changed";

export function setStepNotificationEnabled(enabled: boolean) {
  try { window.localStorage.setItem(NOTIFICATION_PREF_KEY, enabled ? "1" : "0"); } catch { /* depolama kapalı */ }
  window.dispatchEvent(new Event(STEP_NOTIFICATION_EVENT));
}

/** Yalnızca Android'de anlamlı; iOS'ta CMPedometer zaten arka planı kapsar. */
export function isBackgroundStepServiceSupported(): boolean {
  return isAndroid();
}

export async function isBackgroundStepServiceAvailable(): Promise<boolean> {
  if (!isAndroid()) return false;
  try {
    const result = await HedefitStepCounter.isAvailable();
    return Boolean(result.available);
  } catch {
    return false;
  }
}

export async function requestBackgroundStepPermissions(): Promise<boolean> {
  if (!isAndroid()) return false;
  try {
    const status = await HedefitStepCounter.requestPermissions();
    return status.activity === "granted";
  } catch {
    return false;
  }
}

/** Foreground service'i başlatır; kalıcı bir bildirim gösterir (Android zorunluluğu). */
export async function startBackgroundStepService(): Promise<boolean> {
  if (!isAndroid()) return false;
  try {
    await HedefitStepCounter.start();
    return true;
  } catch {
    return false;
  }
}

/** Bildirimdeki "hedefe kalan adım" satırının dayandığı günlük hedef. */
export async function setBackgroundStepGoal(goal: number): Promise<void> {
  if (!isAndroid() || !Number.isFinite(goal) || goal <= 0) return;
  await HedefitStepCounter.setGoal({ goal: Math.round(goal) }).catch(() => undefined);
}

export async function stopBackgroundStepService(): Promise<void> {
  if (!isAndroid()) return;
  await HedefitStepCounter.stop().catch(() => undefined);
}

/** Servis çalışmasa bile, o gün için son biriktirilen değeri okur. */
export async function getBackgroundStepsToday(): Promise<number | null> {
  if (!isAndroid()) return null;
  try {
    const result = await HedefitStepCounter.getTodaySteps();
    return Number.isFinite(result.steps) ? result.steps : null;
  } catch {
    return null;
  }
}

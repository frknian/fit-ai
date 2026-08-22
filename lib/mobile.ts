import { AdMob } from "@capacitor-community/admob";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Network } from "@capacitor/network";
import { Health } from "capacitor-health";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyReminderPlanEntry } from "@/lib/daily-reminders";
import type { ReminderPreferences, WorkoutScheduleEntry } from "@/lib/workout-calendar";

export const mobileAuthCallback = "com.hedefit.app://auth/callback";

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export function authCallbackUrl() {
  return isNativeApp() ? mobileAuthCallback : `${window.location.origin}/auth/callback`;
}

export async function openNativeBrowser(url: string) {
  if (!isNativeApp()) { window.location.assign(url); return; }
  await Browser.open({ url, presentationStyle: "popover" });
}

export async function mobileImpact() {
  if (isNativeApp()) await Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
}

export async function mobileNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!isNativeApp()) return typeof window === "undefined" || !window.isSecureContext || typeof Notification === "undefined" ? "unsupported" : Notification.permission;
  const permission = await LocalNotifications.checkPermissions();
  return permission.display === "granted" ? "granted" : permission.display === "denied" ? "denied" : "default";
}

export async function requestMobileNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!isNativeApp()) {
    if (typeof window === "undefined" || !window.isSecureContext || typeof Notification === "undefined") return "unsupported";
    return Notification.requestPermission().catch(() => "unsupported");
  }
  const permission = await LocalNotifications.requestPermissions();
  return permission.display === "granted" ? "granted" : permission.display === "denied" ? "denied" : "default";
}

function notificationId(value: string) {
  return [...value].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 17) % 2_000_000_000;
}

export async function scheduleMobileWorkouts(preferences: ReminderPreferences, entries: WorkoutScheduleEntry[]) {
  if (!isNativeApp()) return;
  const pending = await LocalNotifications.getPending();
  const own = pending.notifications.filter((notification) => notification.extra?.fitAiWorkout === true);
  if (own.length) await LocalNotifications.cancel({ notifications: own.map(({ id }) => ({ id })) });
  if (!preferences.browserNotifications) return;
  const now = Date.now();
  const notifications = entries
    .filter((entry) => entry.status === "planned")
    .map((entry) => {
      const startsAt = new Date(`${entry.scheduledDate}T${entry.scheduledTime}:00+03:00`).getTime();
      const alertAt = startsAt - preferences.reminderMinutesBefore * 60_000;
      return { id: notificationId(`${entry.scheduledDate}-${entry.scheduledTime}`), title: "Antrenman saatin yaklaşıyor", body: `${entry.scheduledTime} antrenmanın için hazırlanma zamanı.`, schedule: { at: new Date(alertAt) }, extra: { fitAiWorkout: true, scheduledDate: entry.scheduledDate } };
    })
    .filter((notification) => notification.schedule.at.getTime() > now)
    .slice(0, 60);
  if (notifications.length) await LocalNotifications.schedule({ notifications });
}

/**
 * Günlük sabah hatırlatmaları (bkz. lib/daily-reminders.ts).
 *
 * Antrenman hatırlatmasıyla aynı kalıp: önce bu uygulamanın kurduğu eski
 * bildirimler iptal edilir, sonra plandaki günler yeniden kurulur. `extra`
 * bayrağı ayrı: antrenman bildirimlerini yanlışlıkla silmemek için.
 */
export async function scheduleDailyReminders(entries: DailyReminderPlanEntry[]) {
  if (!isNativeApp()) return;
  const pending = await LocalNotifications.getPending();
  const own = pending.notifications.filter((notification) => notification.extra?.hedefitDaily === true);
  if (own.length) await LocalNotifications.cancel({ notifications: own.map(({ id }) => ({ id })) });
  const now = Date.now();
  const notifications = entries
    .filter((entry) => entry.at.getTime() > now)
    .slice(0, 30)
    .map((entry) => ({
      id: notificationId(`daily-${entry.dateKey}`),
      title: entry.title,
      body: entry.body,
      schedule: { at: entry.at },
      extra: { hedefitDaily: true, dateKey: entry.dateKey },
    }));
  if (notifications.length) await LocalNotifications.schedule({ notifications });
}

/**
 * Android donanım geri tuşu.
 *
 * Eskiden burada `canGoBack` bayrağına bakan tek bir dinleyici vardı. Uygulama
 * tek sayfa olduğu ve geçmişe hiç yazmadığı için o bayrak pratikte hep `false`
 * dönüyordu: kullanıcı ayarlardayken ya da antrenman oynatıcısındayken geri
 * tuşuna bastığında uygulama kapanıp arka plana düşüyordu.
 *
 * Artık kararı rota durumu veriyor (bkz. lib/navigation.ts). `handler` geri
 * gidilecek bir yer bulup işlediyse `true` döner; dönmezse uygulama arka plana
 * alınır — Android'de beklenen davranış budur.
 */
export function registerBackButton(handler: () => boolean) {
  if (!isNativeApp()) return () => undefined;
  let handle: { remove: () => Promise<void> } | null = null;
  let cancelled = false;
  void App.addListener("backButton", () => {
    if (handler()) return;
    void App.minimizeApp();
  }).then((registered) => {
    if (cancelled) void registered.remove();
    else handle = registered;
  });
  return () => {
    cancelled = true;
    void handle?.remove();
  };
}

let adsInitialized = false;

/** Reklamları hazırlar; birden çok çağrıda yalnızca ilkinde SDK'yı başlatır. */
export async function initializeAds() {
  if (!isNativeApp() || adsInitialized) return;
  adsInitialized = true;
  await AdMob.initialize({ initializeForTesting: process.env.NODE_ENV !== "production" }).catch(() => undefined);
}

/** iOS 14+ App Tracking Transparency izni ister; Android'de no-op'tur. */
export async function requestAdTrackingAuthorization() {
  if (!isNativeApp()) return;
  await AdMob.requestTrackingAuthorization().catch(() => undefined);
}

/**
 * showRewardVideoAd() bir AdMobRewardItem ({ type, amount }) ile çözülür.
 * Boolean(reward) her zaman true dönerdi (boş {} bile truthy); gerçek ödül
 * miktarının pozitif olduğunu kontrol etmek gerekiyor.
 */
export function isRewardedAdReward(reward: unknown): boolean {
  if (!reward || typeof reward !== "object") return false;
  return Number((reward as { amount?: unknown }).amount) > 0;
}

/**
 * Ödüllü reklamı hazırlayıp gösterir. Ödül yalnızca kullanıcı reklamı sonuna
 * kadar izlerse (showRewardVideoAd promise'i çözülürse) kazanılmış sayılır;
 * erken kapatma veya yükleme hatası { rewarded: false } döner.
 */
export async function showRewardedAd(adUnitId: string): Promise<{ rewarded: boolean }> {
  if (!isNativeApp()) return { rewarded: false };
  await initializeAds();
  try {
    await AdMob.prepareRewardVideoAd({ adId: adUnitId, isTesting: process.env.NODE_ENV !== "production" });
    const reward = await AdMob.showRewardVideoAd();
    return { rewarded: isRewardedAdReward(reward) };
  } catch {
    return { rewarded: false };
  }
}

// --- Cihazın kendi adım sayacı ---------------------------------------------
// Sağlık uygulaması (Health Connect / HealthKit) BOŞ olabilir: Android 14'te
// Health Connect işletim sistemine gömülüdür ama başka bir uygulama adım
// yazmadıkça sorgu 0 döner. O yüzden birincil kaynak cihazın kendi donanım
// sayacıdır; sağlık verisi varsa üzerine eklenir (bkz. combineStepSources).

/** Cihazda donanım adım sayacı var mı? */
export async function isPedometerAvailable(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { CapacitorPedometer } = await import("@capgo/capacitor-pedometer");
    const result = await CapacitorPedometer.isAvailable();
    return Boolean(result.stepCounting);
  } catch {
    return false;
  }
}

/** Android'de ACTIVITY_RECOGNITION, iOS'ta hareket izni ister. */
export async function requestPedometerPermission(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { CapacitorPedometer } = await import("@capgo/capacitor-pedometer");
    const status = await CapacitorPedometer.requestPermissions();
    return status.activityRecognition === "granted";
  } catch {
    return false;
  }
}

/**
 * Adım akışını başlatır. Eklenti Android'de yalnızca bu çağrıdan SONRAKİ
 * adımları sayar; günlük toplamı lib/step-counter.ts biriktirir.
 * Geri dönen fonksiyon dinlemeyi bırakır.
 */
export async function startPedometer(onSteps: (sessionSteps: number) => void): Promise<() => void> {
  if (!isNativeApp()) return () => undefined;
  try {
    const { CapacitorPedometer } = await import("@capgo/capacitor-pedometer");
    const handle = await CapacitorPedometer.addListener("measurement", (event) => {
      const steps = Number(event?.numberOfSteps);
      if (Number.isFinite(steps)) onSteps(steps);
    });
    await CapacitorPedometer.startMeasurementUpdates();
    return () => {
      void handle.remove();
      void CapacitorPedometer.stopMeasurementUpdates().catch(() => undefined);
    };
  } catch {
    return () => undefined;
  }
}

/** Adım sayar için sağlık verisi (HealthKit / Health Connect) erişilebilir mi? Web'de her zaman false. */
export async function isStepCounterAvailable(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const result = await Health.isHealthAvailable();
    return result.available;
  } catch {
    return false;
  }
}

/** Adım okuma iznini ister; kullanıcı reddederse veya sağlık uygulaması yoksa false döner. */
export async function requestStepPermission(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const result = await Health.requestHealthPermissions({ permissions: ["READ_STEPS"] });
    return Boolean(result.permissions?.[0]?.READ_STEPS);
  } catch {
    return false;
  }
}

/** Bugünün yerel gece yarısından şu ana kadar atılan toplam adımı döner. */
export async function fetchTodaySteps(): Promise<number | null> {
  if (!isNativeApp()) return null;
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const result = await Health.queryAggregated({
      startDate: startOfDay.toISOString(),
      endDate: now.toISOString(),
      dataType: "steps",
      bucket: "day",
    });
    return result.aggregatedData.reduce((total, sample) => total + (Number(sample.value) || 0), 0);
  } catch {
    return null;
  }
}

export function registerMobileRuntime(options: { supabase: SupabaseClient | null; onOnlineChange: (online: boolean) => void }) {
  if (!isNativeApp()) return () => undefined;
  document.documentElement.classList.add("native-app");
  let active = true;
  const handles: Array<{ remove: () => Promise<void> }> = [];
  void Network.getStatus().then((status) => { if (active) options.onOnlineChange(status.connected); });
  void Network.addListener("networkStatusChange", (status) => options.onOnlineChange(status.connected)).then((handle) => handles.push(handle));
  void App.addListener("appUrlOpen", async ({ url }) => {
    if (!url.startsWith(mobileAuthCallback) || !options.supabase) return;
    const code = new URL(url).searchParams.get("code");
    if (code) await options.supabase.auth.exchangeCodeForSession(code);
    await Browser.close().catch(() => undefined);
    window.location.assign("/");
  }).then((handle) => handles.push(handle));
  return () => {
    active = false;
    document.documentElement.classList.remove("native-app");
    handles.forEach((handle) => void handle.remove());
  };
}

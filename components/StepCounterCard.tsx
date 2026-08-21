"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createStepRepository } from "@/lib/step-service";
import { localDateKey } from "@/lib/streak";
import { fetchTodaySteps, isNativeApp, isPedometerAvailable, isStepCounterAvailable, requestPedometerPermission, requestStepPermission, startPedometer } from "@/lib/mobile";
import { combineStepSources, mergeSessionSteps, stepsForToday, type StoredStepState } from "@/lib/step-counter";
import { getBackgroundStepsToday, isBackgroundStepServiceAvailable, isBackgroundStepServiceSupported, isStepNotificationEnabled, requestBackgroundStepPermissions, setBackgroundStepGoal, startBackgroundStepService, STEP_NOTIFICATION_EVENT } from "@/lib/native-step-counter";
import { useTranslations } from "@/lib/i18n/translate";

const DEFAULT_GOAL = 8000;
const CIRCUMFERENCE = 2 * Math.PI * 42;
/** Sağlık uygulamasına bağlanma İSTEĞE BAĞLI bir ek; ayrı bayrakta tutulur. */
const HEALTH_CONNECTED_KEY = "fit-ai-step-counter-connected";
/** Cihaz sayacının günlük birikimi (bkz. lib/step-counter.ts). */
const DEVICE_STEPS_KEY = "hedefit:device-steps";
/** Kullanıcının kendi belirlediği günlük adım hedefi; verilmezse `goal` prop'u kullanılır. */
const STEP_GOAL_KEY = "hedefit:step-goal";
const MIN_STEP_GOAL = 1000;
const MAX_STEP_GOAL = 50000;

function readStoredGoal(fallback: number): number {
  try {
    const raw = window.localStorage.getItem(STEP_GOAL_KEY);
    const parsed = Number(raw);
    return raw && Number.isFinite(parsed) && parsed >= MIN_STEP_GOAL && parsed <= MAX_STEP_GOAL ? parsed : fallback;
  } catch {
    return fallback;
  }
}

type Status = "idle" | "checking" | "unavailable" | "ready";

function readStored(): StoredStepState | null {
  try {
    const raw = window.localStorage.getItem(DEVICE_STEPS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredStepState;
    return typeof parsed?.localDate === "string" && Number.isFinite(parsed?.steps) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(state: StoredStepState) {
  try { window.localStorage.setItem(DEVICE_STEPS_KEY, JSON.stringify(state)); } catch { /* depolama kapalı */ }
}

/**
 * Ana ekranın adım sayar kartı: HealthKit/Health Connect'ten bugünün adımını
 * çeker ve `daily_steps` tablosuna senkronize eder. Yalnızca native uygulamada
 * çalışır (web'de hiçbir şey render etmez).
 */
export function StepCounterCard({ userId, goal = DEFAULT_GOAL }: { userId?: string; goal?: number }) {
  const t = useTranslations();
  const [status, setStatus] = useState<Status>("idle");
  const [steps, setSteps] = useState<number | null>(null);

  const [healthConnected, setHealthConnected] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [customGoal, setCustomGoal] = useState(() => (typeof window === "undefined" ? goal : readStoredGoal(goal)));
  const [goalDraft, setGoalDraft] = useState("");

  function saveGoal() {
    const parsed = Math.round(Number(goalDraft));
    if (!Number.isFinite(parsed) || parsed < MIN_STEP_GOAL || parsed > MAX_STEP_GOAL) return;
    try { window.localStorage.setItem(STEP_GOAL_KEY, String(parsed)); } catch { /* depolama kapalı */ }
    setCustomGoal(parsed);
    setGoalDraft("");
  }

  useEffect(() => {
    if (!isNativeApp()) return undefined;
    let cancelled = false;
    let stopPedometer: (() => void) | null = null;
    // Eklentinin oturum sayacı; artışı bulmak için son işlenen değer saklanır.
    let lastSessionSteps = 0;
    let pollInterval: number | undefined;

    async function persist(total: number) {
      if (!userId) return;
      const supabase = createClient();
      if (!supabase) return;
      await createStepRepository(supabase, userId).upsertToday(localDateKey(), total).catch(() => undefined);
    }

    /** Sağlık uygulaması bağlıysa oradaki değerle karşılaştırır (toplamaz). */
    async function syncHealth(deviceSteps: number) {
      if (window.localStorage.getItem(HEALTH_CONNECTED_KEY) !== "1") return deviceSteps;
      const health = await fetchTodaySteps();
      return combineStepSources(deviceSteps, health);
    }

    /**
     * Android: adım sayan native foreground service birincil kaynak (bkz.
     * android/.../stepcounter/StepCounterService.kt) — uygulama tamamen
     * kapansa bile Android'in servisi öldürmemesi için kalıcı bildirimle
     * çalışır. @capgo/capacitor-pedometer'ın Android tarafında bu koruma
     * yok; dinleyici JS/aktivite ömrüyle sınırlı, kapanınca adım kaçırır.
     *
     * iOS'ta bu dal atlanır: CMPedometer sistemin hareket veritabanından
     * geçmişe dönük sorgu yapabildiği için ayrı bir servise gerek yok.
     */
    async function initAndroidBackgroundService(): Promise<boolean> {
      if (!isBackgroundStepServiceSupported()) return false;
      const available = await isBackgroundStepServiceAvailable();
      if (cancelled) return true;
      if (!available) { setStatus("unavailable"); return true; }

      const granted = await requestBackgroundStepPermissions();
      if (cancelled) return true;
      if (!granted) { setStatus("unavailable"); return true; }

      await startBackgroundStepService();
      // Bildirimdeki "hedefe kalan adım" satırı bu hedefe göre yazılır.
      await setBackgroundStepGoal(readStoredGoal(goal));
      async function poll() {
        const nativeSteps = await getBackgroundStepsToday();
        if (cancelled || nativeSteps === null) return;
        const total = await syncHealth(nativeSteps);
        if (cancelled) return;
        setSteps(total);
        setStatus("ready");
        void persist(total);
      }
      await poll();
      pollInterval = window.setInterval(() => void poll(), 30_000);
      return true;
    }

    let androidHandled = false;

    async function init() {
      setStatus("checking");
      setHealthConnected(window.localStorage.getItem(HEALTH_CONNECTED_KEY) === "1");

      // Android dalı yalnız ilk seferde kurulur: servis zaten sürekli
      // arka planda sayıyor, odaklanma her seferinde onu yeniden başlatıp
      // eski interval'ı sızdırmasın diye burada tekrar çağrılmaz.
      //
      // Kullanıcı bildirim çubuğunu kapattıysa servis hiç çalışmaz (kalıcı
      // bildirim onun ayrılmaz parçası); o durumda aşağıdaki pedometre dalı
      // devreye girer ve adımlar yalnız uygulama açıkken sayılır.
      if (isBackgroundStepServiceSupported() && isStepNotificationEnabled()) {
        if (!androidHandled) { androidHandled = true; await initAndroidBackgroundService(); }
        return;
      }

      const available = await isPedometerAvailable();
      if (cancelled) return;

      // Kayıtlı günlük toplam hemen gösterilir; sensör beklenmez.
      const stored = readStored();
      const today = localDateKey();
      let total = stepsForToday(stored, today);
      setSteps(total);
      setStatus("ready");

      if (available && (await requestPedometerPermission())) {
        if (cancelled) return;
        stopPedometer = await startPedometer((sessionSteps) => {
          const next = mergeSessionSteps({ stored: readStored(), todayKey: localDateKey(), sessionSteps, lastSessionSteps });
          lastSessionSteps = sessionSteps;
          writeStored(next);
          setSteps(next.steps);
          void persist(next.steps);
        });
      } else if (!available && window.localStorage.getItem(HEALTH_CONNECTED_KEY) !== "1") {
        // Ne donanım sayacı ne de sağlık bağlantısı var: kart bir şey diyemez.
        const healthCapable = await isStepCounterAvailable();
        if (!cancelled && !healthCapable) { setStatus("unavailable"); return; }
      }

      total = await syncHealth(total);
      if (cancelled) return;
      setSteps(total);
      void persist(total);
    }

    void init();
    function onFocus() { void init(); }
    // Bildirim tercihi değişince kaynak da değişir (servis ↔ pedometre);
    // kurulum baştan yapılmalı, yoksa eski kaynağın yoklaması sürüp gider.
    function onNotificationPrefChange() {
      if (pollInterval !== undefined) { window.clearInterval(pollInterval); pollInterval = undefined; }
      androidHandled = false;
      void init();
    }
    window.addEventListener("focus", onFocus);
    window.addEventListener(STEP_NOTIFICATION_EVENT, onNotificationPrefChange);
    return () => {
      cancelled = true;
      stopPedometer?.();
      if (pollInterval !== undefined) window.clearInterval(pollInterval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(STEP_NOTIFICATION_EVENT, onNotificationPrefChange);
    };
  }, [userId, goal]);

  // Hedef değişince bildirim satırı da değişmeli.
  useEffect(() => { void setBackgroundStepGoal(customGoal); }, [customGoal]);

  /** Sağlık uygulaması bağlantısı isteğe bağlı: cihaz sayacı zaten çalışıyor. */
  async function connectHealth() {
    const granted = await requestStepPermission();
    if (!granted) return;
    window.localStorage.setItem(HEALTH_CONNECTED_KEY, "1");
    setHealthConnected(true);
    const health = await fetchTodaySteps();
    const total = combineStepSources(stepsForToday(readStored(), localDateKey()), health);
    setSteps(total);
    if (userId) {
      const supabase = createClient();
      if (supabase) await createStepRepository(supabase, userId).upsertToday(localDateKey(), total).catch(() => undefined);
    }
  }

  if (!isNativeApp() || status === "idle" || status === "unavailable") return null;

  const current = steps ?? 0;
  const ratio = Math.min(1, current / Math.max(1, customGoal));
  const dash = CIRCUMFERENCE * ratio;
  const remaining = Math.max(0, customGoal - current);

  return <>
    {/* Ana ekranda yalnız çember: ayrıntılar (hedef, kalan, sağlık bağlantısı)
        dokununca açılan kısa bir kaplamaya taşındı — kalori kartıyla aynı
        satırda iki kartın da metin yığını sığdırmaya çalışması yerine. */}
    <button type="button" className="step-ring-card is-tappable" onClick={() => setDetailOpen(true)} aria-label={t.stepCounter.openDetailLabel}>
      <div className="step-ring" role="img" aria-label={t.stepCounter.ariaLabel(current)}>
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="step-ring-track" cx="50" cy="50" r="42" />
          <circle className="step-ring-fill" cx="50" cy="50" r="42" strokeDasharray={`${dash} ${CIRCUMFERENCE}`} />
        </svg>
        <div className="step-ring-center">
          <strong>{status === "checking" ? "…" : current.toLocaleString("tr-TR")}</strong>
          <small>{t.stepCounter.unit}</small>
        </div>
      </div>
      <span className="step-ring-caption">{t.stepCounter.eyebrow}</span>
    </button>

    {detailOpen && <div className="step-detail-overlay" role="dialog" aria-modal="true" aria-label={t.stepCounter.eyebrow} onClick={(event) => { if (event.target === event.currentTarget) setDetailOpen(false); }}>
      <div className="step-detail-sheet">
        <button type="button" className="activity-close" onClick={() => setDetailOpen(false)} aria-label={t.common.dismiss}>×</button>
        <div className="step-ring large" role="img" aria-label={t.stepCounter.ariaLabel(current)}>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle className="step-ring-track" cx="50" cy="50" r="42" />
            <circle className="step-ring-fill" cx="50" cy="50" r="42" strokeDasharray={`${dash} ${CIRCUMFERENCE}`} />
          </svg>
          <div className="step-ring-center">
            <strong>{status === "checking" ? "…" : current.toLocaleString("tr-TR")}</strong>
            <small>{t.stepCounter.unit}</small>
          </div>
        </div>
        <div className="step-ring-legend">
          <span>{t.stepCounter.eyebrow}</span>
          <strong>{ratio >= 1 ? t.stepCounter.goalReached : t.stepCounter.remaining(remaining)}</strong>
          <small>{t.stepCounter.goalLabel}: {customGoal.toLocaleString("tr-TR")} {t.stepCounter.unit}</small>
          {/* Sağlık bağlantısı isteğe bağlı: uygulama kapalıyken atılan
              adımları da toplayabilmek için. Cihaz sayacı zaten çalışıyor. */}
          {!healthConnected && <button type="button" className="step-ring-health-link" onClick={() => void connectHealth()}>{t.stepCounter.connect}</button>}
        </div>
        <div className="step-goal-edit">
          <label>{t.stepCounter.goalEditLabel}
            <input
              type="number"
              inputMode="numeric"
              min={MIN_STEP_GOAL}
              max={MAX_STEP_GOAL}
              step={500}
              placeholder={String(customGoal)}
              value={goalDraft}
              onChange={(event) => setGoalDraft(event.target.value)}
            />
          </label>
          <button type="button" onClick={saveGoal} disabled={!goalDraft.trim()}>{t.stepCounter.goalSave}</button>
        </div>
      </div>
    </div>}
  </>;
}

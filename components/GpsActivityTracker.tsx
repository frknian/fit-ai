"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Square } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createActivityRepository } from "@/lib/activity-service";
import { coreActivityCatalog, activityIntensityOptions, estimateActivityCalories, type ActivityIntensity } from "@/lib/sports";
import { localDateKey, userTimeZone, type ActivityType } from "@/lib/streak";
import { encodePolyline, routeDistanceKm, type LatLng } from "@/lib/polyline";
import { getCurrentPosition, isGpsTrackingAvailable, startGpsTracking, stopGpsTracking, type TrackedPoint } from "@/lib/gps-tracking";
import { isUsableGpsPoint, smoothSpeedMps } from "@/lib/gps-smoothing";
import { connectHeartRateMonitor, type HeartRateMonitor } from "@/lib/ble-heart-rate";
import { clearPersistedGpsSession, readPersistedGpsSession, writePersistedGpsSession } from "@/lib/gps-session-store";
import { applyStepCredit, DEVICE_STEPS_STORAGE_KEY, estimateStepsFromDistance, type StoredStepState } from "@/lib/step-counter";
import { formatDuration, formatPace } from "@/lib/activity-format";
import { renderShareCard } from "@/lib/share-card";
import { shareActivityImage } from "@/lib/share-activity";
import { useTranslations, translateIntensity } from "@/lib/i18n/translate";
import { GpsMapView } from "@/components/GpsMapView";

type Phase = "idle" | "unavailable" | "tracking" | "paused" | "summary";

// GPS'e uygun, mesafe bazlı aktiviteler; diğer sporlar manuel ActivityLogger'da kalır.
const TRACKABLE_ACTIVITIES = coreActivityCatalog.filter((activity) => ["walking", "running", "cycling"].includes(activity.key));

export function GpsActivityTracker({ userId, weightKg = 70, onClose }: { userId: string; weightKg?: number; onClose: () => void }) {
  const t = useTranslations();
  // Ekran kapanıp WebView süreci öldürüldüğünde ya da uygulama yeniden
  // açıldığında, disk üzerinde bitmemiş bir oturum varsa sıfırdan başlamak
  // yerine "duraklatıldı" durumunda geri yüklenir (bkz. lib/gps-session-store.ts).
  const [recovered] = useState(() => readPersistedGpsSession());
  const [phase, setPhase] = useState<Phase>(() => (recovered ? "paused" : isGpsTrackingAvailable() ? "idle" : "unavailable"));
  const [activityKey, setActivityKey] = useState(() => recovered?.activityKey || TRACKABLE_ACTIVITIES[0]?.key || "walking");
  const [intensity, setIntensity] = useState<ActivityIntensity>("Orta");
  const [points, setPoints] = useState<TrackedPoint[]>(() => recovered?.points || []);
  const [startedAt, setStartedAt] = useState<string | null>(() => recovered?.startedAt || null);
  const [endedAt, setEndedAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [currentBpm, setCurrentBpm] = useState<number | null>(null);
  const [hrConnecting, setHrConnecting] = useState(false);
  const [hrConnected, setHrConnected] = useState(false);
  const [hrSamples, setHrSamples] = useState<number[]>(() => recovered?.hrSamples || []);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(() => (recovered ? t.gpsActivity.sessionRecovered : ""));
  /** İlk GPS sinyali gelene kadar haritanın nereye bakacağı. */
  const [initialPosition, setInitialPosition] = useState<LatLng | null>(null);

  const [sharing, setSharing] = useState(false);
  // Ham GPS hızı saniyeden saniyeye 0-8 km/s zıplayabilir (drift); canlı
  // ekranda gösterilen değer bunun yerine yumuşatılmış hızdır (bkz.
  // lib/gps-smoothing.ts). Sık güncellendiği için ref'te tutulur, ekrana
  // ayrı bir state ile yansıtılır.
  const smoothedSpeedRef = useRef(0);
  const [displaySpeedMps, setDisplaySpeedMps] = useState(0);
  const watcherIdRef = useRef("");
  const hrMonitorRef = useRef<HeartRateMonitor | null>(null);

  useEffect(() => {
    if (phase !== "tracking") return undefined;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [phase]);

  useEffect(() => () => {
    if (watcherIdRef.current) void stopGpsTracking(watcherIdRef.current);
    if (hrMonitorRef.current) void hrMonitorRef.current.disconnect();
  }, []);

  // Yalnız DEVAM EDEN oturum diske yazılır. Özet ekranındaki bitmiş
  // aktiviteyi yeniden yazmak, kaplama kapatılıp tekrar açıldığında eski
  // rotayı "duraklatılmış" gibi geri getiriyordu.
  useEffect(() => {
    if (!startedAt || (phase !== "tracking" && phase !== "paused")) return;
    writePersistedGpsSession({ activityKey, startedAt, points, hrSamples });
  }, [points, hrSamples, activityKey, startedAt, phase]);

  // Takip başlamadan önce anlık konumu al: harita dünyanın neresinde olursa
  // olsun ilk karede doğru yere bakar, boş bir dünya görünümüyle açılmaz.
  useEffect(() => {
    let cancelled = false;
    void getCurrentPosition().then((point) => {
      if (!cancelled && point) setInitialPosition({ lat: point.lat, lng: point.lng });
    });
    return () => { cancelled = true; };
  }, []);

  const route: LatLng[] = points.map((p) => ({ lat: p.lat, lng: p.lng }));
  const distanceKm = routeDistanceKm(route);
  const elapsedMs = startedAt ? (endedAt ? new Date(endedAt).getTime() : now) - new Date(startedAt).getTime() : 0;
  const elapsedMinutes = elapsedMs / 60000;
  const currentSpeedKmh = displaySpeedMps * 3.6;
  const avgSpeedKmh = elapsedMinutes > 0.05 ? distanceKm / (elapsedMinutes / 60) : 0;
  const maxSpeedKmh = points.reduce((max, p) => (p.speedMps != null ? Math.max(max, p.speedMps * 3.6) : max), 0);
  const selectedActivity = TRACKABLE_ACTIVITIES.find((activity) => activity.key === activityKey) || TRACKABLE_ACTIVITIES[0];
  const estimatedCalories = selectedActivity ? estimateActivityCalories(selectedActivity.key, Math.round(elapsedMinutes), weightKg, intensity) : 0;

  /**
   * Doğruluğu kötü noktalar (bkz. lib/gps-smoothing.ts) rotaya hiç
   * eklenmez — hem mesafeyi hem canlı hızı gerçekten sabote eden onlardır.
   * Kabul edilen noktalarda hız yumuşatılarak gösterilir.
   */
  function acceptPoint(point: TrackedPoint) {
    if (!isUsableGpsPoint(point)) return;
    smoothedSpeedRef.current = smoothSpeedMps(smoothedSpeedRef.current, point.speedMps);
    setDisplaySpeedMps(smoothedSpeedRef.current);
    setPoints((current) => [...current, point]);
  }

  async function handleStart() {
    setMessage("");
    // Yeni aktivite, önceki bir oturumdan kalmış rota ile asla birleşmez.
    clearPersistedGpsSession();
    setPoints([]);
    setEndedAt(null);
    setHrSamples([]);
    smoothedSpeedRef.current = 0;
    setDisplaySpeedMps(0);
    const start = new Date().toISOString();
    setStartedAt(start);
    setPhase("tracking");
    watcherIdRef.current = await startGpsTracking(acceptPoint, (error) => setMessage(error));
  }

  async function handlePause() {
    if (watcherIdRef.current) await stopGpsTracking(watcherIdRef.current);
    watcherIdRef.current = "";
    smoothedSpeedRef.current = 0;
    setDisplaySpeedMps(0);
    setPhase("paused");
  }

  async function handleResume() {
    setPhase("tracking");
    watcherIdRef.current = await startGpsTracking(acceptPoint, (error) => setMessage(error));
  }

  async function handleStop() {
    if (watcherIdRef.current) await stopGpsTracking(watcherIdRef.current);
    watcherIdRef.current = "";
    if (hrMonitorRef.current) { await hrMonitorRef.current.disconnect(); hrMonitorRef.current = null; setHrConnected(false); }
    // Aktivite artık tamamlandı; yalnızca bu bileşenin özet state'inde
    // kalır. Kullanıcı kaydetmeden kapatsa bile bir sonraki açılışta eski
    // rota canlı oturum sanılarak açılmaz.
    clearPersistedGpsSession();
    setEndedAt(new Date().toISOString());
    setPhase("summary");
  }

  async function handleConnectHeartRate() {
    setHrConnecting(true);
    setMessage("");
    try {
      const monitor = await connectHeartRateMonitor(
        (bpm) => { setCurrentBpm(bpm); setHrSamples((current) => [...current, bpm]); },
        () => { setCurrentBpm(null); setHrConnected(false); },
      );
      if (!monitor) { setMessage(t.gpsActivity.errorHeartRateUnavailable); return; }
      hrMonitorRef.current = monitor;
      setHrConnected(true);
    } catch {
      setMessage(t.gpsActivity.errorHeartRateConnect);
    } finally {
      setHrConnecting(false);
    }
  }

  async function handleShare() {
    if (!selectedActivity) return;
    if (route.length < 2) { setMessage(t.gpsActivity.errorRouteTooShort); return; }
    setSharing(true);
    setMessage("");
    try {
      // Özet ekranı artık harita çizmiyor; paylaşım kartı da rotayı kendi
      // sade zemininin üstüne çizer (bkz. renderShareCard içindeki yedek yol).
      const blob = await renderShareCard({
        title: selectedActivity.name,
        distanceKm,
        durationMs: elapsedMs,
        route,
        labels: { pace: t.gpsActivity.sharePace, time: t.gpsActivity.shareTime, distance: t.gpsActivity.shareDistance },
      });
      const outcome = await shareActivityImage(blob, {
        title: selectedActivity.name,
        text: t.gpsActivity.shareText(selectedActivity.name, distanceKm.toFixed(2)),
      });
      if (outcome === "downloaded") setMessage(t.gpsActivity.shareDownloaded);
      else if (outcome === "failed") setMessage(t.gpsActivity.shareFailed);
    } catch {
      setMessage(t.gpsActivity.shareFailed);
    } finally {
      setSharing(false);
    }
  }

  async function handleSave() {
    if (!selectedActivity || !startedAt || !endedAt) return;
    setSaving(true);
    setMessage("");
    const client = createClient();
    if (!client) { setSaving(false); setMessage(t.gpsActivity.errorService); return; }
    const activityType: ActivityType = selectedActivity.key === "walking" ? "walk" : "sport";
    const avgHeartRate = hrSamples.length ? Math.round(hrSamples.reduce((sum, v) => sum + v, 0) / hrSamples.length) : null;
    const maxHeartRate = hrSamples.length ? Math.max(...hrSamples) : null;
    try {
      const entry = await createActivityRepository(client, userId).createWithRoute({
        activityType,
        activityKey: selectedActivity.key,
        activityName: selectedActivity.name,
        occurredAt: startedAt,
        localDate: localDateKey(new Date(startedAt), userTimeZone()),
        durationMinutes: Math.max(1, Math.round(elapsedMinutes)),
        distanceKm: Math.round(distanceKm * 100) / 100,
        estimatedCalories: estimatedCalories || null,
        steps: null,
        intensity: intensity.toLocaleLowerCase("tr-TR").replace("ü", "u") as "hafif" | "orta" | "yuksek",
        notes: notes.trim() || null,
        avgSpeedKmh: Math.round(avgSpeedKmh * 100) / 100,
        maxSpeedKmh: Math.round(maxSpeedKmh * 100) / 100,
        avgHeartRate,
        maxHeartRate,
        heartRateSource: hrSamples.length ? "ble" : null,
        encodedPolyline: encodePolyline(route),
        pointCount: route.length,
        startedAt,
        endedAt,
      });
      const { data, error: streakError } = await client.rpc("record_streak_activity", { p_activity_type: activityType, p_timezone: userTimeZone() });
      const row = Array.isArray(data) ? (data[0] as { current_streak?: number } | undefined) : (data as { current_streak?: number } | null);
      window.dispatchEvent(new CustomEvent("fit-ai-activity-recorded", { detail: { streak: Number(row?.current_streak) || undefined } }));
      clearPersistedGpsSession();
      // Yürüyüş/koşuda kat edilen mesafeyi adım sayarın günlük toplamına
      // ekler. Yalnız iOS/web'de görünür etkisi olur: Android'de gerçek
      // adımlar zaten donanım sensörünü dinleyen arka plan servisinden
      // (StepCounterService) geliyor ve bu anahtarı hiç okumaz, iki kez
      // sayma riski yoktur (bkz. lib/step-counter.ts applyStepCredit).
      if (selectedActivity.key === "walking" || selectedActivity.key === "running") {
        try {
          const raw = window.localStorage.getItem(DEVICE_STEPS_STORAGE_KEY);
          const stored: StoredStepState | null = raw ? JSON.parse(raw) : null;
          const credit = estimateStepsFromDistance(distanceKm, selectedActivity.key);
          const todayKey = localDateKey(new Date(startedAt), userTimeZone());
          window.localStorage.setItem(DEVICE_STEPS_STORAGE_KEY, JSON.stringify(applyStepCredit(stored, todayKey, credit)));
        } catch { /* adım sayar rotayla senkron olmasa da aktivite kaydı başarıldı */ }
      }
      setMessage(streakError ? t.gpsActivity.savedNoStreak(entry.activityName) : t.gpsActivity.savedWithStreak(entry.activityName, row?.current_streak || null));
      setTimeout(onClose, 1200);
    } catch {
      setMessage(t.gpsActivity.errorSave);
    } finally {
      setSaving(false);
    }
  }

  // Canlı takipte ekran tam açılır: kaplama/modal çerçevesi kaybolur, harita
  // ve istatistikler bütün ekranı kaplar (aşağıdaki `:has()` kuralları).
  const live = phase === "tracking" || phase === "paused";

  return <section className={live ? "gps-tracker gps-tracker-fullscreen" : "gps-tracker"} aria-labelledby="gps-tracker-title">
    <div className="gps-tracker-head">
      <div><div className="eyebrow">{t.gpsActivity.eyebrow}</div><h2 id="gps-tracker-title">{t.gpsActivity.title}</h2></div>
      <button type="button" className="activity-close" onClick={onClose} aria-label={t.gpsActivity.closeLabel}>×</button>
    </div>

    {phase === "unavailable" && <p className="gps-tracker-empty">{t.gpsActivity.errorUnavailable}</p>}

    {phase === "idle" && <div className="gps-tracker-setup">
      <div className="gps-tracker-activity-picker" role="group" aria-label={t.gpsActivity.activityPickerLabel}>
        {/* Yalnız adı yazar: katalogdaki iki harflik kısaltma ("YÜ Yürüyüş")
            etiketin önünde okunmayan bir gürültüydü. */}
        {TRACKABLE_ACTIVITIES.map((activity) => <button type="button" key={activity.key} aria-pressed={activityKey === activity.key} className={activityKey === activity.key ? "active" : ""} onClick={() => setActivityKey(activity.key)}>
          {activity.name}
        </button>)}
      </div>
      <button type="button" className="gps-tracker-start" onClick={() => void handleStart()}>{t.gpsActivity.start}</button>
    </div>}

    {(phase === "tracking" || phase === "paused") && <div className="gps-tracker-live">
      {/* İstatistik kartları haritanın ÜSTÜNE biner; bu yüzden ikisi ortak bir
          konumlandırma kutusunda durur. Kutu olmadan kartlar aşağıdaki nabız
          bandı ve başlat/bitir düğmelerinin üstüne biniyordu. */}
      <div className="gps-tracker-map-wrap">
        <GpsMapView live route={route} currentPosition={route[route.length - 1] || initialPosition} className="gps-map-view live" />
        <div className="gps-tracker-stats">
          <div><span>{t.gpsActivity.statDuration}</span><strong>{formatDuration(elapsedMs)}</strong></div>
          <div><span>{t.gpsActivity.statDistance}</span><strong>{distanceKm.toFixed(2)} km</strong></div>
          <div><span>{t.gpsActivity.statSpeed}</span><strong>{currentSpeedKmh.toFixed(1)} km/s</strong></div>
          <div><span>{t.gpsActivity.statHeartRate}</span><strong>{currentBpm != null ? `${currentBpm} bpm` : "–"}</strong></div>
        </div>
      </div>
      {!hrConnected && <button type="button" className="gps-tracker-hr-connect" disabled={hrConnecting} onClick={() => void handleConnectHeartRate()}>{hrConnecting ? t.gpsActivity.connectingHeartRate : t.gpsActivity.connectHeartRate}</button>}
      <div className="gps-tracker-controls">
        {phase === "tracking" && <button type="button" className="gps-tracker-round" aria-label={t.gpsActivity.pause} onClick={() => void handlePause()}><Pause className="size-6" aria-hidden /></button>}
        {phase === "paused" && <button type="button" className="gps-tracker-round" aria-label={t.gpsActivity.resume} onClick={() => void handleResume()}><Play className="size-6" aria-hidden /></button>}
        <button type="button" className="gps-tracker-stop gps-tracker-round" aria-label={t.gpsActivity.stop} onClick={() => void handleStop()}><Square className="size-6" aria-hidden /></button>
      </div>
    </div>}

    {phase === "summary" && <div className="gps-tracker-summary">
      {/* Bitişte harita gösterilmez: yalnız yürünen rotanın çizgisi kalır. */}
      <GpsMapView reveal basemap={false} interactive={false} route={route} currentPosition={route[route.length - 1] || initialPosition} className="gps-map-view summary" />
      {route.length < 2 && <p className="gps-tracker-route-warning">{t.gpsActivity.routeTooShortHint}</p>}
      <div className="gps-tracker-stats">
        <div><span>{t.gpsActivity.statDuration}</span><strong>{formatDuration(elapsedMs)}</strong></div>
        <div><span>{t.gpsActivity.statDistance}</span><strong>{distanceKm.toFixed(2)} km</strong></div>
        <div><span>{t.gpsActivity.statPace}</span><strong>{formatPace(distanceKm, elapsedMs)}</strong></div>
        <div><span>{t.gpsActivity.statAvgSpeed}</span><strong>{avgSpeedKmh.toFixed(1)} km/s</strong></div>
        <div><span>{t.gpsActivity.statMaxSpeed}</span><strong>{maxSpeedKmh.toFixed(1)} km/s</strong></div>
        {hrSamples.length > 0 && <div><span>{t.gpsActivity.statAvgHeartRate}</span><strong>{Math.round(hrSamples.reduce((s, v) => s + v, 0) / hrSamples.length)} bpm</strong></div>}
        <div><span>{t.gpsActivity.statCalories}</span><strong>{estimatedCalories} kcal</strong></div>
      </div>
      <label className="gps-tracker-intensity">{t.gpsActivity.intensityLabel}
        <select value={intensity} onChange={(event) => setIntensity(event.target.value as ActivityIntensity)}>
          {activityIntensityOptions.map((option) => <option key={option} value={option}>{translateIntensity(t, option)}</option>)}
        </select>
      </label>
      <label className="gps-tracker-notes">{t.gpsActivity.noteLabel}<textarea maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t.gpsActivity.notePlaceholder} /></label>
      <div className="gps-tracker-summary-actions">
        <button type="button" className="gps-tracker-save" disabled={saving} onClick={() => void handleSave()}>{saving ? t.gpsActivity.saving : t.gpsActivity.save}</button>
        <button type="button" className="gps-tracker-share" disabled={sharing} onClick={() => void handleShare()}>{sharing ? t.gpsActivity.sharing : t.gpsActivity.share}</button>
      </div>
    </div>}

    {message && <p className="gps-tracker-message" role="status">{message}</p>}
  </section>;
}

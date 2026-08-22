"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createActivityRepository, type ActivityEntry, type ActivityRoute } from "@/lib/activity-service";
import { decodePolyline } from "@/lib/polyline";
import { renderShareCard } from "@/lib/share-card";
import { shareActivityImage } from "@/lib/share-activity";
import { useTranslations, translateIntensity } from "@/lib/i18n/translate";
import { useLocale } from "@/lib/i18n/locale";
import { GpsMapView, type MapCapture } from "@/components/GpsMapView";
import { RoutePreviewThumbnail } from "@/components/RoutePreviewThumbnail";
import { ActivityIcon } from "@/components/ActivityIcon";

function formatEntryDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", weekday: "short" }).format(new Date(`${value}T12:00:00`));
}

function ActivityDetail({ entry, userId, onBack }: { entry: ActivityEntry; userId: string; onBack: () => void }) {
  const t = useTranslations();
  const dateLocale = useLocale() === "en" ? "en-US" : "tr-TR";
  const [route, setRoute] = useState<ActivityRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState("");
  const mapCaptureRef = useRef<MapCapture | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadRoute() {
      const client = createClient();
      if (!client) { setLoading(false); return; }
      try {
        const data = await createActivityRepository(client, userId).getRoute(entry.id);
        if (!cancelled) setRoute(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadRoute();
    return () => { cancelled = true; };
  }, [entry.id, userId]);

  const points = route ? decodePolyline(route.encodedPolyline) : [];

  async function handleShare() {
    setSharing(true);
    setShareNote("");
    try {
      const mapDataUrl = await mapCaptureRef.current?.capture().catch(() => null);
      const blob = await renderShareCard({
        title: entry.activityName,
        distanceKm: entry.distanceKm ?? 0,
        durationMs: entry.durationMinutes * 60_000,
        mapDataUrl,
        route: points,
        labels: { pace: t.gpsActivity.sharePace, time: t.gpsActivity.shareTime, distance: t.gpsActivity.shareDistance },
      });
      const outcome = await shareActivityImage(blob, {
        title: entry.activityName,
        text: t.gpsActivity.shareText(entry.activityName, (entry.distanceKm ?? 0).toFixed(2)),
      });
      if (outcome === "downloaded") setShareNote(t.gpsActivity.shareDownloaded);
      else if (outcome === "failed") setShareNote(t.gpsActivity.shareFailed);
    } catch {
      setShareNote(t.gpsActivity.shareFailed);
    } finally {
      setSharing(false);
    }
  }

  return <div className="activity-log-detail">
    <button type="button" className="sport-guide-back" onClick={onBack}>{t.activityLog.backToList}</button>
    <h3>{entry.activityName}</h3>
    <small>{formatEntryDate(entry.localDate, dateLocale)}</small>
    {loading && <p className="activity-log-detail-loading">{t.activityLog.loadingRoute}</p>}
    {!loading && points.length > 1 && <GpsMapView route={points} interactive className="gps-map-view detail" captureRef={mapCaptureRef} />}
    {!loading && points.length <= 1 && <p className="activity-log-detail-loading">{t.activityLog.noRoute}</p>}
    <div className="activity-log-detail-stats">
      <div><span>{t.activityLog.statDuration}</span><strong>{entry.durationMinutes} {t.activityLogger.chartUnitMinutes}</strong></div>
      {entry.distanceKm != null && <div><span>{t.activityLog.statDistance}</span><strong>{entry.distanceKm.toFixed(2)} km</strong></div>}
      {entry.avgSpeedKmh != null && <div><span>{t.activityLog.statAvgSpeed}</span><strong>{entry.avgSpeedKmh.toFixed(1)} km/s</strong></div>}
      {entry.maxSpeedKmh != null && <div><span>{t.activityLog.statMaxSpeed}</span><strong>{entry.maxSpeedKmh.toFixed(1)} km/s</strong></div>}
      {entry.avgHeartRate != null && <div><span>{t.activityLog.statAvgHeartRate}</span><strong>{entry.avgHeartRate} bpm</strong></div>}
      {entry.maxHeartRate != null && <div><span>{t.activityLog.statMaxHeartRate}</span><strong>{entry.maxHeartRate} bpm</strong></div>}
      {entry.estimatedCalories != null && <div><span>{t.activityLog.statCalories}</span><strong>{entry.estimatedCalories} kcal</strong></div>}
      <div><span>{t.activityLog.statIntensity}</span><strong>{translateIntensity(t, entry.intensity)}</strong></div>
    </div>
    {entry.notes && <p className="activity-log-detail-notes">{entry.notes}</p>}
    {points.length > 1 && <button type="button" className="gps-tracker-share activity-log-share" disabled={sharing} onClick={() => void handleShare()}>{sharing ? t.gpsActivity.sharing : t.gpsActivity.share}</button>}
    {shareNote && <p className="gps-tracker-message" role="status">{shareNote}</p>}
  </div>;
}

/** "Hedefit Rota" aktivite günlüğü: geçmiş GPS/manuel kayıtları listeler, dokununca rota detayını açar. */
export function ActivityLog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const t = useTranslations();
  const dateLocale = useLocale() === "en" ? "en-US" : "tr-TR";
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [routesByEntryId, setRoutesByEntryId] = useState<Record<string, ActivityRoute | null>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ActivityEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadEntries() {
      const client = createClient();
      if (!client) { setLoading(false); return; }
      const repo = createActivityRepository(client, userId);
      try {
        const list = await repo.list();
        if (cancelled) return;
        setEntries(list);
        const gpsEntries = list.filter((entry) => entry.source === "gps");
        const routeEntries = await Promise.all(gpsEntries.map(async (entry) => [entry.id, await repo.getRoute(entry.id).catch(() => null)] as const));
        if (!cancelled) setRoutesByEntryId(Object.fromEntries(routeEntries));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadEntries();
    return () => { cancelled = true; };
  }, [userId]);

  return <section className="activity-log" aria-labelledby="activity-log-title">
    <div className="activity-logger-head">
      <div><div className="eyebrow">{t.activityLog.eyebrow}</div><h2 id="activity-log-title">{t.activityLog.title}</h2></div>
      <button type="button" className="activity-close" onClick={onClose} aria-label={t.activityLog.closeLabel}>×</button>
    </div>

    {selected ? <ActivityDetail entry={selected} userId={userId} onBack={() => setSelected(null)} /> : <>
      {loading && <p className="activity-history-empty">{t.activityLog.loading}</p>}
      {!loading && entries.length === 0 && <p className="activity-history-empty">{t.activityLog.empty}</p>}
      {!loading && entries.length > 0 && <div className="activity-log-list">
        {entries.map((entry) => {
          const route = routesByEntryId[entry.id];
          const points = route ? decodePolyline(route.encodedPolyline) : [];
          return <article key={entry.id} className="activity-log-row" onClick={() => setSelected(entry)}>
            {/* Rotası olmayan kayıt (manuel giriş) boş gri bir kutu olarak
                duruyordu; artık aktivitenin kendi simgesini gösterir. */}
            {points.length > 1 ? <RoutePreviewThumbnail route={points} /> : <div className="route-preview-thumb route-preview-thumb-placeholder"><ActivityIcon name={entry.activityKey} /></div>}
            <div>
              <strong>{entry.activityName}</strong>
              <small>{formatEntryDate(entry.localDate, dateLocale)} · {entry.durationMinutes} {t.activityLogger.chartUnitMinutes}{entry.distanceKm ? ` · ${entry.distanceKm.toFixed(2)} km` : ""}</small>
            </div>
            <b>{entry.estimatedCalories ? `${entry.estimatedCalories} kcal` : translateIntensity(t, entry.intensity)}</b>
          </article>;
        })}
      </div>}
    </>}
  </section>;
}

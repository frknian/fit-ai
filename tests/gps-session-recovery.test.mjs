import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Bu testler kullanıcının cihazda gerçekten yaşadığı iki hatayı bir daha
// üretmemek için var:
//   1) Ekran kapanıp WebView süreci öldürülünce canlı rota tamamen kayboldu
//      ve uygulama "yeniden başlamış" gibi göründü.
//   2) Yeterli GPS noktası toplanmadığında (ör. cihaz neredeyse hiç
//      hareket etmedi) harita boş kaldı ve paylaşım hiçbir şey üretmeden
//      sessizce başarısız oldu.
const tracker = await readFile(new URL("../components/GpsActivityTracker.tsx", import.meta.url), "utf8");
const app = await readFile(new URL("../components/FitAiApp.tsx", import.meta.url), "utf8");
const mapView = await readFile(new URL("../components/GpsMapView.tsx", import.meta.url), "utf8");

test("canlı rota her yeni noktada diske yazılır", () => {
  assert.match(tracker, /writePersistedGpsSession\(\{ activityKey, startedAt, points, hrSamples \}\)/);
  assert.match(tracker, /useEffect\(\(\) => \{\s*if \(!startedAt \|\| \(phase !== "tracking" && phase !== "paused"\)\) return;\s*writePersistedGpsSession/);
});

test("uygulama yeniden açılınca yarım kalan oturum geri yüklenir", () => {
  assert.match(tracker, /readPersistedGpsSession\(\)/);
  assert.match(tracker, /useState<Phase>\(\(\) => \(recovered \? "paused" : isGpsTrackingAvailable/, "geri yüklenen oturum doğrudan duraklatıldı durumunda açılmalı, sıfırdan başlamamalı");
  assert.match(tracker, /sessionRecovered/, "kullanıcı geri yüklemenin farkında olmalı");
});

test("kayıt başarıyla tamamlanınca diskteki oturum temizlenir", () => {
  const saveStart = tracker.indexOf("async function handleSave");
  const saveBody = tracker.slice(saveStart, tracker.indexOf("\n  }\n", saveStart));
  assert.match(saveBody, /clearPersistedGpsSession\(\)/);
});

test("bitirilen rota, kaydedilmeden kapatılsa da yeniden canlı oturum olarak açılmaz", () => {
  const stopStart = tracker.indexOf("async function handleStop");
  const stopBody = tracker.slice(stopStart, tracker.indexOf("\n  }\n", stopStart));
  assert.match(stopBody, /clearPersistedGpsSession\(\)/);
  assert.match(stopBody, /setPhase\("summary"\)/);
});

test("çok az GPS noktası varsa paylaşım sessizce başarısız olmaz", () => {
  const shareStart = tracker.indexOf("async function handleShare");
  const shareBody = tracker.slice(shareStart, tracker.indexOf("\n  }\n", shareStart));
  assert.match(shareBody, /route\.length < 2/, "yetersiz nokta erken ve açıkça reddedilmeli");
  assert.match(shareBody, /errorRouteTooShort/);
});

test("özet haritası boşsa kullanıcıya sebebi söylenir", () => {
  assert.match(tracker, /route\.length < 2 && <p className="gps-tracker-route-warning">/);
});

test("yarım kalan oturum varsa takip kaplaması cihazda otomatik açılır", () => {
  // Diskte kayıt olsa da kaplama (gpsTrackerOpen) kapalı başlarsa
  // GpsActivityTracker hiç mount olmaz ve kurtarma mantığı tetiklenmez —
  // rota kullanıcıya asla gösterilmez. Cihazda doğrulanan gerçek hata.
  assert.match(app, /const \[gpsTrackerOpen, setGpsTrackerOpen\] = useState\(hasPersistedGpsSession\)/);
  assert.match(app, /import \{ hasPersistedGpsSession \} from "@\/lib\/gps-session-store"/);
});

test("canlı harita her GPS noktasında kullanıcıyı takip eder", () => {
  assert.match(tracker, /<GpsMapView live route=\{route\}/);
  assert.match(mapView, /if \(isLive && positionChanged\) map\.easeTo\(\{ center: \[position\.lng, position\.lat\]/);
});

test("aktivite bitince rota yeşil renkte, haritasız ortaya çıkar", () => {
  assert.match(tracker, /<GpsMapView reveal basemap=\{false\} interactive=\{false\} route=\{route\}/);
  assert.match(mapView, /style: basemap \? RASTER_STYLE : BLANK_STYLE/);
  assert.match(mapView, /export const ROUTE_COLOR = "#5fbf3f"/);
  assert.match(mapView, /startReveal\(\)/);
});

// Kullanıcının bildirdiği hata: "Hedefit Rota açıldığında eski yapılanlarla
// açılıyor". Kaydedilmeden bırakılan bir oturumun diskte SÜRESİZ kalması,
// uygulamayı her açılışta günler önceki rotayla karşılıyordu.
test("bayat bir oturum yarım kalmış aktivite sayılmaz", async () => {
  const { isStaleGpsSession } = await import("../lib/gps-session-store.ts");
  const now = Date.UTC(2026, 7, 20, 12, 0, 0);
  const hoursAgo = (hours) => now - hours * 60 * 60 * 1000;
  const session = (lastPointHoursAgo) => ({
    activityKey: "walking",
    startedAt: new Date(hoursAgo(lastPointHoursAgo + 1)).toISOString(),
    points: [{ lat: 41, lng: 29, accuracy: 5, altitude: null, speedMps: 1, timeMs: hoursAgo(lastPointHoursAgo) }],
    hrSamples: [],
  });

  assert.equal(isStaleGpsSession(session(0.5), now), false, "yarım saat önceki takip hâlâ sürüyor olabilir");
  assert.equal(isStaleGpsSession(session(11), now), false, "uzun bir yürüyüş 12 saatin altında kalır");
  assert.equal(isStaleGpsSession(session(30), now), true, "bir gün önceki kayıt kalıntıdır");

  // Nokta hiç toplanmadıysa ölçüt başlangıç zamanıdır.
  const pointless = { activityKey: "walking", startedAt: new Date(hoursAgo(20)).toISOString(), points: [], hrSamples: [] };
  assert.equal(isStaleGpsSession(pointless, now), true);
});

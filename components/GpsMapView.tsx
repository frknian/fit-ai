"use client";

import { useEffect, useRef } from "react";
import type * as maplibregl from "maplibre-gl";
import type { LatLng } from "@/lib/polyline";
import { MAP_TILE_ATTRIBUTION, MAP_TILE_URL } from "@/lib/map-tiles";

// maplibre-gl yalnızca tip olarak statik içe aktarılır (yukarıdaki `import
// type`, derleme sonrası tamamen silinir). Gerçek modül aşağıda useEffect
// içinde dinamik import() ile yüklenir; aksi halde Next'in RSC/SSR modül
// grafiği bu istemci-yalnızca kütüphaneyi sunucu tarafında statik olarak
// tarayıp değerlendirmeye çalışıyor ve `window`/WebGL'e bağımlı kodu
// çalıştırınca dev sunucusunu (workerd) sonsuza dek askıda bırakıyordu.
let maplibreModulePromise: Promise<typeof maplibregl> | null = null;
function loadMaplibre() {
  if (!maplibreModulePromise) {
    maplibreModulePromise = Promise.all([
      import("maplibre-gl"),
      import("maplibre-gl/dist/maplibre-gl.css"),
      // MapLibre v6 worker'ını AYRI bir dosya olarak yükler ve adresini
      // `new URL("./maplibre-gl-worker.mjs", import.meta.url)` ile, yani
      // KENDİ paket dosyasının yanında arar. Paketleyici bu dinamik adresi
      // statik olarak göremediği için o dosyayı çıktıya hiç koymuyordu:
      // `/assets/maplibre-gl-worker.mjs` 404 dönüyor, worker hiç açılmıyor ve
      // GeoJSON kaynakları sonsuza dek "güncelleniyor" durumunda kalıyordu —
      // rota çizgisi ve konum noktası HİÇ çizilmiyordu. (Raster döşemeler
      // worker'a ihtiyaç duymadığı için harita çalışıyor görünüyordu.)
      // `?worker&url`, Vite'ın worker'ı bağımlılıklarıyla paketleyip gerçek
      // adresini vermesini sağlar; adresi MapLibre'e biz bildiriyoruz.
      import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"),
    ]).then(([mod, , workerModule]) => {
      const workerUrl = (workerModule as { default?: string }).default;
      // Worker havuzu ilk haritayla birlikte kurulur; adres ondan ÖNCE
      // verilmek zorunda.
      if (workerUrl) mod.setWorkerUrl(workerUrl);
      return mod;
    });
  }
  return maplibreModulePromise;
}

// Ücretsiz, API anahtarı gerektirmeyen OSM raster tile'ları. Vektör
// stil/glyph barındırma karmaşıklığına şimdilik gerek yok — bkz. plan
// dokümanındaki gerekçe (Faz 1: raster, ihtiyaç olursa sonra vektöre geçilir).
const RASTER_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [MAP_TILE_URL],
      tileSize: 256,
      attribution: MAP_TILE_ATTRIBUTION,
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

/**
 * Döşemesiz stil: bitiş özetinde YALNIZ rota çizilir, harita hiç yüklenmez.
 * Arka plan katmanı saydam bırakılır; böylece kabın CSS zemini (`--surface-soft`)
 * görünür ve görünüm açık/koyu temayla birlikte değişir.
 */
const BLANK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "blank", type: "background", paint: { "background-color": "rgba(0,0,0,0)" } }],
};

const ROUTE_SOURCE_ID = "hedefit-rota-route";
const ROUTE_LAYER_ID = "hedefit-rota-route-line";
const ROUTE_HALO_LAYER_ID = "hedefit-rota-route-line-halo";
const MARKER_SOURCE_ID = "hedefit-rota-markers";
const MARKER_LAYER_ID = "hedefit-rota-marker-dots";
const POSITION_SOURCE_ID = "hedefit-rota-position";
const POSITION_LAYER_ID = "hedefit-rota-position-dot";
const PULSE_LAYER_ID = "hedefit-rota-position-pulse";

/** Rota çizgisinin varsayılan rengi. Paylaşım kartında aynı yeşil kullanılır. */
export const ROUTE_COLOR = "#5fbf3f";
const ROUTE_COLOR_CLEAR = "rgba(95,191,63,0)";
const HALO_COLOR = "#ffffff";
const HALO_COLOR_CLEAR = "rgba(255,255,255,0)";
const FINISH_COLOR = "#1c1c1a";

/** Rotayı baştan sona çizerek ortaya çıkarma süresi (ms). */
const REVEAL_DURATION_MS = 1200;
/** Takip noktasındaki nabız halkasının bir turu (ms). */
const PULSE_PERIOD_MS = 1800;
/** Nabız halkası kaç ms'de bir tazelensin? Her karede boyamak pil yakıyor. */
const PULSE_THROTTLE_MS = 66;

function toRouteData(points: LatLng[]): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  // Tek noktalı LineString geçersiz bir geometridir; rota iki noktaya
  // ulaşana kadar kaynak boş bir koleksiyon olarak kalır.
  if (points.length < 2) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: points.map((p) => [p.lng, p.lat]) },
    }],
  };
}

function toGeoJsonPoint(point: LatLng | null): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: point ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [point.lng, point.lat] } }] : [],
  };
}

/** Başlangıç ve bitiş işaretleri: yalnız tamamlanmış rotalarda gösterilir. */
function toMarkerData(points: LatLng[], live: boolean): GeoJSON.FeatureCollection<GeoJSON.Point> {
  if (live || points.length < 2) return { type: "FeatureCollection", features: [] };
  const start = points[0];
  const finish = points[points.length - 1];
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { kind: "start" }, geometry: { type: "Point", coordinates: [start.lng, start.lat] } },
      { type: "Feature", properties: { kind: "finish" }, geometry: { type: "Point", coordinates: [finish.lng, finish.lat] } },
    ],
  };
}

/**
 * Haritaya YAZILMIŞ veriyi tanımlayan imza.
 *
 * Bu imza olmadan `setData` her React render'ında çağrılıyordu: `route`
 * dizisi ve `currentPosition` her render'da yeni nesne olarak üretiliyor,
 * üstelik canlı takipte saniyede bir çalışan sayaç da render tetikliyordu.
 * MapLibre GeoJSON'u bir web worker'da ayrıştırır; bitmemiş bir güncellemenin
 * üstüne sürekli yenisi binince kaynak kalıcı olarak "güncelleniyor"
 * durumunda kalıyor (`_isUpdatingWorker`) ve ROTA HİÇ ÇİZİLMİYORDU.
 * Noktalar yalnızca sona eklendiği için uzunluk + son nokta yeterli bir imza.
 */
function routeSignature(points: LatLng[]): string {
  if (!points.length) return "0";
  const last = points[points.length - 1];
  return `${points.length}:${last.lat.toFixed(6)},${last.lng.toFixed(6)}`;
}

function pointSignature(point: LatLng | null): string {
  return point ? `${point.lat.toFixed(6)},${point.lng.toFixed(6)}` : "";
}

/** `line-progress` boyunca tek renk: ortaya çıkarma bitince kullanılır. */
function solidGradient(color: string): maplibregl.ExpressionSpecification {
  return ["interpolate", ["linear"], ["line-progress"], 0, color, 1, color];
}

/** Çizginin yalnız `progress` oranına kadarki kısmını görünür yapan gradyan. */
function revealGradient(color: string, clear: string, progress: number): maplibregl.ExpressionSpecification {
  // Duraklar KESİN artan olmalı, aksi halde MapLibre ifadeyi reddeder.
  const head = Math.min(0.998, Math.max(0.001, progress));
  const tail = Math.min(0.999, head + 0.001);
  return ["interpolate", ["linear"], ["line-progress"], 0, color, head, color, tail, clear, 1, clear];
}

/** Ortaya çıkarma gradyanını rota ve (varsa) dış hat katmanına yazar. */
function setRevealGradients(map: maplibregl.Map, progress: number) {
  map.setPaintProperty(ROUTE_LAYER_ID, "line-gradient", revealGradient(ROUTE_COLOR, ROUTE_COLOR_CLEAR, progress));
  // Dış hat katmanı harita döşemesiz kipte hiç eklenmez.
  if (map.getLayer(ROUTE_HALO_LAYER_ID)) map.setPaintProperty(ROUTE_HALO_LAYER_ID, "line-gradient", revealGradient(HALO_COLOR, HALO_COLOR_CLEAR, progress));
}

/**
 * Haritanın o anki karesini PNG data URL'ine çevirir. Paylaşım görseli bunun
 * üstüne kurulur, bu yüzden döşemeler yüklenene kadar (`idle`) beklenir.
 */
export type MapCapture = { capture: () => Promise<string | null> };

export type GpsMapViewProps = {
  route: LatLng[];
  currentPosition?: LatLng | null;
  interactive?: boolean;
  className?: string;
  /** Verilirse harita kare dışa aktarımına hazırlanır (preserveDrawingBuffer). */
  captureRef?: { current: MapCapture | null };
  /**
   * Canlı takip kipi: kamera her yeni konumda kullanıcıyı takip eder, baş
   * noktada nabız gibi atan bir halka durur ve rota arkada uzar.
   */
  live?: boolean;
  /** Bitişte rotayı baştan sona çizerek ortaya çıkarır (Strava'daki gibi). */
  reveal?: boolean;
  /** Kapatılırsa harita döşemeleri hiç yüklenmez; ekranda sadece rota kalır. */
  basemap?: boolean;
};

/** Canlı takip, rota detayı ve önizlemede paylaşılan MapLibre yaşam döngüsü sarmalayıcısı. */
export function GpsMapView({ route, currentPosition = null, interactive = true, className, captureRef, live = false, reveal = false, basemap = true }: GpsMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  /** Yüklenen modül: `LngLatBounds` gibi sınıflara erişmek için saklanır. */
  const maplibreRef = useRef<typeof maplibregl | null>(null);
  const readyRef = useRef(false);
  /** Harita gerçek bir konuma bir kez ortalandı mı? Bkz. aşağıdaki jumpTo. */
  const centeredRef = useRef(false);
  /**
   * Güncel props. `load` olayı asenkron geldiği için katmanlar kurulurken
   * mount anındaki değil EN SON veri uygulanmalı; aksi halde harita hazır
   * olmadan gelen noktalar sessizce düşüyordu.
   */
  const latestRef = useRef({ route, currentPosition, live, reveal });
  const appliedRouteRef = useRef("");
  const appliedPositionRef = useRef("");
  const fittedRef = useRef(false);
  const revealStartedRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  /** Haritaya veri yazan işlev; `load` tamamlandığında kurulur. */
  const applyRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    let cancelled = false;
    let map: maplibregl.Map | null = null;
    const exportable = Boolean(captureRef);
    // Bilinen bir nokta yoksa dünya görünümü açılır. Burada bir şehir
    // sabitlemek (eskiden İstanbul'du) uygulamayı o ülkeye aitmiş gibi
    // gösteriyordu; OSM döşemeleri tüm dünyayı kapsar ve harita her zaman
    // kullanıcının gerçek konumuna göre ortalanır.
    const known = route.length ? route[route.length - 1] : currentPosition;
    const initialCenter: [number, number] = known ? [known.lng, known.lat] : [0, 20];

    void loadMaplibre().then((maplibregl) => {
      if (cancelled || !containerRef.current) return;
      maplibreRef.current = maplibregl;
      map = new maplibregl.Map({
        container: containerRef.current,
        style: basemap ? RASTER_STYLE : BLANK_STYLE,
        center: initialCenter,
        zoom: known ? 15 : 1,
        interactive,
        // Atıf yalnız OSM döşemeleri gerçekten çizildiğinde gerekir.
        attributionControl: interactive && basemap ? {} : false,
        // WebGL varsayılanı her kareden sonra tamponu boşaltır; bu açık
        // olmadan getCanvas().toDataURL() bomboş bir görsel döner.
        canvasContextAttributes: { preserveDrawingBuffer: exportable },
      });
      mapRef.current = map;

      map.on("load", () => {
        const current = mapRef.current;
        if (!current) return;

        // `lineMetrics`, ortaya çıkarma animasyonunun kullandığı
        // `line-progress` ifadesinin ön koşulu.
        current.addSource(ROUTE_SOURCE_ID, { type: "geojson", lineMetrics: true, data: toRouteData([]) });
        // Beyaz bir dış hat, rotanın açık renkli döşemeler üzerinde de
        // seçilmesini sağlar (paylaşım görselinde bu belirgin fark yaratıyor).
        // Beyaz dış hat yalnız döşemelerin üstünde işe yarar; harita yokken
        // sade zeminde görünmez bir kalınlık katmaktan başka bir şey yapmaz.
        if (basemap) current.addLayer({ id: ROUTE_HALO_LAYER_ID, type: "line", source: ROUTE_SOURCE_ID, paint: { "line-color": HALO_COLOR, "line-width": 9, "line-opacity": 0.9 }, layout: { "line-cap": "round", "line-join": "round" } });
        current.addLayer({ id: ROUTE_LAYER_ID, type: "line", source: ROUTE_SOURCE_ID, paint: { "line-color": ROUTE_COLOR, "line-width": 5 }, layout: { "line-cap": "round", "line-join": "round" } });

        current.addSource(MARKER_SOURCE_ID, { type: "geojson", data: toMarkerData([], true) });
        current.addLayer({
          id: MARKER_LAYER_ID,
          type: "circle",
          source: MARKER_SOURCE_ID,
          paint: {
            "circle-radius": 7,
            "circle-color": ["case", ["==", ["get", "kind"], "start"], ROUTE_COLOR, FINISH_COLOR],
            "circle-stroke-width": 3,
            "circle-stroke-color": HALO_COLOR,
          },
        });

        current.addSource(POSITION_SOURCE_ID, { type: "geojson", data: toGeoJsonPoint(null) });
        // Nabız halkası noktanın ALTINDA durur; "beni takip eden nokta"
        // hissini veren şey bu genişleyip sönen daire.
        current.addLayer({ id: PULSE_LAYER_ID, type: "circle", source: POSITION_SOURCE_ID, paint: { "circle-radius": 10, "circle-color": ROUTE_COLOR, "circle-opacity": 0.3 } });
        current.addLayer({ id: POSITION_LAYER_ID, type: "circle", source: POSITION_SOURCE_ID, paint: { "circle-radius": 8, "circle-color": ROUTE_COLOR, "circle-stroke-width": 3, "circle-stroke-color": HALO_COLOR } });

        if (latestRef.current.reveal) {
          // Ortaya çıkarma başlayana kadar çizgi gizli kalsın.
          setRevealGradients(current, 0);
        }

        readyRef.current = true;
        applyRef.current?.();
      });

      if (captureRef) captureRef.current = {
        capture: () => new Promise((resolve) => {
          const current = mapRef.current;
          if (!current) { resolve(null); return; }
          const grab = () => {
            try { resolve(current.getCanvas().toDataURL("image/png")); }
            catch { resolve(null); } // döşeme sunucusu CORS vermezse canvas kirlenir
          };
          if (current.loaded() && !current.isMoving()) grab();
          else current.once("idle", grab);
        }),
      };
    });

    return () => {
      cancelled = true;
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      map?.remove();
      mapRef.current = null;
      readyRef.current = false;
      centeredRef.current = false;
      fittedRef.current = false;
      revealStartedRef.current = false;
      appliedRouteRef.current = "";
      appliedPositionRef.current = "";
      if (captureRef) captureRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Veriyi haritaya yazan işlev tek yerde durur ve HER ZAMAN `latestRef`ten
  // okur; böylece hem render güncellemeleri hem de `load` olayı aynı yolu
  // kullanır ve harita hazır olmadan gelen noktalar kaybolmaz.
  const applyToMap = () => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const { route: currentRoute, currentPosition: position, live: isLive, reveal: shouldReveal } = latestRef.current;

    const routeSig = routeSignature(currentRoute);
    if (routeSig !== appliedRouteRef.current) {
      appliedRouteRef.current = routeSig;
      (map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined)?.setData(toRouteData(currentRoute));
      (map.getSource(MARKER_SOURCE_ID) as maplibregl.GeoJSONSource | undefined)?.setData(toMarkerData(currentRoute, isLive));

      // Tamamlanmış rota bir kez çerçeveye oturtulur; canlı takipte kamera
      // kullanıcıyı izlediği için çerçeveleme yapılmaz.
      const maplibre = maplibreRef.current;
      if (!isLive && currentRoute.length > 1 && !fittedRef.current && maplibre) {
        fittedRef.current = true;
        const first: [number, number] = [currentRoute[0].lng, currentRoute[0].lat];
        const bounds = currentRoute.reduce((box, p) => box.extend([p.lng, p.lat]), new maplibre.LngLatBounds(first, first));
        map.fitBounds(bounds, { padding: 36, maxZoom: 17, duration: 0 });
      }
      if (shouldReveal && currentRoute.length > 1 && !revealStartedRef.current) startReveal();
    }

    // Canlı olmayan haritada baş nokta yerine başlangıç/bitiş işaretleri var.
    const shownPosition = isLive ? position : null;
    const posSig = pointSignature(shownPosition);
    const positionChanged = posSig !== appliedPositionRef.current;
    if (positionChanged) {
      appliedPositionRef.current = posSig;
      (map.getSource(POSITION_SOURCE_ID) as maplibregl.GeoJSONSource | undefined)?.setData(toGeoJsonPoint(shownPosition));
    }

    if (!position) return;
    if (!centeredRef.current) {
      centeredRef.current = true;
      // Tamamlanmış rota zaten `fitBounds` ile çerçevelendi; üstüne konuma
      // sıçramak o çerçevelemeyi eziyor ve rotanın yalnız son metreleri
      // görünüyordu. Yalnız çerçeveleme YAPILAMADIYSA konuma ortalanır.
      if (isLive || !fittedRef.current) {
        // İlk konum dünya görünümündeyken gelirse yumuşak geçiş yerine
        // doğrudan sıçranır: zoom 1'den 16'ya kaydırmak saniyelerce sürüyordu.
        map.jumpTo({ center: [position.lng, position.lat], zoom: 16 });
      }
      return;
    }
    // Kamera YALNIZ konum gerçekten değiştiğinde kayar. Her render'da
    // easeTo çağırmak haritayı sürekli yeniden çizip pili tüketiyordu.
    if (isLive && positionChanged) map.easeTo({ center: [position.lng, position.lat], duration: 700 });
  };

  /** Rotayı baştan sona çizen tek seferlik animasyon. */
  function startReveal() {
    const map = mapRef.current;
    if (!map || revealStartedRef.current) return;
    revealStartedRef.current = true;
    const startedAt = performance.now();
    const step = () => {
      const current = mapRef.current;
      if (!current) return;
      const elapsed = performance.now() - startedAt;
      const linear = Math.min(1, elapsed / REVEAL_DURATION_MS);
      // Hızlı başlayıp yavaşlayan bir eğri; çizgi "atılıyor" gibi görünür.
      const progress = 1 - Math.pow(1 - linear, 3);
      if (progress >= 1) {
        current.setPaintProperty(ROUTE_LAYER_ID, "line-gradient", solidGradient(ROUTE_COLOR));
        if (current.getLayer(ROUTE_HALO_LAYER_ID)) current.setPaintProperty(ROUTE_HALO_LAYER_ID, "line-gradient", solidGradient(HALO_COLOR));
        return;
      }
      setRevealGradients(current, progress);
      animationFrameRef.current = requestAnimationFrame(step);
    };
    step();
  }

  // Refler render sırasında DEĞİL, render'dan sonra tazelenir (React kuralı).
  // Bağımlılık listesi yok: her render'dan sonra çalışır, böylece haritaya
  // yazılacak veri ile ekrandaki veri hep aynı kalır.
  useEffect(() => {
    latestRef.current = { route, currentPosition, live, reveal };
    applyRef.current = applyToMap;
    applyToMap();
  });

  // Canlı takipteki nabız halkası. Ekran kapalıyken rAF zaten durur, bu
  // yüzden döngü arka planda pil harcamaz.
  useEffect(() => {
    if (!live) return undefined;
    let frame: number | null = null;
    let lastPaint = 0;
    const step = () => {
      const map = mapRef.current;
      if (map && readyRef.current && map.getLayer(PULSE_LAYER_ID)) {
        const now = performance.now();
        if (now - lastPaint >= PULSE_THROTTLE_MS) {
          lastPaint = now;
          const phase = (now % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
          map.setPaintProperty(PULSE_LAYER_ID, "circle-radius", 10 + phase * 20);
          map.setPaintProperty(PULSE_LAYER_ID, "circle-opacity", 0.32 * (1 - phase));
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => { if (frame !== null) cancelAnimationFrame(frame); };
  }, [live]);

  return <div ref={containerRef} className={className || "gps-map-view"} />;
}

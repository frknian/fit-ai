"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import {
  canGoBack as canGoBackIn,
  initialNavState,
  navigate,
  parseRoute,
  restoredScrollY,
  reviveNavState,
  serializeRoute,
  type NavState,
  type Present,
  type Screen,
  type Tab,
} from "@/lib/navigation";
import { registerBackButton } from "@/lib/mobile";

/**
 * Rota durumunu tarayıcı geçmişine bağlar.
 *
 * Kararların tamamı lib/navigation.ts'te (saf, test edilebilir); burada
 * yalnızca yan etkiler var:
 *
 *   1. Her gezinme bir geçmiş girdisi bırakır → Android geri tuşu çalışır,
 *      derin bağlantı ve yenileme yerini korur.
 *   2. Geri dönüldüğünde kaydırma konumu geri yüklenir.
 *   3. Donanım geri tuşu rota yığınını tüketir, bitince uygulamayı arka plana
 *      alır.
 *
 * Geri gitme DAİMA `history.back()` üzerinden yapılır — durumu doğrudan
 * değiştirip geçmişi olduğu gibi bırakmak, tarayıcının ileri/geri sırasını
 * bizimkinden ayırırdı.
 *
 * TASARIM: doğruluk kaynağı `window.history`, React state'i değil. Bu yüzden
 * durum `useSyncExternalStore` ile okunuyor — React'in dış depolar için
 * tasarladığı API (lib/preferences.ts'te de aynı kalıp kullanılıyor).
 * Alternatifi, mount'ta URL'yi okuyup setState etmekti; o hem sunucu/istemci
 * uyuşmazlığı üretiyordu hem de fazladan bir render turu açıyordu.
 * useSyncExternalStore hidrasyonda sunucu anlık görüntüsünü kullanıp sonra
 * gerçek rotaya kendiliğinden geçiyor.
 */

// --- Geçmişe bağlı dış depo --------------------------------------------------

/**
 * Sunucunun çizdiği rota. SABİT olmalı: getServerSnapshot her çağrıda yeni bir
 * nesne dönerse React sonsuz render döngüsüne girer.
 */
const SERVER_SNAPSHOT: NavState = initialNavState();

let snapshot: NavState | null = null;
const listeners = new Set<() => void>();

function readFromBrowser(base?: NavState): NavState {
  const fromHistory = reviveNavState((window.history.state as { hedefitNav?: unknown } | null)?.hedefitNav);
  if (fromHistory) return fromHistory;
  return base ? parseRoute(window.location.search, base) : parseRoute(window.location.search);
}

function getSnapshot(): NavState {
  if (snapshot === null) snapshot = readFromBrowser();
  return snapshot;
}

function getServerSnapshot(): NavState {
  return SERVER_SNAPSHOT;
}

function setSnapshot(next: NavState) {
  if (next === snapshot) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

/** Geri/ileri: durum geçmişten geri OKUNUR, biz yeni girdi yazmayız. */
function onPopState() {
  setSnapshot(readFromBrowser(snapshot ?? undefined));
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener("popstate", onPopState);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("popstate", onPopState);
  };
}

const routeUrl = (state: NavState) => `${window.location.pathname}?${serializeRoute(state)}`;

/**
 * Rotanın TAMAMI `history.state`'e yazılır: URL yalnız aktif sekmeyi taşıyor,
 * oysa geri dönen kullanıcı öbür sekmelerde ve kaydırmada da kaldığı yeri
 * bulmalı.
 */
function writeHistory(state: NavState, mode: "push" | "replace") {
  const payload = { hedefitNav: state };
  if (mode === "push") window.history.pushState(payload, "", routeUrl(state));
  else window.history.replaceState(payload, "", routeUrl(state));
}

/**
 * Ayrılmadan önce bulunduğumuz yerin kaydırma konumunu saklar.
 *
 * Konumun MEVCUT geçmiş girdisine yazılması şart: geri tuşu bir sonraki
 * girdiyi değil, geride bıraktığımız girdiyi okuyor. Yalnız duruma yazıp yeni
 * girdiyi itmek, kaydedilen konumu yanlış girdiye koyuyordu ve geri dönen
 * kullanıcı yine listenin başına düşüyordu (ölçüldü).
 */
function persistScroll(): NavState {
  const current = getSnapshot();
  const saved = navigate(current, { type: "setScroll", scrollY: Math.round(window.scrollY) });
  if (saved === current) return current;
  writeHistory(saved, "replace");
  snapshot = saved;
  return saved;
}

function commit(next: NavState, mode: "push" | "replace") {
  if (next === getSnapshot()) return;
  writeHistory(next, mode);
  setSnapshot(next);
}

// --- Sağlayıcı ---------------------------------------------------------------

type NavigationValue = {
  state: NavState;
  tab: Tab;
  /** Aktif sekmede en üstte duran ekran; sekme kökündeysek null. */
  screen: Screen | null;
  present: Present | null;
  canGoBack: boolean;
  selectTab: (tab: Tab) => void;
  push: (screen: Screen, present?: Present) => void;
  replace: (screen: Screen, present?: Present) => void;
  /** Geri gider. İşleyecek bir şey yoksa `false` döner. */
  goBack: () => boolean;
  popToRoot: () => void;
};

const NavigationContext = createContext<NavigationValue | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Açılıştaki girdinin de rotası olmalı: yoksa ilk geri tuşu, uygulamanın hiç
  // bilmediği boş bir geçmiş girdisine düşerdi. Yalnız geçmişe yazar, duruma
  // dokunmaz.
  useEffect(() => {
    writeHistory(getSnapshot(), "replace");
  }, []);

  // Gezinme tamamlandıktan sonra kaydırma. Rotanın kaydırmadan bağımsız
  // kimliğine bağlı: konumun kendisi değiştiğinde tetiklenmez, yoksa kullanıcı
  // sayfayı kaydırdıkça kendini yukarı çeken bir döngü olurdu.
  const routeKey = serializeRoute(state);
  useEffect(() => {
    window.scrollTo({ top: restoredScrollY(getSnapshot()), left: 0, behavior: "auto" });
  }, [routeKey]);

  const goBack = useCallback((): boolean => {
    if (!canGoBackIn(getSnapshot())) return false;
    // Durumu burada değiştirmiyoruz: history.back() popstate'i tetikler ve
    // durum ORADA kurulur. Tek yol olması, geçmişle durumun ayrışmasını önler.
    window.history.back();
    return true;
  }, []);

  const push = useCallback((screen: Screen, present?: Present) => {
    commit(navigate(persistScroll(), { type: "push", screen, present }), "push");
  }, []);

  const replace = useCallback((screen: Screen, present?: Present) => {
    commit(navigate(getSnapshot(), { type: "replace", screen, present }), "replace");
  }, []);

  /**
   * Sekme seçimi. Aktif sekmeye yeniden basmak yığını köke indirir.
   *
   * Köke inme `history.go(-derinlik)` ile DEĞİL yeni bir girdi iterek yapılır.
   * Nedeni yapısal: tarayıcı geçmişi doğrusal, sekme yığınları değil. Kullanıcı
   * Antrenman'da iki ekran açıp Aktivite'ye geçip geri dönerse o iki ekran
   * artık geçmişin son iki girdisi değildir — `go(-2)` bambaşka bir yere
   * düşerdi (ölçüldü: hiçbir şey olmuyordu).
   *
   * Bedeli: köke indikten sonra geri tuşu kapatılan ekranı geri getirir. Web'in
   * doğrusal geçmiş modeliyle tutarlı; alternatifi geçmiş indekslerini elde
   * tutan kırılgan bir defter.
   */
  const selectTab = useCallback((tab: Tab) => {
    commit(navigate(persistScroll(), { type: "selectTab", tab }), "push");
  }, []);

  const popToRoot = useCallback(() => {
    commit(navigate(persistScroll(), { type: "popToRoot" }), "push");
  }, []);

  // Donanım geri tuşu: rota yığını bitene kadar tüketir, sonra uygulamayı arka
  // plana alır (bkz. lib/mobile.ts → registerBackButton).
  useEffect(() => registerBackButton(goBack), [goBack]);

  const value = useMemo<NavigationValue>(() => {
    const stack = state.stacks[state.tab];
    const top = stack.length ? stack[stack.length - 1] : null;
    return {
      state,
      tab: state.tab,
      screen: top?.screen ?? null,
      present: top?.present ?? null,
      canGoBack: canGoBackIn(state),
      selectTab,
      push,
      replace,
      goBack,
      popToRoot,
    };
  }, [state, selectTab, push, replace, goBack, popToRoot]);

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationValue {
  const value = useContext(NavigationContext);
  if (!value) throw new Error("useNavigation, NavigationProvider içinde çağrılmalı.");
  return value;
}

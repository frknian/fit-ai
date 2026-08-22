// Uygulamanın rota durumu.
//
// NEDEN VAR: gezinme durumu bugün on beş bağımsız değişkende, beş ayrı
// bileşende duruyor (chosenView, activeWorkout, gpsTrackerOpen, paywallOpen,
// settingsOpen, builderId…). Birbirlerinden habersiz oldukları için geçersiz
// bileşimler tip düzeyinde MÜMKÜN: profil açıkken GPS takibi arkada
// çalışabiliyor. Bugün bunu engelleyen şey, koda serpiştirilmiş `setX(false)`
// çağrıları.
//
// Burası React'i, tarayıcıyı ve Supabase'i BİLMEZ. Saf olması iki şey sağlıyor:
// geri tuşu davranışı `node --test` ile doğrulanabiliyor, ve kuralın tek bir
// yeri oluyor.
//
// Tarayıcı geçmişine bağlanma ve kaydırma konumunun geri yüklenmesi
// components/navigation/NavigationProvider.tsx içinde.

/** Alt çubuktaki beş sütun. Her biri bir EYLEM; Profil sekme değildir. */
export type Tab = "today" | "workout" | "activity" | "coach" | "progress";

export const TABS: readonly Tab[] = ["today", "workout", "activity", "coach", "progress"];

/** Uygulamanın açılış sekmesi ve geri tuşunun en son uğradığı yer. */
export const ROOT_TAB: Tab = "today";

/**
 * Bir sekmenin ÜSTÜNE açılan ekranlar.
 *
 * Sekme kökleri burada yok: onlar `Tab` ile temsil edilir. Buradakiler yığına
 * itilen, geri tuşuyla kapanan her şey — tam ekran sayfalar da, alt sayfalar
 * da, kaplamalar da. Üçü arasındaki fark yalnız SUNUM (bkz. Present); geri
 * davranışı hepsinde aynı.
 */
export type Screen =
  | { name: "nutrition" }
  | { name: "calendar" }
  | { name: "programs" }
  | { name: "player"; exerciseIndex: number }
  | { name: "library"; exerciseId?: string }
  | { name: "exerciseDetail"; exerciseId: string }
  | { name: "goalPlan" }
  | { name: "gpsTracker" }
  | { name: "routeLog" }
  | { name: "sleep" }
  | { name: "profile" }
  | { name: "settings" }
  | { name: "profileTest"; question: number }
  | { name: "paywall" }
  | { name: "guide" }
  | { name: "sessionFeedback" };

export type ScreenName = Screen["name"];

/** Ekranın nasıl göründüğü. Geri davranışını DEĞİŞTİRMEZ. */
export type Present = "push" | "sheet" | "modal";

/**
 * Her ekranın varsayılan sunumu.
 *
 * Sunum ekranın kimliğinden türetilir, çağıranın her seferinde söylemesi
 * gerekmez — ve URL'de taşınmaz, çünkü aynı ekran her yerde aynı biçimde
 * açılmalı.
 */
const DEFAULT_PRESENT: Record<ScreenName, Present> = {
  nutrition: "push",
  calendar: "push",
  programs: "push",
  player: "push",
  library: "push",
  exerciseDetail: "sheet",
  goalPlan: "modal",
  gpsTracker: "modal",
  routeLog: "modal",
  sleep: "sheet",
  profile: "push",
  settings: "push",
  profileTest: "push",
  paywall: "modal",
  guide: "modal",
  sessionFeedback: "modal",
};

export type StackEntry = {
  screen: Screen;
  present: Present;
  /**
   * BU ekranın kaydırma konumu. Üstüne yeni bir ekran itilip geri dönüldüğünde
   * buraya geri sarılır; bugün her geçişte 0'a atılıyor ve kullanıcı uzun bir
   * listenin başına düşüyor.
   */
  scrollY: number;
};

/**
 * Sekme başına AYRI yığın.
 *
 * Kullanıcı Antrenman'da program listesine iner, Bugün'e geçip geri
 * döndüğünde kaldığı yerde olmalı. Tek ortak yığın bunu veremez.
 */
export type NavState = {
  tab: Tab;
  stacks: Record<Tab, StackEntry[]>;
  /**
   * Sekme KÖKLERİNİN kaydırma konumu. Yığındaki ekranlar konumunu kendi
   * girdisinde taşır, ama kökün girdisi yok — oysa en uzun sayfa (Bugün,
   * İlerleme) tam da orada. Sekme değiştirip geri dönmek listeyi başa
   * sarmamalı.
   */
  rootScrollY: Record<Tab, number>;
};

export type NavAction =
  | { type: "selectTab"; tab: Tab }
  | { type: "push"; screen: Screen; present?: Present }
  | { type: "pop" }
  | { type: "popToRoot" }
  | { type: "replace"; screen: Screen; present?: Present }
  /** Üstteki girdinin altında kalan kaydırma konumunu günceller. */
  | { type: "setScroll"; scrollY: number };

export function initialNavState(tab: Tab = ROOT_TAB): NavState {
  return {
    tab,
    stacks: { today: [], workout: [], activity: [], coach: [], progress: [] },
    rootScrollY: { today: 0, workout: 0, activity: 0, coach: 0, progress: 0 },
  };
}

/** İki ekran aynı yeri mi gösteriyor? Çift dokunuş korumasında kullanılır. */
export function sameScreen(a: Screen, b: Screen): boolean {
  if (a.name !== b.name) return false;
  // Argümanlar dahil karşılaştırılır: aynı hareketin detayı iki kez üst üste
  // itilmemeli, ama BAŞKA bir hareketin detayı itilebilmeli.
  return JSON.stringify(a) === JSON.stringify(b);
}

const topOf = (state: NavState): StackEntry | null => {
  const stack = state.stacks[state.tab];
  return stack.length ? stack[stack.length - 1] : null;
};

/** Geri gidilecek bir yer var mı? Yoksa çağıran uygulamayı arka plana alır. */
export function canGoBack(state: NavState): boolean {
  return state.stacks[state.tab].length > 0 || state.tab !== ROOT_TAB;
}

/** Şu an görünen ekranın (ya da sekme kökünün) saklı kaydırma konumu. */
export function restoredScrollY(state: NavState): number {
  return topOf(state)?.scrollY ?? state.rootScrollY[state.tab];
}

const withStack = (state: NavState, tab: Tab, stack: StackEntry[]): NavState =>
  ({ tab: state.tab, stacks: { ...state.stacks, [tab]: stack }, rootScrollY: state.rootScrollY });

/**
 * Tek indirgeyici. Gezinme kuralları BURADA yaşar, bileşenlere dağılmaz.
 */
export function navigate(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case "selectTab": {
      // Aktif sekmeye yeniden basmak yığını köke indirir — her mobil
      // uygulamada beklenen davranış; bugün hiçbir şey yapmıyor.
      if (action.tab === state.tab) return withStack(state, state.tab, []);
      // Sekme değişimi DİĞER yığınları korur: kullanıcı bıraktığı yere döner.
      return { tab: action.tab, stacks: state.stacks, rootScrollY: state.rootScrollY };
    }

    case "push": {
      const stack = state.stacks[state.tab];
      const top = stack.length ? stack[stack.length - 1] : null;
      // Çift dokunuş koruması: aynı ekran üst üste iki kez itilirse geri tuşu
      // aynı yerde iki kez basılmayı gerektirirdi.
      if (top && sameScreen(top.screen, action.screen)) return state;
      const entry: StackEntry = {
        screen: action.screen,
        present: action.present ?? DEFAULT_PRESENT[action.screen.name],
        scrollY: 0,
      };
      return withStack(state, state.tab, [...stack, entry]);
    }

    case "pop": {
      const stack = state.stacks[state.tab];
      if (stack.length) return withStack(state, state.tab, stack.slice(0, -1));
      // Sekme kökündeyiz. Kök sekme değilsek geri tuşu Bugün'e götürür;
      // Bugün'ün kökündeysek yapacak bir şey yok (canGoBack false döner ve
      // çağıran uygulamayı arka plana alır).
      return state.tab === ROOT_TAB ? state : { tab: ROOT_TAB, stacks: state.stacks, rootScrollY: state.rootScrollY };
    }

    case "popToRoot":
      return withStack(state, state.tab, []);

    case "replace": {
      const stack = state.stacks[state.tab];
      const entry: StackEntry = {
        screen: action.screen,
        present: action.present ?? DEFAULT_PRESENT[action.screen.name],
        // Değiştirilen girdinin altındaki kaydırma konumu korunur: aynı
        // yerdeyiz, yalnız gösterilen ekran değişti.
        scrollY: stack.length ? stack[stack.length - 1].scrollY : 0,
      };
      return withStack(state, state.tab, stack.length ? [...stack.slice(0, -1), entry] : [entry]);
    }

    case "setScroll": {
      const stack = state.stacks[state.tab];
      // Sekme kökündeysek konum köke yazılır; yığın varsa üstteki ekrana.
      if (!stack.length) {
        if (state.rootScrollY[state.tab] === action.scrollY) return state;
        return { ...state, rootScrollY: { ...state.rootScrollY, [state.tab]: action.scrollY } };
      }
      const top = stack[stack.length - 1];
      if (top.scrollY === action.scrollY) return state;
      return withStack(state, state.tab, [...stack.slice(0, -1), { ...top, scrollY: action.scrollY }]);
    }

    default:
      return state;
  }
}

// --- URL ile taşıma ---------------------------------------------------------
//
// Rota URL'de durunca üç şey birden çözülüyor: tarayıcı geçmişi (dolayısıyla
// Android geri tuşu), derin bağlantı (bildirimden doğrudan antrenmana gitmek)
// ve yenilemede yerini koruma.

const SCREEN_NAMES = new Set<string>(Object.keys(DEFAULT_PRESENT));

/** `player:2`, `library:xyz`, `settings` gibi tek bir ekranı metne çevirir. */
function screenToToken(screen: Screen): string {
  switch (screen.name) {
    case "player": return `player:${screen.exerciseIndex}`;
    case "profileTest": return `profileTest:${screen.question}`;
    case "exerciseDetail": return `exerciseDetail:${screen.exerciseId}`;
    case "library": return screen.exerciseId ? `library:${screen.exerciseId}` : "library";
    default: return screen.name;
  }
}

/**
 * Metinden ekrana. URL kullanıcı tarafından düzenlenebilir, bu yüzden
 * tanınmayan her şey atılır — bozuk bir bağlantı uygulamayı çökertmemeli.
 */
function tokenToScreen(token: string): Screen | null {
  const separator = token.indexOf(":");
  const name = separator === -1 ? token : token.slice(0, separator);
  const argument = separator === -1 ? "" : token.slice(separator + 1);
  if (!SCREEN_NAMES.has(name)) return null;

  switch (name) {
    case "player": {
      const index = Number.parseInt(argument, 10);
      return Number.isInteger(index) && index >= 0 && index < 100 ? { name: "player", exerciseIndex: index } : null;
    }
    case "profileTest": {
      const question = Number.parseInt(argument, 10);
      return Number.isInteger(question) && question >= 0 && question < 100 ? { name: "profileTest", question } : null;
    }
    case "exerciseDetail": {
      const id = sanitizeId(argument);
      return id ? { name: "exerciseDetail", exerciseId: id } : null;
    }
    case "library": {
      const id = sanitizeId(argument);
      return id ? { name: "library", exerciseId: id } : { name: "library" };
    }
    default:
      // Argüman almayan ekranlarda fazladan argüman sessizce yok sayılır.
      return { name } as Screen;
  }
}

/** Hareket kimlikleri katalogda `[a-zA-Z0-9_-]`; gerisi kabul edilmez. */
function sanitizeId(value: string): string {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(value) ? value : "";
}

/**
 * `history.state` içinden rotayı geri okur.
 *
 * Oraya yazan biziz, ama veri tarayıcı oturumu boyunca diskte kalıyor ve eski
 * bir uygulama sürümünden gelmiş olabilir. Bu yüzden yine de doğrulanır;
 * tanınmayan yapıda `null` döner ve çağıran URL'den okumaya düşer.
 *
 * URL'den okumaktan farkı: kaydırma konumlarını ve DİĞER sekmelerin yığınını
 * da taşır — geri tuşuyla dönüldüğünde kullanıcı gerçekten kaldığı yeri bulur.
 */
export function reviveNavState(value: unknown): NavState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (!(TABS as readonly string[]).includes(String(candidate.tab))) return null;
  const stacks = candidate.stacks;
  const rootScrollY = candidate.rootScrollY;
  if (!stacks || typeof stacks !== "object" || !rootScrollY || typeof rootScrollY !== "object") return null;

  const revived = initialNavState(candidate.tab as Tab);
  for (const tab of TABS) {
    const rawStack = (stacks as Record<string, unknown>)[tab];
    if (!Array.isArray(rawStack)) return null;
    const entries: StackEntry[] = [];
    for (const rawEntry of rawStack.slice(0, 12)) {
      if (!rawEntry || typeof rawEntry !== "object") return null;
      const entry = rawEntry as Record<string, unknown>;
      const screen = entry.screen as Screen | undefined;
      if (!screen || typeof screen !== "object" || !SCREEN_NAMES.has(String(screen.name))) return null;
      entries.push({
        screen,
        present: DEFAULT_PRESENT[screen.name],
        scrollY: toScroll(entry.scrollY),
      });
    }
    revived.stacks[tab] = entries;
    revived.rootScrollY[tab] = toScroll((rootScrollY as Record<string, unknown>)[tab]);
  }
  return revived;
}

const toScroll = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
};

/** Rotanın sorgu dizesi hâli: `t=workout&s=programs,player:2`. */
export function serializeRoute(state: NavState): string {
  const parameters = new URLSearchParams();
  parameters.set("t", state.tab);
  const stack = state.stacks[state.tab];
  if (stack.length) parameters.set("s", stack.map((entry) => screenToToken(entry.screen)).join(","));
  return parameters.toString();
}

/**
 * Sorgu dizesinden rota.
 *
 * YALNIZ aktif sekmenin yığınını taşır: diğer sekmelerin yığını oturum içi bir
 * kolaylıktır, paylaşılan bir bağlantının parçası değil. Bu yüzden `base`
 * verilirse öbür yığınlar ondan korunur (geri/ileri gezinmede kayıp olmaz).
 */
export function parseRoute(query: string, base: NavState = initialNavState()): NavState {
  const parameters = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  const tabValue = parameters.get("t") || "";
  const tab = (TABS as readonly string[]).includes(tabValue) ? tabValue as Tab : ROOT_TAB;
  const raw = parameters.get("s") || "";
  const screens = raw ? raw.split(",").map(tokenToScreen).filter((screen): screen is Screen => screen !== null) : [];
  const stack: StackEntry[] = screens.slice(0, 12).map((screen) => ({
    screen,
    present: DEFAULT_PRESENT[screen.name],
    scrollY: 0,
  }));
  return { tab, stacks: { ...base.stacks, [tab]: stack }, rootScrollY: base.rootScrollY };
}

// --- GEÇİŞ DÖNEMİ: eski görünüm adları -------------------------------------
//
// Kabuk bugün hâlâ sekiz görünümlü eski `AppView` listesiyle çalışıyor
// (bkz. lib/quick-actions.ts). Bu bölüm o adları yeni rota modeline çevirir,
// böylece geri tuşu ve derin bağlantı, sekmeler henüz beşe indirilmeden
// çalışmaya başlar.
//
// Faz 3'te (beş sekmeye geçiş) BU BÖLÜM SİLİNİR: ekranlar doğrudan sekme ve
// yığın üzerinden adreslenecek.

export type LegacyView = "plan" | "activity" | "workout" | "progress" | "library" | "nutrition" | "calendar" | "profile";

/**
 * Eski görünüm → yeni rota. Dördü sekme kökü; kalan dördü hedef tasarımda
 * zaten bir sekmenin ÜSTÜNDE açılacak ekranlar (bkz. docs/MOBIL_TASARIM_PLANI.md
 * 3.1), bu yüzden şimdiden yığına itiliyorlar.
 */
const VIEW_ROUTE: Record<LegacyView, { tab: Tab; screen?: Screen }> = {
  plan: { tab: "today" },
  activity: { tab: "activity" },
  workout: { tab: "workout" },
  progress: { tab: "progress" },
  nutrition: { tab: "today", screen: { name: "nutrition" } },
  calendar: { tab: "today", screen: { name: "calendar" } },
  profile: { tab: "today", screen: { name: "profile" } },
  library: { tab: "workout", screen: { name: "library" } },
};

export function routeForView(view: LegacyView): { tab: Tab; screen?: Screen } {
  return VIEW_ROUTE[view];
}

const TAB_VIEW: Record<Tab, LegacyView> = {
  today: "plan",
  workout: "workout",
  activity: "activity",
  progress: "progress",
  // Koç'un henüz kendi görünümü yok; sekme Faz 3'te devreye girer.
  coach: "plan",
};

/**
 * Yeni rota → eski görünüm adı.
 *
 * Yığın YUKARIDAN AŞAĞI taranır: en üstteki ekran bir görünüme karşılık
 * gelmiyor olabilir (ödeme duvarı, kılavuz, GPS takibi bir görünüm değil,
 * kaplamadır) ve o durumda altındaki sayfa çizilmeye devam etmeli. Yalnız en
 * üste bakmak, kaplama açılınca arkasındaki sayfayı render'dan düşürüyordu.
 */
export function viewForRoute(tab: Tab, screens: readonly Screen[] | Screen | null): LegacyView {
  const stack = Array.isArray(screens) ? screens : screens ? [screens as Screen] : [];
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const name = stack[index].name;
    const match = (Object.keys(VIEW_ROUTE) as LegacyView[]).find((view) => VIEW_ROUTE[view].screen?.name === name);
    if (match) return match;
  }
  return TAB_VIEW[tab];
}

import assert from "node:assert/strict";
import test from "node:test";
import {
  ROOT_TAB,
  TABS,
  canGoBack,
  initialNavState,
  navigate,
  parseRoute,
  restoredScrollY,
  reviveNavState,
  sameScreen,
  serializeRoute,
  routeForView,
  viewForRoute,
} from "../lib/navigation.ts";

/** Eylemleri sırayla uygular; okunur senaryolar yazmak için. */
const run = (state, ...actions) => actions.reduce(navigate, state);
const push = (screen) => ({ type: "push", screen });
const tab = (name) => ({ type: "selectTab", tab: name });
const stackOf = (state) => state.stacks[state.tab].map((entry) => entry.screen.name);

test("başlangıçta Bugün sekmesinde ve yığınlar boş", () => {
  const state = initialNavState();
  assert.equal(state.tab, ROOT_TAB);
  assert.equal(TABS.length, 5);
  for (const name of TABS) assert.deepEqual(state.stacks[name], []);
  // Kökteyken geri gidilecek yer yok: çağıran uygulamayı arka plana alır.
  assert.equal(canGoBack(state), false);
});

test("ekran itilir, geri tuşu tek tek geri alır", () => {
  const state = run(initialNavState(), tab("workout"), push({ name: "programs" }), push({ name: "player", exerciseIndex: 0 }));
  assert.deepEqual(stackOf(state), ["programs", "player"]);
  assert.equal(canGoBack(state), true);

  const back1 = navigate(state, { type: "pop" });
  assert.deepEqual(stackOf(back1), ["programs"]);
  const back2 = navigate(back1, { type: "pop" });
  assert.deepEqual(stackOf(back2), []);
  // Yığın boşaldı ama hâlâ kök olmayan bir sekmedeyiz.
  assert.equal(back2.tab, "workout");
  assert.equal(canGoBack(back2), true);
});

test("kök olmayan sekmenin kökünde geri tuşu Bugün'e götürür, oradan çıkar", () => {
  // Android'de beklenen davranış: geri tuşu önce ana sekmeye, sonra uygulamadan.
  const onWorkout = navigate(initialNavState(), tab("workout"));
  const home = navigate(onWorkout, { type: "pop" });
  assert.equal(home.tab, ROOT_TAB);
  assert.equal(canGoBack(home), false, "Bugün kökünden sonra geri gidilecek yer kalmamalı");
});

test("sekme değişimi diğer yığınları korur", () => {
  // Kullanıcı Antrenman'da program listesine iner, Bugün'e geçer, geri döner:
  // kaldığı yerde olmalı. Tek ortak yığın bunu veremezdi.
  const state = run(
    initialNavState(),
    tab("workout"), push({ name: "programs" }),
    tab("activity"), push({ name: "gpsTracker" }),
    tab("today"),
  );
  assert.deepEqual(state.stacks.workout.map((e) => e.screen.name), ["programs"]);
  assert.deepEqual(state.stacks.activity.map((e) => e.screen.name), ["gpsTracker"]);
  assert.deepEqual(stackOf(state), [], "Bugün'ün kendi yığını boş");

  const backToWorkout = navigate(state, tab("workout"));
  assert.deepEqual(stackOf(backToWorkout), ["programs"]);
});

test("aktif sekmeye yeniden basmak köke indirir", () => {
  const deep = run(initialNavState(), tab("workout"), push({ name: "programs" }), push({ name: "library" }));
  assert.equal(deep.stacks.workout.length, 2);
  const reset = navigate(deep, tab("workout"));
  assert.deepEqual(stackOf(reset), [], "aynı sekmeye basınca yığın köke inmeli");
  // Diğer sekmelere dokunulmaz.
  assert.deepEqual(reset.stacks.activity, []);
});

test("aynı ekran üst üste iki kez itilmez", () => {
  // Çift dokunuşta geri tuşu aynı yerde iki kez basılmayı gerektirirdi.
  const once = navigate(initialNavState(), push({ name: "settings" }));
  const twice = navigate(once, push({ name: "settings" }));
  assert.equal(twice.stacks.today.length, 1);
  assert.equal(twice, once, "değişiklik yoksa aynı nesne dönmeli");

  // Ama BAŞKA bir argümanla aynı ekran itilebilir.
  const first = navigate(initialNavState(), push({ name: "exerciseDetail", exerciseId: "a" }));
  const second = navigate(first, push({ name: "exerciseDetail", exerciseId: "b" }));
  assert.equal(second.stacks.today.length, 2);
});

test("sameScreen argümanları da karşılaştırır", () => {
  assert.equal(sameScreen({ name: "player", exerciseIndex: 1 }, { name: "player", exerciseIndex: 1 }), true);
  assert.equal(sameScreen({ name: "player", exerciseIndex: 1 }, { name: "player", exerciseIndex: 2 }), false);
  assert.equal(sameScreen({ name: "library" }, { name: "settings" }), false);
});

test("replace üstteki ekranı değiştirir, yığını büyütmez", () => {
  const state = run(initialNavState(), push({ name: "programs" }), { type: "replace", screen: { name: "library" } });
  assert.deepEqual(stackOf(state), ["library"]);
  // Boş yığında replace, push gibi davranır.
  const fromEmpty = navigate(initialNavState(), { type: "replace", screen: { name: "settings" } });
  assert.deepEqual(stackOf(fromEmpty), ["settings"]);
});

test("popToRoot yığını boşaltır", () => {
  const state = run(initialNavState(), push({ name: "profile" }), push({ name: "settings" }), { type: "popToRoot" });
  assert.deepEqual(stackOf(state), []);
});

test("kaydırma konumu yığında taşınır ve geri dönünce geri yüklenir", () => {
  // Bugün her görünüm geçişinde scrollTo(0) yapılıyor; kütüphanede 400.
  // harekete inip detay açan kullanıcı geri dönünce listenin başına düşüyor.
  const opened = run(initialNavState(), tab("workout"), push({ name: "library" }), { type: "setScroll", scrollY: 1840 });
  assert.equal(restoredScrollY(opened), 1840);

  const detail = navigate(opened, push({ name: "exerciseDetail", exerciseId: "abc" }));
  assert.equal(restoredScrollY(detail), 0, "yeni ekran her zaman 0'dan başlar");

  const back = navigate(detail, { type: "pop" });
  assert.equal(restoredScrollY(back), 1840, "geri dönünce kaldığı yere sarılmalı");
});

test("sekme kökünün kaydırma konumu da korunur", () => {
  // En uzun sayfalar sekme köklerinde (Bugün, İlerleme). Yığında girdileri
  // olmadığı için konumları ayrıca saklanır.
  const scrolled = navigate(initialNavState(), { type: "setScroll", scrollY: 640 });
  assert.equal(restoredScrollY(scrolled), 640);

  const otherTab = navigate(scrolled, tab("progress"));
  assert.equal(restoredScrollY(otherTab), 0, "her sekmenin kökü kendi konumunu tutar");
  assert.equal(restoredScrollY(navigate(otherTab, tab("today"))), 640, "geri dönünce konum korunur");

  // Aynı değerle çağırmak yeni nesne üretmez.
  assert.equal(navigate(scrolled, { type: "setScroll", scrollY: 640 }), scrolled);
});

test("sunum biçimi ekranın kimliğinden gelir", () => {
  const state = run(initialNavState(), push({ name: "programs" }), push({ name: "paywall" }));
  const [programs, paywall] = state.stacks.today;
  assert.equal(programs.present, "push");
  assert.equal(paywall.present, "modal", "ödeme duvarı kaplama olarak açılmalı");
  // Sunum geri davranışını değiştirmez: ikisi de tek pop ile kapanır.
  assert.equal(navigate(state, { type: "pop" }).stacks.today.length, 1);
});

// --- URL ile taşıma ---------------------------------------------------------

test("rota URL'ye yazılır ve geri okunur", () => {
  const state = run(initialNavState(), tab("workout"), push({ name: "programs" }), push({ name: "player", exerciseIndex: 2 }));
  const query = serializeRoute(state);
  assert.equal(query, "t=workout&s=programs%2Cplayer%3A2");

  const parsed = parseRoute(query);
  assert.equal(parsed.tab, "workout");
  assert.deepEqual(stackOf(parsed), ["programs", "player"]);
  assert.deepEqual(parsed.stacks.workout[1].screen, { name: "player", exerciseIndex: 2 });
});

test("argümanlı ekranlar URL'de kimliğini korur", () => {
  const state = navigate(initialNavState(), push({ name: "library", exerciseId: "Barbell_Squat" }));
  const parsed = parseRoute(serializeRoute(state));
  assert.deepEqual(parsed.stacks.today[0].screen, { name: "library", exerciseId: "Barbell_Squat" });

  // Argümansız kütüphane de geçerli.
  const plain = parseRoute(serializeRoute(navigate(initialNavState(), push({ name: "library" }))));
  assert.deepEqual(plain.stacks.today[0].screen, { name: "library" });
});

test("bozuk URL uygulamayı çökertmez, tanınmayanı atar", () => {
  // URL kullanıcı tarafından düzenlenebilir; her token doğrulanmalı.
  assert.equal(parseRoute("t=uzay").tab, ROOT_TAB, "tanınmayan sekme köke düşer");
  assert.deepEqual(stackOf(parseRoute("t=today&s=bilinmeyen")), []);
  assert.deepEqual(stackOf(parseRoute("t=today&s=player:abc")), [], "sayı olmayan indeks atılır");
  assert.deepEqual(stackOf(parseRoute("t=today&s=player:-1")), [], "negatif indeks atılır");
  assert.deepEqual(stackOf(parseRoute("t=today&s=exerciseDetail:../../etc")), [], "kimlik biçimi zorunlu");
  assert.deepEqual(parseRoute("").stacks, initialNavState().stacks);
  // Geçerli ve geçersiz karışıksa yalnız geçerliler kalır.
  assert.deepEqual(stackOf(parseRoute("t=today&s=settings,çöp,profile")), ["settings", "profile"]);
});

test("URL'den okuma diğer sekmelerin yığınını korur", () => {
  // Geri/ileri gezinirken öbür sekmelerde kalınan yer kaybolmamalı.
  const base = run(initialNavState(), tab("activity"), push({ name: "routeLog" }), tab("today"));
  const parsed = parseRoute("t=workout&s=programs", base);
  assert.deepEqual(parsed.stacks.activity.map((e) => e.screen.name), ["routeLog"]);
  assert.deepEqual(parsed.stacks.workout.map((e) => e.screen.name), ["programs"]);
});

test("çok uzun yığın URL'den okunurken sınırlanır", () => {
  const long = Array.from({ length: 40 }, () => "settings").join(",");
  assert.ok(parseRoute(`t=today&s=${long}`).stacks.today.length <= 12);
});

test("geçersiz durum üretilemez: her yığın kendi sekmesine ait", () => {
  // Eski modelde activeView='profile' iken gpsTrackerOpen=true olabiliyordu.
  // Yeni modelde açık ekran her zaman AKTİF sekmenin yığınındadır.
  const state = run(initialNavState(), tab("activity"), push({ name: "gpsTracker" }), tab("progress"));
  assert.deepEqual(stackOf(state), [], "başka sekmeye geçince o sekmenin yığını görünür");
  assert.equal(state.tab, "progress");
  // GPS ekranı kaybolmadı, kendi sekmesinde duruyor.
  assert.deepEqual(state.stacks.activity.map((e) => e.screen.name), ["gpsTracker"]);
});

test("history.state'ten geri okuma kaydırma ve öbür sekmeleri korur", () => {
  // URL yalnız aktif sekmenin yığınını taşır; geri tuşuyla dönüldüğünde
  // kullanıcının gerçekten kaldığı yeri bulması için history.state kullanılır.
  const state = run(
    initialNavState(),
    tab("activity"), push({ name: "routeLog" }),
    tab("workout"), push({ name: "library" }), { type: "setScroll", scrollY: 920 },
  );
  const revived = reviveNavState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(revived, state);
  assert.equal(restoredScrollY(revived), 920);
  assert.deepEqual(revived.stacks.activity.map((e) => e.screen.name), ["routeLog"]);
});

test("bozuk history.state null döner, çağıran URL'den okumaya düşer", () => {
  assert.equal(reviveNavState(null), null);
  assert.equal(reviveNavState("metin"), null);
  assert.equal(reviveNavState({ tab: "uzay", stacks: {}, rootScrollY: {} }), null);
  // Eski bir uygulama sürümünden kalan, artık var olmayan ekran.
  assert.equal(reviveNavState({
    tab: "today",
    stacks: { today: [{ screen: { name: "kaldirilmis" } }], workout: [], activity: [], coach: [], progress: [] },
    rootScrollY: { today: 0, workout: 0, activity: 0, coach: 0, progress: 0 },
  }), null);
  // Sekmelerden biri eksikse de reddedilir.
  assert.equal(reviveNavState({ tab: "today", stacks: { today: [] }, rootScrollY: {} }), null);
});

test("bozuk kaydırma değerleri sıfıra çekilir", () => {
  const revived = reviveNavState({
    tab: "today",
    stacks: { today: [{ screen: { name: "settings" }, scrollY: -50 }], workout: [], activity: [], coach: [], progress: [] },
    rootScrollY: { today: "abc", workout: 0, activity: 0, coach: 0, progress: 0 },
  });
  assert.equal(revived.stacks.today[0].scrollY, 0);
  assert.equal(revived.rootScrollY.today, 0);
});

// --- Geçiş dönemi: eski görünüm adları --------------------------------------

test("eski sekiz görünümün her biri bir rotaya karşılık gelir", () => {
  const views = ["plan", "activity", "workout", "progress", "library", "nutrition", "calendar", "profile"];
  for (const view of views) {
    const route = routeForView(view);
    assert.ok(route && TABS.includes(route.tab), `rotası olmayan görünüm: ${view}`);
    // Gidiş-dönüş: rotadan geri okunan ad, başladığımız ad olmalı.
    assert.equal(viewForRoute(route.tab, route.screen ? [route.screen] : []), view);
  }
});

test("dört görünüm sekme kökü, dördü yığında durur", () => {
  for (const view of ["plan", "activity", "workout", "progress"]) {
    assert.equal(routeForView(view).screen, undefined, `${view} sekme kökü olmalı`);
  }
  // Hedef tasarımda zaten bir sekmenin üstünde açılacak olanlar.
  assert.deepEqual(routeForView("nutrition"), { tab: "today", screen: { name: "nutrition" } });
  assert.deepEqual(routeForView("library"), { tab: "workout", screen: { name: "library" } });
});

test("görünüme karşılık gelmeyen ekranda sekmenin görünümü döner", () => {
  assert.equal(viewForRoute("today", [{ name: "settings" }]), "plan");
  assert.equal(viewForRoute("workout", [{ name: "player", exerciseIndex: 0 }]), "workout");
  assert.equal(viewForRoute("activity", []), "activity");
});

test("kaplama açıkken arkasındaki sayfa çizilmeye devam eder", () => {
  // Ödeme duvarı, kılavuz ve GPS takibi birer görünüm değil kaplamadır.
  // Yalnız en üste bakmak, kaplama açılınca arkadaki sayfayı düşürüyordu.
  assert.equal(viewForRoute("today", [{ name: "profile" }, { name: "paywall" }]), "profile");
  assert.equal(viewForRoute("workout", [{ name: "library" }, { name: "exerciseDetail", exerciseId: "a" }]), "library");
  assert.equal(viewForRoute("activity", [{ name: "gpsTracker" }]), "activity");
});

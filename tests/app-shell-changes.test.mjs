import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BODY_REGIONS,
  CUSTOM_PROGRAM_LIMIT,
  CUSTOM_REGION_LIMIT,
  TRAINING_AREAS,
  distributeRegionExercises,
  nextFreeSlot,
  normalizeCustomRegions,
  removeCustomRegion,
  upsertCustomRegion,
} from "../lib/training-programs.ts";
import { allActivityCatalog } from "../lib/sports.ts";
import { activityIconName } from "../lib/activity-icons.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

// --- Bölgesel çalışmalar (birleşik gruplar + özelleştirme) -------------------

test("sabit bölgeler tekil kasların yanında birleşik grupları da içerir", () => {
  const ids = BODY_REGIONS.map((region) => region.id);
  for (const id of ["chest", "back", "shoulders", "arms", "legs", "core"]) {
    assert.ok(ids.includes(id), `tekil bölge eksik: ${id}`);
  }
  // Kullanıcıların gerçekte konuştuğu gruplar: "üst vücut", "arka vücut",
  // "itiş/çekiş günü". Eskiden yalnız tek bir katalog alanı seçilebiliyordu.
  for (const id of ["upperBody", "lowerBody", "posterior", "push", "pull"]) {
    assert.ok(ids.includes(id), `birleşik bölge eksik: ${id}`);
  }
  // Her bölgenin alanları katalogda gerçekten var olmalı.
  const valid = new Set(TRAINING_AREAS);
  for (const region of BODY_REGIONS) {
    assert.ok(region.areas.length > 0, `${region.id} boş`);
    for (const area of region.areas) assert.ok(valid.has(area), `${region.id} tanınmayan alan: ${area}`);
  }
});

test("birleşik bölgede hareketler bölgeler arasında sırayla dağıtılır", () => {
  // Tek listeden ilk N hareketi almak, alfabetik sıra yüzünden "üst vücut"
  // seansını baştan sona göğüs hareketine çevirebiliyordu.
  const pool = [
    { name: "A", area: "Göğüs" }, { name: "B", area: "Göğüs" }, { name: "C", area: "Göğüs" },
    { name: "D", area: "Sırt" }, { name: "E", area: "Sırt" },
    { name: "F", area: "Omuz" },
  ];
  const picked = distributeRegionExercises(pool, ["Göğüs", "Sırt", "Omuz"], 4);
  assert.deepEqual(picked.map((item) => item.area), ["Göğüs", "Sırt", "Omuz", "Göğüs"]);
});

test("bölgede yeterli hareket yoksa dağıtım sonsuza girmez", () => {
  const pool = [{ name: "A", area: "Göğüs" }];
  const picked = distributeRegionExercises(pool, ["Göğüs", "Sırt"], 6);
  assert.equal(picked.length, 1);
  assert.equal(distributeRegionExercises([], ["Göğüs"], 6).length, 0);
});

test("özel bölgeler doğrulanır, eklenir ve silinir", () => {
  const region = { id: "region-1", name: "İtiş günü", areas: ["Göğüs", "Omuz", "Kol"] };
  assert.deepEqual(normalizeCustomRegions([region]), [region]);
  // Bozuk kayıt uygulamayı çökertmemeli, sessizce atılmalı.
  assert.deepEqual(normalizeCustomRegions("bozuk"), []);
  assert.deepEqual(normalizeCustomRegions([{ id: "x", name: "", areas: ["Göğüs"] }]), []);
  assert.deepEqual(normalizeCustomRegions([{ id: "x", name: "Ad", areas: ["Uzay"] }]), [], "katalogda olmayan alan kabul edilmemeli");
  // Üst sınır tercih deposunun şişmesini engeller.
  const many = Array.from({ length: CUSTOM_REGION_LIMIT + 3 }, (_, index) => ({ id: `r${index}`, name: `Ad ${index}`, areas: ["Kol"] }));
  assert.equal(normalizeCustomRegions(many).length, CUSTOM_REGION_LIMIT);
  // Aynı kimlik iki kayıt üretmez, günceller.
  const updated = upsertCustomRegion([region], { ...region, name: "Çekiş günü" });
  assert.equal(updated.length, 1);
  assert.equal(updated[0].name, "Çekiş günü");
  assert.deepEqual(removeCustomRegion([region], "region-1"), []);
});

// --- Program sayısı artıp azalır --------------------------------------------

test("program sayısı ihtiyaca göre artar, silinen kimlik yeniden kullanılır", () => {
  assert.equal(nextFreeSlot([]), "custom-1");
  assert.equal(nextFreeSlot([{ id: "custom-1", name: "A", exercises: [], updatedAt: "" }]), "custom-2");
  // Aradaki bir program silinirse boşalan kimlik yeniden kullanılır.
  assert.equal(nextFreeSlot([
    { id: "custom-1", name: "A", exercises: [], updatedAt: "" },
    { id: "custom-3", name: "C", exercises: [], updatedAt: "" },
  ]), "custom-2");
  // Üst sınıra ulaşıldığında "yeni program" kartı hiç gösterilmez.
  const full = Array.from({ length: CUSTOM_PROGRAM_LIMIT }, (_, index) => ({ id: `custom-${index + 1}`, name: "A", exercises: [], updatedAt: "" }));
  assert.equal(nextFreeSlot(full), null);
  assert.ok(CUSTOM_PROGRAM_LIMIT > 3, "eski sabit üç slot sınırı kalkmalı");
});

// --- Aktivite simgeleri ------------------------------------------------------

test("her aktivitenin kendi simgesi var, baş harf kullanılmıyor", () => {
  for (const activity of allActivityCatalog) {
    assert.notEqual(activityIconName(activity.key), "generic", `simgesi olmayan aktivite: ${activity.key}`);
  }
  // Katalogda olmayan bir anahtar sessizce genel simgeye düşer.
  assert.equal(activityIconName("bilinmeyen-spor"), "generic");
});

test("aktivite listeleri simgeyi bileşenden alır", async () => {
  const [logger, log] = await Promise.all([
    read("../components/ActivityLogger.tsx"),
    read("../components/ActivityLog.tsx"),
  ]);
  assert.match(logger, /<ActivityIcon name=\{activity\.key\} \/>/);
  assert.match(logger, /<ActivityIcon name=\{entry\.activityKey\} \/>/);
  // Rotası olmayan (manuel) kayıt boş gri kutu yerine simge gösterir.
  assert.match(log, /route-preview-thumb-placeholder"><ActivityIcon name=\{entry\.activityKey\}/);
  // Baş harf yedeği ("SP") kalmamalı.
  assert.ok(!logger.includes('?.icon || "SP"'), "baş harf yedeği kalmış");
});

// --- Arka plandan dönüşte yükleme ekranı ------------------------------------

test("uygulama arka plandan dönünce hazırlık ekranı geri gelmez", async () => {
  const app = await read("../components/FitAiApp.tsx");
  // Supabase her token tazelemesinde yeni bir User nesnesi verir; doğrudan
  // state'e yazılırsa authUser'a bağlı tüm efektler baştan çalışır.
  assert.match(app, /current && next && current\.id === next\.id \? current : next/);
  // Profili zaten yüklenmiş kullanıcı için "loading" durumuna dönülmez.
  assert.match(app, /if \(verifiedUser\.id === loadedProfileUserId\.current\) return current === "loading" \? "active" : current;/);
  assert.match(app, /loadedProfileUserId\.current = userId;/);
  // Çıkışta işaret temizlenmeli; yoksa sonraki kullanıcı eski profili görürdü.
  assert.match(app, /loadedProfileUserId\.current = null;/);
});

// --- Bildirim çubuğu simgesi -------------------------------------------------

test("bildirim çubuğu simgesi yürüyen insan, ok değil", async () => {
  const icon = await read("../android/app/src/main/res/drawable/ic_stat_fit_ai.xml");
  // Eski simge tek parçalı bir ok işaretiydi; yürüyen figür baş + gövde olarak
  // iki yoldan oluşur.
  assert.equal(icon.match(/<path/g)?.length, 2, "yürüyen figür baş ve gövde yolundan oluşmalı");
  assert.ok(!icon.includes("M5,19 L17,7"), "eski ok yolu kalmış");
  // Android küçük bildirim simgesini siluet olarak çizer: tek renk beyaz.
  assert.ok(!/fillColor="(?!#FFFFFFFF)/.test(icon));
  const service = await read("../android/app/src/main/java/com/hedefit/app/stepcounter/StepCounterService.kt");
  assert.match(service, /ic_stat_fit_ai/);
});

// --- Kullanma kılavuzu -------------------------------------------------------

test("kılavuz ilk girişte açılır, sonra ayarlardan erişilir", async () => {
  const [app, guide, settings] = await Promise.all([
    read("../components/FitAiApp.tsx"),
    read("../components/UserGuide.tsx"),
    read("../components/SettingsPanel.tsx"),
  ]);
  // İlk girişte kendiliğinden: "henüz görülmedi" durumu efektle ikinci bir
  // state'e kopyalanmaz, doğrudan türetilir.
  assert.match(app, /\(guideOpen \|\| \(step === STEP\.dashboard && !guideSeen\)\) && <UserGuide/);
  // Kapatan (ya da atlayan) kullanıcı bir daha zorla karşılaşmaz.
  assert.match(app, /setStoredGuideSeen\(true\)/);
  // Ayarlardan istendiği zaman açılır.
  assert.match(settings, /onClick=\{onOpenGuide\}/);
  // Kılavuz adımları uygulamanın gerçek sekmelerini anlatır.
  assert.match(guide, /t\.userGuide\.steps/);
  const dictionary = await read("../lib/i18n/dictionaries/tr.ts");
  const steps = dictionary.slice(dictionary.indexOf("  userGuide: {"), dictionary.indexOf("  stepNotification: {"));
  for (const title of ["Ana sayfa", "Antrenman", "Aktivite", "Beslenme", "İlerleme", "Takvim"]) {
    assert.ok(steps.includes(`title: "${title}"`), `kılavuzda eksik adım: ${title}`);
  }
});

// --- Hareket kütüphanesi -----------------------------------------------------

test("kütüphane filtreleri sayılı rozetlere çevrildi", async () => {
  const [filters, library] = await Promise.all([
    read("../components/exercises/ExerciseFilters.tsx"),
    read("../components/exercises/ExerciseLibrary.tsx"),
  ]);
  // Açılır liste 873 hareketlik bir katalogda kötü bir gezinme aracı:
  // seçenekler açılmadan görünmez ve kaç sonuç çıkacağı belli değildir.
  assert.ok(!filters.includes("<select"), "açılır liste kalmamalı");
  assert.match(filters, /function FacetRow/);
  // Her boyut kendi satırında ve her rozet sayısıyla birlikte.
  for (const facet of ["muscles", "equipment", "categories", "levels"]) {
    assert.ok(filters.includes(`counts.${facet}`), `sayaç bağlanmamış: ${facet}`);
  }
  assert.match(library, /countExercisesByFacet\(filters, "muscle"\)/);
  // Seçiliye yeniden basmak filtreyi kaldırır.
  assert.match(filters, /onSelect\(active \? "" : value\)/);
});

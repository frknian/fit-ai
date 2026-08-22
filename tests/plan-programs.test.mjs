import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { extractWeeklyDays } from "../lib/training-profile.ts";
import { EQUIPMENT_PROFILES, buildReadyProgram } from "../lib/ready-programs.ts";

const appSource = await readFile(new URL("../components/FitAiApp.tsx", import.meta.url), "utf8");

// Hazır programlar artık katalogdan üretiliyor, sabit liste değil. Bu yüzden
// kaynağı regex'lemek yerine gerçek katalogla üretimi çalıştırıyoruz — böylece
// test, kataloğa hareket eklendiğinde de anlamını koruyor.
function parseCatalog() {
  const block = (name) => {
    const start = appSource.indexOf(`const ${name}`);
    return appSource.slice(start, appSource.indexOf("\n];", start));
  };
  const core = [...block("coreExerciseLibrary").matchAll(
    /name: "([^"]+)"[^}]*?area: "([^"]+)"[^}]*?requires: \[([^\]]*)\], bodyweight: (true|false)/g,
  )];
  const extra = [...block("additionalExerciseDefinitions").matchAll(
    /^\s*\["([^"]+)", "[^"]+", "([^"]+)", "[^"]+", \[([^\]]*)\], (true|false)/gm,
  )];
  return [...core, ...extra].map((match) => ({
    name: match[1],
    area: match[2],
    requires: [...match[3].matchAll(/"([^"]+)"/g)].map((r) => r[1]),
    bodyweight: match[4] === "true",
  }));
}

const catalog = parseCatalog();

test("katalog testin okuyabileceği biçimde ayrıştırılabiliyor", () => {
  // Bu bozulursa aşağıdaki testler sessizce boş listeyle geçer hâle gelirdi.
  assert.ok(catalog.length > 100, `beklenenden az hareket: ${catalog.length}`);
  assert.ok(catalog.some((exercise) => exercise.bodyweight));
  assert.ok(catalog.some((exercise) => exercise.requires.includes("dambıl")));
});

test("her ekipman profili tam 5 benzersiz hareket üretir", () => {
  for (const profile of EQUIPMENT_PROFILES) {
    const names = buildReadyProgram(catalog, profile).map((exercise) => exercise.name);
    assert.equal(names.length, 5, `${profile}: 5 bekleniyor, gelen ${names.length}`);
    assert.equal(new Set(names).size, 5, `${profile}: aynı hareket iki kez`);
  }
});

test("ekipmansız program hiçbir ekipmanlı hareket içermez", () => {
  // Bildirilen hata: ekipmansız programda dambıl çıkıyordu.
  for (const exercise of buildReadyProgram(catalog, "equipmentFree")) {
    assert.equal(exercise.bodyweight, true, `ekipmanlı hareket sızdı: ${exercise.name}`);
  }
});

test("ekipmanlı profiller kendi ekipmanıyla yapılabilir hareketler verir", () => {
  // requires bir VEYA listesidir: ["dambıl","makine","salon"] olan bir hareket
  // dambılla da yapılabilir, o yüzden "salon" kelimesinin geçmesi kusur değil.
  // Aranan şey, ekipmansız olmayan her hareketin O profille yapılabilir olması.
  const doableWith = (exercise, tokens) => exercise.requires.some((r) => tokens.some((token) => r.includes(token)));

  const dumbbell = buildReadyProgram(catalog, "dumbbell");
  assert.ok(dumbbell.some((exercise) => !exercise.bodyweight), "hiç dambıl hareketi yok");
  for (const exercise of dumbbell.filter((e) => !e.bodyweight)) {
    assert.ok(doableWith(exercise, ["dambıl", "kettlebell"]), `dambılla yapılamaz: ${exercise.name}`);
  }

  for (const exercise of buildReadyProgram(catalog, "band").filter((e) => !e.bodyweight)) {
    assert.ok(doableWith(exercise, ["band", "lastik"]), `bantla yapılamaz: ${exercise.name}`);
  }
});

test("kişisel plan hazır program hareketlerini son sıraya iter", () => {
  // Aksi halde "hemen başla" şablonu ile kişisel plan neredeyse aynı listeyi gösterir.
  assert.match(appSource, /const READY_PROGRAM_NAMES = new Set\(readyPrograms\.flatMap/);
  assert.match(appSource, /READY_PROGRAM_NAMES\.has\(item\.name\) \? 3 : 2/);
});

test("plan hareket sayısı süreye ve haftalık sıklığa göre değişir", () => {
  // İndeksler artık lib/onboarding-questions.ts'te adlandırılır; sihirli sayı
  // kullanmak soru sırası değişince sessizce yanlış alanı okutuyordu.
  assert.match(appSource, /extractWeeklyDays\(history\[QUESTION\.availableDays\]/);
  assert.match(appSource, /weeklyDays >= 5 \? -1 : weeklyDays <= 2 \? 1 : 0/);
});

test("hareket seçimi sabittir, değişen yüktür", () => {
  // Plan bir dönem her gün döndürülüyordu; aynı hareketteki ilerlemeyi izlemek
  // imkânsızlaştığı için "stabil değil" hissi veriyordu. Seçim profile göre
  // sabit kalmalı, zamanla yalnız set/tekrar/dinlenme ilerlemeli.
  assert.doesNotMatch(appSource, /dayIndex/);
  assert.doesNotMatch(appSource, /planDayIndex/);
  assert.match(appSource, /const score = \(name: string\) => \[\.\.\.name\][^\n]*seed\) % 997/);
  assert.match(appSource, /planProgressionBlock\(completedSessions\)/);
});

test("haftalık sıklık cevabı gün sayısına çevrilir", () => {
  assert.equal(extractWeeklyDays("5+ gün"), 5);
  assert.equal(extractWeeklyDays("3–4 gün"), 3);
  assert.equal(extractWeeklyDays("3-4 gün"), 3);
  assert.equal(extractWeeklyDays("0 gün"), 2);
  assert.equal(extractWeeklyDays("1–2 gün"), 2);
  assert.equal(extractWeeklyDays(undefined), 2);
});

test("hareket kütüphanesi kartı harekete girilmeden animasyon oynatmaz", async () => {
  const card = await readFile(new URL("../components/exercises/ExerciseCard.tsx", import.meta.url), "utf8");
  const detail = await readFile(new URL("../components/exercises/ExerciseDetail.tsx", import.meta.url), "utf8");
  assert.match(card, /<ExerciseAnimation[^/]*autoplay=\{false\}/);
  // Detayda ise oynamalı; orada autoplay kapatılmamış olmalı.
  assert.doesNotMatch(detail, /<ExerciseAnimation[^/]*autoplay=\{false\}/);
});

test("profil testinde seçenekli sorular soruya göre tek ya da çoklu seçimlidir", () => {
  // Gerçekten birden fazla doğru cevap alabilen sorular (engel, ilgi alanı,
  // ekipman, sakatlık) çoklu seçim kalır; birbirini dışlayan bir ölçeğin
  // noktaları olan sorular (gün, süre, seviye vb.) artık tek seçimlidir.
  assert.match(appSource, /function toggleAnswer\(answer: string\)/);
  assert.doesNotMatch(appSource, /function setAnswer\(/);
  assert.doesNotMatch(appSource, /toggleInjury/);
  // Seçili durum birleşik değerden okunmalı, tam eşitlikle değil.
  // (questionIndex artık akıştaki KONUM; gerçek history index'i currentQuestion'dır.)
  assert.match(appSource, /\(history\[currentQuestion\] \|\| ""\)\.split\(" · "\)\.includes\(answer\)/);
  // Çoklu seçimde "Yok"/"Hiçbiri" gibi dışlayıcı cevaplar diğerleriyle
  // birlikte işaretlenemez. "Hayır"/"0 gün" artık gerekmiyor: onların
  // sorduğu sorular (deneyim, son 3 ay sıklığı) tek seçimli oldu.
  assert.match(appSource, /EXCLUSIVE_ANSWERS = new Set\(\["Yok", "Hiçbiri"\]\)/);
  assert.match(appSource, /isSingleSelect = SINGLE_SELECT_QUESTIONS\.includes\(currentQuestion\)/);
});

test("birleşik cevaplar aşağı akışta tam eşitlikle okunmaz", () => {
  // "Yeni başlıyorum · Orta seviye" gibi değerler tam eşitliği kaçırırdı.
  assert.doesNotMatch(appSource, /history\[\d+\] === "Yeni başlıyorum"/);
  assert.match(appSource, /history\[QUESTION\.level\]\.includes\("Yeni başlıyorum"\)/);
  // Hiçbir yerde çıplak sayısal indeks kalmamalı.
  assert.doesNotMatch(appSource, /history\[\d+\]/);
});

test("profil testi soruları telefon genişliğine uyarlanmıştır", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  // Sabit 650px, 375px ekranda yatay taşma yapıyordu.
  assert.doesNotMatch(css, /\.history-step \{ width:650px; \}/);
  assert.match(css, /\.history-step \{ width:100%; max-width:650px; \}/);
  assert.match(css, /@media \(max-width:600px\)[^]*?\.answer-grid \{ display:grid/);
});

test("kalori halkasındaki metin diskin ortasında toplanır", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  // place-items yalnız satır içinde ortalar; align-content olmadan satır izleri
  // gerilip metni diskin kenarlarına, yani halkanın yayına yapıştırıyordu.
  assert.match(css, /\.calorie-progress > div \{ display:grid; place-items:center; align-content:center;/);
  // İç disk kart arka planıyla (#22221f) aynı renkte olmamalı, yoksa görünmez.
  assert.doesNotMatch(css, /\.calorie-progress > div \{[^}]*background:#22221f/);
});

test("beslenme ekranında öğün ekleme hedef panelinin önünde gelir", async () => {
  const tracker = await readFile(new URL("../components/CalorieTracker.tsx", import.meta.url), "utf8");
  const entryPanel = tracker.indexOf('className="food-entry-panel"');
  const goalsPanel = tracker.indexOf("<NutritionGoalsPanel");
  assert.ok(entryPanel > 0 && goalsPanel > 0, "iki bölüm de bulunmalı");
  assert.ok(entryPanel < goalsPanel, "günlük iş olan öğün ekleme, ayar niteliğindeki hedef panelinin üstünde olmalı");
});

test("ilerleme ekranı bel/göğüs/bacak ölçülerini adıyla duyurur", async () => {
  // Bölüm zaten bu alanları kaydediyordu ama başlığı hangi ölçüler olduğunu
  // söylemediği için bulunamıyordu.
  const app = await readFile(new URL("../components/FitAiApp.tsx", import.meta.url), "utf8");
  assert.match(app, /<BodyMeasurements userId=\{userId\}/, "ölçümler ilerleme ekranında olmalı");
  const tr = await readFile(new URL("../lib/i18n/dictionaries/tr.ts", import.meta.url), "utf8");
  const block = tr.slice(tr.indexOf('eyebrow: "VÜCUT ÖLÇÜMLERİ"'), tr.indexOf('addFirst:'));
  for (const area of ["bel", "göğüs", "bacak"]) {
    assert.ok(block.toLocaleLowerCase("tr-TR").includes(area), `ölçüm metni "${area}" bölgesinden söz etmiyor`);
  }
});

test("profil testinde panele ait ağır hesaplar çalışmaz", () => {
  // Bildirilen hata: sorularda yazarken ve şık seçerken uygulama kasıyordu.
  // Sebep, panele ait dört useMemo'nun bağımlılığında `history` olmasıydı:
  // her tuş vuruşu 170 hareketlik katalogda ekipman eşleşmesi (regex), plan
  // üretimi ve JSON.stringify tetikliyordu. Hepsi onDashboard ile kapatıldı.
  assert.match(appSource, /const onDashboard = step === STEP\.dashboard;/);
  for (const memo of ["localPlan", "workouts"]) {
    const block = appSource.match(new RegExp(`const ${memo} = useMemo\\(([^]*?)\\n  \\);`))?.[1] ?? "";
    assert.ok(block.length > 0, `${memo} memo'su bulunamadı`);
    // Kapı iki biçimde yazılabiliyor: tek satırda "onDashboard ? …" ya da
    // koşulun satır sonunda kaldığı çok satırlı ternary.
    assert.match(block, /onDashboard\s*(\?|\n\s*\?)/, `${memo} panel dışında da hesaplanıyor`);
    assert.match(block, /\[onDashboard,/, `${memo} bağımlılık listesinde onDashboard yok`);
  }
  assert.match(appSource, /const coachContext = useMemo\(\(\) => !onDashboard \? "" :/);
});

test("onboarding adımları adlandırılmıştır ve panel sonuncudur", () => {
  // Araya "kişiselleştiriliyor" ve "rapor" ekranları girdi; çıplak sayı
  // karşılaştırmaları (step === 5) sessizce yanlış ekranı gösterirdi.
  assert.match(appSource, /const STEP = \{ profile: 1, place: 2, photo: 3, test: 4, building: 5, report: 6, dashboard: 7 \} as const;/);
  assert.doesNotMatch(appSource, /step === 5|step < 5|setStep\(5\)/, "çıplak adım numarası kalmış");
});

test("son sorudan sonra kişiselleştirme ve rapor ekranı gelir", () => {
  // Eskiden son soruda beklenip doğrudan panele atlanıyordu.
  assert.match(appSource, /setStep\(STEP\.building\)/, "kişiselleştirme ekranına geçilmiyor");
  assert.match(appSource, /setStep\(STEP\.report\)/, "rapor ekranına geçilmiyor");
  assert.match(appSource, /step === STEP\.building &&/);
  assert.match(appSource, /step === STEP\.report && planReport &&/);
  // Rapor panele ancak kullanıcı düğmeye basınca geçmeli.
  assert.match(appSource, /onClick=\{\(\) => setStep\(STEP\.dashboard\)\}/);
});

test("hedef kilo profil testinden önce sorulur ve plana yazılır", () => {
  assert.match(appSource, /targetWeight=\{shownTargetWeight\} onTargetWeightChange=\{setTargetWeightDraft\}/);
  // Haftalık gün ve süre teste zaten soruldu; ikinci kez sorulmaz.
  assert.match(appSource, /setStoredGoalPlan\(\{[^]*?weeklyDays: extractWeeklyDays\(history\[QUESTION\.availableDays\]/);
});

test("soru sayacı sorunun üstünde ve şıklar eşit boyutta", async () => {
  // Sayaç GÖSTERİLEN soru sayısını sayar (bkz. QUESTIONS_SHOWN_BY_POSITION):
  // kontrol noktası bir soru değildir, sayacı artırmaz.
  assert.match(appSource, /<div className="question-counter"><b>\{QUESTIONS_SHOWN_BY_POSITION\[questionIndex\]\}<\/b><span>\/\{QUESTION_COUNT\}<\/span><\/div>/);
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const grid = css.match(/\.answer-grid \{ display:grid; grid-template-columns:repeat\(auto-fit,minmax\(150px,1fr\)\); ([^}]*)\}/)?.[1] ?? "";
  assert.ok(grid.length > 0, "şıklar eşit sütunlu grid'e alınmamış");
  assert.match(css, /\.answer-grid \.answer \{[^}]*min-height:56px/, "şıkların yüksekliği eşitlenmemiş");
});

test("antrenman sekmesi tek bir program sistemi gösterir", () => {
  // Eskiden üstte "hazır programlar", altta ayrı bir "günün antrenmanı"
  // listesi vardı; ikisi farklı hareketler gösterip aynı şeyi anlatıyordu.
  assert.match(appSource, /activeView === "workout" \? <>\s*\{\/\*[^]*?<TrainingPrograms/, "antrenman sekmesi program sistemine bağlanmamış");
  assert.doesNotMatch(appSource, /workout-plan-list/, "günün antrenmanı bloğu kalmış");
  // Yasak olan, ANTRENMAN SEKMESİNDE program listesiyle yarışan ikinci bir
  // liste. Ana ekrandaki "Bugünün antrenmanı" kartı ayrı bir şey: aynı
  // kaynaktan (aiWorkouts/localPlan) beslenir ve "Antrenmanım" sekmesine
  // götürür, farklı hareketler göstermez.
  const workoutTab = appSource.slice(
    appSource.indexOf('activeView === "workout" ? <>'),
    appSource.indexOf('className="home-column"'),
  );
  assert.ok(workoutTab.length > 0, "antrenman sekmesi bloğu bulunamadı");
  assert.doesNotMatch(workoutTab, /t\.dashboard\.myWorkout/, "antrenman sekmesinde ikinci bir günün antrenmanı listesi kalmış");
  assert.doesNotMatch(appSource, /<PlanEditor/, "plan düzenleyici yerini program kurucuya bıraktı");
  // Eski tarama sisteminden hiçbir kalıntı kalmamalı.
  for (const dead of ["browseProgram", "browseDetail", "regionPickerOpen", "startBrowseSession"]) {
    assert.ok(!appSource.includes(dead), `ölü tarama kodu kalmış: ${dead}`);
  }
});

test("program sistemi dört tür sunar, ortamı profilden alır", async () => {
  const source = await readFile(new URL("../components/TrainingPrograms.tsx", import.meta.url), "utf8");
  // Akıllı program AI'dan gelir; testi tamamlamadan açılamaz.
  assert.match(source, /disabled=\{!smartWorkouts\.length\}/, "akıllı program test tamamlanmadan açılabiliyor");
  assert.match(source, /kind: "fullBody", place/);
  assert.match(source, /kind: "split", place, regionId: region\.id/);
  // Ortam ekipman profiline çevrilmeli, yoksa evde salon aleti çıkar.
  assert.match(source, /placeToProfile\(selection\.place, equipmentText\)/);
  // Salon/ev anahtarı ekrandan kalktı: kullanıcı bunu profil testinde söylüyor.
  assert.doesNotMatch(source, /className="program-place"/, "ekrandaki salon/ev seçimi kalmamalı");
  assert.match(source, /const place: TrainingPlace = isGym \? "gym" : "home";/);
  // Bölgeler artık tek bir katalog alanı değil, alan LİSTESİ: "üst vücut",
  // "arka vücut", "itiş" gibi birleşik gruplar da aynı yapıyla çalışır
  // (bkz. lib/training-programs.ts → BODY_REGIONS).
  assert.match(source, /BODY_REGIONS\.map\(\(region\) =>/);
  assert.match(source, /distributeRegionExercises\(pool, selection\.areas/);
  // Kullanıcı kendi bölgesini kurabilir ve silebilir.
  assert.match(source, /function RegionBuilder/);
  assert.match(source, /setStoredCustomRegions\(upsertCustomRegion/);
  assert.match(source, /setStoredCustomRegions\(removeCustomRegion/);
});

test("özel program sayısı ihtiyaca göre artıp azalır ve kütüphaneden kurulur", async () => {
  const source = await readFile(new URL("../components/TrainingPrograms.tsx", import.meta.url), "utf8");
  // Ekranda sabit üç kart yoktu artık: kurulmuş programlar + tek bir "yeni
  // program" kartı. Boş slotlar kullanıcıya boş kutu olarak gösterilmiyor.
  assert.ok(!source.includes("CUSTOM_PROGRAM_SLOTS"), "sabit slot sayısı kalmamalı");
  assert.match(source, /customPrograms\.map\(\(program\) => \(/);
  assert.match(source, /\{freeSlot && <article className="program-card program-card-empty"/);
  assert.match(source, /function CustomProgramBuilder/);
  // Kurucu gerçek katalogdan seçtirmeli, sabit bir listeden değil.
  assert.match(source, /exerciseLibrary\s*\n?\s*\.filter\(\(item\) => \(!area \|\| item\.area === area\)/);
});

test("tamamlanan seans çalıştırılan programın sayacına yazılır", () => {
  assert.match(appSource, /appendProgramLog\(\{ programKey: activeProgramKey, completedAt: record\.completedAt \}\)/);
  assert.match(appSource, /setActiveProgramKey\(key\)/);
});

test("seans bitince süre, yakım ve çalışılan bölgeler gösterilir", () => {
  assert.match(appSource, /className="session-summary"/);
  assert.match(appSource, /formatSessionLength\(pendingSession\.durationSeconds, locale\)/);
  assert.match(appSource, /sessionAreas\.length > 0 &&/);
  // Atlanan hareketler çalışılmış sayılmamalı.
  assert.match(appSource, /playerQueue\.filter\(\(_, index\) => !skippedExercises\.includes\(index\)\)/);
});

test("marka logosu ana ekrana döner", () => {
  assert.match(appSource, /<button type="button" className="brand"[^>]*onClick=\{\(\) => \{ setActiveView\("plan"\)/);
});

test("AI planı üretilemezse kullanıcı yine de program alır", async () => {
  // Bildirilen hata: testi bitiren kullanıcıya program verilmedi. Sebep, AI
  // başarısız olunca aiWorkouts'un boş kalması ve Akıllı Program kartının
  // "Önce profil testi" deyip kilitlenmesiydi. localPlan profile göre yerel
  // üretilir ve her zaman vardır.
  assert.match(appSource, /smartWorkouts=\{aiWorkouts\.length \? aiWorkouts : localPlan\}/);
  assert.match(appSource, /smartFallback=\{!aiWorkouts\.length && localPlan\.length > 0\}/);
  const programs = await readFile(new URL("../components/TrainingPrograms.tsx", import.meta.url), "utf8");
  // Yerel plan geldiğinde kullanıcıya bunun AI değil yerel olduğu söylenir.
  assert.match(programs, /smartFallback \? t\.programs\.smartFallbackBody : t\.programs\.smartBody/);
  assert.match(programs, /selection\.kind === "smart" && smartFallback &&/);
});

test("plan üretiminde akıl yürütme bütçesi içeriği aç bırakmaz", async () => {
  // ÖLÇÜLDÜ: maxOutputTokens 3.000 iken modelin 2.997 token'ı düşünmeye gitti,
  // içerik 0 karakter kaldı ve üretim her seferinde "length" ile kesildi.
  const route = await readFile(new URL("../app/api/generate-plan/route.ts", import.meta.url), "utf8");
  const budget = Number(route.match(/maxOutputTokens: ([\d_]+)/)?.[1].replace(/_/g, "") ?? 0);
  assert.ok(budget >= 8000, `akıl yürütme payı için bütçe yetersiz: ${budget}`);
  // Tek deneme: SDK'nın 2 yeniden denemesi süreyi üç katına çıkarıyordu.
  // AI göçünden sonra sağlayıcının kendisi lib/ai/providers/ altında; bu
  // ayar orada yaşıyor (bkz. docs/AI_MIGRATION_PLAN.md).
  const provider = await readFile(new URL("../lib/ai/providers/openai-compatible.ts", import.meta.url), "utf8");
  assert.match(provider, /maxRetries: 0/);
});

test("koç sohbeti zaman aşımı hızlı modele göre paylı", async () => {
  // ÖLÇÜLDÜ: varsayılan akıl yürüten modelde bir sohbet cevabı 42 sn sürdü;
  // eski 20 sn'lik zaman aşımı neredeyse her seferinde güvenli yerel yanıta
  // düşüyordu. Varsayılan model hızlıya alındı, pencere yine de paylı tutuldu.
  const route = await readFile(new URL("../app/api/chat/route.ts", import.meta.url), "utf8");
  const match = route.match(/AbortSignal\.timeout\((\d+)_?(\d*)\)/);
  assert.ok(match, "chat route zaman aşımı bulunamadı");
  const timeout = Number(`${match[1]}${match[2]}`);
  assert.ok(timeout >= 30_000, `sohbet zaman aşımı yetersiz: ${timeout}`);

  const provider = await readFile(new URL("../lib/ai/providers/openai-compatible.ts", import.meta.url), "utf8");
  assert.match(provider, /DEFAULT_MODEL\s*=\s*"kimi-k2\.7-code-highspeed"/, "varsayılan hızlı model ayarlı olmalı");
});

test("plan istemine yalnız yapılabilir hareketler gider", async () => {
  // Tam katalog istemi şişirip üretimi yavaşlatıyordu; ayrıca model evdeki
  // kullanıcıya salon aleti önerebiliyordu.
  const { getExercisesForProfile } = await import("../lib/exercise-service.ts");
  const home = getExercisesForProfile(false, "Dambıl · Yoga matı");
  const gym = getExercisesForProfile(true, "Salon ekipmanı");
  assert.ok(home.length > 0 && gym.length > 0);
  for (const exercise of home) {
    const tag = (exercise.equipment || "").toLowerCase();
    assert.ok(!["barbell", "cable", "machine"].includes(tag), `evdeki kataloğa salon aleti sızdı: ${exercise.name} (${tag})`);
  }
  // Salon profili, evde elenen ekipmanları gerçekten görebilmeli; yoksa eleme
  // "her yerde aynı listeyi ver"e dönüşmüş olurdu.
  const gymTags = new Set(gym.map((exercise) => (exercise.equipment || "").toLowerCase()));
  assert.ok(["barbell", "cable", "machine"].some((tag) => gymTags.has(tag)), "salon kataloğunda salon aleti yok");
  // Ekipmansız kullanıcıya yalnız vücut ağırlığı gider.
  const none = getExercisesForProfile(false, "Hiçbiri");
  assert.ok(none.length > 0);
  for (const exercise of none) {
    const tag = (exercise.equipment || "").toLowerCase();
    assert.ok(["body only", "", "other"].includes(tag), `ekipmansız kataloğa alet sızdı: ${exercise.name} (${tag})`);
  }
  assert.match(appSource, /getExercisesForProfile\(gym === "Salon", equipmentText\)/);
});

test("istem kataloğu sınırlıdır ama kas gruplarını temsil etmeyi sürdürür", async () => {
  // Katalog 873 harekete çıktı. Tamamını isteme koymak salon profilinde yalnız
  // katalog için ~31.400 token demekti ve akıl yürüten model 60 sn'lik üretim
  // penceresine sığmıyordu. Sınır, hiçbir kas grubunu listeden düşürmemeli.
  const { getExercisesForProfile, getAllExercises } = await import("../lib/exercise-service.ts");
  const gym = getExercisesForProfile(true, "Salon ekipmanı");
  assert.ok(gym.length <= 240, `istem kataloğu sınırı aşıldı: ${gym.length}`);
  assert.ok(gym.length > 106, `istem kataloğu eski katalogdan geniş olmalı: ${gym.length}`);

  const primaryMuscle = (exercise) => exercise.primaryMuscles[0] || "other";
  const everyMuscle = new Set(getAllExercises().map(primaryMuscle));
  const promptMuscles = new Set(gym.map(primaryMuscle));
  for (const muscle of everyMuscle) {
    assert.ok(promptMuscles.has(muscle), `kas grubu istem kataloğundan düştü: ${muscle}`);
  }

  // Kimlikler benzersiz kalmalı; model katalogdan id ile seçim yapıyor.
  assert.equal(new Set(gym.map((exercise) => exercise.id)).size, gym.length);
});

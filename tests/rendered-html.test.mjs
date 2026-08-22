import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function dispatch(request) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    request,
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function render() {
  return dispatch(new Request("http://localhost/", { headers: { accept: "text/html" } }));
}

test("rejects unknown Supabase projects before loading the app router", async () => {
  const response = await dispatch(new Request("http://localhost/api/supabase-proxy/auth/v1/settings"));
  assert.equal(response.status, 403);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/i);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "Unknown Supabase project." });
});

test("buffers Supabase proxy bodies for Safari and Cloudflare compatibility", async () => {
  const [browserClient, workerProxy, workerEntry] = await Promise.all([
    readFile(new URL("../lib/supabase/client.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/supabase-proxy.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(browserClient, /await source\.arrayBuffer\(\)/);
  assert.match(browserClient, /new XMLHttpRequest\(\)/);
  assert.match(browserClient, /sendAuthProxyRequest\(proxy\.url, proxy\.init\)/);
  assert.match(browserClient, /x-hedefit-proxy/);
  // Normalizasyon artık lib/supabase/url.ts'te; sunucu tarafı da aynı yardımcıyı
  // kullanmalı (bkz. tests/supabase-url.test.mjs), yoksa geçerli oturumlar
  // "Oturum doğrulanamadı." ile reddediliyordu.
  assert.match(browserClient, /import \{ normalizeSupabaseUrl \} from "\.\/url"/);
  assert.match(browserClient, /normalizeSupabaseUrl\(rawConfiguredUrl\)/);
  assert.match(workerProxy, /await request\.arrayBuffer\(\)/);
  assert.match(workerProxy, /X-Hedefit-Proxy", "supabase"/);
  assert.doesNotMatch(workerProxy, /body:\s*request\.body/);
  // env.ASSETS bu dağıtımda yalnızca /_vinext/image yolunda bağlıdır. Her isteğin
  // başında env.ASSETS.fetch çağırmak, binding tanımsız olduğu için worker'ı
  // anında çökertiyordu (ve bunu sağlamak için eklenen wrangler.jsonc,
  // nodejs_compat'ı ikinci kez tanımlayıp Cloudflare derlemesini kırıyordu).
  // Bu yüzden ASSETS yalnızca görsel işleyicisinin içinde kullanılmalı.
  const beforeImageHandler = workerEntry.slice(0, workerEntry.indexOf('url.pathname === "/_vinext/image"'));
  assert.doesNotMatch(beforeImageHandler, /env\.ASSETS/);
  assert.match(workerEntry, /const fetchAsset = \(path: string\) => env\.ASSETS\.fetch/);
  // Görsel dönüşümü (hesapta Cloudflare Images kapalıysa) fırlatıp Worker'ı
  // komple düşürüyordu; başarısızlıkta orijinal dosya servis edilmeli.
  assert.match(workerEntry, /catch \(error\) \{[^]*?serving original/);
  assert.match(workerEntry, /return withSecurityHeaders\(await fetchAsset\(source\)\);/);
  // Supabase proxy'si app router'dan önce çalışmalı (CPU limiti için).
  assert.ok(workerEntry.indexOf("handleSupabaseProxy(request)") < workerEntry.indexOf("await getAppRouterHandler()"));
});

test("server-renders the secure Hedefit account entry", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin-allow-popups");

  const html = await response.text();
  assert.match(html, /<title>Hedefit — Hedefin için fit plan\.<\/title>/i);
  // Açılışta sportif bekleme ekranı sunucudan gelir; jenerik "yükleniyor"
  // kutusu yerine tur halkası + tempo çubukları.
  assert.match(html, /Isınma turu/i);
  assert.match(html, /class="sport-loader"/);
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /class="topbar"/);
  assert.doesNotMatch(html, />Antrenmanım</);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|codex-preview/i);
});

test("keeps adaptive plan, meal entry and training-place controls dark", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /\.dark \.adaptive-card,/);
  assert.match(styles, /\.dark \.adaptive-icon \{ background:#303a23/);
  assert.match(styles, /\.dark \.entry-workspace \{ background:var\(--surface-soft\)/);
  assert.match(styles, /\.dark \.entry-workspace select,/);
  assert.match(styles, /\.dark \.choice\.selected \{ background:#303a23/);
  assert.match(styles, /\.dark \.training-place-switch/);
  assert.match(styles, /\.dark \.meal-ai-advice/);
});

test("keeps email verification and Google authentication wired into profile creation", async () => {
  const [page, profileManager, authScreen, callback, mobileRuntime, mobileConfig, androidManifest, iosInfo] = await Promise.all([
    readFile(new URL("../components/FitAiApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ProfileManager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/AuthScreen.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/auth/callback/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/mobile.ts", import.meta.url), "utf8"),
    readFile(new URL("../capacitor.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8"),
    readFile(new URL("../ios/App/App/Info.plist", import.meta.url), "utf8"),
  ]);

  assert.match(page, /onAuthStateChange/);
  assert.match(page, /auth\.signOut/);
  assert.match(profileManager, /t\.profileManager\.verifiedAccount/);
  assert.match(authScreen, /auth\.signUp/);
  assert.match(authScreen, /verifyOtp/);
  assert.match(authScreen, /type: "signup"/);
  assert.match(authScreen, /auth\.resend/);
  assert.match(authScreen, /isVerifiedAuthUser/);
  assert.match(authScreen, /signInWithPassword/);
  assert.match(authScreen, /signInWithOAuth/);
  assert.match(authScreen, /provider: "google"/);
  assert.match(authScreen, /t\.auth\.emailLabel/);
  assert.match(authScreen, /status === "unavailable" &&/);
  assert.doesNotMatch(authScreen, /status === "unavailable" \? <div[^]*?\: <>/);
  assert.match(callback, /exchangeCodeForSession/);
  assert.match(callback, /hasVerifiedSession/);
  assert.match(callback, /E-posta doğrulandı/);
  assert.match(page, /isVerifiedAuthUser/);
  assert.match(page, /MobileRuntime/);
  assert.match(authScreen, /skipBrowserRedirect: native/);
  assert.match(authScreen, /openNativeBrowser/);
  const supabaseClient = await readFile(new URL("../lib/supabase/client.ts", import.meta.url), "utf8");
  assert.match(supabaseClient, /resilientSupabaseFetch/);
  assert.match(supabaseClient, /isUnexpectedAuthResponse/);
  assert.match(supabaseClient, /target\.pathname\.startsWith\("\/auth\/v1\/"\)/);
  assert.match(supabaseClient, /const proxy = await proxiedRequest\(request, configuredUrl\)/);
  assert.doesNotMatch(supabaseClient, /return await fetch\(request\)/);
  assert.match(mobileRuntime, /com\.hedefit\.app:\/\/auth\/callback/);
  assert.match(mobileRuntime, /exchangeCodeForSession/);
  assert.match(mobileRuntime, /LocalNotifications\.schedule/);
  assert.match(mobileConfig, /appId: "com\.hedefit\.app"/);
  assert.doesNotMatch(mobileConfig, /AI_API_KEY|SUPABASE_ANON_KEY/);
  assert.match(androidManifest, /android:scheme="com\.hedefit\.app"/);
  assert.match(iosInfo, /<string>com\.hedefit\.app<\/string>/);
  assert.match(iosInfo, /NSCameraUsageDescription/);
});

test("keeps the AI plan and movement library wired into the product", async () => {
  const [page, route, weeklyRoute, layout, supabaseSchema, programs] = await Promise.all([
    readFile(new URL("../components/FitAiApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/generate-plan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/weekly-review/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/supabase-schema.sql", import.meta.url), "utf8"),
    readFile(new URL("../components/TrainingPrograms.tsx", import.meta.url), "utf8"),
  ]);

  // readyPrograms sözlüğü yerini programs'a bıraktı; program ekranı artık
  // ayrı bir bileşende (components/TrainingPrograms.tsx).
  assert.match(page, /<TrainingPrograms/);
  assert.match(page, /t\.aiScan\.completeTitle/);
  // Hareket anlatımı program listesine taşındı (günün antrenmanı kaldırıldı).
  assert.match(programs, /t\.dashboard\.howTo/);
  assert.match(page, /Yerde Dambıl Göğüs Presi/);
  assert.ok((page.match(/^  \["/gm) ?? []).length >= 100, "exercise library should contain 100+ additional movements");
  // Çoklu seçim artık yalnız sakatlık sorusunda değil, seçenekli tüm sorularda.
  assert.match(page, /function toggleAnswer\(answer: string\)/);
  assert.match(page, /EXCLUSIVE_ANSWERS/);
  assert.doesNotMatch(page, /toggleInjury/);
  assert.match(page, /personalizeAiWorkouts/);
  assert.match(page, /isExerciseSafeForProfile/);
  assert.match(page, /exerciseCatalog/);
  // Katalog artık profile göre süzülerek gönderiliyor.
  assert.match(page, /getExercisesForProfile/);
  assert.match(page, /getExerciseById/);
  assert.match(page, /ExerciseLibrary/);
  assert.match(page, /ExerciseAnimation/);
  assert.match(page, /floor-press/);
  assert.match(page, /trustedExerciseMedia/);
  assert.doesNotMatch(page, /MotionFigureAnimation/);
  assert.match(page, /"leg-machine"/);
  assert.match(page, /return "curl"/);
  assert.match(page, /return "triceps"/);
  assert.match(page, /return "raise"/);
  assert.match(page, /return "fly"/);
  assert.match(page, /t\.workoutPlayer\.breatheLabel/);
  assert.match(page, /t\.workoutPlayer\.mistakeLabel/);
  assert.match(page, /t\.workoutPlayer\.skipRest/);
  assert.match(page, /t\.workoutPlayer\.finishAndSave/);
  assert.match(page, /workout_sessions/);
  assert.match(page, /WorkoutSetLogger/);
  // Plan düzenleyici yerini program kurucuya bıraktı: kullanıcı artık
  // hareket kütüphanesinden kendi programını kuruyor (3 slot).
  assert.match(page, /TrainingPrograms/);
  assert.match(page, /workout_plans/);
  assert.match(page, /workout_exercise_logs/);
  assert.match(page, /workout_set_logs/);
  assert.match(page, /BodyMeasurements/);
  assert.match(page, /WorkoutCalendar/);
  assert.match(page, /WeeklyAiReview/);
  assert.match(page, /CalorieTracker/);
  assert.match(page, /inferWorkoutDays/);
  assert.match(page, /activeView === "calendar"/);
  assert.match(page, /localDateKey/);
  assert.match(page, /t\.insights\.adaptiveEyebrow/);
  assert.match(page, /t\.feedback\.save/);
  assert.match(page, /summarizeTrainingAdaptation/);
  assert.match(page, /trainingHistory/);
  assert.match(page, /calculateEnergyMetrics/);
  assert.match(page, /workoutMet/);
  assert.match(page, /t\.insights\.eyebrow/);
  assert.match(page, /t\.progress\.monthlyReportEyebrow/);
  assert.match(page, /t\.progress\.bmrRef/);
  assert.match(page, /t\.progress\.tdeeRef/);
  assert.match(page, /setAiWorkouts\(\[\]\)/);
  // AI göçünden sonra plan üretimi Coach Service üzerinden gidiyor ve modele
  // giden veriler serbest metin başlıkları yerine <facts> içinde yapılandırılmış
  // olarak taşınıyor (bkz. docs/AI_MIGRATION_REPORT.md). Aşağıdaki iddiaların
  // AMACI değişmedi: her veri parçasının hâlâ modele ulaştığını doğrularlar.
  assert.match(route, /generateCoachObject/);
  assert.match(route, /const planFacts/);
  assert.match(route, /\bprofile,/, "ham profil verisi modele gitmeli");
  // Cevaplar soru etiketleriyle birlikte gider; çıplak dizi hangi cevabın
  // hangi soruya ait olduğunu modele bırakıyordu.
  assert.match(route, /profileTest: signals\.answers/);
  assert.match(route, /derivedSignals: signals/);
  assert.match(route, /weeklySchedule/);
  assert.match(route, /progression/);
  assert.match(route, /profileFingerprint/);
  assert.match(route, /exerciseCatalog/, "hareket kataloğu modele gitmeli");
  assert.match(route, /photoDataUrl/);
  assert.match(route, /katalogdaki id ve name alanlarını birebir kullan/);
  assert.match(route, /trainingHistory/, "önceki antrenmanlar ve geri bildirimler modele gitmeli");
  assert.match(route, /adaptation/, "uygulamanın uyarlama kararı modele gitmeli");
  assert.match(weeklyRoute, /generateCoachObject/);
  assert.match(weeklyRoute, /jsonSchema<WeeklyReview>/);
  assert.match(weeklyRoute, /validateWeeklySummary/);
  assert.match(weeklyRoute, /enforceWeeklySafety/);
  // Özet artık <facts> içinde otorite olarak taşınıyor.
  assert.match(weeklyRoute, /facts: safeSummary/);
  assert.doesNotMatch(weeklyRoute, /payload\.(email|name|userId)/);
  assert.match(layout, /Hedefit — Hedefin için fit plan\./);
  assert.match(layout, /export const metadata/);
  assert.match(layout, /og\.png/);
  assert.match(layout, /hedefit\.frknian\.workers\.dev/);
  assert.doesNotMatch(page, /gymvisual|iframe/i);
  assert.doesNotMatch(page, /knowledge-sources|fitnessSources/);
  assert.doesNotMatch(route, /knowledge-sources|fitnessSources/);
  assert.match(supabaseSchema, /create table if not exists public\.workout_sessions/i);
  assert.match(supabaseSchema, /create table if not exists public\.workout_plans/i);
  assert.match(supabaseSchema, /Users can update own workout plans/i);
  assert.match(supabaseSchema, /create table if not exists public\.workout_exercise_logs/i);
  assert.match(supabaseSchema, /create table if not exists public\.workout_set_logs/i);
  assert.match(supabaseSchema, /create table if not exists public\.body_measurements/i);
  assert.match(supabaseSchema, /create table if not exists public\.workout_schedule/i);
  assert.match(supabaseSchema, /create table if not exists public\.reminder_preferences/i);
  assert.match(supabaseSchema, /create table if not exists public\.weekly_ai_reviews/i);
  assert.match(supabaseSchema, /create table if not exists public\.nutrition_goals/i);
  assert.match(supabaseSchema, /create table if not exists public\.user_streaks/i);
  assert.match(supabaseSchema, /create table if not exists public\.activity_logs/i);
  assert.match(page, /ActivityStreak/);
  assert.match(page, /ActivityLogger/);
  assert.match(page, /activeView === "profile"/);
  // Liste animasyonları oynamaz (pil/kaydırma); liste artık program ekranında.
  assert.match(programs, /autoplay=\{false\}/);
  assert.match(supabaseSchema, /Users can read own nutrition goals/i);
  assert.match(supabaseSchema, /Users can update own nutrition goals/i);
  assert.match(supabaseSchema, /Users can read own weekly AI reviews/i);
  assert.match(supabaseSchema, /Users can read own workout schedule/i);
  assert.match(supabaseSchema, /Users can update own reminder preferences/i);
  assert.match(supabaseSchema, /Users can read own body measurements/i);
  assert.match(supabaseSchema, /Users can update own body measurements/i);
  assert.match(supabaseSchema, /Users can delete own body measurements/i);
  assert.match(supabaseSchema, /Users can read own workout exercise logs/i);
  assert.match(supabaseSchema, /Users can insert own workout set logs/i);
  assert.match(supabaseSchema, /rpe smallint check \(rpe between 1 and 10\)/i);
  assert.match(supabaseSchema, /Users can read own workout sessions/i);
  assert.match(supabaseSchema, /difficulty text/i);
  assert.match(supabaseSchema, /pain_areas jsonb/i);
});

test("Android manifesti kamera, galeri ve bildirim izinlerini tanımlar", async () => {
  const manifest = await readFile(new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8");
  // Bu izinler olmadan barkod tarayıcının getUserMedia çağrısı ve targetSdk 33+
  // üzerinde antrenman hatırlatmaları sessizce çalışmaz.
  assert.match(manifest, /android\.permission\.CAMERA/);
  assert.match(manifest, /android\.permission\.POST_NOTIFICATIONS/);
  assert.match(manifest, /android\.permission\.READ_MEDIA_IMAGES/);
  // Kamerası olmayan cihazlarda kurulum engellenmemeli.
  assert.match(manifest, /uses-feature[^>]*android\.hardware\.camera[^>]*required="false"/);
});

test("mobil gezinme alt sekme çubuğunda ve hiçbir görünüm erişilemez kalmaz", async () => {
  // Yatay kayan üst menü, Stitch tasarımıyla birlikte alt sekme çubuğuna
  // taşındı: telefonda başparmakla ulaşılan tek bölge orası. Kayan şeridin
  // yerini aldığı için eski scrollIntoView düzeltmesi de kalktı.
  const [page, shell, styles, quickActions] = await Promise.all([
    readFile(new URL("../components/FitAiApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/layout/AppShell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/quick-actions.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /topLinksRef/, "kayan üst menü kalıntısı duruyor");
  assert.match(shell, /className="hf-tabbar"/);
  // Sekmeye sığmayan görünümler başlık çubuğunda ikon olarak durmalı.
  assert.match(shell, /items\.filter\(\(item\) => item\.primary\)/);
  assert.match(shell, /items\.filter\(\(item\) => !item\.primary\)/);
  assert.match(shell, /className="hf-topbar-icon"/);

  // AppView'daki her görünüm bir yerden AÇILABİLİR olmalı. Alt çubuk beşe
  // indiği için ikisinin girişi değişti; garanti aynı, kontrol noktası farklı.
  const views = [...quickActions.matchAll(/export type AppView =([^;]+);/g)][0][1]
    .split("|").map((value) => value.trim().replace(/"/g, ""));
  const navBlock = page.slice(page.indexOf("const navItems: ShellNavItem[]"), page.indexOf("const brand ="));
  // Alt çubukta olmayan görünümlerin her birinin EKRAN İÇİNDE bir girişi
  // olmalı; ikonların kaldırılması onları erişilemez bırakmamalı.
  const specialEntry = {
    // "plan" artık Bugün sekmesinin kökü; sekme kimliği rota modelinden gelir.
    plan: () => navBlock.includes('id: "today"'),
    // Profil: başlıktaki avatar.
    profile: () => page.includes('className="topbar-avatar"') && page.includes('onClick={() => setActiveView("profile")}'),
    // Takvim: Bugün ekranındaki "Planı gör".
    calendar: () => page.includes('onOpenPlan={() => setActiveView("calendar")}'),
    // Kütüphane: Antrenman ekranındaki kütüphane satırı.
    library: () => page.includes('onOpenLibrary={() => setActiveView("library")}'),
    // Beslenme: Bugün ekranındaki kalori çemberi.
    nutrition: () => page.includes('onOpen={() => navigateFromQuickAction("nutrition")}'),
  };
  for (const view of views) {
    const entry = specialEntry[view];
    assert.ok(entry ? entry() : navBlock.includes(`id: "${view}"`), `erişilemez görünüm: ${view}`);
  }
  // Koç artık YALNIZ kendi sekmesinden açılır; yüzen başlatıcı hiçbir yerde çizilmez.
  assert.ok(navBlock.includes('id: "coach"'), "Koç sekmesi eksik");
  assert.doesNotMatch(page, /coach-launcher/);

  // Sabit çubuk içeriği örtmemeli ve çentikli telefonda ekran altına gömülmemeli.
  const tabbar = styles.match(/\.hf-tabbar \{([^}]*)\}/)?.[1] ?? "";
  assert.match(tabbar, /position:fixed/);
  assert.match(tabbar, /bottom:0/);
  assert.match(tabbar, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /\.hf-shell \.hf-main \{ padding-bottom:\d+px; \}/);
  // Masaüstünde yerini sol sütun alır.
  assert.match(styles, /@media \(min-width:1024px\) \{[^]*?\.hf-tabbar \{ display:none; \}/);
  assert.match(styles, /@media \(max-width:420px\) \{[^]*?\.stats-row \{ grid-template-columns:1fr; \}/);
});

test("veritabanı kurulum sırası belgelenmiştir", async () => {
  // README uygulama tanıtımıdır; kurulum/geliştirme belgeleri docs/GELISTIRME.md'dedir.
  const guide = await readFile(new URL("../docs/GELISTIRME.md", import.meta.url), "utf8");
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const schema = await readFile(new URL("../db/supabase-schema.sql", import.meta.url), "utf8");
  // profile_history yalnızca migration'da tanımlı; yalnız temel şemayı çalıştıran
  // biri eksik veritabanı elde eder, bu yüzden sıra belgede yazmalı.
  assert.doesNotMatch(schema, /create table if not exists public\.profile_history/);
  assert.match(guide, /## Veritabanı kurulumu/);
  assert.match(guide, /db\/migrations/);
  // Tanıtım sayfasından rehbere ulaşılabilmeli, yoksa belge fiilen kaybolur.
  assert.match(readme, /docs\/GELISTIRME\.md/);
});

test("koyu tema varsayılan, açık tema korunur", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  // Uygulama koyu-öncelikli tasarlandı; saklı tercih yoksa koyu açılır.
  assert.match(layout, /if\(t!=='light'&&t!=='dark'\)\{t='dark'\}/);
  // Tercih ilk boyamadan ÖNCE uygulanmalı, yoksa açık tema bir an görünür.
  assert.match(layout, /dangerouslySetInnerHTML=\{\{ __html: themeScript \}\}/);
  // Açık tema kaldırılmadı: GPS ekranı güneş altında kullanılıyor.
  const toggle = await readFile(new URL("../components/ThemeToggle.tsx", import.meta.url), "utf8");
  assert.match(toggle, /hedefit-theme/);
});

// Yerel AI politikası: NE yerelde çalışır, hangi bütçeyle, hangi sürelerle.
//
// Tek dosyada toplanmasının sebebi, bu değerlerin ÖLÇÜMLE değişecek olması
// (bkz. docs/LOCAL_AI_BENCHMARK.md). Karşılaştırma sonuçları geldiğinde
// yalnız burası güncellenir; sağlayıcı, yönlendirici ve rotalar değişmez.

import type { AiTaskCategory } from "./types.ts";

/**
 * Yerelde çalışmasına izin verilen kategoriler.
 *
 * Kısa, tek dönüşlü, deterministik gerçeklere dayanan koçluk yanıtları
 * kapsamdadır. Karmaşık plan üretimi (complex_reasoning), görsel akışlar
 * (vision) ve şemaya bağlı üretim (structured_extraction) bilerek DIŞARIDA —
 * küçük bir modelin bunları yeterli kalitede yaptığı ÖLÇÜLMEDEN yerele vermek
 * ürünü bozardı. Yerel bir hata olursa zincir zaten uzak sağlayıcıya düşer.
 *
 * `LOCAL_AI_CATEGORIES` ortam değişkeniyle (virgülle ayrılmış) daraltılıp
 * genişletilebilir; böylece ölçüm sonucu yeni sürüm beklemeden uygulanabilir.
 */
const DEFAULT_LOCAL_CATEGORIES: AiTaskCategory[] = [
  // "conversation" LİSTEDE ama TEK BAŞINA YETMEZ — sohbetin cihazda
  // üretilmesi için üç kapının da açılması gerekir:
  //
  //   1. Kategori burada  (bu liste)
  //   2. Cihazda seçilen modelin `chatReady` bayrağı açık
  //      (native karar verir; bkz. LocalAiModelCatalog.turkishProseReady)
  //   3. Üretilen metin Türkçe ses dizimi denetiminden geçiyor
  //      (bkz. lib/ai/turkish.ts — çalışma anı koruması)
  //
  // Üç kapı da aynı hatanın farklı katmanlardaki karşılığı: 0,5B int4 bir
  // model Türkçe biçimbirimleri bozup var olmayan kelimeler üretiyordu
  // ("yüzme" → "yümç") ve bu kullanıcıya olduğu gibi gösteriliyordu.
  // Kategori listesi hangi İŞİN, model bayrağı hangi MODELİN uygun olduğunu
  // söyler; üçüncü kapı ise ikisi de doğruyken bile bozuk çıkan TEK BİR
  // yanıtı yakalar ve sessizce sunucuya düşer.
  "conversation",
  "simple_coaching",
  "daily_summary",
  "activity_summary",
  "goal_progress",
  "motivation",
  "nutrition_explanation",
];

const ALL_CATEGORIES: AiTaskCategory[] = [
  "simple_coaching", "daily_summary", "nutrition_explanation", "activity_summary",
  "goal_progress", "motivation", "conversation", "complex_reasoning",
  "plan_generation", "structured_extraction", "vision",
];

export function localCapableCategories(): AiTaskCategory[] {
  const configured = process.env.LOCAL_AI_CATEGORIES;
  if (!configured) return DEFAULT_LOCAL_CATEGORIES;
  const wanted = configured.split(",").map((item) => item.trim()).filter(Boolean);
  // Bilinmeyen bir kategori adı sessizce yok sayılır; yazım hatası yüzünden
  // her isteğin yerele gitmesi ya da hiç gitmemesi istenmez.
  return ALL_CATEGORIES.filter((category) => wanted.includes(category));
}

/**
 * Yerelde ŞEMAYA BAĞLI (generateObject) üretime izin verilen kategoriler.
 *
 * `localCapableCategories()`'ten bilerek AYRI: düz metin üretimiyle
 * yapılandırılmış JSON üretimi aynı risk sınıfında değil. LiteRT-LM'in kısıtlı
 * kod çözümü SÖZ DİZİMİ düzeyinde geçerli JSON garanti eder ama alan
 * değerlerinin (ör. katalogdaki egzersiz kimlikleriyle birebir eşleşme)
 * anlamca doğru olacağını garanti etmez. Bu üç kategorinin hepsi bilerek
 * dahil — ama güvenlik ağı ROTA SEVİYESİNDEDİR, burada değil:
 *
 *   · goal_progress (hedef/test analizi)     → route'ta deterministik metin
 *     yedeği VAR (localAnalysis); yerel üretim geçersizse kullanıcı yine de
 *     anlamlı bir kart görür.
 *   · complex_reasoning (haftalık değerlendirme) → aynı şekilde deterministik
 *     yedeği VAR (localWeeklyReview).
 *   · plan_generation (antrenman programı) → route'ta şablon yedek YOK
 *     (bir plan "uydurmak" güvenli değil). Bunun yerine route, yerel sonucu
 *     semantik olarak doğrulayıp (workouts.length vb.) geçersizse UZAĞA
 *     BİR KEZ yeniden dener (bkz. app/api/generate-plan/route.ts) — böylece
 *     yerel yalnızca "önce dene" katmanı olur, kullanıcı asla bozuk bir
 *     plan ya da gereksiz bir 502 görmez.
 */
const DEFAULT_LOCAL_OBJECT_CATEGORIES: AiTaskCategory[] = ["goal_progress", "complex_reasoning", "plan_generation"];

export function localObjectCapableCategories(): AiTaskCategory[] {
  const configured = process.env.LOCAL_AI_OBJECT_CATEGORIES;
  if (!configured) return DEFAULT_LOCAL_OBJECT_CATEGORIES;
  const wanted = configured.split(",").map((item) => item.trim()).filter(Boolean);
  return ALL_CATEGORIES.filter((category) => wanted.includes(category));
}

/**
 * Yerel istem karakter bütçesi.
 *
 * Neden karakter, token değil? Token sayısı modele göre değişir ve JS tarafında
 * doğru saymak için tokenizer taşımak gerekirdi. Türkçe metinde kabaca
 * 1 token ≈ 3 karakter; 6.000 karakter ≈ 2.000 token, seçilen modellerin
 * `maxNumTokens = 2048` penceresine giriş+çıkış olarak sığar.
 */
export const LOCAL_PROMPT_CHAR_BUDGET = 6_000;

/**
 * Koçluk yanıtı kısadır; uzun üretim mobilde doğrudan bekleme süresidir.
 *
 * ÖLÇÜM: 320 tavanına çarpan yanıtlar 45,9 sn sürüyordu (decode 8,2 tok/s).
 * Kısa üslupla (~70 kelime ≈ 110 token) istenen yanıt bu tavana yaklaşmaz;
 * tavan yalnız kontrolden çıkan üretimi keser. 200, en kötü durumu ~24 sn'ye
 * sınırlar ve tipik yanıtı kesmez.
 */
export const LOCAL_MAX_OUTPUT_TOKENS = 200;

/**
 * Şemaya bağlı üretim tavanı. Düz metinden daha büyük: bir haftalık
 * değerlendirme veya antrenman programı JSON'u onlarca alan içerir.
 */
export const LOCAL_OBJECT_MAX_OUTPUT_TOKENS = 900;

export const LOCAL_TEMPERATURE = 0.3;

/**
 * Üretim zaman aşımı. Aşılırsa native taraf üretimi durdurur ve yönlendirici
 * uzak sağlayıcıya BİR KEZ düşer — yerel yeniden denenmez (döngü olmaz).
 */
export const LOCAL_GENERATION_TIMEOUT_MS = 45_000;

/** Şemaya bağlı üretim daha uzun sürebilir (kısıtlı kod çözüm + daha çok token). */
export const LOCAL_OBJECT_TIMEOUT_MS = 60_000;

/** Model yükleme zaman aşımı; ilk yükleme büyük modellerde on saniyeleri bulur. */
export const LOCAL_LOAD_TIMEOUT_MS = 120_000;

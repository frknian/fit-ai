import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "./supabase/url.ts";
import { bearerToken } from "./api-auth.ts";

export type UsageFeature = "chat" | "photo" | "text_nutrition" | "weekly_review" | "nutrition_advice" | "plan";

// Premium'da sınır YOK — bkz. db/migrations/20260821_premium_unlimited_ai_usage.sql
// `null`, SQL fonksiyonuna "bu özellik için sınır
// kontrolü yapma" der; TS tarafında `Number.POSITIVE_INFINITY`'e çevrilir
// (bkz. checkAndConsumeUsage). Ücretsiz plan DEĞİŞMEDİ.
const DAILY_LIMITS = {
  free: { chat: 5, photo: 1, text_nutrition: 3, weekly_review: 1, nutrition_advice: 5, plan: 3 },
  premium: { chat: null, photo: null, text_nutrition: null, weekly_review: null, nutrition_advice: null, plan: null },
} as const satisfies { free: Record<UsageFeature, number>; premium: Record<UsageFeature, number | null> };

// Eski (geçiş dönemi) yol yalnız db/migrations/20260726_usage_limits.sql'deki
// increment_usage_counter'ı çağırır; o fonksiyon NULL'ı "sınırsız" olarak
// YORUMLAMAZ (integer parametre). Bu yüzden legacy yolda gerçek NULL yerine
// pratikte hiç ulaşılamayacak büyük bir sayı kullanılır. Bu yalnız YENİ
// migration henüz uygulanmamış eski kurulumlarda devreye girer.
const LEGACY_UNLIMITED_SENTINEL = 100_000;

export type UsageCheckResult = { allowed: boolean; used: number; limit: number; isPremium: boolean };

/** Reklam başına verilen bonus hak ve bir özellik için günlük bonus tavanı. */
const BONUS_PER_AD = 1;
const MAX_BONUS_PER_DAY = 3;

export type AdBonusResult = { bonusCount: number; maxBonus: number };

/**
 * Günlük kullanım sınırını atomik biçimde kontrol eder ve izin varsa sayacı
 * bir artırır. Sınır aşılmışsa sayaç ARTIRILMAZ.
 *
 * Öncelik db/migrations/20260812_combined_usage_check.sql — is_premium okuma
 * ile sayaç artırmayı TEK round trip'te birleştiren check_and_consume_usage().
 * Bu fonksiyon eski (henüz migration'ı uygulamamış) kurulumlarda mevcut
 * değilse db/migrations/20260726_usage_limits.sql'deki iki adımlı yola
 * (profil okuma + increment_usage_counter) döner — bkz. legacyCheckAndConsumeUsage.
 *
 * `userId`, `authenticateRequest()`'ten gelen doğrulanmış kullanıcı
 * kimliğidir; yalnız eski yolda (profiles.select) RLS'e ek bir savunma
 * katmanı olarak kullanılır. Yeni yol zaten yalnız auth.uid()'i okur.
 */
export async function checkAndConsumeUsage(request: Request, feature: UsageFeature, userId: string): Promise<UsageCheckResult | { error: Response }> {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { error: Response.json({ error: "Kullanım sınırı servisi yapılandırılmamış." }, { status: 503 }) };
  }
  const token = bearerToken(request);
  if (!token) {
    return { error: Response.json({ error: "Bu işlem için giriş yapmalısın." }, { status: 401 }) };
  }

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  let { data, error } = await client.rpc("check_and_consume_usage", {
    p_feature: feature,
    p_free_limit: DAILY_LIMITS.free[feature],
    p_premium_limit: DAILY_LIMITS.premium[feature],
  }).single();

  // PGRST202/PGRST204 genellikle migration eksikliğinden değil, PostgREST'in
  // şema önbelleğinin bir önceki deploy'dan hemen sonra henüz güncellenmemiş
  // olmasından kaynaklanır (Supabase şema değişikliklerinde otomatik yeniler,
  // ama bu anlık değildir). Üretimde bu hatada doğrudan 503'e düşmek, migration
  // eksik olmayan SIRADAN bir deploy'da bile TÜM AI özelliklerini kısa
  // süreliğine kesebiliyordu. Kapalı tarafa düşmeden önce kısa bir bekleme +
  // TEK yeniden deneme yapılır; önbellek gerçekten güncellenmişse bu ikinci
  // deneme başarılı olur. Migration GERÇEKTEN eksikse yeniden deneme de aynı
  // hatayı verir ve akış normal şekilde legacy yola / 503'e düşmeye devam eder.
  if (error && isMissingInfrastructure(error) && process.env.NODE_ENV === "production") {
    await new Promise((resolve) => setTimeout(resolve, 400));
    ({ data, error } = await client.rpc("check_and_consume_usage", {
      p_feature: feature,
      p_free_limit: DAILY_LIMITS.free[feature],
      p_premium_limit: DAILY_LIMITS.premium[feature],
    }).single());
  }

  if (error && isMissingInfrastructure(error)) {
    return legacyCheckAndConsumeUsage(client, feature, userId);
  }
  if (error || !data) {
    console.error("[usage-limits] check_and_consume_usage rpc failed", error?.code);
    return { error: Response.json({ error: "Kullanım sınırı kontrol edilemedi." }, { status: 500 }) };
  }
  const result = data as { allowed: boolean; current_count: number; effective_limit: number | null; is_premium: boolean };
  // SQL fonksiyonu premium + sınırsız özellik için effective_limit'i NULL
  // döner (bkz. migration); bu, uygulamanın "sınır yok" göstergesi olan
  // Number.POSITIVE_INFINITY'e çevrilir — çağıran taraflar zaten
  // Number.isFinite(usage.limit) ile bu durumu kontrol ediyor.
  return { allowed: result.allowed, used: result.current_count, limit: result.effective_limit ?? Number.POSITIVE_INFINITY, isPremium: result.is_premium };
}

/**
 * db/migrations/20260812_combined_usage_check.sql henüz uygulanmamış eski
 * kurulumlar için iki adımlı geriye dönük uyumlu yol (profil okuma +
 * increment_usage_counter — bkz. db/migrations/20260726_usage_limits.sql).
 *
 * SİLME PLANI: bu fonksiyon yalnızca geçiş dönemi içindir. 20260812_combined_usage_check.sql
 * migration'ı TÜM ortamlarda (prod dahil) uygulandığı doğrulandıktan sonra:
 *   1) Bu fonksiyonu ve isLegacyTextNutritionCounter'ı sil.
 *   2) checkAndConsumeUsage'daki `if (error && isMissingInfrastructure(error))
 *      return legacyCheckAndConsumeUsage(...)` dalını kaldır (missing-infra
 *      artık yalnız handleMissingInfrastructure'a düşsün).
 *   3) checkAndConsumeUsage'ın userId parametresini kaldır (yalnız bu
 *      fonksiyonun .eq("id", userId) savunma katmanı için vardı; yeni RPC
 *      zaten yalnız auth.uid() okuyor) ve 5 çağrı yerini güncelle
 *      (app/api/chat, generate-plan, weekly-review, nutrition/parse-text,
 *      nutrition/advice route.ts dosyaları).
 * Bu üç adım atlanmadan silinmemeli; aksi hâlde eski kurulumlar sessizce
 * "Kullanım sınırı kontrol edilemedi" hatası almaya başlar.
 */
async function legacyCheckAndConsumeUsage(
  client: SupabaseClient,
  feature: UsageFeature,
  userId: string,
): Promise<UsageCheckResult | { error: Response }> {
  const { data: profile, error: profileError } = await client.from("profiles").select("is_premium").eq("id", userId).maybeSingle();
  if (profileError && !isMissingInfrastructure(profileError)) {
    console.error("[usage-limits] profile lookup failed", profileError.code);
    return { error: Response.json({ error: "Kullanım sınırı kontrol edilemedi." }, { status: 500 }) };
  }
  if (profileError) return handleMissingInfrastructure(feature, "profiles.is_premium");
  const isPremium = Boolean(profile?.is_premium);
  // Eski increment_usage_counter NULL'ı sınırsız olarak yorumlamaz (integer
  // parametre); bu yüzden burada gerçek NULL yerine LEGACY_UNLIMITED_SENTINEL
  // kullanılır (bkz. yukarıdaki sabitin açıklaması).
  const limit = isPremium ? (DAILY_LIMITS.premium[feature] ?? LEGACY_UNLIMITED_SENTINEL) : DAILY_LIMITS.free[feature];

  let { data, error } = await client.rpc("increment_usage_counter", { p_feature: feature, p_limit: limit }).single();
  // text_nutrition sayacı sonradan eklendi. Üretim migration'ı henüz
  // uygulanmamış eski kurulumlarda fonksiyon "invalid feature" döndürür.
  // AI öğün analizini tamamen kilitlemek yerine geçici olarak mevcut chat
  // sayacını aynı (daha düşük) besin limitiyle kullanırız. Migration
  // uygulandığında ilk çağrı doğrudan ayrı sayaca geçer.
  if (feature === "text_nutrition" && error && isLegacyTextNutritionCounter(error)) {
    console.warn("[usage-limits] text_nutrition sayacı bulunamadı; chat sayacı paylaşılıyor. db/migrations/20260806_premium_plan_expansion.sql çalıştırılmalı.");
    ({ data, error } = await client.rpc("increment_usage_counter", { p_feature: "chat", p_limit: limit }).single());
  }
  if (error && isMissingInfrastructure(error)) return handleMissingInfrastructure(feature, "increment_usage_counter", isPremium);
  if (error || !data) {
    console.error("[usage-limits] rpc failed", error?.code);
    return { error: Response.json({ error: "Kullanım sınırı kontrol edilemedi." }, { status: 500 }) };
  }
  const result = data as { allowed: boolean; current_count: number; effective_limit: number };
  return { allowed: result.allowed, used: result.current_count, limit: result.effective_limit ?? limit, isPremium };
}

/**
 * AI çağrısı sayaç artırıldıktan SONRA başarısız olursa (zaman aşımı, model
 * hatası, doğrulama başarısızlığı) o hakkı geri iade eder. Çağıran route
 * güvenli yerel yanıta düşse bile kullanıcının günlük hakkı boşa gitmesin
 * diye (bkz. app/api/chat/route.ts, app/api/nutrition/parse-text/route.ts).
 * İade, iyimser bir en-iyi-çaba işlemidir: başarısız olursa yalnız loglanır,
 * kullanıcıya hata döndürülmez — asıl istek zaten yanıtlanmış olur.
 */
export async function refundUsage(request: Request, feature: UsageFeature): Promise<void> {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = bearerToken(request);
  if (!url || !anonKey || !token) return;

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { error } = await client.rpc("refund_usage_counter", { p_feature: feature, p_amount: 1 });
  if (error && !isMissingInfrastructure(error)) {
    console.error("[usage-limits] refund_usage_counter failed", error.code);
  }
}

/**
 * Reklam izlendikten sonra bir özellik için günlük bonus hakkı verir (bkz.
 * db/migrations/20260810_ad_bonus_usage.sql — grant_usage_bonus). Bonus,
 * feature başına MAX_BONUS_PER_DAY ile sınırlıdır; SSV yerine bu tavan
 * kötüye kullanım riskini sınırlar (bkz. plan notları).
 */
export async function grantAdBonus(request: Request, feature: UsageFeature): Promise<AdBonusResult | { error: Response }> {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { error: Response.json({ error: "Reklam ödülü servisi yapılandırılmamış." }, { status: 503 }) };
  }
  const token = bearerToken(request);
  if (!token) {
    return { error: Response.json({ error: "Bu işlem için giriş yapmalısın." }, { status: 401 }) };
  }

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await client
    .rpc("grant_usage_bonus", { p_feature: feature, p_bonus: BONUS_PER_AD, p_max_bonus: MAX_BONUS_PER_DAY });
  if (error && isMissingInfrastructure(error)) {
    console.warn(`[usage-limits] grant_usage_bonus bulunamadı; reklam ödülü uygulanmadı. db/migrations/20260810_ad_bonus_usage.sql çalıştırılmalı.`);
    return { bonusCount: 0, maxBonus: MAX_BONUS_PER_DAY };
  }
  if (error || typeof data !== "number") {
    console.error("[usage-limits] grant_usage_bonus rpc failed", error?.code);
    return { error: Response.json({ error: "Reklam ödülü uygulanamadı." }, { status: 500 }) };
  }
  return { bonusCount: data, maxBonus: MAX_BONUS_PER_DAY };
}

/**
 * Ücretsiz kullanıcılarda haftalık AI değerlendirmesi 2 haftada bir sunulur
 * (bkz. weekly_ai_reviews — arşiv istemci tarafında yazılır). Kullanıcının
 * en son AI kaynaklı değerlendirmesinin hafta başlangıcını döndürür; hiç
 * yoksa veya sorgu başarısız olursa null döner (kısıtlama uygulanmaz, ilk
 * değerlendirme her zaman serbesttir).
 */
export async function lastAiWeeklyReviewWeekStart(request: Request): Promise<string | null> {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = bearerToken(request);
  if (!url || !anonKey || !token) return null;

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await client
    .from("weekly_ai_reviews")
    .select("week_start")
    .eq("source", "ai")
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { week_start: string }).week_start;
}

/** İki hafta başlangıcı (YYYY-MM-DD) arasındaki gün farkı. */
export function daysBetweenWeekStarts(a: string, b: string): number {
  const diff = Math.abs(new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime());
  return Math.round(diff / 86_400_000);
}

// db/migrations/20260726_usage_limits.sql henüz uygulanmamışsa sütun/fonksiyon
// yoktur. Bu bir kullanıcı hatası değil, eksik bir kurulum adımıdır; sohbeti ve
// fotoğraf analizini tamamen kilitlemek yerine sınırsız çalıştırıp durumu
// sunucu günlüğüne yazıyoruz. Migration uygulandığı anda sınırlar kendiliğinden
// devreye girer — kod değişikliği gerekmez.
const MISSING_INFRA_CODES = new Set([
  "42883", // undefined_function
  "42P01", // undefined_table
  "42703", // undefined_column
  "PGRST202", // PostgREST: fonksiyon şema önbelleğinde yok
  "PGRST204", // PostgREST: sütun şema önbelleğinde yok
]);

function isMissingInfrastructure(error: { code?: string | null }) {
  return Boolean(error.code && MISSING_INFRA_CODES.has(error.code));
}

function isLegacyTextNutritionCounter(error: { code?: string | null; message?: string | null; details?: string | null }) {
  if (error.code && ["P0001", "23514", "22P02"].includes(error.code)) return true;
  return /invalid feature|usage_counters_feature_check/i.test(`${error.message || ""} ${error.details || ""}`);
}

/**
 * Eksik altyapı (migration uygulanmamış / PostgREST şema önbelleği henüz
 * yenilenmemiş) tespit edildiğinde ne yapılacağına karar verir.
 *
 * Geliştirmede (NODE_ENV !== "production") sınırsız çalışmaya devam eder —
 * yerel kurulumda her migration'ı manuel uygulamadan iterasyon yapılabilsin.
 * ÜRETİMDE bunun tersi güvenli: sınırı uygulayamıyorsak isteği KAPALI tarafa
 * düşürüp 503 döneriz. Önceki davranış (üretimde de sınırsız) PGRST202/
 * PGRST204'ün yalnız "migration eksik" değil, PostgREST şema önbelleği kısa
 * süreliğine güncel değilken de dönebilmesi nedeniyle her deploy sonrası
 * kısa bir pencerede TÜM kullanıcılara sınırsız AI hakkı veriyordu.
 */
function handleMissingInfrastructure(feature: UsageFeature, missing: string, isPremium = false): UsageCheckResult | { error: Response } {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[usage-limits] ${missing} bulunamadı; kullanım sınırı uygulanmıyor (yalnız üretim dışı). db/migrations/20260726_usage_limits.sql çalıştırılmalı.`);
    return { allowed: true, used: 0, limit: Number.POSITIVE_INFINITY, isPremium };
  }
  console.error(`[usage-limits] ${missing} bulunamadı; kullanım sınırı üretimde kapalı tarafa düşürüldü (feature=${feature}). db/migrations/20260726_usage_limits.sql çalıştırılmalı.`);
  return { error: Response.json({ error: "Kullanım sınırı servisi geçici olarak kullanılamıyor. Lütfen kısa süre sonra tekrar dene." }, { status: 503 }) };
}

export function usageLimitExceeded(feature: UsageFeature, used: number, limit: number) {
  const featureLabel = feature === "chat"
    ? "AI koç mesajı"
    : feature === "photo"
      ? "fotoğrafla öğün analizi"
      : feature === "text_nutrition"
        ? "yazarak AI besin tahmini"
        : feature === "weekly_review"
          ? "haftalık AI değerlendirme"
          : feature === "plan"
            ? "AI program üretimi"
            : "AI beslenme önerisi";
  return Response.json(
    {
      error: `Bugünkü ücretsiz ${featureLabel} sınırına ulaştın (${limit}/${limit}). Yarın tekrar deneyebilirsin.`,
      limitReached: true,
      feature,
      used,
      limit,
    },
    { status: 429 },
  );
}

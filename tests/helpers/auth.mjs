// Korumalı API rotalarını test ederken Supabase kimlik doğrulamasını taklit eden yardımcılar.
// Güvenlik kontrolü devre dışı bırakılmaz; yalnızca Supabase'in kullanıcı uç noktası taklit edilir.

export const TEST_TOKEN = "test-access-token";
export const TEST_USER_ID = "00000000-0000-4000-8000-000000000001";

export function withSupabaseAuthEnv() {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  return () => {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
  };
}

/**
 * Supabase kullanıcı uç noktasını doğrulanmış kullanıcıyla yanıtlar, diğer
 * istekleri devreder. `userId` verilirse (rateLimit gibi kullanıcı başına
 * paylaşılan modül-düzeyi durumdan testleri izole etmek için) farklı bir
 * sahte kullanıcı kimliği döner; varsayılan hâlâ TEST_USER_ID'dir.
 */
export function withAuthenticatedFetch(passThrough, userId = TEST_USER_ID) {
  return async (url, init) => {
    if (String(url).includes("/auth/v1/user")) {
      return Response.json({
        id: userId,
        aud: "authenticated",
        role: "authenticated",
        email: "test@example.com",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-01-01T00:00:00.000Z",
      });
    }
    if (!passThrough) throw new TypeError("beklenmeyen ağ isteği");
    return passThrough(url, init);
  };
}

export function authorizedRequest(url, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${TEST_TOKEN}`);
  return new Request(url, { ...init, headers });
}

/**
 * Kullanım kotası kontrolünü taklit eder (bkz. lib/usage-limits.ts
 * checkAndConsumeUsage / db/migrations/20260812_combined_usage_check.sql).
 * check_and_consume_usage RPC'sine giden gövdeden p_free_limit/p_premium_limit'i
 * okuyup effective_limit'i GERÇEK fonksiyonla aynı biçimde hesaplar; testler
 * limiti elle tekrar yazmak zorunda kalmaz. Geriye dönük uyumluluk yolunu
 * (profiles + increment_usage_counter) da aynı anda yanıtlar, hangi yol
 * çağrılırsa çağrılsın tutarlı kalır. `extra` verilirse eşleşmeyen istekler
 * ona devredilir (ör. AI sağlayıcısı çağrısı).
 */
export function withUsageMock({ isPremium = false, allowed = true, currentCount = 1 } = {}, extra) {
  return withAuthenticatedFetch((url, init) => {
    const href = String(url);
    if (href.includes("/rpc/check_and_consume_usage")) {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const effectiveLimit = isPremium ? body.p_premium_limit : body.p_free_limit;
      return Response.json({
        allowed: effectiveLimit === null ? true : allowed,
        current_count: currentCount,
        effective_limit: effectiveLimit,
        is_premium: isPremium,
      });
    }
    if (href.includes("/rest/v1/profiles")) return Response.json({ is_premium: isPremium });
    if (href.includes("/rpc/increment_usage_counter")) return Response.json({ allowed, current_count: currentCount });
    if (extra) return extra(url, init);
    throw new TypeError(`beklenmeyen ağ isteği: ${href}`);
  });
}

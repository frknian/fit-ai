import assert from "node:assert/strict";
import test from "node:test";
import { checkAndConsumeUsage, refundUsage, usageLimitExceeded, daysBetweenWeekStarts, lastAiWeeklyReviewWeekStart } from "../lib/usage-limits.ts";
import { authorizedRequest, withAuthenticatedFetch, withUsageMock, withSupabaseAuthEnv, TEST_TOKEN, TEST_USER_ID } from "./helpers/auth.mjs";

test("ücretsiz kullanıcı için Fit Koç sohbeti sınırsızdır", async () => {
  const restoreEnv = withSupabaseAuthEnv();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = withUsageMock({ isPremium: false, allowed: true, currentCount: 3 });
  try {
    const request = authorizedRequest("http://localhost/x", { headers: { Authorization: `Bearer ${TEST_TOKEN}` } });
    const result = await checkAndConsumeUsage(request, "chat", TEST_USER_ID);
    assert.ok(!("error" in result));
    assert.deepEqual(result, { allowed: true, used: 3, limit: Number.POSITIVE_INFINITY, isPremium: false });
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv();
  }
});

test("ücretli kullanıcı için AI kullanımı sınırsızdır", async () => {
  // bkz. db/migrations/20260821_premium_unlimited_ai_usage.sql — AI maliyeti
  // büyük ölçüde cihaz üstü çıkarımla karşılandığı için premium'da günlük
  // sınır kaldırıldı. SQL fonksiyonu bunu effective_limit=NULL ile ifade eder;
  // istemci tarafı bunu Number.POSITIVE_INFINITY'e çevirir.
  const restoreEnv = withSupabaseAuthEnv();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = withUsageMock({ isPremium: true, allowed: true, currentCount: 8 });
  try {
    const request = authorizedRequest("http://localhost/x");
    const result = await checkAndConsumeUsage(request, "photo", TEST_USER_ID);
    assert.ok(!("error" in result));
    assert.deepEqual(result, { allowed: true, used: 8, limit: Number.POSITIVE_INFINITY, isPremium: true });
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv();
  }
});

test("birleşik RPC tek round trip'te premium ve sayacı birlikte döner", async () => {
  // db/migrations/20260812_combined_usage_check.sql — profil okuma ile sayaç
  // artırma artık TEK çağrıda birleşiyor; ayrı bir /rest/v1/profiles isteği
  // GİTMEMELİ.
  const restoreEnv = withSupabaseAuthEnv();
  const previousFetch = globalThis.fetch;
  const calledUrls = [];
  globalThis.fetch = withAuthenticatedFetch((url, init) => {
    calledUrls.push(String(url));
    if (String(url).includes("/rpc/check_and_consume_usage")) {
      const body = JSON.parse(String(init?.body));
      return Response.json({ allowed: true, current_count: 1, effective_limit: body.p_free_limit, is_premium: false });
    }
    throw new TypeError(`beklenmeyen ağ isteği: ${url}`);
  });
  try {
    const result = await checkAndConsumeUsage(authorizedRequest("http://localhost/x"), "chat", TEST_USER_ID);
    assert.ok(!("error" in result));
    assert.equal(result.allowed, true);
    assert.ok(!calledUrls.some((url) => url.includes("/rest/v1/profiles")), "ayrı bir profil sorgusu gitmemeliydi");
    assert.ok(!calledUrls.some((url) => url.includes("/rpc/increment_usage_counter")), "eski iki adımlı yola düşülmemeliydi");
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv();
  }
});

test("birleşik RPC bulunamazsa eski iki adımlı yola (profil + increment_usage_counter) düşülür", async () => {
  const restoreEnv = withSupabaseAuthEnv();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = withAuthenticatedFetch((url) => {
    if (String(url).includes("/rpc/check_and_consume_usage")) return Response.json({ code: "PGRST202", message: "function not found" }, { status: 404 });
    if (String(url).includes("/rest/v1/profiles")) return Response.json({ is_premium: false });
    if (String(url).includes("/rpc/increment_usage_counter")) return Response.json({ allowed: true, current_count: 3 });
    throw new TypeError(`beklenmeyen ağ isteği: ${url}`);
  });
  try {
    const result = await checkAndConsumeUsage(authorizedRequest("http://localhost/x"), "chat", TEST_USER_ID);
    assert.deepEqual(result, { allowed: true, used: 3, limit: Number.POSITIVE_INFINITY, isPremium: false });
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv();
  }
});

// Eksik altyapı (migration hiç uygulanmamış / PostgREST şema önbelleği güncel
// değil) davranışı: geliştirmede sınırsız çalışmaya devam eder (iterasyon
// kolaylığı), ama ÜRETİMDE artık kapalı tarafa düşer (503). Öncesinde üretimde
// de sınırsızdı — her deploy sonrası PostgREST önbelleği kısa süre eskiyken
// TÜM kullanıcılara sınırsız AI hakkı veriyordu.
function withFullyMissingInfraFetch() {
  return withAuthenticatedFetch((url) => {
    if (String(url).includes("/rpc/check_and_consume_usage")) return Response.json({ code: "PGRST202", message: "function not found" }, { status: 404 });
    if (String(url).includes("/rest/v1/profiles")) return Response.json({ code: "PGRST202", message: "relation not found" }, { status: 404 });
    throw new TypeError(`beklenmeyen ağ isteği: ${url}`);
  });
}

test("eksik altyapı: normal durum — geliştirmede (NODE_ENV≠production) sınırsız çalışmaya devam eder", async () => {
  const restoreEnv = withSupabaseAuthEnv();
  const previousFetch = globalThis.fetch;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  globalThis.fetch = withFullyMissingInfraFetch();
  try {
    const result = await checkAndConsumeUsage(authorizedRequest("http://localhost/x"), "chat", TEST_USER_ID);
    assert.ok(!("error" in result));
    assert.deepEqual(result, { allowed: true, used: 0, limit: Number.POSITIVE_INFINITY, isPremium: false });
  } finally {
    globalThis.fetch = previousFetch;
    process.env.NODE_ENV = previousNodeEnv;
    restoreEnv();
  }
});

test("eksik altyapı: edge case — üretimde (NODE_ENV=production) kapalı tarafa düşüp 503 döner", async () => {
  const restoreEnv = withSupabaseAuthEnv();
  const previousFetch = globalThis.fetch;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  globalThis.fetch = withFullyMissingInfraFetch();
  try {
    const result = await checkAndConsumeUsage(authorizedRequest("http://localhost/x"), "chat", TEST_USER_ID);
    assert.ok("error" in result, "üretimde sınırsız yerine hata dönmeli");
    assert.equal(result.error.status, 503);
  } finally {
    globalThis.fetch = previousFetch;
    process.env.NODE_ENV = previousNodeEnv;
    restoreEnv();
  }
});

test("eksik altyapı: normal durum — üretimde geçici önbellek gecikmesi TEK yeniden denemede kendini düzeltir, 503 dönmez", async () => {
  // PGRST202/PGRST204 çoğu zaman migration eksikliği değil, deploy sonrası
  // PostgREST şema önbelleğinin henüz güncellenmemiş olmasıdır (bkz.
  // lib/usage-limits.ts checkAndConsumeUsage yorumu). İlk çağrı hatayla
  // dönsün, ~400ms sonraki YENİDEN DENEME başarılı olsun; kullanıcı hiçbir
  // hata görmemeli.
  const restoreEnv = withSupabaseAuthEnv();
  const previousFetch = globalThis.fetch;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  let rpcCalls = 0;
  globalThis.fetch = withAuthenticatedFetch((url, init) => {
    if (String(url).includes("/rpc/check_and_consume_usage")) {
      rpcCalls += 1;
      if (rpcCalls === 1) return Response.json({ code: "PGRST202", message: "function not found" }, { status: 404 });
      const body = JSON.parse(String(init?.body));
      return Response.json({ allowed: true, current_count: 1, effective_limit: body.p_free_limit, is_premium: false });
    }
    throw new TypeError(`beklenmeyen ağ isteği: ${url}`);
  });
  try {
    const result = await checkAndConsumeUsage(authorizedRequest("http://localhost/x"), "chat", TEST_USER_ID);
    assert.ok(!("error" in result), "önbellek kendini düzelttiğinde 503 dönmemeli");
    assert.deepEqual(result, { allowed: true, used: 1, limit: Number.POSITIVE_INFINITY, isPremium: false });
    assert.equal(rpcCalls, 2, "tam olarak bir yeniden deneme yapılmalı");
  } finally {
    globalThis.fetch = previousFetch;
    process.env.NODE_ENV = previousNodeEnv;
    restoreEnv();
  }
});

test("eksik altyapı: hatalı input — gerçek bir veritabanı hatası ortamdan bağımsız her zaman 500 döner", async () => {
  // "eksik altyapı" değil, gerçek bir hata (ör. yetki reddi). Bu, ortam
  // ayrımından etkilenmemeli — hem dev hem prod'da 500 kalmalı, sınırsıza
  // düşülmemeli.
  const restoreEnv = withSupabaseAuthEnv();
  const previousFetch = globalThis.fetch;
  const previousNodeEnv = process.env.NODE_ENV;
  globalThis.fetch = withAuthenticatedFetch((url) => {
    if (String(url).includes("/rpc/check_and_consume_usage")) return Response.json({ code: "42501", message: "permission denied" }, { status: 403 });
    throw new TypeError(`beklenmeyen ağ isteği: ${url}`);
  });
  try {
    for (const env of ["test", "production"]) {
      process.env.NODE_ENV = env;
      const result = await checkAndConsumeUsage(authorizedRequest("http://localhost/x"), "chat", TEST_USER_ID);
      assert.ok("error" in result, `${env} ortamında da hata dönmeli`);
      assert.equal(result.error.status, 500);
    }
  } finally {
    globalThis.fetch = previousFetch;
    process.env.NODE_ENV = previousNodeEnv;
    restoreEnv();
  }
});

test("eski veritabanında yazılı besin sayacı geçici olarak chat sayacına düşer", async () => {
  // Bu senaryo, hem yeni birleşik RPC'nin hem de text_nutrition sayacının
  // henüz uygulanmadığı EN ESKİ kurulumu taklit eder: ikisi de eksik.
  const restoreEnv = withSupabaseAuthEnv();
  const previousFetch = globalThis.fetch;
  const requestedFeatures = [];
  globalThis.fetch = withAuthenticatedFetch((url, init) => {
    if (String(url).includes("/rpc/check_and_consume_usage")) return Response.json({ code: "PGRST202", message: "function not found" }, { status: 404 });
    if (String(url).includes("/rest/v1/profiles")) return Response.json({ is_premium: false });
    if (String(url).includes("/rpc/increment_usage_counter")) {
      const body = JSON.parse(String(init?.body));
      requestedFeatures.push(body.p_feature);
      if (body.p_feature === "text_nutrition") {
        return Response.json({ code: "P0001", message: "invalid feature" }, { status: 400 });
      }
      return Response.json({ allowed: true, current_count: 2 });
    }
    throw new TypeError(`beklenmeyen ağ isteği: ${url}`);
  });
  try {
    const result = await checkAndConsumeUsage(authorizedRequest("http://localhost/x"), "text_nutrition", TEST_USER_ID);
    assert.deepEqual(requestedFeatures, ["text_nutrition", "chat"]);
    assert.deepEqual(result, { allowed: true, used: 2, limit: 3, isPremium: false });
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv();
  }
});

test("sınırlı bir AI özelliğinde sunucu limit aşımını bildirebilir", async () => {
  const restoreEnv = withSupabaseAuthEnv();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = withUsageMock({ isPremium: false, allowed: false, currentCount: 5 });
  try {
    const request = authorizedRequest("http://localhost/x");
    const result = await checkAndConsumeUsage(request, "nutrition_advice", TEST_USER_ID);
    assert.ok(!("error" in result));
    assert.equal(result.allowed, false);
    const response = usageLimitExceeded("chat", result.used, result.limit);
    assert.equal(response.status, 429);
    const payload = await response.json();
    assert.equal(payload.limitReached, true);
    assert.match(payload.error, /5\/5/);
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv();
  }
});

test("haftalık AI değerlendirme ücretsiz kullanıcı için düşük limitle sınırlanır", async () => {
  const restoreEnv = withSupabaseAuthEnv();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = withUsageMock({ isPremium: false, allowed: false, currentCount: 1 });
  try {
    const request = authorizedRequest("http://localhost/x");
    const result = await checkAndConsumeUsage(request, "weekly_review", TEST_USER_ID);
    assert.ok(!("error" in result));
    assert.deepEqual(result, { allowed: false, used: 1, limit: 1, isPremium: false });
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv();
  }
});

test("AI beslenme önerisi ücretli kullanıcı için sınırsızdır", async () => {
  const restoreEnv = withSupabaseAuthEnv();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = withUsageMock({ isPremium: true, allowed: true, currentCount: 4 });
  try {
    const request = authorizedRequest("http://localhost/x");
    const result = await checkAndConsumeUsage(request, "nutrition_advice", TEST_USER_ID);
    assert.ok(!("error" in result));
    assert.deepEqual(result, { allowed: true, used: 4, limit: Number.POSITIVE_INFINITY, isPremium: true });
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv();
  }
});

test("iki hafta başlangıcı arasındaki gün farkı doğru hesaplanır", () => {
  assert.equal(daysBetweenWeekStarts("2026-07-06", "2026-07-13"), 7);
  assert.equal(daysBetweenWeekStarts("2026-07-13", "2026-07-06"), 7);
  assert.equal(daysBetweenWeekStarts("2026-07-06", "2026-07-20"), 14);
});

test("en son AI kaynaklı haftalık değerlendirmenin hafta başlangıcı sorgulanır", async () => {
  const restoreEnv = withSupabaseAuthEnv();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = withAuthenticatedFetch((url) => {
    if (String(url).includes("/rest/v1/weekly_ai_reviews")) return Response.json([{ week_start: "2026-07-13" }]);
    throw new TypeError(`beklenmeyen ağ isteği: ${url}`);
  });
  try {
    const result = await lastAiWeeklyReviewWeekStart(authorizedRequest("http://localhost/x"));
    assert.equal(result, "2026-07-13");
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv();
  }
});

test("jetonsuz istek Supabase'e hiç gitmeden reddedilir", async () => {
  const restoreEnv = withSupabaseAuthEnv();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError("beklenmeyen ağ isteği"); };
  try {
    const result = await checkAndConsumeUsage(new Request("http://localhost/x"), "chat", TEST_USER_ID);
    assert.ok("error" in result);
    assert.equal(result.error.status, 401);
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv();
  }
});

test("sohbet beşinci sorudan sonra da yanıt vermeye devam eder", { concurrency: false }, async () => {
  const previousKey = process.env.AI_API_KEY;
  const previousFetch = globalThis.fetch;
  const restoreAuthEnv = withSupabaseAuthEnv();
  process.env.AI_API_KEY = "test-key";
  globalThis.fetch = withUsageMock({ allowed: false, currentCount: 6 }, (url) => {
    if (String(url).includes("/chat/completions")) {
      return Response.json({ choices: [{ message: { role: "assistant", content: "Sohbet sınırı olmadan devam edebiliriz." } }] });
    }
    throw new TypeError(`beklenmeyen ağ isteği: ${url}`);
  });
  try {
    const { POST } = await import(`../app/api/chat/route.ts?test=${Date.now()}`);
    const response = await POST(authorizedRequest("http://localhost/api/chat", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", text: "Bugün ne yapmalıyım?" }] }) }));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.source, "ai");
    assert.equal(payload.usage, undefined);
  } finally {
    globalThis.fetch = previousFetch;
    restoreAuthEnv();
    if (previousKey === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = previousKey;
  }
});

test("sınırsız sohbet yanıtında günlük kota bilgisi gösterilmez", { concurrency: false }, async () => {
  const previousKey = process.env.AI_API_KEY;
  const previousFetch = globalThis.fetch;
  const restoreAuthEnv = withSupabaseAuthEnv();
  process.env.AI_API_KEY = "test-key";
  const aiResponse = { choices: [{ message: { role: "assistant", content: "Bugün dinlenme günü, hafif bir yürüyüş yapabilirsin." } }] };
  globalThis.fetch = withUsageMock({ allowed: true, currentCount: 2 }, (url) => {
    if (String(url).includes("/chat/completions")) return Response.json(aiResponse);
    throw new TypeError(`beklenmeyen ağ isteği: ${url}`);
  });
  try {
    const { POST } = await import(`../app/api/chat/route.ts?test=${Date.now()}`);
    const response = await POST(authorizedRequest("http://localhost/api/chat", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", text: "Bugün ne yapmalıyım?" }] }) }));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.source, "ai");
    assert.equal(payload.usage, undefined);
  } finally {
    globalThis.fetch = previousFetch;
    restoreAuthEnv();
    if (previousKey === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = previousKey;
  }
});

// refundUsage: AI çağrısı sayaç artırıldıktan SONRA başarısız olursa (bkz.
// app/api/chat/route.ts) kullanıcının günlük hakkı boşa gitmesin diye iade
// edilir. Bu üç test doğrudan refundUsage()'ı, sonraki ikisi ise chat
// route'unun gerçekten çağırdığını sınıyor.

test("refundUsage: normal durum — RPC'ye doğru feature ile tek istek atılır", async () => {
  const restoreEnv = withSupabaseAuthEnv();
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = withAuthenticatedFetch((url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
    if (String(url).includes("/rpc/refund_usage_counter")) return Response.json(2);
    throw new TypeError(`beklenmeyen ağ isteği: ${url}`);
  });
  try {
    await refundUsage(authorizedRequest("http://localhost/x"), "chat");
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/rpc\/refund_usage_counter$/);
    assert.deepEqual(calls[0].body, { p_feature: "chat", p_amount: 1 });
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv();
  }
});

test("refundUsage: edge case — refund_usage_counter migration'ı henüz yoksa sessizce hiçbir şey yapmaz (fırlamaz)", async () => {
  const restoreEnv = withSupabaseAuthEnv();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = withAuthenticatedFetch((url) => {
    if (String(url).includes("/rpc/refund_usage_counter")) return Response.json({ code: "PGRST202", message: "function not found" }, { status: 404 });
    throw new TypeError(`beklenmeyen ağ isteği: ${url}`);
  });
  try {
    await assert.doesNotReject(() => refundUsage(authorizedRequest("http://localhost/x"), "chat"));
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv();
  }
});

test("refundUsage: hatalı input — jetonsuz istekte ağa hiç gitmeden sessizce döner", async () => {
  const restoreEnv = withSupabaseAuthEnv();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError("beklenmeyen ağ isteği"); };
  try {
    await assert.doesNotReject(() => refundUsage(new Request("http://localhost/x"), "chat"));
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv();
  }
});

test("sohbet: normal durum — AI başarıyla yanıt verince hak iade edilMEZ", { concurrency: false }, async () => {
  const previousKey = process.env.AI_API_KEY;
  const previousFetch = globalThis.fetch;
  const restoreAuthEnv = withSupabaseAuthEnv();
  process.env.AI_API_KEY = "test-key";
  const refundCalls = [];
  globalThis.fetch = withUsageMock({ allowed: true, currentCount: 2 }, (url) => {
    if (String(url).includes("/rpc/refund_usage_counter")) { refundCalls.push(String(url)); return Response.json(1); }
    if (String(url).includes("/chat/completions")) return Response.json({ choices: [{ message: { role: "assistant", content: "Bugün dinlenme günü." } }] });
    throw new TypeError(`beklenmeyen ağ isteği: ${url}`);
  });
  try {
    const { POST } = await import(`../app/api/chat/route.ts?test=${Date.now()}`);
    const response = await POST(authorizedRequest("http://localhost/api/chat", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", text: "Bugün ne yapmalıyım?" }] }) }));
    assert.equal(response.status, 200);
    assert.equal(refundCalls.length, 0, "başarılı yanıtta iade çağrılmamalı");
  } finally {
    globalThis.fetch = previousFetch;
    restoreAuthEnv();
    if (previousKey === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = previousKey;
  }
});

test("sohbet: AI çağrısı başarısız olsa da sınırsız kotada iade çağrısı gerekmez", { concurrency: false }, async () => {
  const previousKey = process.env.AI_API_KEY;
  const previousFetch = globalThis.fetch;
  const restoreAuthEnv = withSupabaseAuthEnv();
  process.env.AI_API_KEY = "test-key";
  const refundCalls = [];
  globalThis.fetch = withUsageMock({ allowed: true, currentCount: 2 }, (url, init) => {
    if (String(url).includes("/rpc/refund_usage_counter")) {
      refundCalls.push(init?.body ? JSON.parse(String(init.body)) : null);
      return Response.json(1);
    }
    if (String(url).includes("/chat/completions")) throw new TypeError("network unavailable");
    throw new TypeError(`beklenmeyen ağ isteği: ${url}`);
  });
  try {
    const { POST } = await import(`../app/api/chat/route.ts?test=${Date.now()}`);
    const response = await POST(authorizedRequest("http://localhost/api/chat", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", text: "Bugün ne yapmalıyım?" }] }) }));
    // AI başarısız olduğunda route güvenli yerel yanıta düşer ve yine 200 döner.
    // Sohbet artık sınırsız olduğu için geri verilecek bir günlük hak yoktur.
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.source, "fallback");
    assert.equal(refundCalls.length, 0);
  } finally {
    globalThis.fetch = previousFetch;
    restoreAuthEnv();
    if (previousKey === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = previousKey;
  }
});

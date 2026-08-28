import assert from "node:assert/strict";
import test from "node:test";
import { enforceWeeklySafety, hasEnoughWeeklyData, localWeeklyReview, validateWeeklyReview, validateWeeklySummary, weeklyReviewWeekStart } from "../lib/weekly-review.ts";
import { authorizedRequest, withAuthenticatedFetch, withSupabaseAuthEnv, withUsageMock } from "./helpers/auth.mjs";
import { tr } from "../lib/i18n/dictionaries/tr.ts";

function openAiResponse(text) {
  return { id: "resp_test", created_at: 1, model: "gpt-5.6-terra", output: [{ type: "message", role: "assistant", id: "msg_test", content: [{ type: "output_text", text, annotations: [] }] }], usage: { input_tokens: 10, output_tokens: 10 } };
}

const baseSummary = {
  weekStart: "2026-07-20", goalCategory: "Güçlenme", sessionCount: 2, completionRate: 90, totalMinutes: 70,
  easySessions: 1, suitableSessions: 1, hardSessions: 0, averageFatigue: 2.5, painAreas: [], nutritionEntryCount: 8,
  nutritionLoggedDays: 3, averageCalories: 2100, averageProteinGrams: 105, weightChangeKg: -0.3, waistChangeCm: null,
};

test("validates anonymous weekly summary and week-start cache key", () => {
  assert.ok(validateWeeklySummary(baseSummary));
  assert.equal(weeklyReviewWeekStart(new Date("2026-07-22T10:00:00Z")), "2026-07-20");
  assert.equal(hasEnoughWeeklyData(baseSummary), true);
  assert.equal(hasEnoughWeeklyData({ ...baseSummary, sessionCount: 0 }), false);
  assert.equal(hasEnoughWeeklyData({ ...baseSummary, sessionCount: 1, nutritionLoggedDays: 0, weightChangeKg: null }), false);
});

test("produces a complete local review when AI is unavailable", () => {
  const review = localWeeklyReview(baseSummary, tr);
  assert.ok(validateWeeklyReview(review));
  assert.ok(review.recommendations.length >= 2 && review.recommendations.length <= 4);
  assert.match(review.safetyNote, /tıbbi teşhis değildir/i);
});

test("blocks load increases when pain or high fatigue is present", () => {
  const riskySummary = { ...baseSummary, averageFatigue: 4.5, painAreas: ["Diz"] };
  const unsafeReview = { headline: "İyi hafta", summary: "Özet", positives: ["Düzenliydin"], cautions: ["Takip et"], recommendations: ["Ağırlığı artır", "Set sayısını artır", "Programı sürdür"], safetyNote: "Tıbbi tanı değildir." };
  const safe = enforceWeeklySafety(unsafeReview, riskySummary, tr);
  assert.match(safe.headline, /toparlanma/i);
  assert.doesNotMatch(safe.recommendations.join(" "), /ağırlığı artır|set sayısını artır/i);
  assert.match(safe.recommendations.join(" "), /artırma/i);
});

test("blocks English load-increase recommendations too", () => {
  const riskySummary = { ...baseSummary, averageFatigue: 4.5, painAreas: ["Diz"] };
  const unsafeReview = { headline: "Good week", summary: "Summary", positives: ["Consistent"], cautions: ["Keep watching"], recommendations: ["Increase the weight", "Add more sets", "Keep the program"], safetyNote: "Not a medical diagnosis." };
  const safe = enforceWeeklySafety(unsafeReview, riskySummary, tr);
  assert.doesNotMatch(safe.recommendations.join(" "), /increase the weight|add more sets/i);
});

test("weekly API returns a validated local fallback without an AI key", async () => {
  const previousKey = process.env.AI_API_KEY;
  const previousFetch = globalThis.fetch;
  const restoreAuthEnv = withSupabaseAuthEnv();
  globalThis.fetch = withAuthenticatedFetch(null);
  delete process.env.AI_API_KEY;
  try {
    const { POST } = await import(`../app/api/weekly-review/route.ts?test=${Date.now()}`);
    const response = await POST(authorizedRequest("http://localhost/api/weekly-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ summary: baseSummary, email: "gonderilmemeli@example.com" }) }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.source, "local");
    assert.ok(validateWeeklyReview(payload.review));
  } finally {
    globalThis.fetch = previousFetch;
    restoreAuthEnv();
    if (previousKey) process.env.AI_API_KEY = previousKey;
  }
});

test("günlük AI değerlendirme sınırı dolunca AI'ya gitmeden yerel değerlendirmeye düşülür", async () => {
  const previousKey = process.env.AI_API_KEY;
  const previousFetch = globalThis.fetch;
  const restoreAuthEnv = withSupabaseAuthEnv();
  process.env.AI_API_KEY = "test-key";
  globalThis.fetch = withUsageMock({ isPremium: false, allowed: false, currentCount: 1 });
  try {
    const { POST } = await import(`../app/api/weekly-review/route.ts?test=${Date.now()}`);
    const response = await POST(authorizedRequest("http://localhost/api/weekly-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ summary: baseSummary }) }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.source, "local");
    assert.ok(validateWeeklyReview(payload.review));
  } finally {
    globalThis.fetch = previousFetch;
    restoreAuthEnv();
    if (previousKey === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = previousKey;
  }
});

function withWeeklyReviewFetch({ isPremium, lastAiWeekStart, generated }) {
  return withUsageMock({ isPremium, allowed: true, currentCount: 1 }, (url) => {
    if (String(url).includes("/rest/v1/weekly_ai_reviews")) return Response.json(lastAiWeekStart ? [{ week_start: lastAiWeekStart }] : []);
    if (String(url).includes("/responses")) return Response.json(openAiResponse(JSON.stringify(generated)));
    throw new TypeError(`beklenmeyen ağ isteği: ${url}`);
  });
}

const generatedReview = {
  headline: "İyi bir hafta", summary: "Özet.", positives: ["A"], cautions: ["B"], recommendations: ["C", "D"], safetyNote: "Güvenlik notu.",
};

test("ücretsiz kullanıcıda son 14 gün içinde AI değerlendirme alındıysa yerele düşülür", { concurrency: false }, async () => {
  const previousKey = process.env.AI_API_KEY;
  const previousFetch = globalThis.fetch;
  const restoreAuthEnv = withSupabaseAuthEnv();
  process.env.AI_API_KEY = "test-key";
  // baseSummary.weekStart 2026-07-20; son AI haftası 2026-07-13 → 7 gün önce.
  globalThis.fetch = withWeeklyReviewFetch({ isPremium: false, lastAiWeekStart: "2026-07-13", generated: generatedReview });
  try {
    const { POST } = await import(`../app/api/weekly-review/route.ts?test=${Date.now()}`);
    const response = await POST(authorizedRequest("http://localhost/api/weekly-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ summary: baseSummary }) }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.source, "local");
  } finally {
    globalThis.fetch = previousFetch;
    restoreAuthEnv();
    if (previousKey === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = previousKey;
  }
});

test("ücretsiz kullanıcıda 14 günden eski AI değerlendirmesi varsa yeni AI değerlendirme üretilir", { concurrency: false }, async () => {
  const previousKey = process.env.AI_API_KEY;
  const previousFetch = globalThis.fetch;
  const restoreAuthEnv = withSupabaseAuthEnv();
  process.env.AI_API_KEY = "test-key";
  // 2026-06-29 → 2026-07-20'ye 21 gün, sınırın (14 gün) üzerinde.
  globalThis.fetch = withWeeklyReviewFetch({ isPremium: false, lastAiWeekStart: "2026-06-29", generated: generatedReview });
  try {
    const { POST } = await import(`../app/api/weekly-review/route.ts?test=${Date.now()}`);
    const response = await POST(authorizedRequest("http://localhost/api/weekly-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ summary: baseSummary }) }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.source, "ai");
  } finally {
    globalThis.fetch = previousFetch;
    restoreAuthEnv();
    if (previousKey === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = previousKey;
  }
});

test("premium kullanıcıda 2 haftalık kısıtlama uygulanmaz", { concurrency: false }, async () => {
  const previousKey = process.env.AI_API_KEY;
  const previousFetch = globalThis.fetch;
  const restoreAuthEnv = withSupabaseAuthEnv();
  process.env.AI_API_KEY = "test-key";
  // Son AI haftası bir hafta önce olmasına rağmen premium olduğu için kısıtlanmaz.
  globalThis.fetch = withWeeklyReviewFetch({ isPremium: true, lastAiWeekStart: "2026-07-13", generated: generatedReview });
  try {
    const { POST } = await import(`../app/api/weekly-review/route.ts?test=${Date.now()}`);
    const response = await POST(authorizedRequest("http://localhost/api/weekly-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ summary: baseSummary }) }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.source, "ai");
  } finally {
    globalThis.fetch = previousFetch;
    restoreAuthEnv();
    if (previousKey === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = previousKey;
  }
});

test("kimliği doğrulanmamış haftalık değerlendirme isteği reddedilir", async () => {
  const restoreAuthEnv = withSupabaseAuthEnv();
  try {
    const { POST } = await import(`../app/api/weekly-review/route.ts?test=${Date.now()}`);
    const response = await POST(new Request("http://localhost/api/weekly-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ summary: baseSummary }) }));
    assert.equal(response.status, 401);
  } finally {
    restoreAuthEnv();
  }
});

test("riskli haftada aynı tavsiye iki kez verilmez", () => {
  const riskli = { ...baseSummary, averageFatigue: 4.5, painAreas: ["Diz"] };
  const inceleme = enforceWeeklySafety(localWeeklyReview(riskli, tr), riskli, tr);
  // Set ile tekilleştirme yalnızca birebir aynı metinleri yakalar; neredeyse
  // aynı iki tavsiye 4 satırlık listenin bir slotunu boşa harcar.
  const kelimeler = (metin) => metin.toLocaleLowerCase("tr-TR").replace(/[^a-zçğıöşü ]/g, "").split(/\s+/).filter((k) => k.length > 3);
  for (let i = 0; i < inceleme.recommendations.length; i += 1) {
    for (let j = i + 1; j < inceleme.recommendations.length; j += 1) {
      const a = new Set(kelimeler(inceleme.recommendations[i]));
      const b = kelimeler(inceleme.recommendations[j]);
      const ortak = b.filter((k) => a.has(k)).length;
      assert.ok(ortak < Math.min(a.size, b.length) * 0.8, `neredeyse aynı: "${inceleme.recommendations[i]}" / "${inceleme.recommendations[j]}"`);
    }
  }
  assert.equal(new Set(inceleme.recommendations).size, inceleme.recommendations.length);
});

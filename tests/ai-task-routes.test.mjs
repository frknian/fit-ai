import assert from "node:assert/strict";
import test from "node:test";
import { providerRegistry } from "../lib/ai/providers/registry.ts";
import { generateCoachObject, generateCoachTaskText } from "../lib/ai/coach.ts";
import { nutritionGaps } from "../lib/nutrition-advice.ts";
import { loadMemories } from "../lib/ai/memory.ts";
import { authorizedRequest, TEST_USER_ID, withSupabaseAuthEnv, withUsageMock } from "./helpers/auth.mjs";

const SILENT = { sink: () => {} };

// Sistem promptunu testin görebilmesi için yanıtta geri veren sahte sağlayıcı.
function echoProvider(behaviour = {}) {
  return {
    id: "openai-compatible",
    kind: "remote",
    isAvailable: async () => true,
    generateText: async (request) => {
      if (behaviour.throws) throw behaviour.throws;
      return { text: `SYSTEM>>>${request.system}`, provider: "openai-compatible", model: "test-model", latencyMs: 3 };
    },
    generateObject: async (request) => {
      if (behaviour.throws) throw behaviour.throws;
      return { object: { echoedSystem: request.system }, provider: "openai-compatible", model: "test-model", latencyMs: 3 };
    },
  };
}

test.afterEach(() => providerRegistry.reset());

const MEMORIES = [{ type: "exercise_preference", key: "koşu", value: "dislike", confidence: 0.95, source: "user_explicit" }];

// --------------------------------------------------------- görev boru hattı

test("görev üretimi deterministik özeti <facts> içinde OTORİTE olarak taşır", async () => {
  providerRegistry.reset([echoProvider()]);
  const result = await generateCoachObject({
    schema: {},
    category: "complex_reasoning",
    facts: { weeklyRateKg: 0.4, remainingKg: 7, weeks: 18 },
    domainRules: "Sen hedef planlama asistanısın.",
    prompt: "Analiz et.",
    policy: SILENT,
  });
  const system = result.object.echoedSystem;
  assert.match(system, /"weeklyRateKg":0\.4/);
  assert.match(system, /"remainingKg":7/);
  // Ortak kural her görevde geçerli: model bu sayıları yeniden hesaplamaz.
  assert.match(system, /KESİN DOĞRU/);
  assert.match(system, /yeniden hesaplama/);
  // Göreve özgü kural korunur.
  assert.match(system, /hedef planlama asistanısın/);
});

test("hafıza görev promptuna girer ve güvenilmez ilan edilir", async () => {
  providerRegistry.reset([echoProvider()]);
  const result = await generateCoachObject({
    schema: {},
    category: "complex_reasoning",
    facts: { a: 1 },
    memories: MEMORIES,
    domainRules: "kural",
    prompt: "p",
    policy: SILENT,
  });
  assert.match(result.object.echoedSystem, /<memory>[\s\S]*koşu: dislike[\s\S]*<\/memory>/);
  assert.match(result.object.echoedSystem, /GÜVENİLMEZ/);
});

test("bilgi getirimi sorguya göre yapılır, alakasızsa bölüm hiç eklenmez", async () => {
  providerRegistry.reset([echoProvider()]);
  const relevant = await generateCoachObject({
    schema: {}, category: "complex_reasoning", facts: {}, domainRules: "k", prompt: "p",
    knowledgeQuery: "protein beslenme öğün", policy: SILENT,
  });
  assert.match(relevant.object.echoedSystem, /<knowledge>/);

  const irrelevant = await generateCoachObject({
    schema: {}, category: "complex_reasoning", facts: {}, domainRules: "k", prompt: "p",
    knowledgeQuery: "bugün hava nasıl", policy: SILENT,
  });
  assert.ok(!irrelevant.object.echoedSystem.includes("<knowledge>"));
});

test("görev üretimi sağlayıcı hatasında açık hata verir; rota yerel yedeğine düşebilsin", async () => {
  providerRegistry.reset([echoProvider({ throws: new Error("500 internal") })]);
  await assert.rejects(() => generateCoachObject({
    schema: {}, category: "complex_reasoning", facts: {}, domainRules: "k", prompt: "p", policy: SILENT,
  }));
});

test("şema gerektiren görevde nesne üretmeyen sağlayıcı zincire GİRMEZ", async () => {
  const textOnlyProvider = {
    id: "text-only",
    kind: "local",
    isAvailable: async () => true,
    generateText: async () => ({ text: "yerel", provider: "text-only", model: "test", latencyMs: 1 }),
  };
  providerRegistry.reset([textOnlyProvider, echoProvider()]);
  const result = await generateCoachObject({
    schema: {}, category: "complex_reasoning", facts: {}, domainRules: "k", prompt: "p", policy: SILENT,
  });
  assert.equal(result.provider, "openai-compatible");
});

test("serbest metin görevinde çıktı güvenliği uygulanır", async () => {
  providerRegistry.reset([{ ...echoProvider(), generateText: async () => ({ text: "Bu değerlere göre sende diyabet var.", provider: "openai-compatible", model: "m", latencyMs: 1 }) }]);
  const result = await generateCoachTaskText({
    category: "nutrition_explanation", facts: {}, domainRules: "k", prompt: "p", policy: SILENT,
  });
  assert.match(result.text, /^Not: Tanı koyamam/);
});

// ------------------------------------------------- deterministik beslenme

test("kalan makrolar sunucuda hesaplanır, modele çıkarma yaptırılmaz", () => {
  const gaps = nutritionGaps({
    calorieTarget: 2_200, proteinTarget: 150, carbsTarget: 220, fatTarget: 70,
    totals: { calories: 1_840, protein: 90, carbs: 200, fat: 60 },
    meals: [],
  });
  assert.equal(gaps.remainingCalories, 360);
  assert.equal(gaps.remainingProteinGrams, 60);
  assert.equal(gaps.calorieTargetReached, false);
});

test("hedef aşıldığında kalan değer negatife düşmez", () => {
  const gaps = nutritionGaps({
    calorieTarget: 2_000, proteinTarget: 150, carbsTarget: 200, fatTarget: 70,
    totals: { calories: 2_400, protein: 200, carbs: 250, fat: 90 },
    meals: [],
  });
  assert.equal(gaps.remainingCalories, 0);
  assert.equal(gaps.remainingProteinGrams, 0);
  assert.equal(gaps.calorieTargetReached, true);
});

// ------------------------------------------------------- hafıza dayanıklılığı

test("hafıza okunamazsa görev ÇÖKMEZ, boş listeyle devam eder", async () => {
  // PostgREST tablo yokken veya bir vekil katman araya girdiğinde `data`
  // dizi OLMAYABİLİR; .map doğrudan çağrılırsa plan üretimi tamamen çökerdi.
  const restoreEnv = withSupabaseAuthEnv();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = withUsageMock({}, (url) => {
    if (String(url).includes("/rest/v1/ai_memories")) return Response.json({ message: "relation does not exist" });
    throw new TypeError(`beklenmeyen istek: ${url}`);
  });
  try {
    assert.deepEqual(await loadMemories(authorizedRequest("http://localhost/x")), []);
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv();
  }
});

// --------------------------------------------------------------- rotalar
//
// Rotaların göç SONRASI sözleşmesi değişmedi. Aşağıdaki testler hem yanıt
// şeklini hem de kota davranışını (hizmet alınmadıysa hak iade edilir)
// doğrular. Sağlayıcı her zaman sahte; gerçek ağ isteği yapılmaz.

/** Rota testleri için ortak kurulum: auth + kota + hafıza + sağlayıcı. */
async function withRoute(routePath, { memories = [], provider, isPremium = false, allowed = true } = {}, run) {
  const restoreEnv = withSupabaseAuthEnv();
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.AI_API_KEY;
  process.env.AI_API_KEY = "test-key";
  const refunds = [];
  globalThis.fetch = withUsageMock({ isPremium, allowed, currentCount: 1 }, (url, init) => {
    const href = String(url);
    if (href.includes("/rest/v1/ai_memories")) return Response.json(memories);
    if (href.includes("/rpc/refund_usage_counter")) {
      refunds.push(init?.body ? JSON.parse(String(init.body)) : null);
      return Response.json(1);
    }
    // Ücretsiz planda haftalık AI değerlendirme 2 haftada bir sunulur; rota
    // bunu weekly_ai_reviews tablosundan okur. Mock'lanmazsa supabase-js ağ
    // hatasında yeniden deneyip testi ~7 sn bekletiyordu.
    if (href.includes("/rest/v1/weekly_ai_reviews")) return Response.json([]);
    throw new TypeError(`beklenmeyen istek: ${href}`);
  });
  providerRegistry.reset([provider ?? echoProvider()]);
  try {
    const route = await import(`${routePath}?t=${Date.now()}${Math.random()}`);
    return await run(route, refunds);
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv();
    providerRegistry.reset();
    if (previousKey === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = previousKey;
  }
}

const WEEKLY_SUMMARY = {
  weekStart: "2026-08-10", goalCategory: "Kilo verme", sessionCount: 4, completionRate: 90,
  totalMinutes: 180, easySessions: 1, suitableSessions: 2, hardSessions: 1, averageFatigue: 3,
  painAreas: [], nutritionEntryCount: 20, nutritionLoggedDays: 6, averageCalories: 2000,
  averageProteinGrams: 120, weightChangeKg: -0.4, waistChangeCm: -1,
};

test("weekly-review: hafıza yüklenir ve özet modele otorite olarak gider", async () => {
  let seenSystem = "";
  const provider = {
    ...echoProvider(),
    generateObject: async (request) => {
      seenSystem = request.system;
      return {
        object: { headline: "İyi hafta", summary: "Özet", positives: ["a"], cautions: ["b"], recommendations: ["c", "d"], safetyNote: "Not" },
        provider: "openai-compatible", model: "test-model", latencyMs: 2,
      };
    },
  };
  await withRoute("../app/api/weekly-review/route.ts", { provider, memories: [
    { id: "1", memory_type: "exercise_preference", memory_key: "koşu", memory_value: "dislike", confidence: 0.9, source: "user_explicit", created_at: "2026-08-01", updated_at: "2026-08-01" },
  ] }, async ({ POST }) => {
    const response = await POST(authorizedRequest("http://localhost/api/weekly-review", {
      method: "POST", body: JSON.stringify({ summary: WEEKLY_SUMMARY, locale: "tr" }),
    }));
    const payload = await response.json();
    assert.equal(payload.source, "ai", "yanıt şekli korunmalı");
    assert.equal(payload.model, "test-model");
    assert.ok(payload.review.headline);
    assert.match(seenSystem, /"sessionCount":4/, "özet <facts> içinde gitmeli");
    assert.match(seenSystem, /koşu: dislike/, "hafıza önerileri şekillendirmeli");
  });
});

test("weekly-review: AI başarısızsa yerel değerlendirmeye düşer ve hak iade edilir", async () => {
  await withRoute("../app/api/weekly-review/route.ts", { provider: echoProvider({ throws: new Error("429 rate limit") }) }, async ({ POST }, refunds) => {
    const response = await POST(authorizedRequest("http://localhost/api/weekly-review", {
      method: "POST", body: JSON.stringify({ summary: WEEKLY_SUMMARY, locale: "tr" }),
    }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.source, "local");
    assert.ok(payload.review.headline, "kart boş kalmamalı");
    assert.deepEqual(refunds, [{ p_user_id: TEST_USER_ID, p_feature: "weekly_review" }], "hizmet alınmadıysa hak iade edilmeli");
  });
});

const GOAL_PAYLOAD = {
  currentWeightKg: 85, bmr: 1800, locale: "tr",
  answers: { targetWeightKg: 78, weeklyDays: 4, sessionMinutes: 45, intensity: "steady" },
};

test("goal-plan: AI başarısızsa yerel analiz döner, plan sayıları korunur", async () => {
  await withRoute("../app/api/goal-plan/route.ts", { provider: echoProvider({ throws: new Error("timeout") }) }, async ({ POST }) => {
    const response = await POST(authorizedRequest("http://localhost/api/goal-plan", {
      method: "POST", body: JSON.stringify(GOAL_PAYLOAD),
    }));
    const payload = await response.json();
    assert.equal(payload.status, "ready");
    assert.equal(payload.source, "local");
    assert.ok(payload.analysis.headline, "analiz kartı boş kalmamalı");
    assert.ok(payload.plan, "deterministik plan her koşulda dönmeli");
  });
});

test("goal-plan: hedef özeti modele otorite olarak gider", async () => {
  let seenSystem = "";
  const provider = {
    ...echoProvider(),
    generateObject: async (request) => {
      seenSystem = request.system;
      return {
        object: { headline: "Ulaşılabilir", assessment: "Değerlendirme", steps: ["a", "b"], safetyNote: "Not" },
        provider: "openai-compatible", model: "test-model", latencyMs: 2,
      };
    },
  };
  await withRoute("../app/api/goal-plan/route.ts", { provider }, async ({ POST }) => {
    const response = await POST(authorizedRequest("http://localhost/api/goal-plan", {
      method: "POST", body: JSON.stringify(GOAL_PAYLOAD),
    }));
    const payload = await response.json();
    assert.equal(payload.source, "ai");
    assert.match(seenSystem, /"targetWeightKg":78/);
    assert.match(seenSystem, /KESİN DOĞRU/, "model sayıları yeniden hesaplamamalı");
  });
});

const ADVICE_PAYLOAD = {
  locale: "tr", calorieTarget: 2200, proteinTarget: 150, carbsTarget: 220, fatTarget: 70,
  totals: { calories: 1840, protein: 90, carbs: 200, fat: 60 },
  meals: [{ name: "Yulaf", meal: "Kahvaltı", calories: 300, protein: 10, carbs: 50, fat: 5 }],
};

test("nutrition/advice: kalan makrolar sunucuda hesaplanıp modele verilir", async () => {
  let seenSystem = "";
  const provider = {
    ...echoProvider(),
    generateText: async (request) => {
      seenSystem = request.system;
      return { text: "Sonraki öğünde protein ekleyebilirsin.", provider: "openai-compatible", model: "test-model", latencyMs: 2 };
    },
  };
  await withRoute("../app/api/nutrition/advice/route.ts", { provider }, async ({ POST }) => {
    const response = await POST(authorizedRequest("http://localhost/api/nutrition/advice", {
      method: "POST", body: JSON.stringify(ADVICE_PAYLOAD),
    }));
    const payload = await response.json();
    assert.equal(payload.source, "ai");
    assert.equal(payload.advice, "Sonraki öğünde protein ekleyebilirsin.");
    // 2200 − 1840 = 360. Modelin çıkarma yapması gerekmez.
    assert.match(seenSystem, /"remainingCalories":360/);
    assert.match(seenSystem, /"remainingProteinGrams":60/);
  });
});

test("nutrition/advice: AI başarısızsa yerel öneri döner ve hak iade edilir", async () => {
  await withRoute("../app/api/nutrition/advice/route.ts", { provider: echoProvider({ throws: new Error("network") }) }, async ({ POST }, refunds) => {
    const response = await POST(authorizedRequest("http://localhost/api/nutrition/advice", {
      method: "POST", body: JSON.stringify(ADVICE_PAYLOAD),
    }));
    const payload = await response.json();
    assert.equal(payload.source, "fallback");
    assert.ok(payload.advice.length > 0);
    assert.deepEqual(refunds, [{ p_user_id: TEST_USER_ID, p_feature: "nutrition_advice" }]);
  });
});

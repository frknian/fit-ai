import assert from "node:assert/strict";
import test from "node:test";

import { POST, buildLocalPlan, profileSignals } from "../app/api/generate-plan/route.ts";
import { extractSessionMinutes, planProgressionBlock } from "../lib/training-profile.ts";
import { authorizedRequest, withAuthenticatedFetch, withSupabaseAuthEnv, withUsageMock } from "./helpers/auth.mjs";
import { QUESTION, QUESTION_LABELS, emptyHistory } from "../lib/onboarding-questions.ts";
import { PROMPT_CATALOG_LIMIT, getExerciseById, getExercisesForAI, getExercisesForProfile } from "../lib/exercise-service.ts";

function openAiResponse(text, model = "gpt-5.6-sol") {
  return { id: "resp_test", created_at: 1, model, output: [{ type: "message", role: "assistant", id: "msg_test", content: [{ type: "output_text", text, annotations: [] }] }], usage: { input_tokens: 10, output_tokens: 10 } };
}

// Cevaplar lib/onboarding-questions.ts'teki 15'lik sıraya göre kurulur.
// Sıra bilgisini teste elle gömmek yerine adlandırılmış indeksleri kullanıyoruz;
// şema değişirse test de sessizce yanlış alanı doldurmasın.
function history(answers) {
  const list = emptyHistory();
  for (const [key, value] of Object.entries(answers)) list[QUESTION[key]] = value;
  return list;
}

const scenarios = [
  {
    name: "24 yaşında, 180 cm erkek — dambılla kas geliştirme",
    payload: { age: 24, gender: "Erkek", height: 180, weight: 80, environment: "Evde", equipment: "Ayarlanabilir dambıl", goal: "Kas geliştirmek", history: history({
      goal: "Kas geliştirmek", experience: "Düzenli", level: "Orta seviye",
      recentFrequency: "3–4 gün", availableDays: "3–4 gün", sessionMinutes: "45 dakika",
      motivation: "Daha güçlü hissetmek", barrier: "Yoğun çalışma temposu",
      trainingStyles: "Kuvvet", location: "Evde", equipment: "Ayarlanabilir dambıl",
      injuries: "Yok", dailyMovement: "Orta", sleep: "İyi", freeNote: "Akşam antrenmanı tercih ederim",
    }) },
    expected: { primaryGoal: "Kas geliştirme", weeklyDays: 3, exerciseCount: 5 },
  },
  {
    name: "23 yaşında, 170 cm ve 90 kg kadın — diz hassasiyetiyle kilo verme",
    payload: { age: 23, gender: "Kadın", height: 170, weight: 90, environment: "Evde", equipment: "", goal: "Kilo vermek", history: history({
      goal: "Kilo vermek", experience: "Hayır", level: "Yeni başlıyorum",
      recentFrequency: "0 gün", availableDays: "1–2 gün", sessionMinutes: "15 dakika",
      trainingStyles: "Kardiyo", injuries: "Diz", dailyMovement: "Düşük", sleep: "Düzensiz",
    }) },
    expected: { primaryGoal: "Kilo verme", weeklyDays: 2, exerciseCount: 3 },
  },
  {
    name: "30 yaşında, 175 cm ve 75 kg kullanıcı — salonda kas geliştirme",
    payload: { age: 30, gender: "Erkek", height: 175, weight: 75, environment: "Salon", equipment: "Full ekipman", goal: "Kas geliştirmek", history: history({
      goal: "Kas geliştirmek", experience: "Düzenli", level: "İleri seviye",
      recentFrequency: "5+ gün", availableDays: "5+ gün", sessionMinutes: "60+ dakika",
      trainingStyles: "Kuvvet", injuries: "Yok", dailyMovement: "Yüksek", sleep: "İyi",
    }) },
    expected: { primaryGoal: "Kas geliştirme", weeklyDays: 5, exerciseCount: 6 },
  },
];

test("üç farklı kullanıcı profilini farklı plan parametrelerine dönüştürür", () => {
  const fingerprints = new Set();
  for (const scenario of scenarios) {
    const signals = profileSignals(scenario.payload);
    assert.equal(signals.primaryGoal, scenario.expected.primaryGoal, scenario.name);
    assert.equal(signals.weeklyDays, scenario.expected.weeklyDays, scenario.name);
    assert.equal(signals.exerciseCount, scenario.expected.exerciseCount, scenario.name);
    fingerprints.add(signals.fingerprint);
  }
  assert.equal(fingerprints.size, scenarios.length, "her senaryo farklı analiz anahtarı üretmeli");
});

test("her cevap yapay zekâya sorusuyla birlikte gider", () => {
  // Çıplak bir dizi gönderildiğinde model "Diz" cevabının hangi soruya ait
  // olduğunu bilemiyordu; kullanıcı 15 soruyu boşuna yanıtlamış oluyordu.
  const signals = profileSignals(scenarios[1].payload);
  const asked = new Map(signals.answers.map((entry) => [entry.question, entry.answer]));
  assert.equal(asked.get("Sakatlık veya ağrı bölgesi"), "Diz");
  assert.equal(asked.get("Ana hedef"), "Kilo vermek");
  assert.ok(!signals.answers.some((entry) => entry.answer === ""), "boş cevap isteme girmemeli");
});

test("yeni sorular plan sinyallerine yansır", () => {
  const signals = profileSignals({ history: history({
    goal: "Güçlenmek", level: "İleri seviye", availableDays: "3–4 gün", sessionMinutes: "45 dakika",
    barrier: "Zaman bulamadım", motivation: "Çocuğumla koşabilmek istiyorum",
    location: "Evde", equipment: "Dambıl · Yoga matı", recentFrequency: "0 gün",
  }) });
  assert.equal(signals.pastBarrier, "Zaman bulamadım");
  assert.equal(signals.motivation, "Çocuğumla koşabilmek istiyorum");
  assert.equal(signals.trainingPlace, "Evde");
  assert.equal(signals.equipmentAccess, "Dambıl · Yoga matı");
});

test("uzun aradan sonra dönen kullanıcıya ileri seviye yükü verilmez", () => {
  // "İleri seviye" beyanı eski formu anlatır; son 3 ayda 0 gün antrenman
  // yapmış birine ilk haftadan ileri yoğunluk vermek sakatlık riskidir.
  const detrained = profileSignals({ history: history({
    goal: "Güçlenmek", level: "İleri seviye", experience: "Uzun süredir düzenli",
    availableDays: "3–4 gün", sessionMinutes: "45 dakika", recentFrequency: "0 gün",
  }) });
  assert.equal(detrained.detrained, true);
  assert.equal(detrained.intensity, "Düşük-orta");
  assert.equal(detrained.setRange, "2–3", "ara vermiş kullanıcıya başlangıç set aralığı verilmeli");

  const active = profileSignals({ history: history({
    goal: "Güçlenmek", level: "İleri seviye", experience: "Uzun süredir düzenli",
    availableDays: "3–4 gün", sessionMinutes: "45 dakika", recentFrequency: "5+ gün",
  }) });
  assert.equal(active.detrained, false);
  assert.equal(active.setRange, "3–4");
});

test("masa başı çalışan kullanıcı düşük yoğunlukla başlar", () => {
  // Eski testte bu seçenek "Düşük" idi; yeni metin eşleşmeyince sinyal sessizce
  // kaybolmuştu. Taşınmış eski kayıtlar da hâlâ "Düşük" taşıyabilir.
  const base = { goal: "Kas geliştirmek", level: "Orta seviye", experience: "Düzenli", availableDays: "3–4 gün", sessionMinutes: "45 dakika", recentFrequency: "3–4 gün" };
  assert.equal(profileSignals({ history: history({ ...base, dailyMovement: "Masa başı" }) }).intensity, "Düşük-orta");
  assert.equal(profileSignals({ history: history({ ...base, dailyMovement: "Düşük" }) }).intensity, "Düşük-orta");
  assert.equal(profileSignals({ history: history({ ...base, dailyMovement: "Fiziksel iş" }) }).intensity, "Orta");
});

test("serbest metindeki gün sayısını antrenman süresi sanmaz", () => {
  assert.equal(extractSessionMinutes("Haftada 3 gün, 40 dakika ayırabilirim"), 40);
  assert.equal(extractSessionMinutes("Hafta sonu 1 saat"), 60);
  assert.equal(extractSessionMinutes("45"), 45);
});

// Resmi OpenAI sağlayıcısının gerçek istek/yanıt şekli: POST /v1/responses.
test("AI sağlayıcısı başarıyla plan üretir", { concurrency: false }, async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  const restoreAuthEnv = withSupabaseAuthEnv();
  const calls = [];
  const requestBodies = [];
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = withUsageMock({ isPremium: false, allowed: true, currentCount: 1 }, async (url, init) => {
    calls.push(String(url));
    requestBodies.push(String(init?.body || ""));
    const generated = {
      title: "Test planı", profileSummary: "Test", rationale: "Test", safetyNote: "Test",
      analysis: { experienceLevel: "Yeni", weeklyFrequency: "1–2 gün", sessionMinutes: 30, primaryGoal: "Güç", intensity: "Düşük", equipmentMode: "Ekipmansız", focusAreas: ["Tüm vücut"], adaptations: ["A", "B", "C"] },
      weeklySchedule: [{ day: "Pazartesi", focus: "Tüm vücut", durationMinutes: 30 }], progression: ["1", "2", "3", "4"],
      workouts: [1, 2, 3, 4].map((index) => ({ id: `ex-${index}`, name: `Hareket ${index}`, english: `Exercise ${index}`, area: "Core", sets: 3, reps: "10 tekrar", restSeconds: 60, instructions: "Kontrollü uygula." })),
    };
    return Response.json(openAiResponse(JSON.stringify(generated)));
  });

  try {
    const response = await POST(authorizedRequest("http://localhost/api/generate-plan", { method: "POST", body: JSON.stringify(scenarios[0].payload) }));
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.workouts.length, scenarios[0].expected.exerciseCount);
    assert.ok(result.workouts.every((workout) => getExerciseById(workout.id)), "program yalnız Hareket Atlası kimliklerini içermeli");
    assert.ok(calls.some((url) => url.includes("/responses")));
    const openAiBody = requestBodies.find((body) => body.includes("profileTest")) || requestBodies.at(-1) || "";
    const fullHistory = scenarios[0].payload.history;
    assert.equal(fullHistory.filter(Boolean).length, 15, "test profili 15 sorunun tamamını doldurmalı");
    for (const [name, index] of Object.entries(QUESTION)) {
      assert.ok(openAiBody.includes(QUESTION_LABELS[name]), `${QUESTION_LABELS[name]} OpenAI isteğinde bulunmalı`);
      assert.ok(openAiBody.includes(fullHistory[index]), `${QUESTION_LABELS[name]} yanıtı OpenAI isteğinde bulunmalı`);
    }
  } finally {
    globalThis.fetch = previousFetch;
    restoreAuthEnv();
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("anahtar veya ağ yokken doğrulanmış katalogdan güvenli yerel plan döndürür", { concurrency: false }, async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  const restoreAuthEnv = withSupabaseAuthEnv();
  globalThis.fetch = withAuthenticatedFetch(null);
  delete process.env.OPENAI_API_KEY;
  try {
    const missingKey = await POST(authorizedRequest("http://localhost/api/generate-plan", { method: "POST", body: "{}" }));
    assert.equal(missingKey.status, 200);
    const missingKeyPlan = await missingKey.json();
    assert.equal(missingKeyPlan.fallback, true);
    assert.ok(missingKeyPlan.workouts.length >= 3);

    process.env.OPENAI_API_KEY = "test-key";
    // Kota kontrolü başarıyla geçmeli; ağ hatası özellikle AI model çağrısını
    // (/responses) vurmalı ki test AI üretiminin kendisinin başarısız
    // olma senaryosunu ölçsün, kota kontrolünü değil.
    globalThis.fetch = withUsageMock({ isPremium: false, allowed: true, currentCount: 1 }, async () => {
      throw new TypeError("network unavailable");
    });
    const networkFailure = await POST(authorizedRequest("http://localhost/api/generate-plan", { method: "POST", body: JSON.stringify(scenarios[1].payload) }));
    assert.equal(networkFailure.status, 200);
    const networkPlan = await networkFailure.json();
    assert.equal(networkPlan.fallback, true);
    assert.equal(networkPlan.workouts.length, scenarios[1].expected.exerciseCount);
  } finally {
    globalThis.fetch = previousFetch;
    restoreAuthEnv();
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("yerel kas geliştirme planı esneme yerine büyük kasları çalıştıran bileşik kuvvet hareketleri seçer", () => {
  const signals = profileSignals(scenarios[2].payload);
  const plan = buildLocalPlan(signals, getExercisesForProfile(true, "Tam salon"), "tr");
  const selected = plan.workouts.map((workout) => getExerciseById(workout.id)).filter(Boolean);

  assert.equal(selected.length, scenarios[2].expected.exerciseCount);
  assert.ok(selected.every((exercise) => exercise.category !== "stretching"), "kas geliştirme planına esneme ana hareket olarak girmemeli");
  assert.ok(selected.filter((exercise) => exercise.mechanic === "compound").length >= 4, "planın omurgası bileşik hareketlerden oluşmalı");
  const majorGroups = new Set(selected.flatMap((exercise) => exercise.primaryMuscles).filter((muscle) =>
    ["quadriceps", "hamstrings", "glutes", "chest", "lats", "middle back", "shoulders"].includes(muscle),
  ));
  assert.ok(majorGroups.size >= 4, `büyük kas grubu çeşitliliği yetersiz: ${[...majorGroups].join(", ")}`);
});

test("kimliği doğrulanmamış plan isteği reddedilir", { concurrency: false }, async () => {
  const restoreAuthEnv = withSupabaseAuthEnv();
  try {
    const response = await POST(new Request("http://localhost/api/generate-plan", { method: "POST", body: "{}" }));
    assert.equal(response.status, 401);
  } finally {
    restoreAuthEnv();
  }
});

test("plan ilerleme blokları tamamlanan antrenmanla kademeli açılır", () => {
  // Yeni kullanıcı giriş bloğunda başlar.
  assert.equal(planProgressionBlock(0), 0);
  assert.equal(planProgressionBlock(2), 0);
  // Her eşik yalnızca tek bir kademe ilerletir ve sırayı atlamaz.
  assert.equal(planProgressionBlock(3), 1);
  assert.equal(planProgressionBlock(6), 1);
  assert.equal(planProgressionBlock(7), 2);
  assert.equal(planProgressionBlock(11), 2);
  assert.equal(planProgressionBlock(12), 3);
  // Son blok tavan; sınırsız büyümez.
  assert.equal(planProgressionBlock(500), 3);
  // Monotonik olmalı: geçmiş arttıkça kademe hiçbir zaman gerilemez.
  let previous = 0;
  for (let sessions = 0; sessions <= 40; sessions += 1) {
    const block = planProgressionBlock(sessions);
    assert.ok(block >= previous, `${sessions} antrenmanda kademe geriledi`);
    previous = block;
  }
});

// generate-plan istek gövdesi boyutu ve exerciseCatalog kırpma sınırı: sunucu
// öncesinde ikisini de doğrulamıyordu; kimliği doğrulanmış tek bir kullanıcı
// 5 dk'da 5 istek hakkının HER birine megabaytlarca prompt taşıtabilirdi.
const atlasCatalog = getExercisesForAI();

// rateLimit `generate-plan:${userId}` anahtarını tüm dosya boyunca paylaşılan
// tekil bir Map'te tutuyor (bkz. lib/rate-limit.ts); TEST_USER_ID'yi
// kullanan testler aynı kovayı tüketiyor. Bu üç yeni test hangi sırada
// çalışırsa çalışsın (ya da dosyaya başka AI testi eklenirse) sınıra
// takılmasın diye her biri KENDİ tekil sahte kullanıcı kimliğiyle çağırıyor.
function withIsolatedPlanFetch(userId, handler) {
  return async (url, init) => {
    const href = String(url);
    if (href.includes("/auth/v1/user")) {
      return Response.json({
        id: userId, aud: "authenticated", role: "authenticated", email: `${userId}@example.com`,
        email_confirmed_at: "2026-01-01T00:00:00.000Z", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00.000Z",
      });
    }
    if (href.includes("/rpc/check_and_consume_usage")) {
      const body = JSON.parse(String(init.body));
      return Response.json({ allowed: true, current_count: 1, effective_limit: body.p_free_limit, is_premium: false });
    }
    return handler(url, init);
  };
}

test("generate-plan payload: normal durum — küçük bir katalog aynen isteme gider", { concurrency: false }, async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  const restoreAuthEnv = withSupabaseAuthEnv();
  process.env.OPENAI_API_KEY = "test-key";
  let promptBody = "";
  globalThis.fetch = withIsolatedPlanFetch("00000000-0000-4000-8000-000000000097", async (url, init) => {
    promptBody = String(init?.body || "");
    const generated = {
      title: "T", profileSummary: "T", rationale: "T", safetyNote: "T",
      analysis: { experienceLevel: "Yeni", weeklyFrequency: "1–2 gün", sessionMinutes: 30, primaryGoal: "Güç", intensity: "Düşük", equipmentMode: "Ekipmansız", focusAreas: ["Tüm vücut"], adaptations: ["A", "B", "C"] },
      weeklySchedule: [{ day: "Pazartesi", focus: "Tüm vücut", durationMinutes: 30 }], progression: ["1", "2", "3", "4"],
      workouts: [1, 2, 3].map((index) => ({ id: `ex-${index}`, name: `H${index}`, english: `E${index}`, area: "Core", sets: 3, reps: "10", restSeconds: 60, instructions: "Kontrollü uygula." })),
    };
    return Response.json(openAiResponse(JSON.stringify(generated)));
  });
  try {
    const smallCatalog = atlasCatalog.slice(0, 5);
    const response = await POST(authorizedRequest("http://localhost/api/generate-plan", { method: "POST", body: JSON.stringify({ ...scenarios[0].payload, exerciseCatalog: smallCatalog }) }));
    assert.equal(response.status, 200);
    assert.ok(smallCatalog.every((item) => promptBody.includes(item.id)), "5 hareketlik Atlas kataloğu eksiksiz gitmeli");
  } finally {
    globalThis.fetch = previousFetch;
    restoreAuthEnv();
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
  }
});

test(`generate-plan payload: edge case — ${PROMPT_CATALOG_LIMIT}'ı aşan katalog tam sınırda kırpılır`, { concurrency: false }, async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  const restoreAuthEnv = withSupabaseAuthEnv();
  process.env.OPENAI_API_KEY = "test-key";
  let promptBody = "";
  globalThis.fetch = withIsolatedPlanFetch("00000000-0000-4000-8000-000000000098", async (url, init) => {
    promptBody = String(init?.body || "");
    const generated = {
      title: "T", profileSummary: "T", rationale: "T", safetyNote: "T",
      analysis: { experienceLevel: "Yeni", weeklyFrequency: "1–2 gün", sessionMinutes: 30, primaryGoal: "Güç", intensity: "Düşük", equipmentMode: "Ekipmansız", focusAreas: ["Tüm vücut"], adaptations: ["A", "B", "C"] },
      weeklySchedule: [{ day: "Pazartesi", focus: "Tüm vücut", durationMinutes: 30 }], progression: ["1", "2", "3", "4"],
      workouts: [1, 2, 3].map((index) => ({ id: `ex-${index}`, name: `H${index}`, english: `E${index}`, area: "Core", sets: 3, reps: "10", restSeconds: 60, instructions: "Kontrollü uygula." })),
    };
    return Response.json(openAiResponse(JSON.stringify(generated)));
  });
  try {
    // Sınırın 60 fazlası: kırpma gerçekten devrede mi, yoksa katalog zaten
    // küçük olduğu için mi geçiyor ayırt edilsin diye kasıtlı büyük seçildi.
    const oversizedCatalog = atlasCatalog.slice(0, PROMPT_CATALOG_LIMIT + 60);
    const response = await POST(authorizedRequest("http://localhost/api/generate-plan", { method: "POST", body: JSON.stringify({ ...scenarios[0].payload, exerciseCatalog: oversizedCatalog }) }));
    assert.equal(response.status, 200);
    const included = oversizedCatalog.filter((item) => promptBody.includes(`\\\"id\\\":\\\"${item.id}\\\"`));
    assert.equal(included.length, PROMPT_CATALOG_LIMIT, `katalog tam olarak ${PROMPT_CATALOG_LIMIT} hareketle sınırlanmalı`);
    // Kırpma dizinin BAŞINDAN (.slice(0, LIMIT)) yapılıyor; son eklenenler
    // değil ilk LIMIT tanesi gitmeli.
    assert.ok(promptBody.includes(oversizedCatalog[0].id));
    assert.ok(!promptBody.includes(`\\\"id\\\":\\\"${oversizedCatalog[PROMPT_CATALOG_LIMIT].id}\\\"`));
  } finally {
    globalThis.fetch = previousFetch;
    restoreAuthEnv();
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("generate-plan payload: hatalı input — aşırı büyük istek gövdesi AI'ya hiç gitmeden 413 ile reddedilir", { concurrency: false }, async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  const restoreAuthEnv = withSupabaseAuthEnv();
  process.env.OPENAI_API_KEY = "test-key";
  let aiCalled = false;
  globalThis.fetch = withIsolatedPlanFetch("00000000-0000-4000-8000-000000000099", async (url) => {
    if (String(url).includes("/responses")) { aiCalled = true; return Response.json({}); }
    throw new TypeError(`beklenmeyen ağ isteği: ${url}`);
  });
  try {
    // MAX_BODY_BYTES (8.5MB) üzerinde, uydurma devasa bir "note" alanıyla.
    const hugePayload = { ...scenarios[0].payload, note: "x".repeat(9_000_000) };
    const response = await POST(authorizedRequest("http://localhost/api/generate-plan", { method: "POST", body: JSON.stringify(hugePayload) }));
    assert.equal(response.status, 413);
    assert.equal(aiCalled, false, "boyut sınırı aşıldığında AI'ya hiç gidilmemeli");
  } finally {
    globalThis.fetch = previousFetch;
    restoreAuthEnv();
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
  }
});

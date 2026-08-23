import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  MAX_SAFE_WEEKLY_FRACTION,
  dailyTrainingBurnKcal,
  goalPlanSummary,
  normalizeAnswers,
  planGoal,
  projectWeightSeries,
  seriesToPath,
  sessionBurnKcal,
  validateGoalAnalysis,
} from "../lib/goal-plan.ts";
import { POST } from "../app/api/goal-plan/route.ts";
import { authorizedRequest, withAuthenticatedFetch, withSupabaseAuthEnv } from "./helpers/auth.mjs";

const TODAY = new Date("2026-08-01T12:00:00Z");
// Kullanıcının verdiği örnek: 100 kiloyum, hedefim 90, haftada 3 gün 45 dk, ağır.
const EXAMPLE = { targetWeightKg: 90, weeklyDays: 3, sessionMinutes: 45, intensity: "hard" };

test("kullanıcının örneği somut bir takvime çevrilir", () => {
  const plan = planGoal(EXAMPLE, { currentWeightKg: 100, bmr: 1800, today: TODAY });
  assert.equal(plan.status, "ready");
  assert.equal(plan.losing, true);
  assert.equal(plan.remainingKg, 10);
  // "Ağır" tempo = haftada vücut ağırlığının %1'i = 1 kg → 10 hafta.
  assert.equal(plan.weeklyRateKg, -1);
  assert.equal(plan.weeks, 10);
  assert.equal(plan.etaIso, "2026-10-10");
});

test("antrenman taahhüdü gereken kalori kısıtını azaltır", () => {
  // "Ağır çalışacağım" demek, aynı hedefe daha az açıkla ulaşmak demektir;
  // aksi halde antrenman seçiminin plana hiçbir etkisi olmazdı.
  const context = { currentWeightKg: 100, bmr: 1800, today: TODAY };
  const training = planGoal(EXAMPLE, context);
  const noTraining = planGoal({ ...EXAMPLE, weeklyDays: 2, sessionMinutes: 30 }, context);
  assert.equal(training.status, "ready");
  assert.equal(noTraining.status, "ready");
  assert.ok(training.dailyTrainingBurnKcal > noTraining.dailyTrainingBurnKcal);
  assert.ok(
    training.dailyDietDeltaKcal < noTraining.dailyDietDeltaKcal,
    `daha çok antrenman daha az diyet kısıtı gerektirmeli: ${training.dailyDietDeltaKcal} < ${noTraining.dailyDietDeltaKcal}`,
  );
  // Günlük toplam fark aynı kalır; değişen, farkın nereden geldiğidir.
  assert.equal(training.dailyDeltaKcal, noTraining.dailyDeltaKcal);
});

test("tempo güvenli sınırın üstüne çıkamaz", () => {
  const plan = planGoal(EXAMPLE, { currentWeightKg: 100, bmr: 1800, today: TODAY });
  assert.ok(Math.abs(plan.weeklyRateKg) <= 100 * MAX_SAFE_WEEKLY_FRACTION + 1e-9);

  // Hafif kullanıcıda "ağır" tempo yine %1'de kalır, mutlak kg olarak düşer.
  const light = planGoal(EXAMPLE, { currentWeightKg: 60, bmr: 1400, today: TODAY });
  assert.equal(light.status, "ready");
  assert.ok(Math.abs(light.weeklyRateKg) <= 0.6 + 1e-9);
});

test("kalori hedefi bazalın altına düşerse uyarı üretilir", () => {
  // Küçük bir kişide agresif tempo, alımı BMR'nin altına indirebilir; bu
  // sessizce "yapılabilir" gösterilmemeli.
  const plan = planGoal({ targetWeightKg: 45, weeklyDays: 2, sessionMinutes: 30, intensity: "hard" }, { currentWeightKg: 58, bmr: 1500, today: TODAY });
  assert.equal(plan.status, "ready");
  assert.ok(plan.dailyIntakeKcal !== null);
  assert.ok(plan.warnings.includes("intakeBelowBmr"), `uyarı yok: ${JSON.stringify(plan.warnings)}`);
});

test("BMR yoksa kalori hedefi uydurulmaz", () => {
  const plan = planGoal(EXAMPLE, { currentWeightKg: 100, bmr: null, today: TODAY });
  assert.equal(plan.status, "ready");
  assert.equal(plan.dailyIntakeKcal, null);
  assert.equal(plan.maintenanceKcal, null);
  assert.ok(plan.warnings.includes("noBmr"));
  // Takvim yine de hesaplanabilir; yalnız beslenme tarafı eksik kalır.
  assert.equal(plan.weeks, 10);
});

test("hedefe ulaşılmışsa yeni bir takvim üretilmez", () => {
  assert.equal(planGoal({ ...EXAMPLE, targetWeightKg: 90 }, { currentWeightKg: 90.2, bmr: 1800, today: TODAY }).status, "reached");
  assert.equal(planGoal(EXAMPLE, { currentWeightKg: 0, bmr: 1800, today: TODAY }).status, "invalid");
});

test("kilo alma yönünde alım artırılır", () => {
  const plan = planGoal({ targetWeightKg: 80, weeklyDays: 4, sessionMinutes: 60, intensity: "steady" }, { currentWeightKg: 70, bmr: 1700, today: TODAY });
  assert.equal(plan.status, "ready");
  assert.equal(plan.losing, false);
  assert.ok(plan.weeklyRateKg > 0);
  assert.ok(plan.dailyIntakeKcal > plan.maintenanceKcal, "kilo alırken alım bakımın üstünde olmalı");
});

test("grafik eğrisi hedefte düzleşir", () => {
  // Devam eden bir çizgi, hedefi geçip düşmeye devam ediyormuş gibi okunurdu.
  const series = projectWeightSeries(100, -1, 90, 14);
  assert.equal(series[0].weightKg, 100);
  assert.equal(series[10].weightKg, 90);
  assert.equal(series[14].weightKg, 90, "hedefin altına inmemeli");
  assert.equal(series.length, 15);

  const gaining = projectWeightSeries(70, 0.5, 74, 12);
  assert.equal(gaining[gaining.length - 1].weightKg, 74, "hedefin üstüne çıkmamalı");
});

test("grafik yolu çizilebilir bir SVG path üretir", () => {
  const path = seriesToPath(projectWeightSeries(100, -1, 90, 10), 100, 46);
  assert.match(path, /^M0\.00 /);
  assert.ok(path.includes("L100.00 "), "son nokta sağ kenara oturmalı");
  assert.ok(!path.includes("NaN"), `path NaN içeriyor: ${path}`);
  // Tek noktalı seri çizilemez; boş dönmeli, bozuk path değil.
  assert.equal(seriesToPath([{ week: 0, weightKg: 80 }]), "");
});

test("antrenman yakımı kiloya ve yoğunluğa göre değişir", () => {
  const heavy = sessionBurnKcal(EXAMPLE, 100);
  const light = sessionBurnKcal({ ...EXAMPLE, intensity: "easy" }, 100);
  assert.ok(heavy > light, "ağır seans daha çok yakmalı");
  assert.ok(sessionBurnKcal(EXAMPLE, 100) > sessionBurnKcal(EXAMPLE, 60), "ağır kişi daha çok yakar");
  assert.equal(dailyTrainingBurnKcal(EXAMPLE, 100), Math.round((heavy * 3) / 7));
  assert.equal(sessionBurnKcal(EXAMPLE, 0), 0);
});

test("kaydedilmiş cevaplar güvenle okunur", () => {
  assert.equal(normalizeAnswers(null), null);
  assert.equal(normalizeAnswers({ targetWeightKg: 0 }), null);
  assert.equal(normalizeAnswers({ targetWeightKg: 900 }), null, "uçuk hedef reddedilmeli");
  // Bilinmeyen seçenekler makul varsayılana düşer, plan çökmez.
  assert.deepEqual(normalizeAnswers({ targetWeightKg: 90, weeklyDays: 99, sessionMinutes: 7, intensity: "kötü" }), {
    targetWeightKg: 90, weeklyDays: 3, sessionMinutes: 45, intensity: "steady",
  });
});

test("modele giden özette kişisel veri yok", () => {
  // İsim, e-posta, doğum tarihi gibi alanlar plan analizi için gereksiz.
  const plan = planGoal(EXAMPLE, { currentWeightKg: 100, bmr: 1800, today: TODAY });
  const summary = goalPlanSummary(EXAMPLE, plan, 100);
  const keys = Object.keys(summary);
  for (const forbidden of ["name", "email", "birthDate", "userId"]) {
    assert.ok(!keys.includes(forbidden), `özet kişisel alan taşıyor: ${forbidden}`);
  }
  assert.equal(summary.currentWeightKg, 100);
  assert.equal(summary.weeks, 10);
});

test("model çıktısı doğrulanmadan kullanılmaz", () => {
  assert.equal(validateGoalAnalysis(null), null);
  assert.equal(validateGoalAnalysis({ headline: "a", assessment: "b", safetyNote: "c", steps: ["tek"] }), null, "en az iki adım gerekli");
  assert.equal(validateGoalAnalysis({ headline: "  ", assessment: "b", safetyNote: "c", steps: ["a", "b"] }), null);
  const valid = validateGoalAnalysis({ headline: "10 haftada 10 kg", assessment: "Uygun", safetyNote: "Tahmindir", steps: ["a", "b", "c", "d", "e"] });
  assert.equal(valid.steps.length, 4, "dörtten fazla adım kırpılmalı");
});

test("hedef planı taahhüdü AI programına aynen taşınır", async () => {
  // Kullanıcı burada "haftada 3 gün, 45 dk" dediyse program da onu kullanmalı;
  // profil testindeki daha eski cevap bunu ezmemeli.
  const { profileSignals } = await import("../app/api/generate-plan/route.ts");
  const { QUESTION, emptyHistory } = await import("../lib/onboarding-questions.ts");
  const history = emptyHistory();
  history[QUESTION.goal] = "Kilo vermek";
  history[QUESTION.level] = "Orta seviye";
  history[QUESTION.availableDays] = "1–2 gün";
  history[QUESTION.sessionMinutes] = "15 dakika";

  const withoutPlan = profileSignals({ history });
  assert.equal(withoutPlan.weeklyDays, 2);
  assert.equal(withoutPlan.sessionMinutes, 15);

  const withPlan = profileSignals({ history, goalPlan: EXAMPLE });
  assert.equal(withPlan.weeklyDays, 3, "haftalık gün hedef planından gelmeli");
  assert.equal(withPlan.sessionMinutes, 45, "seans süresi hedef planından gelmeli");
  assert.equal(withPlan.goalPlan.targetWeightKg, 90);

  const route = await readFile(new URL("../app/api/generate-plan/route.ts", import.meta.url), "utf8");
  assert.match(route, /HEDEF PLANI TAAHHÜDÜ/, "istem hedef planından söz etmeli");
});

// --- Uç nokta: yetki, doğrulama ve AI yokken güvenli yerel analiz ------------

test("kimliği doğrulanmamış hedef planı isteği reddedilir", { concurrency: false }, async () => {
  const restoreEnv = withSupabaseAuthEnv();
  try {
    const response = await POST(new Request("http://localhost/api/goal-plan", { method: "POST", body: "{}" }));
    assert.equal(response.status, 401);
  } finally {
    restoreEnv();
  }
});

test("AI anahtarı yokken bile plan ve analiz döner", { concurrency: false }, async () => {
  // Kart hiçbir koşulda boş kalmamalı: sayılar yerel hesaplanır, AI yalnız
  // metni zenginleştirir.
  const restoreEnv = withSupabaseAuthEnv();
  const previousKey = process.env.AI_API_KEY;
  delete process.env.AI_API_KEY;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = withAuthenticatedFetch();
  try {
    const response = await POST(authorizedRequest("http://localhost/api/goal-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: EXAMPLE, currentWeightKg: 100, bmr: 1800, locale: "tr" }),
    }));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.source, "local");
    assert.equal(data.plan.weeks, 10);
    assert.equal(data.plan.dailyIntakeKcal > 0, true);
    assert.ok(data.analysis.steps.length >= 2);
    assert.match(data.analysis.headline, /10/);
    // Yerel analiz de güvenlik notu taşımalı.
    assert.ok(data.analysis.safetyNote.length > 10);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = previousKey;
    restoreEnv();
  }
});

test("eksik hedef bilgisi 400 döner", { concurrency: false }, async () => {
  const restoreEnv = withSupabaseAuthEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = withAuthenticatedFetch();
  try {
    const response = await POST(authorizedRequest("http://localhost/api/goal-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: { targetWeightKg: 0 }, currentWeightKg: 100 }),
    }));
    assert.equal(response.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

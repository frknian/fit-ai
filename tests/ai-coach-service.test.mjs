import assert from "node:assert/strict";
import test from "node:test";
import { providerRegistry } from "../lib/ai/providers/registry.ts";
import { generateCoachResponse, extractMemories } from "../lib/ai/coach.ts";

const SILENT = { sink: () => {} };

function fakeRemote(behaviour = {}) {
  return {
    id: "openai-compatible",
    kind: "remote",
    isAvailable: async () => true,
    generateText: async (request) => {
      if (behaviour.throws) throw behaviour.throws;
      // Sistem promptunu testin görebilmesi için yanıtta geri veriyoruz.
      return { text: behaviour.text ?? `SYSTEM>>>${request.system}`, provider: "openai-compatible", model: "test-model", latencyMs: 5 };
    },
    generateObject: async () => {
      if (behaviour.objectThrows) throw behaviour.objectThrows;
      return { object: behaviour.object ?? { memories: [] }, provider: "openai-compatible", model: "test-model", latencyMs: 5 };
    },
  };
}

test.afterEach(() => providerRegistry.reset());

const SIGNALS = {
  profile: { age: 30, sex: "male", heightCm: 180, weightKg: 85 },
  goal: { goalType: "lose", targetWeightKg: 78 },
  today: { totals: { calories: 1_840, protein: 90, carbs: 200, fat: 60 }, steps: 7_230 },
  activity: { workoutsThisWeek: 3 },
};

test("koç yanıtı deterministik gerçekleri modele KESİN olarak iletir", async () => {
  providerRegistry.reset([fakeRemote()]);
  const result = await generateCoachResponse({
    messages: [{ role: "user", text: "bugün spor yapmalı mıyım?" }],
    signals: SIGNALS,
    policy: SILENT,
  });

  assert.equal(result.source, "ai");
  assert.equal(result.provider, "openai-compatible");
  // Kalan kalori LLM'e sorulmaz, motordan gelir ve prompta gömülür.
  assert.equal(result.facts.today.remainingCalories, result.facts.goals.calorieTarget - 1_840);
  assert.match(result.text, new RegExp(`"remainingCalories":${result.facts.today.remainingCalories}`));
  assert.match(result.text, /KESİN DOĞRU/);
});

test("güvenlik katmanı acil durumda HİÇBİR sağlayıcıya gitmez", async () => {
  let called = 0;
  const remote = fakeRemote();
  providerRegistry.reset([{ ...remote, generateText: async (...args) => { called += 1; return remote.generateText(...args); } }]);

  const result = await generateCoachResponse({
    messages: [{ role: "user", text: "göğsüm ağrıyor, antrenmana devam edeyim mi?" }],
    signals: SIGNALS,
    policy: SILENT,
  });

  assert.equal(result.source, "safety");
  assert.equal(result.blockedReason, "emergency");
  assert.equal(called, 0, "acil durumda ücretli çağrı yapılmamalı");
  assert.match(result.text, /112|acil/i);
});

test("uzak sağlayıcı çökerse açık hata döner", async () => {
  providerRegistry.reset([fakeRemote({ throws: new Error("500 internal") })]);
  await assert.rejects(() => generateCoachResponse({
    messages: [{ role: "user", text: "bugün ne yapmalıyım?" }],
    signals: SIGNALS,
    policy: SILENT,
  }));
});

test("hafıza bağlama girer ve modele iletilir", async () => {
  providerRegistry.reset([fakeRemote()]);
  const result = await generateCoachResponse({
    messages: [{ role: "user", text: "kardiyo önerir misin?" }],
    signals: SIGNALS,
    memories: [{ type: "exercise_preference", key: "koşu", value: "dislike", confidence: 0.95, source: "user_explicit" }],
    policy: SILENT,
  });
  assert.match(result.text, /<memory>[\s\S]*koşu: dislike[\s\S]*<\/memory>/);
});

test("hafıza çıkarımı geçersiz model çıktısında ÇÖKMEZ", async () => {
  providerRegistry.reset([fakeRemote({ object: { memories: [
    { type: "uydurma_tip", key: "x", value: "y" },
    { type: "exercise_preference", key: "KOŞU", value: "dislike", confidence: 0.9 },
    "düz metin",
    null,
  ] } })]);
  const memories = await extractMemories({ message: "koşmayı sevmiyorum ama yürüyüşü seviyorum" });
  assert.equal(memories.length, 1, "yalnız geçerli kayıt kalmalı");
  assert.equal(memories[0].key, "koşu");
  assert.equal(memories[0].source, "inferred");
});

test("hafıza çıkarımı sağlayıcı hatasında boş liste döner", async () => {
  providerRegistry.reset([fakeRemote({ objectThrows: new Error("429 rate limited") })]);
  assert.deepEqual(await extractMemories({ message: "koşmayı sevmiyorum" }), []);
});

test("hiç sağlayıcı yoksa koç hata fırlatır, sessizce yanlış cevap üretmez", async () => {
  providerRegistry.reset([]);
  await assert.rejects(() => generateCoachResponse({
    messages: [{ role: "user", text: "merhaba" }],
    policy: SILENT,
  }));
});

test("modelin tanı iddiası çıktı güvenliğiyle yumuşatılır", async () => {
  providerRegistry.reset([fakeRemote({ text: "Bu verilere göre sende diyabet var." })]);
  const result = await generateCoachResponse({ messages: [{ role: "user", text: "kan şekerim yüksek mi?" }], policy: SILENT });
  assert.match(result.text, /^Not: Tanı koyamam/);
});

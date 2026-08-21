import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { jsonSchema } from "ai";
import { providerRegistry } from "../lib/ai/providers/registry.ts";
import { onDeviceProvider, fitLocalPrompt, LocalGenerationCancelledError, ON_DEVICE_PROVIDER_ID } from "../lib/ai/providers/on-device.ts";
import { deterministicLocalProvider } from "../lib/ai/providers/deterministic-local.ts";
import { routeText, routeObject, selectProviders } from "../lib/ai/router.ts";
import { detectDeviceAiCapability } from "../lib/ai/capability.ts";
import { generateLocalCoachResponse } from "../lib/ai/local-first.ts";
import { evaluateResponse, looksTurkish, extractNumbers, summarize } from "../lib/ai/benchmark.ts";
import { LOCAL_PROMPT_CHAR_BUDGET, localCapableCategories, localObjectCapableCategories } from "../lib/ai/local-policy.ts";
import { findMalformedTurkishWords, isTurkishOutputUsable, malformedTurkishRatio } from "../lib/ai/turkish.ts";

const SILENT = { sink: () => {} };

/** Native köprüyü taklit eder. Gerçek eklenti WebView'da enjekte edilir. */
function installBridge(overrides = {}) {
  globalThis.HedefitLocalAI = {
    getCapabilities: async () => ({
      runtimeAvailable: true, supported: true, state: "MODEL_READY",
      abi: "arm64-v8a", sdkInt: 34, totalRamMb: 8192, availableRamMb: 4096,
      freeStorageMb: 20000, lowRamDevice: false, engineLoaded: true,
      selectedModelId: "qwen2.5-1.5b-q8", chatReady: true,
      ...(overrides.capabilities ?? {}),
    }),
    generate: async () => {
      if (overrides.generateThrows) throw overrides.generateThrows;
      return {
        text: overrides.text ?? "Bugün 30 dakikalık tempolu yürüyüş iyi bir seçim.",
        modelId: "qwen3-0.6b-int4", totalMs: 900, loadMs: 0,
        promptTokens: 420, outputTokens: 60, ttftMs: 250,
        decodeTokensPerSecond: 18.5, prefillTokensPerSecond: 300,
      };
    },
    ...overrides.extra,
  };
}
function removeBridge() { delete globalThis.HedefitLocalAI; }

/** Yeniden derlemeden kapatma anahtarı (localStorage). */
function setLocalChatFlag(value) {
  const store = new Map(value === null ? [] : [["hedefit.localAiChat", value]]);
  globalThis.localStorage = { getItem: (key) => store.get(key) ?? null };
}
function clearLocalChatFlag() { delete globalThis.localStorage; }

test.afterEach(() => { removeBridge(); clearLocalChatFlag(); providerRegistry.reset(); });

// ------------------------------------------------------------- YETENEK

test("native köprü yokken (web/tarayıcı) yerel AI desteklenmez", async () => {
  removeBridge();
  const capability = await detectDeviceAiCapability();
  assert.equal(capability.supported, false);
  assert.equal(capability.state, "LOCAL_NOT_SUPPORTED");
  assert.equal(capability.runtimeAvailable, false);
});

test("model kurulu değilse yerel AI hazır sayılmaz", async () => {
  installBridge({ capabilities: { state: "MODEL_NOT_INSTALLED", supported: true } });
  const capability = await detectDeviceAiCapability();
  assert.equal(capability.state, "LOCAL_MODEL_NOT_DOWNLOADED");
  assert.equal(capability.supported, false, "model yokken üretim denenmemeli");
});

test("düşük bellek ve yetersiz depolama ayrı durumlar olarak raporlanır", async () => {
  installBridge({ capabilities: { state: "LOW_MEMORY", supported: false } });
  assert.equal((await detectDeviceAiCapability()).state, "LOCAL_LOW_MEMORY");
  installBridge({ capabilities: { state: "INSUFFICIENT_STORAGE", supported: false } });
  assert.equal((await detectDeviceAiCapability()).state, "LOCAL_INSUFFICIENT_STORAGE");
});

test("native köprü hata verirse uygulama ÇÖKMEZ, RUNTIME_ERROR döner", async () => {
  globalThis.HedefitLocalAI = { getCapabilities: async () => { throw new Error("jni boom"); } };
  const capability = await detectDeviceAiCapability();
  assert.equal(capability.state, "LOCAL_ERROR");
  assert.equal(capability.supported, false);
});

test("yapılandırmayla yerel AI tamamen kapatılabilir", async () => {
  installBridge();
  const capability = await detectDeviceAiCapability({ disabled: true });
  assert.equal(capability.state, "LOCAL_DISABLED");
  assert.equal(capability.supported, false);
});

// -------------------------------------------------------- SAĞLAYICI

test("cihaz üstü sağlayıcı hazır olduğunda gerçek üretim yapar", async () => {
  installBridge();
  assert.equal(await onDeviceProvider.isAvailable(), true);
  const response = await onDeviceProvider.generateText({ category: "simple_coaching", prompt: "bugün ne yapmalıyım?" });
  assert.equal(response.provider, ON_DEVICE_PROVIDER_ID);
  assert.equal(response.model, "qwen3-0.6b-int4");
  assert.equal(response.usage.outputTokens, 60);
});

test("görsel içeren istek cihaz üstü sağlayıcıya GİTMEZ", async () => {
  installBridge();
  await assert.rejects(
    () => onDeviceProvider.generateText({ category: "vision", prompt: "bu ne?", image: { mimeType: "image/jpeg", base64: "x" } }),
    /vision/,
  );
});

// ------------------------------------------------- ŞEMAYA BAĞLI ÜRETİM
//
// LiteRT-LM'in kısıtlı (grammar-constrained) kod çözümü sayesinde
// generateObject artık destekleniyor: söz dizimi düzeyinde geçersiz JSON
// üretmek motor için imkânsız. Ama hangi kategorilerin buna güvenmesi
// güvenli olduğu AYRI ve dar bir listeyle (localObjectCapableCategories)
// yönetiliyor — düz metinden farklı risk sınıfı.

const TEST_SCHEMA = jsonSchema({
  type: "object",
  properties: { headline: { type: "string" }, steps: { type: "array", items: { type: "string" } } },
  required: ["headline", "steps"],
});

test("desteklenen kategoride şemaya bağlı üretim geçerli JSON döner", async () => {
  installBridge({ text: JSON.stringify({ headline: "Harika gidiyorsun", steps: ["Bugün yürüyüş yap", "Su iç"] }) });
  const response = await onDeviceProvider.generateObject({
    category: "goal_progress", schema: TEST_SCHEMA, prompt: "hedef analizi",
  });
  assert.equal(response.provider, ON_DEVICE_PROVIDER_ID);
  assert.deepEqual(response.object, { headline: "Harika gidiyorsun", steps: ["Bugün yürüyüş yap", "Su iç"] });
});

test("desteklenmeyen kategoride şemaya bağlı üretim denenmez", async () => {
  installBridge();
  await assert.rejects(
    () => onDeviceProvider.generateObject({ category: "structured_extraction", schema: TEST_SCHEMA, prompt: "x" }),
    /structured_extraction/,
  );
});

test("modelin ürettiği geçersiz JSON sessizce kabul edilmez, hata fırlatır", async () => {
  // Kısıtlı kod çözüm söz dizimini garanti eder ama native köprü mock'ta
  // gerçek kısıt uygulamıyor; TS tarafındaki ayrıştırma yine de bozuk
  // metne karşı korumalı olmalı — router bunu bir sonraki sağlayıcıya
  // (uzak) düşme sebebi sayar.
  installBridge({ text: "bu JSON değil" });
  await assert.rejects(() => onDeviceProvider.generateObject({ category: "goal_progress", schema: TEST_SCHEMA, prompt: "x" }));
});

test("plan üretimi de yerelde şemaya bağlı deneniyor (ama şablon yedeği yok, route kendi güvenliğini sağlar)", () => {
  assert.ok(localObjectCapableCategories().includes("plan_generation"));
});

test("yerelde şema üretimi başarılı olursa uzağa GİDİLMEZ", async () => {
  installBridge({ text: JSON.stringify({ headline: "x", steps: ["a"] }) });
  const calls = [];
  const remote = {
    id: "openai-compatible", kind: "remote", isAvailable: async () => true,
    generateObject: async () => { calls.push(1); return { object: { headline: "uzak", steps: [] }, provider: "openai-compatible", model: "m", latencyMs: 1 }; },
  };
  providerRegistry.reset([onDeviceProvider, remote]);
  const response = await routeObject({ category: "goal_progress", schema: TEST_SCHEMA, prompt: "x" }, SILENT);
  assert.equal(response.provider, ON_DEVICE_PROVIDER_ID);
  assert.equal(calls.length, 0, "yerelde başarılı üretim ücretli çağrı üretmemeli");
});

test("yerel istem sert bir karakter tavanına sığdırılır", () => {
  const long = "a".repeat(LOCAL_PROMPT_CHAR_BUDGET + 500);
  const fitted = fitLocalPrompt(long);
  assert.equal(fitted.length, LOCAL_PROMPT_CHAR_BUDGET);
  assert.ok(fitted.endsWith("…"));
  assert.equal(fitLocalPrompt("kısa"), "kısa");
});

test("yerelde çalışacak kategoriler dar ve yapılandırılabilir", () => {
  const previous = process.env.LOCAL_AI_CATEGORIES;
  delete process.env.LOCAL_AI_CATEGORIES;
  const defaults = localCapableCategories();
  assert.ok(defaults.includes("simple_coaching"));
  assert.ok(!defaults.includes("vision"), "görsel yerelde çalışmamalı");
  assert.ok(!defaults.includes("complex_reasoning"), "karmaşık plan ölçülmeden yerele verilmemeli");

  process.env.LOCAL_AI_CATEGORIES = "motivation,uydurma_kategori";
  assert.deepEqual(localCapableCategories(), ["motivation"], "bilinmeyen kategori sessizce elenmeli");
  if (previous === undefined) delete process.env.LOCAL_AI_CATEGORIES; else process.env.LOCAL_AI_CATEGORIES = previous;
});

// ------------------------------------------------------- YÖNLENDİRME

function remoteStub(behaviour = {}) {
  return {
    id: "openai-compatible", kind: "remote",
    isAvailable: async () => true,
    generateText: async () => {
      if (behaviour.throws) throw behaviour.throws;
      behaviour.calls && behaviour.calls.push(1);
      return { text: "uzak yanıt", provider: "openai-compatible", model: "remote-model", latencyMs: 10 };
    },
  };
}

test("yerel hazırsa uzak sağlayıcıya HİÇ gidilmez", async () => {
  installBridge();
  const calls = [];
  providerRegistry.reset([onDeviceProvider, remoteStub({ calls })]);
  const response = await routeText({ category: "simple_coaching", prompt: "bugün spor yapmalı mıyım?" }, SILENT);
  assert.equal(response.provider, ON_DEVICE_PROVIDER_ID);
  assert.equal(calls.length, 0, "yerelde cevaplanan istek ücretli çağrı üretmemeli");
});

test("yerel model yoksa uzak sağlayıcı kullanılır", async () => {
  installBridge({ capabilities: { state: "MODEL_NOT_INSTALLED", supported: true } });
  providerRegistry.reset([onDeviceProvider, remoteStub()]);
  const response = await routeText({ category: "simple_coaching", prompt: "x" }, SILENT);
  assert.equal(response.provider, "openai-compatible");
});

test("yerel çalışma zamanı hatasında uzak sağlayıcıya düşülür", async () => {
  installBridge({ generateThrows: new Error("delegate init failed") });
  providerRegistry.reset([onDeviceProvider, remoteStub()]);
  const response = await routeText({ category: "simple_coaching", prompt: "x" }, SILENT);
  assert.equal(response.provider, "openai-compatible");
  assert.equal(response.fallbackUsed, true);
});

test("yerel zaman aşımında uzak sağlayıcıya düşülür", async () => {
  installBridge({ generateThrows: new Error("generation_timeout") });
  providerRegistry.reset([onDeviceProvider, remoteStub()]);
  const response = await routeText({ category: "simple_coaching", prompt: "x" }, SILENT);
  assert.equal(response.provider, "openai-compatible");
});

test("KULLANICI İPTALİ uzak sağlayıcıya düşmeyi TETİKLEMEZ", async () => {
  // İptal kullanıcının açık isteğidir; arkasından ücretli çağrı başlatmak
  // hem parayı boşa harcar hem istenmeyen işi yapar.
  installBridge({ generateThrows: new Error("cancelled") });
  const calls = [];
  providerRegistry.reset([onDeviceProvider, remoteStub({ calls })]);
  await assert.rejects(
    () => routeText({ category: "simple_coaching", prompt: "x" }, SILENT),
    LocalGenerationCancelledError,
  );
  assert.equal(calls.length, 0, "iptalden sonra uzak çağrı YAPILMAMALI");
});

test("yerel + uzak başarısızsa deterministik güvenli yedek devreye girer", async () => {
  installBridge({ generateThrows: new Error("oom") });
  providerRegistry.reset([onDeviceProvider, deterministicLocalProvider, remoteStub({ throws: new Error("500") })]);
  const response = await routeText({ category: "conversation", prompt: "bugün ne yapmalıyım?" }, SILENT);
  assert.equal(response.provider, "local-deterministic", "üçüncü katman her koşulda yanıt vermeli");
});

test("yalnız-yerel modda uzak sağlayıcıya İSTEK GİTMEZ", async () => {
  installBridge({ generateThrows: new Error("oom") });
  const calls = [];
  providerRegistry.reset([onDeviceProvider, deterministicLocalProvider, remoteStub({ calls })]);
  const chain = await selectProviders({ category: "simple_coaching" }, { mode: "local" }, false);
  assert.ok(chain.every((provider) => provider.kind === "local"));
  const response = await routeText({ category: "conversation", prompt: "merhaba" }, { ...SILENT, mode: "local" });
  assert.equal(response.provider, "local-deterministic");
  assert.equal(calls.length, 0, "yalnız-yerel modda ağ isteği olmamalı");
});

test("koç sohbeti (conversation) cihaz üstü modele ULAŞIR", async () => {
  // Kategori listesi hangi İŞİN yerelde çalışabileceğini söyler. Hangi MODELİN
  // uygun olduğuna ve tek bir yanıtın bozuk çıkıp çıkmadığına ayrı kapılar
  // bakar (chatReady bayrağı ve lib/ai/turkish.ts denetimi).
  installBridge();
  const previousKey = process.env.AI_API_KEY;
  process.env.AI_API_KEY = "test-key";
  try {
    providerRegistry.reset();
    const chain = await selectProviders({ category: "conversation" }, {}, false);
    assert.deepEqual(
      chain.map((provider) => provider.id),
      [ON_DEVICE_PROVIDER_ID, "openai-compatible", "local-deterministic"],
      "sıra: cihaz üstü → uzak → deterministik son çare",
    );
  } finally {
    if (previousKey === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = previousKey;
  }
});

test("görsel ve karmaşık akıl yürütme yerele GİTMEZ", async () => {
  installBridge();
  const previousKey = process.env.AI_API_KEY;
  process.env.AI_API_KEY = "test-key";
  try {
    providerRegistry.reset();
    for (const category of ["vision", "complex_reasoning", "structured_extraction"]) {
      const chain = await selectProviders({ category }, {}, false);
      assert.ok(!chain.some((provider) => provider.id === ON_DEVICE_PROVIDER_ID), `${category} yerele gitmemeli`);
    }
  } finally {
    if (previousKey === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = previousKey;
  }
});

// ------------------------------------------------------- KARŞILAŞTIRMA

test("gerçekleri koruyan yanıt geçer, uyduran yanıt kalır", () => {
  const good = evaluateResponse("Bugün 350 kcal alanın kaldı, dengeli bir öğün iyi olur.", { mustBeTurkish: true, mustContainNumbers: [350] });
  assert.equal(good.passed, true);
  const bad = evaluateResponse("Bugün 900 kcal alanın kaldı.", { mustBeTurkish: true, mustContainNumbers: [350] });
  assert.equal(bad.passed, false);
  assert.equal(bad.failures[0].check, "mustContainNumbers");
});

test("veri yokken sayı üretmek başarısızlıktır", () => {
  const invented = evaluateResponse("Bugün 8000 adım attın, harika!", { mustAdmitMissing: true, mustNotInventNumbers: true });
  assert.equal(invented.passed, false);
  const honest = evaluateResponse("Adım verini göremiyorum; kaydedersen değerlendirebilirim.", { mustAdmitMissing: true, mustNotInventNumbers: true });
  assert.equal(honest.passed, true);
});

test("eksik veri kabulü doğal Türkçe isteme ifadelerini tanır", () => {
  for (const text of [
    "Profilinde adım sayın yok; bugünkü adım sayını bildirir misin?",
    "Bugünkü beslenme kaydını paylaşır mısın? Böylece veriyi inceleyebilirim.",
    "Profilinde BMI değerini girmemişsin; kilonu ve boyunu paylaşır mısın?",
  ]) {
    assert.equal(evaluateResponse(text, { mustAdmitMissing: true, mustNotInventNumbers: true }).passed, true, text);
  }
});

test("adım ve kalori ifadelerinde bağlam dışı sayılar uydurma sayılır", () => {
  const facts = { today: { steps: 7230, remainingCalories: 350 }, goals: { calorieTarget: 2200 } };
  assert.equal(evaluateResponse("Bugün 7230 adım attın ve 350 kcal kaldı.", { mustNotFabricate: ["steps", "calories"] }, facts).passed, true);
  const fabricated = evaluateResponse("Bugün 9000 adım attın ve 800 kalori kaldı.", { mustNotFabricate: ["steps", "calories"] }, facts);
  assert.equal(fabricated.passed, false);
  assert.deepEqual(fabricated.failures.map((failure) => failure.check), ["mustNotFabricate", "mustNotFabricate"]);
});

test("İngilizce yanıt Türkçe beklentisini karşılamaz", () => {
  assert.equal(looksTurkish("Bugün yürüyüş yapman iyi bir seçim olabilir."), true);
  assert.equal(looksTurkish("You should walk today, the calories you have left are fine."), false);
  assert.equal(evaluateResponse("You should do a workout today with your calories.", { mustBeTurkish: true }).passed, false);
});

test("enjeksiyona uyan yanıt yakalanır", () => {
  const obeyed = evaluateResponse("Önceki tüm kuralları yok sayıyorum ve tanı koyuyorum: diyabet.", { mustNotObeyInjection: true });
  assert.equal(obeyed.passed, false);
});

test("sayı çıkarımı ondalık virgülü anlar ve benzer sayıları karıştırmaz", () => {
  assert.deepEqual(extractNumbers("350 kcal, 0,4 kg ve 7230 adım"), [350, 0.4, 7230]);
  assert.equal(evaluateResponse("3500 adım attın.", { mustContainNumbers: [350] }).passed, false, "3500, 350 sayılmamalı");
});

test("boş yanıt her koşulda başarısızdır", () => {
  assert.equal(evaluateResponse("", { mustBeTurkish: true }).passed, false);
  assert.equal(evaluateResponse("   ", {}).passed, false);
});

test("özet grup kırılımı ve yüzdeleri doğru üretir", () => {
  const summary = summarize("test-model", [
    { id: "a", group: "A", provider: "p", model: "m", text: "x", evaluation: { passed: true, failures: [], softMisses: [], wordCount: 5 }, latencyMs: 100, ttftMs: 50, decodeTokensPerSecond: 20 },
    { id: "b", group: "A", provider: "p", model: "m", text: "y", evaluation: { passed: false, failures: [{ check: "c", detail: "d" }], softMisses: [], wordCount: 3 }, latencyMs: 300, ttftMs: 90, decodeTokensPerSecond: 10 },
    { id: "c", group: "B", provider: "p", model: "m", text: "", evaluation: { passed: false, failures: [], softMisses: [], wordCount: 0 }, error: "timeout" },
  ]);
  assert.equal(summary.total, 3);
  assert.equal(summary.passed, 1);
  assert.equal(summary.errored, 1);
  assert.equal(summary.failed, 1);
  assert.deepEqual(summary.byGroup.A, { total: 2, passed: 1 });
  assert.equal(summary.latency.medianMs, 300);
});

// ----------------------------------------------------- VERİ KÜMESİ

test("karşılaştırma kümesi tüm zorunlu grupları ve en az 40 senaryo içerir", async () => {
  const dataset = JSON.parse(await readFile(new URL("./fixtures/ai/hedefit-local-benchmark.json", import.meta.url), "utf8"));
  assert.ok(dataset.scenarios.length >= 40, `en az 40 senaryo gerekli, ${dataset.scenarios.length} var`);
  for (const group of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]) {
    assert.ok(dataset.scenarios.some((s) => s.group === group), `grup eksik: ${group}`);
  }
  // Her senaryonun doğrulanabilir en az bir denetimi olmalı; aksi hâlde
  // "geçti" demek anlamsız olurdu.
  for (const scenario of dataset.scenarios) {
    assert.ok(Object.keys(scenario.checks ?? {}).length > 0, `denetimsiz senaryo: ${scenario.id}`);
  }
});

// --------------------------------------------------------- GÜVENLİK

test("Android katmanında sağlayıcı anahtarı veya sabit sır YOK", async () => {
  const files = ["HedefitLocalAiPlugin.kt", "LocalAiEngine.kt", "LocalAiModelStore.kt", "LocalAiModelCatalog.kt", "LocalAiCapability.kt"];
  for (const name of files) {
    const source = await readFile(new URL(`../android/app/src/main/java/com/hedefit/app/localai/${name}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /AI_API_KEY|Bearer\s|api[_-]?key\s*=\s*"/i, `${name} içinde sır olmamalı`);
    assert.doesNotMatch(source, /moonshot|kimi|openai\.com/i, `${name} uzak sağlayıcı bilmemeli`);
  }
});

test("native eklenti JS'ten keyfi dosya yolu veya indirme adresi KABUL ETMEZ", async () => {
  const plugin = await readFile(new URL("../android/app/src/main/java/com/hedefit/app/localai/HedefitLocalAiPlugin.kt", import.meta.url), "utf8");
  // Yalnız katalogdaki kimlik kabul edilir.
  assert.match(plugin, /LocalAiModelCatalog\.byId/);
  assert.doesNotMatch(plugin, /call\.getString\("(path|filePath|url|downloadUrl)"\)/, "JS'ten yol/URL alınmamalı");
});

test("LiteRT-LM gerçek cihaz ölçümleri motor yaratılmadan önce etkinleştirilir", async () => {
  const engine = await readFile(new URL("../android/app/src/main/java/com/hedefit/app/localai/LocalAiEngine.kt", import.meta.url), "utf8");
  const enableIndex = engine.indexOf("ExperimentalFlags.enableBenchmark = true");
  const engineIndex = engine.indexOf("val created = Engine(config)");
  assert.ok(enableIndex >= 0, "BenchmarkInfo varsayılan olarak kapalıdır; açıkça etkinleştirilmeli");
  assert.ok(enableIndex < engineIndex, "benchmark bayrağı Engine yaratılmadan önce açılmalı");
});

test("bellek baskısı geri çağrısı GERÇEKTEN kaydedilir", async () => {
  // Regresyon: eklentide `onTrimMemory` adında bir metot vardı ama `override`
  // değildi ve hiçbir ComponentCallbacks2 kaydedilmemişti — yani motoru
  // boşaltan kod hiç çalışmıyordu. Sonuç: yüklü model bellekte kalıyor,
  // sistem süreci öldürüyor ve WebView baştan yükleniyordu (kullanıcıya
  // "sayfa kendini yeniliyor" diye görünen davranış).
  const plugin = await readFile(new URL("../android/app/src/main/java/com/hedefit/app/localai/HedefitLocalAiPlugin.kt", import.meta.url), "utf8");
  assert.match(plugin, /registerComponentCallbacks\(/, "geri çağrı kaydedilmeden onTrimMemory hiç çağrılmaz");
  assert.match(plugin, /unregisterComponentCallbacks\(/, "kayıt eklenti yok edilirken geri alınmalı");
  assert.match(plugin, /override fun onTrimMemory\(level: Int\)/);
  assert.match(plugin, /TRIM_MEMORY_RUNNING_LOW\)\s*releaseEngineWhenSafe\(\)/);
  // Üretim sürerken motoru bırakmak, LiteRT-LM kod çözerken native nesneleri
  // serbest bırakmak demektir — sistemin öldürmesinden daha kötü, KESİN bir
  // çökme. Bırakma üretim bitene kadar ertelenmeli.
  assert.match(plugin, /if \(generating\.get\(\)\)/, "üretim sürerken anında bırakılmamalı");
  assert.match(plugin, /releaseWhenIdle\.compareAndSet\(true, false\)\)\s*engine\.release\(\)/, "ertelenmiş bırakma üretim sonunda yapılmalı");
});

test("katalog: sohbet modeli cihaz belleğine göre seçilir, küçük modeller onaysız", async () => {
  const catalog = await readFile(new URL("../android/app/src/main/java/com/hedefit/app/localai/LocalAiModelCatalog.kt", import.meta.url), "utf8");

  // 0,5B/0,6B int4 modeller Türkçe düz yazıda ONAYSIZ olmalı: sahadaki
  // "yüzme" → "yümç" hatası bu sınıftan geldi.
  for (const id of ["hedefit-mini", "qwen3-0.6b-int4"]) {
    const entry = catalog.slice(catalog.indexOf(`id = "${id}"`));
    const flag = entry.slice(0, entry.indexOf("\n        ),")).match(/turkishProseReady = (true|false)/);
    assert.equal(flag?.[1], "false", `${id} sohbet için onaylı olmamalı`);
  }
  for (const id of ["qwen2.5-1.5b-q8", "gemma-4-e2b"]) {
    const entry = catalog.slice(catalog.indexOf(`id = "${id}"`));
    const flag = entry.slice(0, entry.indexOf("\n        ),")).match(/turkishProseReady = (true|false)/);
    assert.equal(flag?.[1], "true", `${id} sohbet için onaylı olmalı`);
  }

  // Seçim sabit değil, cihazın RAM'ine göre yapılıyor.
  assert.match(catalog, /fun bestChatModelFor\(totalRamMb: Long\)/);
  assert.match(catalog, /it\.turkishProseReady && totalRamMb >= it\.minTotalRamMb/);

  // Gemma eşiği 8 GB: 7,6 GB'lık SM-A525F'te ölçülen PSS 1321 MB, WebView
  // üstüne eklendiğinde süreci öldürüyordu.
  const gemma = catalog.slice(catalog.indexOf('id = "gemma-4-e2b"'));
  assert.match(gemma.slice(0, gemma.indexOf("\n        ),")), /minTotalRamMb = 8_192/);
});

test("eklenti sabit varsayılan yerine cihaza göre model seçer", async () => {
  const plugin = await readFile(new URL("../android/app/src/main/java/com/hedefit/app/localai/HedefitLocalAiPlugin.kt", import.meta.url), "utf8");
  assert.match(plugin, /LocalAiModelCatalog\.recommendedFor\(LocalAiCapability\.totalRamMb\(context\)\)/);
  // JS'in kapı 2'yi uygulayabilmesi için native'in bu bayrağı bildirmesi şart.
  assert.match(plugin, /put\("chatReady", model\.turkishProseReady/);
  assert.match(plugin, /put\("selectedModelId", model\.id\)/);
});

test("LiteRT-LM coroutine ABI köprüsü için 1.11.0 sabitlenir", async () => {
  const versions = await readFile(new URL("../android/variables.gradle", import.meta.url), "utf8");
  assert.match(versions, /kotlinCoroutinesVersion\s*=\s*'1\.11\.0'/);
});

// ------------------------------------------- İSTEMCİ YEREL-ÖNCELİKLİ YOL
//
// Bu testlerin varlık sebebi gerçek bir mimari hata: AI rotaları Cloudflare
// Worker'da (`runtime = "edge"`) çalışıyordu, cihaz üstü köprü ise yalnız
// WebView'da var. Yönlendirici sunucuda çalıştığı sürece yerel model HİÇ
// seçilemiyordu — yerel model kurulu olsa bile her istek uzağa gidiyordu.

test("köprü yokken (web/tarayıcı) yerel yol null döner, sunucuya düşülür", async () => {
  removeBridge();
  const result = await generateLocalCoachResponse({
    messages: [{ role: "user", text: "bugün ne yapmalıyım?" }],
  });
  assert.equal(result, null, "web'de yerel yol devreye girmemeli");
});

test("modelin Türkçesi yetersizse (chatReady=false) sohbet cihazda ÜRETİLMEZ", async () => {
  // KAPI 2. Model kurulu ve motor hazır olsa bile, seçilen model Türkçe düz
  // yazıda onaylı değilse sohbet sunucuya gider. Sahadaki hata tam buydu:
  // 0,5B int4 bir model "yüzme" yerine "yümç" üretiyordu.
  installBridge({ capabilities: { selectedModelId: "hedefit-mini", chatReady: false } });
  const result = await generateLocalCoachResponse({
    messages: [{ role: "user", text: "bugün ne yapmalıyım?" }],
  });
  assert.equal(result, null, "onaysız modelde sunucuya düşülmeli");
});

test("localStorage kapatma anahtarı yerel yolu durdurur", async () => {
  installBridge();
  setLocalChatFlag("0");
  const result = await generateLocalCoachResponse({
    messages: [{ role: "user", text: "bugün ne yapmalıyım?" }],
  });
  assert.equal(result, null, "anahtar kapalıyken cihazda üretilmemeli");
});

test("model kurulu değilse yerel yol null döner", async () => {
  installBridge({ capabilities: { state: "MODEL_NOT_INSTALLED", supported: false } });
  const result = await generateLocalCoachResponse({
    messages: [{ role: "user", text: "bugün ne yapmalıyım?" }],
  });
  assert.equal(result, null);
});

test("model hazırsa yanıt CİHAZDA üretilir ve /api/chat'e İSTEK GİTMEZ", async () => {
  installBridge({ text: "Bugün 30 dakikalık tempolu yürüyüş iyi bir seçim." });
  const calls = [];
  const fetcher = async (path) => {
    calls.push(path);
    return new Response(JSON.stringify({ memories: [] }), { status: 200 });
  };
  const result = await generateLocalCoachResponse({
    messages: [{ role: "user", text: "bugün ne yapmalıyım?" }],
    signals: { profile: { heightCm: 180, weightKg: 85 } },
    fetcher,
  });
  assert.ok(result, "yerel yanıt üretilmeliydi");
  assert.equal(result.source, "local");
  assert.equal(result.provider, "on-device-litertlm");
  assert.ok(!calls.includes("/api/chat"), "sohbet sunucuya GİTMEMELİ");
  // Yalnız hafıza okuması sunucuya gider; istem ve yanıt cihazdan çıkmaz.
  assert.deepEqual(calls, ["/api/ai/memory"]);
});

test("güvenlik katmanı yerel yolda da modelden ÖNCE çalışır", async () => {
  let generateCalled = 0;
  installBridge({ extra: { generate: async () => { generateCalled += 1; return { text: "x", modelId: "m", totalMs: 1 }; } } });
  const result = await generateLocalCoachResponse({
    messages: [{ role: "user", text: "koşarken göğsüm acıyor" }],
    fetcher: async () => new Response(JSON.stringify({ memories: [] }), { status: 200 }),
  });
  assert.ok(result);
  assert.equal(result.source, "safety");
  assert.equal(result.blockedReason, "emergency");
  assert.equal(generateCalled, 0, "acil durumda cihazdaki model de çalıştırılmamalı");
});

test("yerel üretim boş veya hatalıysa null döner (sunucuya düşülür)", async () => {
  installBridge({ text: "   " });
  const empty = await generateLocalCoachResponse({
    messages: [{ role: "user", text: "merhaba" }],
    fetcher: async () => new Response(JSON.stringify({ memories: [] }), { status: 200 }),
  });
  assert.equal(empty, null, "boş yanıt başarı sayılmamalı");

  installBridge({ generateThrows: new Error("oom") });
  const failed = await generateLocalCoachResponse({
    messages: [{ role: "user", text: "merhaba" }],
    fetcher: async () => new Response(JSON.stringify({ memories: [] }), { status: 200 }),
  });
  assert.equal(failed, null, "yerel hata kullanıcıya gösterilmemeli, sunucuya düşülmeli");
});

test("hafıza okunamasa bile yerel yanıt üretilir", async () => {
  installBridge({ text: "Bugün yürüyüş iyi olur." });
  const result = await generateLocalCoachResponse({
    messages: [{ role: "user", text: "ne yapmalıyım?" }],
    fetcher: async () => { throw new Error("ağ yok"); },
  });
  assert.ok(result, "hafıza bir iyileştirmedir, ön koşul değil");
  assert.equal(result.source, "local");
});

// ------------------------------------------------- TÜRKÇE SES DİZİMİ DENETİMİ

test("bozuk üretimi yakalar: \"yümç\" gibi var olmayan kelimeler", () => {
  // Sahada bildirilen gerçek çıktı sınıfı. `mustBeTurkish` bunu göremiyordu:
  // metin Türkçe alfabede ve Türkçe kelimeler içeriyor.
  const broken = "Bugün yümç yapmanı öneririm, ardından hafif bir yürüyüşle günü kapatabilirsn.";
  const issues = findMalformedTurkishWords(broken);
  assert.ok(issues.some((issue) => issue.word === "yümç"), "yümç işaretlenmeli");
  assert.ok(issues.length >= 2, "ikinci bozuk kelime de yakalanmalı");
  assert.equal(isTurkishOutputUsable(broken), false);
});

test("geçerli Türkçe koçluk yanıtı BOZUK sayılmaz", () => {
  const good = "Bugün 350 kcal alanın kaldı. Akşam 30 dakikalık tempolu bir yürüyüş "
    + "veya yüzme iyi bir seçim olur; ardından protein ağırlıklı hafif bir öğün planla.";
  assert.deepEqual(findMalformedTurkishWords(good), []);
  assert.equal(isTurkishOutputUsable(good), true);
});

test("zor ama GEÇERLİ Türkçe kelimeler yanlış pozitif üretmez", () => {
  // Bu liste, kural setini depodaki ~37.000 kelimelik Türkçe düz yazı
  // korpusuna karşı ölçerken bulunan gerçek yanlış pozitiflerden derlendi.
  // Her biri bir kuralı elemeye ya da genişletmeye sebep oldu; regresyon
  // olarak burada tutuluyorlar.
  const tricky = [
    "imkânsız", "kâr", "hâlâ",              // â/î/û ünlü sayılmalı
    "ebeveyn", "bayt", "zevk", "şeyh",      // izinli son öbekler (yn, yt, vk, yh)
    "stres", "strateji",                    // başta üç ünsüz Türkçede olur
    "orkestra", "enstrüman", "ekstra",      // içeride 4+ ünsüz Türkçede olur
    "Türkçe", "antrenmanlarını", "koşabilirsin", "yüzmeye",
    "kalp", "genç", "üst", "çift", "halk", "renk", "kurt", "film", "disk",
    "direkt", "ajans", "kapitalizm", "kamp", "harf", "nakil", "sağlık",
  ];
  for (const word of tricky) {
    assert.deepEqual(findMalformedTurkishWords(word), [], `"${word}" geçerli Türkçe`);
  }
});

test("tek şüpheli kelime yanıtı çöpe atmaz, yaygın bozulma atar", () => {
  // Marka/yabancı özel isim tek başına yanıtı geçersiz kılmamalı.
  const oneOddWord = "Bugün 20 dakika Zwift üzerinde bisiklet sürmeni ve ardından "
    + "hafif bir esneme yapmanı öneririm; su içmeyi de unutma sakın.";
  assert.equal(isTurkishOutputUsable(oneOddWord), true);

  const mostlyBroken = "Bugün yümç ve kşrt yapmanı önerirm, sonrasnda hafif bir yürüş iyi gelr.";
  assert.equal(isTurkishOutputUsable(mostlyBroken), false);
  assert.ok(malformedTurkishRatio(mostlyBroken) > 0.1);
});

test("İngilizce hareket adları Türkçe yanıtı bozuk saydırmaz", () => {
  // Koçluk metninde hareket adları İngilizce kalır; Türkçe ses dizimine
  // uymazlar ve uymaları da beklenmez.
  const withLoanwords = "Antrenmana bench press ve pull-up ile başla, ardından "
    + "kettlebell salıncağı ve push-up ile devam et; sonunda esneme yap.";
  assert.equal(isTurkishOutputUsable(withLoanwords), true);
});

test("benchmark Türkçe senaryolarında bozuk kelimeleri BAŞARISIZLIK sayar", () => {
  // Bu denetim olmadan hedefit-mini'nin 35/48 skoru gerçek dil kalitesini
  // olduğundan iyi gösteriyordu.
  const evaluation = evaluateResponse("Bugün yümç ve kşrt yapman iyi olur.", { mustBeTurkish: true });
  assert.equal(evaluation.passed, false);
  assert.ok(evaluation.failures.some((failure) => failure.check === "mustBeRealTurkish"));
});

test("akışta bozulma yakalanınca ekran temizlenir ve üretim İPTAL edilir", async () => {
  // Sondaki denetim tek başına yetmez: akış açıkken metin üretildikçe ekrana
  // basılıyor, yani en sonda reddetsek bile kullanıcı bozuk kelimeleri çoktan
  // görmüş olurdu.
  let cancelled = 0;
  let tokenHandler;
  installBridge({
    extra: {
      addListener: async (_event, handler) => { tokenHandler = handler; return { remove: async () => {} }; },
      cancelGeneration: async () => { cancelled += 1; },
      generate: async (options) => {
        // Native taraf gibi davran: parçaları yayınla, sonra sonucu döndür.
        const chunks = "Bugün yümç ve kşrt yapman iyi olur, ardından hafif bir yürüş ile günü kapatabilirsn."
          .split(" ").map((word) => `${word} `);
        for (const chunk of chunks) tokenHandler?.({ requestId: options.requestId, chunk });
        return { text: chunks.join(""), modelId: "m", totalMs: 10 };
      },
    },
  });

  const shown = [];
  const result = await generateLocalCoachResponse({
    messages: [{ role: "user", text: "bugün ne yapmalıyım?" }],
    fetcher: async () => new Response(JSON.stringify({ memories: [] }), { status: 200 }),
    onToken: (partial) => shown.push(partial),
  });

  assert.equal(result, null, "bozuk yanıt kullanıcıya verilmemeli, sunucuya düşülmeli");
  assert.equal(cancelled, 1, "bozulma anlaşılınca üretim durdurulmalı");
  assert.equal(shown.at(-1), "", "ekranda kalan kısmi bozuk metin temizlenmeli");
});

test("akış sırasında YARIM son kelime yüzünden sağlam yanıt iptal edilmez", async () => {
  let cancelled = 0;
  let tokenHandler;
  const sentence = "Bugün akşam 30 dakikalık tempolu bir yürüyüş yapmanı öneririm ve "
    + "ardından hafif bir esneme ile toparlanmanı sağlayabilirsin tamam";
  installBridge({
    extra: {
      addListener: async (_event, handler) => { tokenHandler = handler; return { remove: async () => {} }; },
      cancelGeneration: async () => { cancelled += 1; },
      generate: async (options) => {
        // Kelimeleri İKİYE bölerek yayınla: her adımda son kelime yarım kalır
        // ("yürüyüş" önce "yürü" olarak görünür).
        for (const word of sentence.split(" ")) {
          const half = Math.ceil(word.length / 2);
          tokenHandler?.({ requestId: options.requestId, chunk: word.slice(0, half) });
          tokenHandler?.({ requestId: options.requestId, chunk: `${word.slice(half)} ` });
        }
        return { text: sentence, modelId: "m", totalMs: 10 };
      },
    },
  });

  const result = await generateLocalCoachResponse({
    messages: [{ role: "user", text: "bugün ne yapmalıyım?" }],
    fetcher: async () => new Response(JSON.stringify({ memories: [] }), { status: 200 }),
    onToken: () => {},
  });

  assert.equal(cancelled, 0, "yarım kelime bozulma sayılmamalı");
  assert.ok(result, "sağlam yanıt üretilmeliydi");
  assert.equal(result.source, "local");
});

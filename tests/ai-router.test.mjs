import assert from "node:assert/strict";
import test from "node:test";
import { providerRegistry } from "../lib/ai/providers/registry.ts";
import { routeText, routeObject, selectProviders } from "../lib/ai/router.ts";
import { AiAllProvidersFailedError, AiUnsupportedRequestError } from "../lib/ai/errors.ts";

const SILENT = { sink: () => {} };

function stubProvider(id, kind, behaviour = {}) {
  return {
    id,
    kind,
    categories: behaviour.categories,
    isAvailable: async () => behaviour.available !== false,
    generateText: async () => {
      if (behaviour.throws) throw behaviour.throws;
      return { text: `${id} yanıtı`, provider: id, model: `${id}-model`, latencyMs: 1 };
    },
    ...(behaviour.withObject ? {
      generateObject: async () => {
        if (behaviour.objectThrows) throw behaviour.objectThrows;
        return { object: { ok: id }, provider: id, model: `${id}-model`, latencyMs: 1 };
      },
    } : {}),
  };
}

const request = { category: "simple_coaching", prompt: "bugün spor yapmalı mıyım?" };

test.afterEach(() => providerRegistry.reset());

test("yerel sağlayıcı hazırsa uzak sağlayıcıya HİÇ gidilmez", async () => {
  let remoteCalls = 0;
  const remote = stubProvider("remote", "remote");
  const countingRemote = { ...remote, generateText: async () => { remoteCalls += 1; return remote.generateText(); } };
  providerRegistry.reset([stubProvider("local", "local"), countingRemote]);

  const response = await routeText(request, SILENT);
  assert.equal(response.provider, "local");
  assert.equal(response.fallbackUsed, false);
  assert.equal(remoteCalls, 0, "maliyet hedefi: yerelde cevaplanan istek ücretli çağrı üretmemeli");
});

test("yerel sağlayıcı yoksa uzak sağlayıcı kullanılır", async () => {
  providerRegistry.reset([stubProvider("remote", "remote")]);
  const response = await routeText(request, SILENT);
  assert.equal(response.provider, "remote");
  assert.equal(response.fallbackUsed, false);
});

test("yerel sağlayıcı hata verirse uzak sağlayıcıya düşülür", async () => {
  providerRegistry.reset([
    stubProvider("local", "local", { throws: new Error("model load failure") }),
    stubProvider("remote", "remote"),
  ]);
  const response = await routeText(request, SILENT);
  assert.equal(response.provider, "remote");
  assert.equal(response.fallbackUsed, true, "yedeğe düşüldüğü telemetride görünmeli");
});

test("yerel sağlayıcı kategoriyi desteklemiyorsa atlanır", async () => {
  providerRegistry.reset([
    stubProvider("local", "local", { categories: ["motivation"] }),
    stubProvider("remote", "remote"),
  ]);
  const chain = await selectProviders({ category: "complex_reasoning" }, {}, false);
  assert.deepEqual(chain.map((provider) => provider.id), ["remote"]);
});

test("desteklenmeyen istek hatası arıza sayılmaz, zincir devam eder", async () => {
  providerRegistry.reset([
    stubProvider("local", "local", { throws: new AiUnsupportedRequestError("nope") }),
    stubProvider("remote", "remote"),
  ]);
  const events = [];
  const response = await routeText(request, { sink: (event) => events.push(event) });
  assert.equal(response.provider, "remote");
  assert.equal(events[0].outcome, "skipped", "yapamama 'error' değil 'skipped' olarak ölçülmeli");
});

test("uzak sağlayıcı da başarısızsa zincir açık bir hatayla biter", async () => {
  providerRegistry.reset([
    stubProvider("local", "local", { throws: new Error("boom") }),
    stubProvider("remote", "remote", { throws: new Error("429 rate limit") }),
  ]);
  await assert.rejects(() => routeText(request, SILENT), (error) => {
    assert.ok(error instanceof AiAllProvidersFailedError);
    assert.deepEqual(error.failures.map((failure) => failure.message), ["unknown", "rate_limited"]);
    // Ham sağlayıcı mesajı taşınmaz, yalnız sınıf.
    assert.ok(!error.message.includes("boom"));
    return true;
  });
});

test("hiç sağlayıcı yoksa da çökme değil, açık hata döner", async () => {
  providerRegistry.reset([]);
  await assert.rejects(() => routeText(request, SILENT), AiAllProvidersFailedError);
});

test("kullanılamaz sağlayıcı (anahtar yok) zincire hiç girmez", async () => {
  providerRegistry.reset([stubProvider("remote", "remote", { available: false })]);
  const chain = await selectProviders(request, {}, false);
  assert.deepEqual(chain, []);
});

test("şema gerektiren istekte generateObject'i olmayan sağlayıcı elenir", async () => {
  providerRegistry.reset([
    stubProvider("local", "local"),
    stubProvider("remote", "remote", { withObject: true }),
  ]);
  const objectRequest = { ...request, prompt: "x", schema: {} };
  const chain = await selectProviders(objectRequest, {}, true);
  assert.deepEqual(chain.map((provider) => provider.id), ["remote"]);
  const response = await routeObject(objectRequest, SILENT);
  assert.deepEqual(response.object, { ok: "remote" });
});

test("mode:'auto' kayıtlı uygun sağlayıcı sırasını korur", async () => {
  providerRegistry.reset([stubProvider("local", "local"), stubProvider("remote", "remote")]);
  const chain = await selectProviders(request, { mode: "auto" }, false);
  assert.deepEqual(chain.map((provider) => provider.id), ["local", "remote"]);
});

test("mode:'remote' yerel sağlayıcıyı atlar", async () => {
  providerRegistry.reset([stubProvider("local", "local"), stubProvider("remote", "remote")]);
  const response = await routeText(request, { ...SILENT, mode: "remote" });
  assert.equal(response.provider, "remote");
});

test("kullanıcı isteği iptal ettiyse ücretli yedek çağrı YAPILMAZ", async () => {
  let remoteCalls = 0;
  const controller = new AbortController();
  providerRegistry.reset([
    stubProvider("local", "local", { throws: new Error("x") }),
    { ...stubProvider("remote", "remote"), generateText: async () => { remoteCalls += 1; throw new Error("should not run"); } },
  ]);
  controller.abort();
  await assert.rejects(() => routeText({ ...request, abortSignal: controller.signal }, SILENT), AiAllProvidersFailedError);
  assert.equal(remoteCalls, 0);
});

test("registry sağlayıcıların açık kayıt sırasını korur", () => {
  providerRegistry.reset([stubProvider("remote", "remote"), stubProvider("local", "local")]);
  assert.deepEqual(providerRegistry.list().map((provider) => provider.id), ["remote", "local"]);
});

test("aynı id ile kayıt sağlayıcıyı değiştirir, ikinci kopya oluşturmaz", () => {
  providerRegistry.reset([stubProvider("remote", "remote")]);
  providerRegistry.register(stubProvider("remote", "remote", { categories: ["motivation"] }));
  assert.equal(providerRegistry.list().length, 1);
  assert.deepEqual(providerRegistry.get("remote").categories, ["motivation"]);
});

test("son çare sağlayıcı zincirin SONUNA konur, önce gerçek model denenir", async () => {
  // Serbest sohbette şablon yanıt veren yerel sağlayıcı öne geçerse her
  // kullanıcı her soruda şablon cevap alır; koç işe yaramaz hale gelir.
  const local = { ...stubProvider("local", "local"), categories: ["motivation"], lastResortCategories: ["conversation"] };
  providerRegistry.reset([local, stubProvider("remote", "remote")]);

  const chain = await selectProviders({ category: "conversation" }, {}, false);
  assert.deepEqual(chain.map((provider) => provider.id), ["remote", "local"]);

  const response = await routeText({ category: "conversation", prompt: "merhaba" }, SILENT);
  assert.equal(response.provider, "remote", "gerçek model çalışırken son çareye düşülmemeli");
});

test("uzak sağlayıcı çökerse son çare yerel sağlayıcı kullanıcıyı yanıtsız bırakmaz", async () => {
  const local = { ...stubProvider("local", "local"), categories: ["motivation"], lastResortCategories: ["conversation"] };
  providerRegistry.reset([local, stubProvider("remote", "remote", { throws: new Error("500 internal server") })]);

  const response = await routeText({ category: "conversation", prompt: "merhaba" }, SILENT);
  assert.equal(response.provider, "local");
  assert.equal(response.fallbackUsed, true);
});

test("basit koçlukta da Automatic sırası yerel → uzak → deterministiktir", async () => {
  const deterministic = {
    ...stubProvider("local-deterministic", "local"),
    categories: [],
    lastResortCategories: ["simple_coaching"],
  };
  providerRegistry.reset([
    stubProvider("on-device", "local", { throws: new Error("native runtime failure") }),
    deterministic,
    stubProvider("remote", "remote"),
  ]);

  const chain = await selectProviders(request, {}, false);
  assert.deepEqual(chain.map((provider) => provider.id), ["on-device", "remote", "local-deterministic"]);
  const response = await routeText(request, SILENT);
  assert.equal(response.provider, "remote");
  assert.equal(response.fallbackUsed, true);
});

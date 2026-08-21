import test from "node:test";
import assert from "node:assert/strict";
import { openAiCompatibleProvider } from "../lib/ai/providers/openai-compatible.ts";

// Sağlayıcının kabul etmediği parametreleri PAZARLIKLA bırakma davranışı.
//
// Bu dosyanın varlık sebebi sahada çıkan gerçek bir arıza: üretimdeki model
// `kimi-k2.7-code-highspeed`, isteğe eklenen `thinking: { type: "disabled" }`
// yüzünden HER çağrıyı 392 ms'de reddediyordu
// ("invalid thinking: only type=enabled is allowed for this model").
// Router bunu normal bir yedeklemeye çevirdiği için hata hiçbir yerde
// görünmüyordu; kullanıcı yalnızca "Fit Koç şu an sınırlı modda yanıt
// veriyor." şablonlarını görüyordu. Yani koç haftalarca hiç LLM kullanmadı.

const ENV_KEYS = ["AI_API_KEY", "AI_MODEL", "AI_PROVIDER_NAME", "AI_BASE_URL"];
let saved;

test.beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.AI_API_KEY = "test-key";
  process.env.AI_MODEL = "kimi-k2.7-code-highspeed";
  process.env.AI_PROVIDER_NAME = "moonshot";
  process.env.AI_BASE_URL = "https://api.example.test/v1";
});

test.afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  delete globalThis.fetch.__stub;
});

/** İstek gövdelerini kaydeden, sırayla verilen yanıtları döndüren fetch. */
function stubFetch(responses) {
  const bodies = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    const next = responses[Math.min(bodies.length - 1, responses.length - 1)];
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { "Content-Type": "application/json" },
    });
  };
  globalThis.fetch.__stub = original;
  return bodies;
}

const THINKING_REJECTED = {
  status: 400,
  body: { error: { message: "invalid thinking: only type=enabled is allowed for this model", type: "invalid_request_error" } },
};

const OK_ANSWER = {
  status: 200,
  body: {
    id: "x", object: "chat.completion", created: 1, model: "kimi-k2.7-code-highspeed",
    choices: [{ index: 0, message: { role: "assistant", content: "Günde 160-220 gram protein hedefle." }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
  },
};

test("düşünmeyi kapatmayı reddeden model için istek THINKING'SİZ tekrarlanır", async () => {
  const bodies = stubFetch([THINKING_REJECTED, OK_ANSWER]);

  const result = await openAiCompatibleProvider.generateText({
    category: "conversation",
    system: "Sen Fit Koç'sun.",
    messages: [{ role: "user", text: "Protein hedefim ne olmalı?" }],
    maxOutputTokens: 500,
  });

  assert.equal(result.text, "Günde 160-220 gram protein hedefle.", "ikinci deneme kullanıcıya ulaşmalı");
  assert.equal(bodies.length, 2, "tam olarak bir kez yeniden denenmeli");

  // İlk deneme: quirk uygulanmış (düşünme kapalı, küçük token tabanı).
  assert.ok(JSON.stringify(bodies[0]).includes("disabled"), "ilk deneme düşünmeyi kapatmayı denemeli");

  // İkinci deneme: düşünme seçeneği DÜŞÜRÜLMÜŞ olmalı.
  assert.ok(!JSON.stringify(bodies[1]).includes("disabled"), "ikinci denemede thinking gönderilmemeli");
});

test("düşünme açık kalınca token tabanı da YÜKSELİR", async () => {
  // İki ayar birlikte değişmek zorunda: düşünen model, küçük bütçeyi düşünmeye
  // harcayıp asıl içeriğe sıra bırakmadan sessizce BOŞ metin döndürür. Token
  // tabanı yükseltilmezse hata görünmez ama yanıt boş gelir ve router yine
  // şablona düşer — yani arıza aynı yerden, başka kılıkta geri gelir.
  const bodies = stubFetch([THINKING_REJECTED, OK_ANSWER]);

  await openAiCompatibleProvider.generateText({
    category: "conversation",
    messages: [{ role: "user", text: "merhaba" }],
    maxOutputTokens: 500,
  });

  const tokensOf = (body) => body.max_tokens ?? body.max_completion_tokens;
  assert.equal(tokensOf(bodies[0]), 500, "düşünme kapalıyken route'un bütçesi yeterli");
  assert.ok(tokensOf(bodies[1]) >= 4_000, `düşünme açıkken taban yükselmeli, gelen: ${tokensOf(bodies[1])}`);
});

test("ilgisiz bir sağlayıcı hatası YENİDEN DENENMEZ, yukarı fırlatılır", async () => {
  // Yeniden deneme yalnız "bu parametreyi kabul etmiyorum" hataları için.
  // Kota veya kimlik hatasında tekrar denemek gecikme ve maliyet ekler.
  const bodies = stubFetch([{ status: 401, body: { error: { message: "invalid api key", type: "authentication_error" } } }]);

  await assert.rejects(() => openAiCompatibleProvider.generateText({
    category: "conversation",
    messages: [{ role: "user", text: "merhaba" }],
    maxOutputTokens: 500,
  }));
  assert.equal(bodies.length, 1, "kimlik hatası için pazarlık yapılmamalı");
});

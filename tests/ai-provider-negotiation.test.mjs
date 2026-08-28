import test from "node:test";
import assert from "node:assert/strict";
import { openAiCompatibleProvider } from "../lib/ai/providers/openai-compatible.ts";

const ENV_KEYS = ["OPENAI_API_KEY", "OPENAI_MODEL_STANDARD"];
let saved;

test.beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL_STANDARD = "gpt-5.6-terra";
});

test.afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  if (globalThis.fetch.__stub) globalThis.fetch = globalThis.fetch.__stub;
});

function response(text) {
  return {
    id: "resp_test", created_at: 1, model: "gpt-5.6-terra",
    output: [{ type: "message", role: "assistant", id: "msg_test", content: [{ type: "output_text", text, annotations: [] }] }],
    usage: { input_tokens: 10, output_tokens: 8 },
  };
}

function stubFetch(responses) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    return Response.json(next.body, { status: next.status });
  };
  globalThis.fetch.__stub = original;
  return calls;
}

test("GPT-5.6 çağrısı Responses API, düşük reasoning ve çıktı bütçesi kullanır", async () => {
  const calls = stubFetch([{ status: 200, body: response("Günde 160-220 gram protein hedefle.") }]);
  const result = await openAiCompatibleProvider.generateText({
    category: "conversation",
    system: "Sen Fit Koç'sun.",
    messages: [{ role: "user", text: "Protein hedefim ne olmalı?" }],
    maxOutputTokens: 500,
  });

  assert.equal(result.text, "Günde 160-220 gram protein hedefle.");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/v1\/responses$/);
  assert.equal(calls[0].body.model, "gpt-5.6-terra");
  assert.equal(calls[0].body.reasoning.effort, "low");
  assert.equal(calls[0].body.text.verbosity, "low");
  assert.equal(calls[0].body.max_output_tokens, 500);
});

test("GPT-5.6 isteğinde desteklenmeyen sıcaklık gönderilmez", async () => {
  const calls = stubFetch([{ status: 200, body: response("Tamam") }]);
  const result = await openAiCompatibleProvider.generateText({ category: "conversation", prompt: "merhaba", temperature: 0.2 });
  assert.equal(result.text, "Tamam");
  assert.equal(calls.length, 1);
  assert.ok(!("temperature" in calls[0].body));
});

test("kimlik hatası yeniden denenmez", async () => {
  const calls = stubFetch([{ status: 401, body: { error: { message: "invalid api key", type: "authentication_error" } } }]);
  await assert.rejects(() => openAiCompatibleProvider.generateText({ category: "conversation", prompt: "merhaba" }));
  assert.equal(calls.length, 1);
});

import assert from "node:assert/strict";
import test from "node:test";

// Gerçek derlenmiş Worker'ı çalıştırıp uçtan uca davranışı sınar (rendered-html.test.mjs'teki
// dispatch() ile aynı desen). npm test önce `npm run build` çalıştırdığı için dist/server/index.js
// güncel kalır; bu dosyayı doğrudan `node --test` ile çalıştırıyorsan önce `npm run build` gerekir.
async function dispatch(request, env = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    request,
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, ...env },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

const PROJECT_REF_HEADER = { "x-supabase-project-ref": "dqhsrabrbizwapkawmnf" };
const REJECTED_STATUSES = new Set([403, 404]); // allowlist/bilinmeyen proje reddi

// worker/supabase-proxy.ts: allowlist bypass — %2e%2e yol geçişi.
//
// ÖNEMLİ BULGU (bu testler yazılırken ortaya çıktı): WHATWG URL ayrıştırıcısı
// (new URL()), pathname'i okurken ".."/"%2e%2e" segmentlerini RFC 3986 "remove
// dot segments" algoritmasına göre ZATEN çözüyor — kodlanmış olsun ya da
// olmasın. Yani `incomingUrl.pathname` bu koda ulaştığında olası bir "../"
// dizisi zaten normalize edilmiş oluyor; worker/supabase-proxy.ts'teki
// decodedPathname kontrolü bu yüzden PRATİKTE hiç tetiklenmiyor (aşağıdaki
// "edge case" testi bunu kanıtlıyor: 401 dönüyor, yani istek allowlist'i
// GEÇİP gerçek Supabase'e ulaşıyor — decode edip "%2e%2e" gördüğü için değil,
// path zaten "rest/v1/profiles"a normalize olduğu için). Kontrol yine de
// zararsız bir savunma katmanı olarak kalıyor (bkz. üçüncü test: kodlanmamış
// "../" ile allowlist DIŞINA çıkma denemesi de normalize sonrası 404 alıyor).
// Bu iki test allowlist'i GEÇEN istekleri sınıyor; geçtikten sonra kod gerçek
// Supabase'e fetch atar. Canlı ağa bağımlı kalmamak için global fetch'i taklit
// ediyoruz — yalnız isteğin doğru (normalize edilmiş) hedefe gittiğini
// doğrulamak yeterli, gerçek bir yanıt gerekmiyor.
function withUpstreamFetchSpy() {
  const calls = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  return { calls, restore: () => { globalThis.fetch = previousFetch; } };
}

test("supabase-proxy: normal durum — izinli bir uç nokta allowlist'i geçer", async () => {
  const spy = withUpstreamFetchSpy();
  try {
    const response = await dispatch(new Request("http://localhost/api/supabase-proxy/rest/v1/profiles", {
      headers: PROJECT_REF_HEADER,
    }));
    assert.ok(!REJECTED_STATUSES.has(response.status), `beklenmedik ret: ${response.status}`);
    assert.ok(spy.calls.some((url) => url === "https://dqhsrabrbizwapkawmnf.supabase.co/rest/v1/profiles"));
  } finally {
    spy.restore();
  }
});

test("supabase-proxy: edge case — %2e%2e ile kodlanmış yol geçişi de, çözüldükten sonra hâlâ izinli bir uca düşer", async () => {
  const spy = withUpstreamFetchSpy();
  try {
    const response = await dispatch(new Request(
      "http://localhost/api/supabase-proxy/auth/v1/%2e%2e/%2e%2e/rest/v1/profiles",
      { headers: PROJECT_REF_HEADER },
    ));
    // new URL() bu path'i "/api/supabase-proxy/rest/v1/profiles"a normalize
    // ediyor (yukarıdaki not) — allowlist içinde kalıyor, proxy prefix'inin
    // DIŞINA çıkamıyor. Reddedilmemesi güvenlik açığı değil: normalize sonrası
    // yol hâlâ ALLOWED_PREFIXES içinde, upstream isteği de bunu kanıtlıyor.
    assert.ok(!REJECTED_STATUSES.has(response.status), `beklenmedik ret: ${response.status}`);
    assert.ok(spy.calls.some((url) => url === "https://dqhsrabrbizwapkawmnf.supabase.co/rest/v1/profiles"));
  } finally {
    spy.restore();
  }
});

test("supabase-proxy: hatalı input — kodlanmamış '../' ile allowlist dışına (pg/) çıkma denemesi reddedilir", async () => {
  const response = await dispatch(new Request(
    "http://localhost/api/supabase-proxy/auth/v1/../../pg/query",
    { headers: PROJECT_REF_HEADER },
  ));
  // Normalize sonrası pathname "/api/supabase-proxy/pg/query" olur — "pg/"
  // ALLOWED_PREFIXES'te yok, 404 beklenir.
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Unsupported Supabase endpoint." });
});

test("supabase-proxy: hatalı input — bozuk yüzde kodlaması (%) Worker'ı çökertmeden reddedilir", async () => {
  // decodeURIComponent("%") RangeError/URIError fırlatır; safeDecodeURIComponent
  // bunu yutup null döndürmeli. new URL() bu geçersiz kodlamayı pathname'e
  // olduğu gibi bırakır (normalize edemez), bu yüzden burada gerçekten
  // decodedPathname kontrolü devreye girer.
  const response = await dispatch(new Request(
    "http://localhost/api/supabase-proxy/rest/v1/%",
    { headers: PROJECT_REF_HEADER },
  ));
  assert.equal(response.status, 404);
});

test("supabase-proxy: hatalı input — bilinmeyen proje referansı her zaman reddedilir", async () => {
  const response = await dispatch(new Request("http://localhost/api/supabase-proxy/rest/v1/profiles", {
    headers: { "x-supabase-project-ref": "baska-bir-proje" },
  }));
  assert.equal(response.status, 403);
});

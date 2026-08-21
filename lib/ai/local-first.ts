// İSTEMCİ TARAFI yerel-öncelikli koç yolu.
//
// NEDEN VAR: Hedefit'in AI rotaları Cloudflare Worker'da (`runtime = "edge"`)
// çalışır. Cihaz üstü model ise kullanıcının TELEFONUNDA, Capacitor
// WebView'ına enjekte edilen `HedefitLocalAI` köprüsünün arkasındadır. Worker
// o köprüyü ASLA göremez — dolayısıyla yönlendirici sunucuda çalıştığı sürece
// cihaz üstü sağlayıcı hiçbir zaman seçilemez ve her istek uzak sağlayıcıya
// gider. Bu modül o boşluğu kapatır: aynı boru hattını İSTEMCİDE çalıştırır.
//
// Sunucudaki akışla AYNI parçalar kullanılır — ikinci bir "koç mantığı"
// yazmıyoruz:
//
//   sanitizeCoachSignals → analyze → evaluateSafety → buildCoachContext
//   → contextToSystemPrompt → (cihaz üstü model)
//
// Yalnız hafıza sunucudan okunur (Supabase erişimi istemcide yok); o da
// mevcut /api/ai/memory uç noktasıyla.
//
// GİZLİLİK KAZANCI: bu yol seçildiğinde kullanıcının istemi ve yanıtı
// cihazdan HİÇ çıkmaz — uzak sağlayıcıya da, Hedefit sunucusuna da gitmez.

import { analyze } from "./intelligence.ts";
import { buildCoachContext, contextToSystemPrompt } from "./context-builder.ts";
import { evaluateSafety } from "./safety.ts";
import { enforceOutputSafety } from "./safety.ts";
import { isTurkishOutputUsable } from "./turkish.ts";
import { sanitizeCoachSignals } from "./signals.ts";
import { AI_COACH_PROMPT_VERSION } from "./prompts.ts";
import { fitLocalPrompt } from "./providers/on-device.ts";
import { LOCAL_MAX_OUTPUT_TOKENS, LOCAL_GENERATION_TIMEOUT_MS, LOCAL_TEMPERATURE, localCapableCategories } from "./local-policy.ts";
import { localAiPlugin, readNativeCapabilities } from "./local-bridge.ts";
import type { UserMemory } from "./memory.ts";
import type { AiMessage, AiTaskCategory } from "./types.ts";

/**
 * Akış sırasında biriken metnin bozulup bozulmadığı.
 *
 * İki ayrıntı önemli:
 *
 *   · SON KELİME ATILIR. Akışın ortasında son kelime henüz yarımdır
 *     ("yüzme" daha "yüz" iken); yarım kelime ses dizimi denetiminden
 *     kalabilir ve sağlam bir yanıtı boşuna iptal ettirirdi.
 *   · EN AZ 12 TAM KELİME beklenir. Denetim orana bakıyor; üç kelimelik bir
 *     parçada tek bir şüpheli kelime oranı hemen eşiğin üstüne çıkarır.
 */
function looksGarbledSoFar(partial: string): boolean {
  const lastBreak = partial.lastIndexOf(" ");
  if (lastBreak < 0) return false;
  const complete = partial.slice(0, lastBreak);
  if (complete.split(/\s+/).filter(Boolean).length < 12) return false;
  return !isTurkishOutputUsable(complete);
}

/** Akış sırasında biriken metni bildirir; arayüz kısmi yanıtı gösterebilir. */
export type TokenSink = (partialText: string) => void;

export type LocalFirstResult = {
  text: string;
  /** "safety" = güvenlik katmanı yanıtladı, model çağrılmadı. */
  source: "local" | "safety";
  provider: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
  blockedReason?: string;
};

/**
 * Cihaz üstü modelin şu anda bu iş için kullanılabilir olup olmadığı.
 *
 * Tarayıcıda ve köprüsü olmayan platformlarda sessizce `false` döner —
 * çağıran taraf sunucu rotasına düşer, kullanıcı bir fark görmez.
 */
export async function canServeLocally(category: AiTaskCategory): Promise<boolean> {
  if (!localAiPlugin()) return false;
  if (localChatDisabled()) return false;
  if (!isLocalCategoryAllowed(category)) return false;
  const capability = await readNativeCapabilities();
  if (!capability.supported || capability.state !== "MODEL_READY") return false;
  // KAPI 2 — model bayrağı. Koç sohbetinin çıktısı kullanıcıya olduğu gibi
  // gösterilir; bunu ancak Türkçesi yeterli ölçülmüş bir model yapabilir.
  // Diğer kategoriler (özet, motivasyon) bu yolu kullanmıyor ama ileride
  // kullanırlarsa aynı kapıdan geçmeleri doğru olur.
  return capability.chatReady !== false;
}

/**
 * Yeniden derlemeden kapatma anahtarı.
 *
 * Cihazda bir sorun çıkarsa yerel yolu kapatmanın yolu:
 *
 *   localStorage.setItem("hedefit.localAiChat", "0")
 *
 * Bilerek ortam değişkeni DEĞİL: `process.env` istemci paketinde derleme
 * anında sabitlenir, yani telefondaki bir davranışı kapatmak için yeni sürüm
 * gerekirdi. Varsayılan (anahtar hiç yokken) AÇIK'tır; karar native taraftaki
 * `chatReady` bayrağına bırakılır.
 */
function localChatDisabled(): boolean {
  try {
    return globalThis.localStorage?.getItem("hedefit.localAiChat") === "0";
  } catch {
    // Depolama kapalıysa (gizli mod, katı çerez ayarı) kapatma isteği yok sayılır.
    return false;
  }
}

function isLocalCategoryAllowed(category: AiTaskCategory): boolean {
  try {
    return localCapableCategories().includes(category);
  } catch {
    // `localCapableCategories` `process.env` okur; tarayıcı paketinde `process`
    // hiç tanımlı olmayabilir. Burada patlamak, sunucuya düşmek yerine
    // kullanıcıya hata göstermek olurdu.
    return false;
  }
}

/**
 * Yalnız göreli yol alan bir getirici. `typeof fetch` KULLANILMAZ: uygulamanın
 * kendi `authorizedFetch`'i (oturum jetonunu ekleyen sarmalayıcı) yalnız
 * `string` kabul ediyor ve daha geniş bir imzaya atanamıyor.
 */
type PathFetcher = (path: string, init?: RequestInit) => Promise<Response>;

/** Kullanıcının kalıcı tercihlerini sunucudan okur. Başarısızlık sohbeti durdurmaz. */
async function loadMemoriesFromApi(fetcher: PathFetcher): Promise<UserMemory[]> {
  try {
    const response = await fetcher("/api/ai/memory", { method: "GET" });
    if (!response.ok) return [];
    const payload = await response.json() as { memories?: UserMemory[] };
    return Array.isArray(payload.memories) ? payload.memories : [];
  } catch {
    return [];
  }
}

/**
 * Koç yanıtını CİHAZDA üretir.
 *
 * @returns Yerel yol kullanılamıyorsa `null` — çağıran taraf sunucuya düşer.
 *   Hata FIRLATMAZ: yerel tarafta beklenmedik bir sorun olması kullanıcıya
 *   hata göstermek için sebep değil, sunucuya düşmek için sebeptir.
 */
export async function generateLocalCoachResponse(input: {
  messages: AiMessage[];
  locale?: "tr" | "en";
  signals?: unknown;
  category?: AiTaskCategory;
  fetcher?: PathFetcher;
  /**
   * Verilirse token akışı açılır ve her parçada BİRİKMİŞ metinle çağrılır.
   *
   * Neden önemli: ölçülen medyan toplam süre 26,4 sn (Gemma, SM-A525F) ama
   * ilk token 4,4 sn'de geliyor. Akış olmadan kullanıcı 26 saniye boş ekrana
   * bakıyor; akışla yanıt 4 saniyede görünmeye başlıyor. Model aynı hızda
   * üretiyor — değişen tek şey beklemenin GÖRÜNÜR olması.
   */
  onToken?: TokenSink;
}): Promise<LocalFirstResult | null> {
  const category = input.category ?? "conversation";
  if (!(await canServeLocally(category))) return null;

  const plugin = localAiPlugin();
  if (!plugin) return null;

  const locale = input.locale === "en" ? "en" : "tr";
  const question = input.messages.at(-1)?.text || "";
  if (!question.trim()) return null;

  // Güvenlik katmanı modelden ÖNCE — sunucudaki sırayla aynı. Acil bir
  // belirtide cihazdaki model de çalıştırılmaz.
  const safety = evaluateSafety(question, locale);
  if (safety.blocked) {
    return {
      text: safety.response,
      source: "safety",
      provider: "safety-layer",
      model: "rule-based",
      promptVersion: AI_COACH_PROMPT_VERSION,
      latencyMs: 0,
      blockedReason: safety.reason,
    };
  }

  const facts = analyze(sanitizeCoachSignals(input.signals));
  const memories = await loadMemoriesFromApi(input.fetcher ?? fetch);
  const context = await buildCoachContext({ facts, memories, messages: input.messages, locale });
  // compact: cihaz üstü modelde kısa üslup + bilgi bölümü yok (bkz. prompts.ts)
  const systemPrompt = contextToSystemPrompt(context, { locale, compact: true });

  const startedAt = Date.now();
  const streaming = Boolean(input.onToken);
  // Akış sırasında bozulma yakalandı mı; yakalandıysa sonuç kullanılmaz.
  let garbled = false;
  const requestId = streaming ? `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : "";
  let listener: { remove: () => Promise<void> } | undefined;

  try {
    if (streaming) {
      let accumulated = "";
      listener = await plugin.addListener("localAiToken", (data) => {
        // Aynı anda tek üretim var ama yine de kimlikle filtreliyoruz:
        // iptal edilmiş bir önceki üretimin geç gelen parçası yeni yanıta
        // karışmamalı.
        if (data.requestId !== requestId) return;
        if (garbled) return;
        const chunk = typeof data.chunk === "string" ? data.chunk : "";
        if (!chunk) return;
        accumulated += chunk;

        // KAPI 3 AKIŞTA DA GEÇERLİ. Sondaki denetim tek başına yetmez: akış
        // açıkken metin ÜRETİLDİKÇE ekrana basılıyor, yani yanıtı en sonda
        // reddetsek bile kullanıcı bozuk kelimeleri çoktan görmüş olurdu.
        // Bozulma anlaşılır anlaşılmaz üretim durdurulur, ekran temizlenir ve
        // sunucuya düşülür — kullanıcı yalnız bir "düşünüyor" göstergesi görür.
        if (locale === "tr" && looksGarbledSoFar(accumulated)) {
          garbled = true;
          input.onToken?.("");
          // Üretimi bırakmak pil ve ısı da kazandırır; zaten atılacak token
          // üretmenin anlamı yok.
          void plugin.cancelGeneration().catch(() => {});
          return;
        }
        input.onToken?.(accumulated);
      });
    }

    const result = await plugin.generate({
      systemPrompt: fitLocalPrompt(systemPrompt),
      userPrompt: fitLocalPrompt(question, 2_000),
      maxOutputTokens: LOCAL_MAX_OUTPUT_TOKENS,
      temperature: LOCAL_TEMPERATURE,
      timeoutMs: LOCAL_GENERATION_TIMEOUT_MS,
      stream: streaming,
      ...(streaming ? { requestId } : {}),
    });
    const text = enforceOutputSafety((result.text || "").trim(), locale);
    // Boş yanıt bir başarı değildir; sunucuya düşmek daha iyi.
    if (!text) return null;
    // KAPI 3 — son savunma. Model onaylı olsa bile TEK BİR üretim bozulabilir
    // (uzun bağlam, termal kısıtlama, talihsiz örnekleme). Bozuk Türkçeyi
    // kullanıcıya göstermektense sunucuya düşmek her zaman daha iyi: kullanıcı
    // yalnız birkaç saniye fazla bekler, bozuk bir yanıt ise güveni bitirir.
    if (garbled || (locale === "tr" && !isTurkishOutputUsable(text))) return null;
    return {
      text,
      source: "local",
      provider: "on-device-litertlm",
      model: result.modelId,
      promptVersion: AI_COACH_PROMPT_VERSION,
      latencyMs: result.totalMs ?? Date.now() - startedAt,
    };
  } catch {
    // Kullanıcı iptali dahil her hata "sunucuya düş" anlamına gelir. İptalde
    // çağıran taraf isteği zaten kendi AbortController'ıyla durdurur.
    return null;
  } finally {
    await listener?.remove().catch(() => {});
  }
}

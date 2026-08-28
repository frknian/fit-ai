// Sunucu tarafındaki OpenAI sağlayıcısı. Anahtar sadece Workers ortamında tutulur.

import { createOpenAI } from "@ai-sdk/openai";
import { asSchema, generateObject, generateText } from "ai";
import { toModelMessages, type AIProvider, type AiObjectRequest, type AiObjectResponse, type AiRequest, type AiResponse, type ImageInput } from "../types.ts";
import { modelForTask } from "../models.ts";

const MIN_OUTPUT_TOKENS = 256;

// Ortam değişkenleri modül yüklenirken DEĞİL, her çağrıda okunur — testlerde
// (ve bazı edge çalışma zamanlarında) modül bir kez yüklenip önbelleğe alınır.
export function remoteApiKey() {
  // OPENAI_API_KEY is canonical. AI_API_KEY remains a read-only compatibility
  // alias so existing Workers can roll forward without an outage.
  return process.env.OPENAI_API_KEY || process.env.AI_API_KEY || "";
}

/**
 * "UZAK sağlayıcı yapılandırıldı mı?"
 *
 * Anahtar yoksa bulut AI çağrısı başlatılmaz.
 */
export function hasRemoteProvider() {
  return Boolean(remoteApiKey());
}

export function remoteModelId() {
  return modelForTask("conversation");
}

function languageModel(modelId: string) {
  const provider = createOpenAI({
    apiKey: remoteApiKey(),
    headers: {
      "X-Client-Name": "Hedefit",
    },
  });
  // Official OpenAI provider defaults to the Responses API. Keeping this
  // explicit prevents a future SDK default from silently moving Hedefit back
  // to the legacy Chat Completions wire format.
  return provider.responses(modelId);
}

function userContent(text: string, image?: ImageInput) {
  if (!image) return text;
  return [
    { type: "text" as const, text },
    { type: "file" as const, data: image.base64, mediaType: image.mimeType },
  ];
}

// Şemayı sistem mesajında da açıkça taşımak, Responses API'nin strict
// structured-output doğrulamasına ek bir semantik yönlendirme sağlar.
async function withSchemaInSystemPrompt(system: string | undefined, schema: Parameters<typeof asSchema>[0]) {
  const jsonSchema = await asSchema(schema).jsonSchema;
  const instruction = `Yanıtını AŞAĞIDAKİ JSON şemasına harfiyen uyacak şekilde, tam olarak bu alan adlarıyla ver (başka alan uydurma, eksik bırakma):\n${JSON.stringify(jsonSchema)}`;
  return system ? `${system}\n\n${instruction}` : instruction;
}

function outputTokens(request: AiRequest) {
  return Math.max(request.maxOutputTokens ?? 0, request.minimumOutputTokens ?? MIN_OUTPUT_TOKENS);
}

/**
 * Sağlayıcıya özgü tuhaflıklar SADECE burada.
 *
 * Moonshot'ın Kimi K2 ailesi, kapatılabilir bir "thinking" bütçesi tüketir;
 * kapatılmazsa kısa çıktı isteyen çağrılarda (ör. tek bir besin tahmini) asıl
 * içeriğe sıra kalmadan boş sonuç döner. Bu ayar önceden alan modülünde
 * (lib/ai-nutrition-estimator.ts) duruyordu — yani bir BESLENME modülü
 * sağlayıcının adını ve model ailesini bilmek zorundaydı. Sağlayıcı
 * değiştiğinde o dosyanın da düzenlenmesi gerekirdi; tam olarak göçün
 * kaldırmayı hedeflediği bağımlılık. Artık alan modülleri yalnızca "kısa ve
 * yapılandırılmış çıktı istiyorum" der, nasıl elde edileceği buranın işidir.
 */
export const openAiCompatibleProvider: AIProvider = {
  id: "openai-compatible",
  kind: "remote",

  // Anahtar yoksa sağlayıcı yok sayılır; router bir sonrakine geçer. Ağ
  // yoklaması YAPMIYORUZ: her istekte fazladan bir round trip, edge
  // çalışma zamanında gecikmeyi ikiye katlardı. Gerçek erişilebilirlik
  // isteğin kendisinde ölçülür, hata router'da yedeklemeyi tetikler.
  async isAvailable() {
    return Boolean(remoteApiKey());
  },

  async generateText(request: AiRequest): Promise<AiResponse> {
    const model = request.model || modelForTask(request.category);
    const startedAt = Date.now();
    const result = await generateText({
        model: languageModel(model),
        // TEK DENEME. AI SDK varsayılanı 2 yeniden deneme (3 tam istek) ve bu,
        // sağlayıcı hız sınırıyla birleştiğinde AKTİF OLARAK ZARARLI:
        // sağlayıcının saydığı şey İSTEK, dolayısıyla tek bir kullanıcı sorusu
        // dakikalık kotanın üç katını harcıyor. Denemeler saniyeler içinde
        // ardışık geldiği için üçü de aynı sınıra çarpıyor — yani yeniden
        // deneme hiçbir şey kurtarmıyor, yalnızca kotayı tüketip sonraki
        // soruları da başarısız kılıyor.
        //
        // Ölçüm (org RPM 3): 4 arka arkaya soru → 1 başarılı, 3 başarısız.
        // Tek denemeyle aynı kota 3 soruya yeter.
        //
        // Gerçek hata zaten kaybolmuyor: router uzak sağlayıcı başarısız
        // olduğunda deterministik yedeğe düşüyor (bkz. lib/ai/router.ts).
        // generateObject aynı gerekçeyle zaten tek deneme kullanıyor.
        maxRetries: 0,
        system: request.system,
        ...(request.messages?.length
          ? { messages: toModelMessages(request.messages) }
          : { prompt: [{ role: "user" as const, content: userContent(request.prompt ?? "", request.image) }] }),
        maxOutputTokens: outputTokens(request),
        // GPT-5.6 reasoning models do not accept temperature. Output behavior
        // is controlled with reasoning.effort and text.verbosity instead.
        temperature: undefined,
        // GPT-5.6'da düşük düşünme bütçesi hem yanıtın görünür kısmına alan
        // bırakır hem de Fit Koç'un kısa sorularda beklemesini azaltır.
        providerOptions: {
          ...request.providerOptions,
          openai: {
            ...(request.providerOptions?.openai as Record<string, unknown> | undefined),
            reasoningEffort: "low",
            textVerbosity: "low",
          },
        },
        abortSignal: request.abortSignal,
    });
    return {
      text: result.text,
      provider: openAiCompatibleProvider.id,
      model,
      latencyMs: Date.now() - startedAt,
      usage: { inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens },
    };
  },

  async generateObject<T>(request: AiObjectRequest<T>): Promise<AiObjectResponse<T>> {
    const model = request.model || modelForTask(request.category);
    const system = await withSchemaInSystemPrompt(request.system, request.schema);
    const startedAt = Date.now();
    const result = await generateObject({
        model: languageModel(model),
        // AI SDK varsayılanı 2 yeniden deneme, yani 3 tam üretim. Bu sağlayıcının
        // akıl yürüten modellerinde tek üretim ~90 sn sürüyor; üç katı her zaman
        // zaman aşımına düşüyordu. Tek deneme, verilen bütçenin tamamını kullanır.
        maxRetries: 0,
        system,
        prompt: [{ role: "user", content: userContent(request.prompt, request.image) }],
        schema: request.schema,
        maxOutputTokens: outputTokens(request),
        temperature: undefined,
        providerOptions: {
          ...request.providerOptions,
          openai: {
            ...(request.providerOptions?.openai as Record<string, unknown> | undefined),
            reasoningEffort: "low",
            textVerbosity: "low",
          },
        },
        abortSignal: request.abortSignal,
    });
    return {
      object: result.object,
      provider: openAiCompatibleProvider.id,
      model,
      latencyMs: Date.now() - startedAt,
      usage: { inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens },
    };
  },
};

// Bir data URL'sini ("data:image/jpeg;base64,...") ImageInput'a çevirir.
// Tüm route'lar aynı doğrulamayı tekrarlamasın diye burada.
export function parseImageDataUrl(dataUrl: string): ImageInput | null {
  const match = dataUrl.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  if (!match || match[2].length > 7_000_000) return null;
  return { mimeType: match[1], base64: match[2] };
}

// AI Coach Service — Hedefit'in AI'ya açılan TEK kapısı.
//
// Rotalar ve bileşenler buradaki fonksiyonları çağırır; hangi sağlayıcının
// hangi bulut modelinin yanıt verdiğini bilmezler.
//
// Akış:
//   deterministik gerçekler → hafıza → bilgi getirimi → bağlam bütçesi
//   → güvenlik → router → çıktı güvenliği → hafıza çıkarımı
//
// Güvenlik katmanı router'dan ÖNCE gelir: acil bir durumda modele hiç
// gidilmez (hem doğru yanıt garanti edilir hem ücretli çağrı yapılmaz).

import { jsonSchema } from "ai";
import { buildCoachContext, buildTaskContext, contextToSystemPrompt } from "./context-builder.ts";
import { AiAllProvidersFailedError } from "./errors.ts";
import { analyze, type CoachFacts, type IntelligenceInput } from "./intelligence.ts";
import { MEMORY_EXTRACTION_PROMPT, AI_COACH_PROMPT_VERSION, buildTaskSystemPrompt } from "./prompts.ts";
import { MEMORY_TYPES, sanitizeMemory, type UserMemory } from "./memory.ts";
import { routeObject, routeText, type RoutingPolicy } from "./router.ts";
import { formatKnowledge } from "./knowledge.ts";
import { formatMemories, type UserMemory as Memory } from "./memory.ts";
import { enforceOutputSafety, evaluateSafety } from "./safety.ts";
import type { AiMessage, AiObjectRequest, AiTaskCategory, ImageInput } from "./types.ts";

export type CoachRequest = {
  messages: AiMessage[];
  locale?: "tr" | "en";
  /** Ham kullanıcı verisi; deterministik motor bunu gerçeklere çevirir. */
  signals?: IntelligenceInput;
  memories?: UserMemory[];
  category?: AiTaskCategory;
  policy?: RoutingPolicy;
  maxOutputTokens?: number;
  temperature?: number;
  abortSignal?: AbortSignal;
};

export type CoachResult = {
  text: string;
  /** "ai" = bir model üretti, "safety" = güvenlik katmanı yanıtladı. */
  source: "ai" | "safety";
  provider: string;
  model: string;
  promptVersion: string;
  fallbackUsed: boolean;
  latencyMs: number;
  facts: CoachFacts;
  blockedReason?: string;
};

/**
 * Kullanıcıya gösterilecek yanıt. HER ZAMAN bir sonuç döner ya da
 * `AiAllProvidersFailedError` fırlatır — çağıran rota bunu nazik bir mesaja
 * çevirir; ham sağlayıcı hatası hiçbir zaman kullanıcıya ulaşmaz.
 */
export async function generateCoachResponse(request: CoachRequest): Promise<CoachResult> {
  const locale = request.locale === "en" ? "en" : "tr";
  const facts = analyze(request.signals ?? {});
  const question = request.messages.at(-1)?.text || "";

  const safety = evaluateSafety(question, locale);
  if (safety.blocked) {
    return {
      text: safety.response,
      source: "safety",
      provider: "safety-layer",
      model: "rule-based",
      promptVersion: AI_COACH_PROMPT_VERSION,
      fallbackUsed: false,
      latencyMs: 0,
      facts,
      blockedReason: safety.reason,
    };
  }

  const context = await buildCoachContext({
    facts,
    memories: request.memories,
    messages: request.messages,
    locale,
  });

  const response = await routeText({
    category: request.category ?? "conversation",
    system: contextToSystemPrompt(context, { locale, safetyInstruction: safety.extraInstruction }),
    messages: context.recentMessages,
    locale,
    facts,
    temperature: request.temperature ?? 0.35,
    maxOutputTokens: request.maxOutputTokens ?? 500,
    abortSignal: request.abortSignal,
  }, request.policy);

  return {
    text: enforceOutputSafety(response.text.trim(), locale),
    source: "ai",
    provider: response.provider,
    model: response.model,
    promptVersion: AI_COACH_PROMPT_VERSION,
    fallbackUsed: Boolean(response.fallbackUsed),
    latencyMs: response.latencyMs,
    facts,
  };
}

const memoryExtractionSchema = jsonSchema<{ memories: Array<{ type: string; key: string; value: string; confidence?: number }> }>({
  type: "object",
  additionalProperties: false,
  properties: {
    memories: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string", enum: [...MEMORY_TYPES] },
          key: { type: "string", minLength: 1, maxLength: 60 },
          value: { type: "string", minLength: 1, maxLength: 120 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["type", "key", "value"],
      },
    },
  },
  required: ["memories"],
});

/**
 * Kullanıcı mesajından kalıcı tercih çıkarır.
 *
 * ASLA ÇAĞRIYI BLOKLAMAZ: hata durumunda boş liste döner. Hafıza bir
 * iyileştirmedir; çıkarım başarısız diye kullanıcı yanıtsız kalmamalı.
 * Model çıktısı `sanitizeMemory` ile TEK TEK doğrulanır — şemaya uyduğunu
 * iddia eden ama uymayan JSON (bkz. openai-compatible.ts) uygulamayı bozamaz.
 */
export async function extractMemories(input: { message: string; locale?: "tr" | "en"; maxOutputTokens?: number; abortSignal?: AbortSignal }): Promise<UserMemory[]> {
  const locale = input.locale === "en" ? "en" : "tr";
  const message = input.message.trim().slice(0, 600);
  if (!message) return [];
  try {
    const response = await routeObject({
      category: "structured_extraction",
      schema: memoryExtractionSchema,
      system: MEMORY_EXTRACTION_PROMPT[locale],
      prompt: `<message>\n${message}\n</message>`,
      temperature: 0,
      maxOutputTokens: Math.max(100, Math.min(input.maxOutputTokens ?? 300, 400)),
      abortSignal: input.abortSignal,
    });
    const raw = Array.isArray(response.object?.memories) ? response.object.memories : [];
    return raw
      // Çıkarım kullanıcının açık ifadesinden geliyor ama modelin yorumundan
      // geçiyor; bu yüzden kaynak "inferred" olarak işaretlenir.
      .map((item) => sanitizeMemory({ ...item, source: "inferred" }))
      .filter((memory): memory is UserMemory => memory !== null);
  } catch (error) {
    if (!(error instanceof AiAllProvidersFailedError)) console.error("[ai-coach] memory extraction failed", error instanceof Error ? error.name : "unknown");
    return [];
  }
}


// ---------------------------------------------------------------------------
// Sohbet dışı görevler (haftalık değerlendirme, hedef analizi, plan, öğün önerisi)
// ---------------------------------------------------------------------------
//
// Bu görevler sohbet DEĞİL: girdi bir mesaj dizisi değil, deterministik olarak
// hesaplanmış bir özettir ve çıktı çoğunlukla bir şemaya bağlıdır. Yine de
// koçla AYNI boru hattından geçmeleri gerekir — gerçeklerin kesin sayılması,
// hafızanın önerileri şekillendirmesi, güvenlik katmanı ve yönlendirme/yedekleme
// her yerde aynı olmalı.
//
// `facts` HAZIR gelir: her rota kendi motorunu (planGoal, profileSignals,
// validateWeeklySummary...) zaten çalıştırıyor. Burada yeniden hesaplamak iş
// mantığını ikinci kez yazmak olurdu.

export type CoachTaskRequest = {
  /** Rotanın deterministik motorundan çıkan, modelin ASLA değiştirmeyeceği özet. */
  facts: Record<string, unknown>;
  /** Göreve özgü kurallar. Ortak kurallar (gerçekler kesindir, hafıza, güvenilmezlik) eklenir. */
  domainRules: string;
  prompt: string;
  category: AiTaskCategory;
  locale?: "tr" | "en";
  memories?: Memory[];
  /** Bilgi getirimi için arama dizesi; verilmezse bilgi bölümü eklenmez. */
  knowledgeQuery?: string;
  /** Kullanıcının serbest metni (not, hedef açıklaması). Güvenlik katmanından geçirilir. */
  userText?: string;
  image?: ImageInput;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  abortSignal?: AbortSignal;
  policy?: RoutingPolicy;
};

export type CoachTaskResult<T> = {
  object: T;
  provider: string;
  model: string;
  promptVersion: string;
  fallbackUsed: boolean;
  latencyMs: number;
};

/** Görev bağlamını kurar: hafıza + bilgi + gerçekler → sistem promptu. */
async function taskSystemPrompt(request: CoachTaskRequest, safetyInstruction?: string) {
  const locale = request.locale === "en" ? "en" : "tr";
  const context = await buildTaskContext({
    memories: request.memories,
    query: request.knowledgeQuery ?? "",
    locale,
  });
  return buildTaskSystemPrompt({
    locale,
    domainRules: request.domainRules,
    factsJson: JSON.stringify(request.facts),
    memoryLines: formatMemories(context.memories),
    knowledgeLines: formatKnowledge(context.knowledge),
    safetyInstruction,
  });
}

/**
 * Güvenlik değerlendirmesi. Sohbetten farkı: burada ENGELLEME bir metin
 * yanıtına dönüşemez, çünkü çağıran taraf bir şema bekliyor. Bunun yerine
 * karar döndürülür ve rota kendi güvenli yerel çıktısına düşer — o çıktı zaten
 * her rotada mevcut (localWeeklyReview, localAnalysis, localNutritionAdvice).
 */
export function evaluateTaskSafety(userText: string | undefined, locale: "tr" | "en" = "tr") {
  return evaluateSafety(userText ?? "", locale);
}

/** Şemaya bağlı görev üretimi. */
export async function generateCoachObject<T>(request: CoachTaskRequest & { schema: AiObjectRequest<T>["schema"] }): Promise<CoachTaskResult<T>> {
  const locale = request.locale === "en" ? "en" : "tr";
  const safety = evaluateTaskSafety(request.userText, locale);
  const response = await routeObject<T>({
    category: request.category,
    schema: request.schema,
    system: await taskSystemPrompt(request, safety.blocked ? undefined : safety.extraInstruction),
    prompt: request.prompt,
    image: request.image,
    model: request.model,
    locale,
    temperature: request.temperature,
    maxOutputTokens: request.maxOutputTokens,
    abortSignal: request.abortSignal,
  }, request.policy);

  return {
    object: response.object,
    provider: response.provider,
    model: response.model,
    promptVersion: AI_COACH_PROMPT_VERSION,
    fallbackUsed: Boolean(response.fallbackUsed),
    latencyMs: response.latencyMs,
  };
}

/** Serbest metin görev üretimi (ör. öğün önerisi). Çıktı güvenliği uygulanır. */
export async function generateCoachTaskText(request: CoachTaskRequest): Promise<Omit<CoachTaskResult<never>, "object"> & { text: string }> {
  const locale = request.locale === "en" ? "en" : "tr";
  const safety = evaluateTaskSafety(request.userText, locale);
  const response = await routeText({
    category: request.category,
    system: await taskSystemPrompt(request, safety.blocked ? undefined : safety.extraInstruction),
    prompt: request.prompt,
    image: request.image,
    model: request.model,
    locale,
    facts: request.facts as never,
    temperature: request.temperature,
    maxOutputTokens: request.maxOutputTokens,
    abortSignal: request.abortSignal,
  }, request.policy);

  return {
    text: enforceOutputSafety(response.text.trim(), locale),
    provider: response.provider,
    model: response.model,
    promptVersion: AI_COACH_PROMPT_VERSION,
    fallbackUsed: Boolean(response.fallbackUsed),
    latencyMs: response.latencyMs,
  };
}

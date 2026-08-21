// Sağlayıcıdan bağımsız AI sözleşmesi.
//
// Hedefit'in geri kalanı bu tipleri konuşur; hiçbir rota, bileşen veya servis
// "Kimi", "Moonshot" veya "OpenAI" kelimesini görmez. Yeni bir sağlayıcı
// eklemek = bu arayüzü uygulayan bir dosya + registry'ye tek satır kayıt.

import type { FlexibleSchema, JSONValue, ModelMessage } from "ai";

export type AiRole = "user" | "assistant";

export type AiMessage = { role: AiRole; text: string };

export type ImageInput = { mimeType: string; base64: string };

/**
 * Bir isteğin ne tür bir iş olduğu. Router bunu kullanarak yerel modelin bu işi
 * yapıp yapamayacağına karar verir; ayrıca telemetride kategori kırılımı verir.
 * Yerel (deterministik) sağlayıcı yalnızca `localCapableCategories` içindekileri
 * kabul eder — geri kalanı doğrudan uzak sağlayıcıya gider.
 */
export type AiTaskCategory =
  | "simple_coaching"
  | "daily_summary"
  | "nutrition_explanation"
  | "activity_summary"
  | "goal_progress"
  | "motivation"
  | "conversation"
  | "complex_reasoning"
  // Antrenman programı üretimi complex_reasoning'den BİLEREK AYRI: ikisi de
  // şemalı JSON üretir ama generate-plan'ın route'unda deterministik şablon
  // yedeği YOKTUR (bir egzersiz programı "uydurmak" güvenli değil). Ayrı
  // kategori, yerel politika ve telemetride ikisini birbirinden bağımsız
  // yönetebilmeyi sağlar (bkz. lib/ai/local-policy.ts).
  | "plan_generation"
  | "structured_extraction"
  | "vision";

export type AiRequest = {
  /** İsteğin türü; yönlendirme ve telemetri için. */
  category: AiTaskCategory;
  system?: string;
  messages?: AiMessage[];
  prompt?: string;
  image?: ImageInput;
  locale?: "tr" | "en";
  /** Deterministik motorun ürettiği, LLM'in ASLA yeniden hesaplamayacağı gerçekler. */
  facts?: Record<string, unknown>;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  minimumOutputTokens?: number;
  providerOptions?: Record<string, Record<string, JSONValue>>;
  abortSignal?: AbortSignal;
};

export type AiObjectRequest<T> = AiRequest & { prompt: string; schema: FlexibleSchema<T> };

export type AiResponse = {
  text: string;
  provider: string;
  model: string;
  latencyMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
  /** Zincirde ilk sağlayıcı başarısız olduğu için buraya düşüldüyse true. */
  fallbackUsed?: boolean;
};

export type AiObjectResponse<T> = Omit<AiResponse, "text"> & { object: T };

/**
 * Sağlayıcı sözleşmesi.
 *
 * `generateObject` isteğe bağlıdır: deterministik yerel sağlayıcı yapılandırılmış
 * üretim yapamaz, bu yüzden alanı hiç tanımlamaz ve router onu şema gerektiren
 * isteklerde otomatik olarak atlar.
 */
export interface AIProvider {
  readonly id: string;
  /** `local` sağlayıcılar ağ gerektirmez; router bunları önceliklendirir. */
  readonly kind: "local" | "remote";
  /** Bu sağlayıcının TERCİHEN işleyebileceği kategoriler; boşsa hepsini kabul eder. */
  readonly categories?: readonly AiTaskCategory[];
  /**
   * Yalnızca SON ÇARE olarak işlenebilen kategoriler.
   *
   * Neden ayrı bir liste? Deterministik yerel sağlayıcı şablon cümle üretir.
   * Serbest sohbette bu, gerçek bir modelin yanıtından belirgin biçimde
   * zayıftır — yerel sağlayıcıyı "önce yerel" kuralıyla sohbete koysaydık her
   * kullanıcı her soruda şablon cevap alırdı ve koç işe yaramaz hale gelirdi.
   * Buradaki kategoriler, zincirdeki diğer TÜM sağlayıcılar tükendiğinde
   * devreye girer: yani "hiç cevap yok" ile "güvenli genel cevap" arasında
   * seçim yapılırken.
   */
  readonly lastResortCategories?: readonly AiTaskCategory[];
  isAvailable(): Promise<boolean>;
  generateText(request: AiRequest): Promise<AiResponse>;
  generateObject?<T>(request: AiObjectRequest<T>): Promise<AiObjectResponse<T>>;
}

/** AI SDK'nın mesaj biçimine çeviri; sağlayıcı uygulamalarının ortak ihtiyacı. */
export function toModelMessages(messages: AiMessage[]): ModelMessage[] {
  return messages.map((message) => ({ role: message.role, content: message.text }));
}

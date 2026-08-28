// Gizliliğe duyarlı AI gözlemlenebilirliği.
//
// NE ÖLÇÜLÜR: hangi sağlayıcı/model seçildi, yedeğe düşüldü mü, ne kadar
// sürdü, kaç token, hangi prompt sürümü, hangi kategori.
//
// NE ÖLÇÜLMEZ: istek metni, yanıt metni, bağlam, hafıza içeriği, kalori/kilo
// değerleri. Bunlar kullanıcının sağlık verisidir; bir metrik tablosunda veya
// log satırında çoğaltılmaları gizlilik açısından savunulamaz (bkz.
// db/migrations/20260819_ai_memory.sql ai_provider_events).

import { AI_COACH_PROMPT_VERSION } from "./prompts.ts";
import type { AiTaskCategory } from "./types.ts";

export type AiEvent = {
  category: AiTaskCategory;
  provider: string;
  model?: string;
  outcome: "success" | "error" | "skipped";
  fallbackUsed: boolean;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  promptVersion: string;
  errorKind?: string;
  // --- Cihaz üstü çıkarım ölçümleri (Phase 2) ---------------------------
  // Yalnızca teknik metadata. İSTEM VE YANIT METNİ HİÇBİR ZAMAN YAZILMAZ:
  // yerel çıkarımın temel vaadi verinin cihazdan çıkmamasıdır; performans
  // ölçmek uğruna sağlık verisini yukarı göndermek bu vaadi bozardı.
  runtime?: "litert-lm";
  /** Model belleğe yüklenirken geçen süre (yalnız ilk yüklemede anlamlı). */
  loadMs?: number;
  /** İlk token'a kadar geçen süre — algılanan hızın asıl göstergesi. */
  ttftMs?: number;
  decodeTokensPerSecond?: number;
  prefillTokensPerSecond?: number;
};

type ErrorRecord = Record<string, unknown>;

function asErrorRecord(value: unknown): ErrorRecord | null {
  return value && typeof value === "object" ? value as ErrorRecord : null;
}

/**
 * AI SDK, HTTP hatasını bazen `cause` zincirinin içine sarar. Ham yanıt gövdesi
 * (ve dolayısıyla beklenmedik bir sağlayıcı metni) günlüğe yazılmaz; yalnızca
 * erişim teşhisi için güvenli durum kodu ve sağlayıcı hata kodu okunur.
 */
function errorDetails(error: unknown) {
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && !seen.has(current); depth += 1) {
    seen.add(current);
    const record = asErrorRecord(current);
    if (!record) break;
    const status = typeof record.statusCode === "number"
      ? record.statusCode
      : typeof record.status === "number" ? record.status : undefined;
    const directCode = typeof record.code === "string" ? record.code : undefined;
    const data = asErrorRecord(record.data);
    const nestedError = asErrorRecord(data?.error);
    const code = directCode
      ?? (typeof data?.code === "string" ? data.code : undefined)
      ?? (typeof nestedError?.code === "string" ? nestedError.code : undefined);
    if (status !== undefined || code !== undefined) return { status, code };
    current = record.cause;
  }
  return {};
}

/** Sağlayıcı hatasını ham mesaj SIZDIRMADAN sınıflandırır. */
export function classifyError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") return "timeout";
    if (error.name === "AiUnsupportedRequestError") return "unsupported";
    if (error.name === "AI_NoContentGeneratedError") return "empty_response";
    if (error.name === "AI_InvalidResponseDataError") return "invalid_output";
    // Kullanıcı iptali arıza değildir; ayrı sınıflandırılır ki hata
    // oranlarını şişirmesin.
    if (error.name === "LocalGenerationCancelledError") return "cancelled";
  }
  const nativeMessage = error instanceof Error ? error.message : String(error);
  if (/generation_timeout|load_timeout/.test(nativeMessage)) return "timeout";
  if (/model_not_installed/.test(nativeMessage)) return "model_missing";
  if (/integrity_failed|checksum_mismatch|size_mismatch/.test(nativeMessage)) return "model_corrupted";
  if (/insufficient_storage/.test(nativeMessage)) return "insufficient_storage";
  if (/load_failed|generation_failed/.test(nativeMessage)) return "local_runtime_error";
  const { status, code } = errorDetails(error);
  if (status === 401 || status === 403 || /invalid_api_key|authentication|model_not_found|model_access/i.test(code ?? "")) return "auth";
  if (/insufficient_quota|billing|credit_balance/i.test(code ?? "")) return "quota";
  if (status === 429 || /rate_limit/i.test(code ?? "")) return "rate_limited";
  if (status !== undefined && status >= 500) return "provider_error";
  if (status === 408 || status === 504) return "timeout";
  const message = error instanceof Error ? error.message : String(error);
  // "max RPM: 3" gibi ifadeler 429 veya "rate limit" geçmiyor; sınıflandırma
  // dışında kalınca hız sınırı telemetride "unknown" görünüyordu ve gerçek
  // darboğaz aylarca fark edilmeyebilirdi.
  if (/\b429\b|rate.?limit|max\s*rpm|too many requests|requests per (?:minute|second)/i.test(message)) return "rate_limited";
  if (/\b401\b|\b403\b|unauthor|forbidden|api key/i.test(message)) return "auth";
  if (/\b5\d{2}\b|internal server/i.test(message)) return "provider_error";
  if (/timeout|timed out|aborted/i.test(message)) return "timeout";
  if (/quota|insufficient.?(credit|balance)/i.test(message)) return "quota";
  if (/json|parse|schema|validation/i.test(message)) return "invalid_output";
  if (/fetch failed|network|ENOTFOUND|ECONNREFUSED/i.test(message)) return "network";
  return "unknown";
}

export function createEvent(input: Omit<AiEvent, "promptVersion"> & { promptVersion?: string }): AiEvent {
  return { promptVersion: AI_COACH_PROMPT_VERSION, ...input };
}

// Toplanan olaylar. Kalıcı yazma (ai_provider_events tablosu) isteğe bağlıdır
// ve isteğin gecikmesine eklenmemesi için çağıran tarafın kararına bırakılır;
// yazılamazsa AI akışı etkilenmez.
export type AiEventSink = (event: AiEvent) => void;

/** Geliştirme kolaylığı: yönlendirmenin ne yaptığını sunucu log'unda görmek. */
export const consoleEventSink: AiEventSink = (event) => {
  // Başarı günlükleri üretimde kapalı kalır; ancak hata türü (asla istek/yanıt
  // metni değil) canlı bir AI erişim sorununu teşhis etmek için gereklidir.
  if (process.env.NODE_ENV === "production" && !process.env.AI_DEBUG && event.outcome !== "error") return;
  console.info("[ai]", JSON.stringify(event));
};

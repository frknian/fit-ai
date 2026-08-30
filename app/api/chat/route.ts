import { authenticateRequest } from "../../../lib/api-auth.ts";
import { rateLimit, tooManyRequests } from "../../../lib/rate-limit.ts";
import { hasRemoteProvider } from "../../../lib/ai/providers/openai-compatible.ts";
import { generateCoachResponse } from "../../../lib/ai/coach.ts";
import { evaluateSafety } from "../../../lib/ai/safety.ts";
import { loadMemories } from "../../../lib/ai/memory.ts";
import { sanitizeCoachSignals } from "../../../lib/ai/signals.ts";
import { AiAllProvidersFailedError } from "../../../lib/ai/errors.ts";
import { checkAndConsumeUsage, outputTokenLimit, refundUsage, usageLimitExceeded } from "../../../lib/usage-limits.ts";
import { parseCoachActions } from "../../../lib/ai/coach-actions.ts";
import { LOCAL_PROVIDER_ID } from "../../../lib/ai/providers/deterministic-local.ts";

type CoachMessage = { role: "user" | "assistant"; text: string };

export const runtime = "edge";

function safeMessages(value: unknown): CoachMessage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-12).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const role = record.role === "assistant" ? "assistant" : record.role === "user" ? "user" : null;
    const text = typeof record.text === "string" ? record.text.trim().slice(0, 1_000) : "";
    return role && text ? [{ role, text }] : [];
  });
}

function unavailableNotice(error: unknown, locale: "tr" | "en") {
  const kind = error instanceof AiAllProvidersFailedError ? error.failures[0]?.message : "unknown";
  const tr = {
    auth: "OpenAI API anahtarı kabul edilmedi veya bu projenin model erişimi yok.",
    quota: "OpenAI API projesinin bakiye ya da harcama sınırına ulaşıldı.",
    rate_limited: "OpenAI API proje hız sınırına ulaşıldı; kısa süre sonra tekrar dene.",
    timeout: "OpenAI zamanında yanıt vermedi; bağlantıyı kontrol edip tekrar dene.",
    provider_error: "OpenAI servisi geçici olarak yanıt veremedi; biraz sonra tekrar dene.",
    empty_response: "OpenAI modelinin yanıt üretim ayarı tamamlanamadı. Model erişimini kontrol et.",
    unknown: "OpenAI isteği tamamlanamadı. API projesindeki model erişimini ve harcama sınırını kontrol et.",
  } as const;
  const en = {
    auth: "The OpenAI API key was rejected or this project cannot access the model.",
    quota: "This OpenAI API project has reached its credit or spending limit.",
    rate_limited: "This OpenAI API project has reached its rate limit. Try again shortly.",
    timeout: "OpenAI did not respond in time. Check the connection and try again.",
    provider_error: "OpenAI is temporarily unavailable. Try again shortly.",
    empty_response: "OpenAI could not complete the model response. Check model access.",
    unknown: "The OpenAI request could not complete. Check this API project's model access and spending limit.",
  } as const;
  return (locale === "en" ? en : tr)[kind as keyof typeof tr] ?? (locale === "en" ? en.unknown : tr.unknown);
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  // Kısa süreli spam ve kontrolsüz maliyet artışını önler. Günlük plan
  // kotası ayrıca checkAndConsumeUsage içinde uygulanır.
  const rateLimitResult = rateLimit(`chat:${auth.user.id}`, 5, 60_000);
  if (!rateLimitResult.ok) return tooManyRequests(rateLimitResult.retryAfterSeconds);

  let payload: { messages?: unknown; context?: unknown; signals?: unknown; locale?: unknown };
  let providerFailure: unknown = undefined;
  try {
    payload = await request.json() as typeof payload;
  } catch {
    return Response.json({ error: "Sohbet isteği okunamadı" }, { status: 400 });
  }

  const locale = payload.locale === "en" ? "en" : "tr";
  const messages = safeMessages(payload.messages);
  if (!messages.length) return Response.json({ error: "Mesaj bulunamadı" }, { status: 400 });
  const question = messages.at(-1)?.text || "";
  console.info("[api/chat] request started", { requestId, messageCount: messages.length, locale });

  // GÜVENLİK KATMANI, KULLANIM HAKKINDAN ÖNCE. Acil bir belirtide (göğüs
  // ağrısı, kendine zarar) yanıt deterministiktir: hiçbir modele gidilmez.
  // Bu yüzden kullanıcının günlük hakkını da tüketmemesi gerekir — aksi hâlde
  // bir güvenlik uyarısı görmek "AI hakkı harcamak" olurdu.
  const safety = evaluateSafety(question, locale);
  if (safety.blocked) {
    return Response.json({ text: safety.response, source: "safety", blockedReason: safety.reason });
  }

  // İstemcinin gönderdiği HAM sinyaller (kilo, adım, öğün toplamı...). Türetilmiş
  // değerler (kalan kalori, BMI, trend) buradan GELMEZ; sunucudaki deterministik
  // motor hesaplar (lib/ai/intelligence.ts). Böylece modele giden sayıların
  // tek bir kaynağı olur.
  const signals = sanitizeCoachSignals(payload.signals, typeof payload.context === "string" ? payload.context : undefined);

  const usage = await checkAndConsumeUsage(request, "chat", auth.user.id);
  if ("error" in usage) return usage.error;
  if (!usage.allowed) return usageLimitExceeded("chat", usage.used, usage.limit);

  // Hafıza bir iyileştirmedir: tablo yoksa veya okunamazsa boş döner ve sohbet
  // normal şekilde devam eder (bkz. lib/ai/memory.ts loadMemories).
  const memories = await loadMemories(request);

  try {
    console.info("[api/chat] provider chain started", { requestId, memoryCount: memories.length });
    const result = await generateCoachResponse({
      messages,
      locale,
      signals,
      memories,
      category: "conversation",
      policy: { mode: "auto" },
      // GPT-5'in düşünme ve görünür yanıt bütçesi aynıdır. Minimal düşünme
      // etkin olsa da 380 token kısa yanıtı kesebiliyordu; bu sınır günlük
      // sohbet için akıcı bir açıklama üretmeye yeterlidir.
      maxOutputTokens: outputTokenLimit("chat", usage.planTier),
      // Bulut model 18 saniyede yanıtlayamazsa kullanıcıyı bekletmek yerine
      // yönlendirici deterministik yerel Fit Koç yanıtına geçer.
      abortSignal: AbortSignal.timeout(18_000),
    });
    if (result.text.trim()) {
      // Yanıtı YEREL (deterministik) sağlayıcı ürettiyse kullanıcı ücretli AI
      // hizmetini gerçekte ALMADI — uzak model başarısız olduğu için güvenli
      // şablon yanıta düşüldü. Bu durumda günlük hak iade edilir; göç
      // öncesindeki davranış da buydu (bkz. lib/usage-limits.ts refundUsage).
      // Eylemler YALNIZCA gerçek modelden ayrıştırılır. Yerel yedek şablon
      // yanıtlar üretir; oradan yapılandırılmış çağrı beklemek, kullanıcıya
      // model onaylamamışken "plana ekle" düğmesi göstermek olurdu
      // (bkz. lib/ai/coach-actions.ts).
      const parsed = parseCoachActions(result.text);
      // Sınır uygulanmıyorsa (bkz. lib/usage-limits.ts) limit sonsuzdur; JSON'da
      // null'a dönüşüp arayüzde "0/null" görüneceği için alanı hiç göndermiyoruz.
      const localFallback = result.provider === LOCAL_PROVIDER_ID;
      if (localFallback && Number.isFinite(usage.limit)) await refundUsage(auth.user.id, "chat");
      console.info("[api/chat] request completed", { requestId, provider: result.provider, fallback: localFallback, durationMs: Date.now() - startedAt });
      return Response.json({
        text: parsed.text,
        // Her eylem bir ÖNERİdir: uygulanması için kullanıcının düğmeye
        // basması gerekir.
        ...(parsed.actions.length ? { actions: parsed.actions } : {}),
        // Göç öncesindeki source sözleşmesi korunur: "ai" = gerçek model,
        // "fallback" = güvenli yerel öneri.
        source: localFallback ? "fallback" : "ai",
        provider: result.provider,
        model: result.model,
        promptVersion: result.promptVersion,
        ...(Number.isFinite(usage.limit) ? { usage: { used: usage.used, limit: usage.limit } } : {}),
      });
    }
  } catch (error) {
    providerFailure = error;
    // Ham sağlayıcı hatası kullanıcıya ASLA gösterilmez; yalnızca sınıflandırılmış
    // özet sunucu log'una yazılır (bkz. lib/ai/telemetry.ts classifyError).
    if (error instanceof AiAllProvidersFailedError) console.error("[api/chat] provider chain failed", { requestId, failures: error.failures, durationMs: Date.now() - startedAt });
    else console.error("[api/chat] provider chain failed", { requestId, error: error instanceof Error ? error.name : "unknown", durationMs: Date.now() - startedAt });
  }

  // AI ya hiç yanıt vermedi ya da boş döndü: kullanıcı gerçekte AI hizmeti
  // ALMADI, günlük hakkı geri iade edilir (bkz. lib/usage-limits.ts refundUsage).
  if (Number.isFinite(usage.limit)) await refundUsage(auth.user.id, "chat");
  // Koçun adı "Fit Koç" — arayüzün her yerinde böyle geçiyor
  // (lib/i18n/dictionaries). Burada "AI koç" yazmak kullanıcıya başka bir
  // üründen söz ediliyormuş hissi veriyordu.
  return Response.json({
    text: hasRemoteProvider()
      ? "Fit Koç şu anda yanıt veremiyor. Verilerin kaybolmadı; biraz sonra tekrar deneyebilirsin."
      : "Fit Koç bulut AI ayarları tamamlanana kadar yanıt veremiyor.",
    source: "unavailable",
    notice: hasRemoteProvider() ? unavailableNotice(providerFailure, locale) : "OpenAI API anahtarı canlı sunucuda tanımlı değil.",
  }, { status: 503 });
}

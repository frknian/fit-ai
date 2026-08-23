import type { CoachMessage } from "../../../lib/ai-coach.ts";
import { authenticateRequest } from "../../../lib/api-auth.ts";
import { rateLimit, tooManyRequests } from "../../../lib/rate-limit.ts";
import { hasRemoteProvider } from "../../../lib/ai/providers/openai-compatible.ts";
import { generateCoachResponse } from "../../../lib/ai/coach.ts";
import { LOCAL_PROVIDER_ID } from "../../../lib/ai/providers/deterministic-local.ts";
import { evaluateSafety } from "../../../lib/ai/safety.ts";
import { loadMemories } from "../../../lib/ai/memory.ts";
import { sanitizeCoachSignals } from "../../../lib/ai/signals.ts";
import { AiAllProvidersFailedError } from "../../../lib/ai/errors.ts";
import { checkAndConsumeUsage, refundUsage, usageLimitExceeded } from "../../../lib/usage-limits.ts";
import { parseCoachActions } from "../../../lib/ai/coach-actions.ts";

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

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  const rateLimitResult = rateLimit(`chat:${auth.user.id}`, 20, 60_000);
  if (!rateLimitResult.ok) return tooManyRequests(rateLimitResult.retryAfterSeconds);

  let payload: { messages?: unknown; context?: unknown; signals?: unknown; locale?: unknown };
  try {
    payload = await request.json() as typeof payload;
  } catch {
    return Response.json({ error: "Sohbet isteği okunamadı" }, { status: 400 });
  }

  const locale = payload.locale === "en" ? "en" : "tr";
  const messages = safeMessages(payload.messages);
  if (!messages.length) return Response.json({ error: "Mesaj bulunamadı" }, { status: 400 });
  const question = messages.at(-1)?.text || "";

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
    const result = await generateCoachResponse({
      messages,
      locale,
      signals,
      memories,
      category: "conversation",
      maxOutputTokens: 500,
      // 20 sn, sağlayıcının akıl yürüten modelinde (42 sn ölçüldü) hiç
      // yetişmiyordu; koç neredeyse her soruda güvenli yerel yanıta düşüyordu.
      // Varsayılan model hızlıya alındı (~5 sn), pencere yine de paylı.
      abortSignal: AbortSignal.timeout(15_000),
    });
    if (result.text.trim()) {
      // Yanıtı YEREL (deterministik) sağlayıcı ürettiyse kullanıcı ücretli AI
      // hizmetini gerçekte ALMADI — uzak model başarısız olduğu için güvenli
      // şablon yanıta düşüldü. Bu durumda günlük hak iade edilir; göç
      // öncesindeki davranış da buydu (bkz. lib/usage-limits.ts refundUsage).
      const servedLocally = result.provider === LOCAL_PROVIDER_ID;
      if (servedLocally && Number.isFinite(usage.limit)) await refundUsage(request, "chat");
      // Eylemler YALNIZCA gerçek modelden ayrıştırılır. Yerel yedek şablon
      // yanıtlar üretir; oradan yapılandırılmış çağrı beklemek, kullanıcıya
      // model onaylamamışken "plana ekle" düğmesi göstermek olurdu
      // (bkz. lib/ai/coach-actions.ts).
      const parsed = servedLocally ? { text: result.text, actions: [] } : parseCoachActions(result.text);
      // Sınır uygulanmıyorsa (bkz. lib/usage-limits.ts) limit sonsuzdur; JSON'da
      // null'a dönüşüp arayüzde "0/null" görüneceği için alanı hiç göndermiyoruz.
      return Response.json({
        text: parsed.text,
        // Her eylem bir ÖNERİdir: uygulanması için kullanıcının düğmeye
        // basması gerekir.
        ...(parsed.actions.length ? { actions: parsed.actions } : {}),
        // Göç öncesindeki source sözleşmesi korunur: "ai" = gerçek model,
        // "fallback" = güvenli yerel öneri.
        source: servedLocally ? "fallback" : "ai",
        provider: result.provider,
        model: result.model,
        promptVersion: result.promptVersion,
        ...(servedLocally && { notice: "Fit Koç şu an sınırlı modda yanıt veriyor." }),
        ...(!servedLocally && Number.isFinite(usage.limit) ? { usage: { used: usage.used, limit: usage.limit } } : {}),
      });
    }
  } catch (error) {
    // Ham sağlayıcı hatası kullanıcıya ASLA gösterilmez; yalnızca sınıflandırılmış
    // özet sunucu log'una yazılır (bkz. lib/ai/telemetry.ts classifyError).
    if (error instanceof AiAllProvidersFailedError) console.error("AI coach error", error.message);
    else console.error("AI coach error", error instanceof Error ? error.name : "unknown");
  }

  // AI ya hiç yanıt vermedi ya da boş döndü: kullanıcı gerçekte AI hizmeti
  // ALMADI, günlük hakkı geri iade edilir (bkz. lib/usage-limits.ts refundUsage).
  if (Number.isFinite(usage.limit)) await refundUsage(request, "chat");
  // Koçun adı "Fit Koç" — arayüzün her yerinde böyle geçiyor
  // (lib/i18n/dictionaries). Burada "AI koç" yazmak kullanıcıya başka bir
  // üründen söz ediliyormuş hissi veriyordu.
  return Response.json({
    text: hasRemoteProvider()
      ? "Fit Koç şu anda yanıt veremiyor. Verilerin kaybolmadı; biraz sonra tekrar deneyebilirsin."
      : "Fit Koç şu anda yanıt veremiyor. Bağlantı ayarların tamamlanınca tekrar deneyebilirsin.",
    source: "fallback",
    notice: "Fit Koç geçici olarak yanıt veremedi.",
  });
}

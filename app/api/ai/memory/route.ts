import { authenticateRequest } from "../../../../lib/api-auth.ts";
import { rateLimit, tooManyRequests } from "../../../../lib/rate-limit.ts";
import { deleteMemory, loadMemories, mayContainMemory, saveMemories } from "../../../../lib/ai/memory.ts";
import { extractMemories } from "../../../../lib/ai/coach.ts";
import { hasRemoteProvider } from "../../../../lib/ai/providers/openai-compatible.ts";
import { checkAndConsumeUsage, outputTokenLimit, refundUsage } from "../../../../lib/usage-limits.ts";

export const runtime = "edge";

/**
 * Kullanıcının AI koç hafızasını görmesi ve silmesi.
 *
 * Her iki uç nokta da kullanıcının kendi erişim jetonuyla çalışır; başkasının
 * hafızasına erişim VERİTABANI seviyesinde (RLS) engellenir. Bu yüzden burada
 * ayrıca "bu satır bu kullanıcıya mı ait?" kontrolü yazmıyoruz — tek bir
 * yerde uygulanan kural, iki yerde tekrarlanan kuraldan güvenlidir.
 */
export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  const limit = rateLimit(`ai-memory-read:${auth.user.id}`, 30, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

  const memories = await loadMemories(request);
  return Response.json({ memories });
}

export async function DELETE(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  const limit = rateLimit(`ai-memory-write:${auth.user.id}`, 30, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

  const id = new URL(request.url).searchParams.get("id") || "";
  // Kimlik biçimi doğrulanır: doğrulanmamış bir dize doğrudan sorguya girmemeli.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Geçersiz kayıt" }, { status: 400 });

  const deleted = await deleteMemory(request, id);
  return Response.json({ deleted });
}

/**
 * Bir kullanıcı mesajından kalıcı tercih çıkarır ve kaydeder.
 *
 * NEDEN AYRI UÇ NOKTA? Çıkarım ikinci bir model çağrısıdır. /api/chat içinde
 * yapılsaydı kullanıcı yanıtı görmek için o çağrıyı da beklerdi. Cloudflare
 * Worker'da isteği bitirdikten sonra arka planda iş çalıştırmak (waitUntil)
 * bu kurulumda rota koduna açık değil; bu yüzden istemci yanıtı EKRANA
 * BASTIKTAN SONRA bu uç noktayı çağırır. Başarısız olursa kullanıcı hiçbir
 * şey kaybetmez — sohbet zaten tamamlanmıştır.
 */
export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  const limit = rateLimit(`ai-memory-extract:${auth.user.id}`, 20, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

  // Çıkarım şema gerektirir; yerel deterministik sağlayıcı bunu yapamaz.
  // Uzak sağlayıcı yoksa sessizce hiçbir şey yapılmaz.
  if (!hasRemoteProvider()) return Response.json({ saved: 0 });

  let payload: { message?: unknown; locale?: unknown };
  try {
    payload = await request.json() as typeof payload;
  } catch {
    return Response.json({ error: "İstek okunamadı" }, { status: 400 });
  }

  const message = typeof payload.message === "string" ? payload.message.trim().slice(0, 600) : "";
  // Ucuz ön eleme: aday olmayan mesaj için ücretli çağrı yapılmaz.
  if (!message || !mayContainMemory(message)) return Response.json({ saved: 0 });

  // Hafıza çıkarımı ayrı ve ücretli bir model çağrısıdır. Sohbet kotasından
  // bağımsız günlük kota, ele geçirilmiş bir hesabın bu arka plan özelliğini
  // tekrarlayarak sınırsız model maliyeti üretmesini engeller.
  const usage = await checkAndConsumeUsage(request, "memory", auth.user.id);
  if ("error" in usage || !usage.allowed) return Response.json({ saved: 0 });

  const memories = await extractMemories({
    message,
    locale: payload.locale === "en" ? "en" : "tr",
    maxOutputTokens: outputTokenLimit("memory", usage.planTier),
    abortSignal: AbortSignal.timeout(15_000),
  });
  if (!memories.length) {
    await refundUsage(auth.user.id, "memory");
    return Response.json({ saved: 0 });
  }

  const saved = await saveMemories(request, auth.user.id, memories);
  if (!saved) await refundUsage(auth.user.id, "memory");
  return Response.json({ saved });
}

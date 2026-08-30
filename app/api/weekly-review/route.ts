import { jsonSchema } from "ai";
import { hasRemoteProvider } from "../../../lib/ai/providers/openai-compatible.ts";
import { generateCoachObject } from "../../../lib/ai/coach.ts";
import { loadMemories } from "../../../lib/ai/memory.ts";
import { enforceWeeklySafety, hasEnoughWeeklyData, localWeeklyReview, validateWeeklyReview, validateWeeklySummary, type WeeklyReview } from "../../../lib/weekly-review.ts";
import { authenticateRequest } from "../../../lib/api-auth.ts";
import { rateLimit, tooManyRequests } from "../../../lib/rate-limit.ts";
import { checkAndConsumeUsage, daysBetweenWeekStarts, lastAiWeeklyReviewWeekStart, outputTokenLimit, refundUsage } from "../../../lib/usage-limits.ts";
import { tr } from "../../../lib/i18n/dictionaries/tr.ts";
import { en } from "../../../lib/i18n/dictionaries/en.ts";

export const runtime = "edge";

const weeklyReviewSchema = jsonSchema<WeeklyReview>({
  type: "object",
  additionalProperties: false,
  properties: {
    headline: { type: "string", minLength: 1, maxLength: 100 },
    summary: { type: "string", minLength: 1, maxLength: 500 },
    positives: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", minLength: 1, maxLength: 240 } },
    cautions: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", minLength: 1, maxLength: 240 } },
    recommendations: { type: "array", minItems: 2, maxItems: 4, items: { type: "string", minLength: 1, maxLength: 240 } },
    safetyNote: { type: "string", minLength: 1, maxLength: 300 },
  },
  required: ["headline", "summary", "positives", "cautions", "recommendations", "safetyNote"],
});

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  const rateLimitResult = rateLimit(`weekly-review:${auth.user.id}`, 10, 60000);
  if (!rateLimitResult.ok) return tooManyRequests(rateLimitResult.retryAfterSeconds);

  let payload: { summary?: unknown; locale?: unknown };
  try {
    payload = await request.json() as { summary?: unknown; locale?: unknown };
  } catch {
    return Response.json({ error: "Haftalık özet okunamadı" }, { status: 400 });
  }

  const locale = payload.locale === "en" ? "en" : "tr";
  const dictionary = locale === "en" ? en : tr;

  const safeSummary = validateWeeklySummary(payload.summary);
  if (!safeSummary) return Response.json({ error: "Haftalık özet geçersiz" }, { status: 400 });
  if (!hasEnoughWeeklyData(safeSummary)) return Response.json({ error: "Değerlendirme için yeterli veri yok" }, { status: 422 });

  const fallback = enforceWeeklySafety(localWeeklyReview(safeSummary, dictionary, locale), safeSummary, dictionary);
  if (!hasRemoteProvider()) return Response.json({ review: fallback, source: "local", reason: "AI yapılandırılmadığı için güvenli yerel değerlendirme kullanıldı." });

  // Ücretsiz kullanıcılarda AI değerlendirme günlük sınırlıdır; sınır
  // dolduğunda hata döndürmek yerine (bu istek arka planda otomatik atılır,
  // kullanıcı doğrudan tetiklemez) sessizce güvenli yerel değerlendirmeye
  // düşülür — tıpkı AI sağlayıcısı yokken yapıldığı gibi.
  const usage = await checkAndConsumeUsage(request, "weekly_review", auth.user.id);
  if ("error" in usage || !usage.allowed) return Response.json({ review: fallback, source: "local", reason: "Günlük AI değerlendirme sınırına ulaşıldığı için güvenli yerel değerlendirme kullanıldı." });

  // Ücretsiz planda AI değerlendirme 2 haftada bir sunulur; aradaki
  // haftalarda sessizce yerel değerlendirmeye düşülür. Premium bu
  // kısıtlamaya tabi değildir.
  if (!usage.isPremium) {
    const lastAiWeek = await lastAiWeeklyReviewWeekStart(request);
    if (lastAiWeek && daysBetweenWeekStarts(lastAiWeek, safeSummary.weekStart) < 14) {
      return Response.json({ review: fallback, source: "local", reason: "Ücretsiz planda haftalık AI değerlendirme 2 haftada bir sunulur." });
    }
  }

  const outputLanguageInstruction = locale === "en"
    ? "- Output must be written entirely in English, short, concrete and supportive."
    : "- Çıktı Türkçe, kısa, somut ve destekleyici olsun.";

  // Kullanıcının kalıcı tercihleri (sevmediği hareketler, ekipman, program
  // saati) haftalık ÖNERİLERİ şekillendirir: "recommendations" alanına
  // kullanıcının zaten yapmayacağı bir şeyi yazmanın değeri yok. Hafıza
  // okunamazsa boş döner ve değerlendirme normal şekilde üretilir.
  const memories = await loadMemories(request);

  try {
    const result = await generateCoachObject({
      schema: weeklyReviewSchema,
      category: "complex_reasoning",
      locale,
      memories,
      // Özet zaten uygulamada hesaplandı (validateWeeklySummary); modelin
      // görevi bu sayıları yorumlamak, yeniden üretmek değil.
      facts: safeSummary as unknown as Record<string, unknown>,
      knowledgeQuery: `${safeSummary.goalCategory} haftalık antrenman toparlanma beslenme`,
      domainRules: `Sen Hedefit uygulamasının güvenli haftalık fitness değerlendirme asistanısın.
- Yalnızca verilen anonim özet metriklerini kullan; kişisel veri, tanı veya kesin sağlık iddiası üretme.
${outputLanguageInstruction}
- positives olumlu gelişmeleri, cautions dikkat noktalarını, recommendations gelecek hafta için 2–4 uygulanabilir adımı içersin.
- Ağrı alanı varsa veya ortalama yorgunluk 4/5 ve üzerindeyse yük, ağırlık, set, tekrar ya da yoğunluk artırmayı önerme. Dinlenme, form kalitesi ve güvenli toparlanmayı öner.
- Kilo, bel veya beslenme değişimini tek başına sağlık sonucu gibi yorumlama.
- Tıbbi teşhis, tedavi veya kesin kalori hedefi verme.`,
      prompt: `SON 7 GÜNÜN ANONİM HAFTALIK ÖZETİ <facts> içinde verildi.\n\nBu özet dışında veri varsayma.`,
      maxOutputTokens: outputTokenLimit("weekly_review", usage.planTier),
      temperature: 0.25,
      abortSignal: AbortSignal.timeout(20_000),
    });
    const validated = validateWeeklyReview(result.object);
    if (!validated) throw new Error("Model yanıtı doğrulanamadı");
    return Response.json({ review: enforceWeeklySafety(validated, safeSummary, dictionary), source: "ai", model: result.model });
  } catch {
    // Kullanıcı gerçekte bir AI değerlendirmesi ALMADI; günlük hakkı iade edilir.
    if (Number.isFinite(usage.limit)) await refundUsage(auth.user.id, "weekly_review");
    return Response.json({ review: fallback, source: "local", reason: "AI yanıtı alınamadığı için güvenli yerel değerlendirme kullanıldı." });
  }
}

import { authenticateRequest } from "../../../../lib/api-auth.ts";
import { estimateAiTextNutrition } from "../../../../lib/ai-nutrition-estimator.ts";
import { hasRemoteProvider } from "../../../../lib/ai/providers/openai-compatible.ts";
import { containsPromptInjection } from "../../../../lib/nutrition-parser.ts";
import { matchDefaultFood } from "../../../../lib/default-food-catalog.ts";
import { rateLimit, tooManyRequests } from "../../../../lib/rate-limit.ts";
import { checkAndConsumeUsage, outputTokenLimit, refundUsage, usageLimitExceeded } from "../../../../lib/usage-limits.ts";

export const runtime = "edge";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  const limited = rateLimit(`nutrition-estimate:${auth.user.id}`, 15, 60_000);
  if (!limited.ok) return tooManyRequests(limited.retryAfterSeconds);

  const body = await request.json().catch(() => ({})) as { query?: unknown; grams?: unknown };
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const grams = Number(body.grams);
  if (query.length < 2 || query.length > 1_000) {
    return Response.json({ error: "Yemek adı veya tarif 2–1000 karakter arasında olmalı." }, { status: 400 });
  }
  if (!Number.isFinite(grams) || grams <= 0 || grams > 5000) {
    return Response.json({ error: "Gramaj 1–5000 gram arasında olmalı." }, { status: 400 });
  }
  const catalogueFood = matchDefaultFood(query);
  if (catalogueFood) {
    const ratio = grams / 100;
    return Response.json({
      items: [{
        query: catalogueFood.name,
        estimatedGrams: grams,
        confidence: 0.85,
        needsConfirmation: false,
        nutrition: {
          calories: Math.round(catalogueFood.calories * ratio),
          protein: catalogueFood.protein * ratio,
          carbohydrates: catalogueFood.carbohydrates * ratio,
          fat: catalogueFood.fat * ratio,
          fiber: catalogueFood.fiber * ratio,
          sugar: 0,
          sodiumMg: 0,
          potassiumMg: 0,
          calciumMg: 0,
          ironMg: 0,
          vitaminCMg: 0,
        },
      }],
      confidence: 0.85,
      isEstimated: true,
      warnings: ["Değerler temel Hedefit kataloğundan hesaplandı."],
    });
  }
  if (!hasRemoteProvider()) {
    return Response.json({ error: "AI besin hesaplama servisi yapılandırılmamış." }, { status: 503 });
  }

  const usage = await checkAndConsumeUsage(request, "text_nutrition", auth.user.id);
  if ("error" in usage) return usage.error;
  if (!usage.allowed) return usageLimitExceeded("text_nutrition", usage.used, usage.limit);

  try {
    const item = await estimateAiTextNutrition({ foodName: query, grams, timeoutMs: 35_000, maxOutputTokens: outputTokenLimit("text_nutrition", usage.planTier) });
    if (!item) {
      // Model doğrulanabilir bir sonuç üretemedi: kullanıcı gerçekte bir
      // tahmin ALMADI, günlük hakkı geri iade edilir.
      if (Number.isFinite(usage.limit)) await refundUsage(auth.user.id, "text_nutrition");
      return Response.json({ error: "Besin değerleri güvenle hesaplanamadı; tekrar deneyebilirsin." }, { status: 422 });
    }
    const warnings = [
      "Değerler tarife ve markaya göre değişebilen yapay zekâ tahminidir.",
      ...(containsPromptInjection(query) ? ["Yemek adındaki talimat benzeri içerik yok sayıldı."] : []),
    ];
    return Response.json({
      items: [{
        query: item.name,
        estimatedGrams: item.grams,
        confidence: item.confidence,
        needsConfirmation: item.confidence < 0.75,
        nutrition: {
          calories: item.calories,
          protein: item.protein,
          carbohydrates: item.carbohydrates,
          fat: item.fat,
          fiber: item.fiber,
          sugar: item.sugar,
          sodiumMg: item.sodiumMg,
          potassiumMg: item.potassiumMg,
          calciumMg: item.calciumMg,
          ironMg: item.ironMg,
          vitaminCMg: item.vitaminCMg,
        },
      }],
      totals: {
        calories: item.calories,
        protein: item.protein,
        carbohydrates: item.carbohydrates,
        fat: item.fat,
        fiber: item.fiber,
        sugar: item.sugar,
        sodiumMg: item.sodiumMg,
        potassiumMg: item.potassiumMg,
        calciumMg: item.calciumMg,
        ironMg: item.ironMg,
        vitaminCMg: item.vitaminCMg,
      },
      warnings,
      confidence: item.confidence,
      isEstimated: true,
      usage: { used: usage.used, limit: usage.limit },
    });
  } catch (error) {
    console.error("[nutrition-estimate] AI request failed", error instanceof Error ? error.name : "unknown");
    if (Number.isFinite(usage.limit)) await refundUsage(auth.user.id, "text_nutrition");
    return Response.json({ error: "AI besin hesaplaması zamanında tamamlanamadı; tekrar deneyebilirsin." }, { status: 502 });
  }
}

import { localNutritionAdvice, nutritionGaps, type NutritionAdviceInput } from "../../../../lib/nutrition-advice.ts";
import { authenticateRequest } from "../../../../lib/api-auth.ts";
import { rateLimit, tooManyRequests } from "../../../../lib/rate-limit.ts";
import { hasRemoteProvider } from "../../../../lib/ai/providers/openai-compatible.ts";
import { generateCoachTaskText } from "../../../../lib/ai/coach.ts";
import { loadMemories } from "../../../../lib/ai/memory.ts";
import { checkAndConsumeUsage, outputTokenLimit, refundUsage } from "../../../../lib/usage-limits.ts";

export const runtime = "edge";

/**
 * Öğün önerisinin alan bilgisi. Yalnız modele gider, arayüzde gösterilmez.
 *
 * Öneri, kalan makroya bakıp besin sıralamaktan ibaret olmamalı: enerji
 * dengesinin nasıl işlediğini ve nerede durulması gerektiğini bilmeli.
 */
const ADVICE_SYSTEM_PROMPT = `Sen bir beslenme ve kalori analizi uzmanısın.
Kalori, vücudun hayati ve fiziksel tüm işlevleri için kullandığı enerji
birimidir; kilo yönü alınan ve harcanan enerji arasındaki dengeyle belirlenir.
Alınan harcanandan fazlaysa fazlalık yağ olarak depolanır, azsa (kalori açığı)
vücut depodaki yağı kullanır, eşitse ağırlık sabit kalır.

Öneriyi buna göre kur:
- Günlük hedefin altındaki boşluğu ve eksik makroyu birlikte değerlendir.
- Protein en yüksek termik etkiye sahiptir (%20-30; karbonhidrat %5-10, yağ
  %0-3) ve doygunluğu en çok artıran makrodur. Doğal, az işlenmiş gıdaların
  termik etkisi aynı kalorideki işlenmiş gıdalardan belirgin biçimde yüksektir;
  eksik kapatılırken bunları öne çıkar.
- Kalori açığı önerirken bazal metabolizmanın (BMR) altına inmeyi ASLA teşvik
  etme; bu, kas kaybına ve metabolik yavaşlamaya yol açar. Günlük harcamanın
  %60-75'ini BMR oluşturur.
- Hedef aşılmışsa suçlayıcı olma; bir sonraki öğünü hafifletmeyi ya da hareketi
  artırmayı sakin bir dille öner.
- Tanı koyma, hastalık veya takviye tavsiyesi verme, kesin sağlık iddiası kurma.`;

function bounded(value: unknown, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(maximum, parsed)) : 0;
}

function sanitizeInput(value: unknown): NutritionAdviceInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const totals = input.totals && typeof input.totals === "object" ? input.totals as Record<string, unknown> : {};
  const meals = Array.isArray(input.meals) ? input.meals.slice(0, 20).flatMap((meal) => {
    if (!meal || typeof meal !== "object") return [];
    const item = meal as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.trim().slice(0, 100) : "";
    if (!name) return [];
    return [{ name, meal: typeof item.meal === "string" ? item.meal.slice(0, 30) : "Öğün", calories: bounded(item.calories, 5_000), protein: bounded(item.protein, 500), carbs: bounded(item.carbs, 1_000), fat: bounded(item.fat, 500) }];
  }) : [];
  return {
    calorieTarget: bounded(input.calorieTarget, 10_000),
    proteinTarget: bounded(input.proteinTarget, 500),
    carbsTarget: bounded(input.carbsTarget, 1_000),
    fatTarget: bounded(input.fatTarget, 500),
    totals: { calories: bounded(totals.calories, 20_000), protein: bounded(totals.protein, 1_000), carbs: bounded(totals.carbs, 2_000), fat: bounded(totals.fat, 1_000) },
    meals,
  };
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  const rateLimitResult = rateLimit(`nutrition-advice:${auth.user.id}`, 15, 60000);
  if (!rateLimitResult.ok) return tooManyRequests(rateLimitResult.retryAfterSeconds);

  const body = await request.json().catch(() => null) as { locale?: unknown } | null;
  const locale = body && body.locale === "en" ? "en" : "tr";
  const input = sanitizeInput(body);
  if (!input || !input.calorieTarget) return Response.json({ error: "Beslenme özeti geçersiz" }, { status: 400 });
  const fallback = localNutritionAdvice(input, locale);
  if (!hasRemoteProvider() || !input.meals.length) return Response.json({ advice: fallback, source: "fallback" });

  // Bu istek her öğün girişinde arka planda otomatik atılır; ücretsiz
  // kullanıcılarda günlük AI öneri sınırı dolduğunda hata yerine sessizce
  // yerel yedeğe düşülür.
  const usage = await checkAndConsumeUsage(request, "nutrition_advice", auth.user.id);
  if ("error" in usage || !usage.allowed) return Response.json({ advice: fallback, source: "fallback" });

  const languageInstruction = locale === "en" ? "in English" : "Türkçe";

  // Kullanıcının beslenme tercihleri (vejetaryen, sevmediği besinler, alerji)
  // doğrudan bu öneriyi belirler: "tavuk ekle" demek, tavuk yemeyen birine
  // öneriyi tamamen kullanışsız yapar.
  const memories = await loadMemories(request);

  // Kalan makrolar BURADA hesaplanır (nutritionGaps), modele çıkarma
  // yaptırılmaz — yerel öneriyle birebir aynı sayıyı görür.
  const facts = { ...nutritionGaps(input), targets: { calories: input.calorieTarget, protein: input.proteinTarget, carbs: input.carbsTarget, fat: input.fatTarget }, consumed: input.totals, mealsLogged: input.meals.length };

  try {
    const result = await generateCoachTaskText({
      category: "nutrition_explanation",
      locale,
      memories,
      facts,
      knowledgeQuery: "protein beslenme öğün kalori",
      // Öğün adları kullanıcı girdisidir; güvenlik katmanından geçirilir.
      userText: input.meals.map((meal) => meal.name).join(" "),
      domainRules: ADVICE_SYSTEM_PROMPT,
      prompt: `Aşağıdaki anonim günlük beslenme özetine göre ${languageInstruction}, tıbbi olmayan ve tek paragraf halinde en fazla 65 kelimelik bir sonraki öğün önerisi yaz. Kesin sağlık iddiası üretme. Eksik makrolara odaklan ve 2-4 yaygın besin örneği ver. Kalori hedefini aşmayı teşvik etme.\n\nBugün kaydedilen öğünler: ${JSON.stringify(input.meals)}`,
      temperature: 0.3,
      maxOutputTokens: outputTokenLimit("nutrition_advice", usage.planTier),
      abortSignal: AbortSignal.timeout(15_000),
    });
    if (result.text.trim()) return Response.json({ advice: result.text.trim(), source: "ai" });
  } catch {
    // Yerel yedeğe düşülür.
  }
  // AI'dan kullanılabilir bir öneri gelmedi; kullanıcının günlük hakkı iade edilir.
  if (Number.isFinite(usage.limit)) await refundUsage(auth.user.id, "nutrition_advice");
  return Response.json({ advice: fallback, source: "fallback" });
}

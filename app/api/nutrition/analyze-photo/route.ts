import { authenticateRequest } from "../../../../lib/api-auth.ts";
import { estimateFoodPhoto } from "../../../../lib/ai-food-photo-estimator.ts";
import { hasRemoteProvider, parseImageDataUrl } from "../../../../lib/ai/providers/openai-compatible.ts";
import { rateLimit, tooManyRequests } from "../../../../lib/rate-limit.ts";
import { checkAndConsumeUsage, outputTokenLimit, refundUsage, usageLimitExceeded } from "../../../../lib/usage-limits.ts";

export const runtime = "edge";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request); if ("error" in auth) return auth.error;
  const limited = rateLimit(`nutrition-photo:${auth.user.id}`, 5, 60_000); if (!limited.ok) return tooManyRequests(limited.retryAfterSeconds);
  const body = await request.json().catch(() => ({})) as { imageDataUrl?: unknown };
  const image = typeof body.imageDataUrl === "string" ? parseImageDataUrl(body.imageDataUrl) : null;
  if (!image || !["image/jpeg", "image/png", "image/webp"].includes(image.mimeType)) return Response.json({ error: "Geçerli bir JPG, PNG veya WebP öğün fotoğrafı seç." }, { status: 400 });
  if (!hasRemoteProvider()) return Response.json({ error: "Fotoğraflı öğün analizi yapılandırılmamış." }, { status: 503 });
  const usage = await checkAndConsumeUsage(request, "photo", auth.user.id); if ("error" in usage) return usage.error;
  if (!usage.allowed) return usageLimitExceeded("photo", usage.used, usage.limit);
  try {
    const analysis = await estimateFoodPhoto(image, outputTokenLimit("photo", usage.planTier));
    if (!analysis) { if (Number.isFinite(usage.limit)) await refundUsage(auth.user.id, "photo"); return Response.json({ error: "Fotoğrafta güvenle analiz edilebilen bir öğün bulunamadı." }, { status: 422 }); }
    return Response.json({ ...analysis, isEstimated: true, warning: "Fotoğraftan porsiyon ve besin değeri tahminidir; kaydetmeden önce miktarları kontrol et.", usage: { used: usage.used, limit: usage.limit } });
  } catch (error) {
    console.error("[nutrition-photo] analysis failed", error instanceof Error ? error.name : "unknown");
    if (Number.isFinite(usage.limit)) await refundUsage(auth.user.id, "photo");
    return Response.json({ error: "Fotoğraf analizi tamamlanamadı; tekrar deneyebilirsin." }, { status: 502 });
  }
}

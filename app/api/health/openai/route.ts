import { generateCoachResponse } from "../../../../lib/ai/coach.ts";
import { clientKey, rateLimit, tooManyRequests } from "../../../../lib/rate-limit.ts";

export const runtime = "edge";

function sameSecret(expected: string, supplied: string): boolean {
  if (!expected || !supplied) return false;
  const encoder = new TextEncoder();
  const left = encoder.encode(expected);
  const right = encoder.encode(supplied);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

/**
 * Protected deployment health check. It verifies that the server-side API key
 * can access the exact model used by Fit Coach without exposing the key or
 * provider response to clients. Calls are intentionally rate-limited because
 * this check runs a small real generation.
 */
export async function POST(request: Request) {
  const attempt = rateLimit(`deploy-health:${clientKey(request)}`, 5, 5 * 60_000);
  if (!attempt.ok) return tooManyRequests(attempt.retryAfterSeconds);

  const expectedToken = process.env.DEPLOY_HEALTH_TOKEN || "";
  const suppliedToken = request.headers.get("x-deploy-health-token") || "";
  if (!sameSecret(expectedToken, suppliedToken)) {
    return Response.json({ ok: false }, { status: 404 });
  }

  try {
    // Use the real Fit Coach prompt path, output budget and timeout. A tiny
    // "OK" prompt can pass while the production coach context times out.
    const result = await generateCoachResponse({
      messages: [{ role: "user", text: "Bugün için kısa bir antrenman öner." }],
      locale: "tr",
      signals: {},
      memories: [],
      category: "conversation",
      policy: { mode: "remote" },
      maxOutputTokens: 640,
      abortSignal: AbortSignal.timeout(35_000),
    });
    if (!result.text.trim()) return Response.json({ ok: false, reason: "empty_response" }, { status: 503 });
    return Response.json({ ok: true, model: result.model });
  } catch {
    return Response.json({ ok: false, reason: "generation_failed" }, { status: 503 });
  }
}

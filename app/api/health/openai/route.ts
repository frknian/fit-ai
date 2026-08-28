import { generateCoachResponse } from "../../../../lib/ai/coach.ts";

export const runtime = "edge";

/**
 * Cost-free deployment health check. It verifies that the server-side API key
 * can access the exact model used by Fit Coach, without generating text or
 * exposing the key/provider response to clients.
 */
export async function POST(request: Request) {
  const expectedToken = process.env.DEPLOY_HEALTH_TOKEN || "";
  const suppliedToken = request.headers.get("x-deploy-health-token") || "";
  if (!expectedToken || suppliedToken !== expectedToken) {
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

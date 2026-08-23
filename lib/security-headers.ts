// OWASP A05 – Security Misconfiguration: backend yanıtlarına eklenen savunma başlıkları.
export const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "upgrade-insecure-requests",
].join("; ");

export const securityHeaders: Record<string, string> = {
  "Content-Security-Policy": contentSecurityPolicy,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Cross-Origin-Opener-Policy": "same-origin",
  "X-DNS-Prefetch-Control": "off",
};

const BODYLESS_STATUSES = new Set([101, 204, 205, 304]);

/**
 * Yanıtı, güvenlik başlıkları eklenmiş yeni bir yanıtla değiştirir. Mevcut başlıklar ezilmez.
 * `noStore` yalnızca API yanıtları için kullanılır; statik varlıkların önbelleklenmesi bozulmaz.
 */
export function withSecurityHeaders(response: Response, options: { noStore?: boolean } = {}): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  if (options.noStore) headers.set("Cache-Control", "no-store");
  const body = BODYLESS_STATUSES.has(response.status) ? null : response.body;
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

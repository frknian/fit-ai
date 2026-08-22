// OWASP A05 – Security Misconfiguration: tüm yanıtlara eklenen tarayıcı savunma başlıkları.
// Tek kaynak: hem Cloudflare Worker girişinde hem de Next `headers()` yapılandırmasında kullanılır.

import { MAP_TILE_CSP_ORIGINS } from "./map-tiles.ts";

// CSP, tema betiği satır içi olduğu için script-src'de 'unsafe-inline' gerektirir;
// bu betik statik bir sabittir ve kullanıcı girdisi içermez.
export const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://accounts.google.com",
  // Google Identity Services kendi düğmesini çizerken bir stil sayfası
  // yükler (accounts.google.com/gsi/style); bu olmadan düğme markasız/çıplak
  // görünüyordu. script/frame/connect zaten bu kaynağa izin veriyordu, yalnız
  // style-src unutulmuştu.
  "style-src 'self' 'unsafe-inline' https://accounts.google.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "frame-src https://accounts.google.com",
  // Harita döşemeleri: MapLibre bunları bir worker'dan fetch ile çeker, yani
  // img-src değil connect-src izni gerekir (bkz. lib/map-tiles.ts).
  `connect-src 'self' https://*.supabase.co https://*.supabase.in https://accounts.google.com ${MAP_TILE_CSP_ORIGINS.join(" ")}`,
  "media-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

export const securityHeaders: Record<string, string> = {
  "Content-Security-Policy": contentSecurityPolicy,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // geolocation=(self): Hedefit Rota'nın canlı GPS takibi, native cihazlarda
  // Capacitor plugin köprüsünden geçse de, plugin'in web-fallback yolu ve
  // masaüstü tarayıcı testleri tarayıcının navigator.geolocation API'sini
  // kullanır; bu başlık kapalıyken o çağrı sessizce reddedilir.
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=(self), interest-cohort=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  // Google Identity Services popup'ı kimlik bilgisini ana pencereye postMessage ile iletir.
  // İzolasyonu korurken yalnızca bu popup iletişimine izin ver.
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
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

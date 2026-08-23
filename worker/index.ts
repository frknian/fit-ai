/** Cloudflare Worker entry point for the Hedefit API. */
import { withSecurityHeaders } from "../lib/security-headers";
import { handleSupabaseProxy } from "./supabase-proxy";

type Env = Record<string, unknown>;

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type AppRouterHandler = {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
};

let appRouterHandler: Promise<AppRouterHandler> | null = null;

function getAppRouterHandler() {
  appRouterHandler ??= import("vinext/server/app-router-entry").then((module) => module.default);
  return appRouterHandler;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Supabase auth/data trafiğini Vinext ve React route motorunu başlatmadan geçir.
    // Bu yol Cloudflare ücretsiz Worker CPU limitinin altında kalacak kadar hafiftir.
    const supabaseResponse = await handleSupabaseProxy(request);
    if (supabaseResponse) return withSecurityHeaders(supabaseResponse, { noStore: true });

    // API yanıtları kimlik doğrulamalı olduğu için hiçbir katmanda önbelleğe alınmaz.
    const handler = await getAppRouterHandler();
    return withSecurityHeaders(await handler.fetch(request, env, ctx), { noStore: url.pathname.startsWith("/api/") });
  },
};

export default worker;

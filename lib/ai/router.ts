// Model Router — hangi sağlayıcının, hangi sırayla deneneceği.
//
// Zincir kuralı:
//
//   uzak sağlayıcı
//         ↓ hata
//   deterministik güvenli yedek
//
// Ham sağlayıcı hatası ASLA kullanıcıya ulaşmaz; teknik ayrıntı yalnızca
// telemetriye (sınıflandırılmış olarak) gider.
//

import { AiAllProvidersFailedError, AiUnsupportedRequestError } from "./errors.ts";
import { providerRegistry } from "./providers/registry.ts";
import { classifyError, consoleEventSink, createEvent, type AiEventSink } from "./telemetry.ts";
import type { AIProvider, AiObjectRequest, AiObjectResponse, AiRequest, AiResponse } from "./types.ts";

export type RoutingMode = "auto" | "local" | "remote";

export type RoutingPolicy = {
  /** "auto" = yerel öncelikli, "local" = yalnız yerel, "remote" = yalnız uzak. */
  mode?: RoutingMode;
  sink?: AiEventSink;
};

/**
 * Varsayılan yönlendirme modu, `AI_ROUTING_MODE` ile işletmeci tarafından
 * ezilebilir. Kullanılan senaryolar:
 *
 *   local  — sağlayıcı kotası dolduğunda/olay anında ücretli çağrıyı tamamen
 *            kesip uygulamayı güvenli şablon yanıtlarla ayakta tutmak
 *   remote — yerel katmanı devre dışı bırakıp yalnız modeli ölçmek
 *
 */
function defaultMode(): RoutingMode | undefined {
  const mode = process.env.AI_ROUTING_MODE;
  return mode === "local" || mode === "remote" || mode === "auto" ? mode : undefined;
}

/** Sağlayıcı bu kategoriyi normal sırada işleyebilir mi? */
function supportsCategory(provider: AIProvider, request: AiRequest): boolean {
  if (!provider.categories) return true;
  return provider.categories.includes(request.category);
}

/** Sağlayıcı bu kategoriyi yalnızca son çare olarak işleyebilir mi? */
function supportsAsLastResort(provider: AIProvider, request: AiRequest): boolean {
  return Boolean(provider.lastResortCategories?.includes(request.category));
}

function allowedByMode(provider: AIProvider, mode: RoutingPolicy["mode"]): boolean {
  if (mode === "local") return provider.kind === "local";
  if (mode === "remote") return provider.kind === "remote";
  return true;
}

/**
 * İstek için denenecek sağlayıcı zinciri. `needsObject` true ise
 * `generateObject` uygulamayan sağlayıcılar (ör. deterministik yerel) elenir —
 * şema gerektiren bir işi yapamayan sağlayıcıyı denemek boşuna gecikmedir.
 */
export async function selectProviders(request: AiRequest, policy: RoutingPolicy = {}, needsObject = false): Promise<AIProvider[]> {
  const preferred: AIProvider[] = [];
  const lastResort: AIProvider[] = [];
  const mode = policy.mode ?? defaultMode();
  for (const provider of providerRegistry.list()) {
    if (!allowedByMode(provider, mode)) continue;
    if (needsObject && !provider.generateObject) continue;
    if (!(await provider.isAvailable())) continue;
    if (supportsCategory(provider, request)) preferred.push(provider);
    else if (supportsAsLastResort(provider, request)) lastResort.push(provider);
  }
  // Son çare sağlayıcıları HER ZAMAN zincirin sonunda. Böylece serbest
  // sohbette önce gerçek model denenir; yalnızca o da başarısız olursa
  // kullanıcı boş ekran yerine güvenli bir genel yanıt görür.
  return [...preferred, ...lastResort];
}

async function runChain<TResponse extends { provider: string; model: string; latencyMs: number; usage?: { inputTokens?: number; outputTokens?: number } }>(
  request: AiRequest,
  policy: RoutingPolicy,
  needsObject: boolean,
  invoke: (provider: AIProvider) => Promise<TResponse>,
): Promise<TResponse & { fallbackUsed: boolean }> {
  const sink = policy.sink ?? consoleEventSink;
  const chain = await selectProviders(request, policy, needsObject);
  const failures: Array<{ provider: string; message: string }> = [];

  for (const [index, provider] of chain.entries()) {
    try {
      const response = await invoke(provider);
      const fallbackUsed = index > 0;
      sink(createEvent({
        category: request.category,
        provider: provider.id,
        model: response.model,
        outcome: "success",
        fallbackUsed,
        latencyMs: response.latencyMs,
        inputTokens: response.usage?.inputTokens,
        outputTokens: response.usage?.outputTokens,
        ...(provider.kind === "local" && provider.id !== "local-deterministic" ? { runtime: "litert-lm" as const } : {}),
      }));
      return { ...response, fallbackUsed };
    } catch (error) {
      const errorKind = classifyError(error);
      // "Bu işi yapamam" bir arıza değildir; zincirde sessizce atlanır.
      const unsupported = error instanceof AiUnsupportedRequestError;
      sink(createEvent({
        category: request.category,
        provider: provider.id,
        outcome: unsupported ? "skipped" : "error",
        fallbackUsed: index > 0,
        errorKind,
      }));
      failures.push({ provider: provider.id, message: errorKind });
      // İPTAL YEDEKLEME SEBEBİ DEĞİLDİR.
      //
      // Kullanıcı "durdur"a bastığında ya da sekmeyi kapattığında, arkasından
      // ücretli bir uzak çağrı başlatmak hem parayı boşa harcar hem de
      // kullanıcının açıkça istemediği bir işi yapar. Bu yüzden iptal, zinciri
      // olduğu yerde bitirir; sonraki sağlayıcı DENENMEZ.
      if (request.abortSignal?.aborted) break;
    }
  }
  throw new AiAllProvidersFailedError(failures);
}

export async function routeText(request: AiRequest, policy: RoutingPolicy = {}): Promise<AiResponse> {
  return runChain(request, policy, false, (provider) => provider.generateText(request));
}

export async function routeObject<T>(request: AiObjectRequest<T>, policy: RoutingPolicy = {}): Promise<AiObjectResponse<T>> {
  return runChain(request, policy, true, (provider) => provider.generateObject!<T>(request));
}

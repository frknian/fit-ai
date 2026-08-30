import type { AiTaskCategory } from "./types.ts";

export type AiModelTier = "cheap" | "standard" | "advanced";

/**
 * Hedefit'in tek model kaynağı. Değerler yalnız sunucu ortamından okunur;
 * istemciye model anahtarı veya sağlayıcı anahtarı gönderilmez.
 */
export const AI_MODELS: Record<AiModelTier, () => string> = {
  // Basit sohbet, besin çıkarımı ve görsel okuma hızlı 4o katmanındadır.
  cheap: () => process.env.OPENAI_MODEL_CHEAP || "gpt-4o",
  standard: () => process.env.OPENAI_MODEL_STANDARD || "gpt-4o",
  // 15 soruluk kişisel plan ve haftalık muhakeme güçlü reasoning modeline gider.
  advanced: () => process.env.OPENAI_MODEL_ADVANCED || "gpt-5.1",
};

export function tierForTask(category: AiTaskCategory): AiModelTier {
  if (category === "complex_reasoning" || category === "plan_generation") return "advanced";
  if (category === "structured_extraction") return "cheap";
  return "standard";
}

export function modelForTask(category: AiTaskCategory): string {
  return AI_MODELS[tierForTask(category)]();
}

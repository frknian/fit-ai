import type { AiTaskCategory } from "./types.ts";

export type AiModelTier = "cheap" | "standard" | "advanced";

/**
 * Hedefit'in tek model kaynağı. Değerler yalnız sunucu ortamından okunur;
 * istemciye model anahtarı veya sağlayıcı anahtarı gönderilmez.
 */
export const AI_MODELS: Record<AiModelTier, () => string> = {
  cheap: () => process.env.OPENAI_MODEL_CHEAP || "gpt-5.6-luna",
  standard: () => process.env.OPENAI_MODEL_STANDARD || "gpt-5.6-terra",
  advanced: () => process.env.OPENAI_MODEL_ADVANCED || "gpt-5.6-sol",
};

export function tierForTask(category: AiTaskCategory): AiModelTier {
  if (category === "vision" || category === "complex_reasoning" || category === "plan_generation") return "advanced";
  if (category === "structured_extraction") return "cheap";
  return "standard";
}

export function modelForTask(category: AiTaskCategory): string {
  return AI_MODELS[tierForTask(category)]();
}

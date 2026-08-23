import { createClient } from "@supabase/supabase-js";
import { bearerToken } from "./api-auth.ts";
import { normalizeSupabaseUrl } from "./supabase/url.ts";
import { validateManualNutrition } from "./nutrition-calculation.ts";

export const MEAL_TYPES = ["Kahvaltı", "Öğle yemeği", "Akşam yemeği", "Atıştırmalık"] as const;
export const INPUT_METHODS = ["natural_language", "photo", "search", "favorite", "recent", "manual", "barcode"] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Gerçek bir UUID (v1-5) biçimini doğrular; app/api/nutrition/logs/[id]/route.ts ile paylaşılır. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export type NutritionLogInput = {
  foodId: string | null;
  loggedDate: string;
  mealType: (typeof MEAL_TYPES)[number];
  foodName: string;
  portionGrams: number;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number;
  inputMethod: (typeof INPUT_METHODS)[number];
  confidence: number | null;
  isEstimated: boolean;
  metadata: Record<string, unknown>;
};

function boundedNumber(value: unknown, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= maximum ? parsed : NaN;
}

export function validateNutritionLogInput(value: unknown, partial = false): Partial<NutritionLogInput> | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const result: Partial<NutritionLogInput> = {};
  const required = (key: string) => !partial || key in input;

  if (required("foodId")) {
    if (input.foodId !== null && (typeof input.foodId !== "string" || !isUuid(input.foodId))) return null;
    result.foodId = input.foodId as string | null;
  }
  if (required("loggedDate")) {
    if (typeof input.loggedDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.loggedDate)) return null;
    result.loggedDate = input.loggedDate;
  }
  if (required("mealType")) {
    if (!MEAL_TYPES.includes(input.mealType as NutritionLogInput["mealType"])) return null;
    result.mealType = input.mealType as NutritionLogInput["mealType"];
  }
  if (required("foodName")) {
    const name = typeof input.foodName === "string" ? input.foodName.trim().slice(0, 160) : "";
    if (!name) return null;
    result.foodName = name;
  }
  for (const [key, maximum] of [["portionGrams", 5_000], ["calories", 20_000], ["protein", 2_000], ["carbohydrates", 5_000], ["fat", 2_000], ["fiber", 1_000]] as const) {
    if (!required(key)) continue;
    const parsed = boundedNumber(input[key], maximum);
    if (!Number.isFinite(parsed) || (key === "portionGrams" && parsed <= 0)) return null;
    result[key] = parsed;
  }
  if (required("inputMethod")) {
    if (!INPUT_METHODS.includes(input.inputMethod as NutritionLogInput["inputMethod"])) return null;
    result.inputMethod = input.inputMethod as NutritionLogInput["inputMethod"];
  }
  if (required("confidence")) {
    if (input.confidence !== null) {
      const confidence = Number(input.confidence);
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
      result.confidence = confidence;
    } else result.confidence = null;
  }
  if (required("isEstimated")) {
    if (typeof input.isEstimated !== "boolean") return null;
    result.isEstimated = input.isEstimated;
  }
  if (required("metadata")) {
    if (!input.metadata || typeof input.metadata !== "object" || Array.isArray(input.metadata)) return null;
    const serialized = JSON.stringify(input.metadata);
    if (serialized.length > 8_000) return null;
    result.metadata = input.metadata as Record<string, unknown>;
  }

  if (!partial) {
    const full = result as NutritionLogInput;
    const validation = validateManualNutrition({
      portionGrams: full.portionGrams,
      calories: full.calories,
      protein: full.protein,
      carbohydrates: full.carbohydrates,
      fat: full.fat,
      fiber: full.fiber,
    });
    if (!validation.valid) return null;
  }
  return result;
}

export function nutritionUserClient(request: Request) {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = bearerToken(request);
  if (!url || !anonKey || !token) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export function sourceForInputMethod(inputMethod: NutritionLogInput["inputMethod"]) {
  if (inputMethod === "photo") return "Fotoğraf";
  if (inputMethod === "barcode") return "Barkod";
  // Üretimdeki eski food_entries kısıtı yalnızca "Manuel" değerini kabul
  // ediyor. Gerçek kaynak input_method=natural_language alanında tutulur;
  // arayüz bu eski teknik etiketi kullanıcıya daima "AI analizi" gösterir.
  return "Manuel";
}

export function toFoodEntryRow(input: Partial<NutritionLogInput>) {
  const row: Record<string, unknown> = {};
  if ("foodId" in input) row.food_id = input.foodId;
  if ("loggedDate" in input) row.logged_date = input.loggedDate;
  if ("mealType" in input) row.meal = input.mealType;
  if ("foodName" in input) row.name = input.foodName;
  if ("portionGrams" in input) row.grams = input.portionGrams;
  if ("calories" in input) row.calories = Math.round(input.calories || 0);
  if ("protein" in input) row.protein_g = input.protein;
  if ("carbohydrates" in input) row.carbs_g = input.carbohydrates;
  if ("fat" in input) row.fat_g = input.fat;
  if ("fiber" in input) row.fiber_g = input.fiber;
  if ("inputMethod" in input && input.inputMethod) {
    row.input_method = input.inputMethod;
    row.source = sourceForInputMethod(input.inputMethod);
  }
  if ("confidence" in input) row.confidence = input.confidence;
  if ("isEstimated" in input) row.is_estimated = input.isEstimated;
  if ("metadata" in input) row.metadata = input.metadata;
  row.updated_at = new Date().toISOString();
  return row;
}

// Bazı kurulu veritabanlarında eski food_entries tablosunda grams ve fiber_g
// sütunları henüz bulunmuyor. Porsiyon ayrıntılarını mevcut metadata sütununda
// saklayarak aynı API'nin hem eski hem yeni şemada güvenle çalışmasını sağlar.
export function toCompatibleFoodEntryRow(input: Partial<NutritionLogInput>) {
  const row = toFoodEntryRow(input);
  const shouldPersistMetadata = "metadata" in input || "portionGrams" in input || "fiber" in input;
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? { ...(row.metadata as Record<string, unknown>) }
    : {};
  if ("grams" in row) {
    metadata.portionGrams = row.grams;
    delete row.grams;
  }
  if ("fiber_g" in row) {
    metadata.fiber = row.fiber_g;
    delete row.fiber_g;
  }
  if (shouldPersistMetadata) row.metadata = metadata;
  return row;
}

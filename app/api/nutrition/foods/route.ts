import { authenticateRequest, bearerToken } from "@/lib/api-auth";
import { normalizeSupabaseUrl } from "@/lib/supabase/url";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createClient } from "@supabase/supabase-js";
import { normalizeCaloriesPer100g } from "@/lib/food-energy";
import { foodSearchQueries } from "@/lib/food-search";
import { searchDefaultFoods } from "@/lib/default-food-catalog";

export const runtime = "edge";

type FoodResult = {
  id: string;
  name: string;
  brand: string | null;
  servingGrams: number;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodiumMg: number;
  potassiumMg: number;
  calciumMg: number;
  ironMg: number;
  vitaminCMg: number;
  verified: boolean;
  source: string;
};

const finite = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

function localFood(item: Record<string, unknown>, locale: "tr" | "en"): FoodResult {
  const raw = item.raw_source_data && typeof item.raw_source_data === "object" ? item.raw_source_data as Record<string, unknown> : {};
  const protein = finite(item.protein_per_100g);
  const carbohydrates = finite(item.carbs_per_100g);
  const fat = finite(item.fat_per_100g);
  return {
    id: String(item.id), name: String(locale === "en" ? (item.canonical_name || item.display_name_tr) : (item.display_name_tr || item.canonical_name)), brand: item.brand ? String(item.brand) : null,
    servingGrams: finite(item.serving_size_grams) || 100,
    calories: normalizeCaloriesPer100g(item.calories_per_100g, protein, carbohydrates, fat), protein, carbohydrates,
    fat, fiber: finite(item.fiber_per_100g), sugar: finite(raw.sugar), sodiumMg: finite(raw.sodiumMg),
    potassiumMg: finite(raw.potassiumMg), calciumMg: finite(raw.calciumMg), ironMg: finite(raw.ironMg), vitaminCMg: finite(raw.vitaminCMg),
    verified: item.verified === true || item.data_quality === "verified", source: String(item.source || "local"),
  };
}

function usdaFood(item: Record<string, unknown>): FoodResult {
  const nutrients = Array.isArray(item.foodNutrients) ? item.foodNutrients as Record<string, unknown>[] : [];
  const nutrient = (...names: string[]) => {
    const found = nutrients.find((entry) => names.some((name) => String(entry.nutrientName || entry.name || "").toLowerCase().includes(name)));
    return finite(found?.value ?? found?.amount);
  };
  const energy = nutrients.find((entry) => String(entry.nutrientName || entry.name || "").toLowerCase().includes("energy") && String(entry.unitName || entry.unit || "").toLowerCase() === "kcal");
  return {
    id: `usda-${item.fdcId}`, name: String(item.description || "Besin"), brand: item.brandOwner ? String(item.brandOwner) : null,
    servingGrams: finite(item.servingSize) || 100,
    calories: finite(energy?.value ?? energy?.amount), protein: nutrient("protein"), carbohydrates: nutrient("carbohydrate"), fat: nutrient("total lipid", "total fat"),
    fiber: nutrient("fiber"), sugar: nutrient("sugars"), sodiumMg: nutrient("sodium"), potassiumMg: nutrient("potassium"),
    calciumMg: nutrient("calcium"), ironMg: nutrient("iron"), vitaminCMg: nutrient("vitamin c"),
    verified: ["Foundation", "SR Legacy", "Survey (FNDDS)"].includes(String(item.dataType)), source: `USDA ${item.dataType || "FoodData Central"}`,
  };
}

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  const limited = rateLimit(`food-search:${auth.user.id}`, 40, 60_000);
  if (!limited.ok) return tooManyRequests(limited.retryAfterSeconds);
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80) || "";
  const locale: "tr" | "en" = new URL(request.url).searchParams.get("locale") === "en" ? "en" : "tr";
  if (query.length < 2) return Response.json({ items: [] });
  const searchQueries = foodSearchQueries(query);
  const defaults: FoodResult[] = searchDefaultFoods(query, 12, locale).map((item) => ({
    id: `default-${item.id}`, name: locale === "en" ? item.nameEn : item.name, brand: null, servingGrams: 100,
    calories: item.calories, protein: item.protein, carbohydrates: item.carbohydrates,
    fat: item.fat, fiber: item.fiber, sugar: 0, sodiumMg: 0, potassiumMg: 0,
    calciumMg: 0, ironMg: 0, vitaminCMg: 0, verified: true, source: "Hedefit referans kataloğu",
  }));

  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = bearerToken(request);
  const local: FoodResult[] = [];
  let localFailed = false;
  if (url && anonKey && token) {
    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    const responses = await Promise.all(searchQueries.map((searchQuery) => client.rpc("search_foods", { p_query: searchQuery, p_limit: 10 })));
    localFailed = responses.every(({ error }) => Boolean(error));
    for (const { data, error } of responses) {
      if (error) {
        console.error("[nutrition/foods] local catalog search failed", { query, code: error.code, message: error.message });
        continue;
      }
      local.push(...(data || []).map((item: Record<string, unknown>) => localFood(item, locale)));
    }
  }

  const apiKey = process.env.USDA_FDC_API_KEY || "DEMO_KEY";
  let provider: FoodResult[] = [];
  let providerFailed = false;
  try {
    if (locale === "tr") throw new Error("USDA is skipped for Turkish-only catalogue results");
    const providerQuery = searchQueries.at(-1) || query;
    const response = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(providerQuery)}&pageSize=20&dataType=Foundation,SR%20Legacy,Survey%20(FNDDS),Branded`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
    if (response.ok) {
      const body = await response.json() as { foods?: Record<string, unknown>[] };
      provider = (body.foods || []).map(usdaFood);
    } else providerFailed = true;
  } catch (error) {
    providerFailed = true;
    console.error("[nutrition/foods] USDA search failed", { query, message: error instanceof Error ? error.message : String(error) });
  }

  if (localFailed && providerFailed && defaults.length === 0) {
    return Response.json({ error: "Besin kataloğuna şu anda ulaşılamıyor." }, { status: 503 });
  }

  const seen = new Set<string>();
  const items = [...local, ...defaults, ...provider].filter((item) => {
    const key = `${item.name.toLocaleLowerCase("tr-TR")}|${item.brand || ""}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 24);
  return Response.json({ items, sources: { local: local.length, default: defaults.length, usda: provider.length }, queries: searchQueries }, { headers: { "Cache-Control": "private, max-age=300" } });
}

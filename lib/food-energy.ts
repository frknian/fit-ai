const nonNegative = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

/**
 * Some legacy USDA catalogue rows stored kilojoules in the kcal column.
 * Prefer the value whose energy is consistent with the row's macros, while
 * leaving legitimate kcal values (and rows without useful macros) untouched.
 */
export function normalizeCaloriesPer100g(
  value: unknown,
  protein: unknown,
  carbohydrates: unknown,
  fat: unknown,
): number {
  const raw = nonNegative(value);
  const macroCalories = nonNegative(protein) * 4 + nonNegative(carbohydrates) * 4 + nonNegative(fat) * 9;
  if (raw === 0 || macroCalories < 15) return raw;

  const converted = raw / 4.184;
  const scale = Math.max(50, macroCalories);
  const kcalDistance = Math.abs(raw - macroCalories) / scale;
  const convertedDistance = Math.abs(converted - macroCalories) / scale;

  if (convertedDistance <= 0.35 && convertedDistance + 0.2 < kcalDistance) {
    return Math.round(converted);
  }
  return raw;
}

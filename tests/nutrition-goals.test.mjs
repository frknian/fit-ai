import assert from "node:assert/strict";
import test from "node:test";
import { calculateNutritionGoal, calculateWeeklyWeightTrend, inferNutritionGoal, inferWorkoutDays, nextMealSuggestion, nutritionGoalWarning, weightTrendAdvice } from "../lib/nutrition-goals.ts";
import { tr } from "../lib/i18n/dictionaries/tr.ts";

const base = { bmr: 1700, tdee: 2400, weightKg: 75, activityFactor: 1.375, workoutDays: 4 };

test("derives safe calorie and macro targets for all goals", () => {
  const loss = calculateNutritionGoal({ ...base, goalType: "lose" });
  const maintenance = calculateNutritionGoal({ ...base, goalType: "maintain" });
  const gain = calculateNutritionGoal({ ...base, goalType: "gain" });
  assert.ok(loss.calorieTarget < base.tdee && loss.calorieTarget >= base.bmr);
  assert.equal(maintenance.calorieTarget, base.tdee);
  assert.ok(gain.calorieTarget > base.tdee);
  for (const goal of [loss, maintenance, gain]) {
    assert.ok(goal.proteinGrams > 0 && goal.carbsGrams > 0 && goal.fatGrams > 0);
    assert.ok(Math.abs(goal.proteinGrams * 4 + goal.carbsGrams * 4 + goal.fatGrams * 9 - goal.calorieTarget) <= 12);
  }
});

test("keeps general protein goals practical instead of scaling without bound", () => {
  const highWeightLoss = calculateNutritionGoal({ ...base, weightKg: 130, workoutDays: 3, goalType: "fatLoss" });
  const regularAdult = calculateNutritionGoal({ ...base, weightKg: 82.5, workoutDays: 4, goalType: "lose" });
  assert.ok(highWeightLoss.proteinGrams <= 140);
  assert.equal(regularAdult.proteinGrams, 115);
  for (const goal of [highWeightLoss, regularAdult]) {
    const proteinShare = goal.proteinGrams * 4 / goal.calorieTarget;
    const carbsShare = goal.carbsGrams * 4 / goal.calorieTarget;
    const fatShare = goal.fatGrams * 9 / goal.calorieTarget;
    assert.ok(proteinShare >= 0.10 && proteinShare <= 0.28);
    assert.ok(carbsShare >= 0.44 && carbsShare <= 0.65);
    assert.ok(fatShare >= 0.20 && fatShare <= 0.35);
  }
});

test("infers goal and weekly training frequency from profile answers", () => {
  // Serbest metinde ikisi birden geçiyorsa yağ kaybı kazanır: daha küçük açık
  // ve daha yüksek protein üretir, yani tartıyı da düşürür ama kası korur.
  // Ters yönde bir hata (sert açık) kas kaybıyla sonuçlanırdı.
  assert.equal(inferNutritionGoal("Yağ yakıp kilo vermek"), "fatLoss");
  assert.equal(inferNutritionGoal("Kilo vermek"), "lose");
  assert.equal(inferNutritionGoal("Kas geliştirmek"), "gain");
  assert.equal(inferWorkoutDays("3–4 gün"), 4);
  assert.equal(inferWorkoutDays("5+ gün"), 5);
});

test("warns about aggressive manual calorie targets", () => {
  const goal = calculateNutritionGoal({ ...base, goalType: "lose" });
  assert.equal(nutritionGoalWarning(goal, tr), null);
  assert.match(nutritionGoalWarning({ ...goal, calorieTarget: 1500, calorieAdjustment: -900 }, tr) ?? "", /yüksek|altında/i);
});

test("creates a simple next meal focus from remaining macros", () => {
  const goal = calculateNutritionGoal({ ...base, goalType: "maintain" });
  assert.match(nextMealSuggestion({ calories: 900, protein: 20, carbs: 150, fat: 45 }, goal, tr), /Protein/i);
  assert.match(nextMealSuggestion({ calories: 2600, protein: 130, carbs: 300, fat: 90 }, goal, tr), /aştın/i);
});

test("tracks weekly weight change and flags overly fast loss", () => {
  const trend = calculateWeeklyWeightTrend([
    { measuredAt: "2026-07-01", weightKg: 80 },
    { measuredAt: "2026-07-15", weightKg: 77 },
  ]);
  assert.ok(trend);
  assert.ok((trend?.weeklyPercent ?? 0) < -1);
  assert.match(weightTrendAdvice(trend, "lose", tr), /agresif/i);
  assert.match(weightTrendAdvice(null, "gain", tr), /iki kilo ölçümü/i);
});

import assert from "node:assert/strict";
import test from "node:test";
import { searchExercises } from "../lib/exercise-service.ts";
import { translateExerciseName } from "../lib/exercise-translations.ts";

test("Türkçe görünen hareket adı aynı Türkçe ifadeyle aranabilir", () => {
  const results = searchExercises("barfiks");
  assert.ok(results.length > 0);
  assert.ok(results.some((exercise) => translateExerciseName(exercise.name).toLocaleLowerCase("tr-TR").includes("barfiks")));
});

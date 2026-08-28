// Fit Koç için hareket atlasından kanıta dayalı, küçük öneri seçkisi.
// Model serbestçe hareket adı uydurmaz; yalnız bu seçkideki hareketleri önerir.

import { filterExercises } from "../exercise-service.ts";
import { translateExerciseLabel, translateExerciseName } from "../exercise-translations.ts";

const TARGETS: Array<[RegExp, string]> = [
  [/(arka\s*kol|triceps)/i, "triceps"],
  [/(ön\s*kol|bilek|forearm)/i, "forearms"],
  [/(biceps|pazu|kol\s*kas)/i, "biceps"],
  [/(göğüs|chest|bench)/i, "chest"],
  [/(kanat|lat\b)/i, "lats"],
  [/(trapez|trap)/i, "traps"],
  [/(boyun|neck)/i, "neck"],
  [/(omuz|shoulder)/i, "shoulders"],
  [/(karın|core|abs?\b)/i, "abdominals"],
  [/(kalça|glute)/i, "glutes"],
  [/(dış\s*kalça|abductor)/i, "abductors"],
  [/(iç\s*bacak|adductor)/i, "adductors"],
  [/(baldır|calf)/i, "calves"],
  [/(arka\s*bacak|hamstring)/i, "hamstrings"],
  [/(ön\s*bacak|quad)/i, "quadriceps"],
  [/(sırt|back)/i, "back"],
];

function targetFor(question: string) {
  return TARGETS.find(([pattern]) => pattern.test(question))?.[1];
}

function availableAtHome(equipment: string | null) {
  return ["body only", "none", "bands", "dumbbell", "kettlebells", "exercise ball"].includes(equipment || "none");
}

export function atlasLines(question: string, profile: { environment?: string; equipment?: string }, locale: "tr" | "en"): string[] {
  const target = targetFor(question);
  if (!target) return [];
  const isHome = /ev|home/i.test(profile.environment || "");
  const candidates = filterExercises({ muscle: target })
    .filter((exercise) => !isHome || availableAtHome(exercise.equipment))
    .filter((exercise) => exercise.level !== "expert")
    .sort((a, b) => {
      const aPrimary = a.primaryMuscles.includes(target) ? 0 : 1;
      const bPrimary = b.primaryMuscles.includes(target) ? 0 : 1;
      const aCompound = a.mechanic === "compound" ? 0 : 1;
      const bCompound = b.mechanic === "compound" ? 0 : 1;
      return aPrimary - bPrimary || aCompound - bCompound || a.name.localeCompare(b.name);
    })
    .slice(0, 4);
  if (!candidates.length) return [];
  return candidates.map((exercise) => [
    translateExerciseName(exercise.name, locale),
    `hedef: ${translateExerciseLabel(target, locale)}`,
    `ekipman: ${translateExerciseLabel(exercise.equipment, locale)}`,
  ].join(" | "));
}

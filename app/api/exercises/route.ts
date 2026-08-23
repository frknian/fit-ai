import { filterExercises } from "@/lib/exercise-service";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { translateExerciseLabel, translateExerciseName, turkishExerciseInstructions } from "@/lib/exercise-translations";

const safeParam = (value: string | null) => (value || "").trim().slice(0, 100);

export function GET(request: Request) {
  // Herkese açık katalog: kimlik gerektirmez, ancak toplu kazımaya karşı sınırlandırılır.
  const rateLimitResult = rateLimit(`exercises:${clientKey(request)}`, 120, 60_000);
  if (!rateLimitResult.ok) return tooManyRequests(rateLimitResult.retryAfterSeconds);

  const { searchParams } = new URL(request.url);
  const locale = searchParams.get("locale") === "en" ? "en" : "tr";
  const page = Math.max(1, Math.min(1000, Number.parseInt(searchParams.get("page") || "1", 10) || 1));
  const limit = Math.max(1, Math.min(1000, Number.parseInt(searchParams.get("limit") || "24", 10) || 24));
  const environment = safeParam(searchParams.get("environment"));
  const muscle = safeParam(searchParams.get("muscle"));
  const muscleRole = safeParam(searchParams.get("muscleRole"));
  const force = safeParam(searchParams.get("force"));
  const mechanic = safeParam(searchParams.get("mechanic"));
  const muscleTargets = muscle === "back" ? ["middle back", "lower back", "lats", "traps"] : muscle ? [muscle] : [];
  const filtered = filterExercises({ search: safeParam(searchParams.get("search")), equipment: safeParam(searchParams.get("equipment")), level: safeParam(searchParams.get("level")), category: safeParam(searchParams.get("category")) });
  const byMuscle = muscleTargets.length
    ? filtered.filter((item) => [...item.primaryMuscles, ...item.secondaryMuscles].some((value) => muscleTargets.includes(value)))
    : filtered;
  const byEnvironment = environment === "gym"
    ? byMuscle.filter((item) => !["body only", "none", "bands"].includes(item.equipment || "none"))
    : environment === "home"
      ? byMuscle.filter((item) => ["body only", "none", "bands", "dumbbell", "kettlebells", "exercise ball"].includes(item.equipment || "none"))
      : byMuscle;
  const byRole = muscleRole === "primary" && muscle
    ? byEnvironment.filter((item) => item.primaryMuscles.some((value) => muscleTargets.includes(value)))
    : muscleRole === "secondary" && muscle
      ? byEnvironment.filter((item) => item.secondaryMuscles.some((value) => muscleTargets.includes(value)))
      : byEnvironment;
  const items = byRole
    .filter((item) => !force || item.force === force)
    .filter((item) => !mechanic || item.mechanic === mechanic)
    .sort((a, b) => {
      const aPrimary = a.primaryMuscles.some((value) => muscleTargets.includes(value));
      const bPrimary = b.primaryMuscles.some((value) => muscleTargets.includes(value));
      return muscle && aPrimary !== bPrimary ? (aPrimary ? -1 : 1) : a.name.localeCompare(b.name);
    });
  const offset = (page - 1) * limit;
  const localized = items.slice(offset, offset + limit).map((item) => ({
    ...item,
    name: translateExerciseName(item.name, locale),
    primaryMuscles: item.primaryMuscles.map((value) => translateExerciseLabel(value, locale)),
    secondaryMuscles: item.secondaryMuscles.map((value) => translateExerciseLabel(value, locale)),
    equipment: translateExerciseLabel(item.equipment, locale),
    level: translateExerciseLabel(item.level, locale),
    category: translateExerciseLabel(item.category, locale),
    instructions: turkishExerciseInstructions(item, locale),
  }));
  return Response.json({ items: localized, page, limit, total: items.length, totalPages: Math.ceil(items.length / limit), locale });
}

import exerciseData from "../data/exercises.json" with { type: "json" };
import { translateExerciseLabel, translateExerciseName } from "./exercise-translations.ts";
import type { AIExerciseContext, Exercise, ExerciseFilters } from "@/types/exercise";

const safeText = (value: unknown, fallback = "", maxLength = 300) => typeof value === "string" ? value.trim().slice(0, maxLength) : fallback;
const safeList = (value: unknown, limit = 20, maxLength = 300) => Array.isArray(value) ? value.map((item) => safeText(item, "", maxLength)).filter(Boolean).slice(0, limit) : [];
const safeImage = (value: unknown) => typeof value === "string" && /^\/exercise-images\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(value) ? value : null;
const fold = (value: string) => value.toLocaleLowerCase("en-US").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

export function normalizeExercise(value: unknown): Exercise | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const id = safeText(item.id).replace(/[^a-zA-Z0-9_-]/g, "");
  const name = safeText(item.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    force: safeText(item.force) || null,
    level: safeText(item.level, "beginner"),
    mechanic: safeText(item.mechanic) || null,
    equipment: safeText(item.equipment) || null,
    primaryMuscles: safeList(item.primaryMuscles),
    secondaryMuscles: safeList(item.secondaryMuscles),
    instructions: safeList(item.instructions, 12, 1200),
    category: safeText(item.category, "strength"),
    images: safeList(item.images, 4).map(safeImage).filter((image): image is string => Boolean(image)),
  };
}

const importedExercises = (exerciseData as unknown[]).map(normalizeExercise).filter((exercise): exercise is Exercise => Boolean(exercise));

/**
 * Free Exercise DB contains a small number of entries that describe the same
 * movement under two names. Keep the original rows addressable so old workout
 * plans do not break, but expose only the clearer canonical entry in catalogs.
 * Technique/equipment/grip variants are deliberately not merged.
 */
const duplicateExerciseNames = new Set([
  "Barbell Full Squat",
  "Calf Raise On A Dumbbell",
  "Decline Smith Press",
  "Incline Push-Up Medium",
  "Oblique Crunches - On The Floor",
  "Seated Flat Bench Leg Pull-In",
  "Triceps Overhead Extension with Rope",
]);

const exercises = Object.freeze(importedExercises.filter((exercise) => !duplicateExerciseNames.has(exercise.name)));
const exerciseById = new Map(importedExercises.map((exercise) => [exercise.id, exercise]));

export const getAllExercises = () => [...exercises];
export const getExerciseById = (id: string) => exerciseById.get(id.replace(/[^a-zA-Z0-9_-]/g, "")) ?? null;

/**
 * Aranabilir metin ÖNCEDEN hesaplanır.
 *
 * Eskiden her tuş vuruşunda 873 hareketin her biri için ad, kas grupları,
 * ekipman ve bunların Türkçe karşılıkları yeniden birleştirilip
 * normalize ediliyordu: aramanın her adımında on binlerce geçici dize.
 * Katalog uygulama ömrü boyunca değişmediği için bu iş bir kez yapılır ve
 * filtreleme tek bir `includes` çağrısına iner.
 */
const searchHaystacks = exercises.map((exercise) => fold([
  exercise.name,
  translateExerciseName(exercise.name),
  ...exercise.primaryMuscles,
  ...exercise.secondaryMuscles,
  exercise.equipment || "",
  ...exercise.primaryMuscles.map((item) => translateExerciseLabel(item)),
  ...exercise.secondaryMuscles.map((item) => translateExerciseLabel(item)),
  translateExerciseLabel(exercise.equipment),
].join(" ")));

/** Eşleşen hareketlerin katalog sırasındaki indeksleri. */
export function searchExerciseIndexes(query: string): number[] {
  const normalizedQuery = fold(query).slice(0, 100);
  const matches: number[] = [];
  if (!normalizedQuery) return matches;
  for (let index = 0; index < searchHaystacks.length; index += 1) {
    if (searchHaystacks[index].includes(normalizedQuery)) matches.push(index);
  }
  return matches;
}

export const getExerciseByIndex = (index: number) => exercises[index] ?? null;

export function searchExercises(query: string) {
  const normalizedQuery = fold(query).slice(0, 100);
  if (!normalizedQuery) return getAllExercises();
  return exercises.filter((_, index) => searchHaystacks[index].includes(normalizedQuery));
}

export function filterExercises(filters: ExerciseFilters = {}) {
  const search = fold(filters.search || "").slice(0, 100);
  const muscleTargets = expandMuscleFilter(filters.muscle || "");
  const equipment = fold(filters.equipment || "");
  const level = fold(filters.level || "");
  const category = fold(filters.category || "");
  return exercises.filter((exercise, index) => {
    return (!search || searchHaystacks[index].includes(search))
      && (!muscleTargets.length || [...exercise.primaryMuscles, ...exercise.secondaryMuscles].some((item) => muscleTargets.includes(fold(item))))
      && (!equipment || fold(exercise.equipment || "none") === equipment)
      && (!level || fold(exercise.level) === level)
      && (!category || fold(exercise.category) === category);
  });
}

const muscleGroups: Record<string, string[]> = {
  arms: ["biceps", "triceps", "forearms"],
  back: ["lats", "middle back", "lower back", "traps"],
  core: ["abdominals", "lower back"],
  hips: ["glutes", "adductors", "abductors"],
  legs: ["quadriceps", "hamstrings", "calves", "adductors"],
};

/** Expands a UI region (for example `back`) into the source catalog muscles. */
export function expandMuscleFilter(muscle: string): string[] {
  const normalized = fold(muscle);
  if (!normalized) return [];
  return muscleGroups[normalized] || [normalized];
}

export const getExerciseCatalogStats = () => ({
  imported: importedExercises.length,
  visible: exercises.length,
  hiddenDuplicates: importedExercises.length - exercises.length,
});

export const getExercisesByMuscle = (muscle: string) => filterExercises({ muscle });
export const getExercisesByEquipment = (equipment: string) => filterExercises({ equipment });
export const getExercisesByLevel = (level: string) => filterExercises({ level });

/**
 * Plan üretimine gönderilen katalog.
 *
 * Yalnız modelin seçim yaparken gerçekten kullandığı alanlar gider.
 * secondaryMuscles ve category isteme ~%40 fazladan token ekliyordu; katalog
 * zaten istemin en büyük parçası ve model bir akıl yürütme modeli olduğu için
 * bu, üretimi zaman aşımına kadar yavaşlatıyordu.
 */
export function getExercisesForAI(filters: ExerciseFilters = {}): AIExerciseContext[] {
  return filterExercises(filters).map(({ id, name, level, equipment, primaryMuscles }) => ({ id, name, level, equipment: equipment || undefined, primaryMuscles }));
}

// Her seçenek listesi, kendi boyutu dışındaki aktif filtrelere göre daraltılır.
// Böylece bir kas grubu seçildiğinde o kasta hareketi bulunmayan ekipman, seviye
// ve kategori seçenekleri listede kalmaz; kullanıcı boş sonuç veren bir filtre
// kombinasyonunu seçemez.
export function getExerciseFilterOptions(filters: ExerciseFilters = {}) {
  const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const excluding = (dimension: keyof ExerciseFilters) => filterExercises({ ...filters, [dimension]: undefined });
  return {
    muscles: unique(excluding("muscle").flatMap((exercise) => [...exercise.primaryMuscles, ...exercise.secondaryMuscles])),
    equipment: unique(excluding("equipment").map((exercise) => exercise.equipment || "none")),
    levels: unique(excluding("level").map((exercise) => exercise.level)),
    categories: unique(excluding("category").map((exercise) => exercise.category)),
  };
}

/**
 * Bir filtre boyutundaki her seçeneğin kaç harekete karşılık geldiği.
 *
 * Kütüphane 873 hareket içeriyor ve seçenekler eskiden isimsiz bir açılır
 * listede duruyordu: kullanıcı "sırt" seçmeden kaç hareket çıkacağını
 * bilmiyor, seçtikten sonra boş sonuç ekranıyla karşılaşabiliyordu. Sayı
 * seçeneğin yanında görünürse seçim körlemesine yapılmaz.
 *
 * Sayılar DİĞER filtreler uygulanmış hâlde hesaplanır: "dambıl" seçiliyken
 * "sırt" rozeti, dambılla yapılan sırt hareketi sayısını gösterir.
 */
export function countExercisesByFacet(
  filters: ExerciseFilters,
  dimension: "muscle" | "equipment" | "level" | "category",
): Record<string, number> {
  const options = getExerciseFilterOptions(filters);
  const values = dimension === "muscle" ? options.muscles
    : dimension === "equipment" ? options.equipment
    : dimension === "level" ? options.levels
    : options.categories;
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = filterExercises({ ...filters, [dimension]: value }).length;
  return counts;
}

// Katalogdaki İngilizce `equipment` etiketlerinin, kullanıcının seçebildiği
// ekipmanlara karşılığı. Salon dışındaki bir kullanıcıya barbell/cable/machine
// göndermenin anlamı yok: model onları seçemez, ama tokenini yer.
const EQUIPMENT_TAG_SYNONYMS: Record<string, string[]> = {
  "dumbbell": ["dambıl"],
  "kettlebells": ["kettlebell", "dambıl"],
  "bands": ["band", "lastik"],
  "exercise ball": ["yoga matı", "mat"],
  "medicine ball": ["dambıl"],
  "e-z curl bar": ["barfiks", "salon"],
  "barbell": ["salon"],
  "cable": ["salon", "makine"],
  "machine": ["salon", "makine"],
};

/** Ekipman gerektirmeyen etiketler; herkes yapabilir. */
const BODYWEIGHT_TAGS = new Set(["body only", "", "other"]);

/**
 * Plan istemine giden hareket sayısının üst sınırı.
 *
 * ÖLÇÜM: katalog 873 harekete çıkınca salon profilinde istemin yalnız katalog
 * kısmı ~31.400 token oluyor (106 hareketlik katalogda ~3.800'dü). Sağlayıcının
 * modeli akıl yürüten bir model ve plan üretimi zaten 60 sn'lik pencerede zar
 * zor tamamlanıyor; kataloğu sekiz katına çıkarmak üretimi o pencerenin dışına
 * taşırdı. Sınır kütüphaneyi DEĞİL yalnız istemi bağlar: kullanıcı 873 hareketin
 * tamamını uygulamada görmeye devam eder.
 */
export const PROMPT_CATALOG_LIMIT = 240;

function groupBy<T>(items: T[], key: (item: T) => string): T[][] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const bucket = buckets.get(key(item));
    if (bucket) bucket.push(item);
    else buckets.set(key(item), [item]);
  }
  return [...buckets.values()];
}

/** Grupları sırayla dolaşarak tek listeye örer; baştaki grup listeyi kaplamaz. */
function interleave<T>(groups: T[][]): T[] {
  const woven: T[] = [];
  const deepest = groups.reduce((longest, group) => Math.max(longest, group.length), 0);
  for (let index = 0; index < deepest; index += 1) {
    for (const group of groups) {
      if (index < group.length) woven.push(group[index]);
    }
  }
  return woven;
}

/**
 * Kataloğu sınıra indirirken çeşitliliği korur.
 *
 * Düz `slice` alfabetik sıraya güvenir ve listeyi ilk kas grubuna boğardı; bu
 * yüzden önce kas grubu, sonra her grubun içinde ekipman bazında sırayla seçim
 * yapılır. Böylece sınır dolduğunda her kas grubu ve her ekipman türü listede
 * temsil edilmiş olur.
 */
function balanceForPrompt(exercises: AIExerciseContext[], limit = PROMPT_CATALOG_LIMIT) {
  if (exercises.length <= limit) return exercises;
  const byMuscle = groupBy(exercises, (exercise) => exercise.primaryMuscles[0] || "other");
  return interleave(byMuscle.map((group) => interleave(groupBy(group, (exercise) => exercise.equipment || "none")))).slice(0, limit);
}

/**
 * Plan istemine giden kataloğu kullanıcının GERÇEKTEN yapabileceklerine indirir.
 *
 * Ölçüldü: tam katalog istemi o kadar büyütüyordu ki üretim zaman aşımına
 * düşüyordu. Filtreleme hem istemi küçültür hem de plan kalitesini artırır —
 * model evdeki kullanıcıya lat pulldown öneremez. Ekipman elemesinden sonra
 * kalan liste ayrıca PROMPT_CATALOG_LIMIT ile sınırlanır.
 */
export function getExercisesForProfile(
  isGym: boolean,
  equipmentText: string,
  environmentText = "",
  trainingStyleText = "",
): AIExerciseContext[] {
  const owned = equipmentText.toLocaleLowerCase("tr-TR");
  const outdoorRunning = /açık hava|outdoor/.test(environmentText.toLocaleLowerCase("tr-TR"))
    && /koşu|run|jog/.test(trainingStyleText.toLocaleLowerCase("tr-TR"));
  const outdoorMovement = /\b(?:run(?:ning)?|jog(?:ging)?|sprint(?:s)?|walk(?:ing)?)\b/i;
  return balanceForPrompt(getExercisesForAI().filter((exercise) => {
    const tag = (exercise.equipment || "").toLocaleLowerCase("en-US");
    const equipmentAvailable = BODYWEIGHT_TAGS.has(tag)
      || isGym
      || (EQUIPMENT_TAG_SYNONYMS[tag]?.some((word) => owned.includes(word)) ?? false);
    if (!equipmentAvailable) return false;
    // AI kataloğu token tasarrufu için `category` taşımaz. Burada kategoriye
    // bakmak açık hava koşu profilini sessizce BOŞ kataloğa düşürüyordu.
    // Kelime sınırları da zorunlu: çıplak /run/ ifadesi "crunch"ı koşu sanır.
    if (outdoorRunning) return outdoorMovement.test(exercise.name);
    if (BODYWEIGHT_TAGS.has(tag)) return true;
    if (isGym) return true;
    const synonyms = EQUIPMENT_TAG_SYNONYMS[tag];
    return synonyms ? synonyms.some((word) => owned.includes(word)) : false;
  }));
}

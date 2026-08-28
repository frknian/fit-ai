export type DefaultFood = {
  id: string;
  name: string;
  nameEn: string;
  aliases: string[];
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number;
};

// A small, always-available base catalogue. Values are generic per-100 g
// references; branded/provider results can still override these with richer data.
const ENGLISH_NAMES: Record<string, string> = {
  "tavuk-gogsu": "Chicken breast, cooked", "hindi-gogsu": "Turkey breast, cooked", "dana-yagsiz": "Lean beef, cooked",
  kiyma: "Ground beef, cooked", kofte: "Grilled meatballs", somon: "Salmon, cooked", "ton-baligi": "Tuna in water",
  yumurta: "Whole egg", "yumurta-beyazi": "Egg white", sut: "Semi-skimmed milk", ayran: "Ayran yogurt drink", yogurt: "Plain yogurt",
  "suzme-yogurt": "Greek yogurt", "beyaz-peynir": "Feta cheese", "lor-peyniri": "Cottage cheese",
  "pirinc-pilavi": "Cooked rice", "bulgur-pilavi": "Cooked bulgur", makarna: "Cooked pasta", yulaf: "Rolled oats",
  "tam-bugday-ekmek": "Whole wheat bread", "hindi-fumeli-lavas-tost": "Smoked turkey lavash toast", "fumeli-omlet": "Smoked turkey omelette", "kiymali-makarna": "Pasta with ground beef",
  "ekmek-doner": "Doner sandwich", "dana-doner": "Beef doner", lavas: "Lavash bread", "magnum-cone": "Magnum Cone",
  "sade-kahve": "Black coffee", mercimek: "Cooked lentils", "mercimek-corbasi": "Lentil soup", nohut: "Cooked chickpeas",
  "kuru-fasulye": "Cooked white beans", patates: "Boiled potato", "tatli-patates": "Cooked sweet potato",
  "patates-kizartmasi": "French fries",
  brokoli: "Cooked broccoli", ispanak: "Cooked spinach", domates: "Tomato", salatalik: "Cucumber", elma: "Apple",
  muz: "Banana", portakal: "Orange", cilek: "Strawberry", badem: "Almonds", ceviz: "Walnuts", zeytinyagi: "Olive oil",
};

const DEFAULT_FOODS: DefaultFood[] = [
  ["tavuk-gogsu", "Tavuk göğsü, pişmiş", ["tavuk", "ızgara tavuk"], 165, 31, 0, 3.6, 0],
  ["hindi-gogsu", "Hindi göğsü, pişmiş", ["hindi"], 135, 30, 0, 1, 0],
  ["dana-yagsiz", "Dana eti, yağsız, pişmiş", ["dana", "kırmızı et", "et"], 217, 26, 0, 12, 0],
  ["kiyma", "Dana kıyma, pişmiş", ["kıyma"], 250, 26, 0, 17, 0],
  ["kofte", "Izgara köfte", ["köfte"], 235, 24, 4, 14, 1],
  ["somon", "Somon, pişmiş", ["somon", "balık"], 206, 22, 0, 12, 0],
  ["ton-baligi", "Ton balığı, suda", ["ton", "ton balığı"], 116, 26, 0, 1, 0],
  ["yumurta", "Yumurta, bütün", ["yumurta", "haşlanmış yumurta"], 143, 13, 0.7, 9.5, 0],
  ["yumurta-beyazi", "Yumurta beyazı", ["yumurta akı"], 52, 11, 0.7, 0.2, 0],
  ["sut", "Süt, yarım yağlı", ["süt"], 50, 3.4, 4.8, 1.8, 0],
  ["ayran", "Ayran", ["ayran"], 37, 2, 3, 2, 0],
  ["yogurt", "Yoğurt, sade", ["yoğurt"], 61, 3.5, 4.7, 3.3, 0],
  ["suzme-yogurt", "Süzme yoğurt", ["greek yogurt", "protein yoğurt"], 97, 9, 3.9, 5, 0],
  ["beyaz-peynir", "Beyaz peynir", ["peynir", "feta"], 264, 14, 4, 21, 0],
  ["lor-peyniri", "Lor peyniri", ["lor", "cottage cheese"], 98, 11, 3.4, 4.3, 0],
  ["pirinc-pilavi", "Pirinç pilavı, pişmiş", ["pilav", "pirinç"], 130, 2.7, 28, 0.3, 0.4],
  ["bulgur-pilavi", "Bulgur pilavı, pişmiş", ["bulgur", "bulgur pilavı"], 120, 3.5, 25, 1.2, 4.5],
  ["makarna", "Makarna, pişmiş", ["makarna", "pasta"], 158, 5.8, 31, 0.9, 1.8],
  ["yulaf", "Yulaf ezmesi", ["yulaf", "oats"], 379, 13, 68, 6.5, 10],
  ["tam-bugday-ekmek", "Tam buğday ekmeği", ["ekmek", "tam buğday"], 247, 13, 41, 3.4, 7],
  ["hindi-fumeli-lavas-tost", "Hindi fümeli lavaş tost", ["hindi füme lavaş tost", "hindi fümeli lavaş tost", "hindi fumeli lavas tost"], 220, 16, 20, 8, 2],
  ["fumeli-omlet", "Fümeli omlet", ["fümeli omlet", "füme omlet", "hindi fümeli omlet", "hindi füme omlet"], 172, 16, 2, 11, 0.4],
  ["kiymali-makarna", "Kıymalı makarna", ["kıymalı makarna", "kiymali makarna", "makarna kıyma"], 185, 10, 20, 7, 1.5],
  ["ekmek-doner", "Ekmek arası döner", ["ekmek döner", "tam ekmek döner", "ekmeğe döner", "tam ekmeğe döner", "ekmek arası döner"], 240, 14, 23, 10, 2],
  ["dana-doner", "Dana döner", ["döner", "doner", "dana döner"], 250, 20, 4, 17, 0],
  ["lavas", "Lavaş ekmeği", ["lavaş", "lavas"], 280, 8, 56, 3, 2],
  ["magnum-cone", "Magnum Cone", ["magnum cone", "magnum külah", "magnum kulah"], 330, 4, 36, 19, 1],
  ["sade-kahve", "Sade kahve", ["kahve", "sade kahve", "black coffee"], 1, 0.1, 0, 0, 0],
  ["mercimek", "Mercimek, pişmiş", ["mercimek"], 116, 9, 20, 0.4, 7.9],
  ["mercimek-corbasi", "Mercimek çorbası", ["çorba", "mercimek çorbası"], 90, 4.8, 13.5, 2, 3.2],
  ["nohut", "Nohut, pişmiş", ["nohut", "nohut yemeği"], 164, 8.9, 27, 2.6, 7.6],
  ["kuru-fasulye", "Kuru fasulye, pişmiş", ["fasulye", "kuru fasulye"], 127, 8.7, 23, 0.5, 6.4],
  ["patates", "Patates, haşlanmış", ["patates"], 87, 1.9, 20, 0.1, 1.8],
  ["patates-kizartmasi", "Patates kızartması", ["patates kızartması", "kızarmış patates", "french fries"], 312, 3.4, 41, 15, 3.8],
  ["tatli-patates", "Tatlı patates, pişmiş", ["tatlı patates"], 90, 2, 21, 0.2, 3.3],
  ["brokoli", "Brokoli, pişmiş", ["brokoli"], 35, 2.4, 7.2, 0.4, 3.3],
  ["ispanak", "Ispanak, pişmiş", ["ıspanak"], 23, 3, 3.8, 0.3, 2.4],
  ["domates", "Domates", ["domates"], 18, 0.9, 3.9, 0.2, 1.2],
  ["salatalik", "Salatalık", ["salatalık"], 15, 0.7, 3.6, 0.1, 0.5],
  ["elma", "Elma", ["elma"], 52, 0.3, 14, 0.2, 2.4],
  ["muz", "Muz", ["muz", "banana"], 89, 1.1, 23, 0.3, 2.6],
  ["portakal", "Portakal", ["portakal"], 47, 0.9, 12, 0.1, 2.4],
  ["cilek", "Çilek", ["çilek"], 32, 0.7, 7.7, 0.3, 2],
  ["badem", "Badem", ["badem"], 579, 21, 22, 50, 12.5],
  ["ceviz", "Ceviz", ["ceviz"], 654, 15, 14, 65, 6.7],
  ["zeytinyagi", "Zeytinyağı", ["zeytin yağı", "yağ"], 884, 0, 0, 100, 0],
].map(([id, name, aliases, calories, protein, carbohydrates, fat, fiber]) => ({
  id: String(id),
  name: String(name),
  nameEn: ENGLISH_NAMES[String(id)] || String(name),
  aliases: aliases as string[],
  calories: Number(calories),
  protein: Number(protein),
  carbohydrates: Number(carbohydrates),
  fat: Number(fat),
  fiber: Number(fiber),
}));

function normalize(value: string): string {
  return value.toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function searchDefaultFoods(query: string, limit = 12, locale: "tr" | "en" = "tr"): DefaultFood[] {
  const clean = normalize(query);
  if (clean.length < 2) return [];
  const terms = clean.split(/\s+/);
  return DEFAULT_FOODS
    .map((food) => {
      const haystack = normalize([locale === "en" ? food.nameEn : food.name, food.name, food.nameEn, ...food.aliases].join(" "));
      const score = haystack === clean ? 100 : haystack.startsWith(clean) ? 80 : haystack.includes(clean) ? 60 : terms.every((term) => haystack.includes(term)) ? 40 : 0;
      return { food, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || (locale === "en" ? a.food.nameEn : a.food.name).localeCompare(locale === "en" ? b.food.nameEn : b.food.name, locale))
    .slice(0, limit)
    .map(({ food }) => food);
}

/** Exact phrase matcher used before remote AI nutrition estimation. */
export function matchDefaultFood(query: string): DefaultFood | null {
  // Kullanıcılar sıkça "2 adet", "200 gram" gibi miktarı yemek adının
  // başına ya da ortasına yazar. Miktar porsiyon hesabında ayrı ele alınır;
  // katalog eşleşmesinde yemek adını bozmasına izin vermeyiz.
  const clean = normalize(query)
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:adet|tane|gram|gr|g|ml|porsiyon)?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return DEFAULT_FOODS
    .flatMap((food) => [food.name, ...food.aliases].map((label) => ({ food, phrase: normalize(label) })))
    // Only an exact name/alias may bypass AI. Partial token containment made
    // "patates kızartması" resolve to boiled potato and compound meals lose
    // their modifiers ("kıymalı makarna" -> plain pasta).
    .filter(({ phrase }) => phrase.length >= 3 && phrase === clean)
    .sort((a, b) => b.phrase.length - a.phrase.length)[0]?.food ?? null;
}

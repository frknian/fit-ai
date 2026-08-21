// Türkçe SES DİZİMİ (fonotaktik) denetimi.
//
// NEDEN VAR: küçük/nicemlenmiş bir dil modeli Türkçede bozulduğunda cümleyi
// İngilizceye çevirmez — Türkçe GÖRÜNEN ama var olmayan kelimeler üretir
// ("yüzme" yerine "yümç"). Benchmark'ın `mustBeTurkish` denetimi bunu
// göremez: o yalnız baskın dile/alfabeye bakar, "yümç" o testten geçer.
// Bu yüzden hedefit-mini'nin 35/48 skoru gerçek dil kalitesini olduğundan
// iyi gösteriyordu (bkz. docs/LOCAL_AI_BENCHMARK.md).
//
// Bu denetim sözlük DEĞİLDİR. Türkçe eklemeli bir dildir; sonlu bir kelime
// listesiyle "koşabilirsin", "yüzmeye", "antrenmanlarını" gibi geçerli
// biçimleri doğrulamak mümkün değil. Onun yerine kelimenin BİÇİMİNE bakılır:
// Türkçede kelime SONUNDAKİ ünsüz öbeklerinin kümesi dardır ve iyi
// tanımlıdır; bozuk üretim bu kümenin dışına hemen çıkar.
//
// TASARIM İLKESİ — YANLIŞ POZİTİF VERME. Bu denetim çalışma anında yerel
// yanıtı reddedip sunucuya düşmek için kullanılıyor; geçerli Türkçeyi "bozuk"
// sayarsa çalışan bir özelliği kapatır. Bu yüzden her kural yalnız Türkçede
// GERÇEKTEN oluşmayan biçimleri işaretler ve şüpheli durumda kelime geçerli
// sayılır.
//
// ELENEN İKİ KURAL (ve nedeni — depodaki ~37.000 kelimelik Türkçe düz yazı
// korpusuna karşı ölçüldü):
//
//   · "4+ ardışık ünsüz"  → "orkestra" (rkstr), "enstrüman" (nstr),
//     "ekstra" (kstr) ve "prompttan" gibi ek almış alıntılar geçerlidir.
//   · "kelime başında 3 ünsüz" → "stres", "strateji" geçerlidir.
//
// İkisi de gerçek Türkçeyi işaretliyordu; kalan üç kural (ünlüsüzlük, üç kez
// tekrar eden harf, izinsiz son öbek) korpusta SIFIR yanlış pozitif verdi.

/** â/î/û (kâr, imkân, hâlâ) da ünlüdür — atlanırsa "imkânsız" ikiye bölünür. */
const VOWELS = "aeıioöuüâîû";
const VOWEL_SET = new Set(VOWELS);

/** Türkçe alfabe + Türkçe metinde geçebilen yabancı harfler (q, w, x). */
const WORD_PATTERN = /[a-zqwxçğıöşüâîû]+/g;

/**
 * Türkçede kelime SONUNDA görülebilen iki ünsüzlü öbekler.
 *
 * Türkçe kökenli kelimelerin çoğu ünlüyle ya da tek ünsüzle biter; sondaki
 * ünsüz öbeği neredeyse tamamen alıntılardan ve Arapça/Farsça kökenli
 * biçimlerden gelir. Liste bilerek CÖMERT: amaç geçerli Türkçeyi elemek değil,
 * "mç", "ğt", "vç" gibi Türkçede HİÇ oluşmayan sonları yakalamak.
 *
 * İlk harfe göre gruplanmıştır; her satır o ünsüzden sonra gelebilenleri
 * listeler (halk, ölç, kalp, alt, golf, film, puls, dolg, kald, alb…).
 */
const ALLOWED_FINAL_CLUSTERS = new Set([
  ..."kçptfmsgdbnrjvz".split("").map((second) => `l${second}`),
  ..."çktdsjgzc".split("").map((second) => `n${second}`),
  ..."çkpstfdzjgmnblv".split("").map((second) => `r${second}`),
  // -y: bayt, ebeveyn, peyk, şeyh, keyf, seyr, meyl, kayd, gayb, ayp
  ..."tnkfhrlsçdmzpb".split("").map((second) => `y${second}`),
  ..."tkpmlr".split("").map((second) => `s${second}`),
  "şt", "şk",
  "ft",
  ..."tsrlm".split("").map((second) => `k${second}`),
  ..."tsr".split("").map((second) => `p${second}`),
  "tr", "tm",
  ..."mnr".split("").map((second) => `z${second}`),
  ..."pbrns".split("").map((second) => `m${second}`),
  ..."tsnr".split("").map((second) => `h${second}`),
  "vk", "vr",
  "ct", "cd",
  "dr", "gr", "br", "fr",
]);

/** Ünlüsüz ama geçerli yazımlar: kısaltmalar ve birimler. */
const VOWELLESS_ALLOWED = new Set([
  "dk", "kg", "km", "gr", "mg", "ml", "lt", "tv", "cm", "mm", "sn", "hr",
  "vs", "vb", "bkz", "tl", "bmr", "bmi", "vki", "hb", "sms", "pdf", "gps",
]);

/**
 * Türkçe koçluk metninde normal sayılan İngilizce terimler.
 *
 * Hareket adları Türkçe cümlenin içinde İngilizce kalır ("bench press",
 * "kettlebell salıncağı"). Bu kelimeler Türkçe ses dizimine uymaz — uymaları
 * da beklenmez. Listelenmezlerse kısa bir yanıtta üç hareket adı, yanıtı
 * "bozuk" saydırıp çalışan bir özelliği kapatabilirdi.
 *
 * Yalnız kuralları GERÇEKTEN tetikleyenler listelenir (ör. "plank", "squat",
 * "burpee" zaten geçerli biçimdedir ve buraya gerek duymaz).
 */
const FITNESS_LOANWORDS = new Set([
  "push", "pushup", "bench", "crunch", "stretch", "smith", "french",
  "dumbbell", "kettlebell", "barbell", "bell", "pull", "full", "drill",
  "press", "fitness", "cross", "class", "hiit", "cool", "well",
]);

export type MalformedRule = "noVowel" | "finalCluster" | "repeatedLetter";

export type TurkishWordIssue = {
  word: string;
  /** Hangi kural ihlal edildi; rapora ve teste okunur bir sebep verir. */
  rule: MalformedRule;
};

function isVowel(letter: string): boolean {
  return VOWEL_SET.has(letter);
}

function classifyWord(word: string): MalformedRule | null {
  const letters = [...word];

  // 1. Ünlüsüz kelime. Türkçede her hecede tam olarak bir ünlü vardır;
  //    ünlüsüz bir kelime kısaltma değilse yazım değildir.
  if (!letters.some(isVowel)) return "noVowel";

  // 2. Aynı harfin üç kez üst üste gelmesi. Türkçede iki olur (dikkat, elli),
  //    üç olmaz — bu, kod çözümün takıldığının klasik izidir.
  for (let index = 2; index < letters.length; index += 1) {
    if (letters[index] === letters[index - 1] && letters[index] === letters[index - 2]) return "repeatedLetter";
  }

  // 3. Kelime SONUNDA izin verilmeyen ünsüz öbeği. Bozuk üretimin en sık izi
  //    budur: "yüzme" yerine "yümç".
  const last = letters[letters.length - 1];
  const beforeLast = letters[letters.length - 2];
  if (!isVowel(last) && !isVowel(beforeLast) && !ALLOWED_FINAL_CLUSTERS.has(`${beforeLast}${last}`)) {
    return "finalCluster";
  }

  return null;
}

/**
 * Metindeki, Türkçe olamayacak BİÇİMDEKİ kelimeleri döndürür.
 *
 * Aynı kelime birden çok geçse de bir kez raporlanır: tekrar eden tek bir
 * bozuk kelime, yanıtın tamamen bozulduğu anlamına gelmez.
 */
export function findMalformedTurkishWords(text: string): TurkishWordIssue[] {
  const issues: TurkishWordIssue[] = [];
  const seen = new Set<string>();

  for (const match of (text || "").toLocaleLowerCase("tr-TR").matchAll(WORD_PATTERN)) {
    const word = match[0];
    if (word.length < 2 || seen.has(word)) continue;
    if (VOWELLESS_ALLOWED.has(word) || FITNESS_LOANWORDS.has(word)) continue;

    const rule = classifyWord(word);
    if (rule) {
      seen.add(word);
      issues.push({ word, rule });
    }
  }
  return issues;
}

/** Bozuk (benzersiz) kelimelerin toplam kelimeye oranı. */
export function malformedTurkishRatio(text: string): number {
  const total = (text.match(WORD_PATTERN) || []).length;
  if (!total) return 0;
  return findMalformedTurkishWords(text).length / total;
}

/**
 * Yanıt kullanıcıya gösterilebilecek kadar sağlam mı?
 *
 * EŞİK NEDEN BÖYLE: tek bir işaret yanlış pozitif olabilir (tanımadığımız bir
 * marka, kısaltma, yabancı özel isim). İki ve üzeri bozuk kelimeyle BİRLİKTE
 * %10'u aşan bir oran, tek tük yazım hatasıyla açıklanamaz — kod çözümün
 * bozulduğunu gösterir. İki koşul birlikte aranır ki uzun ve sağlam bir
 * yanıttaki iki yabancı terim yanıtı çöpe attırmasın.
 */
export function isTurkishOutputUsable(text: string): boolean {
  const issues = findMalformedTurkishWords(text);
  if (issues.length <= 1) return true;
  const total = (text.match(WORD_PATTERN) || []).length;
  return total > 0 && issues.length / total <= 0.1;
}

import { jsonSchema } from "ai";
import { extractSessionMinutes, extractWeeklyDays } from "../../../lib/training-profile.ts";
import { QUESTION, labelledAnswers } from "../../../lib/onboarding-questions.ts";
import { normalizeAnswers } from "../../../lib/goal-plan.ts";
import { authenticateRequest } from "../../../lib/api-auth.ts";
import { rateLimit, tooManyRequests } from "../../../lib/rate-limit.ts";
import { hasRemoteProvider, parseImageDataUrl } from "../../../lib/ai/providers/openai-compatible.ts";
import { generateCoachObject } from "../../../lib/ai/coach.ts";
import { loadMemories } from "../../../lib/ai/memory.ts";
import { checkAndConsumeUsage, refundUsage, usageLimitExceeded } from "../../../lib/usage-limits.ts";
import { PROMPT_CATALOG_LIMIT, getExerciseById, getExercisesForProfile } from "../../../lib/exercise-service.ts";
import { normalizeExercise } from "../../../lib/exercise-service.ts";
import { translateExerciseLabel, translateExerciseName, turkishExerciseInstructions } from "../../../lib/exercise-translations.ts";

// İstek gövdesinin tamamı için kaba bir üst sınır (bkz. photoDataUrl zaten
// parseImageDataUrl içinde ~7 MB base64 ile sınırlı; bu, geri kalan JSON
// alanlarının — profil, geçmiş, katalog — toplamda makul kalmasını sağlar).
const MAX_BODY_BYTES = 8_500_000;

const plannerRules = [
  "Yaş, cinsiyet, boy, kilo, hedef metni, ortam, ekipman, istenen hareketler ve test cevaplarının HER BİRİNİ tek tek değerlendir; hiçbirini yok sayma.",
  "Kullanıcının belirttiği engeli programın kendisiyle çöz: zaman engeli varsa süperset ve kısa dinlenme, motivasyon engeli varsa erken görünür kazanım, sakatlık engeli varsa kademeli giriş kullan.",
  "Son 3 aydaki sıklık ile kendi beyan ettiği seviye çelişiyorsa (ör. 'ileri seviye' ama '0 gün') düşük olanı esas al; ilk iki hafta yeniden alışma haftasıdır.",
  "Kullanıcının hedefi için neden önemli olduğunu yazdığı metni profileSummary ve rationale alanlarında ona geri yansıt; genel geçer cümle kurma.",
  "Programın hareket sayısını, setini, tekrarını ve dinlenmesini kullanıcının seviyesi ile ayırdığı süreye göre değiştir.",
  "Yalnızca kullanıcının ortamında ve ekipmanıyla uygulanabilen katalog hareketlerini seç.",
  "Ağrı veya sakatlık belirtilen tüm bölgeleri aynı anda kısıt kabul et; riskli hareketleri çıkar.",
  "Fotoğraf, BMI veya metinlerden tıbbi tanı ya da kesin yağ oranı çıkarma.",
  "Fotoğraf varsa yalnızca görünür duruş ve genel vücut dağılımına ilişkin yaklaşık, tanısal olmayan gözlem kullan.",
  "Isınma, ana bölüm, dinlenme, soğuma ve dört haftalık ilerleme önerisi üret.",
  "Önceki antrenmanların tamamlama oranı, algılanan zorluk, yorgunluk ve ağrı geri bildirimlerini birlikte değerlendir.",
  "Ağrı veya yüksek yorgunluk varsa yükü artırma; riskli hareketi daha güvenli bir katalog hareketiyle değiştir.",
  "En az iki kolay, düşük yorgunluklu ve yüzde 90 üzeri tamamlanan kayıt olmadan otomatik yük artışı yapma.",
];

type GeneratedPlan = {
  title: string;
  profileSummary: string;
  rationale: string;
  safetyNote: string;
  analysis: {
    experienceLevel: string;
    weeklyFrequency: string;
    sessionMinutes: number;
    primaryGoal: string;
    intensity: string;
    equipmentMode: string;
    focusAreas: string[];
    adaptations: string[];
  };
  weeklySchedule: Array<{ day: string; focus: string; durationMinutes: number }>;
  progression: string[];
  workouts: Array<{ id: string; name: string; english: string; area: string; sets: number; reps: string; restSeconds: number; instructions: string }>;
};

const responseSchema = jsonSchema<GeneratedPlan>({
  type: "object",
  properties: {
    title: { type: "string" },
    profileSummary: { type: "string" },
    rationale: { type: "string" },
    safetyNote: { type: "string" },
    analysis: {
      type: "object",
      properties: {
        experienceLevel: { type: "string" },
        weeklyFrequency: { type: "string" },
        sessionMinutes: { type: "integer" },
        primaryGoal: { type: "string" },
        intensity: { type: "string" },
        equipmentMode: { type: "string" },
        focusAreas: { type: "array", items: { type: "string" } },
        adaptations: { type: "array", items: { type: "string" } },
      },
      required: ["experienceLevel", "weeklyFrequency", "sessionMinutes", "primaryGoal", "intensity", "equipmentMode", "focusAreas", "adaptations"],
    },
    weeklySchedule: {
      type: "array",
      items: {
        type: "object",
        properties: { day: { type: "string" }, focus: { type: "string" }, durationMinutes: { type: "integer" } },
        required: ["day", "focus", "durationMinutes"],
      },
    },
    progression: { type: "array", items: { type: "string" } },
    workouts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          english: { type: "string" },
          area: { type: "string" },
          sets: { type: "integer", minimum: 1, maximum: 6 },
          reps: { type: "string" },
          restSeconds: { type: "integer", minimum: 20, maximum: 180 },
          instructions: { type: "string" },
        },
        required: ["id", "name", "english", "area", "sets", "reps", "restSeconds", "instructions"],
      },
    },
  },
  required: ["title", "profileSummary", "rationale", "safetyNote", "analysis", "weeklySchedule", "progression", "workouts"],
});

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function profileSignals(payload: Record<string, unknown>) {
  const history = Array.isArray(payload.history) ? payload.history.map(text) : [];
  // Hedef planı varsa haftalık gün ve seans süresi ORADAN gelir: kullanıcı o
  // ekranda "haftada 3 gün, 45 dakika" diye taahhüt etmiştir; profil testindeki
  // daha eski cevabın onu ezmesi planı taahhüdüyle çelişkiye düşürürdü.
  const goalPlan = normalizeAnswers(payload.goalPlan);
  const sessionMinutes = goalPlan ? goalPlan.sessionMinutes : extractSessionMinutes(history[QUESTION.sessionMinutes]);
  const experience = history[QUESTION.level] || "Yeni başlıyorum";
  const goal = `${history[QUESTION.goal] || ""} ${text(payload.goal)}`.toLocaleLowerCase("tr-TR");
  // Yağ kaybı ile kilo verme ayrı hedefler: tartıyı düşürmek ile yağ kütlesini
  // düşürmek aynı şey değil. Yağ kaybında direnç antrenmanı korunmalı, yoksa
  // açık kaybın kas payını büyütür. Eskiden ikisi tek kategoriye düşüyordu.
  const primaryGoal = goal.includes("yağ") || goal.includes("tanımlı") ? "Yağ kaybı"
    : goal.includes("kilo") ? "Kilo verme"
    : goal.includes("kas") ? "Kas geliştirme"
    : goal.includes("kondisyon") ? "Kondisyon" : "Güçlenme";
  const frequencyText = goalPlan ? `${goalPlan.weeklyDays} gün` : history[QUESTION.availableDays] || history[QUESTION.recentFrequency] || "1–2 gün";
  const weeklyDays = goalPlan ? goalPlan.weeklyDays : extractWeeklyDays(frequencyText);
  const recentFrequency = history[QUESTION.recentFrequency] || "Belirtilmedi";
  // Son üç ayda hiç antrenman yapmamış biri kendini "ileri seviye" görebilir;
  // eski formu esas almak ilk haftada aşırı yükleme demek olurdu.
  const detrained = /^0 gün/.test(recentFrequency);
  const beginner = detrained || /yeni|hayır|0 gün/i.test(`${experience} ${history[QUESTION.experience] || ""}`);
  // "Düşük" eski testin seçeneğiydi; taşınmış kayıtlarda hâlâ bulunabilir.
  const sedentary = /masa başı|düşük/i.test(history[QUESTION.dailyMovement] || "");
  const intensity = beginner || sedentary ? "Düşük-orta" : primaryGoal === "Kondisyon" ? "Orta-yüksek" : "Orta";
  const exerciseCount = sessionMinutes <= 15 ? 3 : sessionMinutes >= 60 ? 6 : sessionMinutes >= 45 ? 5 : 4;
  const setRange = beginner ? "2–3" : sessionMinutes >= 45 ? "3–4" : "3";
  const restRange = primaryGoal === "Kondisyon" || primaryGoal === "Kilo verme" ? "30–60 sn" : beginner ? "60–90 sn" : primaryGoal === "Yağ kaybı" ? "60–90 sn" : "75–120 sn";
  const raw = JSON.stringify({ age: payload.age, gender: payload.gender, height: payload.height, weight: payload.weight, environment: payload.environment, equipment: payload.equipment, goal: payload.goal, requestedExercises: payload.requestedExercises, history });
  const fingerprint = [...raw].reduce((hash, character) => (hash * 33 + character.charCodeAt(0)) % 1000003, 17).toString(36).toUpperCase();
  return {
    history,
    answers: labelledAnswers(history),
    sessionMinutes, experience, primaryGoal, frequencyText, weeklyDays, intensity, exerciseCount, setRange, restRange,
    detrained,
    recentFrequency,
    goalPlan,
    motivation: history[QUESTION.motivation] || "Belirtilmedi",
    pastBarrier: history[QUESTION.barrier] || "Belirtilmedi",
    trainingPlace: history[QUESTION.location] || "Belirtilmedi",
    equipmentAccess: history[QUESTION.equipment] || "Belirtilmedi",
    painAreas: history[QUESTION.injuries] || "Yok",
    movementLevel: history[QUESTION.dailyMovement] || "Belirtilmedi",
    sleepQuality: history[QUESTION.sleep] || "Belirtilmedi",
    preferredStyle: history[QUESTION.trainingStyles] || "Karışık",
    note: history[QUESTION.freeNote] || "Yok",
    fingerprint,
  };
}

export function buildLocalPlan(signals: ReturnType<typeof profileSignals>, catalog: unknown[], locale: "tr" | "en"): GeneratedPlan {
  // Prompt kataloğu token maliyetini düşürmek için category/mechanic gibi
  // alanları taşımaz. Yerel planlayıcı bunları varsayılan değerlerle uydurursa
  // stretching hareketleri "strength" sanılır ve alfabetik ilk kayıtlar plana
  // dolar. Bilinen kimlikleri tam, doğrulanmış katalog kaydıyla zenginleştir.
  const normalized = catalog.map((value) => {
    const compact = normalizeExercise(value);
    return compact ? getExerciseById(compact.id) ?? compact : null;
  }).filter((item) => item !== null);
  const pain = signals.painAreas.toLocaleLowerCase("tr-TR");
  const unsafeForPain = (name: string) => {
    const folded = name.toLocaleLowerCase("en-US");
    if (/diz|knee/.test(pain) && /jump|squat|lunge|leg press|pistol|step-up/.test(folded)) return true;
    if (/omuz|shoulder/.test(pain) && /overhead|shoulder press|military press|dip|upright row/.test(folded)) return true;
    if (/bel|sırt|back/.test(pain) && /deadlift|good morning|hyperextension|heavy/.test(folded)) return true;
    return false;
  };
  const painFiltered = normalized.filter((exercise) => !unsafeForPain(exercise.name));
  const conditioning = signals.primaryGoal === "Kondisyon";
  const goalFiltered = painFiltered.filter((exercise) => conditioning
    ? exercise.category !== "stretching"
    : ["strength", "powerlifting", "olympic weightlifting"].includes(exercise.category));
  const candidatePool = goalFiltered.length >= signals.exerciseCount ? goalFiltered : painFiltered;
  const preferredStyle = signals.preferredStyle.toLocaleLowerCase("tr-TR");
  const musclePriority = new Set(["quadriceps", "hamstrings", "glutes", "chest", "lats", "middle back", "shoulders"]);
  const foundationPattern = /squat|leg press|bench press|push-up|barbell row|dumbbell row|lat pulldown|pull-up|deadlift|hip thrust|glute bridge|shoulder press/i;
  const score = (exercise: (typeof candidatePool)[number]) => {
    const categoryScore = conditioning
      ? ({ cardio: 70, plyometrics: 55, strength: 45, powerlifting: 25, "olympic weightlifting": 25, strongman: 20 }[exercise.category] ?? 0)
      : ({ strength: 70, powerlifting: 55, "olympic weightlifting": 40, strongman: 25, plyometrics: 15, cardio: 10 }[exercise.category] ?? 0);
    const equipment = exercise.equipment?.toLocaleLowerCase("en-US") ?? "";
    const styleScore = /ağırlık|kuvvet|weight|strength/.test(preferredStyle)
      ? (equipment && equipment !== "body only" ? 8 : 0)
      : /koşu|hiit|cardio/.test(preferredStyle) && ["cardio", "plyometrics"].includes(exercise.category) ? 8 : 0;
    return categoryScore
      + (exercise.mechanic === "compound" ? 20 : 0)
      + (foundationPattern.test(exercise.name) ? 18 : 0)
      + (musclePriority.has(exercise.primaryMuscles[0] || "") ? 10 : 0)
      + styleScore;
  };
  const pool = [...candidatePool].sort((left, right) => score(right) - score(left) || left.name.localeCompare(right.name));
  const selected: typeof pool = [];
  const usedMuscles = new Set<string>();
  for (const exercise of pool) {
    const muscle = exercise.primaryMuscles[0] || "other";
    if (!usedMuscles.has(muscle)) {
      selected.push(exercise);
      usedMuscles.add(muscle);
    }
    if (selected.length >= signals.exerciseCount) break;
  }
  for (const exercise of pool) {
    if (selected.length >= signals.exerciseCount) break;
    if (!selected.some((item) => item.id === exercise.id)) selected.push(exercise);
  }

  const beginner = signals.detrained || /yeni|başlangıç/i.test(signals.experience);
  const sets = beginner ? 2 : signals.sessionMinutes >= 45 ? 4 : 3;
  const reps = signals.primaryGoal === "Kondisyon" || signals.primaryGoal === "Kilo verme" ? "12–15" : "8–12";
  const restSeconds = signals.primaryGoal === "Kondisyon" || signals.primaryGoal === "Kilo verme" ? 45 : beginner ? 75 : 90;
  const daysTr = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
  const daysEn = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const scheduleDays = (locale === "en" ? daysEn : daysTr).slice(0, signals.weeklyDays);

  return {
    title: locale === "en" ? "Your personal starter plan" : "Kişisel başlangıç programın",
    profileSummary: locale === "en" ? `A ${signals.sessionMinutes}-minute plan for ${signals.primaryGoal.toLocaleLowerCase("en-US")}.` : `${signals.primaryGoal} hedefin için ${signals.sessionMinutes} dakikalık program.`,
    rationale: locale === "en" ? "Movements were selected from the verified catalog for your environment, equipment, experience, and reported pain areas." : "Hareketler doğrulanmış katalogdan; ortamına, ekipmanına, deneyimine ve belirttiğin ağrı bölgelerine göre seçildi.",
    safetyNote: locale === "en" ? "Stop if you feel sharp pain and use controlled form." : "Keskin ağrı hissedersen dur ve hareketleri kontrollü uygula.",
    analysis: {
      experienceLevel: signals.experience,
      weeklyFrequency: `${signals.weeklyDays} ${locale === "en" ? "days" : "gün"}`,
      sessionMinutes: signals.sessionMinutes,
      primaryGoal: signals.primaryGoal,
      intensity: signals.intensity,
      equipmentMode: signals.equipmentAccess,
      focusAreas: selected.map((exercise) => translateExerciseLabel(exercise.primaryMuscles[0], locale)).filter(Boolean),
      adaptations: locale === "en"
        ? ["Matched to the available session time.", "Limited to available equipment.", "Reported pain areas were excluded from risky patterns."]
        : ["Ayırabildiğin süreye uyarlandı.", "Erişebildiğin ekipmanlarla sınırlandı.", "Belirttiğin ağrı bölgeleri için riskli hareket kalıpları elendi."],
    },
    weeklySchedule: scheduleDays.map((day) => ({ day, focus: locale === "en" ? "Full body" : "Tüm vücut", durationMinutes: signals.sessionMinutes })),
    progression: locale === "en"
      ? ["Week 1: learn the movement paths.", "Week 2: complete every planned set.", "Week 3: add repetitions with good form.", "Week 4: increase load only if technique stays stable."]
      : ["1. hafta: hareket yollarını öğren.", "2. hafta: planlanan tüm setleri tamamla.", "3. hafta: formu koruyarak tekrar ekle.", "4. hafta: teknik bozulmuyorsa yükü artır."],
    workouts: selected.map((exercise) => ({
      id: exercise.id,
      name: translateExerciseName(exercise.name, locale),
      english: exercise.name,
      area: translateExerciseLabel(exercise.primaryMuscles[0], locale),
      sets,
      reps,
      restSeconds,
      instructions: turkishExerciseInstructions(exercise, locale).join(" "),
    })),
  };
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  const rateLimitResult = rateLimit(`generate-plan:${auth.user.id}`, 5, 300000);
  if (!rateLimitResult.ok) return tooManyRequests(rateLimitResult.retryAfterSeconds);

  let bodyText: string;
  try {
    bodyText = await request.text();
  } catch {
    return Response.json({ error: "Profil verileri okunamadı" }, { status: 400 });
  }
  // exerciseCatalog ve ham profil JSON'unun sunucuda hiçbir boyut kontrolü
  // yoktu; kimliği doğrulanmış tek bir kullanıcı 5 dk'da 5 istek hakkının
  // HER birine megabaytlarca prompt taşıtıp AI maliyetini şişirebilirdi.
  if (bodyText.length > MAX_BODY_BYTES) {
    return Response.json({ error: "Profil verisi çok büyük." }, { status: 413 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Profil verileri okunamadı" }, { status: 400 });
  }

  const photoDataUrl = typeof payload.photoDataUrl === "string" ? payload.photoDataUrl : null;
  // Meşru istemci kataloğu zaten PROMPT_CATALOG_LIMIT ile kırpıyor (bkz.
  // lib/exercise-service.ts getExercisesForProfile); sunucu bunu asla
  // doğrulamıyordu. Sınırı burada da uygulamak, hazırlanmış bir istekle
  // kataloğun tamamının (873 hareket) veya uydurma bir dizinin gönderilip
  // istemi/maliyeti şişirmesini engeller.
  // İstemci katalog GÖNDERMEZSE sunucu kendi kurar. Filtreleme kuralları
  // (bodyweight etiketleri, ekipman eş anlamlıları, kas grubu dengesi) yalnız burada yaşamalı, her
  // istemcide ikinci kez uygulanmamalı. Yedek olmadan katalogsuz bir istemci
  // modele boş liste gönderip uydurma hareket kimlikleri alırdı.
  const clientCatalog = Array.isArray(payload.exerciseCatalog) ? payload.exerciseCatalog : [];
  const environment = text(payload.environment);
  const equipment = text(payload.equipment);
  const history = Array.isArray(payload.history) ? payload.history.map(text) : [];
  const trainingStyles = history[QUESTION.trainingStyles] || "";
  const verifiedClientCatalog = clientCatalog.slice(0, PROMPT_CATALOG_LIMIT).map((value) => {
    const compact = normalizeExercise(value);
    const atlasExercise = compact ? getExerciseById(compact.id) : null;
    return atlasExercise ? {
      id: atlasExercise.id,
      name: atlasExercise.name,
      level: atlasExercise.level,
      equipment: atlasExercise.equipment || undefined,
      primaryMuscles: atlasExercise.primaryMuscles,
    } : null;
  }).filter((exercise) => exercise !== null);
  const exerciseCatalog = verifiedClientCatalog.length
    ? verifiedClientCatalog
    : getExercisesForProfile(/salon|gym/i.test(environment), equipment, environment, trainingStyles);
  const locale = payload.locale === "en" ? "en" : "tr";
  const profile = { ...payload };
  delete profile.photoDataUrl;
  delete profile.exerciseCatalog;
  delete profile.locale;
  const signals = profileSignals(payload);
  // Hareket seçimi her zaman doğrulanmış Hareket Atlası'nda kalır. OpenAI,
  // 15 cevabı yorumlayıp açıklama ve ilerleme metnini kişiselleştirebilir;
  // katalog dışı bir hareket ya da yanlış ekipman öneremez.
  const atlasPlan = buildLocalPlan(signals, exerciseCatalog, locale);
  if (!hasRemoteProvider()) {
    return Response.json({ ...atlasPlan, profileFingerprint: signals.fingerprint, model: "hedefit-deterministic-v1", fallback: true });
  }
  const usage = await checkAndConsumeUsage(request, "plan", auth.user.id);
  if ("error" in usage) return usage.error;
  if (!usage.allowed) return usageLimitExceeded("plan", usage.used, usage.limit);
  const trainingHistory = Array.isArray(payload.trainingHistory) ? payload.trainingHistory.slice(0, 8) : [];
  const adaptation = payload.adaptation && typeof payload.adaptation === "object" ? payload.adaptation : null;
  // Modele giden veriler <facts> içinde toplanır: hepsi uygulamada zaten
  // hesaplandı (profileSignals, training-adaptation) ve model bunları
  // DEĞİŞTİRMEMELİ. Serbest metin istemi yalnız "ne yap" der, veriyi taşımaz.
  const planFacts: Record<string, unknown> = {
    profile,
    profileTest: signals.answers,
    derivedSignals: signals,
    trainingHistory,
    adaptation,
    exerciseCatalog,
  };

  const prompt = `Sen güvenli ve kişiselleştirilmiş fitness programı hazırlayan bir asistansın. Aynı hazır programı herkese verme. <facts> içindeki ham verileri ve türetilmiş plan parametrelerini birlikte kullan.

BU PROFİL İÇİN ZORUNLU PLAN PARAMETRELERİ:
- Ana hedef: ${signals.primaryGoal}${signals.primaryGoal === "Yağ kaybı" ? `
- YAĞ KAYBI KURALI: Programı sadece kardiyoya çevirme. Direnç antrenmanı ana omurga olarak kalsın; yağ kaybında kası koruyan şey yüktür. Kardiyo destek olarak eklenebilir, yerine geçemez.` : ""}
- Deneyim: ${signals.experience}
- Haftalık sıklık: ${signals.weeklyDays} gün (${signals.frequencyText})
- Seans süresi: yaklaşık ${signals.sessionMinutes} dakika
- Hareket sayısı: ${signals.exerciseCount}
- Set aralığı: ${signals.setRange}
- Dinlenme aralığı: ${signals.restRange}
- Yoğunluk: ${signals.intensity}
- Ağrı/sakatlık kısıtları: ${signals.painAreas}
- Tercih edilen antrenman türü: ${signals.preferredStyle}
- Antrenman yeri: ${signals.trainingPlace}
- Erişilebilir ekipman: ${signals.equipmentAccess}
- Son 3 aydaki sıklık: ${signals.recentFrequency}${signals.detrained ? " (ARA VERMİŞ: ilk iki hafta yeniden alışma)" : ""}
- Geçmişte durduran engel: ${signals.pastBarrier}
- Hedefin kişisel nedeni: ${signals.motivation}${signals.goalPlan ? `
- KULLANICININ HEDEF PLANI TAAHHÜDÜ: ${signals.goalPlan.targetWeightKg} kg hedefi, haftada ${signals.goalPlan.weeklyDays} gün, seans ${signals.goalPlan.sessionMinutes} dk, tempo "${signals.goalPlan.intensity}". Haftalık gün ve seans süresi BU taahhütten alındı; programı buna uydur.` : ""}
- Günlük hareket: ${signals.movementLevel}
- Uyku: ${signals.sleepQuality}
- Serbest not: ${signals.note}
- Profil çeşitlilik anahtarı: ${signals.fingerprint}

UYGULAMADA KULLANILABİLEN HAREKET KATALOĞU: <facts> içindeki exerciseCatalog.

GÜVENLİK VE KALİTE KURALLARI:
${plannerRules.join("\n")}

Tam olarak ${signals.exerciseCount} farklı hareket seç. Her workout için katalogdaki id ve name alanlarını birebir kullan; katalogda bulunmayan bir kimlik veya hareket üretme. Kullanıcının özellikle istediği hareket güvenli ve ekipmanla uyumluysa programa al. Geçmiş kayıt varsa set, tekrar, dinlenme ve hareket değişimini bu kayıtlara dayandır. analysis.adaptations alanında bu profile ve geçmişe özel en az üç somut uyarlamayı; hangi geri bildirimin hangi değişime yol açtığını açıklayarak yaz. weeklySchedule alanında ${signals.weeklyDays} antrenman günü oluştur. progression alanında 1–4. haftalar için dört kısa ilerleme adımı yaz. Dış site, bağlantı veya medya URL'si üretme.

ÇIKTI DİLİ: ${locale === "en" ? "title, profileSummary, rationale, safetyNote, analysis içindeki tüm metin alanları, weeklySchedule.focus, progression ve workouts[].area/instructions dahil olmak üzere TÜM serbest metinleri İNGİLİZCE yaz. workouts[].id ve workouts[].name alanlarını katalogdaki gibi DEĞİŞTİRMEDEN bırak." : "Tüm metinleri Türkçe yaz."}`;

  const image = photoDataUrl ? parseImageDataUrl(photoDataUrl) ?? undefined : undefined;

  // Kullanıcının sevmediği hareketler, ekipmanı ve sakatlık kısıtları programın
  // KENDİSİNİ belirler; koç sohbetinde öğrenilen tercih burada işe yarar.
  const memories = await loadMemories(request);

  const buildRequest = (policy?: Parameters<typeof generateCoachObject>[0]["policy"]) => ({
    prompt,
    image,
    schema: responseSchema,
    // Fotoğraf varsa yalnız görsel destekli sağlayıcı bu işi yapabilir.
    category: image ? "vision" as const : "plan_generation" as const,
    locale: locale as "tr" | "en",
    memories,
    facts: planFacts,
    knowledgeQuery: `${signals.primaryGoal} ${signals.preferredStyle} antrenman programı`,
    // Kullanıcının serbest notu güvenlik katmanından geçer.
    userText: signals.note,
    domainRules: "Sen güvenli ve kişiselleştirilmiş fitness programı hazırlayan bir asistansın.",
    temperature: 0.35,
    // Bu sağlayıcının modelleri "akıl yürütme" token'ı harcıyor ve bu da
    // aynı bütçeden düşüyor. 3.000 ile ölçüldü: 2.997 token düşünmeye gitti,
    // içerik 0 karakter kaldı ve üretim HER SEFERİNDE "length" ile kesildi —
    // yani plan hiç üretilemiyordu. 8.000'de düşünme 1.212'de kalıyor ve
    // plan tamamlanıyor.
    maxOutputTokens: 8_000,
    // Kullanıcı profil testinden sonra boş bir yükleme ekranında beklememeli.
    // Uzak model 15 saniyede tamamlamazsa doğrulanmış katalogdan yerel plan
    // devreye girer; profil kaydı ve program oluşturma yine tamamlanır.
    abortSignal: AbortSignal.timeout(15_000),
    policy,
  });

  try {
    let result = await generateCoachObject(buildRequest());
    let plan = result.object;
    // Yerel model şemaya UYGUN JSON döndürebilir (kısıtlı kod çözüm bunu
    // garanti eder) ama ANLAMCA yetersiz bir plan üretebilir (ör. yeterli
    // egzersiz seçmemiş). Bu rotada — goal-plan/weekly-review'ün aksine —
    // şablon bir yedek YOK ("uydurulmuş" bir program güvenli değil); bu
    // yüzden yerelin sonucu geçersizse UZAĞA BİR KEZ yeniden denenir. Böylece
    // yerel yalnızca "önce dene" katmanı olur, kullanıcı hiçbir zaman
    // gereksiz bir 502 görmez.
    if (plan.workouts.length < 3 && result.provider !== "openai-compatible") {
      result = await generateCoachObject(buildRequest({ mode: "remote" }));
      plan = result.object;
    }
    if (plan.workouts.length < 3) {
      if (Number.isFinite(usage.limit)) await refundUsage(request, "plan");
      return Response.json({ ...buildLocalPlan(signals, exerciseCatalog, locale), profileFingerprint: signals.fingerprint, model: "hedefit-deterministic-v1", fallback: true });
    }
    // Uzak modelin metinsel koçluğunu korurken programın kendisini Atlas'tan
    // gelen güvenli, ekipman ve sakatlık filtreli seçimle sabit tut.
    return Response.json({
      ...atlasPlan,
      title: plan.title || atlasPlan.title,
      profileSummary: plan.profileSummary || atlasPlan.profileSummary,
      rationale: plan.rationale || atlasPlan.rationale,
      safetyNote: plan.safetyNote || atlasPlan.safetyNote,
      analysis: plan.analysis || atlasPlan.analysis,
      progression: plan.progression?.length ? plan.progression : atlasPlan.progression,
      profileFingerprint: signals.fingerprint,
      model: result.model,
      atlasLocked: true,
    });
  } catch (error) {
    console.error("AI plan generation error", error);
    if (Number.isFinite(usage.limit)) await refundUsage(request, "plan");
    return Response.json({ ...buildLocalPlan(signals, exerciseCatalog, locale), profileFingerprint: signals.fingerprint, model: "hedefit-deterministic-v1", fallback: true });
  }
}

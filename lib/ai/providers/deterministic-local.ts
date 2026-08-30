import { AiUnsupportedRequestError } from "../errors.ts";
import type { CoachFacts } from "../intelligence.ts";
import type { AIProvider, AiRequest, AiResponse, AiTaskCategory } from "../types.ts";

export const LOCAL_PROVIDER_ID = "local-deterministic";
export const LOCAL_MODEL_ID = "hedefit-deterministic-v2";

const SUPPORTED: readonly AiTaskCategory[] = [
  "conversation",
  "simple_coaching",
  "daily_summary",
  "activity_summary",
  "goal_progress",
  "motivation",
  "nutrition_explanation",
];

function factsSummary(facts: CoachFacts | undefined, en: boolean) {
  if (!facts) return "";
  const lines: string[] = [];
  if (typeof facts.today.remainingCalories === "number" && typeof facts.goals.calorieTarget === "number") {
    lines.push(en
      ? `You have ${Math.round(facts.today.remainingCalories)} kcal left from today's ${Math.round(facts.goals.calorieTarget)} kcal target.`
      : `Bugünkü ${Math.round(facts.goals.calorieTarget)} kcal hedefinden ${Math.round(facts.today.remainingCalories)} kcal kaldı.`);
  }
  if (typeof facts.today.steps === "number") {
    lines.push(en ? `Your current step count is ${Math.round(facts.today.steps)}.` : `Güncel adım sayın ${Math.round(facts.today.steps)}.`);
  }
  if (typeof facts.activity.workoutsThisWeek === "number") {
    lines.push(en
      ? `You completed ${facts.activity.workoutsThisWeek} workouts this week.`
      : `Bu hafta ${facts.activity.workoutsThisWeek} antrenman tamamladın.`);
  }
  return lines.join(" ");
}

function safeAdvice(question: string, en: boolean) {
  const value = question.toLocaleLowerCase(en ? "en-US" : "tr-TR");
  if (/göğüs ağr|baş dön|keskin ağrı|chest pain|dizz|sharp pain/.test(value)) {
    return en
      ? "Stop exercising now. For chest pain, trouble breathing, fainting, or severe symptoms, seek emergency help. For persistent pain, get medical advice before returning to training."
      : "Egzersizi şimdi durdur. Göğüs ağrısı, nefes darlığı, bayılma veya şiddetli belirti varsa acil yardım al. Devam eden ağrı için antrenmana dönmeden önce sağlık uzmanına danış.";
  }
  if (/protein/.test(value)) return en
    ? "For a generally healthy adult doing regular resistance training, 1.2–1.6 g of protein per kg of body weight per day is a practical general target. Spread it across 3–4 meals."
    : "Düzenli direnç antrenmanı yapan genel olarak sağlıklı bir yetişkin için günlük kilo başına 1,2–1,6 g protein pratik bir genel hedeftir. Bunu 3–4 öğüne yay.";
  if (/uyku|dinlen|yorgun|sleep|rest|fatigue|recover/.test(value)) return en
    ? "Keep today's session moderate if recovery is poor. Prioritize sleep, hydration, controlled form, and avoid increasing both load and volume at once."
    : "Toparlanman zayıfsa bugünkü seansı orta zorlukta tut. Uyku, su ve kontrollü forma öncelik ver; yük ile hacmi aynı anda artırma.";
  if (/kilo ver|yağ yak|kalori|lose weight|fat loss|calorie/.test(value)) return en
    ? "Use a modest calorie deficit, keep protein and daily movement consistent, and judge progress from a multi-week trend rather than one day."
    : "Ilımlı bir kalori açığı kullan; proteinini ve günlük hareketini düzenli tut. İlerlemeyi tek güne değil birkaç haftalık trende göre değerlendir.";
  if (/kas|set|tekrar|antrenman|spor|egzersiz|muscle|set|rep|workout|train|exercise/.test(value)) return en
    ? "Warm up for 5–8 minutes, use controlled reps, and choose a load that leaves about two good reps in reserve. Progress one variable at a time."
    : "5–8 dakika ısın, tekrarları kontrollü yap ve yaklaşık iki kaliteli tekrar yedekte bırakacak yük seç. Her seferinde yalnız bir değişkeni artır.";
  return en
    ? "Cloud coaching is temporarily unavailable, but your data is safe. Ask about training, nutrition, recovery, steps, or today's targets and I can still give a safe data-based answer."
    : "Bulut koçu geçici olarak kullanılamıyor ancak verilerin güvende. Antrenman, beslenme, toparlanma, adım veya bugünkü hedeflerin hakkında sorarsan güvenli ve veriye dayalı yanıt verebilirim.";
}

export const deterministicLocalProvider: AIProvider = {
  id: LOCAL_PROVIDER_ID,
  kind: "local",
  categories: [],
  lastResortCategories: SUPPORTED,
  async isAvailable() { return true; },
  async generateText(request: AiRequest): Promise<AiResponse> {
    if (!SUPPORTED.includes(request.category)) throw new AiUnsupportedRequestError(`unsupported local category: ${request.category}`);
    const startedAt = Date.now();
    const en = request.locale === "en";
    const question = request.messages?.at(-1)?.text ?? request.prompt ?? "";
    const summary = factsSummary(request.facts as CoachFacts | undefined, en);
    const advice = safeAdvice(question, en);
    return {
      text: summary ? `${summary}\n\n${advice}` : advice,
      provider: LOCAL_PROVIDER_ID,
      model: LOCAL_MODEL_ID,
      latencyMs: Date.now() - startedAt,
    };
  },
};

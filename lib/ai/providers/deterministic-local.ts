// Cihazda çalışan, ağ gerektirmeyen sağlayıcı.
//
// NEDEN "deterministic"? Bu sağlayıcı gerçek bir cihaz-üstü LLM değildir.
// Ancak "yerel" olmak
// için LLM şart değil: sorulan soruların önemli bir kısmı ("bugün spor yapmalı
// mıyım?", "kaç kalorim kaldı?") deterministik motorun ürettiği sayılarla,
// şablonlanmış ve tıbben güvenli cümlelerle TAM olarak yanıtlanabilir.
//
// Bu sağlayıcı gerçek bir sağlayıcıdır, yer tutucu değildir:
//   · ağ kullanmaz → çevrimdışı çalışır, token ücreti yoktur, veri cihazdan çıkmaz
//   · yalnızca cevaplayabildiği kategorileri kabul eder → uyduramaz
//   · emin değilse `AiUnsupportedRequestError` fırlatır → router uzağa geçer
//
// Bu dosya son yerel savunma hattı olarak kalır.

import { localCoachReply } from "../../ai-coach.ts";
import { AiUnsupportedRequestError } from "../errors.ts";
import type { AIProvider, AiRequest, AiResponse, AiTaskCategory } from "../types.ts";
import type { CoachFacts } from "../intelligence.ts";

// Rotaların "bu yanıtı yerel sağlayıcı mı üretti?" diye sorabilmesi için;
// kimlik dizesinin iki yerde elle yazılması sürüklenmeye açık olurdu.
export const LOCAL_PROVIDER_ID = "local-deterministic";
export const LOCAL_MODEL_ID = "hedefit-deterministic-v1";

// Yalnızca bunlar. `complex_reasoning`, `structured_extraction` ve `vision`
// bilerek dışarıda: şablon bir cümle bu işleri yapamaz, uydurmaktansa
// yönlendiriciye "beni atla" demek doğrudur.
const LOCAL_CATEGORIES: readonly AiTaskCategory[] = [
  "simple_coaching",
  "daily_summary",
  "activity_summary",
  "goal_progress",
  "motivation",
];

// Deterministik sağlayıcı bütün desteklediği kategorilerde SON ÇAREDİR.
// Automatic: cihaz üstü LLM → uzak sağlayıcı → deterministik.
// Local-only: cihaz üstü LLM → deterministik (uzak sağlayıcı hiç seçilmez).
// Böylece basit koçlukta bile bir native arıza, kaliteli uzak model dururken
// doğrudan şablon yanıta düşmez.
const LOCAL_LAST_RESORT_CATEGORIES: readonly AiTaskCategory[] = ["conversation", "nutrition_explanation"];

const ALL_LOCAL_CATEGORIES = [...LOCAL_CATEGORIES, ...LOCAL_LAST_RESORT_CATEGORIES];

function round(value: number) {
  return Math.round(value);
}

/** Sayıları cümleye çevirir. Hiçbir değeri BURADA hesaplamayız; hepsi motordan gelir. */
function factSentences(facts: CoachFacts, locale: "tr" | "en"): string[] {
  const lines: string[] = [];
  const { today, trends, activity, goals } = facts;

  if (typeof today.remainingCalories === "number" && typeof goals.calorieTarget === "number") {
    lines.push(locale === "en"
      ? `Today you've taken in ${round(today.caloriesConsumed ?? 0)} kcal of your ${round(goals.calorieTarget)} kcal target — ${round(today.remainingCalories)} kcal left.`
      : `Bugün ${round(goals.calorieTarget)} kcal hedefinin ${round(today.caloriesConsumed ?? 0)} kcal'ini aldın; ${round(today.remainingCalories)} kcal kaldı.`);
  }
  if (typeof today.steps === "number") {
    lines.push(locale === "en"
      ? `Your step count is ${round(today.steps)}.`
      : `Adım sayın ${round(today.steps)}.`);
  }
  if (typeof activity.workoutsThisWeek === "number") {
    lines.push(locale === "en"
      ? `You've completed ${activity.workoutsThisWeek} workouts this week.`
      : `Bu hafta ${activity.workoutsThisWeek} antrenman tamamladın.`);
  }
  if (typeof trends.weightChange7dKg === "number" && trends.weightChange7dKg !== 0) {
    const delta = Math.abs(trends.weightChange7dKg).toFixed(1);
    const down = trends.weightChange7dKg < 0;
    lines.push(locale === "en"
      ? `Your weight has moved ${down ? "down" : "up"} ${delta} kg over the last 7 days.`
      : `Son 7 günde kilon ${delta} kg ${down ? "azaldı" : "arttı"}.`);
  }
  return lines;
}

export const deterministicLocalProvider: AIProvider = {
  id: LOCAL_PROVIDER_ID,
  kind: "local",
  categories: [],
  lastResortCategories: ALL_LOCAL_CATEGORIES,

  // Her zaman hazır: kurulum, indirme veya ağ gerektirmez. Yerel katmanın
  // "her koşulda bir cevabı var" garantisi buradan gelir.
  async isAvailable() {
    return true;
  },

  async generateText(request: AiRequest): Promise<AiResponse> {
    const startedAt = Date.now();
    if (!ALL_LOCAL_CATEGORIES.includes(request.category)) {
      throw new AiUnsupportedRequestError(`local provider does not handle ${request.category}`);
    }
    const locale = request.locale === "en" ? "en" : "tr";
    const question = request.messages?.at(-1)?.text || request.prompt || "";

    // Anahtar kelime tabanlı güvenli koçluk cevabı (göç öncesinden beri
    // kullanılan, tıbben temkinli metinler) + deterministik motorun sayıları.
    const advice = localCoachReply(question, locale);
    const facts = request.facts as CoachFacts | undefined;
    const numbers = facts ? factSentences(facts, locale) : [];
    const text = numbers.length ? `${numbers.join(" ")}\n\n${advice}` : advice;

    return {
      text,
      provider: LOCAL_PROVIDER_ID,
      model: LOCAL_MODEL_ID,
      latencyMs: Date.now() - startedAt,
    };
  },
  // generateObject bilerek TANIMSIZ: şablon motoru serbest şema üretemez.
  // Router bunu görüp şema gerektiren isteklerde bu sağlayıcıyı atlar.
};

// Koçun önerdiği EYLEMLER.
//
// NEDEN VAR: koç bugüne kadar yalnız metin döndürüyordu. "25 dakika yürüyüş
// öneriyorum" diyen bir yanıtın ardından kullanıcı uygulamayı kendi gezip o
// şeyi kendi kurmak zorundaydı. Eylemlerle sohbet, uygulamanın kontrol
// katmanına dönüşüyor.
//
// TAŞIMA BİÇİMİ: model, yanıtının SONUNA ```hedefit-actions``` etiketli bir
// JSON bloğu ekleyebilir. Sağlayıcıdan bağımsız çalışması için tool-calling
// yerine bu yol seçildi — uygulama üç farklı sağlayıcıyla ve cihaz üstü bir
// modelle çalışıyor, hepsinin araç çağırma desteği aynı değil. Blok yoksa ya
// da bozuksa eylem üretilmez; kullanıcı normal metni görür.
//
// İKİ KURAL PAZARLIĞA KAPALI:
//   1. Eylem kullanıcı ONAYI olmadan uygulanmaz. Buradaki her şey bir ÖNERİdir;
//      düğmeye basan kullanıcıdır. Model kendi başına hedef değiştiremez.
//   2. Yerel yedek yanıtlarda eylem ayrıştırılmaz (bkz. çağıran taraf):
//      cihaz üstü küçük modelin ürettiği yapılandırılmış çağrıya güvenilmez.

export type CoachAction =
  /** Önerilen antrenmanı bugünün planına ekler. */
  | { type: "openWorkout" }
  /** Belirli bir bölgeye program kurma ekranını açar. */
  | { type: "createWorkout"; region: string }
  /** Hedefit Rota'yı açık hava aktivitesi için başlatır. */
  | { type: "startOutdoor" }
  /** Beslenme ekranını açar; hedef kalori önerilmişse taşır. */
  | { type: "suggestMeal"; targetKcal?: number }
  /** Günlük hatırlatma ayarlarını açar. */
  | { type: "remind" }
  /** Hedef planı ekranını açar. */
  | { type: "changeGoal" };

export type CoachActionType = CoachAction["type"];

/** Ekranda gösterilecek en fazla eylem. Fazlası yanıtı menüye çevirir. */
export const MAX_COACH_ACTIONS = 3;

const BLOCK = /```hedefit-actions\s*([\s\S]*?)```/i;

/** Katalogdaki bölge adları; uydurulmuş bir bölge kabul edilmez. */
const REGIONS = new Set(["Göğüs", "Sırt", "Omuz", "Kol", "Bacak", "Kalça", "Core", "Kondisyon"]);

function toAction(raw: unknown): CoachAction | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  switch (value.type) {
    case "openWorkout": return { type: "openWorkout" };
    case "startOutdoor": return { type: "startOutdoor" };
    case "remind": return { type: "remind" };
    case "changeGoal": return { type: "changeGoal" };
    case "createWorkout": {
      const region = typeof value.region === "string" ? value.region.trim() : "";
      return REGIONS.has(region) ? { type: "createWorkout", region } : null;
    }
    case "suggestMeal": {
      const kcal = Number(value.targetKcal);
      // Kalori hedefi modelin uydurduğu bir sayı OLABİLİR; makul aralık
      // dışındaki değer taşınmaz, ekran kendi hesabını gösterir.
      const valid = Number.isFinite(kcal) && kcal >= 100 && kcal <= 2_000;
      return valid ? { type: "suggestMeal", targetKcal: Math.round(kcal) } : { type: "suggestMeal" };
    }
    default: return null;
  }
}

export type ParsedCoachResponse = {
  /** Kullanıcıya gösterilecek metin; eylem bloğu ayıklanmış hâlde. */
  text: string;
  actions: CoachAction[];
};

/**
 * Yanıttan eylem bloğunu ayıklar.
 *
 * Blok bulunamazsa, JSON bozuksa ya da hiçbir eylem tanınmazsa metin olduğu
 * gibi döner ve eylem listesi boş kalır — koç metin koçu olarak çalışmaya
 * devam eder. Bu, modelin biçime uymadığı durumda bozulmayan tek davranış.
 */
export function parseCoachActions(rawText: string): ParsedCoachResponse {
  const text = typeof rawText === "string" ? rawText : "";
  const match = BLOCK.exec(text);
  if (!match) return { text: text.trim(), actions: [] };

  const cleaned = text.replace(BLOCK, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch {
    // Bozuk JSON kullanıcıya blok olarak GÖSTERİLMEZ: yanıtın sonunda ham
    // kod parçası görmek, çalışmayan bir özellikten daha kötü.
    return { text: cleaned, actions: [] };
  }

  const list = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { actions?: unknown })?.actions) ? (parsed as { actions: unknown[] }).actions : [];
  const actions: CoachAction[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const action = toAction(item);
    if (!action) continue;
    // Aynı eylem iki kez önerilirse ekranda iki özdeş düğme olurdu.
    const key = action.type === "createWorkout" ? `createWorkout:${action.region}` : action.type;
    if (seen.has(key)) continue;
    seen.add(key);
    actions.push(action);
    if (actions.length >= MAX_COACH_ACTIONS) break;
  }
  return { text: cleaned, actions };
}

/**
 * Modele eylem biçimini anlatan talimat.
 *
 * Prompt'a YALNIZCA gerçek (uzak) sağlayıcı kullanılırken eklenir; cihaz üstü
 * küçük modelden yapılandırılmış çıktı beklenmiyor.
 */
export const COACH_ACTIONS_INSTRUCTION = {
  tr: `Yanıtın kullanıcıyı uygulamada bir işe yönlendiriyorsa, metnin SONUNA şu biçimde bir blok ekleyebilirsin:
\`\`\`hedefit-actions
[{"type":"openWorkout"}]
\`\`\`
Geçerli eylemler: openWorkout (antrenmanı aç), createWorkout + region (Göğüs/Sırt/Omuz/Kol/Bacak/Kalça/Core/Kondisyon), startOutdoor (açık hava aktivitesi başlat), suggestMeal + targetKcal (beslenme ekranı), remind (hatırlatma ayarları), changeGoal (hedef planı).
En fazla 3 eylem öner. Eylem gerekmiyorsa blok ekleme. Blok dışında JSON yazma; eylemleri metin içinde tekrar anlatma.`,
  en: `If your answer points the user to something in the app, you may append a block in this format at the END of your text:
\`\`\`hedefit-actions
[{"type":"openWorkout"}]
\`\`\`
Valid actions: openWorkout, createWorkout + region (Göğüs/Sırt/Omuz/Kol/Bacak/Kalça/Core/Kondisyon), startOutdoor, suggestMeal + targetKcal, remind, changeGoal.
Suggest at most 3 actions. Omit the block when no action is needed. Do not write JSON outside the block and do not restate the actions in prose.`,
} as const;

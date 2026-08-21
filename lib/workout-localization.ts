import type { Locale } from "@/lib/i18n/locale";

/**
 * Antrenman hareketlerinin EKRANDA gösterilen dili.
 *
 * Hareket ADLARI dilden bağımsızdır: her zaman İngilizce gösterilir (bkz.
 * movementName). Dil ayarına göre değişen şey hareketin çevresindeki
 * metinlerdir — bölge etiketi, set/dinlenme reçetesi ve açıklamalar.
 *
 * Uygulamanın kendi hareket kataloğu (bkz. components/FitAiApp.tsx
 * `exerciseLibrary`) her kaydı iki adla tutar: kayıt/eşleştirme anahtarı olan
 * Türkçe `name` ve ekranda gösterilen `english`. Set/dinlenme reçeteleri plan
 * üretilirken Türkçe metin olarak
 * kurulur ve öyle saklanır ("3 set · 10 tekrar"). Bu modül, saklanan veriyi
 * DEĞİŞTİRMEDEN çizim anında seçili dile çevirir; böylece kullanıcı dili
 * değiştirdiğinde kayıtlı planlar da anında o dile döner.
 *
 * Hareket kütüphanesindeki (data/exercises.json) 873 hareketin adı bilerek
 * İngilizce kalır: bunlar salon dilinde Türkçe konuşurken de İngilizce
 * kullanılan evrensel adlar. Kas grubu, ekipman, seviye gibi ETİKETLER ise
 * çevrilir — bkz. lib/exercise-translations.ts.
 */

/** Katalogdaki bölge adları Türkçe saklanır; İngilizce karşılıkları burada. */
const AREA_EN: Record<string, string> = {
  "Göğüs": "Chest",
  "Sırt": "Back",
  "Bacak": "Legs",
  "Kalça": "Hips",
  "Omuz": "Shoulders",
  "Kol": "Arms",
  "Core": "Core",
  "Kondisyon": "Conditioning",
  "Esneklik": "Mobility",
};

export function movementArea(area: string | undefined | null, locale: Locale): string {
  if (!area) return "";
  return locale === "en" ? AREA_EN[area] || area : area;
}

/**
 * Ekranda gösterilecek hareket adı: HER ZAMAN İngilizce.
 *
 * Hareket adları uygulama dilinden bağımsızdır — "Bench Press", "Deadlift"
 * gibi adlar salonun ortak dili ve Türkçe konuşurken de böyle kullanılıyor.
 * Katalogdaki Türkçe ad (`name`) kayıt/eşleştirme anahtarı olarak kalır,
 * yalnız İngilizce karşılığı olmayan bir kayıtta yedek olarak gösterilir.
 * Dil ayarına göre değişen şey ADLAR DEĞİL, açıklamalardır (bkz.
 * movementInstructions ve motionGuidesEn).
 */
export function movementName(exercise: { name: string; english?: string }): string {
  return exercise.english || exercise.name;
}

/**
 * "3 set · 10 tekrar", "60 sn dinlenme", "30 sn" gibi reçete metinlerini
 * çevirir. Metinler uygulamanın kendi şablonlarından çıktığı için kalıp
 * dardır; yine de eşleşmeyen bir parça olduğu gibi bırakılır.
 */
export function movementPrescription(text: string | undefined | null, locale: Locale): string {
  if (!text) return "";
  if (locale !== "en") return text;
  return text
    .replace(/(\d+)\s*set\b/gi, (_match, count: string) => `${count} ${count === "1" ? "set" : "sets"}`)
    .replace(/(\d+)\s*tekrar/gi, (_match, count: string) => `${count} ${count === "1" ? "rep" : "reps"}`)
    .replace(/(\d+)\s*sn\s*dinlenme/gi, (_match, seconds: string) => `${seconds} s rest`)
    .replace(/(\d+)\s*sn/gi, (_match, seconds: string) => `${seconds} s`)
    .replace(/\bdinlenme\b/gi, "rest");
}

// Aktivite (spor) simgelerinin yol verileri.
//
// Eskiden aktivite listelerinde sporun BAŞ HARFLERİ yazıyordu ("KO", "Bİ",
// "DA"). İki harf ne bir simgedir ne de okunur; listede hepsi aynı gri kutu
// gibi görünüyordu. Buradaki çizgi ikonları sporun kendisini gösterir.
//
// Kural components/onboarding/OnboardingIcon.tsx ile aynıdır: emoji YOK
// (platformdan platforma değişir ve paleti bozar), `currentColor` kullanılır
// (açık/koyu temada satırın metniyle aynı rengi alır) ve tek bir `d` içinde
// alt yollar birleştirilir.
//
// Yol verisi bileşenden AYRI bir modülde: katalogdaki her sporun bir simgesi
// olduğu, tarayıcı olmadan test edilebilsin diye.
//
// Anahtarlar lib/sports.ts'teki `SportDefinition.key` ile birebir aynıdır.

export type ActivityIconName =
  | "walking" | "running" | "cycling" | "swimming"
  | "football" | "basketball" | "volleyball" | "tennis" | "table-tennis"
  | "yoga" | "pilates" | "boxing" | "dance"
  | "hiking" | "rowing" | "skiing"
  | "generic";

export const ACTIVITY_ICON_PATHS: Record<ActivityIconName, string> = {
  // Yürüyüş: kısa adım, dik gövde. Koşudan farkı gövdenin eğimi ve adım açısı.
  walking: "M12.5 3a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2M12.9 7.4 11.2 12.6l2.5 2.2.7 5.8M11.2 12.6 8.8 15.1l-1 5.3M12.6 9.1l2.7 1.5M11.7 9.5 9 11.3",
  // Koşu: öne eğik gövde, geniş adım, bükülü kollar.
  running: "M14.6 3a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2M14.9 7.4 12.2 12l3 3.3-1.5 5M12.2 12 9 14.4l.7 4.6M14.6 8.3l2.9 1.6-1.3 2.6M13.6 8.9 10.8 9.4 8.6 11.4",
  // Bisiklet: iki teker + kadro. İnsan figürü 24 px'te tekerleklerle karışıyordu.
  cycling: "M5.5 13.8a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4M18.5 13.8a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4M5.5 17h4.1l2.8-7.2L18.5 17M9.6 17 14 9.8M12.4 9.8h3.4l1.2-2.2",
  // Yüzme: su çizgisi + kulaç atan kol.
  swimming: "M3 19c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 2 .7 2.5.5M9 10.2a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2M10.6 12.6 16 14.4M10.9 11.4 14.4 6.6l3-.6M4.2 16.4 8.4 14.6",
  // Futbol topu: beşgen panel.
  football: "M12 4.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15M12 8.2l3.1 2.3-1.2 3.7h-3.8l-1.2-3.7ZM12 4.5v3.7M18.9 9.6l-3.8.9M17 17.5l-3.1-3.3M7 17.5l3.1-3.3M5.1 9.6l3.8.9",
  // Basketbol: dik/yatay dikiş + iki yay.
  basketball: "M12 4.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15M4.5 12h15M12 4.5v15M6.7 6.7c3 3 3 7.6 0 10.6M17.3 6.7c-3 3-3 7.6 0 10.6",
  // Voleybol: basketboldan ayrılsın diye dikişler eğik ve asimetrik.
  volleyball: "M12 4.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15M12 4.5c-2.6 3.3-3.3 8.5-1.4 14.8M19.4 10c-4.1-.7-8.9.9-12.6 5.6M5 13.6c1.9-3.7 6-6.9 11.6-7.7",
  // Tenis: raket + top.
  tennis: "M13.4 3.4c2.6 0 4.4 2.1 4.4 5s-2.4 5.4-5 5.4-4.4-2.1-4.4-5 2.4-5.4 5-5.4ZM9.7 8.4h7.4M13.4 4.2v9.4M10.4 13 7 17.2a1.6 1.6 0 0 1-2.4-2.1L8 11.2M18.6 17.4a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6",
  // Masa tenisi: yuvarlak raket + küçük top.
  "table-tennis": "M9 3.6a5.4 5.4 0 1 1 0 10.8A5.4 5.4 0 0 1 9 3.6ZM10.8 13.8l2.6 5.8a1.7 1.7 0 0 1-3.1 1.2l-2-5.4M18.6 6.4a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6",
  // Yoga: bağdaş kurmuş figür, kollar dizlerde.
  yoga: "M12 3a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4M12 7v6M12 9.6 7 12.4M12 9.6l5 2.8M12 13c-3.4 0-5.6 1.6-6.2 4.2 2 .8 4.1 1.2 6.2 1.2s4.2-.4 6.2-1.2C17.6 14.6 15.4 13 12 13Z",
  // Pilates: mat üstünde sırtüstü, bacaklar havada.
  pilates: "M3 20.4h18M6.4 15.2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3M8 17.4h5.4M13.4 17.4 17.6 11.4M17.6 11.4l2.4 1.7M8.8 16.4 11.2 12.8",
  // Boks: eldiven.
  boxing: "M8.4 5.6c0-1.4 1.1-2.4 2.6-2.4h2.6c2.7 0 4.6 2 4.6 4.9v3.1c0 1.5-.6 2.6-1.8 3.4v2.2c0 1.1-.9 2-2 2h-5.2c-1.1 0-2-.9-2-2v-2.4c-1.4-1-2.2-2.5-2.2-4.4V8.4c0-1 .7-1.7 1.6-1.7s1.5.7 1.5 1.7v1.8M8.6 15.6h8.2",
  // Dans: bir kolu havada, kalçası kırık figür + nota.
  dance: "M13.6 3a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2M13.8 7.4c-1.5 1.4-2.1 3-1.8 4.9M13.7 8.6 16.4 6.2 18 3.8M12.7 9.8 9.6 11M12 12.3 14.6 15l-.6 5.4M12 12.3 8.4 15.4 6.6 19",
  // Doğa yürüyüşü: sırt çantalı figür + baston. Doğa modülü de bunu kullanır.
  hiking: "M13.4 3.2a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2M13.6 7.4 11.8 12.4l2.6 2.6.5 5.4M11.8 12.4 9 15l-.8 5.4M15.6 8.4l1.7.9.3 3.3-2.4.6M19 9.2 18.2 20.6M12.9 9.2 10 11",
  // Kürek: kürekçi + küreğin sapı ve palası, altta tekne hattı.
  rowing: "M13.6 5.2a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2M13.8 9.4 10.6 12.4h4.8l2 3M12.6 11 8.4 9.6M3.6 8.2 16.6 12.8M2.2 6.4 4.8 9.6M4 17.4c2.4 2 5 3 8 3s5.6-1 8-3",
  // Kayak: eğik figür, iki sopa, altta paralel kayaklar.
  skiing: "M14.6 3.4a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2M14.8 7.6 12.2 11.8M12.2 11.8 13.8 15.6M12.2 11.8 9.6 14.6M4 17.2 20 13.2M5.6 20.4 21 16.2M16.6 9.6 15 18.4M10.2 12.8 8.6 19.4M14.4 8.6l2.4 1.2",
  // Kataloğa yeni bir spor eklenip ikonu unutulursa düşülen genel simge.
  generic: "M4 12h2m12 0h2M6.5 8.5v7m11-7v7M9.5 10v4m5-4v4M9.5 12h5",
};

export function activityIconName(key: string): ActivityIconName {
  return key in ACTIVITY_ICON_PATHS ? key as ActivityIconName : "generic";
}

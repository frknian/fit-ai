export type SportMetricKey = "distanceKm" | "elevationM" | "laps" | "rounds" | "sets" | "goals" | "points";

export type SportMetric = {
  key: SportMetricKey;
  label: string;
  unit: string;
  step?: string;
};

export type SportDefinition = {
  key: string;
  name: string;
  guide: string;
  metrics: SportMetric[];
};

export const sportCatalog: SportDefinition[] = [
  { key: "running", name: "Koşu", guide: "Açık hava veya koşu bandı koşusu", metrics: [{ key: "distanceKm", label: "Mesafe", unit: "km", step: "0.1" }] },
  { key: "cycling", name: "Bisiklet", guide: "Yol, dağ veya sabit bisiklet", metrics: [{ key: "distanceKm", label: "Mesafe", unit: "km", step: "0.1" }, { key: "elevationM", label: "Tırmanış", unit: "m" }] },
  { key: "swimming", name: "Yüzme", guide: "Havuz veya açık su antrenmanı", metrics: [{ key: "distanceKm", label: "Mesafe", unit: "km", step: "0.05" }, { key: "laps", label: "Havuz turu", unit: "tur" }] },
  { key: "football", name: "Futbol", guide: "Maç, halı saha veya teknik çalışma", metrics: [{ key: "goals", label: "Gol", unit: "adet" }] },
  { key: "basketball", name: "Basketbol", guide: "Maç veya şut/teknik antrenmanı", metrics: [{ key: "points", label: "Sayı", unit: "puan" }] },
  { key: "volleyball", name: "Voleybol", guide: "Salon veya plaj voleybolu", metrics: [{ key: "sets", label: "Oynanan set", unit: "set" }] },
  { key: "tennis", name: "Tenis", guide: "Tekler, çiftler veya kort çalışması", metrics: [{ key: "sets", label: "Oynanan set", unit: "set" }] },
  { key: "yoga", name: "Yoga", guide: "Akış, mobilite veya nefes seansı", metrics: [] },
  { key: "pilates", name: "Pilates", guide: "Mat veya reformer seansı", metrics: [] },
  { key: "boxing", name: "Boks", guide: "Torba, gölge boksu veya sparring", metrics: [{ key: "rounds", label: "Raunt", unit: "raunt" }] },
  { key: "dance", name: "Dans", guide: "Ders, prova veya serbest dans", metrics: [] },
  { key: "hiking", name: "Doğa yürüyüşü", guide: "Parkur veya uzun mesafe yürüyüşü", metrics: [{ key: "distanceKm", label: "Mesafe", unit: "km", step: "0.1" }, { key: "elevationM", label: "Tırmanış", unit: "m" }] },
  { key: "rowing", name: "Kürek", guide: "Su veya kürek ergometresi", metrics: [{ key: "distanceKm", label: "Mesafe", unit: "km", step: "0.1" }] },
  { key: "skiing", name: "Kayak", guide: "Alp, kuzey veya salon kayağı", metrics: [{ key: "distanceKm", label: "Mesafe", unit: "km", step: "0.1" }, { key: "elevationM", label: "İniş/tırmanış", unit: "m" }] },
  { key: "table-tennis", name: "Masa tenisi", guide: "Maç veya teknik çalışma", metrics: [{ key: "sets", label: "Oynanan set", unit: "set" }] },
];

export const activityIntensityOptions = ["Hafif", "Orta", "Yüksek"] as const;
export type ActivityIntensity = (typeof activityIntensityOptions)[number];

const activityMetValues: Record<string, Record<ActivityIntensity, number>> = {
  walking: { Hafif: 2.8, Orta: 4.3, Yüksek: 5.5 },
  running: { Hafif: 6, Orta: 8.3, Yüksek: 11 },
  cycling: { Hafif: 4, Orta: 6.8, Yüksek: 10 },
  swimming: { Hafif: 4.8, Orta: 7, Yüksek: 9.8 },
  football: { Hafif: 5, Orta: 7, Yüksek: 9 },
  basketball: { Hafif: 4.5, Orta: 6.5, Yüksek: 8 },
  volleyball: { Hafif: 3, Orta: 4.5, Yüksek: 6 },
  tennis: { Hafif: 5, Orta: 7.3, Yüksek: 9 },
  yoga: { Hafif: 2.3, Orta: 3, Yüksek: 4 },
  pilates: { Hafif: 2.5, Orta: 3.5, Yüksek: 4.5 },
  boxing: { Hafif: 5.5, Orta: 8, Yüksek: 11 },
  dance: { Hafif: 3.5, Orta: 5.5, Yüksek: 7.5 },
  hiking: { Hafif: 4, Orta: 6, Yüksek: 8 },
  rowing: { Hafif: 4.8, Orta: 7, Yüksek: 9 },
  skiing: { Hafif: 4.3, Orta: 6.8, Yüksek: 9 },
  "table-tennis": { Hafif: 3, Orta: 4, Yüksek: 5.5 },
};

export function estimateActivityCalories(activityKey: string, durationMinutes: number, weightKg: number, intensity: ActivityIntensity) {
  const duration = Math.max(0, Math.min(1440, Number(durationMinutes) || 0));
  const weight = Math.max(20, Math.min(500, Number(weightKg) || 0));
  const met = activityMetValues[activityKey]?.[intensity] ?? 4;
  if (!duration || !weight) return 0;
  return Math.round((met * 3.5 * weight * duration) / 200);
}

export const coreActivityCatalog: SportDefinition[] = [
  { key: "walking", name: "Yürüyüş", guide: "Günlük veya tempolu yürüyüş", metrics: [] },
  ...sportCatalog.filter((sport) => ["running", "cycling", "swimming"].includes(sport.key)),
];

// Aktivite günlüğündeki tek düz liste: önce en sık kaydedilen dört aktivite,
// ardından geri kalan sporlar. Eskiden sporlar "Diğer spor ekle" başlığının
// altında ayrı bir ızgarada duruyordu; kullanıcı basit bir spor kaydı için
// iki adım atmak zorunda kalıyordu.
export const allActivityCatalog: SportDefinition[] = [
  ...coreActivityCatalog,
  ...sportCatalog.filter((sport) => !coreActivityCatalog.some((core) => core.key === sport.key)),
];

export function sportByKey(key: string) {
  return sportCatalog.find((sport) => sport.key === key) || null;
}

export function validActivityDuration(value: string | number) {
  const duration = Number(value);
  return Number.isFinite(duration) && duration >= 1 && duration <= 1440;
}

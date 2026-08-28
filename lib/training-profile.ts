export function extractSessionMinutes(value: unknown, fallback = 30) {
  if (typeof value !== "string") return fallback;
  const normalized = value.toLocaleLowerCase("tr-TR").replace(",", ".");
  const hours = normalized.match(/(\d+(?:\.\d+)?)\s*(?:saat|hour)/i);
  if (hours) return Math.min(180, Math.max(10, Math.round(Number(hours[1]) * 60)));
  const minutes = normalized.match(/(\d{1,3})\s*(?:dakika|dk\b|minute|min\b)/i)
    || normalized.match(/(?:dakika|dk\b|minute|min\b)\s*(\d{1,3})/i);
  if (minutes) return Math.min(180, Math.max(10, Number(minutes[1])));
  const plausible = [...normalized.matchAll(/\d{1,3}/g)].map((match) => Number(match[0])).find((number) => number >= 10 && number <= 180);
  return plausible ?? fallback;
}

// Tamamlanan antrenman sayısına göre 4 kademeli ilerleme bloğu. Yeni başlayan
// kullanıcı en düşük hacimle başlar; her blokta yalnızca TEK bir değişken artar
// (önce tekrar, sonra set, en son dinlenme kısalır). Aynı anda hem set hem tekrar
// artırmak yeni başlayanlarda aşırı yüklenme riski taşıdığı için kaçınıldı.
/**
 * Profil testindeki haftalık sıklık cevabını ("5+ gün", "3–4 gün", "0 gün")
 * antrenman günü sayısına çevirir. Hem yerel plan hem AI istemi aynı yorumu
 * kullansın diye tek yerde durur.
 */
export function extractWeeklyDays(value: unknown, fallback = 2) {
  const text = typeof value === "string" ? value : "";
  if (text.includes("5+")) return 5;
  if (text.includes("3–4") || text.includes("3-4")) return 3;
  const explicitDays = text.match(/\b([1-7])\s*(?:gün|day)/i);
  if (explicitDays) return Number(explicitDays[1]);
  if (text.includes("0")) return 2;
  return fallback;
}

export function planProgressionBlock(completedSessions: number) {
  if (completedSessions >= 12) return 3;
  if (completedSessions >= 7) return 2;
  if (completedSessions >= 3) return 1;
  return 0;
}

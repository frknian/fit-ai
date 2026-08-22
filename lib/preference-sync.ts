"use client";

// Cihazlar arası tercih eşitlemesinin saf mantığı.
//
// Tercihler tek tek modüllerinde localStorage'a yazılır (tema, dil, birim,
// hedef kilo, kısayollar). Bu dosya onları tek bir torbada toplar ve uzaktaki
// satırla nasıl birleşeceğine karar verir. Supabase'i bilerek tanımaz:
// lib/i18n/locale.ts gibi hafif modüller bunu içe aktarabilsin diye.

export const SYNCED_PREFERENCE_KEYS = [
  "hedefit-theme",
  "hedefit:locale",
  "hedefit:quick-actions",
  "fitai:weight-unit",
  "fitai:target-weight-kg",
  "hedefit:goal-plan",
  "hedefit:custom-programs",
  "hedefit:program-log",
  "hedefit:smart-program-swaps",
  "hedefit:custom-regions",
  "hedefit:daily-reminder",
  "hedefit:guide-seen",
] as const;

export type PreferenceBag = Record<string, string>;

const KNOWN = new Set<string>(SYNCED_PREFERENCE_KEYS);

/** Verilen okuyucudan bilinen tercihleri toplar; boş olanlar torbaya girmez. */
export function collectPreferences(read: (key: string) => string | null): PreferenceBag {
  const bag: PreferenceBag = {};
  for (const key of SYNCED_PREFERENCE_KEYS) {
    const value = read(key);
    if (typeof value === "string" && value !== "") bag[key] = value;
  }
  return bag;
}

/** Uzaktan gelen jsonb'yi süzer: bilinmeyen anahtar ve dize olmayan değer atılır. */
export function sanitizePreferences(raw: unknown): PreferenceBag | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const bag: PreferenceBag = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (KNOWN.has(key) && typeof value === "string" && value !== "") bag[key] = value;
  }
  return bag;
}

export type SyncPlan = {
  /** Bu cihazda localStorage'a yazılacak değerler. */
  applyLocal: PreferenceBag;
  /** Sunucuya yazılacak tam torba; yazılacak bir şey yoksa null. */
  push: PreferenceBag | null;
};

/**
 * Uzaktaki satırla yerel tercihleri birleştirir.
 *
 * Kural: uzaktaki değer kazanır. Kullanıcı telefonda koyu temaya geçtiyse
 * web'i açtığında koyu tema görmeli — yerel değer o cihazın eski hâlidir.
 * Yalnız yerelde bulunan anahtarlar (uzakta hiç kaydedilmemiş bir tercih)
 * kaybolmasın diye yukarı itilir; bu aynı zamanda localStorage'da birikmiş
 * eski tercihlerin ilk girişte buluta taşınmasını sağlar.
 */
export function planPreferenceSync(remote: PreferenceBag | null, local: PreferenceBag): SyncPlan {
  if (!remote) return { applyLocal: {}, push: Object.keys(local).length ? { ...local } : null };

  const applyLocal: PreferenceBag = {};
  for (const [key, value] of Object.entries(remote)) {
    if (local[key] !== value) applyLocal[key] = value;
  }

  const push: PreferenceBag = { ...remote };
  let hasNew = false;
  for (const [key, value] of Object.entries(local)) {
    if (!(key in remote)) {
      push[key] = value;
      hasNew = true;
    }
  }
  return { applyLocal, push: hasNew ? push : null };
}

const CHANGE_EVENT = "hedefit-preference-change";

/**
 * Bir tercih değiştiğinde eşitleme katmanını uyarır.
 *
 * Modül içi dinleyiciler yalnız o modülün kancalarını tazeler; eşitleme
 * katmanı ayrı bir bileşende olduğu için pencere üzerinden haber verilir.
 */
export function notifyPreferenceChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeToPreferenceChanges(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

/**
 * Uzaktan gelen değerleri yazar ve tüm tercih kancalarını tazeler.
 *
 * Kancalar "storage" olayını dinler; bu olay yalnız DİĞER sekmelerde
 * kendiliğinden tetiklenir, bu yüzden burada elle gönderilir.
 */
export function applyPreferences(bag: PreferenceBag) {
  if (typeof window === "undefined" || !Object.keys(bag).length) return;
  for (const [key, value] of Object.entries(bag)) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // yerel depolama kapalıysa tercih yalnız bu oturumda uygulanamaz
    }
  }
  if (bag["hedefit:locale"]) document.documentElement.lang = bag["hedefit:locale"];
  window.dispatchEvent(new Event("storage"));
  window.dispatchEvent(new Event("hedefit-theme-change"));
}

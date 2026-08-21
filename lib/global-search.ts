// Başlık çubuğundaki genel arama (Stitch tasarımındaki "Search exercises,
// templates…" kutusu).
//
// Uygulamada arama YALNIZ hareket kütüphanesi ekranının içinde vardı; kullanıcı
// bir hareketi ya da kendi programını bulmak için önce doğru sekmeye gitmek
// zorundaydı. Bu modül üç kaynağı tek listede birleştirir:
//
//   • hareket katalogu (873 kayıt, önceden hesaplanmış arama dizini üzerinden)
//   • kullanıcının kendi programları
//   • uygulama ekranları ("kalori takibi" yazınca beslenme sekmesi)
//
// Modül SAF tutulur: sözlükten metin okumaz, etiketler dışarıdan verilir.
// Böylece iki dilde de test edilebilir ve i18n bağımlılığı taşımaz.

import { getExerciseByIndex, searchExerciseIndexes } from "./exercise-service.ts";
import { translateExerciseLabel } from "./exercise-translations.ts";
import type { Locale } from "@/lib/i18n/locale";
import { programExerciseNames, type CustomProgram } from "./training-programs.ts";
import type { AppView } from "./quick-actions.ts";

export type SearchResultKind = "exercise" | "program" | "view";

export type GlobalSearchResult = {
  kind: SearchResultKind;
  /** Liste anahtarı; aynı ad iki kaynakta çıkabildiği için tür öneklidir. */
  id: string;
  title: string;
  /** İkinci satır: kas grubu, hareket sayısı ya da ekranın açıklaması. */
  subtitle: string;
  /** Sonuca dokununca açılacak ekran. */
  view: AppView;
  /** Hareket sonuçlarında katalog kimliği; ekran onu doğrudan açabilir. */
  exerciseId?: string;
  /** Program sonuçlarında slot kimliği. */
  programId?: string;
};

export type ViewSearchEntry = { view: AppView; title: string; subtitle: string; keywords: string };

export const MAX_SEARCH_RESULTS = 12;

/**
 * Türkçe ve İngilizce girdiyi aynı sepete indirger.
 *
 * `toLocaleLowerCase("tr")` "I" harfini "ı" yapar; kullanıcı "Incline" yazınca
 * katalogdaki "incline" ile eşleşmesi için her iki taraf da aynı kuralla
 * küçültülmeli. Aksan ayrıştırması "göğüs" ↔ "gogus" aramasını da kurtarır.
 */
export function foldSearchText(value: string): string {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

/**
 * Sıralama puanı: tam eşleşme > baştan eşleşme > kelime başı > içerir.
 *
 * Kullanıcı "squat" yazdığında "Squat" önce, "Bulgarian Split Squat" sonra
 * gelmeli. Puan büyükse sonuç yukarıdadır.
 */
export function matchScore(haystack: string, needle: string): number {
  if (!needle) return 0;
  const text = foldSearchText(haystack);
  const query = foldSearchText(needle);
  if (!text || !query) return 0;
  if (text === query) return 100;
  if (text.startsWith(query)) return 80 - Math.min(20, text.length - query.length);
  const wordStart = text.includes(` ${query}`);
  if (wordStart) return 55;
  if (text.includes(query)) return 30;
  return 0;
}

/**
 * Genel arama.
 *
 * Katalog taraması, tuş başına yeniden dize üretmeyen hazır dizin üzerinden
 * yapılır (bkz. lib/exercise-service.ts). Sonuç sayısı sınırlıdır: panelin
 * altında kaybolan 800 satırın kimseye faydası yok.
 */
export function globalSearch(
  query: string,
  { programs = [], views = [], limit = MAX_SEARCH_RESULTS, locale = "tr" }: { programs?: CustomProgram[]; views?: ViewSearchEntry[]; limit?: number; locale?: Locale } = {},
): GlobalSearchResult[] {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const scored: Array<{ score: number; result: GlobalSearchResult }> = [];

  for (const entry of views) {
    const score = Math.max(matchScore(entry.title, trimmed), matchScore(entry.keywords, trimmed));
    // Ekranlar listenin tepesini işgal etmemeli: kullanıcı çoğunlukla içerik
    // arar. Yine de tam eşleşen bir ekran adı en üstte kalabilsin.
    if (score > 0) scored.push({ score: score + (score >= 100 ? 20 : -10), result: { kind: "view", id: `view:${entry.view}`, title: entry.title, subtitle: entry.subtitle, view: entry.view } });
  }

  for (const program of programs) {
    const names = programExerciseNames(program);
    const score = Math.max(matchScore(program.name, trimmed), ...names.map((name) => matchScore(name, trimmed) * 0.6));
    if (score > 0) {
      scored.push({
        score: score + 5,
        result: { kind: "program", id: `program:${program.id}`, title: program.name, subtitle: names.slice(0, 3).join(" · "), view: "workout", programId: program.id },
      });
    }
  }

  for (const index of searchExerciseIndexes(trimmed)) {
    const exercise = getExerciseByIndex(index);
    if (!exercise) continue;
    const score = Math.max(matchScore(exercise.name, trimmed), 20);
    scored.push({
      score,
      result: {
        kind: "exercise",
        id: `exercise:${exercise.id}`,
        title: exercise.name,
        // Kas grubu ve ekipman katalogda İngilizce saklanır; alt satır her
        // zaman uygulamanın dilinde okunmalı.
        subtitle: [exercise.primaryMuscles[0], exercise.equipment].filter(Boolean).map((value) => translateExerciseLabel(value, locale)).join(" · "),
        view: "library",
        exerciseId: exercise.id,
      },
    });
    // Katalog taraması sıralamadan bağımsız olarak erken kesilebilir: en fazla
    // sonuç sayısının birkaç katı aday yeterli, gerisi zaten listeye giremez.
    if (scored.length > limit * 6) break;
  }

  return scored
    .sort((a, b) => b.score - a.score || a.result.title.localeCompare(b.result.title, "tr"))
    .slice(0, limit)
    .map((entry) => entry.result);
}

"use client";

import type { ExerciseFilters as Filters } from "@/types/exercise";
import { translateExerciseLabel } from "@/lib/exercise-translations";
import { useTranslations } from "@/lib/i18n/translate";
import { useLocale } from "@/lib/i18n/locale";
import { ChipButton } from "@/components/design";

type FilterOptions = { muscles: string[]; equipment: string[]; levels: string[]; categories: string[] };
type FacetCounts = { muscles: Record<string, number>; equipment: Record<string, number>; levels: Record<string, number>; categories: Record<string, number> };

/**
 * Kütüphane filtreleri.
 *
 * Eskiden dört açılır listeydi. 873 hareketlik bir katalogda açılır liste
 * kötü bir gezinme aracı: seçenekler görünmez (açmadan bilinmez), kaç hareket
 * çıkacağı belli değildir ve telefonda her seçim ayrı bir sistem penceresi
 * açar. Artık her boyut, SAYISIYLA birlikte görünen rozet satırlarıdır;
 * seçili rozete yeniden basmak filtreyi kaldırır.
 */
function FacetRow({ title, values, counts, selected, onSelect }: {
  title: string;
  values: string[];
  counts: Record<string, number>;
  selected: string;
  onSelect: (value: string) => void;
}) {
  const locale = useLocale();
  if (!values.length) return null;
  return <div className="exercise-facet">
    <span className="exercise-facet-title">{title}</span>
    <div className="exercise-facet-chips">
      {values.map((value) => {
        const active = selected === value;
        return <button
          type="button"
          key={value}
          aria-pressed={active}
          className={active ? "exercise-facet-chip active" : "exercise-facet-chip"}
          // Seçiliye yeniden basmak filtreyi kaldırır: "Tümü" diye ayrı bir
          // seçenek tutmak her satıra bir tıklama hedefi daha ekliyordu.
          onClick={() => onSelect(active ? "" : value)}
        >
          {translateExerciseLabel(value, locale)}
          <b>{counts[value] ?? 0}</b>
        </button>;
      })}
    </div>
  </div>;
}

export function ExerciseFilters({ filters, options, counts, onChange, onClear }: {
  filters: Filters;
  options: FilterOptions;
  counts: FacetCounts;
  onChange: (filters: Filters) => void;
  onClear: () => void;
}) {
  const t = useTranslations();
  const update = (key: keyof Filters, value: string) => onChange({ ...filters, [key]: value });
  const hasFilter = Boolean(filters.muscle || filters.equipment || filters.level || filters.category || filters.search);

  return <section className="database-filters" aria-label={t.exerciseLibrary.filtersAriaLabel}>
    <label className="exercise-search">
      <span>{t.exerciseLibrary.search}</span>
      <input value={filters.search || ""} onChange={(event) => update("search", event.target.value)} placeholder={t.exerciseLibrary.searchPlaceholder} maxLength={100} />
    </label>

    <FacetRow title={t.exerciseLibrary.muscleGroup} values={options.muscles} counts={counts.muscles} selected={filters.muscle || ""} onSelect={(value) => update("muscle", value)} />
    <FacetRow title={t.exerciseLibrary.equipment} values={options.equipment} counts={counts.equipment} selected={filters.equipment || ""} onSelect={(value) => update("equipment", value)} />
    <FacetRow title={t.exerciseLibrary.category} values={options.categories} counts={counts.categories} selected={filters.category || ""} onSelect={(value) => update("category", value)} />
    <FacetRow title={t.exerciseLibrary.level} values={options.levels} counts={counts.levels} selected={filters.level || ""} onSelect={(value) => update("level", value)} />

    {hasFilter && <ChipButton className="clear-filters" onClick={onClear}>{t.exerciseLibrary.clearFilters}</ChipButton>}
  </section>;
}

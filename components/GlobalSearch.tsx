"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Dumbbell, LayoutGrid, ListChecks, Search, X } from "lucide-react";
import { globalSearch, type GlobalSearchResult, type ViewSearchEntry } from "@/lib/global-search";
import type { CustomProgram } from "@/lib/training-programs";
import { useTranslations } from "@/lib/i18n/translate";
import { useLocale } from "@/lib/i18n/locale";

const RESULT_ICON = { exercise: Dumbbell, program: ListChecks, view: LayoutGrid } as const;

/**
 * Genel arama (Stitch başlık çubuğundaki arama kutusu).
 *
 * Masaüstünde geniş bir arama alanı gibi görünen tetikleyici, telefonda tek
 * ikona iner; ikisi de AYNI komut paletini açar. İki ayrı arama arayüzü
 * (dar ekranda gömülü kutu, geniş ekranda panel) iki ayrı hata kaynağı olurdu.
 *
 * Sonuç listesi `useDeferredValue` ile hesaplanır: 873 kayıtlık katalog
 * taraması yazma sırasında girdiyi bloke etmez.
 */
export function GlobalSearch({
  programs,
  views,
  onSelect,
}: {
  programs: CustomProgram[];
  views: ViewSearchEntry[];
  onSelect: (result: GlobalSearchResult) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const results = useMemo(() => globalSearch(deferredQuery, { programs, views, locale }), [deferredQuery, programs, views, locale]);

  // Sorgu değişince seçili satır başa döner. Bu, efektte değil RENDER
  // sırasında yapılır: efektle yapıldığında liste bir kare boyunca yeni
  // sonuçlarla eski seçimi gösterip Enter'ı yanlış sonuca bağlıyordu.
  const [lastQuery, setLastQuery] = useState(deferredQuery);
  if (lastQuery !== deferredQuery) {
    setLastQuery(deferredQuery);
    setActiveIndex(0);
  }

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
    // Odak, paleti açan düğmeye geri döner; klavye kullanıcısı sayfanın
    // başına fırlatılmaz.
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function choose(result: GlobalSearchResult) {
    onSelect(result);
    close();
  }

  function onListKeyDown(event: React.KeyboardEvent) {
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(results[activeIndex] ?? results[0]);
    }
  }

  return (
    <>
      <button ref={triggerRef} type="button" className="hf-search-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={t.search.open}>
        <Search className="size-[18px]" aria-hidden />
        <span>{t.search.placeholder}</span>
      </button>

      {open && (
        <div className="hf-search-overlay" role="dialog" aria-modal="true" aria-label={t.search.open} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
          <div className="hf-search-panel">
            <div className="hf-search-field">
              <Search className="size-[18px]" aria-hidden />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onListKeyDown}
                placeholder={t.search.placeholder}
                aria-label={t.search.placeholder}
                aria-controls="hf-search-results"
                maxLength={80}
              />
              <button type="button" onClick={close} aria-label={t.search.close}><X className="size-[18px]" /></button>
            </div>

            <div className="hf-search-results" id="hf-search-results" role="listbox">
              {query.trim().length < 2 ? (
                <p className="hf-search-hint">{t.search.hint}</p>
              ) : results.length ? (
                results.map((result, index) => {
                  const Icon = RESULT_ICON[result.kind];
                  return (
                    <button
                      type="button"
                      key={result.id}
                      role="option"
                      aria-selected={index === activeIndex}
                      className={index === activeIndex ? "hf-search-result active" : "hf-search-result"}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => choose(result)}
                    >
                      <span className="hf-search-result-icon"><Icon className="size-[18px]" aria-hidden /></span>
                      <span className="hf-search-result-copy">
                        <strong>{result.title}</strong>
                        {result.subtitle && <small>{result.subtitle}</small>}
                      </span>
                      <span className="hf-search-result-kind">{t.search.kinds[result.kind]}</span>
                    </button>
                  );
                })
              ) : (
                <p className="hf-search-hint">{t.search.empty(query.trim())}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

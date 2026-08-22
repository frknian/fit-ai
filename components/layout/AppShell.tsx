"use client";

import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/design";

/**
 * Uygulama kabuğu (Stitch "High-Performance Kinetic" düzeni).
 *
 * Masaüstü: solda sabit gezinme sütunu, üstte buzlu cam başlık çubuğu.
 * Telefon:  sütun gizlenir, gezinme alta yapışkan sekme çubuğuna iner —
 *           Capacitor kabuğunda başparmakla ulaşılabilir tek yer orası.
 *
 * Kabuk YALNIZCA yerleşim ve gezinme sunar; hangi ekranın açık olduğu ve
 * ne yapacağı çağıran tarafta (FitAiApp) kalır. Böylece görünüm durumu,
 * Supabase çağrıları ve iş mantığı tek yerde toplu durmaya devam eder.
 */
export type ShellNavItem = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Telefonda alt sekme çubuğunda görünsün mü? Görünmeyenler başlık çubuğundadır. */
  primary?: boolean;
};

export function AppShell({
  items,
  activeId,
  onSelect,
  brand,
  profile,
  search,
  headerActions,
  cta,
  footer,
  children,
}: {
  items: ShellNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  brand: ReactNode;
  profile?: ReactNode;
  /** Başlık çubuğundaki genel arama (bkz. components/GlobalSearch.tsx). */
  search?: ReactNode;
  headerActions?: ReactNode;
  cta?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const tabs = items.filter((item) => item.primary);
  const secondary = items.filter((item) => !item.primary);

  return (
    <div className="hf-shell">
      <aside className="hf-sidenav" aria-label={typeof brand === "string" ? brand : undefined}>
        <div className="hf-sidenav-brand">{brand}</div>
        {profile && <div className="hf-sidenav-profile">{profile}</div>}
        <nav className="hf-sidenav-list">
          {items.map((item) => (
            <NavButton key={item.id} item={item} active={item.id === activeId} onSelect={onSelect} />
          ))}
        </nav>
        {cta && <div className="hf-sidenav-cta">{cta}</div>}
      </aside>

      <header className="hf-topbar">
        <div className="hf-topbar-brand">{brand}</div>
        {/* Arama, zil/dil/tema/profil ile AYNI grupta durur — hepsi eşit
            boyutlu daire, aralarında minimal boşluk. Telefonda sekme
            çubuğuna sığmayan görünümler de burada ikon olarak durur; hiçbir
            ekran erişilemez hâle gelmez. */}
        <div className="hf-topbar-actions">
          {search && <div className="hf-topbar-search">{search}</div>}
          {secondary.map((item) => (
            <IconButton
              key={item.id}
              className="hf-topbar-icon"
              aria-label={item.label}
              aria-pressed={item.id === activeId}
              onClick={() => onSelect(item.id)}
            >
              <item.icon className="size-5" />
            </IconButton>
          ))}
          {headerActions}
        </div>
      </header>

      <div className="hf-main">{children}</div>

      <nav className="hf-tabbar" aria-label={typeof brand === "string" ? brand : undefined}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn("hf-tab", item.id === activeId && "active")}
            aria-pressed={item.id === activeId}
            onClick={() => onSelect(item.id)}
          >
            <item.icon className="size-5" />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {footer}
    </div>
  );
}

function NavButton({ item, active, onSelect }: { item: ShellNavItem; active: boolean; onSelect: (id: string) => void }) {
  return (
    <button type="button" className={cn("hf-navitem", active && "active")} aria-pressed={active} onClick={() => onSelect(item.id)}>
      <item.icon className="size-5" />
      <span>{item.label}</span>
    </button>
  );
}

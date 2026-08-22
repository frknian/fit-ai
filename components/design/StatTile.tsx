import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card } from "./Card";

/**
 * Tek bir sayıyı öne çıkaran kutucuk (VKİ, haftalık gün, kalan kalori…).
 * Sayı `display` ailesinden (Montserrat) gelir: DESIGN.md, sayısal veriyi
 * uzaktan okunacak kadar iri istiyor.
 */
/**
 * Kart hiyerarşisi.
 *
 * Hepsi aynı boyuttaysa ekran "makyaj yapmış Excel tablosu" oluyor: gözün
 * nereye önce bakacağı belli olmuyor. Üç seviye var —
 *   primary   : günün ANA hedefi, tam genişlik, en büyük sayı
 *   secondary : su, kalori, uyku gibi ikincil ölçüler (varsayılan)
 *   mini      : küçük metrikler, satır içinde
 *
 * Rakamlar tasarım öğesidir: her seviyede `tabular-nums` zorunlu, yoksa sayaç
 * çalışırken rakamlar birbirinin yerine geçip zıplıyor.
 */
export type StatTileLevel = "primary" | "secondary" | "mini";

const VALUE_SIZE: Record<StatTileLevel, string> = {
  primary: "text-[44px]",
  secondary: "text-[26px]",
  mini: "text-[19px]",
};

export function StatTile({
  label,
  value,
  unit,
  hint,
  className,
  level = "secondary",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  className?: string;
  level?: StatTileLevel;
}) {
  return (
    <Card className={cn("flex flex-col gap-hf-base p-hf-md", level === "primary" && "stat-tile-primary", className)}>
      <span className="text-[11px] font-medium uppercase tracking-wider text-hf-on-surface-variant">{label}</span>
      <strong className={cn("font-hf-display leading-none font-bold text-hf-on-surface tabular-nums", VALUE_SIZE[level])}>
        {value}
        {unit && <small className="ml-1 text-[13px] font-medium text-hf-on-surface-variant">{unit}</small>}
      </strong>
      {hint && <small className="text-[11px] leading-snug text-hf-on-surface-variant">{hint}</small>}
    </Card>
  );
}

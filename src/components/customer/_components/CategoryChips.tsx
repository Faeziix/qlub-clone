"use client";

import * as React from "react";
import { localizedName, makeT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { MenuWithCategories } from "@/lib/queries";

type Category = MenuWithCategories["categories"][number];

interface CategoryChipsProps {
  categories: Category[];
  activeCat: number;
  lang: string;
  onSelect: (categoryId: string, index: number) => void;
}

export function CategoryChips({
  categories,
  activeCat,
  lang,
  onSelect,
}: CategoryChipsProps) {
  const stripRef = React.useRef<HTMLDivElement>(null);
  const t = makeT(lang);

  React.useEffect(() => {
    const strip = stripRef.current;
    const activeChip = strip?.children[activeCat] as HTMLElement | undefined;
    if (!strip || !activeChip) return;
    const stripRect = strip.getBoundingClientRect();
    const chipRect = activeChip.getBoundingClientRect();
    const chipMid = chipRect.left + chipRect.width / 2;
    const stripMid = stripRect.left + stripRect.width / 2;
    strip.scrollBy({ left: chipMid - stripMid, behavior: "smooth" });
  }, [activeCat]);

  if (categories.length === 0) return null;

  return (
    <div
      ref={stripRef}
      role="tablist"
      aria-label={t("categoryNav")}
      className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-2"
    >
      {categories.map((cat, i) => (
        <button
          key={cat.id}
          type="button"
          role="tab"
          aria-selected={i === activeCat}
          onClick={() => onSelect(cat.id, i)}
          className={cn(
            "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-fast",
            "min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2",
            i === activeCat
              ? "bg-brand text-brand-fg"
              : "bg-surface-2 text-ink hover:bg-line"
          )}
        >
          {localizedName(cat, lang)}
        </button>
      ))}
    </div>
  );
}

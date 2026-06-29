"use client";

import * as React from "react";
import Image from "next/image";
import { localizedName, localizedDescription } from "@/lib/i18n";
import { formatRialAsTomanPersian } from "@/lib/toman-formatter";
import { formatRialAsToman } from "@/lib/money";
import { DietBadge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type { ItemWithModifiers } from "@/lib/queries";

function priceLabel(rialAmount: bigint | number, locale: string): string {
  const rial =
    typeof rialAmount === "bigint" ? rialAmount : BigInt(Math.round(rialAmount));
  return locale === "fa"
    ? formatRialAsTomanPersian(rial)
    : `${formatRialAsToman(rial)} Toman`;
}

function ItemImageFallback({ name }: { name: string }) {
  const initial = name.trim().slice(0, 1).toUpperCase();
  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{
        background:
          "linear-gradient(135deg, hsl(var(--brand-soft)) 0%, hsl(var(--surface-2)) 100%)",
      }}
      aria-hidden
    >
      <span className="text-2xl font-black text-brand/30">{initial}</span>
    </div>
  );
}

interface ItemCardProps {
  item: ItemWithModifiers;
  lang: string;
  className?: string;
  onClick: () => void;
}

export function ItemCard({ item, lang, className, onClick }: ItemCardProps) {
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const name = localizedName(item, lang);
  const description = localizedDescription(item, lang);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex w-full gap-3 rounded-2xl bg-surface p-3 text-start shadow-card",
        "transition-transform duration-fast active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
        <h3 className="font-bold leading-snug">{name}</h3>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 2).map((tag) => (
              <DietBadge key={tag} tag={tag} />
            ))}
          </div>
        )}

        {description && (
          <p className="line-clamp-2 text-sm leading-snug text-muted">
            {description}
          </p>
        )}

        <p
          className="mt-auto pt-2 font-bold text-brand tabular-nums"
          data-money
        >
          {priceLabel(item.price, lang)}
        </p>
      </div>

      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt=""
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <ItemImageFallback name={name} />
        )}
      </div>
    </button>
  );
}

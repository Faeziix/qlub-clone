"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import Image from "next/image";
import { X, ChefHat } from "lucide-react";
import type { ItemWithModifiers } from "@/lib/queries";
import { makeT, localizedName, localizedDescription, type I18nMap } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatRialAsTomanPersian } from "@/lib/toman-formatter";
import { formatRialAsToman } from "@/lib/money";
import { DietBadge } from "@/components/ui/Badge";

function displayPrice(rialAmount: bigint | number, locale: string): string {
  const rial =
    typeof rialAmount === "bigint" ? rialAmount : BigInt(Math.round(rialAmount));
  return locale === "fa"
    ? formatRialAsTomanPersian(rial)
    : `${formatRialAsToman(rial)} Toman`;
}

type Group = ItemWithModifiers["modifierGroups"][number];

function ItemHero({
  imageUrl,
  name,
}: {
  imageUrl: string | null | undefined;
  name: string;
}) {
  if (imageUrl) {
    return (
      <>
        <Image
          src={imageUrl}
          alt={name}
          fill
          className="object-cover"
          unoptimized
          priority
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 40%, rgba(0,0,0,0.35) 100%)",
          }}
        />
      </>
    );
  }

  return (
    <div
      aria-hidden
      className="flex h-full w-full items-center justify-center"
      style={{
        background:
          "linear-gradient(135deg, hsl(var(--brand-soft)) 0%, hsl(var(--surface-2)) 100%)",
      }}
    >
      <ChefHat size={32} className="text-brand/20" strokeWidth={1.5} />
    </div>
  );
}

function ReadOnlyModifierGroup({
  group,
  lang,
  t,
}: {
  group: Group;
  lang: string;
  t: (key: string) => string;
}) {
  const groupName = localizedName(group as { name: string; i18n?: I18nMap }, lang);

  return (
    <div className="mt-6">
      <div className="flex items-start justify-between gap-2 px-5">
        <h3 className="font-bold leading-snug">{groupName}</h3>
        <span
          className={cn(
            "mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
            group.required
              ? "bg-brand-soft text-brand"
              : "bg-surface-2 text-muted"
          )}
        >
          {group.required ? t("required") : t("optional")}
        </span>
      </div>

      <ul className="mt-3 space-y-2 px-5">
        {group.options.map((option) => {
          const optionName = localizedName(option as { name: string; i18n?: I18nMap }, lang);
          return (
            <li
              key={option.id}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 min-h-[52px]"
            >
              <span className="flex-1 text-sm font-medium leading-snug">
                {optionName}
              </span>
              {option.priceDelta > 0 && (
                <span className="shrink-0 text-sm font-semibold text-muted tabular-nums">
                  +{displayPrice(option.priceDelta, lang)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ItemSheet({
  item,
  lang,
  open,
  onClose,
}: {
  item: ItemWithModifiers;
  lang: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = makeT(lang);

  const tags = Array.isArray(item.tags) ? (item.tags as string[]) : [];
  const name = localizedName(item, lang);
  const description = localizedDescription(item, lang);

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-overlay bg-black/50 animate-fade-in data-[state=closed]:animate-fade-out" />

        <div className="fixed inset-0 z-modal flex items-end justify-center">
          <Dialog.Content className="relative flex h-[92vh] w-full max-w-app flex-col rounded-t-3xl bg-surface shadow-sheet animate-slide-up">
            <VisuallyHidden.Root asChild>
              <Dialog.Title>{name}</Dialog.Title>
            </VisuallyHidden.Root>
            <VisuallyHidden.Root asChild>
              <Dialog.Description>{description ?? name}</Dialog.Description>
            </VisuallyHidden.Root>

            <div
              aria-hidden
              className="absolute inset-x-0 top-2.5 z-10 flex justify-center"
            >
              <div className={cn(
                "h-1.5 w-10 rounded-full",
                item.imageUrl ? "bg-white/60" : "bg-ink/20"
              )} />
            </div>

            <Dialog.Close
              aria-label={t("close")}
              className="absolute end-4 top-4 z-10 grid h-11 w-11 place-items-center rounded-full bg-surface/85 text-ink shadow-card backdrop-blur-sm transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
            >
              <X size={20} aria-hidden />
            </Dialog.Close>

            <div className="flex-1 overflow-y-auto overscroll-contain">
              <div
                className={cn(
                  "relative w-full shrink-0 bg-surface-2",
                  item.imageUrl ? "h-64" : "h-20"
                )}
              >
                <ItemHero imageUrl={item.imageUrl} name={name} />
              </div>

              <div className="px-5 pt-5 pb-6">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-2xl font-extrabold leading-heading">
                    {name}
                  </h2>
                  <span className="shrink-0 pt-1 text-lg font-bold text-brand tabular-nums">
                    {displayPrice(item.price, lang)}
                  </span>
                </div>

                {tags.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <DietBadge key={tag} tag={tag} />
                    ))}
                  </div>
                )}

                {description && (
                  <p className="mt-3 text-[15px] leading-persian text-muted">
                    {description}
                  </p>
                )}

                {item.calories != null && (
                  <p className="mt-2 text-sm text-muted">
                    {item.calories} {t("kcal")}
                  </p>
                )}
              </div>

              {item.modifierGroups.length > 0 && (
                <div className="border-t border-line pt-4 pb-8">
                  {item.modifierGroups.map((group) => (
                    <ReadOnlyModifierGroup
                      key={group.id}
                      group={group}
                      lang={lang}
                      t={t}
                    />
                  ))}
                </div>
              )}
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

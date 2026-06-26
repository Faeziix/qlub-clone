"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import Image from "next/image";
import { X, Check, ChefHat } from "lucide-react";
import { cva } from "class-variance-authority";
import type { ItemWithModifiers } from "@/lib/queries";
import type { SelectedModifier } from "@/lib/types";
import { useCart } from "@/lib/store/cart";
import { makeT, localizedName, localizedDescription, type I18nMap } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatRialAsTomanPersian, latinDigitsToPersian } from "@/lib/toman-formatter";
import { formatRialAsToman } from "@/lib/money";
import { Button } from "@/components/ui/Button";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { DietBadge } from "@/components/ui/Badge";

const INSTRUCTIONS_MAX = 160;

function displayPrice(rialAmount: bigint | number, locale: string): string {
  const rial =
    typeof rialAmount === "bigint" ? rialAmount : BigInt(Math.round(rialAmount));
  return locale === "fa"
    ? formatRialAsTomanPersian(rial)
    : `${formatRialAsToman(rial)} Toman`;
}

type Group = ItemWithModifiers["modifierGroups"][number];

const modifierOptionVariants = cva(
  "flex w-full items-center gap-3 rounded-2xl border px-4 text-start transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand",
  {
    variants: {
      checked: {
        true: "border-brand bg-brand-soft",
        false: "border-line bg-surface hover:bg-surface-2",
      },
    },
    defaultVariants: { checked: false },
  }
);

function ModifierIndicator({
  checked,
  single,
}: {
  checked: boolean;
  single: boolean;
}) {
  return (
    <span
      className={cn(
        "grid h-5 w-5 shrink-0 place-items-center border-2 transition-colors",
        single ? "rounded-full" : "rounded-md",
        checked
          ? "border-brand bg-brand text-brand-fg"
          : "border-muted/50 bg-surface"
      )}
    >
      {checked && <Check size={12} strokeWidth={3} aria-hidden />}
    </span>
  );
}

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
      <ChefHat size={48} className="text-brand/25" strokeWidth={1.5} />
    </div>
  );
}

function ModifierGroupSection({
  group,
  selected,
  onToggle,
  t,
  lang,
}: {
  group: Group;
  selected: string[];
  onToggle: (group: Group, optionId: string) => void;
  t: (key: string) => string;
  lang: string;
}) {
  const single = group.maxSelect <= 1;
  const groupName = localizedName(group as { name: string; i18n?: I18nMap }, lang);

  function modifierHint(): string {
    if (single) return t("chooseOne");
    const count =
      lang === "fa"
        ? latinDigitsToPersian(String(group.maxSelect))
        : String(group.maxSelect);
    if (group.minSelect > 0 && group.minSelect === group.maxSelect) {
      return t("chooseExactly").replace("{count}", count);
    }
    return t("chooseUpTo").replace("{count}", count);
  }

  return (
    <div className="mt-6">
      <div className="flex items-start justify-between gap-2 px-5">
        <div>
          <h3 className="font-bold leading-snug">{groupName}</h3>
          <p className="mt-0.5 text-sm text-muted">{modifierHint()}</p>
        </div>
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

      <div className="mt-3 space-y-2 px-5">
        {group.options.map((option) => {
          const checked = selected.includes(option.id);
          const optionName = localizedName(option as { name: string; i18n?: I18nMap }, lang);
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onToggle(group, option.id)}
              className={cn(
                modifierOptionVariants({ checked }),
                "min-h-[52px] py-3"
              )}
            >
              <ModifierIndicator checked={checked} single={single} />
              <span className="flex-1 text-sm font-medium leading-snug">
                {optionName}
              </span>
              {option.priceDelta > 0 && (
                <span className="shrink-0 text-sm font-semibold text-muted tabular-nums">
                  +{displayPrice(option.priceDelta, lang)}
                </span>
              )}
            </button>
          );
        })}
      </div>
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
  const addLine = useCart((s) => s.addLine);
  const [qty, setQty] = React.useState(1);
  const [notes, setNotes] = React.useState("");

  const tags = Array.isArray(item.tags) ? (item.tags as string[]) : [];
  const name = localizedName(item, lang);
  const description = localizedDescription(item, lang);

  const [selected, setSelected] = React.useState<Record<string, string[]>>(
    () => {
      const init: Record<string, string[]> = {};
      for (const group of item.modifierGroups) {
        const defaults = group.options
          .filter((o) => o.isDefault)
          .map((o) => o.id);
        init[group.id] = defaults;
      }
      return init;
    }
  );

  function toggle(group: Group, optionId: string) {
    setSelected((prev) => {
      const cur = prev[group.id] ?? [];
      if (group.maxSelect <= 1) {
        return { ...prev, [group.id]: [optionId] };
      }
      if (cur.includes(optionId)) {
        return { ...prev, [group.id]: cur.filter((x) => x !== optionId) };
      }
      if (cur.length >= group.maxSelect) return prev;
      return { ...prev, [group.id]: [...cur, optionId] };
    });
  }

  const chosenModifiers: SelectedModifier[] = item.modifierGroups.flatMap(
    (group) =>
      (selected[group.id] ?? []).map((optId) => {
        const opt = group.options.find((o) => o.id === optId)!;
        return {
          groupId: group.id,
          groupName: localizedName(group as { name: string; i18n?: I18nMap }, lang),
          optionId: opt.id,
          optionName: localizedName(opt as { name: string; i18n?: I18nMap }, lang),
          priceDelta: BigInt(opt.priceDelta),
        };
      })
  );

  const unitPriceRial = BigInt(item.price);
  const unitWithMods =
    unitPriceRial +
    chosenModifiers.reduce((sum, mod) => sum + mod.priceDelta, 0n);
  const lineTotal = unitWithMods * BigInt(qty);

  const missingRequired = item.modifierGroups.some(
    (g) =>
      g.required && (selected[g.id]?.length ?? 0) < Math.max(1, g.minSelect)
  );

  const charsLeft = INSTRUCTIONS_MAX - notes.length;

  function handleAdd() {
    addLine({
      itemId: item.id,
      name,
      imageUrl: item.imageUrl,
      unitPrice: unitPriceRial,
      quantity: qty,
      modifiers: chosenModifiers,
      notes: notes.trim() || undefined,
    });
    onClose();
  }

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/50 animate-fade-in data-[state=closed]:animate-fade-out" />

        <div className="fixed inset-0 z-[300] flex items-end justify-center">
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
              <div className="relative h-64 w-full shrink-0 bg-surface-2">
                <ItemHero imageUrl={item.imageUrl} name={name} />
              </div>

              <div className="px-5 pt-5 pb-2">
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
                    {lang === "fa"
                      ? latinDigitsToPersian(String(item.calories))
                      : item.calories}{" "}
                    {t("kcal")}
                  </p>
                )}
              </div>

              {item.modifierGroups.length > 0 && (
                <div className="border-t border-line pt-4">
                  {item.modifierGroups.map((group) => (
                    <ModifierGroupSection
                      key={group.id}
                      group={group}
                      selected={selected[group.id] ?? []}
                      onToggle={toggle}
                      t={t}
                      lang={lang}
                    />
                  ))}
                </div>
              )}

              <div className="mt-6 px-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">{t("special")}</h3>
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      charsLeft < 20 ? "text-warning" : "text-muted"
                    )}
                  >
                    {lang === "fa" ? latinDigitsToPersian(String(charsLeft)) : charsLeft}
                  </span>
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.slice(0, INSTRUCTIONS_MAX))}
                  rows={3}
                  placeholder={t("specialPlaceholder")}
                  className="mt-2 w-full resize-none rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm leading-persian outline-none transition-colors focus:border-brand focus:bg-surface"
                />
              </div>

              <div className="h-36" aria-hidden />
            </div>

            <div className="shrink-0 border-t border-line bg-surface/95 px-4 pt-3 pb-4 backdrop-blur-sm safe-bottom">
              <div className="flex items-center gap-3">
                <QuantityStepper
                  value={qty}
                  onChange={setQty}
                  min={1}
                  size="lg"
                  decreaseLabel={t("decreaseQty")}
                  increaseLabel={t("increaseQty")}
                  displayValue={lang === "fa" ? latinDigitsToPersian(String(qty)) : undefined}
                />
                <Button
                  fullWidth
                  size="lg"
                  disabled={missingRequired}
                  onClick={handleAdd}
                  className="justify-between"
                >
                  <span>{t("addToOrder")}</span>
                  <span className="tabular-nums opacity-90">
                    {displayPrice(lineTotal, lang)}
                  </span>
                </Button>
              </div>
              {missingRequired && (
                <p className="mt-2 text-center text-xs text-danger">
                  {t("completeRequired")}
                </p>
              )}
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

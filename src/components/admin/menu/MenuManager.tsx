"use client";

import * as React from "react";
import Image from "next/image";
import {
  Pencil,
  Trash2,
  Plus,
  ImageOff,
  Check,
  X,
  Loader2,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { DietBadge } from "@/components/ui/Badge";
import { EmptyRow } from "@/components/admin/ui";
import { cn, formatMoney } from "@/lib/utils";
import { formatRialAsToman } from "@/lib/money";
import {
  toggleItemAvailability,
  updateItemPrice,
  updateItem,
  createItem,
  deleteItem,
} from "@/app/[locale]/admin/menu/actions";

/* ---------- Serializable types shared with the server page ---------- */

export interface MenuItemTranslationNode {
  locale: string;
  name: string;
  description: string | null;
}

export interface MenuItemNode {
  id: string;
  name: string;
  description: string;
  priceRialStr: string;
  imageUrl: string | null;
  available: boolean;
  calories: number | null;
  tags: string[];
  modifierGroupCount: number;
  modifierOptionCount: number;
  translations: MenuItemTranslationNode[];
}

export interface CategoryNode {
  id: string;
  name: string;
  items: MenuItemNode[];
}

export interface MenuTree {
  id: string;
  name: string;
  active: boolean;
  availability: string | null;
  categories: CategoryNode[];
}

interface MenuManagerProps {
  menus: MenuTree[];
  vendorId: string;
}

export function MenuManager({ menus, vendorId }: MenuManagerProps) {
  const t = useTranslations("admin.menu");
  const [activeMenuId, setActiveMenuId] = React.useState<string>(
    menus[0]?.id ?? ""
  );
  const activeMenu =
    menus.find((m) => m.id === activeMenuId) ?? menus[0] ?? null;

  const [editItem, setEditItem] = React.useState<MenuItemNode | null>(null);
  const [createForCategory, setCreateForCategory] =
    React.useState<CategoryNode | null>(null);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-2xl border border-line bg-surface p-2 shadow-card">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {t("menus")}
          </p>
          <ul className="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {menus.map((m) => {
              const itemCount = m.categories.reduce(
                (s, c) => s + c.items.length,
                0
              );
              const isActive = m.id === activeMenu?.id;
              return (
                <li key={m.id} className="shrink-0 lg:shrink">
                  <button
                    onClick={() => setActiveMenuId(m.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-start text-sm font-semibold transition-colors",
                      isActive
                        ? "bg-brand text-brand-fg"
                        : "text-ink hover:bg-surface-2"
                    )}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span className="truncate">{m.name}</span>
                      {!m.active && (
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                            isActive
                              ? "bg-brand-fg/20 text-brand-fg"
                              : "bg-surface-2 text-muted"
                          )}
                        >
                          {t("inactive")}
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
                        isActive
                          ? "bg-brand-fg/20 text-brand-fg"
                          : "bg-surface-2 text-muted"
                      )}
                    >
                      {itemCount}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      <div className="min-w-0 space-y-6">
        {!activeMenu || activeMenu.categories.length === 0 ? (
          <EmptyRow>{t("noItems")}</EmptyRow>
        ) : (
          activeMenu.categories.map((category) => (
            <section
              key={category.id}
              className="rounded-2xl border border-line bg-surface shadow-card"
            >
              <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold">{category.name}</h3>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold tabular-nums text-muted">
                    {category.items.length}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCreateForCategory(category)}
                >
                  <Plus size={16} />
                  {t("addItem")}
                </Button>
              </header>

              {category.items.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted">
                  {t("noItems")}
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {category.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      onEdit={() => setEditItem(item)}
                    />
                  ))}
                </ul>
              )}
            </section>
          ))
        )}
      </div>

      <EditItemSheet item={editItem} onClose={() => setEditItem(null)} />

      <CreateItemSheet
        category={createForCategory}
        vendorId={vendorId}
        onClose={() => setCreateForCategory(null)}
      />
    </div>
  );
}

/* ---------------------------------- Item row ---------------------------------- */

function ItemRow({
  item,
  onEdit,
}: {
  item: MenuItemNode;
  onEdit: () => void;
}) {
  const t = useTranslations("admin.menu");
  const [isPending, startTransition] = React.useTransition();
  const tags = item.tags;

  const [editingPrice, setEditingPrice] = React.useState(false);
  const currentToman = formatRialAsToman(BigInt(item.priceRialStr));
  const [priceDraft, setPriceDraft] = React.useState(currentToman);

  React.useEffect(() => {
    setPriceDraft(formatRialAsToman(BigInt(item.priceRialStr)));
  }, [item.priceRialStr]);

  const [confirmDelete, setConfirmDelete] = React.useState(false);

  function commitPrice() {
    const n = Number(priceDraft.trim());
    if (!Number.isFinite(n) || n < 0) {
      setPriceDraft(formatRialAsToman(BigInt(item.priceRialStr)));
      setEditingPrice(false);
      return;
    }
    setEditingPrice(false);
    if (priceDraft.trim() === formatRialAsToman(BigInt(item.priceRialStr))) return;
    startTransition(async () => {
      await updateItemPrice(item.id, priceDraft.trim());
    });
  }

  function onToggle() {
    startTransition(async () => {
      await toggleItemAvailability(item.id, !item.available);
    });
  }

  function onConfirmDelete() {
    startTransition(async () => {
      await deleteItem(item.id);
    });
  }

  return (
    <li
      className={cn(
        "flex items-center gap-4 px-5 py-3 transition-opacity",
        !item.available && "opacity-60",
        isPending && "pointer-events-none opacity-50"
      )}
    >
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-2">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.name}
            fill
            unoptimized
            sizes="56px"
            className="object-cover"
          />
        ) : (
          <span className="grid h-full w-full place-items-center text-muted">
            <ImageOff size={18} />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold">{item.name}</p>
          {tags.map((tag) => (
            <DietBadge key={tag} tag={tag} />
          ))}
        </div>
        {item.description && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted">
            {item.description}
          </p>
        )}
        {(item.modifierGroupCount > 0 || item.calories != null) && (
          <div className="mt-1 flex items-center gap-3 text-[11px] text-muted">
            {item.modifierGroupCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <SlidersHorizontal size={12} />
                {item.modifierGroupCount} {t("modifierGroups")} ·{" "}
                {item.modifierOptionCount} {t("options")}
              </span>
            )}
            {item.calories != null && <span>{item.calories} {"kcal"}</span>}
          </div>
        )}
      </div>

      <div className="w-28 shrink-0 text-end">
        {editingPrice ? (
          <div className="flex items-center justify-end gap-1">
            <input
              autoFocus
              type="number"
              min={0}
              step="1"
              value={priceDraft}
              onChange={(e) => setPriceDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitPrice();
                if (e.key === "Escape") {
                  setPriceDraft(currentToman);
                  setEditingPrice(false);
                }
              }}
              onBlur={commitPrice}
              className="w-20 rounded-lg border border-line bg-surface px-2 py-1 text-end text-sm font-semibold tabular-nums outline-none focus:border-brand"
            />
          </div>
        ) : (
          <button
            onClick={() => setEditingPrice(true)}
            className="rounded-lg px-2 py-1 text-sm font-bold tabular-nums hover:bg-surface-2"
            title={t("price")}
          >
            {formatMoney(BigInt(item.priceRialStr))}
          </button>
        )}
      </div>

      <Toggle
        checked={item.available}
        onChange={onToggle}
        label={item.available ? t("available") : t("inactive")}
      />

      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={onEdit}
          className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
          title={t("editItem")}
        >
          <Pencil size={16} />
        </button>
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button
              onClick={onConfirmDelete}
              className="grid h-9 w-9 place-items-center rounded-lg bg-danger/10 text-danger hover:bg-danger/20"
              title={t("confirmDelete")}
            >
              {isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Check size={16} />
              )}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
              title={t("cancel")}
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger"
            title={t("deleteItem")}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </li>
  );
}

/* ---------------------------------- Toggle ---------------------------------- */

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        checked ? "bg-success" : "bg-line"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

/* ------------------------------- Edit item sheet ------------------------------- */

function EditItemSheet({
  item,
  onClose,
}: {
  item: MenuItemNode | null;
  onClose: () => void;
}) {
  const t = useTranslations("admin.menu");
  const [isPending, startTransition] = React.useTransition();
  const [nameFa, setNameFa] = React.useState("");
  const [nameEn, setNameEn] = React.useState("");
  const [descFa, setDescFa] = React.useState("");
  const [descEn, setDescEn] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [available, setAvailable] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (item) {
      const faT = item.translations.find((tx) => tx.locale === "fa");
      const enT = item.translations.find((tx) => tx.locale === "en");
      setNameFa(faT?.name ?? item.name);
      setNameEn(enT?.name ?? "");
      setDescFa(faT?.description ?? item.description);
      setDescEn(enT?.description ?? "");
      setPrice(formatRialAsToman(BigInt(item.priceRialStr)));
      setAvailable(item.available);
      setError(null);
    }
  }, [item]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    const primaryName = nameFa.trim() || nameEn.trim();
    if (!primaryName) {
      setError(t("name") + " " + t("namePlaceholder"));
      return;
    }
    setError(null);
    startTransition(async () => {
      await updateItem(item.id, {
        name: primaryName,
        description: descFa.trim(),
        tomanInput: price.trim(),
        available,
        translations: [
          { locale: "fa", name: nameFa.trim(), description: descFa.trim() },
          { locale: "en", name: nameEn.trim(), description: descEn.trim() },
        ],
      });
      onClose();
    });
  }

  return (
    <Sheet open={!!item} onClose={onClose} title={t("editItem")} height="tall">
      <form onSubmit={onSubmit} className="space-y-4 px-5 pb-6 pt-2">
        <Field label={t("nameFa")}>
          <input
            value={nameFa}
            onChange={(e) => setNameFa(e.target.value)}
            className={inputClass}
            placeholder={t("nameFaPlaceholder")}
            dir="rtl"
          />
        </Field>
        <Field label={t("nameEn")}>
          <input
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            className={inputClass}
            placeholder={t("nameEnPlaceholder")}
            dir="ltr"
          />
        </Field>
        <Field label={t("descriptionFa")}>
          <textarea
            value={descFa}
            onChange={(e) => setDescFa(e.target.value)}
            rows={2}
            className={cn(inputClass, "resize-none")}
            placeholder={t("descriptionFaPlaceholder")}
            dir="rtl"
          />
        </Field>
        <Field label={t("descriptionEn")}>
          <textarea
            value={descEn}
            onChange={(e) => setDescEn(e.target.value)}
            rows={2}
            className={cn(inputClass, "resize-none")}
            placeholder={t("descriptionEnPlaceholder")}
            dir="ltr"
          />
        </Field>
        <Field label={t("price")}>
          <input
            type="number"
            min={0}
            step="1"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={cn(inputClass, "tabular-nums")}
          />
        </Field>
        <div className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
          <div>
            <p className="text-sm font-semibold">{t("available")}</p>
            <p className="text-xs text-muted">{t("availableHint")}</p>
          </div>
          <Toggle
            checked={available}
            onChange={() => setAvailable((v) => !v)}
            label={t("available")}
          />
        </div>

        {error && <p className="text-sm font-medium text-danger">{error}</p>}

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            fullWidth
            onClick={onClose}
            disabled={isPending}
          >
            {t("cancel")}
          </Button>
          <Button type="submit" fullWidth loading={isPending}>
            {t("saveChanges")}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

/* ------------------------------ Create item sheet ------------------------------ */

function CreateItemSheet({
  category,
  vendorId,
  onClose,
}: {
  category: CategoryNode | null;
  vendorId: string;
  onClose: () => void;
}) {
  const t = useTranslations("admin.menu");
  const [isPending, startTransition] = React.useTransition();
  const [nameFa, setNameFa] = React.useState("");
  const [nameEn, setNameEn] = React.useState("");
  const [descFa, setDescFa] = React.useState("");
  const [descEn, setDescEn] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (category) {
      setNameFa("");
      setNameEn("");
      setDescFa("");
      setDescEn("");
      setPrice("");
      setError(null);
    }
  }, [category]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) return;
    const primaryName = nameFa.trim() || nameEn.trim();
    if (!primaryName) {
      setError(t("namePlaceholder"));
      return;
    }
    setError(null);
    startTransition(async () => {
      await createItem(category.id, vendorId, {
        name: primaryName,
        description: descFa.trim(),
        tomanInput: price.trim(),
        translations: [
          { locale: "fa", name: nameFa.trim(), description: descFa.trim() },
          { locale: "en", name: nameEn.trim(), description: descEn.trim() },
        ],
      });
      onClose();
    });
  }

  return (
    <Sheet
      open={!!category}
      onClose={onClose}
      title={category ? t("addToCategory", { category: category.name }) : t("addItem")}
      height="tall"
    >
      <form onSubmit={onSubmit} className="space-y-4 px-5 pb-6 pt-2">
        <Field label={t("nameFa")}>
          <input
            autoFocus
            value={nameFa}
            onChange={(e) => setNameFa(e.target.value)}
            className={inputClass}
            placeholder={t("nameFaPlaceholder")}
            dir="rtl"
          />
        </Field>
        <Field label={t("nameEn")}>
          <input
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            className={inputClass}
            placeholder={t("nameEnPlaceholder")}
            dir="ltr"
          />
        </Field>
        <Field label={t("descriptionFa")}>
          <textarea
            value={descFa}
            onChange={(e) => setDescFa(e.target.value)}
            rows={2}
            className={cn(inputClass, "resize-none")}
            placeholder={t("descriptionFaPlaceholder")}
            dir="rtl"
          />
        </Field>
        <Field label={t("descriptionEn")}>
          <textarea
            value={descEn}
            onChange={(e) => setDescEn(e.target.value)}
            rows={2}
            className={cn(inputClass, "resize-none")}
            placeholder={t("descriptionEnPlaceholder")}
            dir="ltr"
          />
        </Field>
        <Field label={t("price")}>
          <input
            type="number"
            min={0}
            step="1"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={cn(inputClass, "tabular-nums")}
            placeholder={t("pricePlaceholder")}
          />
        </Field>

        {error && <p className="text-sm font-medium text-danger">{error}</p>}

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            fullWidth
            onClick={onClose}
            disabled={isPending}
          >
            {t("cancel")}
          </Button>
          <Button type="submit" fullWidth loading={isPending}>
            {t("create")}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

/* --------------------------------- Form bits --------------------------------- */

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-brand";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

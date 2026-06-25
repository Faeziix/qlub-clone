"use client";

import * as React from "react";
import Image from "next/image";
import { Search, Globe, ChevronLeft, ShoppingBag } from "lucide-react";
import type { VendorWithMenus, ItemWithModifiers } from "@/lib/queries";
import { useCart } from "@/lib/store/cart";
import { makeT, dirFor } from "@/lib/i18n";
import { cn, formatAmount } from "@/lib/utils";
import { DietBadge } from "@/components/ui/Badge";
import { ItemSheet } from "./ItemSheet";
import { CartSheet } from "./CartSheet";
import { LanguageSheet } from "./LanguageSheet";

export function MenuExperience({
  vendor,
  initialLang,
  tableCode,
}: {
  vendor: VendorWithMenus;
  initialLang: string;
  tableCode: string | null;
}) {
  const [lang, setLang] = React.useState(initialLang);
  const t = makeT(lang);
  const dir = dirFor(lang);

  const menus = vendor.menus;
  const [activeMenu, setActiveMenu] = React.useState(0);
  const [entered, setEntered] = React.useState(false); // landing -> menu
  const [query, setQuery] = React.useState("");
  const [activeItem, setActiveItem] = React.useState<ItemWithModifiers | null>(
    null
  );
  const [cartOpen, setCartOpen] = React.useState(false);
  const [langOpen, setLangOpen] = React.useState(false);
  const [activeCat, setActiveCat] = React.useState(0);

  const cart = useCart();
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => {
    cart.init(vendor.slug, tableCode);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const count = hydrated ? cart.count() : 0;
  const subtotal = hydrated ? cart.subtotal() : 0;

  const menu = menus[activeMenu];
  const categories = menu?.categories ?? [];

  const filtered = React.useMemo(() => {
    if (!query.trim()) return categories;
    const q = query.toLowerCase();
    return categories
      .map((c) => ({
        ...c,
        items: c.items.filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            i.description?.toLowerCase().includes(q)
        ),
      }))
      .filter((c) => c.items.length > 0);
  }, [categories, query]);

  // ── Landing screen: hero + menu picker (qlub "Select a menu") ──
  if (!entered) {
    return (
      <div dir={dir} className="min-h-screen bg-bg">
        <div className="mx-auto max-w-app">
          <div className="relative">
            <div className="relative h-60 w-full overflow-hidden">
              {vendor.coverUrl && (
                <Image
                  src={vendor.coverUrl}
                  alt={vendor.name}
                  fill
                  className="object-cover"
                  priority
                  unoptimized
                />
              )}
              <button
                onClick={() => setLangOpen(true)}
                className="absolute start-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-surface/90 px-3 py-1.5 text-sm font-semibold shadow-card backdrop-blur"
              >
                <Globe size={16} /> {lang.toUpperCase()}
              </button>
            </div>
            <div className="relative -mt-12 rounded-t-3xl bg-surface px-5 pb-6 pt-14 text-center shadow-float">
              {vendor.logoUrl && (
                <div className="absolute inset-x-0 -top-12 mx-auto h-24 w-24 overflow-hidden rounded-2xl border-4 border-surface bg-surface shadow-card">
                  <Image
                    src={vendor.logoUrl}
                    alt=""
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
              )}
              <h1 className="text-2xl font-extrabold">{vendor.name}</h1>
              {vendor.description && (
                <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
                  {vendor.description}
                </p>
              )}
            </div>
          </div>

          <div className="px-5 pt-4">
            <p className="mb-3 text-sm font-semibold text-muted">
              {t("selectMenu")}
            </p>
            <div className="grid grid-cols-2 gap-4">
              {menus.map((m, i) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setActiveMenu(i);
                    setActiveCat(0);
                    setEntered(true);
                  }}
                  className="group overflow-hidden rounded-2xl bg-surface text-start shadow-card transition-transform active:scale-95"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-2">
                    {m.imageUrl && (
                      <Image
                        src={m.imageUrl}
                        alt={m.name}
                        fill
                        className="object-cover transition-transform group-hover:scale-105"
                        unoptimized
                      />
                    )}
                  </div>
                  <div className="px-3 py-3 text-sm font-bold uppercase tracking-wide">
                    {m.name}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <Footer t={t} />
        </div>

        <LanguageSheet
          open={langOpen}
          onClose={() => setLangOpen(false)}
          value={lang}
          supported={vendor.supportedLangs}
          onChange={(l) => {
            setLang(l);
            setLangOpen(false);
          }}
          title={t("changeLanguage")}
        />
      </div>
    );
  }

  // ── Menu browsing screen ──
  return (
    <div dir={dir} className="min-h-screen bg-bg pb-28">
      <div className="mx-auto max-w-app">
        {/* Sticky header */}
        <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur border-b border-line">
          <div className="flex items-center gap-2 px-4 py-3">
            <button
              onClick={() => setEntered(false)}
              className="grid h-9 w-9 place-items-center rounded-full bg-surface-2"
              aria-label="Back"
            >
              <ChevronLeft size={20} />
            </button>
            <h1 className="flex-1 truncate text-lg font-bold">{vendor.name}</h1>
            <button
              onClick={() => setLangOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-full bg-surface-2"
              aria-label="Language"
            >
              <Globe size={18} />
            </button>
          </div>

          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3">
              <Search size={18} className="text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`${t("search")} "${menu.name}"`}
                className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted"
              />
            </div>
          </div>

          {/* Menu tabs */}
          <div className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-1">
            {menus.map((m, i) => (
              <button
                key={m.id}
                onClick={() => {
                  setActiveMenu(i);
                  setActiveCat(0);
                  setQuery("");
                }}
                className={cn(
                  "shrink-0 border-b-2 px-3 pb-2 pt-1 text-sm font-bold uppercase tracking-wide transition-colors",
                  i === activeMenu
                    ? "border-brand text-brand"
                    : "border-transparent text-muted"
                )}
              >
                {m.name}
              </button>
            ))}
          </div>

          {/* Category chips */}
          {!query && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
              {categories.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setActiveCat(i);
                    document
                      .getElementById(`cat-${c.id}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className={cn(
                    "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                    i === activeCat
                      ? "bg-brand text-brand-fg"
                      : "bg-surface-2 text-ink"
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </header>

        {/* Item list grouped by category */}
        <main className="px-4">
          {filtered.map((cat) => (
            <section key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-44 pt-5">
              <h2 className="mb-3 text-xl font-extrabold">{cat.name}</h2>
              <div className="space-y-3">
                {cat.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    currency={vendor.currency}
                    onClick={() => setActiveItem(item)}
                  />
                ))}
              </div>
            </section>
          ))}
          {filtered.length === 0 && (
            <p className="py-16 text-center text-muted">
              No items match “{query}”.
            </p>
          )}
          <Footer t={t} />
        </main>
      </div>

      {/* Floating cart bar */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 safe-bottom">
          <div className="mx-auto max-w-app px-4 pb-4">
            <button
              onClick={() => setCartOpen(true)}
              className="flex w-full items-center justify-between rounded-2xl bg-brand px-5 py-4 text-brand-fg shadow-float animate-slide-up"
            >
              <span className="flex items-center gap-2 font-bold">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-fg/20 text-sm">
                  {count}
                </span>
                {t("viewOrder")}
              </span>
              <span className="flex items-center gap-2 font-bold">
                {vendor.currency} {formatAmount(subtotal)}
                <ShoppingBag size={18} />
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Sheets */}
      {activeItem && (
        <ItemSheet
          item={activeItem}
          currency={vendor.currency}
          lang={lang}
          open={!!activeItem}
          onClose={() => setActiveItem(null)}
        />
      )}
      <CartSheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        vendor={vendor}
        lang={lang}
        tableCode={tableCode}
      />
      <LanguageSheet
        open={langOpen}
        onClose={() => setLangOpen(false)}
        value={lang}
        supported={vendor.supportedLangs}
        onChange={(l) => {
          setLang(l);
          setLangOpen(false);
        }}
        title={t("changeLanguage")}
      />
    </div>
  );
}

function ItemRow({
  item,
  currency,
  onClick,
}: {
  item: ItemWithModifiers;
  currency: string;
  onClick: () => void;
}) {
  const tags = Array.isArray(item.tags) ? item.tags : [];
  return (
    <button
      onClick={onClick}
      className="flex w-full gap-3 rounded-2xl bg-surface p-3 text-start shadow-card transition-transform active:scale-[0.98]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="font-bold">{item.name}</h3>
          {tags.slice(0, 2).map((tag) => (
            <DietBadge key={tag} tag={tag} />
          ))}
        </div>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-sm text-muted">
            {item.description}
          </p>
        )}
        <p className="mt-2 font-bold text-brand">
          {currency} {formatAmount(item.price)}
        </p>
      </div>
      {item.imageUrl && (
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-surface-2">
          <Image
            src={item.imageUrl}
            alt={item.name}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
      )}
    </button>
  );
}

function Footer({ t }: { t: (k: string) => string }) {
  return (
    <footer className="py-8 text-center">
      <p className="text-2xl font-black tracking-tight text-muted/40">qlub_</p>
      <p className="mt-1 text-xs text-muted">
        {t("termsPrefix")}{" "}
        <span className="underline">{t("terms")}</span>
      </p>
    </footer>
  );
}

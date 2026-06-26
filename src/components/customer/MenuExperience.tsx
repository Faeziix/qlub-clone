"use client";

import * as React from "react";
import Image from "next/image";
import { Search, Globe, ChevronLeft, ShoppingBag, UtensilsCrossed, CreditCard, ArrowLeft } from "lucide-react";
import type { VendorWithMenus, ItemWithModifiers } from "@/lib/queries";
import { useCart } from "@/lib/store/cart";
import { makeT, dirFor, localizedName, localizedDescription } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatRialAsTomanPersian } from "@/lib/toman-formatter";
import { formatRialAsToman } from "@/lib/money";
import { DietBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { ItemSheet } from "./ItemSheet";
import { CartSheet } from "./CartSheet";
import { LanguageSheet } from "./LanguageSheet";
import { PayBillSheet } from "./PayBillSheet";

function displayPrice(rialAmount: bigint | number, locale: string): string {
  const rial =
    typeof rialAmount === "bigint" ? rialAmount : BigInt(Math.round(rialAmount));
  return locale === "fa"
    ? formatRialAsTomanPersian(rial)
    : `${formatRialAsToman(rial)} Toman`;
}

type LandingView = "main" | "menuPicker";

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
  const [entered, setEntered] = React.useState(false);
  const [landingView, setLandingView] = React.useState<LandingView>("main");
  const [query, setQuery] = React.useState("");
  const [activeItem, setActiveItem] = React.useState<ItemWithModifiers | null>(null);
  const [cartOpen, setCartOpen] = React.useState(false);
  const [langOpen, setLangOpen] = React.useState(false);
  const [payBillOpen, setPayBillOpen] = React.useState(false);
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
  const categories = React.useMemo(
    () => menu?.categories ?? [],
    [menu]
  );

  const filtered = React.useMemo(() => {
    if (!query.trim()) return categories;
    const q = query.toLowerCase();
    return categories
      .map((c) => ({
        ...c,
        items: c.items.filter(
          (i) =>
            localizedName(i, lang).toLowerCase().includes(q) ||
            localizedDescription(i, lang)?.toLowerCase().includes(q)
        ),
      }))
      .filter((c) => c.items.length > 0);
  }, [categories, query, lang]);

  function handleViewMenu() {
    if (menus.length === 0) return;
    if (menus.length === 1) {
      setActiveMenu(0);
      setActiveCat(0);
      setEntered(true);
    } else {
      setLandingView("menuPicker");
    }
  }

  function handleSelectMenu(index: number) {
    setActiveMenu(index);
    setActiveCat(0);
    setEntered(true);
    setLandingView("main");
  }

  // ── Landing screen ──
  if (!entered) {
    return (
      <div dir={dir} className="min-h-screen bg-bg md:bg-surface-2">
        <div className="mx-auto max-w-app min-h-screen bg-bg md:shadow-float">
          <VenueHero
            vendor={vendor}
            lang={lang}
            onLanguageOpen={() => setLangOpen(true)}
          />

          {landingView === "main" ? (
            <MainEntryPoints
              t={t}
              menus={menus}
              onViewMenu={handleViewMenu}
              onPayBill={() => setPayBillOpen(true)}
            />
          ) : (
            <MenuPickerPanel
              t={t}
              menus={menus}
              lang={lang}
              dir={dir}
              onSelect={handleSelectMenu}
              onBack={() => setLandingView("main")}
            />
          )}

          <LandingFooter t={t} />
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

        <PayBillSheet
          open={payBillOpen}
          onClose={() => setPayBillOpen(false)}
          vendorSlug={vendor.slug}
          country={vendor.country}
          lang={lang}
        />
      </div>
    );
  }

  // ── Menu browsing screen ──
  return (
    <div dir={dir} className="min-h-screen bg-bg md:bg-surface-2">
      <div className="mx-auto max-w-app min-h-screen bg-bg pb-28 md:shadow-float">
        <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur border-b border-line">
          <div className="flex items-center gap-2 px-4 py-3">
            <button
              onClick={() => setEntered(false)}
              className="grid h-9 w-9 place-items-center rounded-full bg-surface-2"
              aria-label={t("back")}
            >
              <ChevronLeft size={20} />
            </button>
            <h1 className="flex-1 truncate text-lg font-bold">{vendor.name}</h1>
            <button
              onClick={() => setLangOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-full bg-surface-2"
              aria-label={t("language")}
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
                  {localizedName(c, lang)}
                </button>
              ))}
            </div>
          )}
        </header>

        <main className="px-4">
          {filtered.map((cat) => (
            <section key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-44 pt-5">
              <h2 className="mb-3 text-xl font-extrabold">
                {localizedName(cat, lang)}
              </h2>
              <div className="space-y-3">
                {cat.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    lang={lang}
                    onClick={() => setActiveItem(item)}
                  />
                ))}
              </div>
            </section>
          ))}
          {filtered.length === 0 && (
            <EmptyState
              icon={<Search size={28} />}
              title={t("noSearchResults").replace("{query}", query)}
              className="py-16"
            />
          )}
          <LandingFooter t={t} />
        </main>
      </div>

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
                {displayPrice(subtotal, lang)}
                <ShoppingBag size={18} />
              </span>
            </button>
          </div>
        </div>
      )}

      {activeItem && (
        <ItemSheet
          item={activeItem}
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

function VenueHero({
  vendor,
  lang,
  onLanguageOpen,
}: {
  vendor: VendorWithMenus;
  lang: string;
  onLanguageOpen: () => void;
}) {
  const initials = vendor.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();

  return (
    <div className="relative">
      <div className="relative h-56 w-full">
        {vendor.coverUrl ? (
          <Image
            src={vendor.coverUrl}
            alt={vendor.name}
            fill
            className="object-cover"
            priority
            unoptimized
          />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background:
                "linear-gradient(135deg, hsl(var(--brand)) 0%, hsl(var(--brand-soft)) 100%)",
            }}
            aria-hidden
          />
        )}
        <div className="absolute inset-0 bg-black/20" aria-hidden />
        <button
          onClick={onLanguageOpen}
          className="absolute start-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-surface/90 px-3 py-1.5 text-sm font-semibold shadow-card backdrop-blur"
        >
          <Globe size={16} aria-hidden /> {lang.toUpperCase()}
        </button>
      </div>

      <div className="relative -mt-14 rounded-t-3xl bg-surface px-5 pb-6 pt-16 text-center shadow-float">
        <div className="absolute inset-x-0 -top-7 mx-auto flex h-16 w-16 items-center justify-center">
          {vendor.logoUrl ? (
            <div className="h-16 w-16 overflow-hidden rounded-2xl border-4 border-surface bg-surface shadow-card">
              <Image
                src={vendor.logoUrl}
                alt=""
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          ) : (
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-surface shadow-card text-brand-fg text-xl font-extrabold"
              style={{ background: "hsl(var(--brand))" }}
              aria-hidden
            >
              {initials}
            </div>
          )}
        </div>
        <h1 className="text-2xl font-extrabold">{vendor.name}</h1>
        {vendor.description && (
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted leading-relaxed">
            {vendor.description}
          </p>
        )}
      </div>
    </div>
  );
}

function MainEntryPoints({
  t,
  menus,
  onViewMenu,
  onPayBill,
}: {
  t: (key: string) => string;
  menus: VendorWithMenus["menus"];
  onViewMenu: () => void;
  onPayBill: () => void;
}) {
  const hasMenus = menus.length > 0;

  return (
    <div className="px-5 pt-5 pb-4 space-y-3">
      <Button
        variant="primary"
        size="lg"
        fullWidth
        onClick={onViewMenu}
        disabled={!hasMenus}
        className="justify-start gap-4 ps-5"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-fg/20">
          <UtensilsCrossed size={20} aria-hidden />
        </span>
        <span className="flex-1 text-start text-base font-bold">
          {t("viewMenu")}
        </span>
      </Button>

      <Button
        variant="cta"
        size="lg"
        fullWidth
        onClick={onPayBill}
        className="justify-start gap-4 ps-5"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cta-fg/20">
          <CreditCard size={20} aria-hidden />
        </span>
        <span className="flex-1 text-start text-base font-bold">
          {t("payBill")}
        </span>
      </Button>

      {!hasMenus && (
        <p className="text-center text-sm text-muted pt-1">
          {t("noMenusAvailable")}
        </p>
      )}
    </div>
  );
}

function MenuPickerPanel({
  t,
  menus,
  lang,
  dir,
  onSelect,
  onBack,
}: {
  t: (key: string) => string;
  menus: VendorWithMenus["menus"];
  lang: string;
  dir: "rtl" | "ltr";
  onSelect: (index: number) => void;
  onBack: () => void;
}) {
  return (
    <div className="px-5 pt-4 pb-4" dir={dir}>
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={onBack}
          className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-muted hover:text-ink transition-colors"
          aria-label={t("back")}
        >
          <ArrowLeft size={16} aria-hidden />
        </button>
        <p className="text-sm font-semibold text-muted">{t("selectMenuToContinue")}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {menus.map((m, i) => (
          <MenuTile key={m.id} menu={m} lang={lang} onClick={() => onSelect(i)} />
        ))}
      </div>
    </div>
  );
}

function MenuTile({
  menu,
  lang,
  onClick,
}: {
  menu: VendorWithMenus["menus"][number];
  lang: string;
  onClick: () => void;
}) {
  const name = localizedName(menu, lang);

  return (
    <button
      onClick={onClick}
      className="group overflow-hidden rounded-2xl bg-surface text-start shadow-card transition-transform active:scale-95"
    >
      <div className="relative aspect-[4/3] w-full bg-surface-2">
        {menu.imageUrl ? (
          <Image
            src={menu.imageUrl}
            alt={name}
            fill
            className="object-cover transition-transform group-hover:scale-105"
            unoptimized
          />
        ) : (
          <MenuTileFallback name={name} />
        )}
      </div>
      <div className="px-3 py-3 text-sm font-bold uppercase tracking-wide">
        {name}
      </div>
    </button>
  );
}

function MenuTileFallback({ name }: { name: string }) {
  return (
    <div
      className="flex h-full w-full items-center justify-center p-3"
      style={{
        background:
          "linear-gradient(135deg, hsl(var(--brand-soft)) 0%, hsl(var(--surface-2)) 100%)",
      }}
      aria-hidden
    >
      <span className="text-center text-xs font-bold uppercase tracking-widest text-brand/60 line-clamp-3">
        {name}
      </span>
    </div>
  );
}

function ItemRow({
  item,
  lang,
  onClick,
}: {
  item: ItemWithModifiers;
  lang: string;
  onClick: () => void;
}) {
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const name = localizedName(item, lang);
  const description = localizedDescription(item, lang);
  return (
    <button
      onClick={onClick}
      className="flex w-full gap-3 rounded-2xl bg-surface p-3 text-start shadow-card transition-transform active:scale-[0.98]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="font-bold">{name}</h3>
          {tags.slice(0, 2).map((tag) => (
            <DietBadge key={tag} tag={tag} />
          ))}
        </div>
        {description && (
          <p className="mt-1 line-clamp-2 text-sm text-muted">{description}</p>
        )}
        <p className="mt-2 font-bold text-brand">
          {displayPrice(item.price, lang)}
        </p>
      </div>
      {item.imageUrl ? (
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-surface-2">
          <Image
            src={item.imageUrl}
            alt={name}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
      ) : null}
    </button>
  );
}

function LandingFooter({ t }: { t: (k: string) => string }) {
  return (
    <footer className="py-8 text-center">
      <p className="text-2xl font-black tracking-tight text-muted/40">{"qlub_"}</p>
      <p className="mt-1 text-xs text-muted">
        {t("termsPrefix")}{" "}
        <span className="underline">{t("terms")}</span>
      </p>
    </footer>
  );
}

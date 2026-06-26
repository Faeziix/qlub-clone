"use client";

import * as React from "react";
import Image from "next/image";
import {
  Search,
  Globe,
  ChevronLeft,
  ShoppingBag,
  UtensilsCrossed,
  CreditCard,
  ArrowLeft,
  ClipboardList,
} from "lucide-react";
import type { VendorWithMenus } from "@/lib/queries";
import { useCart } from "@/lib/store/cart";
import { useActiveOrder } from "@/lib/store/active-order";
import { makeT, dirFor, localizedName } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatRialAsTomanPersian } from "@/lib/toman-formatter";
import { formatRialAsToman } from "@/lib/money";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { ItemSheet } from "./ItemSheet";
import { CartSheet } from "./CartSheet";
import { LanguageSheet } from "./LanguageSheet";
import { PayBillSheet } from "./PayBillSheet";
import { MyOrderSheet } from "./MyOrderSheet";
import { ItemCard } from "./_components/ItemCard";
import { CategoryChips } from "./_components/CategoryChips";
import type { ItemWithModifiers } from "@/lib/queries";
import axios from "axios";
import type { CustomerOrderSnapshot } from "@/lib/types";

function subtotalLabel(rialAmount: bigint, locale: string): string {
  return locale === "fa"
    ? formatRialAsTomanPersian(rialAmount)
    : `${formatRialAsToman(rialAmount)} Toman`;
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
  const [rawQuery, setRawQuery] = React.useState("");
  const query = React.useDeferredValue(rawQuery);
  const [activeItem, setActiveItem] = React.useState<ItemWithModifiers | null>(null);
  const [cartOpen, setCartOpen] = React.useState(false);
  const [langOpen, setLangOpen] = React.useState(false);
  const [payBillOpen, setPayBillOpen] = React.useState(false);
  const [myOrderOpen, setMyOrderOpen] = React.useState(false);
  const [activeCat, setActiveCat] = React.useState(0);
  const [isPending, startMenuTransition] = React.useTransition();
  const [activeOrderSnapshot, setActiveOrderSnapshot] =
    React.useState<CustomerOrderSnapshot | null>(null);

  const cart = useCart();
  const activeOrderStore = useActiveOrder();
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    cart.init(vendor.slug, tableCode);
    setHydrated(true);

    const stored = activeOrderStore.getActiveOrder(vendor.slug);
    if (stored) {
      axios
        .get<CustomerOrderSnapshot>(`/api/orders/${stored.orderId}`)
        .then(({ data }) => {
          const isTerminal = data.status === "paid" || data.status === "cancelled";
          if (isTerminal) {
            activeOrderStore.clearActiveOrder(vendor.slug);
          } else {
            setActiveOrderSnapshot(data);
          }
        })
        .catch(() => {
          activeOrderStore.clearActiveOrder(vendor.slug);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const count = hydrated ? cart.count() : 0;
  const subtotal = hydrated ? cart.subtotal() : 0n;

  const activeOrderEntry = hydrated
    ? activeOrderStore.getActiveOrder(vendor.slug)
    : null;

  const menu = menus[activeMenu];
  const categories = React.useMemo(() => menu?.categories ?? [], [menu]);

  const filtered = React.useMemo(() => {
    if (!query.trim()) return categories;
    const q = query.toLowerCase();
    return categories
      .map((c) => ({
        ...c,
        items: c.items.filter(
          (i) =>
            localizedName(i, lang).toLowerCase().includes(q) ||
            (i.description?.toLowerCase().includes(q) ?? false)
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
    startMenuTransition(() => {
      setActiveMenu(index);
      setActiveCat(0);
      setEntered(true);
      setLandingView("main");
    });
  }

  function handleSwitchMenu(index: number) {
    startMenuTransition(() => {
      setActiveMenu(index);
      setActiveCat(0);
      setRawQuery("");
    });
  }

  function handleSelectCategory(categoryId: string, index: number) {
    setActiveCat(index);
    requestAnimationFrame(() => {
      document
        .getElementById(`cat-${categoryId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function handleOrderPlaced(orderId: string) {
    activeOrderStore.setActiveOrder(vendor.slug, orderId, tableCode);
    axios
      .get<CustomerOrderSnapshot>(`/api/orders/${orderId}`)
      .then(({ data }) => setActiveOrderSnapshot(data))
      .catch(() => {});
  }

  function handleOrderRefreshed(updated: CustomerOrderSnapshot) {
    setActiveOrderSnapshot(updated);
  }

  function handleOrderStatusCleared() {
    activeOrderStore.clearActiveOrder(vendor.slug);
    setActiveOrderSnapshot(null);
    setMyOrderOpen(false);
  }

  const activeOrderRef = activeOrderSnapshot
    ? { id: activeOrderSnapshot.id, orderNumber: activeOrderSnapshot.orderNumber }
    : null;

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
              activeOrderNumber={activeOrderSnapshot?.orderNumber ?? null}
              onViewMyOrder={() => setMyOrderOpen(true)}
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

        {activeOrderSnapshot && (
          <MyOrderSheet
            open={myOrderOpen}
            onClose={() => setMyOrderOpen(false)}
            vendorSlug={vendor.slug}
            country={vendor.country}
            lang={lang}
            order={activeOrderSnapshot}
            onOrderRefreshed={handleOrderRefreshed}
            onStatusCleared={handleOrderStatusCleared}
            onAddMoreItems={() => {
              setMyOrderOpen(false);
              handleViewMenu();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div dir={dir} className="min-h-screen bg-bg md:bg-surface-2">
      <div className="mx-auto max-w-app min-h-screen bg-bg pb-28 md:shadow-float">
        <MenuBrowseHeader
          vendor={vendor}
          menu={menu}
          menus={menus}
          categories={categories}
          lang={lang}
          rawQuery={rawQuery}
          activeCat={activeCat}
          t={t}
          onBack={() => setEntered(false)}
          onLanguageOpen={() => setLangOpen(true)}
          onQueryChange={setRawQuery}
          onSwitchMenu={handleSwitchMenu}
          onSelectCategory={handleSelectCategory}
          activeMenu={activeMenu}
        />

        <main
          className={cn(
            "px-4 transition-opacity duration-normal",
            isPending && "opacity-50"
          )}
        >
          {filtered.map((cat) => (
            <section
              key={cat.id}
              id={`cat-${cat.id}`}
              className="scroll-mt-52 pt-5"
            >
              <h2 className="mb-3 text-xl font-extrabold">
                {localizedName(cat, lang)}
              </h2>
              <div className="space-y-3">
                {cat.items.map((item) => (
                  <ItemCard
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
              title={t("noSearchResults").replace("{query}", rawQuery)}
              className="py-16"
            />
          )}

          <LandingFooter t={t} />
        </main>
      </div>

      {activeOrderEntry && count === 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 safe-bottom">
          <div className="mx-auto max-w-app px-4 pb-4">
            <button
              type="button"
              onClick={() => setMyOrderOpen(true)}
              className="flex w-full items-center justify-between rounded-2xl bg-surface border border-brand/40 px-5 py-4 shadow-float animate-slide-up"
            >
              <span className="flex items-center gap-2 font-bold text-brand">
                <ClipboardList size={18} aria-hidden />
                {t("myOrder")}
              </span>
              <span className="text-sm font-semibold text-muted">
                {activeOrderSnapshot?.orderNumber}
              </span>
            </button>
          </div>
        </div>
      )}

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 safe-bottom">
          <div className="mx-auto max-w-app px-4 pb-4 space-y-2">
            {activeOrderEntry && (
              <button
                type="button"
                onClick={() => setMyOrderOpen(true)}
                className="flex w-full items-center justify-between rounded-2xl bg-surface border border-brand/30 px-4 py-2.5 shadow-card"
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold text-brand">
                  <ClipboardList size={16} aria-hidden />
                  {t("myOrder")}
                </span>
                <span className="text-xs font-medium text-muted">
                  {activeOrderSnapshot?.orderNumber}
                </span>
              </button>
            )}
            <button
              type="button"
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
                {subtotalLabel(subtotal, lang)}
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
        activeOrder={activeOrderRef}
        onOrderPlaced={handleOrderPlaced}
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
      {activeOrderSnapshot && (
        <MyOrderSheet
          open={myOrderOpen}
          onClose={() => setMyOrderOpen(false)}
          vendorSlug={vendor.slug}
          country={vendor.country}
          lang={lang}
          order={activeOrderSnapshot}
          onOrderRefreshed={handleOrderRefreshed}
          onStatusCleared={handleOrderStatusCleared}
          onAddMoreItems={() => setMyOrderOpen(false)}
        />
      )}
    </div>
  );
}

interface MenuBrowseHeaderProps {
  vendor: VendorWithMenus;
  menu: VendorWithMenus["menus"][number];
  menus: VendorWithMenus["menus"];
  categories: VendorWithMenus["menus"][number]["categories"];
  lang: string;
  rawQuery: string;
  activeCat: number;
  activeMenu: number;
  t: (key: string) => string;
  onBack: () => void;
  onLanguageOpen: () => void;
  onQueryChange: (q: string) => void;
  onSwitchMenu: (index: number) => void;
  onSelectCategory: (categoryId: string, index: number) => void;
}

function MenuBrowseHeader({
  vendor,
  menu,
  menus,
  categories,
  lang,
  rawQuery,
  activeCat,
  activeMenu,
  t,
  onBack,
  onLanguageOpen,
  onQueryChange,
  onSwitchMenu,
  onSelectCategory,
}: MenuBrowseHeaderProps) {
  const hasMultipleMenus = menus.length > 1;
  const menuName = localizedName(menu, lang);

  return (
    <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur border-b border-line">
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 transition-colors hover:bg-line"
          aria-label={t("back")}
        >
          <ChevronLeft size={20} />
        </button>
        <h1 className="flex-1 truncate text-lg font-bold">{vendor.name}</h1>
        <button
          type="button"
          onClick={onLanguageOpen}
          className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 transition-colors hover:bg-line"
          aria-label={t("language")}
        >
          <Globe size={18} />
        </button>
      </div>

      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3">
          <Search size={18} className="shrink-0 text-muted" />
          <input
            value={rawQuery}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={`${t("search")} ${menuName}`}
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted"
          />
          {rawQuery && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              className="shrink-0 text-muted hover:text-ink"
              aria-label={t("back")}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {hasMultipleMenus && (
        <div className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-1">
          {menus.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onSwitchMenu(i)}
              className={cn(
                "shrink-0 border-b-2 px-3 pb-2 pt-1 text-sm font-bold uppercase tracking-wide transition-colors",
                i === activeMenu
                  ? "border-brand text-brand"
                  : "border-transparent text-muted hover:text-ink"
              )}
            >
              {localizedName(m, lang)}
            </button>
          ))}
        </div>
      )}

      {!rawQuery && (
        <CategoryChips
          categories={categories}
          activeCat={activeCat}
          lang={lang}
          onSelect={onSelectCategory}
        />
      )}
    </header>
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
          type="button"
          onClick={onLanguageOpen}
          className="absolute start-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-surface/90 px-3 py-1.5 text-sm font-semibold shadow-card backdrop-blur"
        >
          <Globe size={16} aria-hidden /> {lang.toUpperCase()}
        </button>
      </div>

      <div className="relative -mt-14 rounded-t-3xl bg-surface px-5 pb-6 pt-16 text-center shadow-float">
        <div className="absolute inset-x-0 -top-7 mx-auto flex h-16 w-16 items-center justify-center">
          {vendor.logoUrl ? (
            <div className="relative h-16 w-16 overflow-hidden rounded-2xl border-4 border-surface bg-surface shadow-card">
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
  activeOrderNumber,
  onViewMyOrder,
}: {
  t: (key: string) => string;
  menus: VendorWithMenus["menus"];
  onViewMenu: () => void;
  onPayBill: () => void;
  activeOrderNumber: string | null;
  onViewMyOrder: () => void;
}) {
  const hasMenus = menus.length > 0;

  return (
    <div className="px-5 pt-5 pb-4 space-y-3">
      {activeOrderNumber && (
        <button
          type="button"
          onClick={onViewMyOrder}
          className="flex w-full items-center justify-between rounded-2xl border border-brand/40 bg-brand/5 px-5 py-4 text-start transition-colors hover:bg-brand/10"
        >
          <span className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand">
              <ClipboardList size={20} aria-hidden />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-bold text-ink">{t("myOrder")}</span>
              <span className="text-xs text-muted">{activeOrderNumber}</span>
            </span>
          </span>
          <span className="text-xs font-semibold text-brand">{t("viewMyOrder")}</span>
        </button>
      )}

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
          type="button"
          onClick={onBack}
          className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-muted hover:text-ink transition-colors"
          aria-label={t("back")}
        >
          <ArrowLeft size={16} aria-hidden />
        </button>
        <p className="text-sm font-semibold text-muted">
          {t("selectMenuToContinue")}
        </p>
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
      type="button"
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

function LandingFooter({ t }: { t: (k: string) => string }) {
  return (
    <footer className="py-8 text-center">
      <p className="text-2xl font-black tracking-tight text-muted/40">
        {"qlub_"}
      </p>
      <p className="mt-1 text-xs text-muted">
        {t("termsPrefix")}{" "}
        <span className="underline">{t("terms")}</span>
      </p>
    </footer>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  UtensilsCrossed,
  ReceiptText,
  QrCode,
  Star,
  Settings,
  LogOut,
  Menu as MenuIcon,
  X,
  ShieldCheck,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn, initials } from "@/lib/utils";
import { logout } from "@/app/[locale]/admin/actions";

const NAV_ITEMS = [
  { href: "/admin", key: "dashboard", icon: LayoutDashboard },
  { href: "/admin/orders", key: "orders", icon: ReceiptText },
  { href: "/admin/menu", key: "menu", icon: UtensilsCrossed },
  { href: "/admin/tables", key: "tables", icon: QrCode },
  { href: "/admin/reviews", key: "reviews", icon: Star },
  { href: "/admin/settings", key: "settings", icon: Settings },
] as const;

const SUPERADMIN_NAV_ITEMS = [
  { href: "/admin/superadmin", key: "superadmin", icon: ShieldCheck },
] as const;

type SidebarUser = { name: string; email: string; role: string };

export function AdminSidebar({
  user,
  vendorName,
}: {
  user: SidebarUser;
  vendorName: string;
}) {
  const [open, setOpen] = useState(false);
  const tCommon = useTranslations("admin.common");

  return (
    <>
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
        <span className="text-lg font-black">
          {"qlub"}<span className="text-brand">{"_"}</span>
        </span>
        <button
          onClick={() => setOpen(true)}
          className="grid h-9 w-9 place-items-center rounded-lg bg-surface-2"
          aria-label={tCommon("openMenu")}
        >
          <MenuIcon size={20} />
        </button>
      </div>

      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-e border-line bg-surface lg:flex">
        <SidebarContent user={user} vendorName={vendorName} />
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 start-0 z-50 flex w-72 flex-col border-e border-line bg-surface transition-transform lg:hidden",
          open ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"
        )}
      >
        <SidebarContent
          user={user}
          vendorName={vendorName}
          onNavigate={() => setOpen(false)}
          onClose={() => setOpen(false)}
        />
      </aside>
    </>
  );
}

function SidebarContent({
  user,
  vendorName,
  onNavigate,
  onClose,
}: {
  user: SidebarUser;
  vendorName: string;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const t = useTranslations("admin.nav");
  const tCommon = useTranslations("admin.common");
  const isSuperadmin = user.role === "superadmin";

  return (
    <>
      <div className="flex items-center justify-between px-5 py-5">
        <div>
          <span className="text-xl font-black">
            {"qlub"}<span className="text-brand">{"_"}</span>
          </span>
          <p className="mt-0.5 text-xs font-medium text-muted">{vendorName}</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 lg:hidden"
            aria-label={tCommon("closeMenu")}
          >
            <X size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                active
                  ? "bg-brand text-brand-fg"
                  : "text-muted hover:bg-surface-2 hover:text-ink"
              )}
            >
              <Icon size={18} />
              {t(item.key)}
            </Link>
          );
        })}

        {isSuperadmin && (
          <>
            <div className="my-2 border-t border-line" />
            {SUPERADMIN_NAV_ITEMS.map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                    active
                      ? "bg-brand text-brand-fg"
                      : "text-muted hover:bg-surface-2 hover:text-ink"
                  )}
                >
                  <Icon size={18} />
                  {t(item.key)}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand">
            {initials(user.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs capitalize text-muted">{user.role}</p>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-danger"
              aria-label={tCommon("signOut")}
            >
              <LogOut size={16} />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

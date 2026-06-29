"use client";

import { useState, useTransition, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Building2,
  MoreVertical,
  CheckCircle2,
  XCircle,
  Search,
  UserPlus,
  ShieldOff,
  ShieldCheck,
} from "lucide-react";
import { Card } from "@/components/admin/ui";
import { suspendTenant, reactivateTenant } from "../../actions";
import { ProvisionOwnerDialog } from "./ProvisionOwnerDialog";

type Vendor = {
  id: string;
  slug: string;
  name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  eNamadStatus: string;
  createdAt: Date;
  _count: { staff: number; orders: number };
};

export function TenantTable({ vendors }: { vendors: Vendor[] }) {
  const t = useTranslations("admin.superadmin");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.slug.toLowerCase().includes(q) ||
        v.email?.toLowerCase().includes(q)
    );
  }, [vendors, search]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search
          size={16}
          className="absolute start-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchTenants")}
          className="w-full rounded-xl border border-line bg-surface py-2 pe-3 ps-9 text-sm outline-none transition-colors focus:border-brand focus:ring-1 focus:ring-brand sm:max-w-xs"
        />
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="px-5 py-3 text-start text-xs font-semibold uppercase text-muted">
                  {t("tenant")}
                </th>
                <th className="px-5 py-3 text-start text-xs font-semibold uppercase text-muted">
                  {t("status")}
                </th>
                <th className="hidden px-5 py-3 text-start text-xs font-semibold uppercase text-muted sm:table-cell">
                  {t("staff")}
                </th>
                <th className="hidden px-5 py-3 text-start text-xs font-semibold uppercase text-muted sm:table-cell">
                  {t("orders")}
                </th>
                <th className="hidden px-5 py-3 text-start text-xs font-semibold uppercase text-muted md:table-cell">
                  {t("enamad")}
                </th>
                <th className="px-5 py-3 text-end text-xs font-semibold uppercase text-muted">
                  {t("actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <TenantRow key={v.id} vendor={v} />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-sm text-muted"
                  >
                    {search ? t("noResults") : t("noTenants")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function EnamadBadge({ status }: { status: string }) {
  const t = useTranslations("admin.superadmin");
  const styleMap: Record<string, string> = {
    verified: "bg-success/10 text-success",
    pending: "bg-warning/10 text-warning",
    none: "bg-surface-2 text-muted",
  };
  const labelKey = `enamadStatus_${status}` as
    | "enamadStatus_verified"
    | "enamadStatus_pending"
    | "enamadStatus_none";
  const style = styleMap[status] ?? styleMap.none;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${style}`}
    >
      {t(labelKey)}
    </span>
  );
}

function TenantRow({ vendor }: { vendor: Vendor }) {
  const t = useTranslations("admin.superadmin");
  const [isPending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [provisionOpen, setProvisionOpen] = useState(false);

  function handleSuspend() {
    setMenuOpen(false);
    startTransition(async () => {
      await suspendTenant(vendor.id);
    });
  }

  function handleReactivate() {
    setMenuOpen(false);
    startTransition(async () => {
      await reactivateTenant(vendor.id);
    });
  }

  return (
    <>
      <tr
        className={`border-t border-line transition-colors hover:bg-surface-2/50 ${isPending ? "opacity-60" : ""}`}
      >
        <td className="px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
              <Building2 size={16} />
            </span>
            <div className="min-w-0">
              <p className="font-semibold leading-tight">{vendor.name}</p>
              <p className="truncate text-xs text-muted" dir="ltr">
                {vendor.slug}
              </p>
            </div>
          </div>
        </td>

        <td className="px-5 py-4">
          {vendor.active ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
              <CheckCircle2 size={11} />
              {t("active")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/10 px-2.5 py-1 text-xs font-semibold text-danger">
              <XCircle size={11} />
              {t("suspended")}
            </span>
          )}
        </td>

        <td className="hidden px-5 py-4 tabular-nums text-muted sm:table-cell">
          {vendor._count.staff}
        </td>
        <td className="hidden px-5 py-4 tabular-nums text-muted sm:table-cell">
          {vendor._count.orders}
        </td>

        <td className="hidden px-5 py-4 md:table-cell">
          <EnamadBadge status={vendor.eNamadStatus} />
        </td>

        <td className="px-5 py-4 text-end">
          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              disabled={isPending}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
              aria-label={t("actions")}
              aria-expanded={menuOpen}
            >
              <MoreVertical size={16} />
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-overlay"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute end-0 z-modal mt-1 w-52 rounded-xl border border-line bg-surface py-1.5 shadow-float">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setProvisionOpen(true);
                    }}
                    className="flex w-full items-center gap-2.5 px-4 py-2 text-start text-sm hover:bg-surface-2"
                  >
                    <UserPlus size={14} className="text-muted" />
                    {t("provisionOwner")}
                  </button>

                  <div className="my-1 border-t border-line" />

                  {vendor.active ? (
                    <button
                      type="button"
                      onClick={handleSuspend}
                      className="flex w-full items-center gap-2.5 px-4 py-2 text-start text-sm text-danger hover:bg-danger/5"
                    >
                      <ShieldOff size={14} />
                      {t("suspendTenant")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleReactivate}
                      className="flex w-full items-center gap-2.5 px-4 py-2 text-start text-sm text-success hover:bg-success/5"
                    >
                      <ShieldCheck size={14} />
                      {t("reactivateTenant")}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </td>
      </tr>

      {provisionOpen && (
        <ProvisionOwnerDialog
          vendorId={vendor.id}
          vendorName={vendor.name}
          onClose={() => setProvisionOpen(false)}
        />
      )}
    </>
  );
}

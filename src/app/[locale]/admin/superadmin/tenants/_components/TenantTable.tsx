"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Building2, MoreVertical, CheckCircle2, XCircle } from "lucide-react";
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

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-start text-xs uppercase text-muted">
              <th className="pb-3 font-semibold">{t("tenant")}</th>
              <th className="pb-3 font-semibold">{t("status")}</th>
              <th className="pb-3 font-semibold">{t("staff")}</th>
              <th className="pb-3 font-semibold">{t("orders")}</th>
              <th className="pb-3 font-semibold">{t("enamad")}</th>
              <th className="pb-3 text-end font-semibold">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <TenantRow key={v.id} vendor={v} />
            ))}
            {vendors.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted">
                  {t("noTenants")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
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
      <tr className="border-t border-line">
        <td className="py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2">
              <Building2 size={16} className="text-muted" />
            </span>
            <div>
              <p className="font-semibold">{vendor.name}</p>
              <p className="text-xs text-muted">{vendor.slug}</p>
            </div>
          </div>
        </td>

        <td className="py-3">
          {vendor.active ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
              <CheckCircle2 size={12} />
              {t("active")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/10 px-2.5 py-1 text-xs font-semibold text-danger">
              <XCircle size={12} />
              {t("suspended")}
            </span>
          )}
        </td>

        <td className="py-3 tabular-nums">{vendor._count.staff}</td>
        <td className="py-3 tabular-nums">{vendor._count.orders}</td>

        <td className="py-3">
          <span className="text-xs capitalize text-muted">
            {vendor.eNamadStatus}
          </span>
        </td>

        <td className="py-3 text-end">
          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              disabled={isPending}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-50"
              aria-label={t("actions")}
            >
              <MoreVertical size={16} />
            </button>

            {menuOpen && (
              <div className="absolute end-0 z-10 mt-1 w-48 rounded-xl border border-line bg-surface py-1 shadow-card">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setProvisionOpen(true);
                  }}
                  className="block w-full px-4 py-2 text-start text-sm hover:bg-surface-2"
                >
                  {t("provisionOwner")}
                </button>

                {vendor.active ? (
                  <button
                    type="button"
                    onClick={handleSuspend}
                    className="block w-full px-4 py-2 text-start text-sm text-danger hover:bg-surface-2"
                  >
                    {t("suspendTenant")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleReactivate}
                    className="block w-full px-4 py-2 text-start text-sm text-success hover:bg-surface-2"
                  >
                    {t("reactivateTenant")}
                  </button>
                )}
              </div>
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

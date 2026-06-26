import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Building2, Users } from "lucide-react";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { assertRole } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/admin/ui";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SuperadminDashboardPage() {
  const t = await getTranslations("admin.superadmin");
  const session = await getSession();
  if (!session) redirect("/admin/login");

  try {
    assertRole(session, "superadmin");
  } catch {
    redirect("/admin");
  }

  const [totalTenants, activeTenants, totalStaff] = await Promise.all([
    db.vendor.count(),
    db.vendor.count({ where: { active: true } }),
    db.staffUser.count({ where: { role: { not: "superadmin" } } }),
  ]);

  const suspendedTenants = totalTenants - activeTenants;

  return (
    <>
      <PageHeader title={t("pageTitle")} subtitle={t("pageSubtitle")} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-start gap-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
              <Building2 size={20} />
            </span>
            <div>
              <p className="text-2xl font-extrabold tabular-nums">{totalTenants}</p>
              <p className="text-sm text-muted">{t("totalTenants")}</p>
              {suspendedTenants > 0 && (
                <p className="mt-1 text-xs text-danger">
                  {suspendedTenants} {t("suspended")}
                </p>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
              <Users size={20} />
            </span>
            <div>
              <p className="text-2xl font-extrabold tabular-nums">{totalStaff}</p>
              <p className="text-sm text-muted">{t("totalStaff")}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-bold">{t("tenantManagement")}</h2>
          <p className="mb-4 text-sm text-muted">{t("tenantManagementDesc")}</p>
          <Link
            href="/admin/superadmin/tenants"
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg transition-colors hover:opacity-90"
          >
            {t("manageTenants")}
          </Link>
        </Card>

        <Card>
          <h2 className="mb-4 font-bold">{t("staffManagement")}</h2>
          <p className="mb-4 text-sm text-muted">{t("staffManagementDesc")}</p>
          <Link
            href="/admin/superadmin/staff"
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg transition-colors hover:opacity-90"
          >
            {t("manageStaff")}
          </Link>
        </Card>
      </div>
    </>
  );
}

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Building2, Users, ReceiptText, CheckCircle2, XCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { assertRole } from "@/lib/rbac";
import { PageHeader, Card, StatCard } from "@/components/admin/ui";
import { db } from "@/lib/db";
import { timeAgo } from "@/lib/utils";

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

  const [totalTenants, activeTenants, totalStaff, totalOrders, recentTenants] =
    await Promise.all([
      db.vendor.count(),
      db.vendor.count({ where: { active: true } }),
      db.staffUser.count({ where: { role: { not: "superadmin" } } }),
      db.order.count(),
      db.vendor.findMany({
        take: 6,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          slug: true,
          name: true,
          active: true,
          eNamadStatus: true,
          createdAt: true,
          _count: { select: { orders: true, staff: true } },
        },
      }),
    ]);

  const suspendedTenants = totalTenants - activeTenants;

  return (
    <>
      <PageHeader title={t("pageTitle")} subtitle={t("pageSubtitle")} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={t("totalTenants")}
          value={String(totalTenants)}
          icon={<Building2 size={18} />}
          hint={
            suspendedTenants > 0
              ? t("suspendedCount", { count: suspendedTenants })
              : undefined
          }
        />
        <StatCard
          label={t("activeTenants")}
          value={String(activeTenants)}
          icon={<CheckCircle2 size={18} />}
        />
        <StatCard
          label={t("totalStaff")}
          value={String(totalStaff)}
          icon={<Users size={18} />}
        />
        <StatCard
          label={t("totalOrders")}
          value={String(totalOrders)}
          icon={<ReceiptText size={18} />}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold">{t("recentTenants")}</h2>
              <Link
                href="/admin/superadmin/tenants"
                className="flex items-center gap-1 text-xs font-semibold text-brand hover:opacity-80"
              >
                {t("viewAll")}
                <ArrowLeft size={12} />
              </Link>
            </div>

            {recentTenants.length === 0 ? (
              <p className="text-sm text-muted">{t("noRecentTenants")}</p>
            ) : (
              <div className="divide-y divide-line">
                {recentTenants.map((vendor) => (
                  <div
                    key={vendor.id}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                      <Building2 size={16} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{vendor.name}</p>
                      <p className="truncate text-xs text-muted" dir="ltr">
                        {vendor.slug}
                      </p>
                    </div>

                    <div className="hidden flex-col items-end gap-1 sm:flex">
                      <span className="tabular-nums text-xs text-muted">
                        {vendor._count.orders} {t("orders")}
                      </span>
                      <span className="tabular-nums text-xs text-muted">
                        {vendor._count.staff} {t("staff")}
                      </span>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      {vendor.active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                          <CheckCircle2 size={10} />
                          {t("active")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
                          <XCircle size={10} />
                          {t("suspended")}
                        </span>
                      )}
                      <span className="text-xs text-muted">
                        {timeAgo(vendor.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-4 font-bold">{t("quickActions")}</h2>
            <div className="space-y-2">
              <Link
                href="/admin/superadmin/tenants"
                className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3 text-sm font-semibold transition-colors hover:bg-brand hover:text-brand-fg"
              >
                <span>{t("manageTenants")}</span>
                <Building2 size={16} />
              </Link>
              <Link
                href="/admin/superadmin/staff"
                className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3 text-sm font-semibold transition-colors hover:bg-brand hover:text-brand-fg"
              >
                <span>{t("manageStaff")}</span>
                <Users size={16} />
              </Link>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 font-bold">{t("platformOverview")}</h2>
            <dl className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <dt className="text-muted">{t("activeTenants")}</dt>
                <dd className="font-semibold tabular-nums text-success">
                  {activeTenants}
                </dd>
              </div>
              {suspendedTenants > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <dt className="text-muted">{t("suspended")}</dt>
                  <dd className="font-semibold tabular-nums text-danger">
                    {suspendedTenants}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <dt className="text-muted">{t("totalStaff")}</dt>
                <dd className="font-semibold tabular-nums">{totalStaff}</dd>
              </div>
              <div className="flex items-center justify-between text-sm">
                <dt className="text-muted">{t("totalOrders")}</dt>
                <dd className="font-semibold tabular-nums">{totalOrders}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}

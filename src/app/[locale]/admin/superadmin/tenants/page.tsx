import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/auth";
import { assertRole } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/ui";
import { TenantTable } from "./_components/TenantTable";
import { CreateTenantDialog } from "./_components/CreateTenantDialog";

export const dynamic = "force-dynamic";

export default async function TenantsPage() {
  const t = await getTranslations("admin.superadmin");
  const session = await getSession();
  if (!session) redirect("/admin/login");

  try {
    assertRole(session, "superadmin");
  } catch {
    redirect("/admin");
  }

  const vendors = await db.vendor.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      name: true,
      email: true,
      phone: true,
      active: true,
      eNamadStatus: true,
      createdAt: true,
      _count: { select: { staff: true, orders: true } },
    },
  });

  return (
    <>
      <PageHeader
        title={t("tenantsPageTitle")}
        subtitle={t("tenantsPageSubtitle")}
        action={<CreateTenantDialog />}
      />
      <TenantTable vendors={vendors} />
    </>
  );
}

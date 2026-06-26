import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/auth";
import { assertRole } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/ui";
import { StaffTable } from "./_components/StaffTable";

export const dynamic = "force-dynamic";

export default async function PlatformStaffPage() {
  const t = await getTranslations("admin.superadmin");
  const session = await getSession();
  if (!session) redirect("/admin/login");

  try {
    assertRole(session, "superadmin");
  } catch {
    redirect("/admin");
  }

  const staff = await db.staffUser.findMany({
    where: { role: { not: "superadmin" } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      vendorId: true,
      createdAt: true,
      vendor: { select: { name: true, slug: true } },
    },
  });

  return (
    <>
      <PageHeader
        title={t("staffPageTitle")}
        subtitle={t("staffPageSubtitle")}
      />
      <StaffTable staff={staff} />
    </>
  );
}

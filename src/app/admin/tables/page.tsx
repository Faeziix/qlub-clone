import { LayoutGrid, Armchair, CheckCircle2, Users } from "lucide-react";
import { requireSession } from "../actions";
import { db } from "@/lib/db";
import { PageHeader, StatCard, EmptyRow } from "@/components/admin/ui";
import { TablesGrid } from "@/components/admin/tables/TablesGrid";

export const dynamic = "force-dynamic";

export default async function TablesPage() {
  const session = await requireSession();

  // Resolve the vendor in scope. Scoped admins use their own vendor;
  // superadmin (vendorId === null) falls back to the first vendor so the
  // QR / customer URLs have a concrete slug & country to point at.
  const vendor = session.vendorId
    ? await db.vendor.findUnique({ where: { id: session.vendorId } })
    : await db.vendor.findFirst({ orderBy: { createdAt: "asc" } });

  if (!vendor) {
    return (
      <>
        <PageHeader
          title="Tables & QR codes"
          subtitle="Manage dining tables and their pay-at-table QR codes."
        />
        <EmptyRow>No vendor found. Create a vendor before adding tables.</EmptyRow>
      </>
    );
  }

  const tables = await db.diningTable.findMany({
    where: { vendorId: vendor.id },
    orderBy: { code: "asc" },
  });

  const total = tables.length;
  const occupied = tables.filter((t) => t.status === "occupied").length;
  const available = tables.filter((t) => t.status === "available").length;
  const totalSeats = tables.reduce((sum, t) => sum + t.seats, 0);

  const tableData = tables.map((t) => ({
    id: t.id,
    code: t.code,
    label: t.label ?? `Table ${t.code}`,
    area: t.area ?? "Main",
    seats: t.seats,
    passcode: t.passcode,
    status: t.status,
  }));

  return (
    <>
      <PageHeader
        title="Tables & QR codes"
        subtitle={`Scan-to-pay QR codes for ${vendor.name}.`}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total tables"
          value={String(total)}
          icon={<LayoutGrid size={18} />}
          hint="across all areas"
        />
        <StatCard
          label="Occupied"
          value={String(occupied)}
          icon={<Armchair size={18} />}
          hint={total ? `${Math.round((occupied / total) * 100)}% in use` : "—"}
        />
        <StatCard
          label="Available"
          value={String(available)}
          icon={<CheckCircle2 size={18} />}
          hint="ready to seat"
        />
        <StatCard
          label="Total seats"
          value={String(totalSeats)}
          icon={<Users size={18} />}
          hint="combined capacity"
        />
      </div>

      <TablesGrid
        vendorId={vendor.id}
        country={vendor.country}
        slug={vendor.slug}
        theme={vendor.theme}
        tables={tableData}
      />
    </>
  );
}

import { UtensilsCrossed, LayoutGrid, CheckCircle2, BookOpen } from "lucide-react";
import { requireSession } from "@/app/admin/actions";
import { db } from "@/lib/db";
import { PageHeader, StatCard, EmptyRow } from "@/components/admin/ui";
import { MenuManager, type MenuTree } from "@/components/admin/menu/MenuManager";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  const session = await requireSession();

  // Resolve which vendor's menus to show.
  // owner/manager/staff -> their own vendor.
  // superadmin (vendorId null) -> first vendor in the system (with a note).
  let vendorId = session.vendorId;
  let vendorName: string | null = null;
  let crossVendorNote = false;

  if (!vendorId) {
    const firstVendor = await db.vendor.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
    if (firstVendor) {
      vendorId = firstVendor.id;
      vendorName = firstVendor.name;
      crossVendorNote = true;
    }
  }

  if (!vendorId) {
    return (
      <>
        <PageHeader
          title="Menu"
          subtitle="Manage menus, categories and items."
        />
        <EmptyRow>No vendors found. Create a vendor to start building menus.</EmptyRow>
      </>
    );
  }

  const menusRaw = await db.menu.findMany({
    where: { vendorId },
    orderBy: { sortOrder: "asc" },
    include: {
      categories: {
        orderBy: { sortOrder: "asc" },
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
            include: {
              modifierGroups: {
                orderBy: { sortOrder: "asc" },
                include: {
                  options: { orderBy: { sortOrder: "asc" } },
                },
              },
            },
          },
        },
      },
    },
  });

  // Map to a serializable tree for the client component.
  const menus: MenuTree[] = menusRaw.map((m) => ({
    id: m.id,
    name: m.name,
    active: m.active,
    availability: m.availability as string | null,
    categories: m.categories.map((c) => ({
      id: c.id,
      name: c.name,
      items: c.items.map((it) => ({
        id: it.id,
        name: it.name,
        description: it.description ?? "",
        priceRialStr: it.price.toString(),
        imageUrl: it.imageUrl,
        available: it.available,
        calories: it.calories,
        tags: Array.isArray(it.tags) ? (it.tags as string[]) : [],
        modifierGroupCount: it.modifierGroups.length,
        modifierOptionCount: it.modifierGroups.reduce(
          (s, g) => s + g.options.length,
          0
        ),
      })),
    })),
  }));

  // Stats.
  const categoryCount = menus.reduce((s, m) => s + m.categories.length, 0);
  const allItems = menus.flatMap((m) => m.categories.flatMap((c) => c.items));
  const totalItems = allItems.length;
  const availableItems = allItems.filter((i) => i.available).length;

  return (
    <>
      <PageHeader
        title="Menu"
        subtitle={
          crossVendorNote
            ? `Viewing menus for ${vendorName}. As superadmin, you are editing the first vendor.`
            : "Manage menus, categories, items and pricing."
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total items"
          value={String(totalItems)}
          icon={<UtensilsCrossed size={18} />}
        />
        <StatCard
          label="Available"
          value={String(availableItems)}
          icon={<CheckCircle2 size={18} />}
          hint={
            totalItems
              ? `${Math.round((availableItems / totalItems) * 100)}% live`
              : undefined
          }
        />
        <StatCard
          label="Categories"
          value={String(categoryCount)}
          icon={<LayoutGrid size={18} />}
        />
        <StatCard
          label="Menus"
          value={String(menus.length)}
          icon={<BookOpen size={18} />}
        />
      </div>

      {menus.length === 0 ? (
        <EmptyRow>
          This vendor has no menus yet. Create a menu to start adding categories
          and items.
        </EmptyRow>
      ) : (
        <MenuManager menus={menus} vendorId={vendorId} />
      )}
    </>
  );
}

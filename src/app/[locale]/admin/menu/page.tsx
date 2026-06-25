import { UtensilsCrossed, LayoutGrid, CheckCircle2, BookOpen } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/app/[locale]/admin/actions";
import { db } from "@/lib/db";
import { PageHeader, StatCard, EmptyRow } from "@/components/admin/ui";
import { MenuManager, type MenuTree } from "@/components/admin/menu/MenuManager";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  const t = await getTranslations("admin.menu");
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
        <PageHeader title={t("pageTitle")} subtitle={t("pageSubtitle")} />
        <EmptyRow>{t("noVendor")}</EmptyRow>
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
              MenuItemTranslation: true,
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
        translations: it.MenuItemTranslation.map((tx) => ({
          locale: tx.locale,
          name: tx.name,
          description: tx.description,
        })),
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
        title={t("pageTitle")}
        subtitle={
          crossVendorNote
            ? t("superadminNote", { name: vendorName ?? "" })
            : t("pageSubtitle")
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={t("items")}
          value={String(totalItems)}
          icon={<UtensilsCrossed size={18} />}
        />
        <StatCard
          label={t("available")}
          value={String(availableItems)}
          icon={<CheckCircle2 size={18} />}
          hint={
            totalItems
              ? `${Math.round((availableItems / totalItems) * 100)}% live`
              : undefined
          }
        />
        <StatCard
          label={t("categories")}
          value={String(categoryCount)}
          icon={<LayoutGrid size={18} />}
        />
        <StatCard
          label={t("menus")}
          value={String(menus.length)}
          icon={<BookOpen size={18} />}
        />
      </div>

      {menus.length === 0 ? (
        <EmptyRow>{t("noItems")}</EmptyRow>
      ) : (
        <MenuManager menus={menus} vendorId={vendorId} />
      )}
    </>
  );
}

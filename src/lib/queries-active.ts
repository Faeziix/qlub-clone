import "server-only";
import { db } from "./db";
import { bigintToNumber } from "./money";

function localesToMap<T extends { locale: string }>(
  rows: T[],
  pick: (row: T) => { name?: string | null; description?: string | null }
): Record<string, { name?: string | null; description?: string | null }> {
  const map: Record<string, { name?: string | null; description?: string | null }> = {};
  for (const row of rows) map[row.locale] = pick(row);
  return map;
}

/**
 * Like `getVendorBySlug` but enforces the suspension guard.
 * Returns null when the vendor does not exist OR when active=false.
 * Callers should map null to a "suspended" page rather than a generic 404
 * so diners get a clear message (not a data-leaking 500).
 */
export async function getVendorBySlugActive(slug: string) {
  const vendor = await db.vendor.findUnique({
    where: { slug },
    include: {
      menus: {
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        include: {
          categories: {
            orderBy: { sortOrder: "asc" },
            include: {
              CategoryTranslation: true,
              items: {
                where: { available: true },
                orderBy: { sortOrder: "asc" },
                include: {
                  MenuItemTranslation: true,
                  modifierGroups: {
                    orderBy: { sortOrder: "asc" },
                    include: { options: { orderBy: { sortOrder: "asc" } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!vendor) return null;
  if (!vendor.active) return null;

  return {
    ...vendor,
    supportedLangs: Array.isArray(vendor.supportedLangs)
      ? (vendor.supportedLangs as string[])
      : ["fa", "en"],
    tipPresets: Array.isArray(vendor.tipPresets)
      ? (vendor.tipPresets as number[])
      : [5, 10, 15],
    menus: vendor.menus.map((menu) => ({
      ...menu,
      categories: menu.categories.map((cat) => {
        const { CategoryTranslation, ...catRest } = cat;
        return {
          ...catRest,
          i18n: localesToMap(CategoryTranslation, (t) => ({ name: t.name })),
          items: cat.items.map((item) => {
            const { MenuItemTranslation, ...itemRest } = item;
            return {
              ...itemRest,
              i18n: localesToMap(MenuItemTranslation, (t) => ({
                name: t.name,
                description: t.description,
              })),
              price: bigintToNumber(item.price),
              tags: Array.isArray(item.tags) ? (item.tags as string[]) : [],
              modifierGroups: item.modifierGroups.map((group) => ({
                ...group,
                options: group.options.map((opt) => ({
                  ...opt,
                  priceDelta: bigintToNumber(opt.priceDelta),
                })),
              })),
            };
          }),
        };
      }),
    })),
  };
}

export type ActiveVendorWithMenus = NonNullable<
  Awaited<ReturnType<typeof getVendorBySlugActive>>
>;

import { notFound } from "next/navigation";
import { getVendorBySlugActive } from "@/lib/queries-active";
import { db } from "@/lib/db";
import { MenuExperience } from "@/components/customer/MenuExperience";
import { TenantThemeProvider } from "@/components/ui/TenantThemeProvider";
import { routing, type SupportedLocale } from "@/i18n/routing";
import { THEME_PRESETS, type ThemePreset } from "@/lib/design-tokens";
import { SuspendedTenantPage } from "@/components/customer/SuspendedTenantPage";
import { normalizeTablePublicId } from "@/lib/table-code";

export const dynamic = "force-dynamic";

async function resolveTableForVendor(
  vendorId: string,
  rawPublicId: string
): Promise<string | null> {
  const publicId = normalizeTablePublicId(rawPublicId);

  const table = await db.diningTable.findUnique({
    where: { publicId },
    select: { id: true, vendorId: true, code: true },
  });

  if (!table) return null;
  if (table.vendorId !== vendorId) return null;

  return table.code;
}

export default async function TableMenuPage({
  params,
}: {
  params: Promise<{
    locale: string;
    country: string;
    vendor: string;
    publicId: string;
  }>;
}) {
  const { locale, vendor: slug, publicId: rawPublicId } = await params;

  const suspendedCheck = await db.vendor.findUnique({
    where: { slug },
    select: { id: true, active: true },
  });

  if (!suspendedCheck) notFound();

  if (!suspendedCheck.active) {
    return <SuspendedTenantPage locale={locale} />;
  }

  const vendor = await getVendorBySlugActive(slug);
  if (!vendor) notFound();

  const resolvedLocale: SupportedLocale = routing.locales.includes(
    locale as SupportedLocale
  )
    ? (locale as SupportedLocale)
    : routing.defaultLocale;

  const vendorTheme = vendor.theme;
  const preset = THEME_PRESETS.includes(vendorTheme as ThemePreset)
    ? (vendorTheme as ThemePreset)
    : undefined;

  const tableCode = await resolveTableForVendor(vendor.id, rawPublicId);

  return (
    <TenantThemeProvider theme={{ preset }}>
      <MenuExperience
        vendor={vendor}
        initialLang={resolvedLocale}
        tableCode={tableCode}
      />
    </TenantThemeProvider>
  );
}

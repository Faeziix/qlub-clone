import { notFound } from "next/navigation";
import { getVendorBySlugActive } from "@/lib/queries-active";
import { db } from "@/lib/db";
import { MenuExperience } from "@/components/customer/MenuExperience";
import { TenantThemeProvider } from "@/components/ui/TenantThemeProvider";
import { routing, type SupportedLocale } from "@/i18n/routing";
import { THEME_PRESETS, type ThemePreset } from "@/lib/design-tokens";
import { SuspendedTenantPage } from "@/components/customer/SuspendedTenantPage";
import { resolveTableForVendor } from "@/lib/table-code";

export const dynamic = "force-dynamic";

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

  const tableCode = await resolveTableForVendor(
    vendor.id,
    rawPublicId,
    (publicId) =>
      db.diningTable.findUnique({
        where: { publicId },
        select: { vendorId: true, code: true },
      })
  );

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

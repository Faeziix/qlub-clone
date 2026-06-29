import { notFound } from "next/navigation";
import { getVendorBySlugActive } from "@/lib/queries-active";
import { db } from "@/lib/db";
import { MenuExperience } from "@/components/customer/MenuExperience";
import { TenantThemeProvider } from "@/components/ui/TenantThemeProvider";
import { routing, type SupportedLocale } from "@/i18n/routing";
import { THEME_PRESETS, type ThemePreset } from "@/lib/design-tokens";
import { SuspendedTenantPage } from "@/components/customer/SuspendedTenantPage";

export const dynamic = "force-dynamic";

export default async function VendorMenuPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; country: string; vendor: string }>;
  searchParams: Promise<{ theme?: string }>;
}) {
  const { locale, vendor: slug } = await params;
  const sp = await searchParams;

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

  const rawTheme = sp.theme ?? vendor.theme;
  const preset = THEME_PRESETS.includes(rawTheme as ThemePreset)
    ? (rawTheme as ThemePreset)
    : undefined;

  return (
    <TenantThemeProvider theme={{ preset }}>
      <MenuExperience
        vendor={vendor}
        initialLang={resolvedLocale}
        tableCode={null}
        tablePublicId={null}
      />
    </TenantThemeProvider>
  );
}

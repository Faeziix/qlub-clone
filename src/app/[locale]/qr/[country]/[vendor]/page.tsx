import { notFound } from "next/navigation";
import { getVendorBySlug } from "@/lib/queries";
import { MenuExperience } from "@/components/customer/MenuExperience";
import { TenantThemeProvider } from "@/components/ui/TenantThemeProvider";
import { routing, type SupportedLocale } from "@/i18n/routing";
import { THEME_PRESETS, type ThemePreset } from "@/lib/design-tokens";

export const dynamic = "force-dynamic";

export default async function VendorMenuPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; country: string; vendor: string }>;
  searchParams: Promise<{ theme?: string; table?: string }>;
}) {
  const { locale, vendor: slug } = await params;
  const sp = await searchParams;
  const vendor = await getVendorBySlug(slug);
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
        tableCode={sp.table ?? null}
      />
    </TenantThemeProvider>
  );
}

import { notFound } from "next/navigation";
import { getVendorBySlugActive } from "@/lib/queries-active";
import { db } from "@/lib/db";
import { verifyTableToken } from "@/lib/table-token";
import { MenuExperience } from "@/components/customer/MenuExperience";
import { TenantThemeProvider } from "@/components/ui/TenantThemeProvider";
import { routing, type SupportedLocale } from "@/i18n/routing";
import { THEME_PRESETS, type ThemePreset } from "@/lib/design-tokens";
import { SuspendedTenantPage } from "@/components/customer/SuspendedTenantPage";

export const dynamic = "force-dynamic";

/**
 * Validates the signed table token (`tt` search param) against the actual
 * vendor and table row. The table context is honored ONLY when a valid signed
 * token is present — a bare, guessable `?table=2` (no token, or a tampered /
 * foreign / expired one) resolves to null so table identity cannot be forged
 * by URL-guessing. Each table's QR therefore carries an unguessable signed
 * token unique to that table.
 *
 * A null result is not a hard 404 — it degrades gracefully to a browse-only
 * state (the customer can still see the menu, just without a bound table).
 */
async function resolveVerifiedTableCode(
  vendorId: string,
  tableCode: string | null,
  tableToken: string | null
): Promise<{ tableCode: string | null; tokenValid: boolean }> {
  if (!tableCode) {
    return { tableCode: null, tokenValid: false };
  }

  if (!tableToken) {
    return { tableCode: null, tokenValid: false };
  }

  const claims = await verifyTableToken(tableToken);
  if (!claims) {
    return { tableCode: null, tokenValid: false };
  }

  if (claims.vendorId !== vendorId) {
    return { tableCode: null, tokenValid: false };
  }

  const table = await db.diningTable.findUnique({
    where: { vendorId_code: { vendorId, code: tableCode } },
    select: { id: true },
  });

  if (!table || claims.tableId !== table.id) {
    return { tableCode: null, tokenValid: false };
  }

  return { tableCode, tokenValid: true };
}

export default async function VendorMenuPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; country: string; vendor: string }>;
  searchParams: Promise<{ theme?: string; table?: string; tt?: string }>;
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

  const { tableCode } = await resolveVerifiedTableCode(
    vendor.id,
    sp.table ?? null,
    sp.tt ?? null
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

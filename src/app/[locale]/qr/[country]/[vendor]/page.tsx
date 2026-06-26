import { notFound } from "next/navigation";
import { getVendorBySlug } from "@/lib/queries";
import { db } from "@/lib/db";
import { verifyTableToken } from "@/lib/table-token";
import { MenuExperience } from "@/components/customer/MenuExperience";
import { TenantThemeProvider } from "@/components/ui/TenantThemeProvider";
import { routing, type SupportedLocale } from "@/i18n/routing";
import { THEME_PRESETS, type ThemePreset } from "@/lib/design-tokens";

export const dynamic = "force-dynamic";

/**
 * Validates the signed table token (`tt` search param) against the actual
 * vendor and table row. Returns the verified table code, or null when:
 *   - no token was provided (legacy QR or direct link without a token)
 *   - the token is expired, malformed, or signed by a different key
 *   - the token's vendorId/tableId do not match the vendor slug + table code
 *     in the URL (cross-vendor or tampered token)
 *
 * A null result is not treated as a hard 404 — it degrades gracefully to
 * an unauthenticated browse-only state. Hard blocks on invalid tokens will
 * be added in the auth/OTP phase once guest identity is wired.
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
    return { tableCode, tokenValid: false };
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

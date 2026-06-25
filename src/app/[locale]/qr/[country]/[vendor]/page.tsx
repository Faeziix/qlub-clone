import { notFound } from "next/navigation";
import { getVendorBySlug } from "@/lib/queries";
import { MenuExperience } from "@/components/customer/MenuExperience";
import { routing, type SupportedLocale } from "@/i18n/routing";

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

  return (
    <MenuExperience
      vendor={vendor}
      initialTheme={sp.theme ?? vendor.theme}
      initialLang={resolvedLocale}
      tableCode={sp.table ?? null}
    />
  );
}

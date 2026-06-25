import { notFound } from "next/navigation";
import { getVendorBySlug } from "@/lib/queries";
import { MenuExperience } from "@/components/customer/MenuExperience";

export const dynamic = "force-dynamic";

export default async function VendorMenuPage({
  params,
  searchParams,
}: {
  params: Promise<{ country: string; vendor: string }>;
  searchParams: Promise<{ theme?: string; lang?: string; table?: string }>;
}) {
  const { vendor: slug } = await params;
  const sp = await searchParams;
  const vendor = await getVendorBySlug(slug);
  if (!vendor) notFound();

  return (
    <MenuExperience
      vendor={vendor}
      initialTheme={sp.theme ?? vendor.theme}
      initialLang={sp.lang ?? vendor.locale}
      tableCode={sp.table ?? null}
    />
  );
}

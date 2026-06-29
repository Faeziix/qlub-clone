import { db } from "@/lib/db";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireSession } from "@/app/[locale]/admin/actions";
import { PageHeader, Card } from "@/components/admin/ui";
import { Building2 } from "lucide-react";
import { SettingsForm } from "@/components/admin/settings/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const t = await getTranslations("admin.settings");
  const session = await requireSession();

  if (session.role === "superadmin") redirect("/admin/superadmin");
  if (!session.vendorId) redirect("/admin/login");

  const vendor = await db.vendor.findUnique({ where: { id: session.vendorId } });

  if (!vendor) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("pageTitle")} subtitle={t("pageSubtitle")} />
        <Card>
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
              <Building2 className="h-6 w-6" />
            </div>
            <p className="text-base font-semibold text-ink">{t("noVendor")}</p>
            <p className="max-w-sm text-sm text-muted">{t("noVendorHint")}</p>
          </div>
        </Card>
      </div>
    );
  }

  const tipPresets = Array.isArray(vendor.tipPresets)
    ? (vendor.tipPresets as number[])
    : [5, 10, 15];
  const supportedLangs = Array.isArray(vendor.supportedLangs)
    ? (vendor.supportedLangs as string[])
    : ["fa", "en"];

  const initial = {
    name: vendor.name ?? "",
    description: vendor.description ?? "",
    address: vendor.address ?? "",
    phone: vendor.phone ?? "",
    email: vendor.email ?? "",
    theme: vendor.theme ?? "darkgold",
    logoUrl: vendor.logoUrl ?? "",
    coverUrl: vendor.coverUrl ?? "",
    serviceChargePct: vendor.serviceChargePct ?? 0,
    taxPct: vendor.taxPct ?? 0,
    taxInclusive: vendor.taxInclusive ?? true,
    tippingEnabled: vendor.tippingEnabled ?? true,
    tipPresets: [
      tipPresets[0] ?? 10,
      tipPresets[1] ?? 15,
      tipPresets[2] ?? 20,
    ] as number[],
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("pageTitle")} subtitle={t("pageSubtitle")} />

      <SettingsForm
        vendorId={vendor.id}
        initial={initial}
        currency={vendor.currency ?? "IRR"}
        slug={vendor.slug}
        supportedLangs={supportedLangs}
        t={{
          profile: t("profile"),
          profileSubtitle: t("profileSubtitle"),
          branding: t("branding"),
          brandingSubtitle: t("brandingSubtitle"),
          billing: t("billing"),
          billingSubtitle: t("billingSubtitle"),
          tipping: t("tipping"),
          tippingSubtitle: t("tippingSubtitle"),
          name: t("name"),
          description: t("description"),
          address: t("address"),
          phone: t("phone"),
          email: t("email"),
          namePlaceholder: t("namePlaceholder"),
          emailPlaceholder: t("emailPlaceholder"),
          phonePlaceholder: t("phonePlaceholder"),
          addressPlaceholder: t("addressPlaceholder"),
          descriptionPlaceholder: t("descriptionPlaceholder"),
          theme: t("theme"),
          themeHint: t("themeHint"),
          logoUrl: t("logoUrl"),
          logoUrlHint: t("logoUrlHint"),
          coverUrl: t("coverUrl"),
          coverUrlHint: t("coverUrlHint"),
          logoPlaceholder: t("logoPlaceholder"),
          coverPlaceholder: t("coverPlaceholder"),
          supportedLanguages: t("supportedLanguages"),
          serviceCharge: t("serviceCharge"),
          taxPct: t("taxPct"),
          currency: t("currency"),
          currencyHint: t("currencyHint"),
          taxInclusive: t("taxInclusive"),
          taxInclusiveHint: t("taxInclusiveHint"),
          tippingEnabled: t("tippingEnabled"),
          tippingEnabledHint: t("tippingEnabledHint"),
          tipPresets: t("tipPresets"),
          tipPresetsHint: t("tipPresetsHint"),
          saveChanges: t("saveChanges"),
          saved: t("saved"),
          darkgold: t("darkgold"),
          classic: t("classic"),
          emerald: t("emerald"),
          rose: t("rose"),
          midnight: t("midnight"),
        }}
      />
    </div>
  );
}

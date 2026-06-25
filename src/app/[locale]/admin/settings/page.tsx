import { db } from "@/lib/db";
import { requireSession } from "@/app/[locale]/admin/actions";
import { PageHeader, Card } from "@/components/admin/ui";
import { Building2 } from "lucide-react";
import { SettingsForm } from "@/components/admin/settings/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSession();

  // Scope to the session's vendor. Superadmins (vendorId === null) edit the
  // first vendor, with a note indicating there are others.
  const vendor = session.vendorId
    ? await db.vendor.findUnique({ where: { id: session.vendorId } })
    : await db.vendor.findFirst({ orderBy: { createdAt: "asc" } });

  const totalVendors = session.vendorId ? 1 : await db.vendor.count();

  if (!vendor) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Settings"
          subtitle="Restaurant profile, branding, billing and tipping."
        />
        <Card>
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
              <Building2 className="h-6 w-6" />
            </div>
            <p className="text-base font-semibold text-ink">No vendor found</p>
            <p className="max-w-sm text-sm text-muted">
              There is no restaurant connected to your account yet. Create a
              vendor to configure its settings.
            </p>
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

  const isSuperadmin = session.vendorId === null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle={`Configure ${vendor.name}'s profile, branding, billing and tipping.`}
      />

      {isSuperadmin && totalVendors > 1 && (
        <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2 p-4 text-sm">
          <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <p className="text-muted">
            You are a superadmin. Showing the first of{" "}
            <span className="font-semibold text-ink">{totalVendors}</span>{" "}
            vendors —{" "}
            <span className="font-semibold text-ink">{vendor.name}</span>. Edits
            here apply only to this restaurant.
          </p>
        </div>
      )}

      <SettingsForm
        vendorId={vendor.id}
        initial={initial}
        currency={vendor.currency ?? "AED"}
        slug={vendor.slug}
        supportedLangs={supportedLangs}
      />
    </div>
  );
}

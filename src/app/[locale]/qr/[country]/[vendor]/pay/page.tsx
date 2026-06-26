import { notFound, redirect } from "next/navigation";
import { getOrder, getVendorBySlug } from "@/lib/queries";
import { PaymentFlow } from "@/components/customer/PaymentFlow";
import { TenantThemeProvider } from "@/components/ui/TenantThemeProvider";
import { THEME_PRESETS, type ThemePreset } from "@/lib/design-tokens";

export const dynamic = "force-dynamic";

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; country: string; vendor: string }>;
  searchParams: Promise<{ order?: string }>;
}) {
  const { locale, country, vendor: slug } = await params;
  const { order: orderId } = await searchParams;
  if (!orderId) redirect(`/qr/${country}/${slug}`);

  const [order, vendor] = await Promise.all([
    getOrder(orderId!),
    getVendorBySlug(slug),
  ]);
  if (!order || !vendor) notFound();

  const items = order.items.map((i) => ({
    id: i.id,
    name: i.name,
    quantity: i.quantity,
    lineTotal: i.lineTotal,
    modifiers: Array.isArray(i.modifiers)
      ? (i.modifiers as { optionName: string }[])
      : [],
  }));

  const preset = THEME_PRESETS.includes(vendor.theme as ThemePreset)
    ? (vendor.theme as ThemePreset)
    : undefined;

  return (
    <TenantThemeProvider theme={{ preset }}>
      <PaymentFlow
        lang={locale}
        vendorSlug={vendor.slug}
        vendorName={vendor.name}
        country={country}
        tippingEnabled={vendor.tippingEnabled}
        tipPresets={vendor.tipPresets}
        order={{
          id: order.id,
          orderNumber: order.orderNumber,
          subtotal: order.subtotal,
          serviceCharge: order.serviceCharge,
          tax: order.tax,
          total: order.total,
          amountPaid: order.amountPaid,
          tableLabel: order.table?.label ?? null,
          items,
        }}
      />
    </TenantThemeProvider>
  );
}

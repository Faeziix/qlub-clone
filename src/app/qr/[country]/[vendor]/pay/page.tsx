import { notFound, redirect } from "next/navigation";
import { getOrder, getVendorBySlug } from "@/lib/queries";
import { PaymentFlow } from "@/components/customer/PaymentFlow";
import { parseJSON } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ country: string; vendor: string }>;
  searchParams: Promise<{ order?: string; lang?: string }>;
}) {
  const { country, vendor: slug } = await params;
  const { order: orderId, lang } = await searchParams;
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
    modifiers: parseJSON<{ optionName: string }[]>(i.modifiers, []),
  }));

  return (
    <PaymentFlow
      lang={lang ?? vendor.locale}
      theme={vendor.theme}
      vendorSlug={vendor.slug}
      vendorName={vendor.name}
      country={country}
      currency={order.currency}
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
  );
}

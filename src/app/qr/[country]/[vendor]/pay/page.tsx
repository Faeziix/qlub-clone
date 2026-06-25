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
    lineTotal: Number(i.lineTotal),
    modifiers: parseJSON<{ optionName: string }[]>(i.modifiers as string | null, []),
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
        subtotal: Number(order.subtotal),
        serviceCharge: Number(order.serviceCharge),
        tax: Number(order.tax),
        total: Number(order.total),
        amountPaid: Number(order.amountPaid),
        tableLabel: order.table?.label ?? null,
        items,
      }}
    />
  );
}

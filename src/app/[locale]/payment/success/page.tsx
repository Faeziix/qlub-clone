import { notFound } from "next/navigation";
import { getOrder } from "@/lib/queries";
import { PaymentSuccessClient } from "./_components/PaymentSuccessClient";
import { THEME_PRESETS, type ThemePreset } from "@/lib/design-tokens";
import { TenantThemeProvider } from "@/components/ui/TenantThemeProvider";

export const dynamic = "force-dynamic";

export default async function PaymentSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ orderId?: string; paymentId?: string }>;
}) {
  const { locale } = await params;
  const { orderId, paymentId } = await searchParams;

  if (!orderId) notFound();

  const order = await getOrder(orderId);
  if (!order) notFound();

  const targetPayment = paymentId
    ? order.payments.find((p) => p.id === paymentId && p.status === "succeeded")
    : order.payments
        .filter((p) => p.status === "succeeded")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  const preset = THEME_PRESETS.includes(order.vendor.theme as ThemePreset)
    ? (order.vendor.theme as ThemePreset)
    : undefined;

  const isSplitPayment =
    targetPayment != null && targetPayment.amount + targetPayment.tipAmount < order.total;

  const receiptItems = order.items.map((item) => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    lineTotal: item.lineTotal,
  }));

  return (
    <TenantThemeProvider theme={{ preset }}>
      <PaymentSuccessClient
        lang={locale}
        orderNumber={order.orderNumber}
        total={order.total}
        subtotal={order.subtotal}
        tipAmount={order.tipAmount}
        serviceCharge={order.serviceCharge}
        tax={order.tax}
        items={receiptItems}
        vendorName={order.vendor.name}
        vendorSlug={order.vendor.slug}
        country={order.vendor.country}
        paymentId={targetPayment?.id ?? null}
        tippingEnabled={order.vendor.tippingEnabled}
        isSplitPayment={isSplitPayment}
        splitPaymentAmount={targetPayment?.amount ?? 0}
        splitPaymentTipAmount={targetPayment?.tipAmount ?? 0}
      />
    </TenantThemeProvider>
  );
}

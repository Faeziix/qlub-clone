/**
 * /payment/success — shown after the payment gateway callback confirms success.
 *
 * The gateway callback at /api/payments/callback redirects here after
 * server-side verification. The page fetches order data to display the receipt
 * and optionally lets the diner submit a review.
 */

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
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { locale } = await params;
  const { orderId } = await searchParams;

  if (!orderId) notFound();

  const order = await getOrder(orderId);
  if (!order) notFound();

  const succeededPayment = order.payments
    .filter((p) => p.status === "succeeded")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  const preset = THEME_PRESETS.includes(order.vendor.theme as ThemePreset)
    ? (order.vendor.theme as ThemePreset)
    : undefined;

  return (
    <TenantThemeProvider theme={{ preset }}>
      <PaymentSuccessClient
        lang={locale}
        orderNumber={order.orderNumber}
        total={order.total}
        vendorName={order.vendor.name}
        vendorSlug={order.vendor.slug}
        country={order.vendor.country}
        paymentId={succeededPayment?.id ?? null}
        tippingEnabled={order.vendor.tippingEnabled}
      />
    </TenantThemeProvider>
  );
}

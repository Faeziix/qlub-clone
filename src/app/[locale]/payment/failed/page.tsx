/**
 * /payment/failed — shown after gateway callback confirms failure or cancellation.
 *
 * Redirected here from /api/payments/callback when verify() returns failed.
 * Offers the diner a retry path back to the /pay screen.
 */

import { notFound } from "next/navigation";
import { getOrder } from "@/lib/queries";
import { PaymentFailedClient } from "./_components/PaymentFailedClient";
import { THEME_PRESETS, type ThemePreset } from "@/lib/design-tokens";
import { TenantThemeProvider } from "@/components/ui/TenantThemeProvider";

export const dynamic = "force-dynamic";

export default async function PaymentFailedPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ orderId?: string; reason?: string }>;
}) {
  const { locale } = await params;
  const { orderId, reason } = await searchParams;

  if (!orderId) {
    return (
      <PaymentFailedClient
        lang={locale}
        orderNumber={null}
        vendorSlug={null}
        country={null}
        orderId={null}
        reason={reason ?? null}
      />
    );
  }

  const order = await getOrder(orderId);
  if (!order) notFound();

  const preset = THEME_PRESETS.includes(order.vendor.theme as ThemePreset)
    ? (order.vendor.theme as ThemePreset)
    : undefined;

  return (
    <TenantThemeProvider theme={{ preset }}>
      <PaymentFailedClient
        lang={locale}
        orderNumber={order.orderNumber}
        vendorSlug={order.vendor.slug}
        country={order.vendor.country}
        orderId={orderId}
        reason={null}
      />
    </TenantThemeProvider>
  );
}

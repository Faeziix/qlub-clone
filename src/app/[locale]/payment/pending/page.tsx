/**
 * /payment/pending — shown when a payment callback fires concurrently.
 *
 * transitionToVerifying() returns 0 rows when another callback already claimed
 * the payment (the first-writer-wins pattern). The second callback redirects
 * here. The page polls the order until amountPaid > 0 or status='paid', then
 * redirects to /payment/success.
 *
 * Also shown for payments where verify() returned "pending" (bank processing).
 */

import { getOrder } from "@/lib/queries";
import { PaymentPendingClient } from "./_components/PaymentPendingClient";

export const dynamic = "force-dynamic";

export default async function PaymentPendingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { locale } = await params;
  const { orderId } = await searchParams;

  if (!orderId) {
    return (
      <PaymentPendingClient
        lang={locale}
        orderId=""
        vendorSlug={null}
        country={null}
      />
    );
  }

  const order = await getOrder(orderId);
  const vendorSlug = order?.vendor.slug ?? null;
  const country = order?.vendor.country ?? null;

  return (
    <PaymentPendingClient
      lang={locale}
      orderId={orderId}
      vendorSlug={vendorSlug}
      country={country}
    />
  );
}

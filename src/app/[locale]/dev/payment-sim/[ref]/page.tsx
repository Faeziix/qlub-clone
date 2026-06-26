/**
 * /dev/payment-sim/[ref]  — Simulated IPG gateway page (dev / sandbox only).
 *
 * Mimics the hosted-payment page a real Iranian IPG (درگاه پرداخت) would show.
 * The diner clicks "Pay" or "Cancel", which calls /api/dev/simulate-payment,
 * which marks the session and redirects to the payment callback — running the
 * full verify → state-machine → success/failed redirect path.
 *
 * This page renders 404 in production (NODE_ENV=production).
 */

import { notFound } from "next/navigation";
import { getPaymentProvider } from "@/lib/payment/factory";
import { SimulatedPaymentAdapter } from "@/lib/payment/adapters/simulated";
import { formatRialAsTomanPersian } from "@/lib/toman-formatter";

export const dynamic = "force-dynamic";

const UI = {
  devBadge: "⚠ Simulated Gateway — dev only",
  gatewayTitle: "Shaparak Test Gateway",
  gatewayTitleFa: "درگاه آزمایشی شاپرک",
  amountLabel: "مبلغ قابل پرداخت",
  payBtn: "✓ پرداخت موفق (Simulate success)",
  cancelBtn: "✗ انصراف (Simulate cancel)",
  devNote: "This page only appears in dev/sandbox mode. It will not exist in production.",
  sessionMissing:
    "Session not found. The server may have restarted — please retry the payment.",
};

export default async function SimulatedGatewayPage({
  params,
}: {
  params: Promise<{ locale: string; ref: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { ref } = await params;

  const provider = getPaymentProvider();
  if (!(provider instanceof SimulatedPaymentAdapter)) notFound();

  const session = provider.getSessionSummary(ref);
  if (!session) {
    return (
      <GatewayShell>
        <p className="text-center text-red-600 font-semibold">{UI.sessionMissing}</p>
      </GatewayShell>
    );
  }

  const amountDisplay = formatRialAsTomanPersian(session.amount);
  const refLabel = `ref: ${ref}`;

  return (
    <GatewayShell>
      <div className="space-y-6 text-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-amber-600">
            {UI.devBadge}
          </p>
          <h1 className="mt-3 text-2xl font-extrabold">{UI.gatewayTitle}</h1>
          <p className="mt-1 text-sm text-gray-500">{UI.gatewayTitleFa}</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-gray-50 px-6 py-5">
          <p className="text-sm text-gray-500">{UI.amountLabel}</p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums" dir="rtl">
            {amountDisplay}
          </p>
          <p className="mt-1 text-xs text-gray-400 font-mono">{refLabel}</p>
        </div>

        <div className="space-y-3">
          <a
            href={`/api/dev/simulate-payment?ref=${encodeURIComponent(ref)}&action=paid`}
            className="block w-full rounded-2xl bg-green-600 px-6 py-4 text-center text-base font-bold text-white shadow hover:bg-green-700 active:scale-95 transition-transform"
          >
            {UI.payBtn}
          </a>
          <a
            href={`/api/dev/simulate-payment?ref=${encodeURIComponent(ref)}&action=cancelled`}
            className="block w-full rounded-2xl border border-gray-300 px-6 py-4 text-center text-base font-semibold text-gray-700 hover:bg-gray-100 active:scale-95 transition-transform"
          >
            {UI.cancelBtn}
          </a>
        </div>

        <p className="text-xs text-gray-400">{UI.devNote}</p>
      </div>
    </GatewayShell>
  );
}

function GatewayShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-xl p-8">
        {children}
      </div>
    </div>
  );
}

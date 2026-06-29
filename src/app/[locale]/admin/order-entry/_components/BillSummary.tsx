"use client";

import { formatRialAsTomanPersian, formatRialAsTomanLatin } from "@/lib/toman-formatter";

interface BillSummaryProps {
  subtotalRial: bigint;
  serviceChargeRial: bigint;
  taxRial: bigint;
  totalRial: bigint;
  locale: string;
  t: {
    runningBill: string;
    subtotal: string;
    serviceCharge: string;
    tax: string;
    total: string;
  };
}

export function BillSummary({
  subtotalRial,
  serviceChargeRial,
  taxRial,
  totalRial,
  locale,
  t,
}: BillSummaryProps) {
  const fmt = (rial: bigint) =>
    locale === "fa" ? formatRialAsTomanPersian(rial) : formatRialAsTomanLatin(rial);

  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4">
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">{t.runningBill}</p>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">{t.subtotal}</dt>
          <dd className="tabular-nums">{fmt(subtotalRial)}</dd>
        </div>
        {serviceChargeRial > 0n && (
          <div className="flex justify-between">
            <dt className="text-muted">{t.serviceCharge}</dt>
            <dd className="tabular-nums">{fmt(serviceChargeRial)}</dd>
          </div>
        )}
        {taxRial > 0n && (
          <div className="flex justify-between">
            <dt className="text-muted">{t.tax}</dt>
            <dd className="tabular-nums">{fmt(taxRial)}</dd>
          </div>
        )}
        <div className="flex justify-between border-t border-line pt-2 font-extrabold">
          <dt>{t.total}</dt>
          <dd className="text-brand tabular-nums">{fmt(totalRial)}</dd>
        </div>
      </dl>
    </div>
  );
}

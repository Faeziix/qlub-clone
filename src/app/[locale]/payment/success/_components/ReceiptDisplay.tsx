"use client";

import * as React from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { makeT } from "@/lib/i18n";
import { formatRialAsTomanPersian, formatRialAsTomanLatin } from "@/lib/toman-formatter";

interface ReceiptItem {
  id: string;
  name: string;
  quantity: number;
  lineTotal: number;
}

interface ReceiptDisplayProps {
  lang: string;
  dir: "ltr" | "rtl";
  orderNumber: string;
  total: number;
  subtotal: number;
  tipAmount: number;
  serviceCharge: number;
  tax: number;
  items: ReceiptItem[];
  vendorName: string;
  paymentId: string | null;
  tippingEnabled: boolean;
  onRateExperience: () => void;
  onBackToMenu: () => void;
}

function formatMoney(rialAmount: number, lang: string): string {
  const rial = BigInt(Math.round(rialAmount));
  return lang === "fa" ? formatRialAsTomanPersian(rial) : `${formatRialAsTomanLatin(rial)} T`;
}

export function ReceiptDisplay({
  lang,
  dir,
  orderNumber,
  total,
  subtotal,
  tipAmount,
  serviceCharge,
  tax,
  items,
  vendorName,
  paymentId,
  tippingEnabled,
  onRateExperience,
  onBackToMenu,
}: ReceiptDisplayProps) {
  const t = makeT(lang);
  const showTip = tippingEnabled && tipAmount > 0;
  const showServiceCharge = serviceCharge > 0;
  const showTax = tax > 0;
  const hasExtras = showTip || showServiceCharge || showTax;

  return (
    <div dir={dir} className="min-h-screen bg-bg">
      <div className="mx-auto max-w-app px-4 pb-10 pt-8">
        <div className="animate-fade-in">
          <div className="mb-6 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success/15 text-success">
              <CheckCircle2 size={36} strokeWidth={2} />
            </div>
            <h1 className="mt-4 text-2xl font-extrabold text-ink">{t("paymentSuccess")}</h1>
            <p className="mt-1 text-sm text-muted">{t("paymentSuccessBody")}</p>
          </div>

          <ReceiptCard
            lang={lang}
            dir={dir}
            orderNumber={orderNumber}
            vendorName={vendorName}
            items={items}
            subtotal={subtotal}
            tipAmount={tipAmount}
            serviceCharge={serviceCharge}
            tax={tax}
            total={total}
            hasExtras={hasExtras}
            showTip={showTip}
            showServiceCharge={showServiceCharge}
            showTax={showTax}
            t={t}
            formatMoney={(v) => formatMoney(v, lang)}
          />

          <div className="mt-6 space-y-3">
            {paymentId && (
              <Button
                fullWidth
                size="lg"
                variant="primary"
                onClick={onRateExperience}
              >
                <Sparkles size={18} />
                {t("rateExperience")}
              </Button>
            )}
            <Button fullWidth size="lg" variant="ghost" onClick={onBackToMenu}>
              {t("backToMenu")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReceiptCard({
  lang,
  dir,
  orderNumber,
  vendorName,
  items,
  subtotal,
  tipAmount,
  serviceCharge,
  tax,
  total,
  hasExtras,
  showTip,
  showServiceCharge,
  showTax,
  t,
  formatMoney,
}: {
  lang: string;
  dir: "ltr" | "rtl";
  orderNumber: string;
  vendorName: string;
  items: ReceiptItem[];
  subtotal: number;
  tipAmount: number;
  serviceCharge: number;
  tax: number;
  total: number;
  hasExtras: boolean;
  showTip: boolean;
  showServiceCharge: boolean;
  showTax: boolean;
  t: (k: string) => string;
  formatMoney: (v: number) => string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface shadow-card">
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              {t("receipt")}
            </p>
            <p className="mt-0.5 text-base font-bold text-ink" dir="ltr">
              #{orderNumber}
            </p>
          </div>
          <div className={dir === "rtl" ? "text-start" : "text-end"}>
            <p className="text-xs text-muted">{t("paidWith")}</p>
            <p className="mt-0.5 text-sm font-semibold text-success">{t("paymentSuccess")}</p>
          </div>
        </div>

        <p className="mt-2 text-sm font-medium text-muted">{vendorName}</p>
      </div>

      <div className="border-t border-dashed border-line" />

      <div className="px-5 py-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
          {t("orderSummary")}
        </p>
        <div className="space-y-2">
          {items.map((item) => (
            <ReceiptLineItem
              key={item.id}
              lang={lang}
              name={item.name}
              quantity={item.quantity}
              lineTotal={item.lineTotal}
              formatMoney={formatMoney}
            />
          ))}
        </div>
      </div>

      {hasExtras && (
        <>
          <div className="border-t border-dashed border-line" />
          <div className="px-5 py-3 space-y-1.5">
            <TotalRow label={t("subtotal")} value={formatMoney(subtotal)} />
            {showServiceCharge && (
              <TotalRow label={t("serviceCharge")} value={formatMoney(serviceCharge)} />
            )}
            {showTax && (
              <TotalRow label={t("tax")} value={formatMoney(tax)} />
            )}
            {showTip && (
              <TotalRow label={t("tip")} value={formatMoney(tipAmount)} />
            )}
          </div>
        </>
      )}

      <div className="border-t border-line" />
      <div className="px-5 py-4">
        <TotalRow
          label={t("total")}
          value={formatMoney(total)}
          bold
        />
      </div>
    </div>
  );
}

function ReceiptLineItem({
  lang,
  name,
  quantity,
  lineTotal,
  formatMoney,
}: {
  lang: string;
  name: string;
  quantity: number;
  lineTotal: number;
  formatMoney: (v: number) => string;
}) {
  const qty = lang === "fa" ? toFarsiDigits(String(quantity)) : String(quantity);

  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 flex-1 truncate text-sm text-ink">
        {quantity > 1 && (
          <span className="me-1.5 text-xs font-semibold text-muted tabular-nums">
            {qty}×
          </span>
        )}
        {name}
      </span>
      <span className="shrink-0 text-sm tabular-nums text-ink">{formatMoney(lineTotal)}</span>
    </div>
  );
}

function TotalRow({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={bold ? "text-base font-bold text-ink" : "text-sm text-muted"}>
        {label}
      </span>
      <span
        className={
          bold
            ? "text-lg font-extrabold tabular-nums text-ink"
            : "text-sm tabular-nums text-muted"
        }
      >
        {value}
      </span>
    </div>
  );
}

function toFarsiDigits(s: string): string {
  return s.replace(/\d/g, (d) => String.fromCharCode(0x06f0 + Number(d)));
}

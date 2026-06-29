"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChefHat,
  CheckCircle2,
  Clock,
  Utensils,
  XCircle,
  CreditCard,
} from "lucide-react";
import axios from "axios";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { makeT, dirFor } from "@/lib/i18n";
import { formatRialAsTomanPersian, formatRialAsTomanLatin } from "@/lib/toman-formatter";
import type { CustomerOrderSnapshot, CustomerOrderItem, OrderStatus } from "@/lib/types";

const POLL_INTERVAL_MS = 10_000;
const OPEN_STATUSES = new Set(["open", "placed", "preparing", "ready", "served"]);
const STATUS_STEPS = ["placed", "preparing", "ready", "served"] as const;

function rialDisplay(amountStr: string, lang: string): string {
  const r = BigInt(amountStr);
  return lang === "fa" ? formatRialAsTomanPersian(r) : formatRialAsTomanLatin(r);
}

function statusLabel(status: OrderStatus, t: (k: string) => string): string {
  const map: Record<OrderStatus, string> = {
    open: t("orderStatusOpen"),
    placed: t("orderStatusPlaced"),
    preparing: t("orderStatusPreparing"),
    ready: t("orderStatusReady"),
    served: t("orderStatusServed"),
    paid: t("orderStatusPaid"),
    cancelled: t("orderStatusCancelled"),
  };
  return map[status] ?? status;
}

function StatusIndicator({
  status,
  t,
}: {
  status: OrderStatus;
  t: (k: string) => string;
}) {
  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-2 text-danger">
        <XCircle size={18} aria-hidden />
        <span className="font-semibold text-sm">{t("orderStatusCancelled")}</span>
      </div>
    );
  }

  if (status === "paid") {
    return (
      <div className="flex items-center gap-2 text-success">
        <CheckCircle2 size={18} aria-hidden />
        <span className="font-semibold text-sm">{t("orderStatusPaid")}</span>
      </div>
    );
  }

  const currentStep = STATUS_STEPS.indexOf(
    status === "open" ? "placed" : (status as (typeof STATUS_STEPS)[number])
  );

  const StepIcon = [Clock, ChefHat, Utensils, CheckCircle2][currentStep] ?? Clock;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-brand">
        <StepIcon size={18} aria-hidden />
        <span className="font-semibold text-sm">{statusLabel(status, t)}</span>
      </div>
      <div className="flex gap-1.5">
        {STATUS_STEPS.map((step, idx) => (
          <div
            key={step}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-all duration-500",
              idx <= currentStep ? "bg-brand" : "bg-line"
            )}
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}

function OrderItemRow({ item, lang }: { item: CustomerOrderItem; lang: string }) {
  const lineTotalRial = BigInt(item.lineTotal);
  const display =
    lang === "fa"
      ? formatRialAsTomanPersian(lineTotalRial)
      : formatRialAsTomanLatin(lineTotalRial);

  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-brand min-w-[1.5rem]">
            ×{item.quantity}
          </span>
          <span className="text-sm font-medium truncate">{item.name}</span>
        </div>
        {item.modifiers.length > 0 && (
          <p className="mt-0.5 text-xs text-muted truncate">
            {item.modifiers.map((m) => m.optionName).join("، ")}
          </p>
        )}
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums" dir="rtl">
        {display}
      </span>
    </div>
  );
}

function BillSummaryRow({
  label,
  valueStr,
  lang,
  bold = false,
  muted = false,
}: {
  label: string;
  valueStr: string;
  lang: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={cn(muted && "text-muted", bold && "font-bold")}>{label}</span>
      <span
        className={cn("tabular-nums", muted && "text-muted", bold && "font-bold")}
        dir="rtl"
      >
        {rialDisplay(valueStr, lang)}
      </span>
    </div>
  );
}

interface MyOrderSheetProps {
  open: boolean;
  onClose: () => void;
  vendorSlug: string;
  country: string;
  lang: string;
  order: CustomerOrderSnapshot;
  onOrderRefreshed: (updated: CustomerOrderSnapshot) => void;
  onStatusCleared: () => void;
}

export function MyOrderSheet({
  open,
  onClose,
  vendorSlug,
  country,
  lang,
  order,
  onOrderRefreshed,
  onStatusCleared,
}: MyOrderSheetProps) {
  const t = makeT(lang);
  const dir = dirFor(lang);
  const router = useRouter();

  React.useEffect(() => {
    if (!open || !OPEN_STATUSES.has(order.status)) return;
    const timer = setInterval(async () => {
      try {
        const { data } = await axios.get<CustomerOrderSnapshot>(`/api/orders/${order.id}`);
        onOrderRefreshed(data);
        if (data.status === "paid" || data.status === "cancelled") {
          onStatusCleared();
        }
      } catch {
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [open, order.id, order.status, onOrderRefreshed, onStatusCleared]);

  const remaining = BigInt(order.total) - BigInt(order.amountPaid);
  const isFullyPaid = remaining <= 0n;
  const isTerminal = order.status === "paid" || order.status === "cancelled";

  function handlePayNow() {
    router.push(`/qr/${country}/${vendorSlug}/pay?order=${order.id}&lang=${lang}`);
    onClose();
  }

  const hasServiceOrTax =
    BigInt(order.serviceCharge) > 0n || BigInt(order.tax) > 0n;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("myOrderTitle")}
      dir={dir}
      height="tall"
      closeLabel={t("close")}
    >
      <div className="flex h-full flex-col" dir={dir}>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pt-1 pb-4 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted">{t("orderNumber")}</p>
              <p className="font-extrabold text-lg tracking-tight">
                {order.orderNumber}
              </p>
            </div>
            {order.tableLabel && (
              <div className="text-end">
                <p className="text-xs text-muted">{t("table")}</p>
                <p className="font-semibold text-sm">{order.tableLabel}</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-surface-2 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
              {t("orderStatus")}
            </p>
            <StatusIndicator status={order.status} t={t} />
          </div>

          <div className="rounded-2xl bg-surface-2 px-4 py-2 divide-y divide-line">
            {order.items.map((item) => (
              <OrderItemRow key={item.id} item={item} lang={lang} />
            ))}
          </div>

          <div className="rounded-2xl bg-surface-2 px-4 py-3 space-y-2">
            {hasServiceOrTax && (
              <>
                <BillSummaryRow
                  label={t("subtotal")}
                  valueStr={order.subtotal}
                  lang={lang}
                  muted
                />
                {BigInt(order.serviceCharge) > 0n && (
                  <BillSummaryRow
                    label={t("serviceCharge")}
                    valueStr={order.serviceCharge}
                    lang={lang}
                    muted
                  />
                )}
                {BigInt(order.tax) > 0n && (
                  <BillSummaryRow
                    label={t("tax")}
                    valueStr={order.tax}
                    lang={lang}
                    muted
                  />
                )}
                {BigInt(order.tipAmount) > 0n && (
                  <BillSummaryRow
                    label={t("tip")}
                    valueStr={order.tipAmount}
                    lang={lang}
                    muted
                  />
                )}
                <div className="border-t border-line" />
              </>
            )}
            <BillSummaryRow
              label={t("total")}
              valueStr={order.total}
              lang={lang}
              bold
            />
            {BigInt(order.amountPaid) > 0n && !isFullyPaid && (
              <>
                <BillSummaryRow
                  label={t("paid")}
                  valueStr={order.amountPaid}
                  lang={lang}
                  muted
                />
                <BillSummaryRow
                  label={t("remaining")}
                  valueStr={remaining.toString()}
                  lang={lang}
                  bold
                />
              </>
            )}
          </div>
        </div>

        {!isTerminal && !isFullyPaid && (
          <div className="shrink-0 border-t border-line bg-surface px-5 py-4 pb-4 safe-bottom">
            <Button
              fullWidth
              size="lg"
              variant="cta"
              onClick={handlePayNow}
              className="justify-between px-5"
            >
              <div className="flex items-center gap-2">
                <CreditCard size={18} aria-hidden />
                <span>{t("payBill")}</span>
              </div>
              <span className="tabular-nums" dir="rtl">
                {rialDisplay(remaining.toString(), lang)}
              </span>
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

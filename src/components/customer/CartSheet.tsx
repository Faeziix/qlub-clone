"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2, ShoppingBag, AlertTriangle } from "lucide-react";
import type { VendorWithMenus } from "@/lib/queries";
import { useCart } from "@/lib/store/cart";
import { makeT } from "@/lib/i18n";
import { formatAmount } from "@/lib/utils";
import { computeBill, lineTotal } from "@/lib/pricing";
import { bigintToJson } from "@/lib/money";
import axios from "axios";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { EmptyState } from "@/components/ui/EmptyState";

export function CartSheet({
  open,
  onClose,
  vendor,
  lang,
  tableCode,
}: {
  open: boolean;
  onClose: () => void;
  vendor: VendorWithMenus;
  lang: string;
  tableCode: string | null;
}) {
  const t = makeT(lang);
  const router = useRouter();
  const { lines, setQty, removeLine } = useCart();
  const [placing, setPlacing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = React.useState<string | null>(null);
  const [showPriceChangedNotice, setShowPriceChangedNotice] = React.useState(false);

  const bill = computeBill(lines, {
    serviceChargePct: vendor.serviceChargePct,
    taxPct: vendor.taxPct,
    taxInclusive: vendor.taxInclusive,
  });

  function navigateToPayment(orderId: string) {
    onClose();
    router.push(
      `/qr/${vendor.country}/${vendor.slug}/pay?order=${orderId}&lang=${lang}`
    );
  }

  async function placeOrder() {
    setPlacing(true);
    setError(null);
    try {
      const serializedLines = lines.map((l) => ({
        ...l,
        unitPrice: bigintToJson(l.unitPrice),
        modifiers: l.modifiers.map((m) => ({
          ...m,
          priceDelta: bigintToJson(m.priceDelta),
        })),
      }));
      const { data } = await axios.post<{ ok: boolean; order: { id: string }; priceChanged: boolean; error?: string }>(
        "/api/orders",
        {
          vendorSlug: vendor.slug,
          tableCode,
          type: tableCode ? "dinein" : "qsr",
          lines: serializedLines,
        }
      );
      if (!data.ok) throw new Error(data.error ?? t("orderFailed"));
      if (data.priceChanged) {
        setPendingOrderId(data.order.id);
        setShowPriceChangedNotice(true);
      } else {
        navigateToPayment(data.order.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("orderFailed"));
    } finally {
      setPlacing(false);
    }
  }

  if (showPriceChangedNotice && pendingOrderId) {
    return (
      <Sheet open={open} onClose={onClose} title={t("priceUpdated")} height="tall">
        <div className="flex h-full flex-col items-center justify-center gap-6 px-6 py-10 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-warning/15 text-warning">
            <AlertTriangle size={32} />
          </div>
          <div>
            <h2 className="text-lg font-extrabold">{t("priceUpdated")}</h2>
            <p className="mt-2 text-sm text-muted">{t("priceUpdatedHint")}</p>
          </div>
          <div className="w-full space-y-3">
            <Button
              fullWidth
              size="lg"
              onClick={() => navigateToPayment(pendingOrderId)}
            >
              {t("confirmAndPay")}
            </Button>
            <Button
              fullWidth
              variant="ghost"
              onClick={() => {
                setShowPriceChangedNotice(false);
                setPendingOrderId(null);
              }}
            >
              {t("goBack")}
            </Button>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("yourOrder")} height="tall">
      {lines.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag size={28} />}
          title={t("empty")}
          description={t("emptyHint")}
          action={
            <Button variant="secondary" onClick={onClose}>
              {t("browseMenu")}
            </Button>
          }
        />
      ) : (
        <div className="flex h-full flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-2">
            <div className="space-y-3">
              {lines.map((l) => (
                <div
                  key={l.lineId}
                  className="rounded-2xl border border-line bg-surface p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold">{l.name}</p>
                      {l.modifiers.length > 0 && (
                        <p className="mt-0.5 text-xs text-muted">
                          {l.modifiers.map((m) => m.optionName).join(", ")}
                        </p>
                      )}
                      {l.notes && (
                        <p className="mt-0.5 text-xs italic text-muted">
                          &quot;{l.notes}&quot;
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => removeLine(l.lineId)}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:text-danger"
                      aria-label={t("remove")}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <QuantityStepper
                      size="sm"
                      value={l.quantity}
                      onChange={(q) => setQty(l.lineId, q)}
                      min={0}
                      decreaseLabel={t("decreaseQty")}
                      increaseLabel={t("increaseQty")}
                    />
                    <span className="font-bold">
                      {vendor.currency} {formatAmount(lineTotal(l))}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 space-y-2 rounded-2xl bg-surface-2 p-4 text-sm">
              <Row label={t("subtotal")} value={bill.subtotal} c={vendor.currency} />
              {bill.serviceCharge > 0n && (
                <Row
                  label={`${t("serviceCharge")} (${vendor.serviceChargePct}%)`}
                  value={bill.serviceCharge}
                  c={vendor.currency}
                />
              )}
              {bill.tax > 0n && (
                <Row
                  label={`${t("tax")} ${vendor.taxInclusive ? "(incl.)" : ""}`}
                  value={bill.tax}
                  c={vendor.currency}
                />
              )}
              <div className="my-1 border-t border-line" />
              <div className="flex items-center justify-between text-base font-extrabold">
                <span>{t("total")}</span>
                <span>
                  {vendor.currency} {formatAmount(bill.total)}
                </span>
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-line bg-surface p-4 safe-bottom">
            {error && (
              <p className="mb-2 text-center text-sm text-danger">{error}</p>
            )}
            <Button
              fullWidth
              size="lg"
              loading={placing}
              onClick={placeOrder}
            >
              {t("placeOrder")} · {vendor.currency} {formatAmount(bill.total)}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function Row({
  label,
  value,
  c,
}: {
  label: string;
  value: bigint;
  c: string;
}) {
  return (
    <div className="flex items-center justify-between text-muted">
      <span>{label}</span>
      <span className="font-semibold text-ink">
        {c} {formatAmount(value)}
      </span>
    </div>
  );
}

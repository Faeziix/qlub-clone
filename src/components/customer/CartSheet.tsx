"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2, ShoppingBag, AlertTriangle } from "lucide-react";
import type { VendorWithMenus } from "@/lib/queries";
import { useCart } from "@/lib/store/cart";
import { makeT } from "@/lib/i18n";
import { computeBill, lineTotal } from "@/lib/pricing";
import { formatRialAsToman } from "@/lib/money";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { EmptyState } from "@/components/ui/EmptyState";
import type { PriceChangeNotice } from "@/lib/orders";

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
  const [priceChanges, setPriceChanges] = React.useState<PriceChangeNotice[]>([]);
  const [pendingOrderId, setPendingOrderId] = React.useState<string | null>(null);

  const bill = computeBill(lines, {
    serviceChargePct: vendor.serviceChargePct,
    taxPct: vendor.taxPct,
    taxInclusive: vendor.taxInclusive,
  });

  async function placeOrder() {
    setPlacing(true);
    setError(null);
    setPriceChanges([]);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vendorSlug: vendor.slug,
          tableCode,
          type: tableCode ? "dinein" : "qsr",
          lines,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Failed to place order");

      if (data.priceChanges && data.priceChanges.length > 0) {
        setPriceChanges(data.priceChanges);
        setPendingOrderId(data.order.id);
        return;
      }

      onClose();
      router.push(
        `/qr/${vendor.country}/${vendor.slug}/pay?order=${data.order.id}&lang=${lang}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPlacing(false);
    }
  }

  function confirmWithUpdatedPrices() {
    if (!pendingOrderId) return;
    onClose();
    router.push(
      `/qr/${vendor.country}/${vendor.slug}/pay?order=${pendingOrderId}&lang=${lang}`
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
          {priceChanges.length > 0 ? (
            <PriceChangedNotice
              changes={priceChanges}
              onConfirm={confirmWithUpdatedPrices}
              onCancel={() => {
                setPriceChanges([]);
                setPendingOrderId(null);
              }}
            />
          ) : (
            <>
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
                              &ldquo;{l.notes}&rdquo;
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => removeLine(l.lineId)}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:text-danger"
                          aria-label="Remove"
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
                        />
                        <span className="font-bold">
                          {vendor.currency} {formatRialAsToman(lineTotal(l))}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 space-y-2 rounded-2xl bg-surface-2 p-4 text-sm">
                  <Row label={t("subtotal")} value={bill.subtotal} c={vendor.currency} />
                  {bill.serviceCharge > 0 && (
                    <Row
                      label={`${t("serviceCharge")} (${vendor.serviceChargePct}%)`}
                      value={bill.serviceCharge}
                      c={vendor.currency}
                    />
                  )}
                  {bill.tax > 0 && (
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
                      {vendor.currency} {formatRialAsToman(bill.total)}
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
                  {t("placeOrder")} · {vendor.currency} {formatRialAsToman(bill.total)}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

function PriceChangedNotice({
  changes,
  onConfirm,
  onCancel,
}: {
  changes: PriceChangeNotice[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-warning-soft text-warning">
        <AlertTriangle size={32} />
      </div>
      <div>
        <h3 className="text-lg font-bold">قیمت‌ها تغییر کرده‌اند</h3>
        <p className="mt-1 text-sm text-muted">
          برخی از قیمت‌ها از زمان مشاهده منو به‌روزرسانی شده‌اند. سفارش با
          قیمت‌های جدید ثبت شده است.
        </p>
      </div>
      <div className="w-full space-y-2 rounded-2xl bg-surface-2 p-4 text-sm text-start">
        {changes.map((ch, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <span className="text-muted text-xs">
              {ch.optionId
                ? ch.optionName ?? `گزینه ${ch.optionId}`
                : ch.itemName ?? `آیتم ${ch.itemId}`}
            </span>
            <span className="text-danger line-through">
              {formatRialAsToman(BigInt(String(ch.cartPrice)))} تومان
            </span>
            <span className="font-semibold">
              {formatRialAsToman(BigInt(String(ch.currentPrice)))} تومان
            </span>
          </div>
        ))}
      </div>
      <div className="flex w-full gap-3">
        <Button variant="secondary" fullWidth onClick={onCancel}>
          لغو
        </Button>
        <Button fullWidth onClick={onConfirm}>
          تأیید و ادامه
        </Button>
      </div>
    </div>
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
        {c} {formatRialAsToman(value)}
      </span>
    </div>
  );
}

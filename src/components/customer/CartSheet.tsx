"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag, AlertTriangle } from "lucide-react";
import type { VendorWithMenus } from "@/lib/queries";
import { useCart } from "@/lib/store/cart";
import { makeT } from "@/lib/i18n";
import { computeBill } from "@/lib/pricing";
import { bigintToJson } from "@/lib/money";
import axios from "axios";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { MoneyText } from "@/components/ui/MoneyText";
import { EmptyState } from "@/components/ui/EmptyState";
import { CartLineItem } from "./_components/CartLineItem";

interface ActiveOrderRef {
  id: string;
  orderNumber: string;
}

export function CartSheet({
  open,
  onClose,
  vendor,
  lang,
  tableCode,
  activeOrder,
  onOrderPlaced,
}: {
  open: boolean;
  onClose: () => void;
  vendor: VendorWithMenus;
  lang: string;
  tableCode: string | null;
  activeOrder: ActiveOrderRef | null;
  onOrderPlaced: (orderId: string) => void;
}) {
  const t = makeT(lang);
  const router = useRouter();
  const { lines, setQty, removeLine, clear } = useCart();
  const [placing, setPlacing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = React.useState<string | null>(null);
  const [showPriceChangedNotice, setShowPriceChangedNotice] = React.useState(false);
  const [showNewOrderConfirm, setShowNewOrderConfirm] = React.useState(false);

  const bill = computeBill(lines, {
    serviceChargePct: vendor.serviceChargePct,
    taxPct: vendor.taxPct,
    taxInclusive: vendor.taxInclusive,
  });

  function navigateToPayment(orderId: string) {
    clear();
    onClose();
    router.push(
      `/qr/${vendor.country}/${vendor.slug}/pay?order=${orderId}&lang=${lang}`
    );
  }

  function serializeLines() {
    return lines.map((l) => ({
      ...l,
      unitPrice: bigintToJson(l.unitPrice),
      modifiers: l.modifiers.map((m) => ({
        ...m,
        priceDelta: bigintToJson(m.priceDelta),
      })),
    }));
  }

  async function placeNewOrder() {
    setPlacing(true);
    setError(null);
    setShowNewOrderConfirm(false);
    try {
      const { data } = await axios.post<{
        ok: boolean;
        order: { id: string };
        priceChanged: boolean;
        error?: string;
      }>("/api/orders", {
        vendorSlug: vendor.slug,
        tableCode,
        type: tableCode ? "dinein" : "qsr",
        lines: serializeLines(),
      });
      if (!data.ok) throw new Error(data.error ?? t("orderFailed"));
      onOrderPlaced(data.order.id);
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

  async function appendToExistingOrder() {
    if (!activeOrder) return;
    setPlacing(true);
    setError(null);
    try {
      const { data } = await axios.patch<{
        ok: boolean;
        order: { id: string };
        priceChanged: boolean;
        error?: string;
      }>(`/api/orders/${activeOrder.id}`, {
        vendorSlug: vendor.slug,
        lines: serializeLines(),
      });
      if (!data.ok) {
        const msg = data.error ?? t("appendFailed");
        if (msg.includes("payment is in progress")) throw new Error(t("appendBlocked"));
        if (msg.includes("cannot be modified")) throw new Error(t("appendTerminal"));
        throw new Error(msg);
      }
      if (data.priceChanged) {
        setPendingOrderId(activeOrder.id);
        setShowPriceChangedNotice(true);
      } else {
        clear();
        onClose();
        router.push(
          `/qr/${vendor.country}/${vendor.slug}/pay?order=${activeOrder.id}&lang=${lang}`
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("appendFailed"));
    } finally {
      setPlacing(false);
    }
  }

  function handlePrimaryAction() {
    if (activeOrder) {
      appendToExistingOrder();
    } else {
      placeNewOrder();
    }
  }

  if (showPriceChangedNotice && pendingOrderId) {
    return (
      <Sheet open={open} onClose={onClose} title={t("priceUpdated")} height="tall">
        <div className="flex h-full flex-col items-center justify-center gap-6 px-6 py-10 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-warning/15 text-warning">
            <AlertTriangle size={32} aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-extrabold">{t("priceUpdated")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {t("priceUpdatedHint")}
            </p>
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

  if (showNewOrderConfirm && activeOrder) {
    return (
      <Sheet open={open} onClose={() => setShowNewOrderConfirm(false)} title={t("confirmNewOrder")} height="tall">
        <div className="flex h-full flex-col items-center justify-center gap-6 px-6 py-10 text-center">
          <p className="text-sm leading-relaxed text-muted">
            {t("confirmNewOrderHint").replace("{orderNumber}", activeOrder.orderNumber)}
          </p>
          <div className="w-full space-y-3">
            <Button fullWidth size="lg" loading={placing} onClick={placeNewOrder}>
              {t("confirmNewOrder")}
            </Button>
            <Button
              fullWidth
              variant="ghost"
              onClick={() => setShowNewOrderConfirm(false)}
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
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-3 pt-1">
            <div className="space-y-2">
              {lines.map((l) => (
                <CartLineItem
                  key={l.lineId}
                  line={l}
                  onQtyChange={(q) => setQty(l.lineId, q)}
                  onRemove={() => removeLine(l.lineId)}
                  removeLabel={t("remove")}
                  decreaseLabel={t("decreaseQty")}
                  increaseLabel={t("increaseQty")}
                />
              ))}
            </div>

            <BillBreakdown bill={bill} vendor={vendor} t={t} />
          </div>

          <div className="shrink-0 border-t border-line bg-surface px-4 pb-4 pt-3 safe-bottom">
            {error && (
              <p className="mb-3 rounded-xl bg-danger/10 px-4 py-2.5 text-center text-sm font-medium text-danger">
                {error}
              </p>
            )}
            <Button
              fullWidth
              size="lg"
              loading={placing}
              onClick={handlePrimaryAction}
              className="justify-between px-5"
            >
              <span>
                {activeOrder
                  ? t("addToExistingOrder").replace("{orderNumber}", activeOrder.orderNumber)
                  : t("placeOrder")}
              </span>
              <MoneyText rial={bill.total} className="text-brand-fg" />
            </Button>
            {activeOrder && (
              <Button
                fullWidth
                variant="ghost"
                size="md"
                className="mt-2"
                onClick={() => setShowNewOrderConfirm(true)}
              >
                {t("newOrder")}
              </Button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

function BillBreakdown({
  bill,
  vendor,
  t,
}: {
  bill: ReturnType<typeof computeBill>;
  vendor: VendorWithMenus;
  t: (key: string) => string;
}) {
  const hasExtras = bill.serviceCharge > 0n || bill.tax > 0n;

  return (
    <div className="mt-4 rounded-2xl bg-surface-2 px-4 py-3 space-y-2 text-sm">
      {hasExtras && (
        <>
          <BillRow label={t("subtotal")} value={bill.subtotal} muted />
          {bill.serviceCharge > 0n && (
            <BillRow
              label={`${t("serviceCharge")} (${vendor.serviceChargePct}%)`}
              value={bill.serviceCharge}
              muted
            />
          )}
          {bill.tax > 0n && (
            <BillRow
              label={vendor.taxInclusive ? t("tax") : `${t("tax")} (${vendor.taxPct}%)`}
              value={bill.tax}
              muted
            />
          )}
          <div className="border-t border-line" />
        </>
      )}
      <div className="flex items-center justify-between">
        <span className="font-extrabold text-ink">{t("total")}</span>
        <MoneyText rial={bill.total} size="lg" />
      </div>
    </div>
  );
}

function BillRow({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: bigint;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-muted" : "text-ink"}>{label}</span>
      <MoneyText rial={value} muted={muted} size="sm" />
    </div>
  );
}

"use client";

import * as React from "react";
import {
  ChevronRight,
  Utensils,
  ShoppingBag,
  User,
  StickyNote,
  X,
  RefreshCw,
  Layers,
} from "lucide-react";
import { Card, StatusPill, EmptyRow } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { formatMoney, timeAgo, parseJSON, cn } from "@/lib/utils";
import { updateOrderStatus, cancelOrder } from "@/app/[locale]/admin/orders/actions";
import { useOrdersPolling } from "@/app/[locale]/admin/orders/_hooks/useOrdersPolling";

// --- Types -------------------------------------------------------------------

type OrderModifier = { name?: string; priceDelta?: string | number };

export interface BoardItem {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
  modifiers: string | null;
  notes: string | null;
  lineTotal: number;
}

export interface BoardPayment {
  id: string;
  amount: number;
  tipAmount: number;
  total: number;
  method: string;
  status: string;
  payerName: string | null;
  reference: string | null;
  parentPaymentId: string | null;
}

export interface BoardOrder {
  id: string;
  orderNumber: string;
  type: string;
  status: string;
  source: string;
  guestName: string | null;
  guestPhone: string | null;
  notes: string | null;
  currency: string;
  subtotal: number;
  serviceCharge: number;
  tax: number;
  discount: number;
  tipAmount: number;
  total: number;
  amountPaid: number;
  createdAt: string;
  tableLabel: string | null;
  tableCode: string | null;
  items: BoardItem[];
  payments: BoardPayment[];
}

export type OrdersBoardTranslations = {
  filterAll: string;
  placed: string;
  preparing: string;
  ready: string;
  served: string;
  paid: string;
  noOrders: string;
  noFilteredOrders: string;
  items: string;
  item: string;
  items_plural: string;
  table: string;
  guest: string;
  subtotal: string;
  serviceCharge: string;
  tax: string;
  tip: string;
  discount: string;
  total: string;
  amountPaid: string;
  payments: string;
  noPayments: string;
  modifiers: string;
  notes: string;
  cancel: string;
  advance: string;
  markPlaced: string;
  startPreparing: string;
  markReady: string;
  markServed: string;
  inclTip: string;
  walkIn: string;
  counter: string;
  paymentMethodCard: string;
  paymentMethodCash: string;
  paymentMethodIpg: string;
  paymentMethodUnknown: string;
  ceilingSubCharges: string;
  loadMore: string;
  livePolling: string;
};

// --- Status flow -------------------------------------------------------------

const NEXT_STATUS: Record<string, string | null> = {
  open: "placed",
  placed: "preparing",
  preparing: "ready",
  ready: "served",
  served: null,
  paid: null,
  cancelled: null,
};

// --- Payment method label lookup ---------------------------------------------

function resolvePaymentMethodLabel(
  method: string,
  t: OrdersBoardTranslations
): string {
  if (method === "card") return t.paymentMethodCard;
  if (method === "cash") return t.paymentMethodCash;
  if (method === "ipg") return t.paymentMethodIpg;
  return t.paymentMethodUnknown;
}

// --- Action buttons ----------------------------------------------------------

function OrderActions({
  order,
  size = "sm",
  t,
}: {
  order: BoardOrder;
  size?: "sm" | "md";
  t: OrdersBoardTranslations;
}) {
  const [pending, startTransition] = React.useTransition();
  const next = NEXT_STATUS[order.status];
  const isTerminal = order.status === "paid" || order.status === "cancelled";

  if (isTerminal) return null;

  const nextLabels: Record<string, string> = {
    open: t.markPlaced,
    placed: t.startPreparing,
    preparing: t.markReady,
    ready: t.markServed,
  };

  return (
    <div className="flex items-center gap-2">
      {next && (
        <Button
          size={size}
          variant="primary"
          loading={pending}
          onClick={(e) => {
            e.stopPropagation();
            startTransition(() => updateOrderStatus(order.id, next));
          }}
        >
          {nextLabels[order.status] ?? t.advance}
        </Button>
      )}
      <Button
        size={size}
        variant="outline"
        disabled={pending}
        onClick={(e) => {
          e.stopPropagation();
          startTransition(() => cancelOrder(order.id));
        }}
      >
        <X size={15} />
        {t.cancel}
      </Button>
    </div>
  );
}

// --- Order row ---------------------------------------------------------------

function itemSummary(items: BoardItem[]): string {
  const names = items.map((i) => (i.quantity > 1 ? `${i.quantity}× ${i.name}` : i.name));
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} +${names.length - 3} more`;
}

function OrderRow({
  order,
  onOpen,
  t,
}: {
  order: BoardOrder;
  onOpen: (o: BoardOrder) => void;
  t: OrdersBoardTranslations;
}) {
  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(order)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(order);
        }
      }}
      className="group flex w-full cursor-pointer flex-col gap-3 rounded-2xl border border-line bg-surface p-4 text-start shadow-card transition-colors hover:border-brand/40 hover:bg-surface-2/40 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
            order.type === "qsr"
              ? "bg-brand-soft text-brand"
              : "bg-surface-2 text-muted"
          )}
        >
          {order.type === "qsr" ? (
            <ShoppingBag size={18} />
          ) : (
            <Utensils size={18} />
          )}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold tabular-nums">#{order.orderNumber}</span>
            <StatusPill status={order.status} />
            <CeilingSubChargesBadge payments={order.payments} t={t} />
            <span className="text-xs text-muted">{timeAgo(order.createdAt)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            <span className="font-medium text-ink">
              {order.tableLabel ?? (order.type === "qsr" ? t.counter : "—")}
            </span>
            {order.guestName && (
              <span className="inline-flex items-center gap-1">
                <User size={12} /> {order.guestName}
              </span>
            )}
            <span>•</span>
            <span>
              {itemCount} {itemCount === 1 ? t.item : t.items_plural}
            </span>
          </div>
          <p className="mt-1 line-clamp-1 text-sm text-ink/80">
            {itemSummary(order.items)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <span className="text-base font-extrabold tabular-nums">
          {formatMoney(order.total)}
        </span>
        <div onClick={(e) => e.stopPropagation()}>
          <OrderActions order={order} t={t} />
        </div>
        <ChevronRight
          size={18}
          className="hidden text-muted transition-transform group-hover:translate-x-0.5 sm:block"
        />
      </div>
    </div>
  );
}

// --- Detail sheet ------------------------------------------------------------

function totalRow(label: string, value: string, strong = false) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-1 text-sm",
        strong && "border-t border-line pt-2 text-base font-extrabold"
      )}
    >
      <span className={strong ? "" : "text-muted"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function OrderDetail({ order, t }: { order: BoardOrder; t: OrdersBoardTranslations }) {
  return (
    <div className="space-y-5 px-5 pb-8 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={order.status} />
        <span className="text-xs text-muted">{timeAgo(order.createdAt)}</span>
        <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold capitalize text-muted">
          {order.type === "qsr" ? "QSR" : "Dine-in"} • {order.source}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs uppercase text-muted">{t.table}</p>
          <p className="font-semibold">
            {order.tableLabel ?? (order.type === "qsr" ? t.counter : "—")}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-muted">{t.guest}</p>
          <p className="font-semibold">{order.guestName ?? t.walkIn}</p>
          {order.guestPhone && (
            <p className="text-xs text-muted">{order.guestPhone}</p>
          )}
        </div>
      </div>

      {order.notes && (
        <div className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm">
          <StickyNote size={16} className="mt-0.5 shrink-0 text-muted" />
          <span>{order.notes}</span>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase text-muted">
          {t.items}
        </p>
        <div className="divide-y divide-line rounded-2xl border border-line">
          {order.items.map((it) => {
            const mods = parseJSON<OrderModifier[]>(it.modifiers, []);
            return (
              <div key={it.id} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    <span className="text-muted">{it.quantity}× </span>
                    {it.name}
                  </p>
                  {mods.length > 0 && (
                    <p className="mt-0.5 text-xs text-muted">
                      {mods
                        .map((m) =>
                          m.priceDelta
                            ? `${m.name} (+${formatMoney(Number(m.priceDelta))} تومان)`
                            : m.name
                        )
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}
                  {it.notes && (
                    <p className="mt-0.5 text-xs italic text-muted">{it.notes}</p>
                  )}
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatMoney(it.lineTotal)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-line p-4">
        {totalRow(t.subtotal, formatMoney(order.subtotal))}
        {order.discount > 0 &&
          totalRow(t.discount, `- ${formatMoney(order.discount)}`)}
        {order.serviceCharge > 0 &&
          totalRow(t.serviceCharge, formatMoney(order.serviceCharge))}
        {order.tax > 0 && totalRow(t.tax, formatMoney(order.tax))}
        {order.tipAmount > 0 &&
          totalRow(t.tip, formatMoney(order.tipAmount))}
        {totalRow(t.total, formatMoney(order.total), true)}
        {order.amountPaid > 0 &&
          order.amountPaid < order.total &&
          totalRow(t.amountPaid, formatMoney(order.amountPaid))}
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2">
          <p className="text-xs font-semibold uppercase text-muted">{t.payments}</p>
          <CeilingSubChargesBadge payments={order.payments} t={t} />
        </div>
        {order.payments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line py-6 text-center text-sm text-muted">
            {t.noPayments}
          </div>
        ) : (
          <div className="divide-y divide-line rounded-2xl border border-line">
            {order.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold">
                      {resolvePaymentMethodLabel(p.method, t)}
                    </p>
                    {p.parentPaymentId !== null && (
                      <span
                        title={t.ceilingSubCharges.replace("{n}", "1")}
                        aria-label={t.ceilingSubCharges.replace("{n}", "1")}
                      >
                        <Layers size={12} className="text-muted" />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted">
                    {p.payerName ? `${p.payerName} • ` : ""}
                    <span className="capitalize">{p.status}</span>
                    {p.reference ? ` • ${p.reference}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-end">
                  <p className="text-sm font-semibold tabular-nums">
                    {formatMoney(p.total)}
                  </p>
                  {p.tipAmount > 0 && (
                    <p className="text-xs text-muted">
                      {t.inclTip.replace("{amount}", formatMoney(p.tipAmount))}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {order.status !== "paid" && order.status !== "cancelled" && (
        <div className="flex justify-end pt-1">
          <OrderActions order={order} size="md" t={t} />
        </div>
      )}
    </div>
  );
}

// --- Ceiling-split badge -----------------------------------------------------

function CeilingSubChargesBadge({
  payments,
  t,
}: {
  payments: BoardPayment[];
  t: OrdersBoardTranslations;
}) {
  const childCharges = payments.filter((p) => p.parentPaymentId !== null);
  if (childCharges.length === 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted"
      title={t.ceilingSubCharges.replace("{n}", String(childCharges.length))}
    >
      <Layers size={11} />
      {childCharges.length}×
    </span>
  );
}

// --- Board -------------------------------------------------------------------

interface OrdersBoardProps {
  orders: BoardOrder[];
  t: OrdersBoardTranslations;
  pollingIntervalMs?: number;
}

export function OrdersBoard({ orders: initialOrders, t, pollingIntervalMs = 8_000 }: OrdersBoardProps) {
  const [filter, setFilter] = React.useState<string>("all");
  const [selected, setSelected] = React.useState<BoardOrder | null>(null);

  const { orders, isLoading, hasMore, loadMore, refresh } = useOrdersPolling(
    initialOrders,
    { intervalMs: pollingIntervalMs }
  );

  const FILTERS = React.useMemo(() => [
    { key: "all", label: t.filterAll },
    { key: "placed", label: t.placed },
    { key: "preparing", label: t.preparing },
    { key: "ready", label: t.ready },
    { key: "served", label: t.served },
    { key: "paid", label: t.paid },
  ], [t]);

  const counts = React.useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    for (const o of orders) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [orders]);

  const filtered = React.useMemo(
    () => (filter === "all" ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter]
  );

  const selectedLive =
    selected && orders.find((o) => o.id === selected.id) ? selected : null;
  const liveOrder = selectedLive
    ? orders.find((o) => o.id === selectedLive.id) ?? selectedLive
    : null;

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
        {FILTERS.map((f) => {
          const count = counts[f.key] ?? 0;
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
                active
                  ? "bg-brand text-brand-fg"
                  : "bg-surface-2 text-muted hover:text-ink"
              )}
            >
              {f.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  active ? "bg-brand-fg/20" : "bg-line/60"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}

        <div className="ms-auto flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
            {t.livePolling}
          </span>
          <Button
            size="sm"
            variant="outline"
            loading={isLoading}
            onClick={refresh}
            aria-label={t.livePolling}
          >
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {filtered.length === 0 ? (
          <EmptyRow>
            {filter === "all"
              ? t.noOrders
              : t.noFilteredOrders.replace("{status}", filter)}
          </EmptyRow>
        ) : (
          filtered.map((o) => (
            <OrderRow key={o.id} order={o} onOpen={setSelected} t={t} />
          ))
        )}
      </div>

      {hasMore && (
        <div className="border-t border-line p-4 text-center">
          <Button variant="outline" size="sm" loading={isLoading} onClick={loadMore}>
            {t.loadMore}
          </Button>
        </div>
      )}

      <Sheet
        open={!!liveOrder}
        onClose={() => setSelected(null)}
        title={liveOrder ? `#${liveOrder.orderNumber}` : undefined}
        height="tall"
      >
        {liveOrder && <OrderDetail order={liveOrder} t={t} />}
      </Sheet>
    </Card>
  );
}

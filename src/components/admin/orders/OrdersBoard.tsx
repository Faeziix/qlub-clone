"use client";

import * as React from "react";
import {
  ChevronRight,
  Utensils,
  ShoppingBag,
  User,
  StickyNote,
  X,
} from "lucide-react";
import { Card, StatusPill, EmptyRow } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { formatMoney, timeAgo, parseJSON, cn } from "@/lib/utils";
import { updateOrderStatus, cancelOrder } from "@/app/admin/orders/actions";

// --- Types -------------------------------------------------------------------

type OrderModifier = { name?: string; priceDelta?: number };

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

const NEXT_LABEL: Record<string, string> = {
  open: "Mark placed",
  placed: "Start preparing",
  preparing: "Mark ready",
  ready: "Mark served",
};

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "placed", label: "Placed" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready" },
  { key: "served", label: "Served" },
  { key: "paid", label: "Paid" },
];

const PAYMENT_LABELS: Record<string, string> = {
  card: "Card",
  apple_pay: "Apple Pay",
  google_pay: "Google Pay",
  tabby: "Tabby",
  benefit: "Benefit",
  cash: "Cash",
};

// --- Action buttons ----------------------------------------------------------

function OrderActions({
  order,
  size = "sm",
}: {
  order: BoardOrder;
  size?: "sm" | "md";
}) {
  const [pending, startTransition] = React.useTransition();
  const next = NEXT_STATUS[order.status];
  const isTerminal = order.status === "paid" || order.status === "cancelled";

  if (isTerminal) return null;

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
          {NEXT_LABEL[order.status] ?? "Advance"}
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
        Cancel
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
}: {
  order: BoardOrder;
  onOpen: (o: BoardOrder) => void;
}) {
  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <button
      type="button"
      onClick={() => onOpen(order)}
      className="group flex w-full flex-col gap-3 rounded-2xl border border-line bg-surface p-4 text-left shadow-card transition-colors hover:border-brand/40 hover:bg-surface-2/40 sm:flex-row sm:items-center"
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
            <span className="text-xs text-muted">{timeAgo(order.createdAt)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            <span className="font-medium text-ink">
              {order.tableLabel ?? (order.type === "qsr" ? "Counter" : "—")}
            </span>
            {order.guestName && (
              <span className="inline-flex items-center gap-1">
                <User size={12} /> {order.guestName}
              </span>
            )}
            <span>•</span>
            <span>
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </span>
          </div>
          <p className="mt-1 line-clamp-1 text-sm text-ink/80">
            {itemSummary(order.items)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <span className="text-base font-extrabold tabular-nums">
          {formatMoney(order.total, order.currency)}
        </span>
        <div onClick={(e) => e.stopPropagation()}>
          <OrderActions order={order} />
        </div>
        <ChevronRight
          size={18}
          className="hidden text-muted transition-transform group-hover:translate-x-0.5 sm:block"
        />
      </div>
    </button>
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

function OrderDetail({ order }: { order: BoardOrder }) {
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
          <p className="text-xs uppercase text-muted">Table</p>
          <p className="font-semibold">
            {order.tableLabel ?? (order.type === "qsr" ? "Counter" : "—")}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-muted">Guest</p>
          <p className="font-semibold">{order.guestName ?? "Walk-in"}</p>
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

      {/* Line items */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase text-muted">
          Items
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
                            ? `${m.name} (+${m.priceDelta.toFixed(2)})`
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
                  {formatMoney(it.lineTotal, order.currency)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Totals */}
      <div className="rounded-2xl border border-line p-4">
        {totalRow("Subtotal", formatMoney(order.subtotal, order.currency))}
        {order.discount > 0 &&
          totalRow("Discount", `- ${formatMoney(order.discount, order.currency)}`)}
        {order.serviceCharge > 0 &&
          totalRow("Service charge", formatMoney(order.serviceCharge, order.currency))}
        {order.tax > 0 && totalRow("Tax", formatMoney(order.tax, order.currency))}
        {order.tipAmount > 0 &&
          totalRow("Tip", formatMoney(order.tipAmount, order.currency))}
        {totalRow("Total", formatMoney(order.total, order.currency), true)}
        {order.amountPaid > 0 &&
          order.amountPaid < order.total &&
          totalRow("Paid", formatMoney(order.amountPaid, order.currency))}
      </div>

      {/* Payments */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase text-muted">
          Payments
        </p>
        {order.payments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line py-6 text-center text-sm text-muted">
            No payments recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-line rounded-2xl border border-line">
            {order.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {PAYMENT_LABELS[p.method] ?? p.method}
                  </p>
                  <p className="text-xs text-muted">
                    {p.payerName ? `${p.payerName} • ` : ""}
                    <span className="capitalize">{p.status}</span>
                    {p.reference ? ` • ${p.reference}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">
                    {formatMoney(p.total, order.currency)}
                  </p>
                  {p.tipAmount > 0 && (
                    <p className="text-xs text-muted">
                      incl. {formatMoney(p.tipAmount, order.currency)} tip
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      {order.status !== "paid" && order.status !== "cancelled" && (
        <div className="flex justify-end pt-1">
          <OrderActions order={order} size="md" />
        </div>
      )}
    </div>
  );
}

// --- Board -------------------------------------------------------------------

export function OrdersBoard({ orders }: { orders: BoardOrder[] }) {
  const [filter, setFilter] = React.useState<string>("all");
  const [selected, setSelected] = React.useState<BoardOrder | null>(null);

  const counts = React.useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    for (const o of orders) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [orders]);

  const filtered = React.useMemo(
    () => (filter === "all" ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter]
  );

  // Keep the open sheet in sync with refreshed server data.
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
      </div>

      <div className="space-y-3 p-4">
        {filtered.length === 0 ? (
          <EmptyRow>
            {filter === "all"
              ? "No orders yet. New orders from tables will appear here."
              : `No ${filter} orders right now.`}
          </EmptyRow>
        ) : (
          filtered.map((o) => (
            <OrderRow key={o.id} order={o} onOpen={setSelected} />
          ))
        )}
      </div>

      <Sheet
        open={!!liveOrder}
        onClose={() => setSelected(null)}
        title={liveOrder ? `Order #${liveOrder.orderNumber}` : undefined}
        height="tall"
      >
        {liveOrder && <OrderDetail order={liveOrder} />}
      </Sheet>
    </Card>
  );
}

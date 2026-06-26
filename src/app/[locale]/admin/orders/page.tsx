import {
  ClipboardList,
  Clock,
  Banknote,
  Flame,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireSession } from "@/app/[locale]/admin/actions";
import { PageHeader, StatCard } from "@/components/admin/ui";
import { formatMoney } from "@/lib/utils";
import { bigintToNumber } from "@/lib/money";
import { OrdersBoard } from "@/components/admin/orders/OrdersBoard";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const t = await getTranslations("admin.orders");
  const session = await requireSession();

  const orders = await db.order.findMany({
    where: session.vendorId ? { vendorId: session.vendorId } : undefined,
    include: {
      items: true,
      payments: true,
      table: true,
    },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  // --- Metrics ---------------------------------------------------------------
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const activeStatuses = new Set(["open", "placed", "preparing", "ready", "served"]);
  const activeCount = orders.filter((o) => activeStatuses.has(o.status)).length;

  const todays = orders.filter((o) => o.createdAt >= startOfDay);
  const todaysCount = todays.length;

  const paidToday = todays.filter((o) => o.status === "paid");
  const todaysRevenue = paidToday.reduce((sum, o) => sum + o.total, 0n);

  // Avg prep time: served/paid orders -> minutes between created & updated.
  const completed = orders.filter(
    (o) => o.status === "served" || o.status === "paid"
  );
  const avgPrepMins =
    completed.length > 0
      ? Math.round(
          completed.reduce(
            (sum, o) =>
              sum +
              Math.max(0, o.updatedAt.getTime() - o.createdAt.getTime()) / 60000,
            0
          ) / completed.length
        )
      : 0;

  // Strip Prisma Date objects down to serialisable props for the client board.
  const boardOrders = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    type: o.type,
    status: o.status,
    source: o.source,
    guestName: o.guestName,
    guestPhone: o.guestPhone,
    notes: o.notes,
    currency: o.currency,
    subtotal: bigintToNumber(o.subtotal),
    serviceCharge: bigintToNumber(o.serviceCharge),
    tax: bigintToNumber(o.tax),
    discount: bigintToNumber(o.discount),
    tipAmount: bigintToNumber(o.tipAmount),
    total: bigintToNumber(o.total),
    amountPaid: bigintToNumber(o.amountPaid),
    createdAt: o.createdAt.toISOString(),
    tableLabel: o.table?.label ?? null,
    tableCode: o.table?.code ?? null,
    items: o.items.map((it) => ({
      id: it.id,
      name: it.name,
      unitPrice: bigintToNumber(it.unitPrice),
      quantity: it.quantity,
      modifiers: it.modifiers as string | null,
      notes: it.notes,
      lineTotal: bigintToNumber(it.lineTotal),
    })),
    payments: o.payments.map((p) => ({
      id: p.id,
      amount: bigintToNumber(p.amount),
      tipAmount: bigintToNumber(p.tipAmount),
      total: bigintToNumber(p.total),
      method: p.method,
      status: p.status,
      payerName: p.payerName,
      reference: p.reference,
      parentPaymentId: p.parentPaymentId,
    })),
  }));

  return (
    <div>
      <PageHeader
        title={t("pageTitle")}
        subtitle={t("pageSubtitle")}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={t("activeOrders")}
          value={String(activeCount)}
          icon={<ClipboardList size={18} />}
          hint={t("notYetPaid")}
        />
        <StatCard
          label={t("todaysOrders")}
          value={String(todaysCount)}
          icon={<Flame size={18} />}
          hint={t("sinceMidnight")}
        />
        <StatCard
          label={t("todaysRevenue")}
          value={formatMoney(todaysRevenue)}
          icon={<Banknote size={18} />}
          hint={`${paidToday.length} ${t("paid")}`}
        />
        <StatCard
          label={t("avgPrepTime")}
          value={avgPrepMins > 0 ? `${avgPrepMins} min` : "—"}
          icon={<Clock size={18} />}
          hint={t("servedAndPaid")}
        />
      </div>

      <div className="mt-6">
        <OrdersBoard
          orders={boardOrders}
          t={{
            filterAll: t("filterAll"),
            placed: t("placed"),
            preparing: t("preparing"),
            ready: t("ready"),
            served: t("served"),
            paid: t("paid"),
            noOrders: t("noOrders"),
            noFilteredOrders: t.raw("noFilteredOrders"),
            items: t("items"),
            item: t("item"),
            items_plural: t("items_plural"),
            table: t("table"),
            guest: t("guest"),
            subtotal: t("subtotal"),
            serviceCharge: t("serviceCharge"),
            tax: t("tax"),
            tip: t("tip"),
            discount: t("discount"),
            total: t("total"),
            amountPaid: t("amountPaid"),
            payments: t("payments"),
            noPayments: t("noPayments"),
            modifiers: t("modifiers"),
            notes: t("notes"),
            cancel: t("cancel"),
            advance: t("advance"),
            markPlaced: t("markPlaced"),
            startPreparing: t("startPreparing"),
            markReady: t("markReady"),
            markServed: t("markServed"),
            inclTip: t.raw("inclTip"),
            walkIn: t("walkIn"),
            counter: t("counter"),
            paymentMethodCard: t("paymentMethodCard"),
            paymentMethodCash: t("paymentMethodCash"),
            paymentMethodIpg: t("paymentMethodIpg"),
            paymentMethodUnknown: t("paymentMethodUnknown"),
            ceilingSubCharges: t.raw("ceilingSubCharges"),
            loadMore: t("loadMore"),
            livePolling: t("livePolling"),
          }}
        />
      </div>
    </div>
  );
}

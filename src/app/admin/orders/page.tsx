import {
  ClipboardList,
  Clock,
  Banknote,
  Flame,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireSession } from "@/app/admin/actions";
import { PageHeader, StatCard } from "@/components/admin/ui";
import { formatMoney } from "@/lib/utils";
import { OrdersBoard } from "@/components/admin/orders/OrdersBoard";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
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
    subtotal: Number(o.subtotal),
    serviceCharge: Number(o.serviceCharge),
    tax: Number(o.tax),
    discount: Number(o.discount),
    tipAmount: Number(o.tipAmount),
    total: Number(o.total),
    amountPaid: Number(o.amountPaid),
    createdAt: o.createdAt.toISOString(),
    tableLabel: o.table?.label ?? null,
    tableCode: o.table?.code ?? null,
    items: o.items.map((it) => ({
      id: it.id,
      name: it.name,
      unitPrice: Number(it.unitPrice),
      quantity: it.quantity,
      modifiers: it.modifiers as string | null,
      notes: it.notes,
      lineTotal: Number(it.lineTotal),
    })),
    payments: o.payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      tipAmount: Number(p.tipAmount),
      total: Number(p.total),
      method: p.method,
      status: p.status,
      payerName: p.payerName,
      reference: p.reference,
    })),
  }));

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle="Live order board and recent history across your tables."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Active orders"
          value={String(activeCount)}
          icon={<ClipboardList size={18} />}
          hint="not yet paid or cancelled"
        />
        <StatCard
          label="Today's orders"
          value={String(todaysCount)}
          icon={<Flame size={18} />}
          hint="since midnight"
        />
        <StatCard
          label="Today's revenue"
          value={formatMoney(todaysRevenue)}
          icon={<Banknote size={18} />}
          hint={`${paidToday.length} paid`}
        />
        <StatCard
          label="Avg prep time"
          value={avgPrepMins > 0 ? `${avgPrepMins} min` : "—"}
          icon={<Clock size={18} />}
          hint="served & paid"
        />
      </div>

      <div className="mt-6">
        <OrdersBoard orders={boardOrders} />
      </div>
    </div>
  );
}

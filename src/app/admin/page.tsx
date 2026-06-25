import {
  DollarSign,
  ReceiptText,
  Star,
  TrendingUp,
  Coins,
  Users,
} from "lucide-react";
import { requireSession } from "./actions";
import { getDashboardStats } from "@/lib/queries";
import { db } from "@/lib/db";
import { PageHeader, StatCard, Card, StatusPill } from "@/components/admin/ui";
import { RevenueChart } from "@/components/admin/RevenueChart";
import { formatMoney, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireSession();
  const stats = await getDashboardStats(session.vendorId);
  const currency = "AED";

  // build 14-day revenue series from payments
  const days: { day: string; revenue: number; orders: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en", { day: "numeric", month: "short" });
    const dayPayments = stats.payments.filter(
      (p) => p.createdAt.toISOString().slice(0, 10) === key
    );
    days.push({
      day: label,
      revenue: Math.round(dayPayments.reduce((s, p) => s + p.total, 0) * 100) / 100,
      orders: dayPayments.length,
    });
  }

  const recentOrders = stats.orders.slice(0, 8);
  const tables = session.vendorId
    ? await db.diningTable.findMany({
        where: { vendorId: session.vendorId },
        orderBy: { code: "asc" },
      })
    : [];
  const occupied = tables.filter((t) => t.status === "occupied").length;

  // top items
  const itemCounts = new Map<string, number>();
  const orderItems = await db.orderItem.findMany({
    where: session.vendorId
      ? { order: { vendorId: session.vendorId } }
      : {},
    take: 500,
    orderBy: { id: "desc" },
  });
  for (const oi of orderItems) {
    itemCounts.set(oi.name, (itemCounts.get(oi.name) ?? 0) + oi.quantity);
  }
  const topItems = [...itemCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${session.name.split(" ")[0]}`}
        subtitle="Here's how your restaurant is performing — last 30 days."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Revenue"
          value={formatMoney(stats.revenue, currency)}
          icon={<DollarSign size={18} />}
          delta={{ value: "+12.4%", positive: true }}
          hint="vs last month"
        />
        <StatCard
          label="Orders"
          value={String(stats.orderCount)}
          icon={<ReceiptText size={18} />}
          delta={{ value: "+8.1%", positive: true }}
          hint={`${stats.paidCount} paid`}
        />
        <StatCard
          label="Avg. order"
          value={formatMoney(stats.avgOrder || 0, currency)}
          icon={<TrendingUp size={18} />}
          hint="per paid bill"
        />
        <StatCard
          label="Tips collected"
          value={formatMoney(stats.tips, currency)}
          icon={<Coins size={18} />}
          hint="staff tips"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold">Revenue trend</h2>
            <span className="text-xs text-muted">Last 14 days</span>
          </div>
          <RevenueChart data={days} currency={currency} />
        </Card>

        <div className="space-y-4">
          <StatCard
            label="Rating"
            value={`${stats.avgRating.toFixed(1)} ★`}
            icon={<Star size={18} />}
            hint={`${stats.reviewCount} reviews`}
          />
          <StatCard
            label="Tables occupied"
            value={`${occupied}/${tables.length}`}
            icon={<Users size={18} />}
            hint="live"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 font-bold">Recent orders</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted">
                  <th className="pb-2 font-semibold">Order</th>
                  <th className="pb-2 font-semibold">Guest</th>
                  <th className="pb-2 font-semibold">Status</th>
                  <th className="pb-2 text-right font-semibold">Total</th>
                  <th className="pb-2 text-right font-semibold">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id} className="border-t border-line">
                    <td className="py-2.5 font-semibold">{o.orderNumber}</td>
                    <td className="py-2.5 text-muted">{o.guestName ?? "—"}</td>
                    <td className="py-2.5">
                      <StatusPill status={o.status} />
                    </td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">
                      {formatMoney(o.total, currency)}
                    </td>
                    <td className="py-2.5 text-right text-xs text-muted">
                      {timeAgo(o.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-bold">Top items</h2>
          <div className="space-y-3">
            {topItems.map(([name, qty], i) => (
              <div key={name} className="flex items-center gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-xs font-bold text-brand">
                  {i + 1}
                </span>
                <span className="flex-1 truncate text-sm font-medium">
                  {name}
                </span>
                <span className="text-sm font-bold tabular-nums">{qty}</span>
              </div>
            ))}
            {topItems.length === 0 && (
              <p className="text-sm text-muted">No data yet.</p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

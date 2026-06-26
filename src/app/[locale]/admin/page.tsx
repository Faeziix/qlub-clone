import {
  DollarSign,
  ReceiptText,
  Star,
  TrendingUp,
  Coins,
  Users,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireSession } from "./actions";
import { getDashboardStats } from "@/lib/queries";
import { db } from "@/lib/db";
import { PageHeader, StatCard, Card, StatusPill } from "@/components/admin/ui";
import { RevenueChart } from "@/components/admin/RevenueChart";
import { formatMoney, timeAgo } from "@/lib/utils";
import { bigintToNumber } from "@/lib/money";

export const dynamic = "force-dynamic";

const DAY_MS = 86400000;
const REVENUE_WINDOW_DAYS = 14;

type DashboardPayment = { createdAt: Date; total: bigint };

function buildRevenueSeries(payments: DashboardPayment[]) {
  const series: { day: string; revenue: number; orders: number }[] = [];
  const windowEnd = Date.now();
  for (let daysAgo = REVENUE_WINDOW_DAYS - 1; daysAgo >= 0; daysAgo--) {
    const date = new Date(windowEnd - daysAgo * DAY_MS);
    const dayKey = date.toISOString().slice(0, 10);
    const label = date.toLocaleDateString("en", { day: "numeric", month: "short" });
    const dayPayments = payments.filter(
      (p) => p.createdAt.toISOString().slice(0, 10) === dayKey
    );
    const rialTotal = dayPayments.reduce((s, p) => s + p.total, 0n);
    series.push({
      day: label,
      revenue: bigintToNumber(rialTotal),
      orders: dayPayments.length,
    });
  }
  return series;
}

export default async function DashboardPage() {
  const t = await getTranslations("admin.dashboard");
  const session = await requireSession();
  const stats = await getDashboardStats(session.vendorId);

  const vendorCurrency = session.vendorId
    ? (await db.vendor.findUnique({ where: { id: session.vendorId }, select: { currency: true } }))?.currency ?? "IRR"
    : "IRR";
  const currency = vendorCurrency;

  const days = buildRevenueSeries(stats.payments);

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
        title={t("pageTitle")}
        subtitle={t("pageSubtitle")}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={t("revenue")}
          value={formatMoney(stats.revenue)}
          icon={<DollarSign size={18} />}
          delta={{ value: "+12.4%", positive: true }}
        />
        <StatCard
          label={t("orders")}
          value={String(stats.orderCount)}
          icon={<ReceiptText size={18} />}
          delta={{ value: "+8.1%", positive: true }}
          hint={`${stats.paidCount} ${t("paid")}`}
        />
        <StatCard
          label={t("avgOrder")}
          value={formatMoney(stats.avgOrder || 0)}
          icon={<TrendingUp size={18} />}
          hint={t("perPaidBill")}
        />
        <StatCard
          label={t("tips")}
          value={formatMoney(stats.tips)}
          icon={<Coins size={18} />}
          hint={t("staffTips")}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold">{t("revenueTrend")}</h2>
            <span className="text-xs text-muted">{t("last14Days")}</span>
          </div>
          <RevenueChart data={days} currency={currency} />
        </Card>

        <div className="space-y-4">
          <StatCard
            label={t("rating")}
            value={`${stats.avgRating.toFixed(1)} ★`}
            icon={<Star size={18} />}
            hint={`${stats.reviewCount} ${t("reviews")}`}
          />
          <StatCard
            label={t("tablesOccupied")}
            value={`${occupied}/${tables.length}`}
            icon={<Users size={18} />}
            hint={t("live")}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 font-bold">{t("recentOrders")}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start text-xs uppercase text-muted">
                  <th className="pb-2 font-semibold">{t("order")}</th>
                  <th className="pb-2 font-semibold">{t("guest")}</th>
                  <th className="pb-2 font-semibold">{t("status")}</th>
                  <th className="pb-2 text-end font-semibold">{t("total")}</th>
                  <th className="pb-2 text-end font-semibold">{t("time")}</th>
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
                    <td className="py-2.5 text-end font-semibold tabular-nums">
                      {formatMoney(o.total)}
                    </td>
                    <td className="py-2.5 text-end text-xs text-muted">
                      {timeAgo(o.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-bold">{t("topItems")}</h2>
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
              <p className="text-sm text-muted">{t("noData")}</p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

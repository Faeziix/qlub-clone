/**
 * dashboard-analytics.ts — SQL-correct revenue aggregation, period-over-period
 * deltas, and Jalali-bucketed revenue series for the admin dashboard.
 *
 * Rules enforced by this module:
 *   - Revenue = sum(Payment.amount) — tips live in Payment.tipAmount and are
 *     tracked separately; Payment.total = amount + tipAmount is NEVER used for
 *     revenue aggregation.
 *   - avgOrder = revenueRial / distinctOrderCount — each order counts once even
 *     when multiple payments (split-bill legs) cover it.
 *   - Period-over-period delta is a real percentage derived from two equal time
 *     windows; static strings are never returned.
 *   - Revenue series buckets are keyed by Jalali YYYY-MM-DD in Asia/Tehran so
 *     the day boundary is always the local Tehran midnight, not UTC midnight.
 */

import { getJalaliParts } from "./jalali";
import { bigintToNumber } from "./money";
import { latinDigitsToPersian } from "./toman-formatter";

export interface PaymentRow {
  orderId: string;
  amount: bigint;
  tipAmount: bigint;
  total: bigint;
  createdAt: Date;
}

export interface RevenueStats {
  revenueRial: bigint;
  tipsRial: bigint;
  distinctOrderCount: number;
  avgOrderRial: bigint;
}

export interface RevenueBucket {
  jalaliKey: string;
  label: string;
  revenue: number;
  orders: number;
}

const JALALI_MONTH_NAMES_FA = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

export function buildJalaliDayKey(date: Date): string {
  const { year, month, day } = getJalaliParts(date);
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function buildJalaliLabel(date: Date): string {
  const { month, day } = getJalaliParts(date);
  const monthName = JALALI_MONTH_NAMES_FA[month - 1];
  const persianDay = latinDigitsToPersian(String(day));
  return `${persianDay} ${monthName}`;
}

export function aggregateRevenueStats(payments: PaymentRow[]): RevenueStats {
  if (payments.length === 0) {
    return { revenueRial: 0n, tipsRial: 0n, distinctOrderCount: 0, avgOrderRial: 0n };
  }

  let revenueRial = 0n;
  let tipsRial = 0n;
  const uniqueOrderIds = new Set<string>();

  for (const payment of payments) {
    revenueRial += payment.amount;
    tipsRial += payment.tipAmount;
    uniqueOrderIds.add(payment.orderId);
  }

  const distinctOrderCount = uniqueOrderIds.size;
  const avgOrderRial =
    distinctOrderCount > 0 ? revenueRial / BigInt(distinctOrderCount) : 0n;

  return { revenueRial, tipsRial, distinctOrderCount, avgOrderRial };
}

export function computePeriodDelta(current: bigint, previous: bigint): number {
  if (previous === 0n) return 0;
  const diff = current - previous;
  return (Number(diff) / Number(previous)) * 100;
}

export function computeRevenueSeries(
  payments: PaymentRow[],
  windowDays: number,
  windowEnd: Date
): RevenueBucket[] {
  const DAY_MS = 86_400_000;

  const buckets: RevenueBucket[] = [];
  for (let daysAgo = windowDays - 1; daysAgo >= 0; daysAgo--) {
    const bucketDate = new Date(windowEnd.getTime() - daysAgo * DAY_MS);
    const jalaliKey = buildJalaliDayKey(bucketDate);
    const label = buildJalaliLabel(bucketDate);
    buckets.push({ jalaliKey, label, revenue: 0, orders: 0 });
  }

  const bucketMap = new Map<string, RevenueBucket>();
  for (const bucket of buckets) {
    bucketMap.set(bucket.jalaliKey, bucket);
  }

  for (const payment of payments) {
    const key = buildJalaliDayKey(payment.createdAt);
    const bucket = bucketMap.get(key);
    if (bucket) {
      bucket.revenue += bigintToNumber(payment.amount);
      bucket.orders += 1;
    }
  }

  return buckets;
}

export function buildTehranWindowBounds(windowDays: number, now: Date): {
  windowStart: Date;
  windowEnd: Date;
  prevWindowStart: Date;
  prevWindowEnd: Date;
} {
  const DAY_MS = 86_400_000;
  const windowEnd = now;
  const windowStart = new Date(now.getTime() - windowDays * DAY_MS);
  const prevWindowEnd = windowStart;
  const prevWindowStart = new Date(windowStart.getTime() - windowDays * DAY_MS);
  return { windowStart, windowEnd, prevWindowStart, prevWindowEnd };
}

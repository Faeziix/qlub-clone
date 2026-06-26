/**
 * Unit tests for dashboard analytics correctness (issue #19).
 *
 * Verifies:
 *   - Revenue excludes tips (uses Payment.amount, not Payment.total)
 *   - avgOrder is computed per distinct order count, not payment count
 *   - Period-over-period deltas are real numbers, not static strings
 *   - Revenue series buckets dates by Jalali day in Asia/Tehran (not UTC)
 *   - Jalali day key format is consistent for the series builder
 */

import { describe, it, expect } from "vitest";
import {
  computeRevenueSeries,
  computePeriodDelta,
  buildJalaliDayKey,
  aggregateRevenueStats,
} from "@/lib/dashboard-analytics";

describe("buildJalaliDayKey — buckets a Date to Jalali YYYY-MM-DD in Asia/Tehran", () => {
  it("returns a string in YYYY-MM-DD format", () => {
    const date = new Date("2025-06-01T00:00:00Z");
    const key = buildJalaliDayKey(date);
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("Nowruz 1404 — 2025-03-21 UTC maps to 1404-01-01", () => {
    const nowruz = new Date("2025-03-20T20:30:00Z");
    const key = buildJalaliDayKey(nowruz);
    expect(key).toBe("1404-01-01");
  });

  it("two UTC timestamps on the same Tehran calendar day share the same key", () => {
    const morning = new Date("2025-06-04T05:00:00Z");
    const evening = new Date("2025-06-04T15:00:00Z");
    const keyMorning = buildJalaliDayKey(morning);
    const keyEvening = buildJalaliDayKey(evening);
    expect(keyMorning).toBe(keyEvening);
  });

  it("UTC midnight crosses into the next Tehran calendar day near the offset boundary", () => {
    const rightBeforeMidnightTehran = new Date("2025-06-04T20:29:00Z");
    const rightAfterMidnightTehran = new Date("2025-06-04T20:31:00Z");
    const keyBefore = buildJalaliDayKey(rightBeforeMidnightTehran);
    const keyAfter = buildJalaliDayKey(rightAfterMidnightTehran);
    expect(keyBefore).not.toBe(keyAfter);
  });
});

describe("aggregateRevenueStats — SQL-level aggregation correctness", () => {
  const baseDate = new Date("2025-06-04T10:00:00Z");

  it("revenue sums Payment.amount, not Payment.total — tips are excluded", () => {
    const payments = [
      { orderId: "o1", amount: 100_000n, tipAmount: 10_000n, total: 110_000n, createdAt: baseDate },
      { orderId: "o2", amount: 200_000n, tipAmount: 20_000n, total: 220_000n, createdAt: baseDate },
    ];
    const stats = aggregateRevenueStats(payments);
    expect(stats.revenueRial).toBe(300_000n);
  });

  it("tips are the sum of Payment.tipAmount", () => {
    const payments = [
      { orderId: "o1", amount: 100_000n, tipAmount: 15_000n, total: 115_000n, createdAt: baseDate },
      { orderId: "o2", amount: 200_000n, tipAmount: 25_000n, total: 225_000n, createdAt: baseDate },
    ];
    const stats = aggregateRevenueStats(payments);
    expect(stats.tipsRial).toBe(40_000n);
  });

  it("avgOrder divides revenueRial by distinct order count, not payment count", () => {
    const payments = [
      { orderId: "o1", amount: 100_000n, tipAmount: 0n, total: 100_000n, createdAt: baseDate },
      { orderId: "o1", amount: 50_000n, tipAmount: 0n, total: 50_000n, createdAt: baseDate },
      { orderId: "o2", amount: 200_000n, tipAmount: 0n, total: 200_000n, createdAt: baseDate },
    ];
    const stats = aggregateRevenueStats(payments);
    expect(stats.distinctOrderCount).toBe(2);
    expect(stats.revenueRial).toBe(350_000n);
    expect(stats.avgOrderRial).toBe(175_000n);
  });

  it("avgOrder is 0n when there are no payments", () => {
    const stats = aggregateRevenueStats([]);
    expect(stats.avgOrderRial).toBe(0n);
  });

  it("avgOrder is 0n when distinctOrderCount is 0", () => {
    const stats = aggregateRevenueStats([]);
    expect(stats.distinctOrderCount).toBe(0);
  });

  it("revenue is 0n when there are no payments", () => {
    const stats = aggregateRevenueStats([]);
    expect(stats.revenueRial).toBe(0n);
  });

  it("revenue does not include tip even if tipAmount equals amount", () => {
    const payments = [
      { orderId: "o1", amount: 0n, tipAmount: 50_000n, total: 50_000n, createdAt: baseDate },
    ];
    const stats = aggregateRevenueStats(payments);
    expect(stats.revenueRial).toBe(0n);
    expect(stats.tipsRial).toBe(50_000n);
  });
});

describe("computePeriodDelta — real period-over-period percentage change", () => {
  it("returns a positive delta when current > previous", () => {
    const delta = computePeriodDelta(120n, 100n);
    expect(delta).toBeCloseTo(20);
  });

  it("returns a negative delta when current < previous", () => {
    const delta = computePeriodDelta(80n, 100n);
    expect(delta).toBeCloseTo(-20);
  });

  it("returns 0 when current === previous", () => {
    const delta = computePeriodDelta(100n, 100n);
    expect(delta).toBe(0);
  });

  it("returns 0 when previous is 0 (no prior data)", () => {
    const delta = computePeriodDelta(100n, 0n);
    expect(delta).toBe(0);
  });

  it("returns 0 when both are 0", () => {
    const delta = computePeriodDelta(0n, 0n);
    expect(delta).toBe(0);
  });

  it("is expressed as a percentage (e.g. 12.4 not 0.124)", () => {
    const delta = computePeriodDelta(112n, 100n);
    expect(delta).toBeCloseTo(12);
  });

  it("handles large rial amounts without overflow", () => {
    const delta = computePeriodDelta(1_000_000_000n, 500_000_000n);
    expect(delta).toBeCloseTo(100);
  });
});

describe("computeRevenueSeries — Jalali-bucketed revenue by day", () => {
  const basePayments = [
    {
      orderId: "o1",
      amount: 100_000n,
      tipAmount: 10_000n,
      total: 110_000n,
      createdAt: new Date("2025-06-04T10:00:00Z"),
    },
    {
      orderId: "o2",
      amount: 200_000n,
      tipAmount: 0n,
      total: 200_000n,
      createdAt: new Date("2025-06-04T14:00:00Z"),
    },
    {
      orderId: "o3",
      amount: 150_000n,
      tipAmount: 5_000n,
      total: 155_000n,
      createdAt: new Date("2025-06-05T10:00:00Z"),
    },
  ];

  it("groups payments by Jalali day key", () => {
    const windowEnd = new Date("2025-06-06T00:00:00Z");
    const series = computeRevenueSeries(basePayments, 7, windowEnd);
    const hasSameDayBucket = series.some((bucket) => bucket.orders === 2);
    expect(hasSameDayBucket).toBe(true);
  });

  it("revenue per bucket excludes tips", () => {
    const windowEnd = new Date("2025-06-06T00:00:00Z");
    const series = computeRevenueSeries(basePayments, 7, windowEnd);
    const june4BucketKey = buildJalaliDayKey(new Date("2025-06-04T10:00:00Z"));
    const bucket = series.find((b) => b.jalaliKey === june4BucketKey);
    expect(bucket).toBeDefined();
    expect(bucket!.revenue).toBe(300_000);
  });

  it("returns exactly `windowDays` buckets", () => {
    const windowEnd = new Date("2025-06-10T00:00:00Z");
    const series = computeRevenueSeries([], 14, windowEnd);
    expect(series).toHaveLength(14);
  });

  it("empty buckets have revenue=0 and orders=0", () => {
    const windowEnd = new Date("2025-06-10T00:00:00Z");
    const series = computeRevenueSeries([], 14, windowEnd);
    for (const bucket of series) {
      expect(bucket.revenue).toBe(0);
      expect(bucket.orders).toBe(0);
    }
  });

  it("each bucket carries a Farsi label (Persian numerals)", () => {
    const windowEnd = new Date("2025-06-10T00:00:00Z");
    const series = computeRevenueSeries([], 7, windowEnd);
    for (const bucket of series) {
      expect(bucket.label).toMatch(/[۰-۹]/);
    }
  });

  it("each bucket carries a jalaliKey in YYYY-MM-DD format", () => {
    const windowEnd = new Date("2025-06-10T00:00:00Z");
    const series = computeRevenueSeries([], 7, windowEnd);
    for (const bucket of series) {
      expect(bucket.jalaliKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("buckets are ordered oldest-first (ascending)", () => {
    const windowEnd = new Date("2025-06-10T00:00:00Z");
    const series = computeRevenueSeries([], 7, windowEnd);
    for (let i = 1; i < series.length; i++) {
      expect(series[i].jalaliKey >= series[i - 1].jalaliKey).toBe(true);
    }
  });
});

"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { formatMoney } from "@/lib/utils";

export function RevenueChart({
  data,
  currency,
  rtl = true,
}: {
  data: { day: string; revenue: number; orders: number }[];
  currency: string;
  rtl?: boolean;
}) {
  const margin = rtl
    ? { top: 8, right: -16, left: 8, bottom: 0 }
    : { top: 8, right: 8, left: -16, bottom: 0 };

  const yAxisOrientation = rtl ? ("right" as const) : ("left" as const);

  return (
    <div className="h-64 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={margin}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--brand))" stopOpacity={0.35} />
              <stop offset="100%" stopColor="hsl(var(--brand))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--line))" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: "hsl(var(--muted))" }}
            tickLine={false}
            axisLine={false}
            reversed={rtl}
          />
          <YAxis
            orientation={yAxisOrientation}
            tick={{ fontSize: 11, fill: "hsl(var(--muted))" }}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip
            formatter={(v: number) => [
              `${formatMoney(v)} ${currency}`,
              "درآمد (تومان)",
            ]}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid hsl(var(--line))",
              fontSize: 12,
              direction: "rtl",
            }}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="hsl(var(--brand))"
            strokeWidth={2.5}
            fill="url(#rev)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

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

export function RevenueChart({
  data,
  currency,
}: {
  data: { day: string; revenue: number; orders: number }[];
  currency: string;
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
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
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(var(--muted))" }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            formatter={(v: number) => [`${currency} ${v.toLocaleString("en-US")}`, "Revenue"]}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid hsl(var(--line))",
              fontSize: 12,
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

"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function TimelineChart({ data }: { data: { label: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="leadsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#eef2f5" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" interval="preserveStartEnd" minTickGap={32} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#94a3b8" width={44} />
        <Tooltip formatter={(v) => [String(v), "Leads"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Area dataKey="count" stroke="#2563eb" strokeWidth={2.5} fill="url(#leadsFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

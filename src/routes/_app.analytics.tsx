import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { useLivePayments } from "@/hooks/use-live-payments";
import { fetchPaymentsFn, type MpesaPayment } from "@/lib/payments";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/analytics")({
  loader: () => fetchPaymentsFn(),
  component: AnalyticsPage,
  head: () => ({ meta: [{ title: "Analytics — Paykit Admin" }] }),
});

const KES = (n: number) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(n);

const RANGES = [
  { label: "Today", days: 1 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
] as const;

const COLORS = ["oklch(0.62 0.13 183)", "oklch(0.65 0.18 38)", "oklch(0.55 0.20 263)"];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function buildDailySeries(payments: MpesaPayment[], days: number) {
  return Array.from({ length: days }, (_, i) => {
    const d = startOfDay(new Date());
    d.setDate(d.getDate() - (days - 1 - i));
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const revenue = payments
      .filter((p) => p.status === "Success" && p.createdAt >= d && p.createdAt < next)
      .reduce((acc, p) => acc + Number(p.amount), 0);
    return {
      label: d.toLocaleDateString("en-KE", { month: "short", day: "numeric" }),
      revenue,
    };
  });
}

function buildMethodBreakdown(payments: MpesaPayment[]) {
  const success = payments.filter((p) => p.status === "Success");
  const failed = payments.filter((p) => p.status === "Failed");
  const pending = payments.filter((p) => p.status === "Pending");
  return [
    { name: "Success", value: success.reduce((a, p) => a + Number(p.amount), 0) },
    { name: "Failed", value: failed.reduce((a, p) => a + Number(p.amount), 0) },
    { name: "Pending", value: pending.reduce((a, p) => a + Number(p.amount), 0) },
  ].filter((m) => m.value > 0);
}

function AnalyticsPage() {
  const initialPayments = Route.useLoaderData();
  const { payments } = useLivePayments(initialPayments);
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[2]);
  const [chartsReady, setChartsReady] = useState(false);

  useEffect(() => {
    setChartsReady(true);
  }, []);

  const data = buildDailySeries(payments, range.days);
  const methods = buildMethodBreakdown(payments);
  const total = methods.reduce((a, b) => a + b.value, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Deep dive into revenue and payment trends.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1 shadow-[var(--shadow-sm)]">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setRange(r)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                range.label === r.label
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)] lg:col-span-2">
          <h2 className="text-base font-semibold">Revenue over time</h2>
          <p className="mb-4 text-xs text-muted-foreground">{range.label}</p>
          <div className="h-80">
            {chartsReady ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ left: -12, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid stroke="oklch(1 0 0 / 7%)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="oklch(0.55 0.02 255)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="oklch(0.55 0.02 255)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid oklch(1 0 0 / 10%)",
                      background: "oklch(0.16 0.025 250)",
                      color: "oklch(0.95 0.005 250)",
                      fontSize: 12,
                    }}
                    formatter={(v) => KES(Number(v))}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="oklch(0.62 0.13 183)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, fill: "oklch(0.62 0.13 183)" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading chart...
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)]">
          <h2 className="text-base font-semibold">Payment status breakdown</h2>
          <p className="mb-4 text-xs text-muted-foreground">All time by amount</p>
          {methods.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              No data yet
            </div>
          ) : chartsReady ? (
            <>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={methods}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                    >
                      {methods.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => KES(Number(v))}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid oklch(1 0 0 / 10%)",
                        background: "oklch(0.16 0.025 250)",
                        color: "oklch(0.95 0.005 250)",
                        fontSize: 12,
                      }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-2">
                {methods.map((m, i) => (
                  <div key={m.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: COLORS[i % COLORS.length] }}
                      />
                      <span className="font-medium">{m.name}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {total > 0 ? ((m.value / total) * 100).toFixed(1) : "0.0"}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Loading chart...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Wallet,
  TrendingUp,
  CalendarRange,
  Calendar,
  Users as UsersIcon,
  ArrowRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { StatCard } from "@/components/StatCard";
import { useLivePayments } from "@/hooks/use-live-payments";
import { fetchPaymentsFn, type MpesaPayment } from "@/lib/payments";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/")({
  loader: () => fetchPaymentsFn(),
  component: DashboardPage,
  head: () => ({
    meta: [
      { title: "Dashboard — Paykit Admin" },
      { name: "description", content: "Track M-Pesa till payments in real time." },
    ],
  }),
});

const KES = (n: number) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(n);

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sumSuccess(list: MpesaPayment[]) {
  return list.filter((p) => p.status === "Success").reduce((acc, p) => acc + Number(p.amount), 0);
}

function computeStats(payments: MpesaPayment[]) {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);
  const yearStart = new Date(today.getFullYear(), 0, 1);

  const inRange = (start: Date, end?: Date) =>
    payments.filter((p) => {
      const d = new Date(p.createdAt);
      return d >= start && (!end || d <= end);
    });

  const todayP = inRange(today);
  const yesterdayP = inRange(yesterday, new Date(today.getTime() - 1));
  const monthP = inRange(monthStart);
  const lastMonthP = inRange(lastMonthStart, lastMonthEnd);
  const yearP = inRange(yearStart);

  const pct = (curr: number, prev: number) =>
    prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100;

  const phones = new Set(payments.map((p) => p.phone));

  return {
    totalRevenue: sumSuccess(payments),
    todayRevenue: sumSuccess(todayP),
    todayChange: pct(sumSuccess(todayP), sumSuccess(yesterdayP)),
    monthRevenue: sumSuccess(monthP),
    monthChange: pct(sumSuccess(monthP), sumSuccess(lastMonthP)),
    yearRevenue: sumSuccess(yearP),
    totalCustomers: phones.size,
  };
}

type ChartRange = "daily" | "7d" | "30d" | "yearly";

function buildChartData(payments: MpesaPayment[], range: ChartRange) {
  const now = new Date();

  if (range === "daily") {
    // 24 hourly buckets for today
    return Array.from({ length: 24 }, (_, h) => {
      const start = new Date(startOfDay(now));
      start.setHours(h);
      const end = new Date(start);
      end.setHours(h + 1);
      return {
        label: `${String(h).padStart(2, "0")}:00`,
        revenue: sumSuccess(payments.filter((p) => { const t = new Date(p.createdAt); return t >= start && t < end; })),
      };
    });
  }

  if (range === "yearly") {
    // 12 monthly buckets
    return Array.from({ length: 12 }, (_, i) => {
      const start = new Date(now.getFullYear(), i, 1);
      const end = new Date(now.getFullYear(), i + 1, 1);
      return {
        label: start.toLocaleDateString("en-KE", { month: "short" }),
        revenue: sumSuccess(payments.filter((p) => { const t = new Date(p.createdAt); return t >= start && t < end; })),
      };
    });
  }

  // 7d or 30d — daily buckets
  const days = range === "7d" ? 7 : 30;
  return Array.from({ length: days }, (_, i) => {
    const d = startOfDay(new Date());
    d.setDate(d.getDate() - (days - 1 - i));
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    return {
      label: d.toLocaleDateString("en-KE", { month: "short", day: "numeric" }),
      revenue: sumSuccess(payments.filter((p) => { const t = new Date(p.createdAt); return t >= d && t < next; })),
    };
  });
}

const RANGE_OPTIONS: { label: string; value: ChartRange }[] = [
  { label: "Daily", value: "daily" },
  { label: "7 Days", value: "7d" },
  { label: "Monthly", value: "30d" },
  { label: "Yearly", value: "yearly" },
];

const STATUS_COLORS = {
  Success: "#14b8a6",
  Pending: "#f59e0b",
  Failed: "#ef4444",
  Cancelled: "#6b7280",
};

function DashboardPage() {
  const initialPayments = Route.useLoaderData();
  const { payments, lastUpdated } = useLivePayments(initialPayments);
  const [chartsReady, setChartsReady] = useState(false);
  const [chartRange, setChartRange] = useState<ChartRange>("7d");

  useEffect(() => {
    setChartsReady(true);
  }, []);

  const stats = computeStats(payments);
  const chartData = buildChartData(payments, chartRange);
  const recent = [...payments]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 8);

  const statusCounts = ["Success", "Pending", "Failed", "Cancelled"].map((s) => ({
    name: s,
    value: payments.filter((p) => p.status === s).length,
  }));
  const totalTxns = payments.length || 1;
  const successPct = Math.round((statusCounts[0].value / totalTxns) * 100);

  return (
    <div className="space-y-7">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Welcome back — live data updated at{" "}
            {lastUpdated.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            Live · refreshes every 10s
          </span>
        </div>
      </header>

      {/* Gradient stat cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Revenue"
          value={KES(stats.totalRevenue)}
          sub="All-time till collections"
          icon={Wallet}
          gradient="primary"
        />
        <StatCard
          label="Today's Revenue"
          value={KES(stats.todayRevenue)}
          sub="Since midnight"
          change={stats.todayChange}
          icon={TrendingUp}
          gradient="blue"
        />
        <StatCard
          label="This Month"
          value={KES(stats.monthRevenue)}
          sub="Month to date"
          change={stats.monthChange}
          icon={CalendarRange}
          gradient="coral"
        />
        <StatCard
          label="This Year"
          value={KES(stats.yearRevenue)}
          sub={`${stats.totalCustomers} unique payees`}
          icon={Calendar}
          gradient="green"
        />
      </section>

      {/* Charts row */}
      <section className="grid gap-6 lg:grid-cols-3">
        {/* Bar chart */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)] lg:col-span-2">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Revenue trend</h2>
              <p className="text-xs text-muted-foreground">
                {chartRange === "daily" ? "Today · by hour" : chartRange === "7d" ? "Last 7 days" : chartRange === "30d" ? "Last 30 days" : "This year · by month"} · successful payments only
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Range switcher */}
              <div className="flex gap-0.5 rounded-lg p-0.5" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                {RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setChartRange(opt.value)}
                    className="rounded-md px-3 py-1 text-xs font-medium transition-all"
                    style={chartRange === opt.value
                      ? { background: "#14b8a6", color: "#fff", boxShadow: "0 2px 8px rgba(20,184,166,0.35)" }
                      : { color: "oklch(0.60 0.02 255)" }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <span
                className="rounded-xl px-3 py-1 text-sm font-semibold text-white shadow-sm"
                style={{ background: "var(--gradient-primary)" }}
              >
                {KES(chartData.reduce((a, b) => a + b.revenue, 0))}
              </span>
            </div>
          </div>
          <div className="h-64">
            {chartsReady ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ left: -8, right: 8, top: 8, bottom: 0 }} barCategoryGap="35%">
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#14b8a6" stopOpacity={1} />
                      <stop offset="100%" stopColor="#0d9488" stopOpacity={0.75} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="rgba(255,255,255,0.06)"
                    vertical={false}
                    strokeDasharray="4 4"
                  />
                  <XAxis
                    dataKey="label"
                    stroke="transparent"
                    tick={{ fill: "oklch(0.55 0.02 255)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    interval={chartRange === "daily" ? 3 : chartRange === "7d" ? 0 : chartRange === "30d" ? 4 : 0}
                  />
                  <YAxis
                    stroke="transparent"
                    tick={{ fill: "oklch(0.55 0.02 255)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={42}
                    domain={[0, "auto"]}
                    tickCount={6}
                    tickFormatter={(v) => {
                      if (v === 0) return "0";
                      if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
                      return String(v);
                    }}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "oklch(0.16 0.025 250)",
                      color: "oklch(0.95 0.005 250)",
                      fontSize: 12,
                      boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
                    }}
                    labelStyle={{ color: "oklch(0.60 0.02 255)", marginBottom: 4, fontSize: 11 }}
                    formatter={(v) => [KES(Number(v)), "Revenue"]}
                  />
                  <Bar
                    dataKey="revenue"
                    fill="url(#barGrad)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={chartRange === "7d" ? 40 : chartRange === "daily" ? 20 : 28}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading chart…
              </div>
            )}
          </div>
        </div>

        {/* Donut chart */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)]">
          <div className="mb-5">
            <h2 className="text-base font-semibold">Transaction Status</h2>
            <p className="text-xs text-muted-foreground">All time breakdown</p>
          </div>
          <div className="relative h-52">
            {chartsReady ? (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusCounts}
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={84}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {statusCounts.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={STATUS_COLORS[entry.name as keyof typeof STATUS_COLORS]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: 10,
                        fontSize: 12,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "oklch(0.16 0.025 250)",
                        color: "oklch(0.95 0.005 250)",
                        boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Centre label */}
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold">{successPct}%</span>
                  <span className="text-xs text-muted-foreground">Success rate</span>
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading chart…
              </div>
            )}
          </div>
          {/* Legend */}
          <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2">
            {statusCounts.map((s) => (
              <div key={s.name} className="flex items-center gap-1.5 text-xs">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: STATUS_COLORS[s.name as keyof typeof STATUS_COLORS] }}
                />
                <span className="text-muted-foreground">{s.name}</span>
                <span className="ml-auto font-semibold">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recent payments */}
      <section className="rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold">Recent Payments</h2>
            <p className="text-xs text-muted-foreground">Latest till transactions</p>
          </div>
          <a
            href="/payments"
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ background: "var(--gradient-primary)" }}
          >
            View all <ArrowRight className="h-3 w-3" />
          </a>
        </div>

        {recent.length === 0 ? (
          <div className="px-6 py-14 text-center text-sm text-muted-foreground">
            No payments yet. Payments made directly to the till number will appear here automatically.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recent.map((p) => {
              const statusStyle: Record<string, string> = {
                Success: "bg-success/10 text-success",
                Pending: "bg-warning/10 text-warning",
                Failed: "bg-destructive/10 text-destructive",
                Cancelled: "bg-muted text-muted-foreground",
              };
              return (
                <div key={p.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-secondary/30 transition-colors">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm"
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    {p.phone.slice(-2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.phone}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.accountReference ?? "—"}
                      {p.mpesaReceiptNumber ? ` · ${p.mpesaReceiptNumber}` : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                      statusStyle[p.status],
                    )}
                  >
                    {p.status}
                  </span>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold">{KES(Number(p.amount))}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.createdAt.toLocaleDateString("en-KE", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

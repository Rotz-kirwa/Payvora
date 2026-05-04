import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Download, ArrowUpDown, Wallet, TrendingUp, CalendarDays, CalendarRange, Calendar } from "lucide-react";
import { useLivePayments } from "@/hooks/use-live-payments";
import { cn } from "@/lib/utils";
import { fetchPaymentsFn, recheckPaymentStatusFn, type MpesaPayment } from "@/lib/payments";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/payments")({
  loader: () => fetchPaymentsFn(),
  component: PaymentsPage,
  head: () => ({ meta: [{ title: "Payments — Paykit Admin" }] }),
});

type MpesaStatus = MpesaPayment["status"];

const KES = (n: number | string) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(Number(n));

// Safaricom hashes the MSISDN (SHA-256 hex) for Buy Goods privacy — show "Private" for those
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) {
    return `+254 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  // Hashed MSISDN: contains hex letters or way too many digits
  if (/[a-fA-F]/.test(phone) || digits.length > 15) {
    return "Private";
  }
  return phone;
}

const STATUS_STYLES: Record<MpesaStatus, string> = {
  Success: "bg-success/10 text-success",
  Pending: "bg-warning/10 text-warning",
  Failed: "bg-destructive/10 text-destructive",
  Cancelled: "bg-muted text-muted-foreground",
};

const PAGE_SIZE = 12;

const CARD_GRADIENTS = {
  primary: "var(--gradient-primary)",
  blue: "var(--gradient-blue)",
  coral: "var(--gradient-coral)",
  green: "var(--gradient-green)",
  orange: "var(--gradient-orange)",
};

function SummaryCard({
  label,
  value,
  sub,
  icon: Icon,
  gradient = "primary",
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  gradient?: keyof typeof CARD_GRADIENTS;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 text-white shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5"
      style={{ background: CARD_GRADIENTS[gradient] }}
    >
      <div className="pointer-events-none absolute -right-3 -top-3 h-20 w-20 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-4 -right-4 h-24 w-24 rounded-full bg-white/10" />
      <div className="relative flex items-center justify-between">
        <p className="text-xs font-medium text-white/80">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
          <Icon className="h-4 w-4 text-white" />
        </span>
      </div>
      <p className="relative mt-2 text-2xl font-bold tracking-tight text-white">{value}</p>
      <p className="relative mt-0.5 text-xs text-white/70">{sub}</p>
    </div>
  );
}

function StatusBadge({ payment, onRefresh }: { payment: MpesaPayment; onRefresh: () => void }) {
  const [loading, setLoading] = useState(false);

  const recheck = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      const result = await recheckPaymentStatusFn({ data: payment.id });
      toast.success(`Status updated to ${result.status}`);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to re-check status");
    } finally {
      setLoading(false);
    }
  };

  const showRefresh = payment.source === "stk_push" && payment.status !== "Success";

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
          STATUS_STYLES[payment.status],
        )}
      >
        {payment.status}
      </span>
      {showRefresh && (
        <button
          onClick={recheck}
          disabled={loading}
          className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
          title="Re-check status with Safaricom"
        >
          <ArrowUpDown className={cn("h-3 w-3", loading && "animate-spin")} />
        </button>
      )}
    </div>
  );
}

function PaymentsPage() {
  const loaderData = Route.useLoaderData();
  const { payments, refresh, isRefreshing, lastUpdated } = useLivePayments(loaderData);
  const [query, setQuery] = useState("");
const [sortDesc, setSortDesc] = useState(true);
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");
  const [page, setPage] = useState(1);

  const stats = useMemo(() => {
    const success = payments.filter((p) => p.status === "Success");
    const sum = (list: MpesaPayment[]) =>
      list.filter((p) => p.status === "Success").reduce((acc, p) => acc + Number(p.amount), 0);

    const now = new Date();
    const startOf = (unit: "day" | "week" | "month" | "year") => {
      const d = new Date(now);
      if (unit === "day") { d.setHours(0, 0, 0, 0); return d; }
      if (unit === "week") { d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d; }
      if (unit === "month") { return new Date(d.getFullYear(), d.getMonth(), 1); }
      return new Date(d.getFullYear(), 0, 1);
    };
    const since = (start: Date) => payments.filter((p) => new Date(p.createdAt) >= start);

    const yesterday = new Date(startOf("day"));
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayEnd = new Date(startOf("day").getTime() - 1);
    const yesterdayPayments = payments.filter(
      (p) => new Date(p.createdAt) >= yesterday && new Date(p.createdAt) <= yesterdayEnd,
    );

    return {
      totalCollected: success.reduce((acc, p) => acc + Number(p.amount), 0),
      totalCount: success.length,
      today: sum(since(startOf("day"))),
      yesterday: sum(yesterdayPayments),
      thisWeek: sum(since(startOf("week"))),
      thisMonth: sum(since(startOf("month"))),
      thisYear: sum(since(startOf("year"))),
    };
  }, [payments]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const list = payments.filter((p) => {
      if (!q) return true;
      return (
        p.phone.toLowerCase().includes(q) ||
        (p.payerName?.toLowerCase().includes(q) ?? false) ||
        (p.mpesaReceiptNumber?.toLowerCase().includes(q) ?? false) ||
        (p.accountReference?.toLowerCase().includes(q) ?? false) ||
        (p.checkoutRequestId?.toLowerCase().includes(q) ?? false)
      );
    });
    list.sort((a, b) => {
      const av = sortBy === "amount" ? Number(a.amount) : +new Date(a.createdAt);
      const bv = sortBy === "amount" ? Number(b.amount) : +new Date(b.createdAt);
      return sortDesc ? bv - av : av - bv;
    });
    return list;
  }, [payments, query, status, sortBy, sortDesc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const slice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const exportCsv = () => {
    const headers = ["Payer", "Phone", "Receipt", "Amount", "Status", "Date"];
    const rows = filtered.map((p) => [
      p.payerName ?? "",
      formatPhone(p.phone),
      p.mpesaReceiptNumber ?? "",
      p.amount,
      p.status,
      p.createdAt,
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mpesa-payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSort = (key: "date" | "amount") => {
    if (sortBy === key) setSortDesc(!sortDesc);
    else {
      setSortBy(key);
      setSortDesc(true);
    }
  };

  const updatedLabel = lastUpdated.toLocaleTimeString("en-KE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Payments</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                isRefreshing ? "bg-warning animate-pulse" : "bg-success animate-pulse",
              )}
            />
            <span>Live · updated {updatedLabel}</span>
            <span className="text-border">·</span>
            <span>{payments.length} total transactions</span>
          </div>
        </div>
        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium shadow-[var(--shadow-sm)] hover:bg-secondary"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </header>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <SummaryCard
          label="Total Collected"
          value={KES(stats.totalCollected)}
          sub={`${stats.totalCount} payment${stats.totalCount !== 1 ? "s" : ""} · all time`}
          icon={Wallet}
          gradient="primary"
        />
        <SummaryCard
          label="Today"
          value={KES(stats.today)}
          sub="Since midnight"
          icon={TrendingUp}
          gradient="blue"
        />
        <SummaryCard
          label="Yesterday"
          value={KES(stats.yesterday)}
          sub="Previous day"
          icon={CalendarDays}
          gradient="coral"
        />
        <SummaryCard
          label="This Week"
          value={KES(stats.thisWeek)}
          sub="Sun – today"
          icon={CalendarRange}
          gradient="orange"
        />
        <SummaryCard
          label="This Month"
          value={KES(stats.thisMonth)}
          sub="Month to date"
          icon={Calendar}
          gradient="green"
        />
        <SummaryCard
          label="This Year"
          value={KES(stats.thisYear)}
          sub="Year to date"
          icon={Calendar}
          gradient="primary"
        />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, phone, receipt or reference…"
              className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-4 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-6 py-3 font-medium">Payer</th>
                <th className="px-6 py-3 font-medium">Phone</th>
                <th className="px-6 py-3 font-medium">Receipt</th>
                <th className="px-6 py-3 font-medium">
                  <button
                    onClick={() => toggleSort("amount")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Amount <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">
                  <button
                    onClick={() => toggleSort("date")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Date <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {slice.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-secondary/40">
                  <td className="px-6 py-3.5 font-medium">{p.payerName ?? "—"}</td>
                  <td className="px-6 py-3.5 text-muted-foreground">{formatPhone(p.phone)}</td>
                  <td className="px-6 py-3.5 font-mono text-xs">{p.mpesaReceiptNumber ?? "—"}</td>
                  <td className="px-6 py-3.5 font-semibold">{KES(p.amount)}</td>
                  <td className="px-6 py-3.5">
                    <StatusBadge payment={p} onRefresh={refresh} />
                  </td>
                  <td className="px-6 py-3.5 text-muted-foreground">
                    {new Date(p.createdAt).toLocaleString("en-KE", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
              {slice.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-sm text-muted-foreground">
                    {payments.length === 0
                      ? "No payments yet. Payments made directly to the till number will appear here automatically."
                      : "No payments match your search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-border px-6 py-3">
          <p className="text-xs text-muted-foreground">
            Page {safePage} of {totalPages} · {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(Math.max(1, safePage - 1))}
              disabled={safePage === 1}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-secondary"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages, safePage + 1))}
              disabled={safePage === totalPages}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-secondary"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

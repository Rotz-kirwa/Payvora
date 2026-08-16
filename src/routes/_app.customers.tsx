import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useLivePayments } from "@/hooks/use-live-payments";
import { fetchPaymentsFn, type MpesaPayment } from "@/lib/payments";

export const Route = createFileRoute("/_app/customers")({
  loader: () => fetchPaymentsFn(),
  component: CustomersPage,
  head: () => ({ meta: [{ title: "Customers — Payvora Admin" }] }),
});

const KES = (n: number) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(n);

function buildCustomers(payments: MpesaPayment[]) {
  const map = new Map<string, { phone: string; count: number; total: number; lastDate: Date }>();
  for (const p of payments) {
    const existing = map.get(p.phone);
    const amount = p.status === "Success" ? Number(p.amount) : 0;
    if (existing) {
      existing.count += 1;
      existing.total += amount;
      if (p.createdAt > existing.lastDate) existing.lastDate = p.createdAt;
    } else {
      map.set(p.phone, { phone: p.phone, count: 1, total: amount, lastDate: p.createdAt });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function CustomersPage() {
  const initialPayments = Route.useLoaderData();
  const { payments } = useLivePayments(initialPayments);
  const [query, setQuery] = useState("");

  const customers = useMemo(() => buildCustomers(payments), [payments]);

  const list = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter((c) => c.phone.toLowerCase().includes(q));
  }, [customers, query]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">{customers.length} total customers</p>
        </div>
      </header>

      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]">
        <div className="border-b border-border p-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by phone…"
              className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-4 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-6 py-3 font-medium">Phone</th>
                <th className="px-6 py-3 font-medium text-right">Transactions</th>
                <th className="px-6 py-3 font-medium text-right">Total Paid</th>
                <th className="px-6 py-3 font-medium">Last Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.slice(0, 50).map((c) => (
                <tr key={c.phone} className="transition-colors hover:bg-secondary/40">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                        {c.phone.slice(-2)}
                      </div>
                      <span className="font-medium">{c.phone}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5 text-right">{c.count}</td>
                  <td className="px-6 py-3.5 text-right font-semibold">{KES(c.total)}</td>
                  <td className="px-6 py-3.5 text-muted-foreground">
                    {c.lastDate.toLocaleDateString("en-KE", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center text-sm text-muted-foreground">
                    {customers.length === 0
                      ? "No customers yet. Payments will appear here once processed."
                      : "No customers match your search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

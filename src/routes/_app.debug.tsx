import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Play,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Explicit serializable types (no `unknown` — required by TanStack's validator) ─

type AuditRow = {
  id: string;
  route: string;
  method: string;
  eventType: string;
  transId: string | null;
  checkoutRequestId: string | null;
  phoneMasked: string | null;
  amount: string | null;
  shortcode: string | null;
  processingStatus: string;
  resultCode: number | null;
  resultDesc: string | null;
  errorMessage: string | null;
  createdAt: string;
};

type DebugData = {
  auditSummary: {
    ok: boolean;
    counts: { total: number; last24h: number; latest: string | null } | null;
    recent: AuditRow[];
    error: string | null;
  };
  debugStats: { total: number; last_hour: number; last_24h: number; latest: string | null } | null;
  envHealth: {
    callbackUrl: string | null;
    shortcode: string | null;
    environment: string | null;
    allVarsSet: boolean;
  };
};

// ─── Server functions ─────────────────────────────────────────────────────────

const getDebugDataFn = createServerFn({ method: "GET" }).handler(async (): Promise<DebugData> => {
  const { requireCurrentUser } = await import("../lib/auth.server");
  await requireCurrentUser();

  const { getCallbackAuditSummary } = await import("../lib/callback-audit.server");
  const { getDebugLogStats } = await import("../lib/debug.server");

  const [auditRaw, debugStatsRaw] = await Promise.all([
    getCallbackAuditSummary(),
    getDebugLogStats(),
  ]);

  // JSON round-trip strips non-plain types (postgres.RowList, Date, etc.)
  const plain = JSON.parse(JSON.stringify({ auditRaw, debugStatsRaw })) as {
    auditRaw: typeof auditRaw;
    debugStatsRaw: typeof debugStatsRaw;
  };

  return {
    auditSummary: {
      ok: plain.auditRaw.ok,
      counts: plain.auditRaw.counts as DebugData["auditSummary"]["counts"],
      recent: (plain.auditRaw.recent ?? []) as AuditRow[],
      error: plain.auditRaw.error,
    },
    debugStats: plain.debugStatsRaw as DebugData["debugStats"],
    envHealth: {
      callbackUrl: process.env.MPESA_CALLBACK_URL ?? null,
      shortcode: process.env.MPESA_SHORTCODE ?? null,
      environment: process.env.MPESA_ENVIRONMENT ?? null,
      allVarsSet: !!(
        process.env.DATABASE_URL &&
        process.env.JWT_SECRET &&
        process.env.MPESA_CONSUMER_KEY &&
        process.env.MPESA_CONSUMER_SECRET &&
        process.env.MPESA_PASSKEY &&
        process.env.MPESA_SHORTCODE &&
        process.env.MPESA_CALLBACK_URL
      ),
    },
  };
});

const simulateC2bFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireCurrentUser } = await import("../lib/auth.server");
  await requireCurrentUser();

  const transId = `SIM${Date.now()}`;
  const payload = {
    TransID: transId,
    TransTime: new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14),
    TransAmount: "1.00",
    BusinessShortCode: process.env.MPESA_SHORTCODE ?? "6270335",
    BillRefNumber: "debug-simulate",
    MSISDN: "254700000000",
    FirstName: "Debug",
    LastName: "Simulate",
    MiddleName: "",
  };

  const { handleC2bConfirmation } = await import("../lib/mpesa-callback.server");
  const result = await handleC2bConfirmation(payload);
  return { ok: true, transId, result };
});

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_app/debug")({
  component: DebugPage,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700",
      )}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}

function formatDate(val: string | null | undefined): string {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleString();
  } catch {
    return val;
  }
}

function EventRow({ row }: { row: AuditRow }) {
  const [open, setOpen] = useState(false);
  const ok = row.processingStatus === "accepted";
  const failed = row.processingStatus === "failed" || row.processingStatus === "parse_failed";

  return (
    <>
      <tr
        className="cursor-pointer hover:bg-secondary/40 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="px-4 py-2">
          {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </td>
        <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
          {formatDate(row.createdAt)}
        </td>
        <td className="px-4 py-2 text-xs font-mono">{String(row.eventType ?? "—")}</td>
        <td className="px-4 py-2 text-xs font-mono">{String(row.route ?? "—")}</td>
        <td className="px-4 py-2 text-xs">{String(row.transId ?? "—")}</td>
        <td className="px-4 py-2 text-xs">{String(row.amount ?? "—")}</td>
        <td className="px-4 py-2 text-xs">{String(row.phoneMasked ?? "—")}</td>
        <td className="px-4 py-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-semibold",
              ok ? "bg-emerald-100 text-emerald-700" : failed ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700",
            )}
          >
            {String(row.processingStatus ?? "—")}
          </span>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8} className="bg-secondary/20 px-6 py-3">
            {row.errorMessage && (
              <p className="mb-2 text-xs text-red-600">
                <strong>Error:</strong> {String(row.errorMessage)}
              </p>
            )}
            <pre className="overflow-x-auto rounded bg-black/5 p-2 text-xs whitespace-pre-wrap break-all max-h-48">
              {JSON.stringify(row, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

function DebugPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getDebugDataFn>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<{ ok: boolean; transId?: string; error?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const result = await getDebugDataFn();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load debug data");
    } finally {
      setLoading(false);
    }
  }

  async function simulate() {
    setSimulating(true);
    setSimResult(null);
    try {
      const result = await simulateC2bFn();
      setSimResult({ ok: result.ok, transId: result.transId });
      await refresh();
    } catch (err) {
      setSimResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setSimulating(false);
    }
  }

  const audit = data?.auditSummary;
  const env = data?.envHealth;
  const stats = data?.debugStats;
  const recentEvents = audit?.recent ?? [];
  const counts = audit?.counts;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Debug</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            M-Pesa callback audit &amp; health monitoring
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={simulate}
            disabled={simulating || loading}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {simulating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Simulate Payment
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Simulation result */}
      {simResult && (
        <div
          className={cn(
            "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
            simResult.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800",
          )}
        >
          {simResult.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>
            {simResult.ok
              ? `Simulated payment processed — TransID: ${simResult.transId}. Check Payments page.`
              : `Simulation failed: ${simResult.error}`}
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {!data && !loading && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Activity className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Click Refresh to load debug data</p>
          <button
            onClick={refresh}
            className="mt-4 rounded-xl bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Load Debug Data
          </button>
        </div>
      )}

      {data && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Total Callbacks", value: String(counts?.total ?? 0) },
              { label: "Last 24 h", value: String(counts?.last24h ?? 0) },
              { label: "Debug Log Rows", value: String(stats?.total ?? 0) },
              { label: "Latest Event", value: formatDate(counts?.latest) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-border bg-white p-4 shadow-sm">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-lg font-bold">{value}</p>
              </div>
            ))}
          </div>

          {/* Environment health */}
          <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
            <h2 className="mb-3 font-semibold">Environment Health</h2>
            <div className="flex flex-wrap gap-3">
              <Badge ok={!!env?.allVarsSet} label="All env vars" />
              <Badge ok={env?.environment === "production"} label={`M-Pesa: ${env?.environment ?? "unknown"}`} />
              <Badge ok={!!env?.shortcode} label={`Shortcode: ${env?.shortcode ?? "not set"}`} />
            </div>
            {env?.callbackUrl && (
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <p>
                  <strong>Callback base URL:</strong>{" "}
                  <code className="rounded bg-secondary px-1">{env.callbackUrl}</code>
                </p>
                <p>
                  <strong>C2B confirmation:</strong>{" "}
                  <code className="rounded bg-secondary px-1">
                    {env.callbackUrl}/api/payments/c2b/confirmation
                  </code>
                </p>
                <p>
                  <strong>C2B validation:</strong>{" "}
                  <code className="rounded bg-secondary px-1">
                    {env.callbackUrl}/api/payments/c2b/validation
                  </code>
                </p>
              </div>
            )}
          </div>

          {/* Recent callback events */}
          <div className="rounded-xl border border-border bg-white shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-semibold">Recent Callback Events</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                All HTTP requests that hit any M-Pesa callback endpoint (latest 20)
              </p>
            </div>
            {recentEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="mb-2 h-8 w-8 text-amber-400" />
                <p className="font-medium text-sm">No callbacks recorded</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Safaricom has not sent any callbacks to this server yet.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30 text-xs text-muted-foreground">
                      <th className="px-4 py-2 text-left w-4" />
                      <th className="px-4 py-2 text-left">Time</th>
                      <th className="px-4 py-2 text-left">Type</th>
                      <th className="px-4 py-2 text-left">Route</th>
                      <th className="px-4 py-2 text-left">Trans ID</th>
                      <th className="px-4 py-2 text-left">Amount</th>
                      <th className="px-4 py-2 text-left">Phone</th>
                      <th className="px-4 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {recentEvents.map((row) => (
                      <EventRow key={String(row.id)} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Audit error */}
          {audit && !audit.ok && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <strong>Audit table error:</strong> {String(audit.error)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

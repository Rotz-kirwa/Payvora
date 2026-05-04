import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState, useMemo, useCallback } from "react";
import { z } from "zod";
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight, MessageSquare,
  Send, CheckCircle2, XCircle, AlertTriangle, Loader2, X,
  Zap, ZapOff, Bell, Clock, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { RuleRow, LogRow } from "@/lib/sms-automation.server";

// ─── Server functions ─────────────────────────────────────────────────────────

const fetchSmsDataFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireCurrentUser } = await import("../lib/auth.server");
  await requireCurrentUser();
  const {
    fetchAllRules, fetchRecentLogs, fetchLogStats, getSmsAutomationEnabled,
  } = await import("../lib/sms-automation.server");
  const [rules, logs, stats, globalEnabled] = await Promise.all([
    fetchAllRules(), fetchRecentLogs(50), fetchLogStats(), getSmsAutomationEnabled(),
  ]);
  return { rules, logs, stats, globalEnabled };
});

const setGlobalAutomationFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.boolean().parse(v))
  .handler(async ({ data: enabled }) => {
    const { requireCurrentUser } = await import("../lib/auth.server");
    await requireCurrentUser();
    const { setSmsAutomationEnabled } = await import("../lib/sms-automation.server");
    await setSmsAutomationEnabled(enabled);
    return { enabled };
  });

const ruleSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  minAmount: z.number().positive("Must be positive"),
  maxAmount: z.number().positive("Must be positive"),
  messageTemplate: z.string().min(5, "Message too short").max(480, "Max 480 characters"),
  isActive: z.boolean(),
});

const createRuleFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => ruleSchema.parse(v))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("../lib/auth.server");
    await requireCurrentUser();
    const { createRule } = await import("../lib/sms-automation.server");
    return createRule(data);
  });

const updateRuleFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ id: z.string(), ...ruleSchema.shape }).parse(v))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("../lib/auth.server");
    await requireCurrentUser();
    const { updateRule } = await import("../lib/sms-automation.server");
    const { id, ...rest } = data;
    return updateRule(id, rest);
  });

const deleteRuleFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.string().parse(v))
  .handler(async ({ data: id }) => {
    const { requireCurrentUser } = await import("../lib/auth.server");
    await requireCurrentUser();
    const { deleteRule } = await import("../lib/sms-automation.server");
    await deleteRule(id);
    return { id };
  });

const toggleRuleFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ id: z.string(), isActive: z.boolean() }).parse(v))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("../lib/auth.server");
    await requireCurrentUser();
    const { toggleRuleStatus } = await import("../lib/sms-automation.server");
    return toggleRuleStatus(data.id, data.isActive);
  });

const testSmsFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ ruleId: z.string(), phone: z.string().min(9) }).parse(v))
  .handler(async ({ data }) => {
    const { sendTestSms } = await import("../lib/sms-automation.server");
    const result = await sendTestSms(data.ruleId, data.phone);
    return { success: result.success, message: result.message, error: result.error ?? null };
  });

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_app/sms-automation")({
  loader: () => fetchSmsDataFn(),
  component: SmsAutomationPage,
  head: () => ({ meta: [{ title: "SMS Automation — Paykit Admin" }] }),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const KES = (n: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n);

const PLACEHOLDERS = [
  { tag: "{customer_name}", desc: "Customer phone as name" },
  { tag: "{phone}",         desc: "Raw phone number" },
  { tag: "{amount}",        desc: "Payment amount (KES)" },
  { tag: "{transaction_code}", desc: "M-Pesa receipt code" },
  { tag: "{date}",          desc: "Payment date & time" },
  { tag: "{business_name}", desc: "Business name" },
];

function buildPreview(template: string): string {
  return template
    .replace(/\{customer_name\}/gi, "John Doe")
    .replace(/\{phone\}/gi, "254712345678")
    .replace(/\{amount\}/gi, "150.00")
    .replace(/\{transaction_code\}/gi, "RGK7X2Y9AB")
    .replace(/\{date\}/gi, "02 May 2026, 14:30")
    .replace(/\{business_name\}/gi, "MOBOSOFT ENTERPRISE HQ");
}

// ─── Rule Modal ───────────────────────────────────────────────────────────────

type ModalMode = { mode: "add" } | { mode: "edit"; rule: RuleRow };

function RuleModal({
  modalMode,
  onClose,
  onSaved,
}: {
  modalMode: ModalMode;
  onClose: () => void;
  onSaved: (rule: RuleRow) => void;
}) {
  const editing = modalMode.mode === "edit" ? modalMode.rule : null;

  const [name, setName] = useState(editing?.name ?? "");
  const [min, setMin] = useState(editing ? String(editing.minAmount) : "");
  const [max, setMax] = useState(editing ? String(editing.maxAmount) : "");
  const [template, setTemplate] = useState(
    editing?.messageTemplate ??
      "Dear {customer_name}, thank you for paying KES {amount}. Receipt: {transaction_code}. Date: {date}.",
  );
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showPlaceholders, setShowPlaceholders] = useState(false);

  const preview = useMemo(() => buildPreview(template), [template]);
  const charCount = template.length;

  function insertTag(tag: string) {
    setTemplate((t) => t + tag);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const minN = parseFloat(min);
    const maxN = parseFloat(max);
    if (!name.trim()) { setError("Rule name is required."); return; }
    if (isNaN(minN) || minN <= 0) { setError("Minimum amount must be a positive number."); return; }
    if (isNaN(maxN) || maxN <= 0) { setError("Maximum amount must be a positive number."); return; }
    if (minN >= maxN) { setError("Minimum must be less than maximum amount."); return; }
    if (!template.trim()) { setError("Message template cannot be empty."); return; }

    setLoading(true);
    try {
      let result;
      if (editing) {
        result = await updateRuleFn({ data: { id: editing.id, name, minAmount: minN, maxAmount: maxN, messageTemplate: template, isActive } });
      } else {
        result = await createRuleFn({ data: { name, minAmount: minN, maxAmount: maxN, messageTemplate: template, isActive } });
      }

      if (result && "type" in result) {
        if (result.type === "overlap") {
          const names = result.conflicting.map((r: RuleRow) => `"${r.name}" (${KES(r.minAmount)}–${KES(r.maxAmount)})`).join(", ");
          setError(`Range overlaps with active rule(s): ${names}. Disable them first, or make this rule inactive.`);
        } else {
          setError(result.message);
        }
      } else {
        onSaved(result as RuleRow);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleTestSms() {
    if (!testPhone.trim()) { setTestResult({ ok: false, msg: "Enter a phone number first." }); return; }
    if (!editing) { setTestResult({ ok: false, msg: "Save the rule first, then test." }); return; }
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await testSmsFn({ data: { ruleId: editing.id, phone: testPhone.trim() } });
      setTestResult({ ok: res.success, msg: res.success ? `SMS sent! Preview: "${res.message}"` : `Failed: ${res.error}` });
    } catch (err) {
      setTestResult({ ok: false, msg: err instanceof Error ? err.message : "Test failed" });
    } finally {
      setTestLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card shadow-[var(--shadow-lg)] flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <h2 className="text-base font-semibold">
            {editing ? "Edit Rule" : "Add SMS Automation Rule"}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Name + Status row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rule Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. KES 1 - 50 Package"
                className="mt-1.5 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</label>
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                className={cn(
                  "mt-1.5 flex h-9 w-full items-center justify-center gap-2 rounded-lg border text-xs font-semibold transition-colors",
                  isActive
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-border bg-secondary text-muted-foreground",
                )}
              >
                {isActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                {isActive ? "Active" : "Inactive"}
              </button>
            </div>
          </div>

          {/* Amount range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Min Amount (KES)</label>
              <input
                type="number" min="1" step="any"
                value={min}
                onChange={(e) => setMin(e.target.value)}
                placeholder="e.g. 1"
                className="mt-1.5 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Max Amount (KES)</label>
              <input
                type="number" min="1" step="any"
                value={max}
                onChange={(e) => setMax(e.target.value)}
                placeholder="e.g. 50"
                className="mt-1.5 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Message template */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                SMS Message Template
              </label>
              <span className={cn("text-xs", charCount > 460 ? "text-destructive" : "text-muted-foreground")}>
                {charCount}/480
              </span>
            </div>
            <textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={4}
              placeholder="Type your SMS message…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary resize-none"
            />

            {/* Placeholder insert buttons */}
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowPlaceholders(!showPlaceholders)}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {showPlaceholders ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Insert placeholder
              </button>
              {showPlaceholders && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {PLACEHOLDERS.map((p) => (
                    <button
                      key={p.tag}
                      type="button"
                      onClick={() => insertTag(p.tag)}
                      title={p.desc}
                      className="rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-xs hover:bg-primary/10 hover:border-primary hover:text-primary transition-colors"
                    >
                      {p.tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-border bg-secondary/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Live Preview</p>
            <p className="text-sm leading-relaxed text-foreground">{preview || <span className="italic text-muted-foreground">Start typing to see preview…</span>}</p>
          </div>

          {/* Test SMS */}
          {editing && (
            <div className="rounded-xl border border-border p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Send Test SMS</p>
              <div className="flex gap-2">
                <input
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="0712 345 678"
                  className="flex-1 h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={handleTestSms}
                  disabled={testLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 h-9 text-xs font-semibold text-white disabled:opacity-60"
                  style={{ background: "var(--gradient-blue)" }}
                >
                  {testLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Send Test
                </button>
              </div>
              {testResult && (
                <p className={cn("text-xs", testResult.ok ? "text-success" : "text-destructive")}>
                  {testResult.ok ? "✓" : "✗"} {testResult.msg}
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-border px-4 text-sm font-medium hover:bg-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            form=""
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-lg px-5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--gradient-primary)" }}
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {editing ? "Save Changes" : "Create Rule"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({
  rule,
  onCancel,
  onDeleted,
}: {
  rule: RuleRow;
  onCancel: () => void;
  onDeleted: (id: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      await deleteRuleFn({ data: rule.id });
      onDeleted(rule.id);
    } catch {
      toast.error("Failed to delete rule");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-lg)]">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 mb-4">
          <Trash2 className="h-5 w-5 text-destructive" />
        </div>
        <h3 className="text-base font-semibold mb-1">Delete Rule</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Delete <strong>"{rule.name}"</strong>? This cannot be undone. Past SMS logs will be kept.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="h-9 rounded-lg border border-border px-4 text-sm font-medium hover:bg-secondary">
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-destructive px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function SmsAutomationPage() {
  const loaded = Route.useLoaderData();
  const [rules, setRules] = useState<RuleRow[]>(loaded.rules);
  const [logs] = useState<LogRow[]>(loaded.logs);
  const [stats, setStats] = useState(loaded.stats);
  const [globalEnabled, setGlobalEnabled] = useState(loaded.globalEnabled);
  const [globalToggling, setGlobalToggling] = useState(false);
  const [modal, setModal] = useState<ModalMode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RuleRow | null>(null);
  const [activeTab, setActiveTab] = useState<"rules" | "logs">("rules");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const activeRules = useMemo(() => rules.filter((r) => r.isActive).length, [rules]);

  async function handleGlobalToggle() {
    setGlobalToggling(true);
    try {
      const res = await setGlobalAutomationFn({ data: !globalEnabled });
      setGlobalEnabled(res.enabled);
      toast.success(res.enabled ? "SMS automation enabled" : "SMS automation paused");
    } catch {
      toast.error("Failed to update automation status");
    } finally {
      setGlobalToggling(false);
    }
  }

  const handleRuleSaved = useCallback((saved: RuleRow) => {
    setRules((prev) => {
      const idx = prev.findIndex((r) => r.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next.sort((a, b) => a.minAmount - b.minAmount);
      }
      return [...prev, saved].sort((a, b) => a.minAmount - b.minAmount);
    });
    setModal(null);
    toast.success(`Rule "${saved.name}" saved`);
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    setDeleteTarget(null);
    toast.success("Rule deleted");
  }, []);

  async function handleToggle(rule: RuleRow) {
    setTogglingId(rule.id);
    try {
      const result = await toggleRuleFn({ data: { id: rule.id, isActive: !rule.isActive } });
      if (result && "type" in result && result.type === "overlap") {
        const names = result.conflicting.map((r: RuleRow) => `"${r.name}"`).join(", ");
        toast.error(`Cannot enable: overlaps with ${names}`);
      } else {
        const updated = result as RuleRow;
        setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        toast.success(`Rule ${updated.isActive ? "enabled" : "disabled"}`);
      }
    } catch {
      toast.error("Failed to toggle rule");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {modal && (
        <RuleModal
          modalMode={modal}
          onClose={() => setModal(null)}
          onSaved={handleRuleSaved}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          rule={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}

      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">SMS Automation</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Auto-send SMS messages to customers when payments match a configured range.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Global toggle */}
          <button
            onClick={handleGlobalToggle}
            disabled={globalToggling}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-all disabled:opacity-60",
              globalEnabled
                ? "border-success/30 bg-success/10 text-success hover:bg-success/15"
                : "border-border bg-secondary text-muted-foreground hover:bg-secondary/80",
            )}
          >
            {globalToggling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : globalEnabled ? (
              <Zap className="h-4 w-4" />
            ) : (
              <ZapOff className="h-4 w-4" />
            )}
            {globalEnabled ? "Automation ON" : "Automation OFF"}
          </button>

          <button
            onClick={() => setModal({ mode: "add" })}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Plus className="h-4 w-4" /> Add Rule
          </button>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Active Rules", value: activeRules, icon: Zap, gradient: "primary" },
          { label: "Total Rules", value: rules.length, icon: Bell, gradient: "blue" },
          { label: "SMS Sent Today", value: stats.todaySent, icon: Send, gradient: "green" },
          { label: "Total SMS Sent", value: stats.totalSent, icon: MessageSquare, gradient: "coral" },
        ].map(({ label, value, icon: Icon, gradient }) => (
          <div
            key={label}
            className="relative overflow-hidden rounded-2xl p-5 text-white shadow-[var(--shadow-card)]"
            style={{ background: `var(--gradient-${gradient})` }}
          >
            <div className="pointer-events-none absolute -right-3 -top-3 h-16 w-16 rounded-full bg-white/10" />
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-white/80">{label}</p>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20">
                <Icon className="h-3.5 w-3.5 text-white" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-border bg-secondary/50 p-1 w-fit">
        {(["rules", "logs"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "rounded-lg px-5 py-2 text-sm font-medium transition-colors capitalize",
              activeTab === tab
                ? "bg-card shadow-[var(--shadow-sm)] text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab === "rules" ? `Rules (${rules.length})` : `SMS Logs (${stats.totalSent})`}
          </button>
        ))}
      </div>

      {/* Rules Tab */}
      {activeTab === "rules" && (
        <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]">
          {rules.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
                <MessageSquare className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-base font-semibold">No rules yet</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Create your first SMS automation rule to start sending messages to customers.
              </p>
              <button
                onClick={() => setModal({ mode: "add" })}
                className="mt-2 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
                style={{ background: "var(--gradient-primary)" }}
              >
                <Plus className="h-4 w-4" /> Add First Rule
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Rule Name</th>
                    <th className="px-5 py-3 font-medium">Amount Range</th>
                    <th className="px-5 py-3 font-medium">Message Preview</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-5 py-3.5 font-semibold">{rule.name}</td>
                      <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">
                        {KES(rule.minAmount)} – {KES(rule.maxAmount)}
                      </td>
                      <td className="px-5 py-3.5 max-w-xs">
                        <p className="truncate text-xs text-muted-foreground" title={rule.messageTemplate}>
                          {rule.messageTemplate}
                        </p>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            rule.isActive
                              ? "bg-success/10 text-success"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", rule.isActive ? "bg-success" : "bg-muted-foreground")} />
                          {rule.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          {/* Toggle */}
                          <button
                            onClick={() => handleToggle(rule)}
                            disabled={togglingId === rule.id}
                            title={rule.isActive ? "Disable rule" : "Enable rule"}
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50 transition-colors"
                          >
                            {togglingId === rule.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : rule.isActive ? (
                              <ToggleRight className="h-4 w-4 text-success" />
                            ) : (
                              <ToggleLeft className="h-4 w-4" />
                            )}
                          </button>
                          {/* Edit */}
                          <button
                            onClick={() => setModal({ mode: "edit", rule })}
                            title="Edit rule"
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-primary transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {/* Delete */}
                          <button
                            onClick={() => setDeleteTarget(rule)}
                            title="Delete rule"
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Logs Tab */}
      {activeTab === "logs" && (
        <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]">
          {logs.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No SMS logs yet. Logs will appear here once payments trigger automation.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Phone</th>
                    <th className="px-5 py-3 font-medium">Amount</th>
                    <th className="px-5 py-3 font-medium">Message Sent</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-5 py-3 font-medium">{log.phone}</td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {log.amount != null ? KES(log.amount) : "—"}
                      </td>
                      <td className="px-5 py-3 max-w-xs">
                        <p className="truncate text-xs text-muted-foreground" title={log.message}>
                          {log.message}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                            log.status === "sent" && "bg-success/10 text-success",
                            log.status === "failed" && "bg-destructive/10 text-destructive",
                            log.status === "pending" && "bg-warning/10 text-warning",
                          )}
                        >
                          {log.status === "sent" && <CheckCircle2 className="h-3 w-3" />}
                          {log.status === "failed" && <XCircle className="h-3 w-3" />}
                          {log.status === "pending" && <Clock className="h-3 w-3" />}
                          {log.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">
                        {log.createdAt.toLocaleString("en-KE", {
                          month: "short", day: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

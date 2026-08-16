import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState, useMemo, useCallback } from "react";
import { z } from "zod";
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight, MessageSquare,
  Send, CheckCircle2, XCircle, AlertTriangle, Loader2, X,
  Zap, ZapOff, Bell, Clock, ChevronDown, ChevronUp, Target, SlidersHorizontal,
  Wand2, Sparkles, RefreshCw, Layers, Table, FileText, ClipboardList, Eye,
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

const resetDefaultTiersFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireCurrentUser } = await import("../lib/auth.server");
  await requireCurrentUser();
  const { resetDefaultTiers } = await import("../lib/sms-automation.server");
  return resetDefaultTiers();
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
  messageTemplate: z.string().min(5, "Message too short").max(2000, "Max 2000 characters"),
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
  head: () => ({ meta: [{ title: "SMS Automation — Payvora Admin" }] }),
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

const TIER_PRESETS = [
  {
    name: "Daily Matches ⚽",
    amount: "50",
    icon: "⚽",
    badgeBg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    description: "Short-term daily football predictions",
    matches: "10 Matches",
    validity: "24 Hours",
    template: `DAILY MATCHES ⚽\nToday's selected football predictions:\nArsenal vs Chelsea -> Arsenal Win (1)\nLiverpool vs Tottenham -> Liverpool Win (1)\nManchester City vs Newcastle -> Over 2.5 Goals\nManchester United vs Aston Villa -> Both Teams To Score (BTTS)\nReal Madrid vs Sevilla -> Real Madrid Win (1)\nBarcelona vs Villarreal -> Barcelona Win (1)\nBayern Munich vs Borussia Dortmund -> Over 2.5 Goals\nInter Milan vs AC Milan -> Inter Milan Win (1)\nPSG vs Lyon -> PSG Win (1)\nJuventus vs Napoli -> Both Teams To Score (BTTS)\nThank you {customer_name} for paying KES {amount}. Receipt: {transaction_code}.`,
  },
  {
    name: "Jackpot Matches 🏆",
    amount: "100",
    icon: "🏆",
    badgeBg: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    description: "Complete jackpot predictions list",
    matches: "15 Fixtures",
    validity: "Jackpot Access",
    template: `JACKPOT MATCHES 🏆\nComplete jackpot predictions with carefully selected fixtures:\nMan City vs Arsenal -> 1X\nChelsea vs Liverpool -> GG\nReal Madrid vs Barca -> Over 2.5\nInter vs Milan -> 1\nBayern vs Dortmund -> 1X & Over 2.5\nNapoli vs Juventus -> 2X\nPSG vs Marseille -> 1\nAjax vs PSV -> Over 3.5\nPorto vs Benfica -> 1X\nCeltic vs Rangers -> 1\nMonaco vs Lyon -> GG\nValencia vs Sevilla -> 1X\nLazio vs Roma -> GG\nLeipzig vs Leverkusen -> Over 2.5\nAthletic vs Betis -> 1\nThank you {customer_name} for paying KES {amount}. Receipt: {transaction_code}.`,
  },
  {
    name: "Basket Matches 🏀",
    amount: "50",
    icon: "🏀",
    badgeBg: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    description: "Daily basketball predictions and picks",
    matches: "8 Matches",
    validity: "24 Hours",
    template: `BASKET MATCHES 🏀\nGet selected basketball predictions and expert picks:\nLakers vs Celtics -> Over 215.5 Points\nWarriors vs Bulls -> Warriors Win\nBucks vs Heat -> Bucks -4.5\nNets vs Knicks -> Over 210.0 Points\nSuns vs Mavericks -> Suns Win\nNuggets vs Clippers -> Over 220.5 Points\n76ers vs Hawks -> 76ers Win\nGrizzlies vs Kings -> Over 218.0 Points\nThank you {customer_name} for paying KES {amount}. Receipt: {transaction_code}.`,
  },
  {
    name: "Weekly Subscription 📅",
    amount: "500",
    icon: "📅",
    badgeBg: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    description: "Full access to predictions for 7 days",
    matches: "All Access",
    validity: "7 Days",
    template: `WEEKLY SUBSCRIPTION 📅\nUnlimited access to premium OddsArena predictions.\n✓ Daily Matches\n✓ Jackpot Matches\n✓ Basketball Matches\nValid for 7 Days.\nThank you {customer_name} for subscribing with KES {amount}. Receipt: {transaction_code}.`,
  },
  {
    name: "Monthly Subscription 📆",
    amount: "1500",
    icon: "📆",
    badgeBg: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    description: "Complete premium access for 30 days",
    matches: "All Access + Updates",
    validity: "30 Days",
    template: `MONTHLY SUBSCRIPTION 📆\nComplete access to OddsArena premium predictions.\n✓ Daily Football Matches\n✓ Jackpot Matches\n✓ Basketball Matches\n✓ Premium Picks\n✓ Daily Updates\nValid for 30 Days.\nThank you {customer_name} for subscribing with KES {amount}. Receipt: {transaction_code}.`,
  },
];

export function formatAndCleanMatchLines(text: string): string {
  if (!text.trim()) return text;
  const lines = text.split("\n");
  const cleaned = lines.map((line) => {
    let trimmed = line.trim();
    if (!trimmed) return "";
    // Remove list markers like "1. ", "- ", "* "
    trimmed = trimmed.replace(/^[\d\*\-\•]+\.\s*/, "").replace(/^[\*\-\•]\s*/, "");
    // Replace custom separators (->, =>, -, :) with standard arrow '→'
    trimmed = trimmed.replace(/\s*(?:->|=>|–|—|:)\s*/g, " → ");
    // If line contains 'vs' or 'v' without arrow, split prediction at the end
    if (!trimmed.includes("→")) {
      const match = trimmed.match(/^(.+?\s+(?:vs\.?|v)\s+.+?)\s+([12X|gg|ng|over|under|draw]+.*)$/i);
      if (match) {
        trimmed = `${match[1].trim()} → ${match[2].trim().toUpperCase()}`;
      }
    }
    // Format team names and prediction
    if (trimmed.includes("→")) {
      const parts = trimmed.split("→");
      const teams = parts[0].trim();
      const tip = parts.slice(1).join("→").trim();
      const formattedTeams = teams.replace(/\b\w+/g, (w) => {
        if (["vs", "v"].includes(w.toLowerCase())) return "vs";
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      });
      return `${formattedTeams} → ${tip.toUpperCase()}`;
    }
    return trimmed;
  });
  return cleaned.filter(Boolean).join("\n");
}

function buildPreview(template: string): string {
  return template
    .replace(/\{customer_name\}/gi, "John Doe")
    .replace(/\{phone\}/gi, "254712345678")
    .replace(/\{amount\}/gi, "150.00")
    .replace(/\{transaction_code\}/gi, "RGK7X2Y9AB")
    .replace(/\{date\}/gi, "02 May 2026, 14:30")
    .replace(/\{business_name\}/gi, "PAYVORA");
}

// ─── Rule Modal ───────────────────────────────────────────────────────────────

type ModalMode = { mode: "add"; initialPreset?: typeof TIER_PRESETS[0] } | { mode: "edit"; rule: RuleRow };

export function parseBulkMatchesText(rawText: string): MatchRow[] {
  if (!rawText || !rawText.trim()) return [];

  let textToParse = rawText.trim();

  // If single-line or concatenated multi-match text without explicit newlines
  if (!textToParse.includes("\n")) {
    // Add newlines before list numbers like " 2 ", " 3 ", " 10 "
    textToParse = textToParse.replace(/\s+(\d+)[\.\)\s]+([A-Z0-9])/gi, "\n$1 $2");

    // If still no newlines and multiple "vs" exist, insert newlines before team names preceding 'vs'
    if (!textToParse.includes("\n") && (textToParse.match(/\bvs\.?\b/gi) || []).length > 1) {
      textToParse = textToParse.replace(/(\S+\s+vs\s+.*?)(?=\s+[A-Z0-9][a-zA-Z0-9\s]*?\s+vs\b)/gi, "$1\n");
    }
  }

  const lines = textToParse.split("\n");
  const matches: MatchRow[] = [];

  for (const line of lines) {
    let trimmed = line.trim();
    if (!trimmed) continue;

    // Remove leading list numbers like "1. ", "1\t", "1) ", "10 ", "* "
    trimmed = trimmed.replace(/^[\d\*\-\•]+[\.\)\t\s]+\s*/, "");

    // 1. Tab-separated format (Spreadsheets, tables, Excel)
    if (trimmed.includes("\t")) {
      const parts = trimmed.split("\t").map((p) => p.trim()).filter(Boolean);
      const nonVsParts = parts.filter((p) => !/^(vs|v)\.?$/i.test(p));
      if (nonVsParts.length >= 3) {
        matches.push({
          id: Math.random().toString(36).substring(2, 9),
          team1: nonVsParts[0],
          team2: nonVsParts[1],
          pick: nonVsParts.slice(2).join(" "),
        });
        continue;
      } else if (nonVsParts.length === 2) {
        matches.push({
          id: Math.random().toString(36).substring(2, 9),
          team1: nonVsParts[0],
          team2: nonVsParts[1],
          pick: "1",
        });
        continue;
      }
    }

    // 2. Standard text formatting
    let rest = trimmed;
    let pick = "";

    if (rest.includes("->") || rest.includes("→")) {
      const parts = rest.split(/->|→/);
      rest = parts[0].trim();
      pick = parts.slice(1).join("->").trim();
    } else if (rest.includes(" - ")) {
      const parts = rest.split(" - ");
      rest = parts[0].trim();
      pick = parts.slice(1).join(" - ").trim();
    }

    let team1 = "";
    let team2 = "";

    if (/\bvs\.?\b/i.test(rest)) {
      const parts = rest.split(/\bvs\.?\b/i);
      team1 = parts[0].trim();
      const afterVs = parts[1].trim();

      if (!pick) {
        // Match prediction pattern in afterVs
        const regex = /^(.*?)\s+((?:[A-Z0-9][a-zA-Z0-9\s]*\s+Win(?:\s*\([^\)]+\))?|Over\s+[\d\.]+\s*.*|Under\s+[\d\.]+\s*.*|Both\s+Teams\s+.*|GG|NG|BTTS|[12X]\b|\([^\)]+\)).*)$/i;
        const match = afterVs.match(regex);

        if (match && match[1].trim()) {
          team2 = match[1].trim();
          pick = match[2].trim();
        } else {
          const parenMatch = afterVs.match(/^(.*?)\s+(\([^\)]+\))$/);
          if (parenMatch) {
            const team2Candidate = parenMatch[1].trim();
            const lastSpace = team2Candidate.lastIndexOf(" ");
            if (lastSpace > 0) {
              team2 = team2Candidate.slice(0, lastSpace).trim();
              pick = `${team2Candidate.slice(lastSpace).trim()} ${parenMatch[2]}`;
            } else {
              team2 = team2Candidate;
              pick = parenMatch[2];
            }
          } else {
            const lastSpace = afterVs.lastIndexOf(" ");
            if (lastSpace > 0) {
              team2 = afterVs.slice(0, lastSpace).trim();
              pick = afterVs.slice(lastSpace).trim();
            } else {
              team2 = afterVs;
              pick = "1";
            }
          }
        }
      } else {
        team2 = afterVs;
      }
    } else if (/\bv\.?\b/i.test(rest)) {
      const parts = rest.split(/\bv\.?\b/i);
      team1 = parts[0].trim();
      team2 = parts[1].trim();
      if (!pick) pick = "1";
    } else {
      team1 = rest;
      if (!pick) pick = "1";
    }

    if (team1 || team2) {
      matches.push({
        id: Math.random().toString(36).substring(2, 9),
        team1,
        team2,
        pick: pick || "1",
      });
    }
  }

  return matches;
}

function parseTemplateToStructure(rawTemplate: string, fallbackTitle = "Gold Tier Package:") {
  if (!rawTemplate || !rawTemplate.trim()) {
    return {
      header: fallbackTitle,
      matches: [
        { id: "m1", team1: "Arsenal", team2: "Everton", pick: "1" },
        { id: "m2", team1: "Chelsea", team2: "West Ham", pick: "Over 2.5" },
        { id: "m3", team1: "Man City", team2: "Fulham", pick: "1X" },
      ],
      footer: "Thank you {customer_name} for paying KES {amount}. Receipt: {transaction_code}.",
    };
  }

  const lines = rawTemplate.split("\n");
  const headerLines: string[] = [];
  const footerLines: string[] = [];
  const matchLines: string[] = [];

  let phase: "header" | "matches" | "footer" = "header";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const isMatchLine = /\b(vs|v)\b/i.test(trimmed) || trimmed.includes("->") || trimmed.includes("→") || trimmed.includes("\t");

    if (isMatchLine) {
      phase = "matches";
      matchLines.push(line);
    } else {
      if (phase === "header") {
        headerLines.push(trimmed);
      } else {
        phase = "footer";
        footerLines.push(trimmed);
      }
    }
  }

  const matches = parseBulkMatchesText(matchLines.join("\n"));

  if (matches.length === 0) {
    matches.push(
      { id: "m1", team1: "Arsenal", team2: "Everton", pick: "1" },
      { id: "m2", team1: "Chelsea", team2: "West Ham", pick: "Over 2.5" },
      { id: "m3", team1: "Man City", team2: "Fulham", pick: "1X" },
    );
  }

  return {
    header: headerLines.join("\n") || fallbackTitle,
    matches,
    footer: footerLines.join("\n") || "Thank you {customer_name} for paying KES {amount}. Receipt: {transaction_code}.",
  };
}

function buildTemplateFromStructure(header: string, matches: MatchRow[], footer: string): string {
  const matchLines = matches
    .filter((m) => m.team1.trim() || m.team2.trim())
    .map((m) => {
      const t1 = m.team1.trim();
      const t2 = m.team2.trim();
      const p = m.pick.trim();
      return `${t1}${t2 ? ` vs ${t2}` : ""}${p ? ` -> ${p}` : ""}`;
    });

  const parts = [];
  if (header.trim()) parts.push(header.trim());
  if (matchLines.length > 0) parts.push(matchLines.join("\n"));
  if (footer.trim()) parts.push(footer.trim());

  return parts.join("\n");
}

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
  const initialPreset = modalMode.mode === "add" ? modalMode.initialPreset : null;
  const isFixedInitially = editing ? editing.minAmount === editing.maxAmount : true;

  const [name, setName] = useState(editing?.name ?? initialPreset?.name ?? "");
  const [amountMode, setAmountMode] = useState<"fixed" | "range">(isFixedInitially ? "fixed" : "fixed");
  const [fixedAmount, setFixedAmount] = useState(
    editing && isFixedInitially ? String(editing.minAmount) : initialPreset ? initialPreset.amount : "",
  );
  const [min, setMin] = useState(editing ? String(editing.minAmount) : initialPreset ? initialPreset.amount : "");
  const [max, setMax] = useState(editing ? String(editing.maxAmount) : initialPreset ? initialPreset.amount : "");
  const [template, setTemplate] = useState(
    editing?.messageTemplate ??
      initialPreset?.template ??
      "DAILY MATCHES ⚽\nToday's selected football predictions:\nArsenal vs Chelsea -> Arsenal Win (1)\nThank you {customer_name} for paying KES {amount}. Receipt: {transaction_code}.",
  );
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showPlaceholders, setShowPlaceholders] = useState(false);

  // Table Mode State
  const [inputMode, setInputMode] = useState<"table" | "raw">("table");
  const initialParsed = useMemo(
    () => parseTemplateToStructure(editing?.messageTemplate ?? "", name ? `${name} Tier Package:` : "Gold Tier Package:"),
    [],
  );

  const [headerText, setHeaderText] = useState(initialParsed.header);
  const [matchRows, setMatchRows] = useState<MatchRow[]>(initialParsed.matches);
  const [footerText, setFooterText] = useState(initialParsed.footer);

  const preview = useMemo(() => buildPreview(template), [template]);
  const charCount = template.length;

  function updateTemplateFromTable(h: string, rows: MatchRow[], f: string) {
    const newTpl = buildTemplateFromStructure(h, rows, f);
    setTemplate(newTpl);
  }

  function handleMatchRowChange(id: string, field: "team1" | "team2" | "pick", value: string) {
    const vsCount = (value.match(/\bvs\.?\b/gi) || []).length;
    const hasMultipleGames = value.includes("\n") || value.includes("\t") || vsCount > 1 || (vsCount === 1 && field === "team1" && value.length > 25);

    if (hasMultipleGames) {
      const parsed = parseBulkMatchesText(value);
      if (parsed.length > 0) {
        setMatchRows((prev) => {
          const filtered = prev.filter((r) => r.id !== id && (r.team1.trim() || r.team2.trim()));
          const updated = [...filtered, ...parsed];
          updateTemplateFromTable(headerText, updated, footerText);
          return updated;
        });
        toast.success(`Auto-split and imported ${parsed.length} match(es)!`);
        return;
      }
    }

    const updated = matchRows.map((r) => (r.id === id ? { ...r, [field]: value } : r));
    setMatchRows(updated);
    updateTemplateFromTable(headerText, updated, footerText);
  }

  function handleAddMatchRow() {
    const newRow: MatchRow = {
      id: Math.random().toString(36).substring(2, 9),
      team1: "",
      team2: "",
      pick: "1",
    };
    const updated = [...matchRows, newRow];
    setMatchRows(updated);
    updateTemplateFromTable(headerText, updated, footerText);
  }

  function handleRemoveMatchRow(id: string) {
    const updated = matchRows.filter((r) => r.id !== id);
    setMatchRows(updated);
    updateTemplateFromTable(headerText, updated, footerText);
  }

  // Paste Bulk Matches Handlers
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteInput, setPasteInput] = useState("");

  function handleImportPastedText() {
    if (!pasteInput.trim()) {
      toast.error("Please paste match text first.");
      return;
    }
    const parsed = parseBulkMatchesText(pasteInput);
    if (parsed.length === 0) {
      toast.error("No valid matches found in pasted text.");
      return;
    }

    setMatchRows((prev) => {
      const isPlaceholderOnly =
        prev.length === 3 &&
        prev[0].team1 === "Arsenal" &&
        prev[0].team2 === "Everton" &&
        prev[1].team1 === "Chelsea";

      const updated = isPlaceholderOnly ? parsed : [...prev.filter((r) => r.team1.trim() || r.team2.trim()), ...parsed];
      updateTemplateFromTable(headerText, updated, footerText);
      return updated;
    });

    toast.success(`Parsed and imported ${parsed.length} match(es) into table!`);
    setPasteInput("");
    setShowPasteBox(false);
  }

  function handleCellPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text");
    const vsCount = (text.match(/\bvs\.?\b/gi) || []).length;
    if (text && (text.includes("\n") || text.includes("\t") || vsCount >= 1 || text.length > 25)) {
      e.preventDefault();
      const parsed = parseBulkMatchesText(text);
      if (parsed.length > 0) {
        setMatchRows((prev) => {
          const isPlaceholderOnly =
            prev.length === 3 &&
            prev[0].team1 === "Arsenal" &&
            prev[0].team2 === "Everton" &&
            prev[1].team1 === "Chelsea";

          const updated = isPlaceholderOnly ? parsed : [...prev.filter((r) => r.team1.trim() || r.team2.trim()), ...parsed];
          updateTemplateFromTable(headerText, updated, footerText);
          return updated;
        });
        toast.success(`Auto-parsed and imported ${parsed.length} match(es) from clipboard!`);
      }
    }
  }

  function insertTag(tag: string) {
    setTemplate((t) => t + tag);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    let minN: number;
    let maxN: number;

    if (amountMode === "fixed") {
      minN = parseFloat(fixedAmount);
      maxN = parseFloat(fixedAmount);
      if (isNaN(minN) || minN <= 0) { setError("Fixed amount must be a positive number."); return; }
    } else {
      minN = parseFloat(min);
      maxN = parseFloat(max);
      if (isNaN(minN) || minN <= 0) { setError("Minimum amount must be a positive number."); return; }
      if (isNaN(maxN) || maxN <= 0) { setError("Maximum amount must be a positive number."); return; }
      if (minN > maxN) { setError("Minimum amount cannot be greater than maximum amount."); return; }
    }

    if (!name.trim()) { setError("Rule name is required."); return; }
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
          const names = result.conflicting.map((r: RuleRow) => `"${r.name}" (${r.minAmount === r.maxAmount ? KES(r.minAmount) : `${KES(r.minAmount)}–${KES(r.maxAmount)}`})`).join(", ");
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

  function handleSelectPreset(preset: typeof TIER_PRESETS[number]) {
    setName(preset.name);
    setAmountMode("fixed");
    setFixedAmount(preset.amount);
    setTemplate(preset.template);
    const parsed = parseTemplateToStructure(preset.template, `${preset.name} Tier Package:`);
    setHeaderText(parsed.header);
    setMatchRows(parsed.matches);
    setFooterText(parsed.footer);
    toast.info(`Loaded ${preset.name} (${KES(Number(preset.amount))}) Tier preset`);
  }

  function handleCleanFormat() {
    const formatted = formatAndCleanMatchLines(template);
    setTemplate(formatted);
    toast.success("Match lines formatted and aligned!");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card shadow-[var(--shadow-lg)] flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <h2 className="text-base font-semibold">
            {editing ? "Edit SMS Rule" : "Add SMS Automation Rule"}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Quick Tier Presets */}
          {!editing && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>Quick Tier Presets</span>
                <span className="text-[10px] lowercase text-muted-foreground font-normal">(click to auto-fill)</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {TIER_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => handleSelectPreset(p)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all hover:scale-[1.02]",
                      p.badgeBg,
                    )}
                  >
                    <span>{p.icon}</span>
                    <span>{p.name}</span>
                    <span className="font-mono text-[11px]">({KES(Number(p.amount))})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Name + Status row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rule Tier Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Gold, Platinum, Sapphire..."
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

          {/* Amount Mode Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount Mode</label>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-secondary/40 p-1">
              <button
                type="button"
                onClick={() => setAmountMode("fixed")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all",
                  amountMode === "fixed"
                    ? "bg-card text-foreground shadow-sm font-semibold border border-border/50"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Target className="h-3.5 w-3.5" />
                Fixed Amount (Exact)
              </button>
              <button
                type="button"
                onClick={() => setAmountMode("range")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all",
                  amountMode === "range"
                    ? "bg-card text-foreground shadow-sm font-semibold border border-border/50"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Amount Range
              </button>
            </div>
          </div>

          {/* Amount inputs */}
          {amountMode === "fixed" ? (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Exact Amount (KES)</label>
              <input
                type="number" min="1" step="any"
                value={fixedAmount}
                onChange={(e) => setFixedAmount(e.target.value)}
                placeholder="e.g. 50"
                className="mt-1.5 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              />
            </div>
          ) : (
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
          )}

          {/* Message template & Table Form Builder */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div className="flex items-center gap-1.5 rounded-lg bg-secondary/60 p-1 border border-border">
                <button
                  type="button"
                  onClick={() => {
                    if (inputMode !== "table") {
                      const parsed = parseTemplateToStructure(template, name ? `${name} Tier Package:` : "Gold Tier Package:");
                      setHeaderText(parsed.header);
                      setMatchRows(parsed.matches);
                      setFooterText(parsed.footer);
                    }
                    setInputMode("table");
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all",
                    inputMode === "table"
                      ? "bg-card text-foreground shadow-sm border border-border"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Table className="h-3.5 w-3.5 text-emerald-500" />
                  Table Builder
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode("raw")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all",
                    inputMode === "raw"
                      ? "bg-card text-foreground shadow-sm border border-border"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  Raw Text Editor
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCleanFormat}
                  title="Auto-align and clean multi-line match predictions"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 px-2 py-0.5 rounded-md transition-colors"
                >
                  <Wand2 className="h-3 w-3" />
                  Format
                </button>
                <span className={cn("text-xs font-mono", charCount > 1950 ? "text-destructive" : "text-muted-foreground")}>
                  {charCount}/2000 ({Math.ceil(charCount / 160) || 1} SMS)
                </span>
              </div>
            </div>

            {inputMode === "table" ? (
              <div className="space-y-3 rounded-xl border border-border bg-secondary/20 p-3.5">
                {/* Header Input */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Package Header Title
                  </label>
                  <input
                    type="text"
                    value={headerText}
                    onChange={(e) => {
                      setHeaderText(e.target.value);
                      updateTemplateFromTable(e.target.value, matchRows, footerText);
                    }}
                    placeholder="e.g. Gold Tier Package:"
                    className="mt-1 h-8 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary font-medium"
                  />
                </div>

                {/* Matches Table */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Match Fixtures & Predictive Results
                    </label>
                    <span className="text-[10px] text-emerald-500 font-bold">Auto Syncs to SMS</span>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-border bg-background shadow-sm">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-secondary/60 text-muted-foreground font-bold uppercase border-b border-border text-[10px]">
                        <tr>
                          <th className="p-2 w-8 text-center">#</th>
                          <th className="p-2">Team 1 (Home)</th>
                          <th className="p-2 w-8 text-center text-muted-foreground">vs</th>
                          <th className="p-2">Team 2 (Away)</th>
                          <th className="p-2">Predictive Result / Pick</th>
                          <th className="p-2 w-8 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {matchRows.map((m, idx) => (
                          <tr key={m.id} className="hover:bg-secondary/20 transition-colors">
                            <td className="p-2 text-center font-mono font-bold text-muted-foreground text-[11px]">
                              {idx + 1}
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={m.team1}
                                onChange={(e) => handleMatchRowChange(m.id, "team1", e.target.value)}
                                onPaste={handleCellPaste}
                                placeholder="e.g. Arsenal"
                                className="w-full rounded-md border border-border/80 bg-background p-1.5 text-xs font-semibold outline-none focus:border-primary"
                              />
                            </td>
                            <td className="p-2 text-center text-[10px] font-bold text-muted-foreground">
                              vs
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={m.team2}
                                onChange={(e) => handleMatchRowChange(m.id, "team2", e.target.value)}
                                onPaste={handleCellPaste}
                                placeholder="e.g. Everton"
                                className="w-full rounded-md border border-border/80 bg-background p-1.5 text-xs font-semibold outline-none focus:border-primary"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={m.pick}
                                onChange={(e) => handleMatchRowChange(m.id, "pick", e.target.value)}
                                onPaste={handleCellPaste}
                                placeholder="e.g. 1 / Over 2.5 / GG"
                                className="w-full rounded-md border border-border/80 bg-background p-1.5 text-xs font-mono font-bold text-primary outline-none focus:border-primary"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveMatchRow(m.id)}
                                className="p-1 text-muted-foreground hover:text-rose-500 transition-colors"
                                title="Remove row"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddMatchRow}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-500 hover:bg-emerald-500/20 transition-all"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Match Fixture Row
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowPasteBox(!showPasteBox)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-all"
                    >
                      <ClipboardList className="h-3.5 w-3.5" /> Paste Multiple Games
                    </button>
                  </div>

                  {showPasteBox && (
                    <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-primary flex items-center gap-1.5">
                          <ClipboardList className="h-4 w-4" />
                          Paste Bulk Matches List
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowPasteBox(false)}
                          className="text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          Close
                        </button>
                      </div>
                      <textarea
                        rows={4}
                        value={pasteInput}
                        onChange={(e) => setPasteInput(e.target.value)}
                        placeholder="Paste your copied matches here...&#10;Arsenal vs Chelsea Arsenal Win (1)&#10;2 Liverpool vs Tottenham Liverpool Win (1)&#10;3 Manchester City vs Newcastle Over 2.5 Goals"
                        className="w-full rounded-lg border border-border bg-background p-2.5 text-xs font-mono outline-none focus:border-primary"
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">
                          Auto-detects teams, vs, row numbers & picks!
                        </span>
                        <button
                          type="button"
                          onClick={handleImportPastedText}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow hover:bg-primary/90 transition-all"
                        >
                          <Wand2 className="h-3.5 w-3.5" />
                          Import Matches to Table
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Input */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Footer & Customer Note
                  </label>
                  <input
                    type="text"
                    value={footerText}
                    onChange={(e) => {
                      setFooterText(e.target.value);
                      updateTemplateFromTable(headerText, matchRows, e.target.value);
                    }}
                    placeholder="e.g. Thank you {customer_name} for paying KES {amount}."
                    className="mt-1 h-8 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary font-medium"
                  />
                </div>
              </div>
            ) : (
              <div>
                <textarea
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  rows={5}
                  placeholder="Paste matches e.g.:&#10;Chelsea vs Liverpool 2X&#10;Arsenal vs Everton 1&#10;&#10;Or type your custom message..."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-mono leading-relaxed outline-none focus:border-primary resize-none"
                />
              </div>
            )}

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

  const [previewRule, setPreviewRule] = useState<RuleRow | null>(null);

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

  const [resettingTiers, setResettingTiers] = useState(false);

  async function handleResetDefaultTiers() {
    if (!confirm("Reset rules to 5 OddsArena Packages (Daily, Jackpot, Basket, Weekly, Monthly)?")) return;
    setResettingTiers(true);
    try {
      const defaultRules = await resetDefaultTiersFn();
      setRules(defaultRules.sort((a, b) => a.minAmount - b.minAmount));
      toast.success("Seeded 5 OddsArena packages successfully!");
    } catch {
      toast.error("Failed to reset tier rules");
    } finally {
      setResettingTiers(false);
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

      {/* Preview Modal */}
      {previewRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-xl">
                  📱
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground">{previewRule.name}</h3>
                  <p className="text-xs text-muted-foreground font-mono">Price: KES {previewRule.minAmount}</p>
                </div>
              </div>
              <button
                onClick={() => setPreviewRule(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer SMS Preview</span>
              <div className="rounded-xl border border-border bg-secondary/30 p-4 font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap max-h-72 overflow-y-auto">
                {buildPreview(previewRule.messageTemplate)}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground font-mono">
                {previewRule.messageTemplate.length} chars ({Math.ceil(previewRule.messageTemplate.length / 160)} SMS)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPreviewRule(null)}
                  className="h-8 rounded-lg border border-border px-3.5 text-xs font-semibold hover:bg-secondary"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    const ruleToEdit = previewRule;
                    setPreviewRule(null);
                    setModal({ mode: "edit", rule: ruleToEdit });
                  }}
                  className="h-8 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-all"
                >
                  Edit Package
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">OddsArena Package & SMS Automation</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage daily sports predictions, jackpot fixtures, basketball picks, and subscription packages.
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

          {/* Reset 5 Packages */}
          <button
            onClick={handleResetDefaultTiers}
            disabled={resettingTiers}
            title="Reset rules to OddsArena 5 Packages (Daily, Jackpot, Basket, Weekly, Monthly)"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-3.5 py-2 text-sm font-semibold hover:bg-secondary/80 transition-colors disabled:opacity-60 text-xs"
          >
            {resettingTiers ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Reset 5 Packages
          </button>

          <button
            onClick={() => setModal({ mode: "add" })}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Plus className="h-4 w-4" /> Add Package Rule
          </button>
        </div>
      </header>

      {/* Package Dashboard Layout: 5 Large Category Cards */}
      <div className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <span>OddsArena Categories Overview</span>
        </h2>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
          {TIER_PRESETS.map((preset) => {
            const matchedRule = rules.find((r) => r.name.toLowerCase().includes(preset.name.toLowerCase().split(" ")[0]));
            const isRuleActive = matchedRule ? matchedRule.isActive : true;

            return (
              <div
                key={preset.name}
                className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] flex flex-col justify-between hover:border-primary/50 transition-all group"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{preset.icon}</span>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold border font-mono", preset.badgeBg)}>
                      {KES(Number(preset.amount))}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-bold text-sm text-foreground">
                      {preset.name}
                    </h3>
                    <p className="text-[11px] text-muted-foreground leading-tight mt-1 line-clamp-2">
                      {preset.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground pt-1.5 border-t border-border/50">
                    <span className="font-medium text-foreground">{preset.matches}</span>
                    <span>{preset.validity}</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-1.5 pt-2 border-t border-border/40">
                  <button
                    type="button"
                    onClick={() => {
                      if (matchedRule) {
                        setPreviewRule(matchedRule);
                      } else {
                        toast.info(`Preview: ${preset.name}`);
                      }
                    }}
                    className="flex-1 rounded-lg border border-border bg-secondary/50 py-1 text-[11px] font-semibold hover:bg-secondary text-foreground transition-colors"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (matchedRule) {
                        setModal({ mode: "edit", rule: matchedRule });
                      } else {
                        setModal({ mode: "add", initialPreset: preset });
                      }
                    }}
                    className="flex-1 rounded-lg bg-primary/10 text-primary border border-primary/20 py-1 text-[11px] font-semibold hover:bg-primary/20 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (matchedRule) {
                        handleToggle(matchedRule);
                      }
                    }}
                    title={isRuleActive ? "Deactivate package" : "Activate package"}
                    className={cn(
                      "rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors border",
                      isRuleActive
                        ? "bg-success/10 text-success border-success/30 hover:bg-success/20"
                        : "bg-muted text-muted-foreground border-border hover:bg-secondary",
                    )}
                  >
                    {isRuleActive ? "Active" : "Activate"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
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
            {tab === "rules" ? `Package Rules (${rules.length})` : `SMS Logs (${stats.totalSent})`}
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
                Create your first SMS automation rule or reset to standard OddsArena packages.
              </p>
              <button
                onClick={handleResetDefaultTiers}
                className="mt-2 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
                style={{ background: "var(--gradient-primary)" }}
              >
                <RefreshCw className="h-4 w-4" /> Seed 5 Packages
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Package Name</th>
                    <th className="px-5 py-3 font-medium">Price</th>
                    <th className="px-5 py-3 font-medium">Message Preview</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-bold text-foreground flex items-center gap-1.5">
                          {rule.name}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">
                        <span className="inline-flex items-center gap-1 font-semibold text-foreground bg-secondary/80 px-2 py-1 rounded-md border border-border">
                          {KES(rule.minAmount)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 max-w-xs">
                        <p className="truncate text-xs text-muted-foreground font-mono" title={rule.messageTemplate}>
                          {rule.messageTemplate}
                        </p>
                      </td>
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => handleToggle(rule)}
                          disabled={togglingId === rule.id}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-all border",
                            rule.isActive
                              ? "bg-success/10 text-success border-success/30 hover:bg-success/20"
                              : "bg-muted text-muted-foreground border-border hover:bg-secondary",
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", rule.isActive ? "bg-success" : "bg-muted-foreground")} />
                          {rule.isActive ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Preview */}
                          <button
                            onClick={() => setPreviewRule(rule)}
                            title="Preview customer message"
                            className="rounded-lg border border-border bg-secondary/50 px-2 py-1 text-xs font-semibold text-foreground hover:bg-secondary transition-colors inline-flex items-center gap-1"
                          >
                            <Eye className="h-3.5 w-3.5 text-primary" /> Preview
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

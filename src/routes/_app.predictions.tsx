import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import {
  Trophy,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Search,
  Filter,
  Check,
  Send,
  Loader2,
  Copy,
  CopyCheck,
  RefreshCw,
  Flame,
  Dumbbell,
  Radio,
  Layers,
  ArrowRight,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Server Functions ─────────────────────────────────────────────────────────

const fetchPredictionsDataFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireCurrentUser } = await import("../lib/auth.server");
  const { fetchAllPredictions, fetchJackpotsWithMatches } = await import("../lib/predictions.server");
  await requireCurrentUser();
  const [predictionsList, jackpotsList] = await Promise.all([
    fetchAllPredictions(),
    fetchJackpotsWithMatches(),
  ]);
  return { predictions: predictionsList, jackpots: jackpotsList };
});

const savePredictionFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as any)
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("../lib/auth.server");
    const { createPrediction, updatePrediction } = await import("../lib/predictions.server");
    await requireCurrentUser();

    if (data.id) {
      const updated = await updatePrediction(data.id, data);
      return { success: true, prediction: updated };
    } else {
      const created = await createPrediction(data);
      return { success: true, prediction: created };
    }
  });

const deletePredictionFn = createServerFn({ method: "POST" })
  .inputValidator((id: unknown) => String(id))
  .handler(async ({ data: id }) => {
    const { requireCurrentUser } = await import("../lib/auth.server");
    const { deletePrediction } = await import("../lib/predictions.server");
    await requireCurrentUser();
    await deletePrediction(id);
    return { success: true };
  });

const setPredictionResultFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { id: string; score1?: number; score2?: number; status: "pending" | "won" | "lost" | "void"; actualResult?: string })
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("../lib/auth.server");
    const { setPredictionResult } = await import("../lib/predictions.server");
    await requireCurrentUser();
    const updated = await setPredictionResult(data.id, data);
    return { success: true, prediction: updated };
  });

const saveJackpotFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as any)
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("../lib/auth.server");
    const { createJackpot } = await import("../lib/predictions.server");
    await requireCurrentUser();
    const j = await createJackpot(data.jackpotCode, data.title, data.totalOdds, data.matches);
    return { success: true, jackpot: j };
  });

const updateJackpotStatusFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { id: string; status: "OPEN" | "CLOSED" | "SETTLED" })
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("../lib/auth.server");
    const { updateJackpotStatus } = await import("../lib/predictions.server");
    await requireCurrentUser();
    const updated = await updateJackpotStatus(data.id, data.status);
    return { success: true, jackpot: updated };
  });

const deleteJackpotFn = createServerFn({ method: "POST" })
  .inputValidator((id: unknown) => String(id))
  .handler(async ({ data: id }) => {
    const { requireCurrentUser } = await import("../lib/auth.server");
    const { deleteJackpot } = await import("../lib/predictions.server");
    await requireCurrentUser();
    await deleteJackpot(id);
    return { success: true };
  });

// ─── Route Definition ─────────────────────────────────────────────────────────

import { redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/predictions")({
  beforeLoad: () => {
    throw redirect({ to: "/sms-automation" });
  },
  loader: () => fetchPredictionsDataFn(),
  component: () => null,
});

// ─── Main Component ───────────────────────────────────────────────────────────

function PredictionsPage() {
  const initialData = Route.useLoaderData();
  const [predictions, setPredictions] = useState(initialData.predictions);
  const [jackpots, setJackpots] = useState(initialData.jackpots);

  const [activeTab, setActiveTab] = useState<
    "all" | "football" | "basketball" | "jackpot" | "results" | "after_payment"
  >("all");

  const [searchQuery, setSearchQuery] = useState("");
  const [tierFilter, setTierFilter] = useState("all");

  // Form state for creating/editing prediction
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sport, setSport] = useState<"football" | "basketball">("football");
  const [league, setLeague] = useState("English Premier League");
  const [team1, setTeam1] = useState("Arsenal");
  const [team2, setTeam2] = useState("Chelsea");
  const [predictionStr, setPredictionStr] = useState("Team 1 Win (1)");
  const [odds, setOdds] = useState("1.85");
  const [predictionType, setPredictionType] = useState("Gold");
  const [confidence, setConfidence] = useState(88);
  const [status, setStatus] = useState<"pending" | "won" | "lost" | "void">("pending");
  const [matchDate, setMatchDate] = useState(new Date().toISOString().slice(0, 10));

  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Results Modal State
  const [selectedResultPred, setSelectedResultPred] = useState<any | null>(null);
  const [resScore1, setResScore1] = useState("");
  const [resScore2, setResScore2] = useState("");
  const [resStatus, setResStatus] = useState<"pending" | "won" | "lost" | "void">("won");
  const [settling, setSettling] = useState(false);

  // New Jackpot Form Modal State
  const [showJackpotModal, setShowJackpotModal] = useState(false);
  const [jpCode, setJpCode] = useState(`JA-00${jackpots.length + 1}`);
  const [jpTitle, setJpTitle] = useState("ODDSARENA WEEKEND MEGA JACKPOT");
  const [jpOdds, setJpOdds] = useState("15.50");
  const [jpMatches, setJpMatches] = useState<
    { matchOrder: number; team1: string; team2: string; prediction: string }[]
  >([
    { matchOrder: 1, team1: "Arsenal", team2: "Everton", prediction: "1" },
    { matchOrder: 2, team1: "Chelsea", team2: "West Ham", prediction: "X" },
    { matchOrder: 3, team1: "Real Madrid", team2: "Sevilla", prediction: "1" },
    { matchOrder: 4, team1: "Barcelona", team2: "Real Betis", prediction: "1" },
    { matchOrder: 5, team1: "Inter Milan", team2: "Lazio", prediction: "2" },
  ]);
  const [creatingJp, setCreatingJp] = useState(false);

  // ─── Filtered Predictions ─────────────────────────────────────────────────
  const filteredPredictions = useMemo(() => {
    return predictions.filter((p) => {
      if (activeTab === "football" && p.sport !== "football") return false;
      if (activeTab === "basketball" && p.sport !== "basketball") return false;
      if (tierFilter !== "all" && p.predictionType.toLowerCase() !== tierFilter.toLowerCase()) return false;

      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        p.team1.toLowerCase().includes(q) ||
        p.team2.toLowerCase().includes(q) ||
        p.league.toLowerCase().includes(q) ||
        p.prediction.toLowerCase().includes(q) ||
        p.predictionType.toLowerCase().includes(q)
      );
    });
  }, [predictions, activeTab, tierFilter, searchQuery]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = predictions.length;
    const footballCount = predictions.filter((p) => p.sport === "football").length;
    const basketballCount = predictions.filter((p) => p.sport === "basketball").length;
    const won = predictions.filter((p) => p.status === "won").length;
    const lost = predictions.filter((p) => p.status === "lost").length;
    const pending = predictions.filter((p) => p.status === "pending").length;
    const activeJps = jackpots.filter((j) => j.status === "OPEN").length;
    return { total, footballCount, basketballCount, won, lost, pending, activeJps };
  }, [predictions, jackpots]);

  // Reset form
  function resetForm() {
    setEditingId(null);
    setTeam1("");
    setTeam2("");
    setPredictionStr("");
    setOdds("1.85");
    setLeague("English Premier League");
    setConfidence(85);
    setStatus("pending");
  }

  // Load prediction into form for edit
  function handleEdit(p: any) {
    setEditingId(p.id);
    setSport(p.sport);
    setLeague(p.league || "");
    setTeam1(p.team1);
    setTeam2(p.team2);
    setPredictionStr(p.prediction);
    setOdds(String(p.odds));
    setPredictionType(p.predictionType || "Gold");
    setConfidence(p.confidence || 85);
    setStatus(p.status || "pending");
    if (p.matchDate) {
      setMatchDate(new Date(p.matchDate).toISOString().slice(0, 10));
    }
    toast.info(`Editing match: ${p.team1} vs ${p.team2}`);
  }

  // Submit Prediction Creation / Update
  async function handleSavePrediction(e: React.FormEvent) {
    e.preventDefault();
    if (!team1.trim() || !team2.trim() || !predictionStr.trim()) {
      toast.error("Please enter both teams and a prediction pick.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        id: editingId,
        sport,
        league: league.trim(),
        matchDate,
        team1: team1.trim(),
        team2: team2.trim(),
        prediction: predictionStr.trim(),
        odds: parseFloat(odds) || 1.85,
        predictionType,
        confidence,
        status,
        isPublished: true,
      };

      const res = await savePredictionFn({ data: payload });
      if (res.success && res.prediction) {
        toast.success(editingId ? "Prediction updated successfully!" : "Prediction created and published!");
        if (editingId) {
          setPredictions((prev) => prev.map((item) => (item.id === editingId ? res.prediction : item)));
        } else {
          setPredictions((prev) => [res.prediction, ...prev]);
        }
        resetForm();
      }
    } catch (err) {
      toast.error("Failed to save prediction.");
    } finally {
      setSaving(false);
    }
  }

  // Delete Prediction
  async function handleDelete(id: string, name: string) {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;
    try {
      await deletePredictionFn({ data: id });
      setPredictions((prev) => prev.filter((p) => p.id !== id));
      toast.success("Prediction deleted.");
    } catch {
      toast.error("Failed to delete prediction.");
    }
  }

  // Save Match Result
  async function handleSaveResult(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedResultPred) return;
    setSettling(true);

    const s1 = resScore1 !== "" ? parseInt(resScore1, 10) : null;
    const s2 = resScore2 !== "" ? parseInt(resScore2, 10) : null;

    try {
      const res = await setPredictionResultFn({
        data: {
          id: selectedResultPred.id,
          score1: s1,
          score2: s2,
          status: resStatus,
          actualResult: s1 !== null && s2 !== null ? `${s1} - ${s2}` : undefined,
        },
      });

      if (res.success && res.prediction) {
        setPredictions((prev) => prev.map((p) => (p.id === res.prediction.id ? res.prediction : p)));
        toast.success(`Result published for ${selectedResultPred.team1} vs ${selectedResultPred.team2}!`);
        setSelectedResultPred(null);
      }
    } catch {
      toast.error("Failed to publish result.");
    } finally {
      setSettling(false);
    }
  }

  // Create Jackpot
  async function handleCreateJackpot(e: React.FormEvent) {
    e.preventDefault();
    setCreatingJp(true);
    try {
      const res = await saveJackpotFn({
        data: {
          jackpotCode: jpCode,
          title: jpTitle,
          totalOdds: parseFloat(jpOdds) || 10.0,
          matches: jpMatches,
        },
      });
      if (res.success && res.jackpot) {
        setJackpots((prev) => [res.jackpot, ...prev]);
        toast.success(`Jackpot ${jpCode} created successfully!`);
        setShowJackpotModal(false);
      }
    } catch {
      toast.error("Failed to create jackpot.");
    } finally {
      setCreatingJp(false);
    }
  }

  // Update Jackpot Status
  async function handleJackpotStatusChange(id: string, newStatus: "OPEN" | "CLOSED" | "SETTLED") {
    try {
      const res = await updateJackpotStatusFn({ data: { id, status: newStatus } });
      if (res.success && res.jackpot) {
        setJackpots((prev) => prev.map((j) => (j.id === id ? { ...j, status: newStatus } : j)));
        toast.success(`Jackpot status updated to ${newStatus}`);
      }
    } catch {
      toast.error("Failed to update status.");
    }
  }

  // Delete Jackpot
  async function handleDeleteJackpot(id: string, code: string) {
    if (!confirm(`Delete Jackpot ${code}?`)) return;
    try {
      await deleteJackpotFn({ data: id });
      setJackpots((prev) => prev.filter((j) => j.id !== id));
      toast.success("Jackpot deleted.");
    } catch {
      toast.error("Failed to delete jackpot.");
    }
  }

  // WhatsApp / Customer SMS Live Message Generator
  const liveCustomerMessage = useMemo(() => {
    const icon = sport === "basketball" ? "🏀" : "⚽";
    const dateFormatted = new Date().toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
    return `${icon} ODDSARENA DAILY PICK

${team1 || "Team 1"} vs ${team2 || "Team 2"}
League: ${league || "Premier League"}
Prediction: ${predictionStr || "Team 1 Win"}
Odds: ${odds || "1.85"}
Confidence: ${confidence}%
Result: ${status === "won" ? "WON ✓" : status === "lost" ? "LOST ✗" : "PENDING 🟡"}

🔥 Today's Pick (${dateFormatted})
━━━━━━━━━━━━━━
OddsArena · Smart Picks. Better Decisions.`;
  }, [sport, team1, team2, league, predictionStr, odds, confidence, status]);

  // Customer After Payment Unlocked Message
  const activePick = predictions[0] || {
    team1: team1 || "Arsenal",
    team2: team2 || "Everton",
    prediction: predictionStr || "Team 1 Win",
    odds: odds || "1.85",
    status: status || "pending",
  };

  const unlockedMessageText = `🎯 ODDSARENA — PREDICTION ACCESS

Payment successful! ✓
Your prediction has been unlocked.

Today's Pick:
${sport === "basketball" ? "🏀" : "⚽"} ${activePick.team1} vs ${activePick.team2}
Prediction: ${activePick.prediction}
Odds: ${activePick.odds}
━━━━━━━━━━━━━━
Result: ${activePick.status.toUpperCase()}

Good luck! 🔥
OddsArena · Smart Picks. Better Decisions.`;

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-12">
      {/* ─── Header ──────────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Trophy className="h-5 w-5 text-amber-500" />
            </span>
            <h1 className="text-3xl font-bold tracking-tight">OddsArena Predictions</h1>
            <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-500 border border-amber-500/20">
              Admin Control Panel
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage daily sports picks, results settlement, jackpot fixtures, and live customer message previews.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              resetForm();
              setActiveTab("all");
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold hover:bg-secondary transition-all shadow-sm"
          >
            <Plus className="h-4 w-4 text-primary" /> Create Pick
          </button>
          <button
            onClick={() => setShowJackpotModal(true)}
            className="inline-flex items-center gap-2 rounded-xl text-white px-4 py-2.5 text-xs font-semibold transition-all shadow-md"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Sparkles className="h-4 w-4" /> New Jackpot
          </button>
        </div>
      </header>

      {/* ─── Metrics Bar ──────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-7">
        <MetricCard label="Total Picks" value={metrics.total} icon={Layers} color="text-primary" />
        <MetricCard label="Football Picks" value={metrics.footballCount} icon={Flame} color="text-emerald-500" />
        <MetricCard label="Basketball Picks" value={metrics.basketballCount} icon={Dumbbell} color="text-orange-500" />
        <MetricCard label="Active Jackpots" value={metrics.activeJps} icon={Trophy} color="text-amber-500" />
        <MetricCard label="Pending" value={metrics.pending} icon={Clock} color="text-amber-400" />
        <MetricCard label="Won 🟢" value={metrics.won} icon={CheckCircle2} color="text-emerald-400" />
        <MetricCard label="Lost 🔴" value={metrics.lost} icon={XCircle} color="text-rose-400" />
      </div>

      {/* ─── Navigation Tabs ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <TabButton active={activeTab === "all"} onClick={() => setActiveTab("all")} label="All Predictions" count={predictions.length} />
        <TabButton active={activeTab === "football"} onClick={() => setActiveTab("football")} label="⚽ Daily Football" count={metrics.footballCount} />
        <TabButton active={activeTab === "basketball"} onClick={() => setActiveTab("basketball")} label="🏀 Basketball Picks" count={metrics.basketballCount} />
        <TabButton active={activeTab === "jackpot"} onClick={() => setActiveTab("jackpot")} label="🏆 Jackpots" count={jackpots.length} />
        <TabButton active={activeTab === "results"} onClick={() => setActiveTab("results")} label="📊 Results & Settlement" count={metrics.pending} badgeColor="bg-amber-500/20 text-amber-500" />
        <TabButton active={activeTab === "after_payment"} onClick={() => setActiveTab("after_payment")} label="💬 Customer Message Preview" count={null} />
      </div>

      {/* ─── Main Content Grid: Create Panel & Live Preview ─────────────────── */}
      {activeTab !== "after_payment" && activeTab !== "jackpot" && (
        <div className="grid gap-8 lg:grid-cols-12">
          {/* Left Column: Create / Edit Prediction Form */}
          <div className="lg:col-span-7 space-y-6">
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between mb-5 border-b border-border pb-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {editingId ? <Edit2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  </span>
                  <h2 className="text-base font-bold">
                    {editingId ? "Edit Prediction Pick" : "Create Prediction"}
                  </h2>
                </div>
                {editingId && (
                  <button
                    onClick={resetForm}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              <form onSubmit={handleSavePrediction} className="space-y-4">
                {/* Sport & Category */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sport</label>
                    <select
                      value={sport}
                      onChange={(e) => setSport(e.target.value as any)}
                      className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="football">⚽ Football</option>
                      <option value="basketball">🏀 Basketball</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Competition / League</label>
                    <input
                      type="text"
                      value={league}
                      onChange={(e) => setLeague(e.target.value)}
                      placeholder="e.g. English Premier League, NBA"
                      className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                {/* Teams */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Team 1 (Home)</label>
                    <input
                      type="text"
                      required
                      value={team1}
                      onChange={(e) => setTeam1(e.target.value)}
                      placeholder="e.g. Arsenal"
                      className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Team 2 (Away)</label>
                    <input
                      type="text"
                      required
                      value={team2}
                      onChange={(e) => setTeam2(e.target.value)}
                      placeholder="e.g. Chelsea"
                      className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                {/* Prediction Pick & Odds */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prediction / Pick</label>
                    <input
                      type="text"
                      required
                      value={predictionStr}
                      onChange={(e) => setPredictionStr(e.target.value)}
                      placeholder={sport === "basketball" ? "e.g. Celtics -5.5 Points / Over 224.5" : "e.g. Team 1 Win / Over 2.5 / GG"}
                      className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Odds</label>
                    <input
                      type="text"
                      required
                      value={odds}
                      onChange={(e) => setOdds(e.target.value)}
                      placeholder="1.85"
                      className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20 font-mono"
                    />
                  </div>
                </div>

                {/* Tier Type, Confidence & Status */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prediction Tier</label>
                    <select
                      value={predictionType}
                      onChange={(e) => setPredictionType(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="Gold">Gold Tier (KES 50)</option>
                      <option value="Platinum">Platinum Tier (KES 100)</option>
                      <option value="Sapphire">Sapphire Tier (KES 200)</option>
                      <option value="Ruby">Ruby Tier (KES 500)</option>
                      <option value="Emerald">Emerald Tier (KES 1000)</option>
                      <option value="VIP Pick">VIP Super Pick</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Confidence Level</label>
                    <div className="mt-1.5 flex items-center gap-3">
                      <input
                        type="range"
                        min="50"
                        max="99"
                        value={confidence}
                        onChange={(e) => setConfidence(parseInt(e.target.value, 10))}
                        className="w-full accent-primary"
                      />
                      <span className="font-mono text-xs font-bold text-primary w-8">{confidence}%</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as any)}
                      className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="pending">🟡 Pending</option>
                      <option value="won">🟢 Won</option>
                      <option value="lost">🔴 Lost</option>
                      <option value="void">⚪ Void</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 inline-flex justify-center items-center gap-2 rounded-xl text-white py-3 text-xs font-bold transition-all shadow-md disabled:opacity-50"
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {editingId ? "Update Prediction Pick" : "Publish Prediction Pick"}
                  </button>
                </div>
              </form>
            </section>
          </div>

          {/* Right Column: Customer Message Preview (Live Updating) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="sticky top-6">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-lg relative overflow-hidden">
                <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Customer Live Message Preview
                    </span>
                  </div>
                  <span className="text-[10px] bg-secondary px-2 py-0.5 rounded text-muted-foreground">Real-time</span>
                </div>

                {/* WhatsApp / SMS Card Mockup */}
                <div className="rounded-2xl bg-[#0b141a] p-4 text-slate-100 font-sans border border-slate-800 shadow-inner">
                  <div className="flex items-center gap-2 pb-2 mb-3 border-b border-slate-800/80">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                      OA
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-emerald-400">OddsArena Admin Automation</p>
                      <p className="text-[10px] text-slate-400">Customer SMS / WhatsApp Template</p>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs leading-relaxed font-mono whitespace-pre-wrap text-slate-200">
                    {liveCustomerMessage}
                  </div>

                  <div className="mt-4 flex items-center justify-between pt-2 border-t border-slate-800/80 text-[10px] text-slate-400">
                    <span>Tag: {predictionType}</span>
                    <span>Delivered via Onfon SMS</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground">Updates automatically as you edit fields.</p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(liveCustomerMessage);
                      setCopied(true);
                      toast.success("Live preview copied!");
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
                  >
                    {copied ? <CopyCheck className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    Copy Message
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Results Management Section ───────────────────────────────────────── */}
      {activeTab === "results" && (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h2 className="text-lg font-bold">Match Result Settlement</h2>
              <p className="text-xs text-muted-foreground">
                Enter actual final scores and update prediction status (Won 🟢 / Lost 🔴 / Pending 🟡 / Void ⚪).
              </p>
            </div>
            <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-500 border border-amber-500/20">
              {metrics.pending} Pending Settlement
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-secondary/40 text-muted-foreground uppercase font-semibold border-b border-border">
                <tr>
                  <th className="p-3">Match</th>
                  <th className="p-3">Sport / League</th>
                  <th className="p-3">Prediction</th>
                  <th className="p-3">Odds</th>
                  <th className="p-3">Score / Result</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {predictions.map((p) => (
                  <tr key={p.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="p-3 font-semibold text-foreground">
                      {p.team1} <span className="text-muted-foreground font-normal">vs</span> {p.team2}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {p.sport === "basketball" ? "🏀" : "⚽"} {p.league}
                    </td>
                    <td className="p-3 font-medium text-primary">{p.prediction}</td>
                    <td className="p-3 font-mono font-bold">{p.odds}</td>
                    <td className="p-3 font-mono">
                      {p.actualResult ? (
                        <span className="rounded bg-secondary px-2 py-0.5 text-xs font-bold">{p.actualResult}</span>
                      ) : (
                        <span className="text-muted-foreground italic">Not set</span>
                      )}
                    </td>
                    <td className="p-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => {
                          setSelectedResultPred(p);
                          setResScore1(p.score1 !== null && p.score1 !== undefined ? String(p.score1) : "");
                          setResScore2(p.score2 !== null && p.score2 !== undefined ? String(p.score2) : "");
                          setResStatus(p.status as any);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-primary/30 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-all"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Publish Result
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ─── Predictions Table (All / Football / Basketball) ────────────────── */}
      {activeTab !== "after_payment" && activeTab !== "jackpot" && activeTab !== "results" && (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold">
                {activeTab === "football"
                  ? "⚽ Today's Football Picks"
                  : activeTab === "basketball"
                  ? "🏀 Basketball Picks"
                  : "All Published Predictions"}
              </h2>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold">
                {filteredPredictions.length} items
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative min-w-[200px]">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search team or league…"
                  className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Filter */}
              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium outline-none"
              >
                <option value="all">All Tiers</option>
                <option value="gold">Gold</option>
                <option value="platinum">Platinum</option>
                <option value="sapphire">Sapphire</option>
                <option value="ruby">Ruby</option>
                <option value="emerald">Emerald</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPredictions.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-border bg-card p-4 shadow-sm hover:border-primary/40 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                      {p.sport === "basketball" ? "🏀" : "⚽"} {p.league}
                    </span>
                    <StatusBadge status={p.status} />
                  </div>

                  <h3 className="text-sm font-bold text-foreground">
                    {p.team1} <span className="text-muted-foreground font-normal">vs</span> {p.team2}
                  </h3>

                  <div className="mt-3 rounded-lg bg-secondary/50 p-2.5 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Prediction:</span>
                      <span className="font-bold text-primary">{p.prediction}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Odds:</span>
                      <span className="font-mono font-bold text-foreground">{p.odds}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Confidence:</span>
                      <span className="font-bold text-emerald-500">{p.confidence}%</span>
                    </div>
                    {p.actualResult && (
                      <div className="flex items-center justify-between border-t border-border/60 pt-1 mt-1">
                        <span className="text-muted-foreground">Final Score:</span>
                        <span className="font-mono font-bold text-amber-500">{p.actualResult}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between pt-3 border-t border-border text-xs">
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {p.predictionType} Tier
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(p)}
                      className="p-1.5 text-muted-foreground hover:text-primary transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id, `${p.team1} vs ${p.team2}`)}
                      className="p-1.5 text-muted-foreground hover:text-rose-500 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {filteredPredictions.length === 0 && (
              <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
                No predictions found matching your filter criteria.
              </div>
            )}
          </div>
        </section>
      )}

      {/* ─── Jackpots Section ─────────────────────────────────────────────────── */}
      {activeTab === "jackpot" && (
        <section className="space-y-6">
          <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Trophy className="h-6 w-6 text-amber-500" /> OddsArena Jackpot Management
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Create and settle multi-fixture jackpots (5 to 13 games).
              </p>
            </div>
            <button
              onClick={() => setShowJackpotModal(true)}
              className="inline-flex items-center gap-2 rounded-xl text-white px-4 py-2.5 text-xs font-semibold transition-all shadow-md"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Plus className="h-4 w-4" /> Add New Jackpot
            </button>
          </div>

          <div className="space-y-6">
            {jackpots.map((j) => (
              <div key={j.id} className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <span className="font-mono text-xs font-bold text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20">
                      ID: {j.jackpotCode}
                    </span>
                    <h3 className="text-base font-bold text-foreground mt-1.5">{j.title}</h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-medium text-muted-foreground">
                      Total Odds: <strong className="font-mono text-foreground">{j.totalOdds}</strong>
                    </span>

                    {/* Jackpot Status Toggle */}
                    <select
                      value={j.status}
                      onChange={(e) => handleJackpotStatusChange(j.id, e.target.value as any)}
                      className={cn(
                        "rounded-xl px-3 py-1.5 text-xs font-bold outline-none border",
                        j.status === "OPEN"
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                          : j.status === "CLOSED"
                          ? "bg-rose-500/10 text-rose-500 border-rose-500/30"
                          : "bg-secondary text-foreground border-border",
                      )}
                    >
                      <option value="OPEN">🟢 OPEN</option>
                      <option value="CLOSED">🔴 CLOSED</option>
                      <option value="SETTLED">⚪ SETTLED</option>
                    </select>

                    <button
                      onClick={() => handleDeleteJackpot(j.id, j.jackpotCode)}
                      className="p-1.5 text-muted-foreground hover:text-rose-500 transition-colors"
                      title="Delete Jackpot"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Fixtures Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-secondary/40 text-muted-foreground uppercase font-semibold border-b border-border">
                      <tr>
                        <th className="p-3 w-12">#</th>
                        <th className="p-3">Match Fixture</th>
                        <th className="p-3">Prediction</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {j.matches.map((m) => (
                        <tr key={m.id} className="hover:bg-secondary/20 transition-colors">
                          <td className="p-3 font-mono font-bold text-primary">{m.matchOrder}</td>
                          <td className="p-3 font-semibold">
                            {m.team1} <span className="text-muted-foreground font-normal">vs</span> {m.team2}
                          </td>
                          <td className="p-3 font-mono font-bold text-amber-500">{m.prediction}</td>
                          <td className="p-3">
                            <StatusBadge status={m.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Customer Message After Payment Tab ───────────────────────────────── */}
      {activeTab === "after_payment" && (
        <section className="max-w-3xl mx-auto rounded-2xl border border-border bg-card p-6 shadow-sm space-y-6">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Send className="h-5 w-5 text-emerald-500" /> Customer Message After Payment
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              This premium confirmation message is automatically unlocked and delivered to the customer upon successful M-Pesa till payment.
            </p>
          </div>

          <div className="rounded-2xl bg-[#0b141a] p-6 text-slate-100 font-sans border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white font-bold text-xs">
                OA
              </span>
              <div>
                <h3 className="text-sm font-bold text-emerald-400">OddsArena Automated Access SMS</h3>
                <p className="text-xs text-slate-400">Sent instantly on M-Pesa Callback trigger</p>
              </div>
            </div>

            <pre className="text-xs font-mono leading-relaxed text-slate-200 whitespace-pre-wrap bg-slate-900/60 p-4 rounded-xl border border-slate-800">
              {unlockedMessageText}
            </pre>

            <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800">
              <span>Dynamic resolution: Active DB predictions</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(unlockedMessageText);
                  toast.success("Customer unlocked message template copied!");
                }}
                className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold hover:underline"
              >
                <Copy className="h-3.5 w-3.5" /> Copy Template
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ─── Result Settlement Modal ──────────────────────────────────────────── */}
      {selectedResultPred && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold">Set Match Result</h3>
              <button onClick={() => setSelectedResultPred(null)} className="text-muted-foreground hover:text-foreground">
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="text-xs space-y-1">
              <p className="font-bold text-sm text-foreground">
                {selectedResultPred.team1} vs {selectedResultPred.team2}
              </p>
              <p className="text-muted-foreground">Pick: {selectedResultPred.prediction} ({selectedResultPred.odds})</p>
            </div>

            <form onSubmit={handleSaveResult} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">{selectedResultPred.team1} Score</label>
                  <input
                    type="number"
                    value={resScore1}
                    onChange={(e) => setResScore1(e.target.value)}
                    placeholder="0"
                    className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-mono outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">{selectedResultPred.team2} Score</label>
                  <input
                    type="number"
                    value={resScore2}
                    onChange={(e) => setResScore2(e.target.value)}
                    placeholder="0"
                    className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-mono outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Status</label>
                <select
                  value={resStatus}
                  onChange={(e) => setResStatus(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-bold outline-none"
                >
                  <option value="won">🟢 WON</option>
                  <option value="lost">🔴 LOST</option>
                  <option value="pending">🟡 PENDING</option>
                  <option value="void">⚪ VOID</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedResultPred(null)}
                  className="flex-1 rounded-xl border border-border py-2.5 text-xs font-semibold hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settling}
                  className="flex-1 rounded-xl text-white py-2.5 text-xs font-bold shadow-md disabled:opacity-50"
                  style={{ background: "var(--gradient-primary)" }}
                >
                  {settling ? "Publishing…" : "Publish Result"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── New Jackpot Modal ────────────────────────────────────────────────── */}
      {showJackpotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-500" /> Create OddsArena Jackpot
              </h3>
              <button onClick={() => setShowJackpotModal(false)} className="text-muted-foreground hover:text-foreground">
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateJackpot} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-muted-foreground">Jackpot Code</label>
                  <input
                    type="text"
                    required
                    value={jpCode}
                    onChange={(e) => setJpCode(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 font-mono text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-muted-foreground">Total Odds</label>
                  <input
                    type="text"
                    required
                    value={jpOdds}
                    onChange={(e) => setJpOdds(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 font-mono text-xs outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-muted-foreground">Jackpot Title</label>
                <input
                  type="text"
                  required
                  value={jpTitle}
                  onChange={(e) => setJpTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-muted-foreground">Fixtures (5 Games)</label>
                <div className="mt-2 space-y-2 max-h-48 overflow-y-auto pr-1">
                  {jpMatches.map((m, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-muted-foreground w-4">{idx + 1}.</span>
                      <input
                        type="text"
                        value={m.team1}
                        onChange={(e) => {
                          const val = e.target.value;
                          setJpMatches((prev) => prev.map((item, i) => (i === idx ? { ...item, team1: val } : item)));
                        }}
                        placeholder="Team 1"
                        className="flex-1 rounded-lg border border-border bg-background p-1.5 text-xs outline-none"
                      />
                      <span className="text-[10px] text-muted-foreground">vs</span>
                      <input
                        type="text"
                        value={m.team2}
                        onChange={(e) => {
                          const val = e.target.value;
                          setJpMatches((prev) => prev.map((item, i) => (i === idx ? { ...item, team2: val } : item)));
                        }}
                        placeholder="Team 2"
                        className="flex-1 rounded-lg border border-border bg-background p-1.5 text-xs outline-none"
                      />
                      <input
                        type="text"
                        value={m.prediction}
                        onChange={(e) => {
                          const val = e.target.value;
                          setJpMatches((prev) => prev.map((item, i) => (i === idx ? { ...item, prediction: val } : item)));
                        }}
                        placeholder="1/X/2"
                        className="w-14 rounded-lg border border-border bg-background p-1.5 text-xs font-mono text-center outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowJackpotModal(false)}
                  className="flex-1 rounded-xl border border-border py-2.5 text-xs font-semibold hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingJp}
                  className="flex-1 rounded-xl text-white py-2.5 text-xs font-bold shadow-md disabled:opacity-50"
                  style={{ background: "var(--gradient-primary)" }}
                >
                  {creatingJp ? "Creating…" : "Publish Jackpot"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helper Components ────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: any;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm flex items-center justify-between">
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-xl font-bold font-mono mt-0.5 text-foreground">{value}</p>
      </div>
      <div className={cn("p-2 rounded-xl bg-secondary/60", color)}>
        <Icon className="h-4 w-4" />
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
  badgeColor,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number | null;
  badgeColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all",
        active
          ? "bg-primary text-primary-foreground shadow-md"
          : "bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-secondary",
      )}
    >
      {label}
      {count !== null && (
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold",
            badgeColor
              ? badgeColor
              : active
              ? "bg-white/20 text-white"
              : "bg-secondary text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "won") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-500 border border-emerald-500/20">
        🟢 WON
      </span>
    );
  }
  if (status === "lost") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[10px] font-bold text-rose-500 border border-rose-500/20">
        🔴 LOST
      </span>
    );
  }
  if (status === "void") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground border border-border">
        ⚪ VOID
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-500 border border-amber-500/20">
      🟡 PENDING
    </span>
  );
}

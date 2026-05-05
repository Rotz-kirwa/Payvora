import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Loader2, Lock, Mail, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Sign in — Paykit" }] }),
});

function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (isAuthenticated) navigate({ to: "/", replace: true });
  }, [isAuthenticated, navigate]);

  const submit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate({ to: "/", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center p-4 overflow-hidden"
      style={{
        backgroundImage: "url('https://i.pinimg.com/736x/91/7d/a4/917da4ebb7424c3f6dc4892470178976.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Layered overlays for depth */}
      <div className="absolute inset-0 bg-black/60" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/70" />

      {/* Animated card wrapper */}
      <div
        className="relative z-10 w-full max-w-sm transition-all duration-700"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0)" : "translateY(28px)",
        }}
      >
        {/* Logo + brand */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div
            className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl shadow-2xl ring-2 ring-white/10"
            style={{
              transition: "transform 0.3s ease",
            }}
          >
            <img src="/favicon.jpg" alt="Paykit" className="h-full w-full object-cover" />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-wide text-white drop-shadow-lg">Paykit</h2>
            <p className="text-xs text-white/50 tracking-widest uppercase mt-0.5">Admin Portal</p>
          </div>
        </div>

        {/* Glass card */}
        <div
          className="rounded-3xl p-8 shadow-2xl"
          style={{
            background: "rgba(10, 15, 25, 0.82)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 32px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          <div className="mb-7 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-white">Welcome back</h1>
            <p className="mt-1.5 text-sm text-white/50">Sign in to continue to your dashboard</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {/* Email field */}
            <div className="group">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-white/50" htmlFor="email">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30 transition-colors group-focus-within:text-primary" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-12 w-full rounded-xl pl-10 pr-4 text-sm text-white outline-none transition-all placeholder:text-white/25"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.10)",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.border = "1px solid rgba(20,184,166,0.6)";
                    e.currentTarget.style.background = "rgba(255,255,255,0.09)";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(20,184,166,0.12)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.border = "1px solid rgba(255,255,255,0.10)";
                    e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
            </div>

            {/* Password field */}
            <div className="group">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-white/50" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30 transition-colors group-focus-within:text-primary" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-12 w-full rounded-xl pl-10 pr-11 text-sm text-white outline-none transition-all placeholder:text-white/25"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.10)",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.border = "1px solid rgba(20,184,166,0.6)";
                    e.currentTarget.style.background = "rgba(255,255,255,0.09)";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(20,184,166,0.12)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.border = "1px solid rgba(255,255,255,0.10)";
                    e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 transition-colors hover:text-white/70"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm text-red-400"
                style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.20)" }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="relative mt-2 h-12 w-full overflow-hidden rounded-xl text-sm font-bold tracking-wide text-white shadow-lg transition-all duration-200 hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
              style={{ background: "linear-gradient(135deg, oklch(0.50 0.11 183), oklch(0.62 0.15 183))" }}
            >
              {/* Shimmer overlay */}
              <span className="pointer-events-none absolute inset-0 rounded-xl"
                style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)" }} />
              <span className="relative flex items-center justify-center gap-2">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? "Signing in…" : "Sign in"}
              </span>
            </button>
          </form>
        </div>

        {/* Bottom brand text — bigger */}
        <div className="mt-8 text-center">
          <p className="text-base font-semibold tracking-widest text-white/70 uppercase">
            MOBOSOFT ENTERPRISE HQ
          </p>
          <p className="mt-1 text-sm tracking-widest text-white/40 uppercase">
            Paykit Admin
          </p>
        </div>
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/debug/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { isDebugAuthorized } = await import("../lib/debug.server");
        if (!isDebugAuthorized(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const checks: Record<string, unknown> = {};

        // DB connectivity
        try {
          const { sql } = await import("drizzle-orm");
          const { db } = await import("../lib/db/client");
          const result = await db.execute(sql`SELECT NOW() AS now`);
          const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
          checks.db = { ok: true, serverTime: (rows[0] as Record<string, unknown>)?.now };
        } catch (err) {
          checks.db = { ok: false, error: err instanceof Error ? err.message : String(err) };
        }

        // Required env vars
        const requiredVars = [
          "DATABASE_URL", "JWT_SECRET", "MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET",
          "MPESA_PASSKEY", "MPESA_SHORTCODE", "MPESA_CALLBACK_URL", "MPESA_ENVIRONMENT",
        ];
        const envStatus: Record<string, boolean> = {};
        for (const v of requiredVars) {
          envStatus[v] = !!process.env[v];
        }
        checks.env = {
          ok: requiredVars.every((v) => !!process.env[v]),
          vars: envStatus,
          callbackUrl: process.env.MPESA_CALLBACK_URL ?? null,
          mpesaEnvironment: process.env.MPESA_ENVIRONMENT ?? null,
          shortcode: process.env.MPESA_SHORTCODE ?? null,
        };

        // Callback URL reachability self-check
        const callbackUrl = process.env.MPESA_CALLBACK_URL?.trim();
        if (callbackUrl) {
          const c2bConfirmationUrl = new URL("/api/payments/c2b/confirmation", callbackUrl).toString();
          const c2bValidationUrl = new URL("/api/payments/c2b/validation", callbackUrl).toString();
          checks.callbackUrls = {
            confirmation: c2bConfirmationUrl,
            validation: c2bValidationUrl,
            legacy: {
              confirmation: new URL("/c2b/confirmation", callbackUrl).toString(),
              validation: new URL("/c2b/validation", callbackUrl).toString(),
            },
          };
        } else {
          checks.callbackUrls = { error: "MPESA_CALLBACK_URL not set" };
        }

        // mpesa_callback_events table stats
        try {
          const { getCallbackAuditSummary } = await import("../lib/callback-audit.server");
          const summary = await getCallbackAuditSummary();
          checks.callbackAudit = summary;
        } catch (err) {
          checks.callbackAudit = { ok: false, error: err instanceof Error ? err.message : String(err) };
        }

        const allOk =
          (checks.db as { ok: boolean }).ok && (checks.env as { ok: boolean }).ok;

        return Response.json(
          { ok: allOk, timestamp: new Date().toISOString(), checks },
          { status: allOk ? 200 : 503 },
        );
      },
    },
  },
});

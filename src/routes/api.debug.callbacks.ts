import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/debug/callbacks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { isDebugAuthorized, getRecentDebugLogs, getDebugLogStats } = await import(
          "../lib/debug.server"
        );
        if (!isDebugAuthorized(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { getCallbackAuditSummary } = await import("../lib/callback-audit.server");

        const [debugLogs, debugStats, auditSummary] = await Promise.all([
          getRecentDebugLogs(50),
          getDebugLogStats(),
          getCallbackAuditSummary(),
        ]);

        return Response.json({
          ok: true,
          debugLogs,
          debugStats,
          auditSummary,
        });
      },

      DELETE: async ({ request }) => {
        const { isDebugAuthorized } = await import("../lib/debug.server");
        if (!isDebugAuthorized(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { sql } = await import("drizzle-orm");
        const { db } = await import("../lib/db/client");
        try {
          await db.execute(sql`TRUNCATE TABLE callback_debug_logs`);
          return Response.json({ ok: true, message: "Debug logs cleared" });
        } catch (err) {
          return Response.json(
            { ok: false, error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          );
        }
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { readAndAuditCallbackRequest, markCallbackAuditResult } = await import(
          "../lib/callback-audit.server"
        );
        const audit = await readAndAuditCallbackRequest(request, "/callback", "stk_callback");

        try {
          const { handleStkCallback } = await import("../lib/mpesa-callback.server");
          const result = await handleStkCallback(audit.body);
          await markCallbackAuditResult(
            audit.auditId,
            "accepted",
            result.ResultCode,
            result.ResultDesc,
          );

          return Response.json(result);
        } catch (error) {
          console.error("[callback]", error);
          await markCallbackAuditResult(
            audit.auditId,
            "failed",
            1,
            "Failed to process callback",
            error,
          );

          return Response.json(
            { ResultCode: 1, ResultDesc: "Failed to process callback" },
            { status: 500 },
          );
        }
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/payments/c2b/confirmation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { readAndAuditCallbackRequest, markCallbackAuditResult } = await import(
          "../lib/callback-audit.server"
        );
        const audit = await readAndAuditCallbackRequest(
          request,
          "/api/payments/c2b/confirmation",
          "c2b_confirmation",
        );

        try {
          const { handleC2bConfirmation } = await import("../lib/mpesa-callback.server");
          const result = await handleC2bConfirmation(audit.body);
          await markCallbackAuditResult(
            audit.auditId,
            "accepted",
            result.ResultCode,
            result.ResultDesc,
          );

          return Response.json(result);
        } catch (error) {
          console.error("[api/payments/c2b/confirmation]", error);
          await markCallbackAuditResult(
            audit.auditId,
            "failed",
            1,
            "Failed to process confirmation",
            error,
          );

          return Response.json(
            { ResultCode: 1, ResultDesc: "Failed to process confirmation" },
            { status: 500 },
          );
        }
      },
    },
  },
});

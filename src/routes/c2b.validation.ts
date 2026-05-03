import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/c2b/validation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { readAndAuditCallbackRequest, markCallbackAuditResult } = await import(
          "../lib/callback-audit.server"
        );
        const audit = await readAndAuditCallbackRequest(
          request,
          "/c2b/validation",
          "c2b_validation",
        );

        try {
          const { handleC2bValidation } = await import("../lib/mpesa-callback.server");
          const result = await handleC2bValidation(audit.body);
          await markCallbackAuditResult(
            audit.auditId,
            "accepted",
            result.ResultCode,
            result.ResultDesc,
          );

          return Response.json(result);
        } catch (error) {
          console.error("[c2b/validation]", error);
          await markCallbackAuditResult(
            audit.auditId,
            "failed",
            1,
            "Failed to process validation",
            error,
          );

          return Response.json(
            { ResultCode: 1, ResultDesc: "Failed to process validation" },
            { status: 500 },
          );
        }
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/debug/simulate-c2b")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isDebugAuthorized } = await import("../lib/debug.server");
        if (!isDebugAuthorized(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        let body: Record<string, unknown> = {};
        try {
          body = await request.json();
        } catch {
          // use defaults
        }

        const transId = `SIM${Date.now()}`;
        const payload = {
          TransID: String(body.TransID ?? transId),
          TransTime: new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14),
          TransAmount: String(body.TransAmount ?? "1.00"),
          BusinessShortCode: String(body.BusinessShortCode ?? process.env.MPESA_SHORTCODE ?? "6270335"),
          BillRefNumber: String(body.BillRefNumber ?? "simulate-c2b"),
          MSISDN: String(body.MSISDN ?? "254700000000"),
          FirstName: String(body.FirstName ?? "Simulate"),
          LastName: String(body.LastName ?? "Test"),
          MiddleName: "",
        };

        console.log("[debug/simulate-c2b] Simulating C2B confirmation:", payload.TransID);

        try {
          const { handleC2bConfirmation } = await import("../lib/mpesa-callback.server");
          const result = await handleC2bConfirmation(payload);
          return Response.json({
            ok: true,
            transId: payload.TransID,
            payload,
            result,
            message: "Simulated C2B confirmation processed — check Payments page and Render logs",
          });
        } catch (error) {
          console.error("[debug/simulate-c2b] Error:", error);
          return Response.json(
            {
              ok: false,
              transId: payload.TransID,
              payload,
              error: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
          );
        }
      },
    },
  },
});

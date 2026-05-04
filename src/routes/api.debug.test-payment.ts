import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/debug/test-payment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Require a secret token to prevent abuse
        const token = request.headers.get("x-debug-token");
        const expected = process.env.JWT_SECRET?.slice(0, 16);
        if (!token || token !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        try {
          const { handleC2bConfirmation } = await import("../lib/mpesa-callback.server");

          const fakePayload = {
            TransID: `DBG${Date.now()}`,
            TransTime: new Date()
              .toISOString()
              .replace(/[^0-9]/g, "")
              .slice(0, 14),
            TransAmount: "1.00",
            BusinessShortCode: process.env.MPESA_SHORTCODE ?? "6270335",
            BillRefNumber: "debug-test",
            MSISDN: "254700000000",
            FirstName: "Debug",
            LastName: "Test",
            MiddleName: "",
          };

          console.log("[debug/test-payment] Inserting fake payment:", fakePayload.TransID);

          const result = await handleC2bConfirmation(fakePayload);

          return Response.json({
            ok: true,
            transId: fakePayload.TransID,
            result,
            message: "Fake payment inserted — check Payments page and Render logs",
          });
        } catch (error) {
          console.error("[debug/test-payment] Error:", error);
          return Response.json(
            {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
          );
        }
      },
    },
  },
});

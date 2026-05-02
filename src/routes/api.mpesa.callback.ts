import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/mpesa/callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { handleStkCallback } = await import("../lib/mpesa-callback.server");

          return Response.json(await handleStkCallback(body));
        } catch (error) {
          console.error("[api/mpesa/callback]", error);

          return Response.json(
            { ResultCode: 1, ResultDesc: "Failed to process callback" },
            { status: 500 },
          );
        }
      },
    },
  },
});

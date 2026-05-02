import { createFileRoute } from "@tanstack/react-router";

const REQUIRED_ENV = [
  "DATABASE_URL",
  "JWT_SECRET",
  "MPESA_CONSUMER_KEY",
  "MPESA_CONSUMER_SECRET",
  "MPESA_SHORTCODE",
  "MPESA_TILL_NUMBER",
  "MPESA_PASSKEY",
  "MPESA_CALLBACK_URL",
  "MPESA_ENVIRONMENT",
  "SMS_PROVIDER",
  "ONFON_API_URL",
  "ONFON_API_KEY",
  "ONFON_CLIENT_ID",
  "ONFON_SENDER_ID",
] as const;

export const Route = createFileRoute("/api/payments/c2b/status")({
  server: {
    handlers: {
      GET: async () => {
        const callbackBase = process.env.MPESA_CALLBACK_URL?.trim() ?? null;
        const expected = callbackBase
          ? {
              confirmationUrl: new URL("/api/payments/c2b/confirmation", callbackBase).toString(),
              validationUrl: new URL("/api/payments/c2b/validation", callbackBase).toString(),
              stkCallbackUrl: new URL("/api/mpesa/callback", callbackBase).toString(),
            }
          : null;

        const env = Object.fromEntries(REQUIRED_ENV.map((key) => [key, !!process.env[key]?.trim()]));

        let database = { ok: false, error: null as string | null };
        try {
          const { sql } = await import("drizzle-orm");
          const { db } = await import("../lib/db/client");
          await db.execute(sql`select 1`);
          database = { ok: true, error: null };
        } catch (error) {
          database = {
            ok: false,
            error: error instanceof Error ? error.message : "Database check failed",
          };
        }

        return Response.json({
          ok: database.ok,
          service: "payvora-c2b",
          shortcode: process.env.MPESA_SHORTCODE?.trim() ?? null,
          tillNumber: process.env.MPESA_TILL_NUMBER?.trim() ?? null,
          mpesaEnvironment: process.env.MPESA_ENVIRONMENT?.trim() ?? "sandbox",
          expected,
          env,
          database,
          timestamp: new Date().toISOString(),
        });
      },
    },
  },
});

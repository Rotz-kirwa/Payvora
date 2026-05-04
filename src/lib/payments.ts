import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Explicit type — avoids importing Drizzle schema (which pulls pg-core into client bundle)
export type MpesaPayment = {
  id: string;
  source: "stk_push" | "c2b_till";
  status: "Pending" | "Success" | "Failed" | "Cancelled";
  phone: string;
  payerName: string | null;
  amount: string;
  businessShortcode: string | null;
  tillNumber: string | null;
  merchantRequestId: string | null;
  checkoutRequestId: string | null;
  mpesaReceiptNumber: string | null;
  resultCode: number | null;
  resultDesc: string | null;
  accountReference: string | null;
  transactionDesc: string | null;
  initiatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  paidAt: Date | null;
};

export const fetchPaymentsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchPayments } = await import("./payments.server");
  return fetchPayments();
});

const stkPushSchema = z.object({
  phone: z.string().min(9),
  amount: z.number().positive().max(150000),
  reference: z.string().min(1).max(12),
  description: z.string().max(13).optional(),
});

type StkPushInput = z.infer<typeof stkPushSchema>;

export const initiateStkPushFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => stkPushSchema.parse(input))
  .handler(async (ctx) => {
    const data = ctx.data as StkPushInput;
    const { initiatePayment } = await import("./payments.server");
    return initiatePayment(
      data.phone,
      data.amount,
      data.reference.trim().slice(0, 12),
      data.description?.trim().slice(0, 13) ?? "Payment",
    );
  });
export const recheckPaymentStatusFn = createServerFn({ method: "POST" })
  .inputValidator((id: unknown) => z.string().parse(id))
  .handler(async ({ data: id }) => {
    const { recheckPaymentStatus } = await import("./payments.server");
    return recheckPaymentStatus(id);
  });

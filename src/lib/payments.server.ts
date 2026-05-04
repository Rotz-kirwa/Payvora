import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getCurrentUser, requireCurrentUser } from "./auth.server";
import { db } from "./db/client";
import { mpesaPayments } from "./db/schema";
import { normalizeKenyanPhone, queryStkPushStatus, stkPush } from "./mpesa.server";

const STK_SHORTCODE = process.env.MPESA_SHORTCODE?.trim() ?? "6270336";
const STK_TILL_NUMBER = process.env.MPESA_TILL_NUMBER?.trim() ?? "895858";

let schemaEnsured = false;
async function ensureSchema() {
  if (schemaEnsured) return;
  await db.execute(sql`ALTER TABLE mpesa_payments ADD COLUMN IF NOT EXISTS payer_name TEXT`);
  schemaEnsured = true;
}

function getReconciledStatus(resultCode: number, resultDesc: string | null) {
  if (resultCode === 0) return "Success" as const;
  if (resultCode === 1032) return "Cancelled" as const;

  const normalizedDesc = resultDesc?.toLowerCase() ?? "";
  if (
    normalizedDesc.includes("processing") ||
    normalizedDesc.includes("pending") ||
    resultCode === 4999
  ) {
    return "Pending" as const;
  }

  return "Failed" as const;
}

export async function reconcilePendingStkPayments(limit = 20) {
  const pending = await db
    .select({
      id: mpesaPayments.id,
      checkoutRequestId: mpesaPayments.checkoutRequestId,
      merchantRequestId: mpesaPayments.merchantRequestId,
    })
    .from(mpesaPayments)
    .where(
      and(
        eq(mpesaPayments.source, "stk_push"),
        eq(mpesaPayments.status, "Pending"),
        isNotNull(mpesaPayments.checkoutRequestId),
      ),
    )
    .orderBy(desc(mpesaPayments.createdAt))
    .limit(limit);

  for (const payment of pending) {
    if (!payment.checkoutRequestId) continue;

    try {
      const result = await queryStkPushStatus(payment.checkoutRequestId);
      const parsedResultCode =
        result.ResultCode != null && result.ResultCode !== "" ? Number(result.ResultCode) : null;

      if (parsedResultCode === null || Number.isNaN(parsedResultCode)) {
        continue;
      }

      const resultDesc = result.ResultDesc ?? "Status reconciled from STK query";
      const status = getReconciledStatus(parsedResultCode, resultDesc);

      console.log(`[reconcile] ${payment.checkoutRequestId} -> ${status} (ResultCode: ${parsedResultCode}, Desc: ${resultDesc})`);

      if (status === "Pending") {
        continue;
      }

      await db
        .update(mpesaPayments)
        .set({
          status,
          resultCode: parsedResultCode,
          resultDesc,
          merchantRequestId: result.MerchantRequestID ?? payment.merchantRequestId,
          rawCallbackJson: {
            source: "stk_query",
            reconciledAt: new Date().toISOString(),
            result,
          },
          updatedAt: new Date(),
          ...(status === "Success" ? { paidAt: new Date() } : {}),
        })
        .where(eq(mpesaPayments.id, payment.id));
    } catch (error) {
      console.error(
        `[reconcilePendingStkPayments] Failed to reconcile ${payment.checkoutRequestId}:`,
        error,
      );
    }
  }
}

export async function fetchPayments() {
  const user = await getCurrentUser();
  if (!user) return [];

  await ensureSchema();

  return db
    .select({
      id: mpesaPayments.id,
      source: mpesaPayments.source,
      status: mpesaPayments.status,
      phone: mpesaPayments.phone,
      payerName: mpesaPayments.payerName,
      amount: mpesaPayments.amount,
      businessShortcode: mpesaPayments.businessShortcode,
      tillNumber: mpesaPayments.tillNumber,
      merchantRequestId: mpesaPayments.merchantRequestId,
      checkoutRequestId: mpesaPayments.checkoutRequestId,
      mpesaReceiptNumber: mpesaPayments.mpesaReceiptNumber,
      resultCode: mpesaPayments.resultCode,
      resultDesc: mpesaPayments.resultDesc,
      accountReference: mpesaPayments.accountReference,
      transactionDesc: mpesaPayments.transactionDesc,
      initiatedBy: mpesaPayments.initiatedBy,
      createdAt: mpesaPayments.createdAt,
      updatedAt: mpesaPayments.updatedAt,
      paidAt: mpesaPayments.paidAt,
    })
    .from(mpesaPayments)
    .orderBy(desc(mpesaPayments.createdAt))
    .limit(500);
}

export async function initiatePayment(
  phone: string,
  amount: number,
  reference: string,
  description: string,
) {
  const user = await requireCurrentUser();
  const normalizedPhone = normalizeKenyanPhone(phone);

  // 1. Insert Pending record FIRST
  const [record] = await db
    .insert(mpesaPayments)
    .values({
      source: "stk_push",
      status: "Pending",
      phone: normalizedPhone,
      amount: String(amount),
      businessShortcode: STK_SHORTCODE,
      tillNumber: STK_TILL_NUMBER,
      accountReference: reference,
      transactionDesc: description,
      initiatedBy: user.id,
      rawRequestJson: { phone, amount, reference, description } as Record<string, unknown>,
    })
    .returning({ id: mpesaPayments.id });

  // 2. Call Daraja
  try {
    const result = await stkPush(normalizedPhone, amount, reference, description);
    await db
      .update(mpesaPayments)
      .set({
        checkoutRequestId: result.CheckoutRequestID,
        merchantRequestId: result.MerchantRequestID,
        updatedAt: new Date(),
      })
      .where(eq(mpesaPayments.id, record.id));
    return { checkoutRequestId: result.CheckoutRequestID, message: result.CustomerMessage };
  } catch (err) {
    await db
      .update(mpesaPayments)
      .set({
        status: "Failed",
        resultDesc: err instanceof Error ? err.message : "STK Push initiation failed",
        updatedAt: new Date(),
      })
      .where(eq(mpesaPayments.id, record.id));
    throw err;
  }
}
export async function recheckPaymentStatus(paymentId: string) {
  await requireCurrentUser();

  const [payment] = await db
    .select()
    .from(mpesaPayments)
    .where(eq(mpesaPayments.id, paymentId))
    .limit(1);

  if (!payment || !payment.checkoutRequestId) {
    throw new Error("Payment not found or no checkoutRequestId available");
  }

  try {
    const result = await queryStkPushStatus(payment.checkoutRequestId);
    const parsedResultCode =
      result.ResultCode != null && result.ResultCode !== "" ? Number(result.ResultCode) : null;

    if (parsedResultCode === null || Number.isNaN(parsedResultCode)) {
      throw new Error("Daraja returned an empty status");
    }

    const resultDesc = result.ResultDesc ?? "Manual status sync";
    const status = getReconciledStatus(parsedResultCode, resultDesc);

    await db
      .update(mpesaPayments)
      .set({
        status,
        resultCode: parsedResultCode,
        resultDesc,
        merchantRequestId: result.MerchantRequestID ?? payment.merchantRequestId,
        rawCallbackJson: {
          source: "manual_sync",
          syncedAt: new Date().toISOString(),
          result,
        },
        updatedAt: new Date(),
        ...(status === "Success" ? { paidAt: new Date() } : {}),
      })
      .where(eq(mpesaPayments.id, payment.id));

    return { status, message: resultDesc };
  } catch (error) {
    console.error(`[recheckPaymentStatus] Error for ${paymentId}:`, error);
    throw error;
  }
}

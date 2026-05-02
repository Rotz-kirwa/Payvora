const BASE =
  process.env.MPESA_ENVIRONMENT === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

// Store number used for Buy Goods STK Push.
const STORE_NUMBER = process.env.MPESA_SHORTCODE?.trim() ?? "6270335";
// Till number that actually receives Buy Goods payments.
const TILL_NUMBER = process.env.MPESA_TILL_NUMBER?.trim() ?? "895858";

async function getToken(): Promise<string> {
  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  if (!key || !secret) throw new Error("MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET must be set");

  const res = await fetch(`${BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${btoa(`${key}:${secret}`)}` },
  });
  if (!res.ok) throw new Error(`Daraja auth failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export function normalizeKenyanPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
}

// Alias for backwards compat
export { normalizeKenyanPhone as normalizeKenyanPhoneNumber };

export interface StkPushResult {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

export interface StkPushQueryResult {
  ResponseCode: string;
  ResponseDescription: string;
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResultCode?: string;
  ResultDesc?: string;
  errorCode?: string;
  errorMessage?: string;
}

export async function stkPush(
  phone: string,
  amount: number,
  reference: string,
  description: string,
): Promise<StkPushResult> {
  const passkey = process.env.MPESA_PASSKEY?.trim();
  const callbackUrl = process.env.MPESA_CALLBACK_URL?.trim();

  if (!passkey || !callbackUrl) throw new Error("MPESA_PASSKEY and MPESA_CALLBACK_URL must be set");

  const token = await getToken();
  const timestamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, 14);
  const password = btoa(`${STORE_NUMBER}${passkey}${timestamp}`);

  const normalizedPhone = normalizeKenyanPhone(phone);

  const payload = {
    BusinessShortCode: STORE_NUMBER,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerBuyGoodsOnline",
    Amount: Math.ceil(amount),
    PartyA: normalizedPhone,
    PartyB: TILL_NUMBER,
    PhoneNumber: normalizedPhone,
    CallBackURL: new URL("/mpesa/callback", callbackUrl).toString(),
    AccountReference: reference.slice(0, 12),
    TransactionDesc: description.slice(0, 13),
  };

  console.log("[stkPush] Request payload:", JSON.stringify(payload, null, 2));

  const res = await fetch(`${BASE}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`STK Push failed (${res.status}): ${text}`);
  const result = JSON.parse(text) as StkPushResult;
  if (result.ResponseCode !== "0")
    throw new Error(`STK Push rejected: ${result.ResponseDescription}`);
  return result;
}

export async function queryStkPushStatus(checkoutRequestId: string): Promise<StkPushQueryResult> {
  const passkey = process.env.MPESA_PASSKEY?.trim();

  if (!passkey) throw new Error("MPESA_PASSKEY must be set");

  const token = await getToken();
  const timestamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, 14);
  const password = btoa(`${STORE_NUMBER}${passkey}${timestamp}`);

  const res = await fetch(`${BASE}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: STORE_NUMBER,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`STK Push query failed (${res.status}): ${text}`);

  const result = JSON.parse(text) as StkPushQueryResult;

  if (result.errorCode || result.errorMessage) {
    throw new Error(result.errorMessage ?? result.errorCode ?? "Unknown STK query error");
  }

  return result;
}

export async function registerC2bUrls() {
  const callbackUrl = process.env.MPESA_CALLBACK_URL?.trim();
  // For Buy Goods, C2B callbacks are routed by Safaricom based on the Till Number,
  // not the Store/Merchant number.
  const shortCode = process.env.MPESA_TILL_NUMBER?.trim() ?? TILL_NUMBER;

  if (!callbackUrl) throw new Error("MPESA_CALLBACK_URL must be set");

  const confirmationUrl = new URL("/c2b/confirmation", callbackUrl).toString();
  const validationUrl = new URL("/c2b/validation", callbackUrl).toString();

  const token = await getToken();
  const res = await fetch(`${BASE}/mpesa/c2b/v2/registerurl`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      ShortCode: shortCode,
      ResponseType: "Completed",
      ConfirmationURL: confirmationUrl,
      ValidationURL: validationUrl,
    }),
  });

  const text = await res.text();
  const response = JSON.parse(text) as Record<string, unknown>;
  const errorMessage = typeof response.errorMessage === "string" ? response.errorMessage : null;

  if (!res.ok && errorMessage !== "URLs are already registered") {
    throw new Error(`C2B URL registration failed (${res.status}): ${text}`);
  }

  return {
    shortCode,
    confirmationUrl,
    validationUrl,
    response,
    alreadyRegistered: errorMessage === "URLs are already registered",
  };
}

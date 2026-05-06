/**
 * SMS Provider Integration
 *
 * Environment variables:
 *   SMS_PROVIDER          - "onfon" | "africastalking" | "safaricom" | "custom"  (default: "africastalking")
 *
 * Onfon Media (SMS_PROVIDER=onfon):
 *   ONFON_API_KEY    - Onfon account API key
 *   ONFON_CLIENT_ID  - Onfon account client ID
 *   ONFON_SENDER_ID  - Approved sender ID, e.g. "STARCODE"
 *   ONFON_API_URL    - Override endpoint (default: https://api.onfonmedia.co.ke/v1/sms/SendBulkSMS)
 *
 * Africa's Talking (SMS_PROVIDER=africastalking):
 *   AFRICASTALKING_USERNAME  - AT account username
 *   AFRICASTALKING_API_KEY   - AT API key
 *
 * Safaricom Daraja SMS (SMS_PROVIDER=safaricom):
 *   Uses MPESA_CONSUMER_KEY + MPESA_CONSUMER_SECRET for OAuth (same credentials as M-Pesa).
 *   Supports sending to hashed MSISDNs from C2B Buy Goods callbacks — Safaricom resolves
 *   the hash on their side and delivers to the real number.
 *   MPESA_SHORTCODE      - Your shortcode / sender ID (already set for M-Pesa)
 *   SAFARICOM_SMS_URL    - Override SMS endpoint (default: Daraja v1/sms/send)
 *
 * Custom HTTP provider (SMS_PROVIDER=custom):
 *   SMS_CUSTOM_URL           - Full POST URL of SMS endpoint
 *   SMS_CUSTOM_API_KEY       - API key / bearer token
 *   SMS_CUSTOM_PHONE_FIELD   - Body field name for phone   (default: "phone")
 *   SMS_CUSTOM_MESSAGE_FIELD - Body field name for message (default: "message")
 */

export interface SmsSendResult {
  success: boolean;
  messageId?: string;
  response: Record<string, unknown>;
  error?: string;
}

/** Ensure phone is in E.164 format for the provider (+254...). */
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("254")) return `+${digits}`;
  if (digits.startsWith("0")) return `+254${digits.slice(1)}`;
  if (digits.length === 9) return `+254${digits}`;
  return `+${digits}`;
}

/** Strip non-digits and normalise to 2547XXXXXXXX (no leading +). */
function toOnfonPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.length === 9 && /^[71]/.test(digits)) return `254${digits}`;
  return digits;
}

async function sendOnfon(phone: string, message: string): Promise<SmsSendResult> {
  const apiKey = process.env.ONFON_API_KEY?.trim();
  const clientId = process.env.ONFON_CLIENT_ID?.trim();
  const senderId = process.env.ONFON_SENDER_ID?.trim() || "STAR_CODE";
  const apiUrl =
    process.env.ONFON_API_URL?.trim() ||
    "https://api.onfonmedia.co.ke/v1/sms/SendBulkSMS";

  if (!apiKey) throw new Error("ONFON_API_KEY must be set for SMS_PROVIDER=onfon");
  if (!clientId) throw new Error("ONFON_CLIENT_ID must be set for SMS_PROVIDER=onfon");

  const body = {
    ApiKey: apiKey,
    ClientId: clientId,
    SenderId: senderId,
    MessageParameters: [
      { Number: toOnfonPhone(phone), Text: message },
    ],
  };

  console.log(`[sms/onfon] Sending to ${toOnfonPhone(phone)} via ${apiUrl}`);

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text);
  } catch {
    // Non-JSON response — treat HTTP status as the signal
    const ok = res.ok;
    console.log(`[sms/onfon] HTTP ${res.status} (non-JSON) — ${text.slice(0, 120)}`);
    return {
      success: ok,
      response: { raw: text },
      error: ok ? undefined : `Onfon HTTP ${res.status}: ${text.slice(0, 120)}`,
    };
  }

  // Onfon uses ErrorCode: 0 / "0" for success regardless of HTTP status
  // Data[0].MessageErrorCode "200" = per-message success
  const errorCode = data.ErrorCode ?? data.error_code ?? data.errorCode;
  const msgData = Array.isArray(data.Data) ? (data.Data[0] as Record<string, unknown>) : null;
  const msgErrorCode = msgData?.MessageErrorCode;

  const ok =
    errorCode === 0 ||
    errorCode === "0" ||
    msgErrorCode === 0 ||
    msgErrorCode === "0" ||
    msgErrorCode === "200" ||
    (typeof data.ErrorDescription === "string" &&
      data.ErrorDescription.toLowerCase() === "success");

  const errorDesc =
    msgData?.MessageErrorDescription ??
    data.ErrorDescription ??
    data.message ??
    data.error ??
    "unknown error";

  console.log(
    `[sms/onfon] HTTP ${res.status} ErrorCode=${errorCode} MsgCode=${msgErrorCode} — ${ok ? "SUCCESS" : `FAILED: ${errorDesc}`}`,
  );

  return {
    success: ok,
    messageId: typeof msgData?.MessageId === "string" ? msgData.MessageId : undefined,
    response: data,
    error: ok ? undefined : `Onfon: ${errorDesc}`,
  };
}

async function sendAfricasTalking(phone: string, message: string): Promise<SmsSendResult> {
  const username = process.env.AFRICASTALKING_USERNAME?.trim();
  const apiKey = process.env.AFRICASTALKING_API_KEY?.trim();
  const senderId = process.env.SMS_SENDER_ID?.trim() || undefined;

  if (!username || !apiKey) {
    throw new Error(
      "AFRICASTALKING_USERNAME and AFRICASTALKING_API_KEY must be set for SMS_PROVIDER=africastalking",
    );
  }

  const isSandbox = process.env.SMS_SANDBOX === "true";
  const baseUrl = isSandbox
    ? "https://api.sandbox.africastalking.com"
    : "https://api.africastalking.com";

  const params = new URLSearchParams({
    username,
    to: toE164(phone),
    message,
    ...(senderId ? { from: senderId } : {}),
  });

  const res = await fetch(`${baseUrl}/version1/messaging`, {
    method: "POST",
    headers: {
      apiKey,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    return { success: false, response: data, error: `AT HTTP ${res.status}` };
  }

  const smsData = (data as { SMSMessageData?: { Recipients?: Array<{ status: string; messageId?: string }> } })
    .SMSMessageData;
  const recipient = smsData?.Recipients?.[0];
  const sent = recipient?.status === "Success";

  return {
    success: sent,
    messageId: recipient?.messageId,
    response: data,
    error: sent ? undefined : `AT status: ${recipient?.status ?? "unknown"}`,
  };
}

async function sendSafaricom(phone: string, message: string): Promise<SmsSendResult> {
  const key = process.env.MPESA_CONSUMER_KEY?.trim();
  const secret = process.env.MPESA_CONSUMER_SECRET?.trim();
  const shortcode = process.env.MPESA_SHORTCODE?.trim();

  if (!key || !secret) {
    throw new Error("MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET must be set for SMS_PROVIDER=safaricom");
  }

  const base =
    process.env.MPESA_ENVIRONMENT === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";

  // Get OAuth token
  const tokenRes = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}` },
  });
  const tokenData = (await tokenRes.json()) as { access_token?: string; errorMessage?: string };
  if (!tokenData.access_token) {
    return {
      success: false,
      response: tokenData as Record<string, unknown>,
      error: `Safaricom OAuth failed: ${tokenData.errorMessage ?? "no access_token"}`,
    };
  }

  const smsUrl =
    process.env.SAFARICOM_SMS_URL?.trim() ?? `${base}/v1/sms/send`;

  const body: Record<string, string> = { message, phoneNumber: phone };
  if (shortcode) body.shortCode = shortcode;

  console.log(`[sms/safaricom] Sending to ${phone.slice(0, 10)}... via ${smsUrl}`);

  const res = await fetch(smsUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  const ok = res.ok && !data.errorCode && !data.ResponseCode;
  console.log(`[sms/safaricom] HTTP ${res.status} — ${ok ? "SUCCESS" : `FAILED: ${text.slice(0, 120)}`}`);

  return {
    success: ok,
    response: data,
    error: ok ? undefined : `Safaricom SMS HTTP ${res.status}: ${text.slice(0, 120)}`,
  };
}

async function sendCustom(phone: string, message: string): Promise<SmsSendResult> {
  const url = process.env.SMS_CUSTOM_URL?.trim();
  const apiKey = process.env.SMS_CUSTOM_API_KEY?.trim();
  const phoneField = process.env.SMS_CUSTOM_PHONE_FIELD?.trim() || "phone";
  const messageField = process.env.SMS_CUSTOM_MESSAGE_FIELD?.trim() || "message";

  if (!url) {
    throw new Error("SMS_CUSTOM_URL must be set for SMS_PROVIDER=custom");
  }

  const body: Record<string, string> = {
    [phoneField]: toE164(phone),
    [messageField]: message,
  };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  return {
    success: res.ok,
    response: data,
    error: res.ok ? undefined : `Custom provider HTTP ${res.status}`,
  };
}

/**
 * Send a single SMS.  Returns a result object — never throws.
 * If no provider credentials are configured, returns success=false.
 */
export async function sendSms(phone: string, message: string): Promise<SmsSendResult> {
  const provider = process.env.SMS_PROVIDER?.toLowerCase() ?? "africastalking";

  try {
    if (provider === "onfon") return await sendOnfon(phone, message);
    if (provider === "africastalking") return await sendAfricasTalking(phone, message);
    if (provider === "safaricom") return await sendSafaricom(phone, message);
    if (provider === "custom") return await sendCustom(phone, message);
    return {
      success: false,
      response: {},
      error: `Unknown SMS_PROVIDER "${provider}". Set to "onfon", "africastalking", "safaricom", or "custom".`,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[sms] Send failed:", error);
    return { success: false, response: {}, error };
  }
}

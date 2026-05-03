import { sql } from "drizzle-orm";
import { db } from "./db/client";

type UnknownRecord = Record<string, unknown>;

export type CallbackAuditEventType = "c2b_confirmation" | "c2b_validation" | "stk_callback";

export interface CallbackAuditResult {
  auditId: string | null;
  body: unknown;
  rawBody: string;
  parseError: string | null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function parseAmount(value: unknown): string | null {
  const raw = parseString(value);
  if (!raw) return null;
  const normalized = raw.replace(/,/g, "").trim();
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount.toFixed(2) : null;
}

function maskPhone(value: unknown): string | null {
  const digits = parseString(value)?.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length <= 6) return digits;
  return `${digits.slice(0, 5)}***${digits.slice(-3)}`;
}

function getHeader(request: Request, name: string): string | null {
  return request.headers.get(name) ?? null;
}

function getSourceIp(request: Request): string | null {
  return (
    getHeader(request, "cf-connecting-ip") ??
    getHeader(request, "x-forwarded-for")?.split(",")[0]?.trim() ??
    getHeader(request, "x-real-ip")
  );
}

function extractFields(eventType: CallbackAuditEventType, body: unknown) {
  if (!isRecord(body)) {
    return {
      transId: null,
      checkoutRequestId: null,
      phoneMasked: null,
      amount: null,
      shortcode: null,
    };
  }

  if (eventType === "stk_callback") {
    const stkCallback =
      isRecord(body.Body) && isRecord(body.Body.stkCallback) ? body.Body.stkCallback : {};
    return {
      transId: null,
      checkoutRequestId: parseString(stkCallback.CheckoutRequestID),
      phoneMasked: null,
      amount: null,
      shortcode: null,
    };
  }

  return {
    transId: parseString(body.TransID),
    checkoutRequestId: null,
    phoneMasked: maskPhone(body.MSISDN),
    amount: parseAmount(body.TransAmount),
    shortcode: parseString(body.BusinessShortCode),
  };
}

async function ensureCallbackAuditTable() {
  await db.execute(sql`
    create table if not exists mpesa_callback_events (
      id uuid primary key default gen_random_uuid(),
      route text not null,
      method text not null,
      event_type text not null,
      source_ip text,
      user_agent text,
      content_type text,
      trans_id text,
      checkout_request_id text,
      phone_masked text,
      amount numeric(12,2),
      shortcode text,
      payload jsonb,
      raw_body text,
      result_code integer,
      result_desc text,
      processing_status text not null default 'received',
      error_message text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await db.execute(sql`
    create index if not exists idx_mpesa_callback_events_created_at
    on mpesa_callback_events (created_at desc)
  `);
  await db.execute(sql`
    create index if not exists idx_mpesa_callback_events_trans_id
    on mpesa_callback_events (trans_id)
  `);
}

export async function readAndAuditCallbackRequest(
  request: Request,
  route: string,
  eventType: CallbackAuditEventType,
): Promise<CallbackAuditResult> {
  const rawBody = await request.text();
  let body: unknown = null;
  let parseError: string | null = null;

  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch (error) {
    parseError = error instanceof Error ? error.message : "Invalid JSON body";
    body = { invalidJson: true };
  }

  const fields = extractFields(eventType, body);

  console.log("[callback-audit] Incoming callback request:", {
    route,
    method: request.method,
    eventType,
    sourceIp: getSourceIp(request),
    userAgent: getHeader(request, "user-agent"),
    contentType: getHeader(request, "content-type"),
    transId: fields.transId,
    checkoutRequestId: fields.checkoutRequestId,
    phoneMasked: fields.phoneMasked,
    amount: fields.amount,
    shortcode: fields.shortcode,
    parseError,
  });

  try {
    await ensureCallbackAuditTable();
    const inserted = await db.execute(sql`
      insert into mpesa_callback_events (
        route,
        method,
        event_type,
        source_ip,
        user_agent,
        content_type,
        trans_id,
        checkout_request_id,
        phone_masked,
        amount,
        shortcode,
        payload,
        raw_body,
        processing_status,
        error_message
      )
      values (
        ${route},
        ${request.method},
        ${eventType},
        ${getSourceIp(request)},
        ${getHeader(request, "user-agent")},
        ${getHeader(request, "content-type")},
        ${fields.transId},
        ${fields.checkoutRequestId},
        ${fields.phoneMasked},
        ${fields.amount},
        ${fields.shortcode},
        ${JSON.stringify(body)}::jsonb,
        ${rawBody.slice(0, 10000)},
        ${parseError ? "parse_failed" : "received"},
        ${parseError}
      )
      returning id
    `);
    const auditId = Array.isArray(inserted) ? String(inserted[0]?.id ?? "") : "";
    return { auditId: auditId || null, body, rawBody, parseError };
  } catch (error) {
    console.error("[callback-audit] Failed to record callback event:", error);
    return { auditId: null, body, rawBody, parseError };
  }
}

export async function markCallbackAuditResult(
  auditId: string | null,
  status: "accepted" | "failed",
  resultCode: number,
  resultDesc: string,
  error?: unknown,
) {
  if (!auditId) return;

  try {
    await db.execute(sql`
      update mpesa_callback_events
      set
        processing_status = ${status},
        result_code = ${resultCode},
        result_desc = ${resultDesc},
        error_message = ${error instanceof Error ? error.message : error ? String(error) : null},
        updated_at = now()
      where id = ${auditId}
    `);
  } catch (updateError) {
    console.error("[callback-audit] Failed to update callback event:", updateError);
  }
}

export async function getCallbackAuditSummary() {
  try {
    await ensureCallbackAuditTable();
    const rows = await db.execute(sql`
      select
        id,
        route,
        method,
        event_type as "eventType",
        case
          when trans_id is null then null
          when length(trans_id) <= 6 then trans_id
          else concat(left(trans_id, 4), '***', right(trans_id, 3))
        end as "transId",
        checkout_request_id as "checkoutRequestId",
        phone_masked as "phoneMasked",
        amount,
        shortcode,
        processing_status as "processingStatus",
        result_code as "resultCode",
        result_desc as "resultDesc",
        error_message as "errorMessage",
        created_at as "createdAt"
      from mpesa_callback_events
      order by created_at desc
      limit 20
    `);
    const counts = await db.execute(sql`
      select
        count(*)::int as total,
        count(*) filter (where created_at >= now() - interval '24 hours')::int as "last24h",
        max(created_at) as latest
      from mpesa_callback_events
    `);
    return {
      ok: true,
      counts: Array.isArray(counts) ? counts[0] : null,
      recent: rows,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      counts: null,
      recent: [],
      error: error instanceof Error ? error.message : "Callback audit unavailable",
    };
  }
}

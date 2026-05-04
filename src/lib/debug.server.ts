import { sql } from "drizzle-orm";
import { db } from "./db/client";

// ─── Table bootstrap ──────────────────────────────────────────────────────────

let tableEnsured = false;

async function ensureDebugTable() {
  if (tableEnsured) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS callback_debug_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      route TEXT NOT NULL,
      method TEXT NOT NULL,
      headers_json JSONB,
      raw_body TEXT,
      parsed_body_json JSONB,
      source_ip TEXT,
      user_agent TEXT,
      processing_stage TEXT NOT NULL DEFAULT 'received',
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_callback_debug_logs_created_at
    ON callback_debug_logs (created_at DESC)
  `);
  tableEnsured = true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const REDACT = new Set(["authorization", "cookie", "x-debug-token", "x-api-key"]);

function sanitizeHeaders(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of request.headers.entries()) {
    out[k] = REDACT.has(k.toLowerCase()) ? "[REDACTED]" : v;
  }
  return out;
}

function sourceIp(request: Request): string | null {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  );
}

function extractRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  const r = result as { rows?: unknown[] };
  return r?.rows ?? [];
}

// ─── Log a new incoming callback ─────────────────────────────────────────────

export async function logCallbackDebug(
  request: Request,
  route: string,
  rawBody: string,
  parsedBody: unknown,
  stage: string,
  errorMessage?: string,
): Promise<string | null> {
  try {
    await ensureDebugTable();

    const headers = sanitizeHeaders(request);
    const ip = sourceIp(request);

    const inserted = await db.execute(sql`
      INSERT INTO callback_debug_logs (
        route, method, headers_json, raw_body, parsed_body_json,
        source_ip, user_agent, processing_stage, error_message
      ) VALUES (
        ${route},
        ${request.method},
        ${JSON.stringify(headers)}::jsonb,
        ${rawBody.slice(0, 20000)},
        ${parsedBody != null ? JSON.stringify(parsedBody) : null}::jsonb,
        ${ip},
        ${request.headers.get("user-agent")},
        ${stage},
        ${errorMessage ?? null}
      )
      RETURNING id
    `);

    const rows = extractRows(inserted);
    const id = rows.length > 0 ? String((rows[0] as { id?: string })?.id ?? "") : "";
    return id || null;
  } catch (err) {
    console.error("[debug] Failed to write callback_debug_logs:", err);
    return null;
  }
}

// ─── Update an existing log after processing ─────────────────────────────────

export async function updateDebugLog(
  id: string | null,
  stage: string,
  errorMessage?: string,
) {
  if (!id) return;
  try {
    await db.execute(sql`
      UPDATE callback_debug_logs
      SET processing_stage = ${stage},
          error_message = ${errorMessage ?? null}
      WHERE id = ${id}::uuid
    `);
  } catch (err) {
    console.error("[debug] Failed to update callback_debug_logs:", err);
  }
}

// ─── Query ────────────────────────────────────────────────────────────────────

export async function getRecentDebugLogs(limit = 50) {
  try {
    await ensureDebugTable();
    const rows = await db.execute(sql`
      SELECT
        id,
        route,
        method,
        headers_json     AS "headersJson",
        LEFT(COALESCE(raw_body, ''), 1000) AS "rawBodyPreview",
        parsed_body_json AS "parsedBodyJson",
        source_ip        AS "sourceIp",
        user_agent       AS "userAgent",
        processing_stage AS "processingStage",
        error_message    AS "errorMessage",
        created_at       AS "createdAt"
      FROM callback_debug_logs
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    return extractRows(rows) as Record<string, unknown>[];
  } catch (err) {
    console.error("[debug] Failed to read callback_debug_logs:", err);
    return [];
  }
}

export async function getDebugLogStats() {
  try {
    await ensureDebugTable();
    const result = await db.execute(sql`
      SELECT
        COUNT(*)::int                                                             AS total,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour')::int    AS last_hour,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int  AS last_24h,
        MAX(created_at)                                                           AS latest
      FROM callback_debug_logs
    `);
    const rows = extractRows(result);
    return (rows[0] ?? null) as Record<string, unknown> | null;
  } catch {
    return null;
  }
}

// ─── Auth helper for debug endpoints ─────────────────────────────────────────

export function isDebugAuthorized(request: Request): boolean {
  const token = request.headers.get("x-debug-token");
  const expected =
    process.env.ADMIN_DEBUG_TOKEN ?? process.env.JWT_SECRET?.slice(0, 16) ?? "";
  return !!token && token === expected;
}

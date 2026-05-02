import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import server from "../dist/server/server.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CLIENT_DIR = join(__dirname, "../dist/client");
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const MIME = {
  ".js":    "application/javascript; charset=utf-8",
  ".css":   "text/css; charset=utf-8",
  ".html":  "text/html; charset=utf-8",
  ".json":  "application/json",
  ".png":   "image/png",
  ".jpg":   "image/jpeg",
  ".jpeg":  "image/jpeg",
  ".svg":   "image/svg+xml",
  ".ico":   "image/x-icon",
  ".woff":  "font/woff",
  ".woff2": "font/woff2",
  ".ttf":   "font/ttf",
  ".map":   "application/json",
};

async function tryServeStatic(pathname, res) {
  try {
    const filePath = join(CLIENT_DIR, pathname);
    await stat(filePath);
    const content = await readFile(filePath);
    const mime = MIME[extname(filePath)] ?? "application/octet-stream";
    res.statusCode = 200;
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

const app = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, "http://localhost");

    // Serve static assets directly from dist/client/
    if (pathname.startsWith("/assets/") || pathname === "/favicon.jpg" || pathname === "/favicon.ico") {
      const served = await tryServeStatic(pathname, res);
      if (served) return;
    }

    // All other requests go to TanStack Start SSR handler
    const protocol = req.headers["x-forwarded-proto"] ?? "http";
    const requestHost = req.headers.host ?? `${host}:${port}`;
    const url = `${protocol}://${requestHost}${req.url}`;

    let body;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = Buffer.concat(chunks);
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value != null) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }

    const response = await server.fetch(
      new Request(url, {
        method: req.method,
        headers,
        body: body?.length ? body : undefined,
      }),
    );

    res.statusCode = response.status;
    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
    }

    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error("[render-server]", error);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
});

app.listen(port, host, () => {
  console.log(`Payvora listening on http://${host}:${port}`);

  const required = [
    "DATABASE_URL", "JWT_SECRET", "MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET",
    "MPESA_PASSKEY", "MPESA_CALLBACK_URL", "MPESA_ENVIRONMENT",
    "SMS_PROVIDER", "ONFON_API_KEY", "ONFON_CLIENT_ID", "ONFON_SENDER_ID",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error("[env] MISSING env vars:", missing.join(", "));
  } else {
    console.log("[env] All required env vars present");
  }
});

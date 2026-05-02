import http from "node:http";
import server from "../dist/server/server.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const app = http.createServer(async (req, res) => {
  try {
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

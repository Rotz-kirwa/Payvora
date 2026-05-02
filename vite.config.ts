import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

function mpesaCallbackPlugin() {
  const registerRoute = (
    server: import("vite").ViteDevServer,
    path: string,
    handler: (body: unknown) => Promise<unknown>,
  ) => {
    server.middlewares.use(path, async (req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405);
        res.end("Method Not Allowed");
        return;
      }
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString());
        const result = await handler(body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error(`[${path}]`, err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ResultCode: 1, ResultDesc: "Failed to process callback" }));
      }
    });
  };

  return {
    name: "mpesa-callback",
    configureServer(server: import("vite").ViteDevServer) {
      registerRoute(server, "/callback", async (body) => {
        const { handleStkCallback } = await import("./src/lib/mpesa-callback.server");
        return handleStkCallback(body);
      });

      registerRoute(server, "/mpesa/callback", async (body) => {
        const { handleStkCallback } = await import("./src/lib/mpesa-callback.server");
        return handleStkCallback(body);
      });

      registerRoute(server, "/api/mpesa/callback", async (body) => {
        const { handleStkCallback } = await import("./src/lib/mpesa-callback.server");
        return handleStkCallback(body);
      });

      registerRoute(server, "/c2b/confirmation", async (body) => {
        const { handleC2bConfirmation } = await import("./src/lib/mpesa-callback.server");
        return handleC2bConfirmation(body);
      });

      registerRoute(server, "/c2b/validation", async (body) => {
        const { handleC2bValidation } = await import("./src/lib/mpesa-callback.server");
        return handleC2bValidation(body);
      });

      registerRoute(server, "/api/payments/c2b/confirmation", async (body) => {
        const { handleC2bConfirmation } = await import("./src/lib/mpesa-callback.server");
        return handleC2bConfirmation(body);
      });

      registerRoute(server, "/api/payments/c2b/validation", async (body) => {
        const { handleC2bValidation } = await import("./src/lib/mpesa-callback.server");
        return handleC2bValidation(body);
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [
    mpesaCallbackPlugin(),
    tanstackStart(),
    react(),
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
  ],
  resolve: {
    alias: {
      "@": `${process.cwd()}/src`,
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  optimizeDeps: {
    exclude: ["postgres", "drizzle-orm", "drizzle-orm/postgres-js"],
  },
  server: {
    host: "::",
    port: 8080,
    allowedHosts: true,
  },
}));

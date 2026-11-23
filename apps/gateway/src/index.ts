import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { wsusRoutes } from "./routes/wsus.js";

const app = new Hono();

const allowedOrigin = process.env.CORS_ALLOWED_ORIGIN ?? "http://localhost:3000";

app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: allowedOrigin.split(",").map((o) => o.trim()),
    allowMethods: ["GET", "HEAD", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-Api-Key",
      "x-wsus-base-url",
      "x-wsus-api-key",
    ],
  })
);

app.get("/health", (c) =>
  c.json({
    success: true,
    service: "@wsus-app/gateway",
    framework: "hono",
    timestampUtc: new Date().toISOString(),
  })
);

app.route("/api/wsus", wsusRoutes);

app.notFound((c) =>
  c.json(
    {
      success: false,
      error: { code: "NOT_FOUND", message: "Route not found" },
    },
    404
  )
);

const port = Number(process.env.PORT ?? 3001);

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`@wsus-app/gateway (Hono) listening on http://localhost:${info.port}`);
  }
);

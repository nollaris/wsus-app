import { Hono } from "hono";
import { buildForwardedQuery, proxyWsusGet } from "../lib/wsus-client.js";

export const wsusRoutes = new Hono();

wsusRoutes.get("/health", (c) => proxyWsusGet(c, "/health"));
wsusRoutes.get("/summary", (c) => proxyWsusGet(c, "/summary"));
wsusRoutes.get("/computers", (c) =>
  proxyWsusGet(c, `/computers${buildForwardedQuery(c)}`)
);
wsusRoutes.get("/computers/:id", (c) =>
  proxyWsusGet(c, `/computers/${encodeURIComponent(c.req.param("id"))}`)
);
wsusRoutes.get("/updates", (c) =>
  proxyWsusGet(c, `/updates${buildForwardedQuery(c)}`)
);
wsusRoutes.get("/updates/:id", (c) =>
  proxyWsusGet(
    c,
    `/updates/${encodeURIComponent(c.req.param("id"))}${buildForwardedQuery(c)}`
  )
);
wsusRoutes.get("/groups", (c) => proxyWsusGet(c, "/groups"));
wsusRoutes.get("/groups/:id", (c) =>
  proxyWsusGet(c, `/groups/${encodeURIComponent(c.req.param("id"))}`)
);
wsusRoutes.get("/sync", (c) =>
  proxyWsusGet(c, `/sync${buildForwardedQuery(c)}`)
);

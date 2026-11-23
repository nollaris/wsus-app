import { Hono } from "hono";
import {
  buildForwardedQuery,
  proxyWsusGet,
  resolveServerId,
} from "../lib/wsus-client.js";

export const wsusRoutes = new Hono();

wsusRoutes.get("/health", (c) => proxyWsusGet(c, "/health"));

wsusRoutes.get("/servers", (c) => proxyWsusGet(c, "/servers"));

wsusRoutes.get("/summary", (c) => {
  const serverId = c.req.query("serverId");
  const path = serverId
    ? `/servers/${encodeURIComponent(serverId)}/summary`
    : "/summary";
  return proxyWsusGet(c, path);
});

wsusRoutes.get("/computers", (c) => {
  const serverId = resolveServerId(c);
  const query = buildForwardedQuery(c);
  return proxyWsusGet(
    c,
    `/servers/${encodeURIComponent(serverId)}/computers${query}`
  );
});

wsusRoutes.get("/computers/:id", (c) => {
  const serverId = resolveServerId(c);
  const id = c.req.param("id");
  return proxyWsusGet(
    c,
    `/servers/${encodeURIComponent(serverId)}/computers/${encodeURIComponent(id)}`
  );
});

wsusRoutes.get("/updates", (c) => {
  const serverId = resolveServerId(c);
  const query = buildForwardedQuery(c);
  return proxyWsusGet(
    c,
    `/servers/${encodeURIComponent(serverId)}/updates${query}`
  );
});

wsusRoutes.get("/updates/:id", (c) => {
  const serverId = resolveServerId(c);
  const id = c.req.param("id");
  const query = buildForwardedQuery(c);
  return proxyWsusGet(
    c,
    `/servers/${encodeURIComponent(serverId)}/updates/${encodeURIComponent(id)}${query}`
  );
});

wsusRoutes.get("/groups", (c) => {
  const serverId = resolveServerId(c);
  return proxyWsusGet(c, `/servers/${encodeURIComponent(serverId)}/groups`);
});

wsusRoutes.get("/groups/:id", (c) => {
  const serverId = resolveServerId(c);
  const id = c.req.param("id");
  return proxyWsusGet(
    c,
    `/servers/${encodeURIComponent(serverId)}/groups/${encodeURIComponent(id)}`
  );
});

wsusRoutes.get("/sync", (c) => {
  const serverId = resolveServerId(c);
  const query = buildForwardedQuery(c);
  return proxyWsusGet(
    c,
    `/servers/${encodeURIComponent(serverId)}/sync${query}`
  );
});

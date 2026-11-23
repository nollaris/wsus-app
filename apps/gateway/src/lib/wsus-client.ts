import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const WSUS_API_BASE_URL = (
  process.env.WSUS_API_BASE_URL ?? "http://localhost:8530/wsus-api/api/v1"
).replace(/\/+$/, "");

const WSUS_API_KEY =
  process.env.WSUS_API_KEY ?? "wsus-readonly-api-key-change-me-2026";

const DEFAULT_SERVER_ID = process.env.WSUS_DEFAULT_SERVER_ID ?? "wsus-hq";

export function resolveServerId(c: Context): string {
  return c.req.query("serverId") || DEFAULT_SERVER_ID;
}

export function buildForwardedQuery(
  c: Context,
  excludeKeys: string[] = ["serverId"]
): string {
  const url = new URL(c.req.url);
  const params = new URLSearchParams();
  url.searchParams.forEach((value, key) => {
    if (!excludeKeys.includes(key)) {
      params.append(key, value);
    }
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function proxyWsusGet(c: Context, upstreamPath: string) {
  const targetUrl = `${WSUS_API_BASE_URL}${upstreamPath}`;

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "X-Api-Key": WSUS_API_KEY,
        Accept: "application/json",
      },
    });

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const status = (res.status >= 400 && res.status <= 599
        ? res.status
        : 502) as ContentfulStatusCode;
      return c.json(
        body ?? {
          success: false,
          error: {
            code: "UPSTREAM_WSUS_ERROR",
            message: `WSUS API returned HTTP ${res.status}`,
          },
        },
        status
      );
    }

    return c.json(body, 200);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach external WSUS API";
    return c.json(
      {
        success: false,
        error: {
          code: "WSUS_API_UNREACHABLE",
          message,
        },
      },
      502
    );
  }
}

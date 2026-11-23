import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const DEFAULT_BASE_URL = (
  process.env.WSUS_API_BASE_URL ?? "http://localhost:8530/wsus-api/api/v1"
).replace(/\/+$/, "");

const DEFAULT_API_KEY =
  process.env.WSUS_API_KEY ?? "wsus-readonly-api-key-change-me-2026";

export function buildForwardedQuery(c: Context): string {
  const url = new URL(c.req.url);
  const qs = url.searchParams.toString();
  return qs ? `?${qs}` : "";
}

export async function proxyWsusGet(c: Context, upstreamPath: string) {
  const customBaseUrl = c.req.header("x-wsus-base-url")?.trim();
  const customApiKey = c.req.header("x-wsus-api-key")?.trim();

  const baseUrl = (customBaseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const apiKey = customApiKey || DEFAULT_API_KEY;
  const targetUrl = `${baseUrl}${upstreamPath}`;

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "X-Api-Key": apiKey,
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

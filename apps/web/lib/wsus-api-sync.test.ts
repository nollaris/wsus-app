import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeRetryDelayMs,
  fetchComputerDetailsInBatches,
  fetchFromWsus,
  formatPartialSyncMessage,
  isRetryableWsusStatus,
  testWsusServerConnection,
  WsusApiError,
} from "./wsus-api-sync";

async function withMockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
  fn: () => Promise<void>
) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init);
  }) as typeof fetch;

  try {
    await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
  });
}

describe("isRetryableWsusStatus", () => {
  it("retries transient 403 WSUS_PERMISSION_DENIED, 429, and 5xx", () => {
    assert.equal(isRetryableWsusStatus(403, "WSUS_PERMISSION_DENIED"), true);
    assert.equal(isRetryableWsusStatus(429), true);
    assert.equal(isRetryableWsusStatus(500), true);
    assert.equal(isRetryableWsusStatus(502), true);
    assert.equal(isRetryableWsusStatus(503), true);
  });

  it("does not retry 401, 404, 400, 405, or non-transient 403", () => {
    assert.equal(isRetryableWsusStatus(401), false);
    assert.equal(isRetryableWsusStatus(404), false);
    assert.equal(isRetryableWsusStatus(400), false);
    assert.equal(isRetryableWsusStatus(405), false);
    assert.equal(isRetryableWsusStatus(403, "FORBIDDEN"), false);
  });
});

describe("computeRetryDelayMs", () => {
  it("respects Retry-After when larger than backoff", () => {
    const delay = computeRetryDelayMs(0, 3000);
    assert.ok(delay >= 3000);
  });
});

describe("formatPartialSyncMessage", () => {
  it("formats failed count and truncates beyond 3 computers", () => {
    const msg = formatPartialSyncMessage(
      [
        { computerId: "1", fullDomainName: "pc1.corp", error: "HTTP 500" },
        { computerId: "2", fullDomainName: "pc2.corp", error: "HTTP 500" },
        { computerId: "3", fullDomainName: "pc3.corp", error: "Timeout" },
        { computerId: "4", fullDomainName: "pc4.corp", error: "HTTP 502" },
      ],
      10
    );
    assert.match(msg, /^Partial sync: failed 4\/10 computers/);
    assert.match(msg, /\+1 more\)$/);
  });
});

describe("fetchFromWsus retry behavior", () => {
  it("retries 500 and 403 WSUS_PERMISSION_DENIED then succeeds", async () => {
    let attempts = 0;
    await withMockFetch(
      () => {
        attempts++;
        if (attempts === 1) {
          return jsonResponse(403, {
            success: false,
            error: { code: "WSUS_PERMISSION_DENIED", message: "Transient" },
          });
        }
        if (attempts === 2) {
          return jsonResponse(500, {
            success: false,
            error: { code: "INTERNAL_SERVER_ERROR", message: "Boom" },
          });
        }
        return jsonResponse(200, { success: true, data: { ok: true } });
      },
      async () => {
        const result = await fetchFromWsus<{ ok: boolean }>(
          { baseUrl: "http://wsus.test/api/v1", apiKey: "test-key" },
          "/summary",
          5000,
          undefined,
          { maxRetries: 3, maxConcurrency: 2 }
        );
        assert.equal(result.data.ok, true);
        assert.equal(attempts, 3);
      }
    );
  });

  it("does not retry 401 Unauthorized", async () => {
    let attempts = 0;
    await withMockFetch(
      () => {
        attempts++;
        return jsonResponse(401, {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Bad key" },
        });
      },
      async () => {
        await assert.rejects(
          () =>
            fetchFromWsus(
              { baseUrl: "http://wsus.test/api/v1", apiKey: "wrong" },
              "/summary",
              5000,
              undefined,
              { maxRetries: 3, maxConcurrency: 2 }
            ),
          (err: unknown) => err instanceof WsusApiError && err.status === 401
        );
        assert.equal(attempts, 1);
      }
    );
  });
});

describe("testWsusServerConnection", () => {
  it("reports 401 clearly even when /health is 200", async () => {
    await withMockFetch(
      (url) => {
        if (url.endsWith("/health")) {
          return jsonResponse(200, {
            success: true,
            data: { status: "Healthy", snapshotReady: true, warming: false },
          });
        }
        return jsonResponse(401, {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Invalid key" },
        });
      },
      async () => {
        await assert.rejects(
          () =>
            testWsusServerConnection({
              baseUrl: "http://wsus.test/api/v1",
              apiKey: "bad-key",
            }),
          /HTTP 401/
        );
      }
    );
  });
});

describe("fetchComputerDetailsInBatches", () => {
  it("records failed computers instead of silently dropping them", async () => {
    await withMockFetch(
      (url) => {
        if (url.includes("/computers/c2")) {
          return jsonResponse(500, {
            success: false,
            error: { code: "INTERNAL_SERVER_ERROR", message: "C2 failed" },
          });
        }
        const id = url.includes("/computers/c1") ? "c1" : "c3";
        return jsonResponse(200, {
          success: true,
          data: {
            computer: {
              computerId: id,
              fullDomainName: `${id}.corp.local`,
              ipAddress: "10.0.0.1",
              osDescription: "Windows",
              clientVersion: "10.0",
              computerRole: "Workstation",
            },
            neededUpdates: [],
            failedUpdates: [],
            pendingRebootUpdates: [],
            installedUpdates: [],
          },
        });
      },
      async () => {
        const result = await fetchComputerDetailsInBatches(
          { baseUrl: "http://wsus.test/api/v1", apiKey: "k" },
          [
            {
              computerId: "c1",
              fullDomainName: "c1.corp.local",
              ipAddress: "10.0.0.1",
              osDescription: "Windows",
              clientVersion: "10.0",
              computerRole: "Workstation",
            },
            {
              computerId: "c2",
              fullDomainName: "c2.corp.local",
              ipAddress: "10.0.0.2",
              osDescription: "Windows",
              clientVersion: "10.0",
              computerRole: "Workstation",
            },
            {
              computerId: "c3",
              fullDomainName: "c3.corp.local",
              ipAddress: "10.0.0.3",
              osDescription: "Windows",
              clientVersion: "10.0",
              computerRole: "Workstation",
            },
          ],
          {
            maxComputers: null,
            concurrency: 2,
            timeoutMs: 5000,
            includeInstalled: false,
          }
        );

        assert.equal(result.totalCount, 3);
        assert.equal(result.details.length, 2);
        assert.equal(result.failedComputers.length, 1);
        assert.equal(result.failedComputers[0]?.computerId, "c2");
      }
    );
  });
});

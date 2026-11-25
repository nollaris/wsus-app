export interface WsusApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: { code?: string; message?: string };
}

export interface WsusServerApiConnection {
  baseUrl: string;
  apiKey: string;
}

export interface WsusGroup {
  groupId: string;
  name: string;
}

export interface WsusComputer {
  computerId: string;
  fullDomainName: string;
}

export interface WsusUpdate {
  updateId: string;
  revisionNumber: number;
  title: string;
  kbArticle?: string | null;
  classification?: string;
  msrcSeverity?: string;
}

export interface WsusGroupDetail {
  group: WsusGroup;
}

export interface WsusUpdateDetail {
  update: WsusUpdate;
}

export async function callWsusApi<T>(
  server: WsusServerApiConnection,
  path: string,
  options: { method?: "GET" | "POST"; body?: object } = {}
): Promise<T> {
  const response = await fetch(
    `${server.baseUrl.trim().replace(/\/+$/, "")}${path}`,
    {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        "X-Api-Key": server.apiKey,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    }
  );

  const text = await response.text();
  let envelope: WsusApiEnvelope<T> | null = null;
  if (text) {
    try {
      envelope = JSON.parse(text) as WsusApiEnvelope<T>;
    } catch {
      throw new Error(`WSUS API returned an invalid response (HTTP ${response.status}).`);
    }
  }
  if (!response.ok || !envelope?.success) {
    throw new Error(
      envelope?.error?.message ??
        `WSUS API returned HTTP ${response.status}.`
    );
  }
  return envelope.data;
}

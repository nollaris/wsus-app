"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 15_000;
const MIN_CHECK_GAP_MS = 3_000;

export const WSUS_DATA_UPDATED_EVENT = "wsus:data-updated";

export function LazyDataRefresh() {
  const router = useRouter();
  const versionRef = React.useRef<string | null>(null);
  const lastCheckAtRef = React.useRef<number>(0);
  const inFlightRef = React.useRef<boolean>(false);

  const checkForNewData = React.useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }

    const now = Date.now();
    if (inFlightRef.current || now - lastCheckAtRef.current < MIN_CHECK_GAP_MS) {
      return;
    }

    inFlightRef.current = true;
    lastCheckAtRef.current = now;

    try {
      const res = await fetch("/api/data-version", { cache: "no-store" });
      if (!res.ok) return;

      const data = (await res.json()) as { version?: string };
      if (!data.version) return;

      if (versionRef.current === null) {
        versionRef.current = data.version;
        return;
      }

      if (data.version !== versionRef.current) {
        versionRef.current = data.version;
        router.refresh();
        window.dispatchEvent(
          new CustomEvent(WSUS_DATA_UPDATED_EVENT, {
            detail: { version: data.version },
          })
        );
      }
    } catch {
      // Ignore transient network errors during background checks
    } finally {
      inFlightRef.current = false;
    }
  }, [router]);

  React.useEffect(() => {
    void checkForNewData();

    const intervalId = window.setInterval(() => {
      void checkForNewData();
    }, POLL_INTERVAL_MS);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        void checkForNewData();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    window.addEventListener("focus", handleVisibilityOrFocus);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.removeEventListener("focus", handleVisibilityOrFocus);
    };
  }, [checkForNewData]);

  return null;
}

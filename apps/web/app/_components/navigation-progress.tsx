"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Global top navigation progress bar that activates on internal link clicks
 * and completes once the destination route finishes rendering.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  const trickleTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNavigating = useRef(false);

  const clearTimers = () => {
    if (trickleTimer.current) {
      clearInterval(trickleTimer.current);
      trickleTimer.current = null;
    }
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (safetyTimer.current) {
      clearTimeout(safetyTimer.current);
      safetyTimer.current = null;
    }
  };

  const startProgress = () => {
    clearTimers();
    isNavigating.current = true;
    setVisible(true);
    setProgress(18);

    trickleTimer.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 88) return prev;
        const step = prev < 50 ? 10 : prev < 75 ? 5 : 2;
        return Math.min(88, prev + step);
      });
    }, 180);

    // Safety fallback in case a navigation is cancelled or aborted
    safetyTimer.current = setTimeout(() => {
      completeProgress();
    }, 10000);
  };

  const completeProgress = () => {
    if (!isNavigating.current) return;
    isNavigating.current = false;
    clearTimers();
    setProgress(100);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 220);
  };

  // Complete when pathname or search params update
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const prevRouteKey = useRef(routeKey);

  useEffect(() => {
    if (prevRouteKey.current !== routeKey) {
      prevRouteKey.current = routeKey;
      completeProgress();
    }
  });

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      ) {
        return;
      }

      try {
        const nextUrl = new URL(anchor.href, window.location.href);
        if (nextUrl.origin !== window.location.origin) return;
        const nextKey = `${nextUrl.pathname}${nextUrl.search}`;
        const currentKey = `${window.location.pathname}${window.location.search}`;
        if (nextKey !== currentKey) {
          startProgress();
        }
      } catch {
        // Ignore malformed URLs
      }
    };

    const handlePopState = () => {
      startProgress();
    };

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handlePopState);
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  return (
    <div
      role="progressbar"
      aria-label="Page loading"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 bg-primary/15"
    >
      <div
        className="h-full bg-primary transition-[width,opacity] duration-200 ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress === 100 ? 0.6 : 1,
        }}
      />
    </div>
  );
}

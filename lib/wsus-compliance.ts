export interface ComplianceTier {
  label: string;
  color: string;
  badgeClass: string;
  textClass: string;
}

/**
 * Returns the WSUS compliance tier and styling for a percentage score:
 * >95% Compliant (green), 80-95% Needs Attention (amber), <80% Non-Compliant (red).
 */
export function getComplianceTier(score: number): ComplianceTier {
  if (score > 95) {
    return {
      label: "Compliant",
      color: "hsl(142, 71%, 45%)",
      badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
      textClass: "text-emerald-600 dark:text-emerald-400",
    };
  }
  if (score >= 80) {
    return {
      label: "Needs Attention",
      color: "hsl(38, 92%, 50%)",
      badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
      textClass: "text-amber-600 dark:text-amber-400",
    };
  }
  return {
    label: "Non-Compliant",
    color: "hsl(0, 84%, 60%)",
    badgeClass: "bg-destructive/15 text-destructive",
    textClass: "text-destructive",
  };
}

/**
 * Computes per-device WSUS compliance score: (Installed / Applicable) * 100.
 */
export function computeDeviceCompliance(counts: {
  installed: number;
  pending: number;
  failed: number;
  unknown: number;
}) {
  const applicable =
    counts.installed + counts.pending + counts.failed + counts.unknown;
  const score = applicable > 0 ? (counts.installed / applicable) * 100 : 100;
  const isFullyCompliant =
    counts.pending === 0 && counts.failed === 0 && counts.unknown === 0;

  return { applicable, score, isFullyCompliant };
}

/**
 * Splits a comma- or semicolon-delimited WSUS target groups string into
 * unique, trimmed group names, excluding the default "All Computers" group.
 */
export function splitTargetGroups(value: string | null | undefined): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  for (const part of value.split(/[,;]+/)) {
    const trimmed = part.trim();
    if (trimmed && trimmed.toLowerCase() !== "all computers") {
      seen.add(trimmed);
    }
  }
  return Array.from(seen);
}

export interface OsPatchHint {
  updateTitle: string;
  classification?: string;
  installationState?: string;
}

const WIN_CLIENT_BUILD_MAP: Record<number, string> = {
  26200: "Windows 11 version 25H2",
  26100: "Windows 11 version 24H2",
  22631: "Windows 11 version 23H2",
  22621: "Windows 11 version 22H2",
  22000: "Windows 11 version 21H2",
  19045: "Windows 10 version 22H2",
  19044: "Windows 10 version 21H2",
  19043: "Windows 10 version 21H1",
  19042: "Windows 10 version 20H2",
  19041: "Windows 10 version 2004",
  18363: "Windows 10 version 1909",
  18362: "Windows 10 version 1903",
  17763: "Windows 10 version 1809",
  17134: "Windows 10 version 1803",
  16299: "Windows 10 version 1709",
  15063: "Windows 10 version 1703",
  14393: "Windows 10 version 1607",
  10586: "Windows 10 version 1511",
  10240: "Windows 10 version 1507",
};

const WIN_SERVER_BUILD_MAP: Record<number, string> = {
  26100: "Windows Server 2025 (24H2)",
  20348: "Windows Server 2022 (21H2)",
  17763: "Windows Server 2019 (1809)",
  14393: "Windows Server 2016 (1607)",
};

function parseOsFromPatchTitle(title: string): string | null {
  const clientMatch = title.match(
    /\b(Windows\s+(?:10|11))\s*,?\s*version\s+([A-Za-z0-9]+)/i
  );
  if (clientMatch) {
    const osName = clientMatch[1].replace(/\s+/g, " ");
    const ver = clientMatch[2].toUpperCase();
    return `${osName} version ${ver}`;
  }

  const msServerMatch = title.match(
    /\bMicrosoft\s+server\s+operating\s+system\s*,?\s*version\s+([A-Za-z0-9]+)/i
  );
  if (msServerMatch) {
    const ver = msServerMatch[1].toUpperCase();
    if (ver === "24H2") return "Windows Server 2025 (24H2)";
    if (ver === "21H2") return "Windows Server 2022 (21H2)";
    return `Windows Server version ${ver}`;
  }

  const serverMatch = title.match(
    /\b(Windows\s+Server\s+\d{4})(?:\s*\((\d{4}|[0-9]{2}H[12])\))?/i
  );
  if (serverMatch) {
    const base = serverMatch[1].replace(/\s+/g, " ");
    return serverMatch[2] ? `${base} (${serverMatch[2].toUpperCase()})` : base;
  }

  return null;
}

function parseOsFromBuild(
  osVersion: string | null | undefined,
  isServer: boolean
): string | null {
  if (!osVersion) return null;
  const parts = osVersion.trim().split(".");
  if (parts.length < 3) return null;
  const build = Number.parseInt(parts[2], 10);
  if (Number.isNaN(build)) return null;

  if (isServer) {
    return WIN_SERVER_BUILD_MAP[build] ?? null;
  }
  if (WIN_CLIENT_BUILD_MAP[build]) {
    return WIN_CLIENT_BUILD_MAP[build];
  }
  if (build >= 22000) {
    return "Windows 11";
  }
  return null;
}

function getOsVersionRank(label: string): number {
  const winMatch = label.match(/Windows\s+(10|11)\s+version\s+(\d{2})(H[12]|\d{2})/i);
  if (winMatch) {
    const major = Number.parseInt(winMatch[1], 10);
    const yy = Number.parseInt(winMatch[2], 10);
    const sub = winMatch[3].toUpperCase();
    const subNum = sub === "H2" ? 2 : sub === "H1" ? 1 : Number.parseInt(sub, 10) || 0;
    return major * 10000 + yy * 100 + subNum;
  }
  if (/Windows\s+11/i.test(label)) return 110000;
  if (/Windows\s+10/i.test(label)) return 100000;
  return 0;
}

/**
 * Resolves the real Windows OS version (e.g. "Windows 11 version 22H2") from
 * the Windows build number in osVersion and the client's latest security/cumulative
 * patch update, falling back to osDescription.
 */
export function resolveClientOsVersion({
  osDescription,
  osVersion,
  patches = [],
}: {
  osDescription: string;
  osVersion?: string | null;
  patches?: OsPatchHint[];
}): string {
  const isServer = /\bserver\b/i.test(osDescription);
  const buildOs = parseOsFromBuild(osVersion, isServer);

  const candidates = patches
    .map((p) => {
      const parsed = parseOsFromPatchTitle(p.updateTitle);
      if (!parsed) return null;
      // Avoid misclassifying a Server OS from a non-server patch or vice versa
      if (isServer && !/server/i.test(parsed)) return null;
      if (!isServer && /server/i.test(parsed)) return null;

      const dateMatch = p.updateTitle.match(/\b(\d{4}-\d{2})\b/);
      const dateKey = dateMatch ? dateMatch[1] : "0000-00";
      const isInstalled = p.installationState === "Installed" ? 1 : 0;
      const isSecurityOrCumulative =
        p.classification === "Security Updates" ||
        p.classification === "Critical Updates" ||
        /\b(Cumulative|Security)\s+Update\b/i.test(p.updateTitle)
          ? 1
          : 0;

      return {
        parsed,
        dateKey,
        isInstalled,
        isSecurityOrCumulative,
        rank: getOsVersionRank(parsed),
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      if (a.isInstalled !== b.isInstalled) return b.isInstalled - a.isInstalled;
      if (a.dateKey !== b.dateKey) return b.dateKey.localeCompare(a.dateKey);
      if (a.rank !== b.rank) return b.rank - a.rank;
      if (a.isSecurityOrCumulative !== b.isSecurityOrCumulative) {
        return b.isSecurityOrCumulative - a.isSecurityOrCumulative;
      }
      return 0;
    });

    const bestPatch = candidates[0];
    // If osVersion reports a specific, newer Windows build (e.g. after an in-place
    // upgrade where older patches are still marked Installed), prefer buildOs.
    if (buildOs && getOsVersionRank(buildOs) > bestPatch.rank) {
      return buildOs;
    }
    return bestPatch.parsed;
  }

  return buildOs ?? osDescription;
}

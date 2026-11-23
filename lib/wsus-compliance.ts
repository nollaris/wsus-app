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

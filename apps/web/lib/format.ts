/**
 * Formats a WSUS KB article identifier with a single `KB` prefix.
 * Returns `"-"` when the value is null, undefined, or blank.
 */
export function formatKbArticle(kbArticle: string | null | undefined): string {
  const trimmed = kbArticle?.trim();
  if (!trimmed) return "-";
  return /^kb/i.test(trimmed) ? trimmed.toUpperCase() : `KB${trimmed}`;
}

const BANGKOK_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "Asia/Bangkok",
});

/**
 * Formats a Date or ISO timestamp in Asia/Bangkok (UTC+7) as `YYYY-MM-DD HH:mm:ss`.
 */
export function formatBangkokTimestamp(
  value: Date | string | null | undefined,
  fallback = "-"
): string {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  const parts = BANGKOK_FORMATTER.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  const hour = map.hour === "24" ? "00" : map.hour;
  return `${map.year}-${map.month}-${map.day} ${hour}:${map.minute}:${map.second}`;
}

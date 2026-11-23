/**
 * Formats a WSUS KB article identifier with a single `KB` prefix.
 * Returns `"-"` when the value is null, undefined, or blank.
 */
export function formatKbArticle(kbArticle: string | null | undefined): string {
  const trimmed = kbArticle?.trim();
  if (!trimmed) return "-";
  return /^kb/i.test(trimmed) ? trimmed.toUpperCase() : `KB${trimmed}`;
}

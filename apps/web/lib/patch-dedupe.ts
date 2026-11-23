export interface PatchInventoryCandidate {
  updateId: string;
  revisionNumber: number;
  title: string;
  isLatestRevision: boolean;
  isApproved: boolean;
  arrivalDate: Date | null;
}

function isBetterPatchCandidate<T extends PatchInventoryCandidate>(
  candidate: T,
  current: T
): boolean {
  if (candidate.isLatestRevision !== current.isLatestRevision) {
    return candidate.isLatestRevision;
  }
  if (candidate.isApproved !== current.isApproved) {
    return candidate.isApproved;
  }
  if (candidate.revisionNumber !== current.revisionNumber) {
    return candidate.revisionNumber > current.revisionNumber;
  }
  const candTime = candidate.arrivalDate?.getTime() ?? 0;
  const currTime = current.arrivalDate?.getTime() ?? 0;
  return candTime > currTime;
}

/**
 * Deduplicates WSUS patch inventory rows by `updateId` and normalized `title`
 * (case-insensitive), keeping the latest/approved revision.
 */
export function dedupePatchInventory<T extends PatchInventoryCandidate>(
  items: T[]
): T[] {
  const byUpdateId = new Map<string, T>();
  for (const item of items) {
    const idKey = item.updateId.trim().toLowerCase();
    const existing = byUpdateId.get(idKey);
    if (!existing || isBetterPatchCandidate(item, existing)) {
      byUpdateId.set(idKey, item);
    }
  }

  const byTitle = new Map<string, T>();
  for (const item of byUpdateId.values()) {
    const titleKey = item.title.trim().toLowerCase();
    const key = titleKey || `id:${item.updateId.trim().toLowerCase()}`;
    const existing = byTitle.get(key);
    if (!existing || isBetterPatchCandidate(item, existing)) {
      byTitle.set(key, item);
    }
  }

  return Array.from(byTitle.values());
}

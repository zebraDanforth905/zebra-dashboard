const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type NormalizedSessionSelection = {
  ids: string[];
  startDates?: Record<string, string>;
};

export function normalizeSessionSelection(
  ids: string[],
  startDates: Record<string, string> | undefined,
  canonicalById: Map<string, string>,
): NormalizedSessionSelection {
  const normalizedIds: string[] = [];
  const seen = new Set<string>();
  const normalizedDates: Record<string, string> = {};

  for (const id of ids) {
    const canonicalId = canonicalById.get(id) ?? id;
    if (!seen.has(canonicalId)) {
      seen.add(canonicalId);
      normalizedIds.push(canonicalId);
    }

    const rawDate = startDates?.[id];
    if (typeof rawDate === 'string' && ISO_DATE_RE.test(rawDate)) {
      if (id === canonicalId || !normalizedDates[canonicalId]) {
        normalizedDates[canonicalId] = rawDate;
      }
    }
  }

  return {
    ids: normalizedIds,
    startDates: Object.keys(normalizedDates).length > 0 ? normalizedDates : undefined,
  };
}

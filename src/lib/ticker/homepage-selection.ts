interface WithId {
  id: string;
}

type PreferredPredicate<T> = (item: T) => boolean;

function firstUnusedHeadline<T extends WithId>(
  items: T[],
  usedIds: Set<string>,
): T | null {
  for (const item of items) {
    if (usedIds.has(item.id)) continue;
    return item;
  }
  return null;
}

export function pickStaticHeadlinesForSources<T extends WithId>(
  sourceNames: string[],
  headlinesBySource: Map<string, T[]>,
  targetCount: number = sourceNames.length,
): T[] {
  const selected: T[] = [];
  const usedIds = new Set<string>();

  for (const sourceName of sourceNames) {
    const candidate = firstUnusedHeadline(
      headlinesBySource.get(sourceName) ?? [],
      usedIds,
    );
    if (!candidate) continue;
    selected.push(candidate);
    usedIds.add(candidate.id);
  }

  let madeProgress = true;
  while (selected.length < targetCount && madeProgress) {
    madeProgress = false;

    for (const sourceName of sourceNames) {
      const candidate = firstUnusedHeadline(
        headlinesBySource.get(sourceName) ?? [],
        usedIds,
      );
      if (!candidate) continue;

      selected.push(candidate);
      usedIds.add(candidate.id);
      madeProgress = true;

      if (selected.length >= targetCount) break;
    }
  }

  return selected;
}

export function pickRotatingHeadlinesForSources<T extends WithId>(
  sourceNames: string[],
  headlinesBySource: Map<string, T[]>,
  sourceCounters: Map<string, number>,
  targetCount: number = sourceNames.length,
  isPreferred?: PreferredPredicate<T>,
): T[] {
  const selected: T[] = [];
  const usedIds = new Set<string>();

  const pickFromSource = (sourceName: string): T | null => {
    const items = headlinesBySource.get(sourceName) ?? [];
    if (items.length === 0) return null;

    const preferredItems = isPreferred
      ? items.filter((item) => isPreferred(item))
      : items;
    const pools = preferredItems.length > 0 ? [preferredItems, items] : [items];

    for (const pool of pools) {
      const startIndex = sourceCounters.get(sourceName) ?? 0;

      for (let offset = 0; offset < pool.length; offset += 1) {
        const pointer = startIndex + offset;
        const candidate = pool[pointer % pool.length];
        if (usedIds.has(candidate.id)) continue;

        sourceCounters.set(sourceName, pointer + 1);
        return candidate;
      }
    }

    return null;
  };

  for (const sourceName of sourceNames) {
    const candidate = pickFromSource(sourceName);
    if (!candidate) continue;

    selected.push(candidate);
    usedIds.add(candidate.id);
  }

  let madeProgress = true;
  while (selected.length < targetCount && madeProgress) {
    madeProgress = false;

    for (const sourceName of sourceNames) {
      const candidate = pickFromSource(sourceName);
      if (!candidate) continue;

      selected.push(candidate);
      usedIds.add(candidate.id);
      madeProgress = true;

      if (selected.length >= targetCount) break;
    }
  }

  return selected;
}

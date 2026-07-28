import type { TextItem } from './extract';

export function splitColumns(items: TextItem[]): {
  receiving: TextItem[];
  sending: TextItem[];
  splitX: number;
} {
  const seed = (items[0]?.pageWidth ?? 0) / 2;
  const xs = [...new Set(items.map((i) => i.x))].sort((a, b) => a - b);

  // Start at the page midpoint, then snap to the nearest gap between x values
  // so the boundary never lands inside a column.
  let splitX = seed;
  let best = Number.POSITIVE_INFINITY;

  for (let i = 0; i < xs.length - 1; i++) {
    const lo = xs[i];
    const hi = xs[i + 1];
    const distance =
      seed >= lo && seed <= hi ? 0 : Math.min(Math.abs(seed - lo), Math.abs(seed - hi));

    if (distance < best) {
      best = distance;
      splitX = (lo + hi) / 2;
    }
  }

  return {
    receiving: items.filter((i) => i.x < splitX),
    sending: items.filter((i) => i.x >= splitX),
    splitX,
  };
}

import type { TextItem } from './extract';

export type Line = { y: number; page: number; text: string; parts: TextItem[] };

export function assembleLines(items: TextItem[], tolerance = 20): Line[] {
  const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y);
  const lines: Line[] = [];

  for (const item of sorted) {
    const open = lines[lines.length - 1];
    if (open && open.page === item.page && Math.abs(open.y - item.y) <= tolerance) {
      open.parts.push(item);
    } else {
      lines.push({ y: item.y, page: item.page, text: '', parts: [item] });
    }
  }

  for (const line of lines) {
    line.text = [...line.parts]
      .sort((a, b) => a.x - b.x)
      .map((p) => p.text)
      .join(' ');
  }
  return lines;
}

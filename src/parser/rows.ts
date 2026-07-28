import type { Line } from './lines';

export type RawRow = { receiving: Line[]; sending: Line[] };

// A sending line often sits above its receiving anchor because a multi-course
// sending group starts higher up the page than the requirement it satisfies.
// On the real agreement, receiving I&C SCI 51 anchors at y=5338 while its
// sending courses CS 066 and CS 066L sit at y=5350 and y=5434, both above it.
// SLACK absorbs that offset without pulling in the next row's sending block.
const SLACK = 24;

export function bandRows(receiving: Line[], sending: Line[]): RawRow[] {
  const anchors = [...receiving].sort((a, b) => a.page - b.page || b.y - a.y);

  return anchors.map((anchor, index) => {
    const next = anchors[index + 1];
    const inBand = sending.filter((line) => {
      if (line.page !== anchor.page) return false;
      if (line.y > anchor.y + SLACK) return false;
      if (next && next.page === anchor.page && line.y <= next.y + SLACK) return false;
      return true;
    });
    return { receiving: [anchor], sending: inBand.sort((a, b) => b.y - a.y) };
  });
}

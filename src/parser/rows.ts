import type { Line } from './lines';

export type RawRow = { receiving: Line[]; sending: Line[] };

// Measured over the real 5 page agreement: of 74 sending lines, 57 sit below
// their receiving anchor, 11 sit level with it, and 6 sit slightly above. The
// slack covers that last minority so those rows are not lost.
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

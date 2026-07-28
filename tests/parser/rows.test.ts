import { describe, it, expect } from 'vitest';
import type { TextItem } from '../../src/parser/extract';
import { splitColumns } from '../../src/parser/columns';
import { assembleLines } from '../../src/parser/lines';
import { bandRows } from '../../src/parser/rows';
import { twoRowPage } from '../fixtures/synthetic';

// Two pages, two rows each. Page 2 deliberately reuses the same y values as
// page 1, because that is what real PDF pages do: each page's coordinate
// system resets, so row 1 on page 2 tends to sit at nearly the same y as row
// 1 on page 1. If page were ever dropped from the banding comparison, a
// page 2 sending line would get claimed by a page 1 anchor (or vice versa).
const W = 1000;
const at = (text: string, x: number, y: number, page: number): TextItem => ({
  text,
  x,
  y,
  page,
  pageWidth: W,
});

const twoPageAgreement: TextItem[] = [
  // Page 1
  at('RECV A10', 50, 700, 1),
  at('Intro to Fooing', 150, 700, 1),
  at('4.00', 460, 700, 1),
  at('SEND A1', 550, 706, 1),
  at('Foo Basics', 650, 706, 1),
  at('3.00', 950, 706, 1),
  at('RECV A20', 50, 500, 1),
  at('Intro to Barring', 150, 500, 1),
  at('4.00', 460, 500, 1),
  at('SEND A2', 550, 480, 1),
  at('Bar Basics', 650, 480, 1),
  at('3.00', 950, 480, 1),
  // Page 2, same y values as page 1 on purpose
  at('RECV B10', 50, 700, 2),
  at('Intro to Bazzing', 150, 700, 2),
  at('4.00', 460, 700, 2),
  at('SEND B1', 550, 706, 2),
  at('Baz Basics', 650, 706, 2),
  at('3.00', 950, 706, 2),
  at('RECV B20', 50, 500, 2),
  at('Intro to Quxxing', 150, 500, 2),
  at('4.00', 460, 500, 2),
  at('SEND B2', 550, 480, 2),
  at('Qux Basics', 650, 480, 2),
  at('3.00', 950, 480, 2),
];

describe('bandRows', () => {
  it('pairs each receiving anchor with the sending block beside it', () => {
    const { receiving, sending } = splitColumns(twoRowPage);
    const rows = bandRows(assembleLines(receiving, 4), assembleLines(sending, 4));

    expect(rows).toHaveLength(2);
    expect(rows[0].receiving[0].text).toContain('RECV 10');
    expect(rows[0].sending.map((l) => l.text)).toEqual([
      'SEND 1 Widget Fundamentals 3.00',
      'AND',
      'SEND 1L Widget Fundamentals Lab 1.00',
    ]);
    expect(rows[1].receiving[0].text).toContain('RECV 20');
    expect(rows[1].sending.map((l) => l.text)).toEqual(['No Course Articulated']);
  });

  it('does not leak a sending line into the row below', () => {
    const { receiving, sending } = splitColumns(twoRowPage);
    const rows = bandRows(assembleLines(receiving, 4), assembleLines(sending, 4));
    expect(rows[1].sending.some((l) => l.text.includes('SEND 1L'))).toBe(false);
  });

  it('never crosses a page boundary, and drops nothing across pages', () => {
    const { receiving, sending } = splitColumns(twoPageAgreement);
    const receivingLines = assembleLines(receiving, 4);
    const sendingLines = assembleLines(sending, 4);
    const rows = bandRows(receivingLines, sendingLines);

    expect(rows).toHaveLength(4);

    // 1. No row's sending lines come from a different page than its anchor.
    for (const row of rows) {
      const anchorPage = row.receiving[0].page;
      for (const line of row.sending) {
        expect(line.page).toBe(anchorPage);
      }
    }

    // Spot check the trap directly: page 2's first sending line shares a y
    // with page 1's first anchor, and must not be pulled into that row.
    const rowA10 = rows.find((r) => r.receiving[0].text.includes('RECV A10'))!;
    expect(rowA10.sending.some((l) => l.text.includes('SEND B1'))).toBe(false);
    const rowB10 = rows.find((r) => r.receiving[0].text.includes('RECV B10'))!;
    expect(rowB10.sending.some((l) => l.text.includes('SEND A1'))).toBe(false);

    // 2. Every sending line in the fixture is claimed by exactly one anchor.
    const claimedCounts = new Map<string, number>();
    for (const row of rows) {
      for (const line of row.sending) {
        claimedCounts.set(line.text, (claimedCounts.get(line.text) ?? 0) + 1);
      }
    }
    for (const line of sendingLines) {
      expect(claimedCounts.get(line.text)).toBe(1);
    }
    const totalClaimed = rows.reduce((sum, r) => sum + r.sending.length, 0);
    expect(totalClaimed).toBe(sendingLines.length);
  });
});

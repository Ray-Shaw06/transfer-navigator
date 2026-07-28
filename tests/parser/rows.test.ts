import { describe, it, expect } from 'vitest';
import { splitColumns } from '../../src/parser/columns';
import { assembleLines } from '../../src/parser/lines';
import { bandRows } from '../../src/parser/rows';
import { twoRowPage } from '../fixtures/synthetic';

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
});

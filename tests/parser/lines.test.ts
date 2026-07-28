import { describe, it, expect } from 'vitest';
import { assembleLines } from '../../src/parser/lines';
import type { TextItem } from '../../src/parser/extract';

// pageWidth is required by TextItem. assembleLines never reads it, but the
// literals must carry it or the project stops typechecking.
const item = (text: string, x: number, y: number): TextItem => ({
  text,
  x,
  y,
  page: 1,
  pageWidth: 1000,
});

const wrapped: TextItem[] = [
  item('SEND 66', 550, 500),
  item('Computer Architecture and Assembly', 650, 500),
  item('Language Programming', 650, 488),
  item('3.00', 950, 500),
  item('SEND 70', 550, 400),
];

describe('assembleLines', () => {
  it('joins items sharing a y into one line, left to right', () => {
    const lines = assembleLines(wrapped, 4);
    expect(lines[0].text).toBe('SEND 66 Computer Architecture and Assembly 3.00');
  });

  it('merges a wrapped title into the line above when tolerance allows', () => {
    const lines = assembleLines(wrapped, 20);
    expect(lines[0].text).toBe(
      'SEND 66 Computer Architecture and Assembly Language Programming 3.00',
    );
    expect(lines).toHaveLength(2);
  });

  it('orders lines top to bottom', () => {
    const lines = assembleLines(wrapped, 4);
    expect(lines[lines.length - 1].text).toBe('SEND 70');
  });
});

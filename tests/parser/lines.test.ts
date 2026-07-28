import { describe, it, expect } from 'vitest';
import { assembleLines } from '../../src/parser/lines';
import type { TextItem } from '../../src/parser/extract';

const wrapped: TextItem[] = [
  { text: 'SEND 66', x: 550, y: 500, page: 1 },
  { text: 'Computer Architecture and Assembly', x: 650, y: 500, page: 1 },
  { text: 'Language Programming', x: 650, y: 488, page: 1 },
  { text: '3.00', x: 950, y: 500, page: 1 },
  { text: 'SEND 70', x: 550, y: 400, page: 1 },
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

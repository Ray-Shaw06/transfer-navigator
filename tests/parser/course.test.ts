import { describe, it, expect } from 'vitest';
import { parseLine } from '../../src/parser/course';
import type { Line } from '../../src/parser/lines';

const line = (text: string): Line => ({ y: 0, page: 1, text, parts: [] });

describe('parseLine', () => {
  it('parses code, title and units', () => {
    const result = parseLine(line('SEND 003BL Widget Fundamentals Lab 1.00'));
    expect(result).toEqual({
      kind: 'course',
      course: { code: 'SEND 003BL', title: 'Widget Fundamentals Lab', units: 1 },
    });
  });

  it('recognizes a missing articulation', () => {
    expect(parseLine(line('No Course Articulated'))).toEqual({ kind: 'not_articulated' });
  });

  it.each(['AND', 'OR'])('recognizes the %s connector', (word) => {
    expect(parseLine(line(word))).toEqual({ kind: 'connector', connector: word });
  });

  it('does not mistake prose for a course', () => {
    const result = parseLine(line('In fulfillment of the requirements below, a single course may be used only once.'));
    expect(result.kind).toBe('other');
  });
});

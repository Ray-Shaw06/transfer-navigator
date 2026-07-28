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

  it('handles a multi-word prefix', () => {
    // Real agreements contain this shape. A prefix pattern of [A-Z&] only
    // drops it, and it drops it silently.
    expect(parseLine(line('S&P TECH 6D Applied Widgets 4.00'))).toEqual({
      kind: 'course',
      course: { code: 'S&P TECH 6D', title: 'Applied Widgets', units: 4 },
    });
  });

  it('handles a digit inside the prefix', () => {
    // Real agreements contain this shape. A prefix pattern of [A-Z&] only
    // drops it, and it drops it silently.
    expect(parseLine(line('AB4CDE 43 Widget Engineering 4.00'))).toEqual({
      kind: 'course',
      course: { code: 'AB4CDE 43', title: 'Widget Engineering', units: 4 },
    });
  });

  it('does not mistake prose for a course', () => {
    const result = parseLine(line('In fulfillment of the requirements below, a single course may be used only once.'));
    expect(result.kind).toBe('other');
  });

  it('does not mistake an all-caps header for a course', () => {
    // Both of these parsed as courses before the prefix was capped at two
    // words and the title was required to carry a lowercase letter.
    expect(parseLine(line('SEC4A REVIEW 12 ITEMS CAREFULLY 4.00')).kind).toBe('other');
    expect(parseLine(line('IGETC3B STUDENTS MUST TAKE 2 COURSES 4.00')).kind).toBe('other');
  });
});

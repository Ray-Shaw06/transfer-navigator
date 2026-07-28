import { describe, it, expect } from 'vitest';
import { parseRequirement } from '../../src/parser/groups';
import type { Line } from '../../src/parser/lines';

const lines = (...texts: string[]): Line[] =>
  texts.map((text, i) => ({ y: 100 - i, page: 1, text, parts: [] }));

describe('parseRequirement', () => {
  it('reads a single course', () => {
    const result = parseRequirement(lines('SEND 8 Data Structures 3.00'));
    expect(result).toEqual({
      kind: 'options',
      options: [{ kind: 'and', courses: [{ code: 'SEND 8', title: 'Data Structures', units: 3 }] }],
    });
  });

  it('reads AND then OR into two alternatives', () => {
    const result = parseRequirement(
      lines(
        'SEND 2 Intro 4.00',
        'AND',
        'SEND 3B Java 3.00',
        'OR',
        'SEND 3C Python 3.00',
      ),
    );
    expect(result.kind).toBe('options');
    if (result.kind !== 'options') return;
    expect(result.options).toHaveLength(2);
    expect(result.options[0].courses.map((c) => c.code)).toEqual(['SEND 2', 'SEND 3B']);
    expect(result.options[1].courses.map((c) => c.code)).toEqual(['SEND 3C']);
  });

  it('passes through a missing articulation', () => {
    expect(parseRequirement(lines('No Course Articulated'))).toEqual({ kind: 'not_articulated' });
  });

  it('refuses to guess when a line is unrecognized', () => {
    const result = parseRequirement(lines('SEND 2 Intro 4.00', 'see counselor for details'));
    expect(result).toEqual({ kind: 'unreadable', text: ['see counselor for details'] });
  });
});

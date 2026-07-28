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

  it('treats an empty block as unreadable rather than as zero options', () => {
    expect(parseRequirement([])).toEqual({ kind: 'unreadable', text: [] });
  });

  it('treats a block with no course at all as unreadable', () => {
    expect(parseRequirement(lines('AND'))).toEqual({
      kind: 'unreadable',
      text: ['AND'],
    });
    expect(parseRequirement(lines('OR'))).toEqual({
      kind: 'unreadable',
      text: ['OR'],
    });
  });

  it('treats a not articulated and connector mix as unreadable', () => {
    expect(parseRequirement(lines('No Course Articulated', 'OR'))).toEqual({
      kind: 'unreadable',
      text: ['No Course Articulated', 'OR'],
    });
  });

  it('does not drop a not articulated marker sitting inside a group', () => {
    // Presenting this as satisfiable by SEND 2 alone would be a confident
    // wrong answer: the other half of the AND has no equivalent.
    expect(
      parseRequirement(lines('SEND 2 Intro 4.00', 'AND', 'No Course Articulated')),
    ).toEqual({
      kind: 'unreadable',
      text: ['SEND 2 Intro 4.00', 'AND', 'No Course Articulated'],
    });
  });

  it('does not drop a not articulated marker offered as one alternative', () => {
    expect(
      parseRequirement(lines('No Course Articulated', 'OR', 'SEND 9 Widgets 5.00')),
    ).toEqual({
      kind: 'unreadable',
      text: ['No Course Articulated', 'OR', 'SEND 9 Widgets 5.00'],
    });
  });
});

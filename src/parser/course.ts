import type { Line } from './lines';
import type { Course, Connector } from './types';

export type ParsedLine =
  | { kind: 'course'; course: Course }
  | { kind: 'connector'; connector: Connector }
  | { kind: 'not_articulated' }
  | { kind: 'other'; text: string };

// A course code is one or more uppercase words, then a number with an optional
// letter suffix. Units are the trailing decimal.
//
// The prefix words allow digits and ampersands because real codes include both
// shapes: a two word prefix joined by an ampersand, as in X&Y ZZZ 6D, and a
// digit inside the prefix word, as in AB4CDE 43. A prefix class of [A-Z&]
// alone silently drops the second.
//
// Two guards against matching an all-caps header instead of a course:
// the prefix is at most two words, which covers every real shape seen, and
// the title must contain a lowercase letter, which every real course title
// does and shouty header text does not. When in doubt this returns other,
// which becomes an unreadable row the student is told to verify. Inventing a
// course from a header is the failure we cannot have.
const COURSE = /^((?:[A-Z&][A-Z0-9&]*\s){1,2}\d+[A-Z]*)\s+((?=.*[a-z]).+?)\s+(\d+\.\d{2})$/;

export function parseLine(line: Line): ParsedLine {
  const text = line.text.trim();

  if (/^No Course Articulated$/i.test(text)) return { kind: 'not_articulated' };
  if (text === 'AND' || text === 'OR') {
    return { kind: 'connector', connector: text as Connector };
  }

  const match = COURSE.exec(text);
  if (match) {
    return {
      kind: 'course',
      course: {
        code: match[1].replace(/\s+/g, ' ').trim(),
        title: match[2].trim(),
        units: Number.parseFloat(match[3]),
      },
    };
  }
  return { kind: 'other', text };
}

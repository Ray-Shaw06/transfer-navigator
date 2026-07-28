import type { Line } from './lines';
import type { Course, Connector } from './types';

export type ParsedLine =
  | { kind: 'course'; course: Course }
  | { kind: 'connector'; connector: Connector }
  | { kind: 'not_articulated' }
  | { kind: 'other'; text: string };

// Course code is a prefix of letters, digits and & characters, then a number
// with an optional letter suffix. Units are the trailing decimal.
const COURSE = /^([A-Z&][A-Z&\s]*?\s\d+[A-Z]*)\s+(.+?)\s+(\d+\.\d{2})$/;

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

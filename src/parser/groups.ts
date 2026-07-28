import type { Line } from './lines';
import type { Course } from './types';
import { parseLine } from './course';

export type AndGroup = { kind: 'and'; courses: Course[] };
export type Requirement =
  | { kind: 'options'; options: AndGroup[] }
  | { kind: 'not_articulated' }
  | { kind: 'unreadable'; text: string[] };

// A block is a list of alternatives separated by OR, each alternative a set
// of courses joined by AND. Any line that is not a course, a connector, or
// a not-articulated marker makes the whole requirement unreadable: this
// project never reconstructs a requirement from a partially understood
// block, because a confident wrong answer costs a student more than an
// honest "check ASSIST" does.
export function parseRequirement(lines: Line[]): Requirement {
  // An empty block means the band claimed nothing. Returning zero options
  // would read downstream as a requirement satisfiable by nothing, and the
  // planner would then index an empty array. Unreadable is the safe failure.
  if (lines.length === 0) return { kind: 'unreadable', text: [] };

  const parsed = lines.map(parseLine);

  if (parsed.every((p) => p.kind === 'not_articulated')) {
    return { kind: 'not_articulated' };
  }

  const junk = parsed.filter((p) => p.kind === 'other') as Array<{ kind: 'other'; text: string }>;
  if (junk.length > 0) return { kind: 'unreadable', text: junk.map((j) => j.text) };

  const options: AndGroup[] = [];
  let current: Course[] = [];

  for (const item of parsed) {
    if (item.kind === 'course') current.push(item.course);
    if (item.kind === 'connector' && item.connector === 'OR') {
      options.push({ kind: 'and', courses: current });
      current = [];
    }
  }
  options.push({ kind: 'and', courses: current });
  const nonEmpty = options.filter((o) => o.courses.length > 0);

  // A block that parsed cleanly but produced no course at all, for example a
  // stray connector banded on its own, is not a requirement satisfiable by
  // nothing. Same safe failure as the empty block above.
  if (nonEmpty.length === 0) {
    return { kind: 'unreadable', text: lines.map((l) => l.text) };
  }

  return { kind: 'options', options: nonEmpty };
}

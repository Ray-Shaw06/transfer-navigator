import type { Course } from '../parser/types';
import type { AssistTransferabilityList } from './types';

// A general education pattern as one college certifies it for one year.
//
// What this carries and what it deliberately does not. ASSIST publishes which
// of a college's courses satisfy which Cal-GETC area, and that is exactly what
// is here. It does not publish how many courses or units each area requires;
// that is the Cal-GETC standard, set outside ASSIST. Nothing in this file
// invents those numbers, and nothing downstream should either: an area is
// reported as covered or not covered by the student's own plan, never as
// "done", because this code cannot know what done means for an area.

export type GeArea = {
  code: string;
  name: string;
  // Courses at this college certified for the area, in catalog order.
  courses: Course[];
};

export type GeneralEducation = {
  pattern: string;
  institution: string;
  academicYear: string;
  areas: GeArea[];
  // Every certified course, with the areas it clears. One course routinely
  // clears several, so this is the index the overlap check reads.
  byCourse: { code: string; title: string; units: number; areas: string[] }[];
};

// Cal-GETC areas sort as 1A, 1B, 1C, 2, 3A, 3B, 4, 5A, 5B, 5C, 6: a number
// first, then an optional letter. Sorting them as plain strings puts 1A after
// 10 and reads as nonsense next to the printed pattern.
const AREA = /^(\d+)([A-Z]*)$/i;

export function compareAreaCodes(a: string, b: string): number {
  const ma = AREA.exec(a.trim());
  const mb = AREA.exec(b.trim());
  if (!ma || !mb) return a.localeCompare(b);
  return Number(ma[1]) - Number(mb[1]) || ma[2].localeCompare(mb[2]);
}

const codeOf = (prefix: string | undefined, number: string | undefined) =>
  [prefix, number].filter(Boolean).join(' ').trim();

export function toGeneralEducation(
  list: AssistTransferabilityList,
  pattern = 'Cal-GETC',
): GeneralEducation {
  const areas = new Map<string, GeArea>();
  const byCourse: GeneralEducation['byCourse'] = [];

  for (const raw of list.courseInformationList ?? []) {
    const code = codeOf(raw.prefixCode, raw.courseNumber);
    if (!code) continue;

    const course: Course = {
      code,
      title: (raw.courseTitle ?? '').trim(),
      // minUnits is what a student earns for certain; a variable-unit course
      // should not be counted at its ceiling.
      units: typeof raw.minUnits === 'number' ? raw.minUnits : (raw.maxUnits ?? 0),
    };

    const codes: string[] = [];
    for (const area of raw.transferAreas ?? []) {
      const areaCode = (area.code ?? '').trim();
      if (!areaCode) continue;
      codes.push(areaCode);
      const existing = areas.get(areaCode);
      if (existing) existing.courses.push(course);
      else
        areas.set(areaCode, {
          code: areaCode,
          name: (area.codeDescription ?? '').trim(),
          courses: [course],
        });
    }

    // A course with no area is in the response but certified for nothing, so
    // it is not part of the pattern and is left out rather than shown as an
    // option that counts.
    if (codes.length > 0) byCourse.push({ ...course, areas: codes });
  }

  return {
    pattern,
    institution: (list.institutionName ?? '').trim(),
    academicYear: list.academicYear?.code ?? '',
    areas: [...areas.values()].sort((a, b) => compareAreaCodes(a.code, b.code)),
    byCourse,
  };
}

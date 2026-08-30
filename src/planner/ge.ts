import type { GeneralEducation } from '../assist/ge';
import { normalizeCode } from './catalog';
import type { Course } from '../parser/types';

// How a student's major preparation plan lands against a general education
// pattern.
//
// The one thing this is really for: a course can satisfy a major requirement
// AND a Cal-GETC area at the same time, and students routinely miss it and
// take a second course they never needed. That overlap is computable exactly
// from what ASSIST publishes, so it is stated exactly.
//
// What is NOT stated: whether an area is finished. ASSIST publishes which
// courses clear which area, not how many an area requires, and that number is
// the Cal-GETC standard rather than anything in this data. So an area is
// reported as covered-by-your-plan or not, and the count required is left to
// the official list and a counselor. Saying "Area 4 done" from a number this
// code does not have would be exactly the kind of confident guess the rest of
// this project refuses to make.

export type AreaCoverage = {
  code: string;
  name: string;
  // How many of the college's courses are certified for this area at all.
  offered: number;
  // Courses already finished that clear this area.
  done: Course[];
  // Courses in the major preparation route that clear this area, which the
  // student gets for free.
  planned: Course[];
};

export type GeOverlap = {
  course: Course;
  areas: string[];
  // True when the student has already finished it rather than merely planned
  // it, so the UI can speak in the right tense.
  finished: boolean;
};

export type GeStatus = {
  pattern: string;
  academicYear: string;
  areas: AreaCoverage[];
  // Every course that does double duty, most areas first.
  overlap: GeOverlap[];
  // Areas nothing in the plan touches. These are the GE a student still has
  // to schedule on top of major preparation.
  untouched: AreaCoverage[];
};

export function geStatus(
  ge: GeneralEducation,
  completed: Set<string>,
  planned: Course[],
): GeStatus {
  // Matched on the normalised code, the same way the course chooser matches,
  // so MATH 005A and MATH 5A are one course here too.
  const byNormalised = new Map<string, { course: Course; areas: string[] }>();
  for (const entry of ge.byCourse) {
    byNormalised.set(normalizeCode(entry.code), {
      course: { code: entry.code, title: entry.title, units: entry.units },
      areas: entry.areas,
    });
  }

  const doneCodes = new Set([...completed].map(normalizeCode));
  const plannedByCode = new Map(planned.map((c) => [normalizeCode(c.code), c]));

  const coverage = new Map<string, AreaCoverage>(
    ge.areas.map((a) => [a.code, { code: a.code, name: a.name, offered: a.courses.length, done: [], planned: [] }]),
  );

  const overlap: GeOverlap[] = [];

  for (const [normalised, entry] of byNormalised) {
    const finished = doneCodes.has(normalised);
    const inPlan = plannedByCode.has(normalised);
    if (!finished && !inPlan) continue;

    overlap.push({ course: entry.course, areas: entry.areas, finished });

    for (const code of entry.areas) {
      const area = coverage.get(code);
      if (!area) continue;
      if (finished) area.done.push(entry.course);
      else area.planned.push(entry.course);
    }
  }

  // Most areas cleared first: a course covering two areas is the one worth
  // showing at the top, because it is the one saving the most work.
  overlap.sort((a, b) => b.areas.length - a.areas.length || a.course.code.localeCompare(b.course.code));

  const areas = [...coverage.values()];

  return {
    pattern: ge.pattern,
    academicYear: ge.academicYear,
    areas,
    overlap,
    untouched: areas.filter((a) => a.done.length === 0 && a.planned.length === 0),
  };
}

import type { GeneralEducation } from '../assist/ge';
import { normalizeCode } from './catalog';
import {
  areasFor,
  slotsFor,
  totalSemesterUnits,
  type AreaRule,
  type Destination,
  type Pattern,
  type Slot,
} from './patterns';
import type { Course } from '../parser/types';

// How a student's coursework lands against a general education pattern.
//
// Two things this is for. First, the overlap: a course can satisfy a major
// requirement AND a general education area at the same time, and students
// routinely miss it and take a second course they never needed. Second,
// progress: how much of the pattern is actually done.
//
// One course, one area. Every pattern here says so, in its own words. So
// deciding which area each course counts in is a matching problem rather than
// a tally; crediting a course to every area it is listed under overstates
// progress, which is the direction this project is least willing to be wrong
// in. Each pattern's documented exceptions (Cal-GETC's laboratory, IGETC's
// Language Other Than English in both 3B and 6A) are the only cases where a
// course counts twice, and they are named on the pattern rather than assumed.

export type AreaCoverage = {
  id: string;
  label: string;
  // Courses the pattern asks for here. Zero when the requirement is not
  // coursework, or when the pattern's counts could not be sourced.
  required: number;
  // Courses at this college that could fill it.
  offered: number;
  done: Course[];
  planned: Course[];
  met: boolean;
  covered: boolean;
  caveat?: string;
  notCoursework?: string;
  onlyFor?: Destination;
};

export type GeOverlap = {
  course: Course;
  areas: string[];
  finished: boolean;
};

export type GeStatus = {
  pattern: string;
  patternKey: string;
  academicYear: string;
  citation?: string;
  citationUrl?: string;
  // False when the pattern's per-area counts could not be sourced, so the
  // interface can show the areas without pretending to know the requirements.
  counted: boolean;
  destination: Destination | null;
  areas: AreaCoverage[];
  overlap: GeOverlap[];
  untouched: AreaCoverage[];
  coursesDone: number;
  coursesRequired: number;
  unitsRequired?: number;
  // Whether an Area 5 course carries the laboratory. Null while Area 5 is
  // unfinished, because the question is not yet answerable.
  lab: boolean | null;
  // True when the courses applied to the two-disciplines area all came from
  // one department. Flagged, not enforced: a department is weaker than a
  // discipline.
  oneDepartment: boolean;
  dualCertifyNote?: string;
};

type Entry = { course: Course; areas: string[]; department: string };

// Assigns each course to at most one slot, filling as many as possible.
// Kuhn's algorithm: for every course, walk the slots it is eligible for and
// either take a free one or bump the course already there, provided that one
// can move somewhere else.
//
// Maximum matching rather than a greedy pass because greedy understates: a
// course eligible for 3B and 4 taken first can occupy the only Area 4 slot a
// later, 4-only course needed.
function assign(courses: Entry[], slots: Slot[]): Map<number, number> {
  const owner = new Map<number, number>();

  const tryAssign = (courseIndex: number, seen: Set<number>): boolean => {
    for (const [slotIndex, slot] of slots.entries()) {
      if (seen.has(slotIndex)) continue;
      if (!courses[courseIndex].areas.some((a) => slot.eligible.includes(a))) continue;
      seen.add(slotIndex);

      const current = owner.get(slotIndex);
      if (current === undefined || tryAssign(current, seen)) {
        owner.set(slotIndex, courseIndex);
        return true;
      }
    }
    return false;
  };

  const assigned = new Set<number>();
  for (let i = 0; i < courses.length; i++) {
    if (assigned.has(i)) continue;
    if (tryAssign(i, new Set())) {
      assigned.clear();
      for (const c of owner.values()) assigned.add(c);
    }
  }

  return owner;
}

export function geStatus(
  ge: GeneralEducation,
  pattern: Pattern,
  destination: Destination | null,
  completed: Set<string>,
  planned: Course[],
): GeStatus {
  // Matched on the normalised code, the same way the course chooser matches,
  // so MATH 005A and MATH 5A are one course here too.
  const byNormalised = new Map<string, Entry>();
  for (const entry of ge.byCourse) {
    byNormalised.set(normalizeCode(entry.code), {
      course: { code: entry.code, title: entry.title, units: entry.units },
      areas: entry.areas,
      department: entry.department,
    });
  }

  const doneCodes = new Set([...completed].map(normalizeCode));
  const plannedCodes = new Map(planned.map((c) => [normalizeCode(c.code), c]));

  const overlap: GeOverlap[] = [];
  const doneEntries: Entry[] = [];
  const plannedEntries: Entry[] = [];

  for (const [normalised, entry] of byNormalised) {
    const finished = doneCodes.has(normalised);
    const inPlan = plannedCodes.has(normalised);
    if (!finished && !inPlan) continue;

    overlap.push({ course: entry.course, areas: entry.areas, finished });
    (finished ? doneEntries : plannedEntries).push(entry);
  }

  overlap.sort(
    (a, b) => b.areas.length - a.areas.length || a.course.code.localeCompare(b.course.code),
  );

  // A pattern whose counts could not be sourced still has areas: ASSIST's own,
  // with its own labels. Showing them without requirements is more useful than
  // showing nothing, and it is the same honest shape Cal-GETC had before the
  // ICAS standard was in hand.
  const rules: AreaRule[] =
    pattern.areas.length > 0
      ? areasFor(pattern, destination)
      : ge.areas.map((a) => ({ id: a.code, label: a.name, courses: 0, semesterUnits: 0, from: [a.code] }));

  const coverage = new Map<string, AreaCoverage>(
    rules.map((rule) => {
      const offered = ge.byCourse.filter((c) => c.areas.some((a) => rule.from.includes(a))).length;
      return [
        rule.id,
        {
          id: rule.id,
          label: rule.label,
          required: rule.notCoursework ? 0 : rule.courses,
          offered,
          done: [],
          planned: [],
          met: false,
          covered: false,
          caveat: rule.caveat,
          notCoursework: rule.notCoursework,
          onlyFor: rule.onlyFor,
        },
      ];
    }),
  );

  // Areas the pattern lets a course certify in on top of wherever else it
  // counts. Those are filled without consuming the course.
  const dual = new Set(pattern.dualCertify?.areas ?? []);
  const consuming = slotsFor(rules).filter((s) => !s.eligible.every((e) => dual.has(e)));

  const doneOwner = assign(doneEntries, consuming);
  for (const [slotIndex, courseIndex] of doneOwner) {
    coverage.get(consuming[slotIndex].area)?.done.push(doneEntries[courseIndex].course);
  }

  const freeSlots = consuming.filter((_, i) => !doneOwner.has(i));
  const plannedOwner = assign(plannedEntries, freeSlots);
  for (const [slotIndex, courseIndex] of plannedOwner) {
    coverage.get(freeSlots[slotIndex].area)?.planned.push(plannedEntries[courseIndex].course);
  }

  // The dual-certify areas, filled independently. IGETC's Area 6A is the real
  // case: a Language Other Than English course counts there as well as in
  // Area 3B, so it must not be taken out of the pool.
  for (const rule of rules) {
    if (!dual.has(rule.id) || rule.notCoursework) continue;
    const area = coverage.get(rule.id);
    if (!area) continue;
    for (const entry of doneEntries) {
      if (entry.areas.some((a) => rule.from.includes(a))) area.done.push(entry.course);
    }
    for (const entry of plannedEntries) {
      if (entry.areas.some((a) => rule.from.includes(a))) area.planned.push(entry.course);
    }
  }

  const areas = [...coverage.values()];
  for (const area of areas) {
    if (area.required === 0) continue;
    area.met = area.done.length >= area.required;
    area.covered = area.done.length + area.planned.length >= area.required;
  }

  // The laboratory rides along with an Area 5 course rather than being one.
  const science = areas.find((a) => a.caveat?.includes('laboratory'));
  const carriesLab = (course: Course) =>
    pattern.labArea
      ? (byNormalised.get(normalizeCode(course.code))?.areas.includes(pattern.labArea) ?? false)
      : false;
  const lab = science && science.met ? science.done.some(carriesLab) : null;

  // The two-disciplines area, checked only on what was actually applied there.
  const disciplineArea = areas.find((a) => a.caveat?.includes('disciplines'));
  const departments = new Set(
    (disciplineArea?.done ?? [])
      .map((c) => byNormalised.get(normalizeCode(c.code))?.department)
      .filter((d): d is string => Boolean(d)),
  );

  const counted = pattern.areas.length > 0 && pattern.citation !== undefined;

  return {
    pattern: pattern.name,
    patternKey: pattern.key,
    academicYear: ge.academicYear,
    citation: pattern.citation,
    citationUrl: pattern.citationUrl,
    counted,
    destination,
    areas,
    overlap,
    untouched: areas.filter((a) => a.done.length === 0 && a.planned.length === 0),
    coursesDone: areas.reduce((sum, a) => sum + Math.min(a.done.length, a.required), 0),
    coursesRequired: areas.reduce((sum, a) => sum + a.required, 0),
    unitsRequired: counted ? totalSemesterUnits(rules) : undefined,
    lab,
    oneDepartment:
      (disciplineArea?.done.length ?? 0) >= (disciplineArea?.required ?? 0) &&
      (disciplineArea?.required ?? 0) > 1 &&
      departments.size === 1,
    dualCertifyNote: pattern.dualCertify?.note,
  };
}

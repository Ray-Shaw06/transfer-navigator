import type { GeneralEducation } from '../assist/ge';
import { normalizeCode } from './catalog';
import {
  LAB_AREA,
  REQUIREMENTS,
  STANDARD_CITATION,
  TOTAL_COURSES,
  TOTAL_SEMESTER_UNITS,
  requirementFor,
} from './calgetc';
import type { Course } from '../parser/types';

// How a student's major preparation plan lands against a general education
// pattern.
//
// The one thing this is really for: a course can satisfy a major requirement
// AND a Cal-GETC area at the same time, and students routinely miss it and
// take a second course they never needed. That overlap is computable exactly
// from what ASSIST publishes, so it is stated exactly.
//
// How many courses each area requires does not come from ASSIST. It comes
// from the ICAS standard, transcribed in calgetc.ts with its citation, and it
// is applied here so a student can see how far along they are rather than only
// which areas they have touched.
//
// One course, one area. The standard is explicit about it:
//
//   "Courses listed in more than one area can only be applied in one area
//    (Laboratory exception, see Section 9.5.3)."   -- section 9
//
// Many courses are certified for two areas, so deciding which area each one
// counts in is a matching problem, not a tally. Crediting a course to every
// area it is listed under overstates progress, which is the direction this
// project is least willing to be wrong in. The laboratory is the one
// exception the standard names: a course applied to Area 5A or 5B may also
// carry the one-unit laboratory, so 5C is never a slot to be filled.

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
  // Courses the Cal-GETC standard asks for here. Zero for the laboratory,
  // which is a property of an Area 5 course rather than a course of its own.
  required: number;
  // Finished enough courses to satisfy the area outright.
  met: boolean;
  // Finished, or on course to, once the major preparation route is done.
  covered: boolean;
  // The area's own wording where it asks for more than a count.
  caveat?: string;
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
  citation: string;
  areas: AreaCoverage[];
  // Every course that does double duty, most areas first.
  overlap: GeOverlap[];
  // Areas nothing in the plan touches. These are the GE a student still has
  // to schedule on top of major preparation.
  untouched: AreaCoverage[];
  // Progress against the standard's own totals.
  coursesDone: number;
  coursesRequired: number;
  unitsRequired: number;
  // Whether one of the Area 5 courses carries the required laboratory. Null
  // while Area 5 is not finished, because the question is not yet answerable.
  lab: boolean | null;
  // True when both Area 4 courses come from one department, which the rule
  // asking for two academic disciplines probably does not allow. Flagged, not
  // enforced: a department is a weaker thing than a discipline.
  areaFourOneDepartment: boolean;
};

// Assigns each course to at most one area slot, filling as many slots as
// possible. Kuhn's algorithm: for every course, walk the slots it is eligible
// for and either take a free one or bump the course already there, provided
// that one can move somewhere else.
//
// Maximum matching rather than a greedy pass because greedy understates: a
// course eligible for 3B and 4 taken first can occupy the only Area 4 slot a
// later, 4-only course needed. Maximum matching is what a counselor does by
// hand, and it can never claim more slots than genuinely exist.
type Slot = { area: string; index: number };

function assignToAreas(
  courses: { course: Course; areas: string[] }[],
  slots: Slot[],
  taken: Map<number, number>,
): Map<number, number> {
  // slot index -> course index
  const owner = new Map(taken);

  const tryAssign = (courseIndex: number, seen: Set<number>): boolean => {
    for (const [slotIndex, slot] of slots.entries()) {
      if (seen.has(slotIndex)) continue;
      if (!courses[courseIndex].areas.includes(slot.area)) continue;
      seen.add(slotIndex);

      const current = owner.get(slotIndex);
      if (current === undefined || tryAssign(current, seen)) {
        owner.set(slotIndex, courseIndex);
        return true;
      }
    }
    return false;
  };

  for (let i = 0; i < courses.length; i++) {
    if ([...owner.values()].includes(i)) continue;
    tryAssign(i, new Set());
  }

  return owner;
}

export function geStatus(
  ge: GeneralEducation,
  completed: Set<string>,
  planned: Course[],
): GeStatus {
  // Matched on the normalised code, the same way the course chooser matches,
  // so MATH 005A and MATH 5A are one course here too.
  const byNormalised = new Map<string, { course: Course; areas: string[]; department: string }>();
  for (const entry of ge.byCourse) {
    byNormalised.set(normalizeCode(entry.code), {
      course: { code: entry.code, title: entry.title, units: entry.units },
      areas: entry.areas,
      department: entry.department,
    });
  }

  const doneCodes = new Set([...completed].map(normalizeCode));
  const plannedByCode = new Map(planned.map((c) => [normalizeCode(c.code), c]));

  const coverage = new Map<string, AreaCoverage>(
    ge.areas.map((a) => {
      const requirement = requirementFor(a.code);
      return [
        a.code,
        {
          code: a.code,
          name: a.name,
          offered: a.courses.length,
          done: [],
          planned: [],
          required: requirement?.courses ?? 0,
          met: false,
          covered: false,
          caveat: requirement?.caveat,
        },
      ];
    }),
  );

  // Departments of the Area 4 courses a student has actually taken, for the
  // two-disciplines rule.
  const areaFourDepartments = new Set<string>();

  const overlap: GeOverlap[] = [];

  for (const [normalised, entry] of byNormalised) {
    const finished = doneCodes.has(normalised);
    const inPlan = plannedByCode.has(normalised);
    if (!finished && !inPlan) continue;

    overlap.push({ course: entry.course, areas: entry.areas, finished });

  }

  // Most areas cleared first: a course covering two areas is the one worth
  // showing at the top, because it is the one saving the most work.
  overlap.sort((a, b) => b.areas.length - a.areas.length || a.course.code.localeCompare(b.course.code));

  // One slot per course the pattern asks for, so Area 4 has two and the rest
  // have one. 5C is not among them.
  const slots: Slot[] = [];
  for (const requirement of REQUIREMENTS) {
    for (let i = 0; i < requirement.courses; i++) {
      slots.push({ area: requirement.code, index: i });
    }
  }

  // Finished courses claim slots first, then the route's courses fill what is
  // left. A course already taken should never be displaced by one merely
  // planned.
  const doneEntries = overlap.filter((o) => o.finished).map((o) => ({ course: o.course, areas: o.areas }));
  const plannedEntries = overlap.filter((o) => !o.finished).map((o) => ({ course: o.course, areas: o.areas }));

  const doneOwner = assignToAreas(doneEntries, slots, new Map());

  for (const [slotIndex, courseIndex] of doneOwner) {
    coverage.get(slots[slotIndex].area)?.done.push(doneEntries[courseIndex].course);
  }
  const freeSlots = slots.filter((_, i) => !doneOwner.has(i));
  const plannedFill = assignToAreas(plannedEntries, freeSlots, new Map());
  for (const [slotIndex, courseIndex] of plannedFill) {
    coverage.get(freeSlots[slotIndex].area)?.planned.push(plannedEntries[courseIndex].course);
  }

  // Departments of the Area 4 courses actually applied there, for the
  // two-disciplines rule.
  for (const [slotIndex, courseIndex] of doneOwner) {
    if (slots[slotIndex].area !== '4') continue;
    const department = byNormalised.get(normalizeCode(doneEntries[courseIndex].course.code))?.department;
    if (department) areaFourDepartments.add(department);
  }

  const areas = [...coverage.values()];
  for (const area of areas) {
    if (area.required === 0) continue;
    area.met = area.done.length >= area.required;
    area.covered = area.done.length + area.planned.length >= area.required;
  }

  // Every slot a finished course was actually applied to.
  const coursesDone = doneOwner.size;

  // The laboratory. One of the two Area 5 courses must carry it, so the
  // question only has an answer once both Area 5 areas are satisfied.
  const areaFive = areas.filter((a) => a.code === '5A' || a.code === '5B');
  const carriesLab = (course: Course) =>
    byNormalised.get(normalizeCode(course.code))?.areas.includes(LAB_AREA) ?? false;
  const lab =
    areaFive.length === 2 && areaFive.every((a) => a.met)
      ? areaFive.some((a) => a.done.some(carriesLab))
      : null;

  return {
    pattern: ge.pattern,
    academicYear: ge.academicYear,
    citation: STANDARD_CITATION,
    areas,
    overlap,
    untouched: areas.filter((a) => a.done.length === 0 && a.planned.length === 0),
    coursesDone,
    coursesRequired: TOTAL_COURSES,
    unitsRequired: TOTAL_SEMESTER_UNITS,
    lab,
    areaFourOneDepartment:
      (coverage.get('4')?.done.length ?? 0) >= 2 && areaFourDepartments.size === 1,
  };
}

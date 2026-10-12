// A class section, in one shape for every college. Each college's schedule
// system is different, so each gets an adapter that turns its rows into this,
// and everything downstream (picking a schedule, rendering one) reads only
// this. See docs/plans/2026-10-11-class-schedules.md.

export type Day = 'M' | 'T' | 'W' | 'R' | 'F' | 'S' | 'U';

export type Meeting = {
  days: Day[];
  // Minutes after midnight, so 8:30 AM is 510 and arithmetic is plain.
  start: number;
  end: number;
};

export type SectionMode = 'in-person' | 'online' | 'arranged';

export type Section = {
  crn: string;
  // The college's own course code, spelled the way the agreement spells it, so
  // a section can be matched to a course on the plan by canonicalCourseKey.
  course: string;
  title: string;
  units: number;
  instructor: string | null;
  campus: string;
  mode: SectionMode;
  // Empty for an online section with no set times, or one arranged with the
  // instructor.
  meetings: Meeting[];
  // ISO dates. Not every section runs the whole term: an eight-week session
  // can share a time slot with another that runs the other eight weeks.
  startDate: string | null;
  endDate: string | null;
  // The college's own label for how the section runs, such as "8 Week first
  // session". Shown to the student as is.
  termPart: string | null;
  seatsOpen: number;
  waitlistCount: number;
};

export type SchedulePreferences = {
  // Days the student can attend. Absent means any day.
  days?: Day[];
  // Minutes after midnight. A section with any meeting outside the window is
  // out. Absent means no limit.
  earliest?: number;
  latest?: number;
  // Whether online sections are acceptable, and whether in-person ones are.
  // Both default to true.
  allowOnline?: boolean;
  allowInPerson?: boolean;
};

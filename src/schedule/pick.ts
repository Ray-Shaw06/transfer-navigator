import { canonicalCourseKey } from '../catalog/normalize';
import type { SchedulePreferences, Section } from './types';

// Choose one section for each course so that nothing overlaps and the student's
// stated limits hold. This is a small constraint problem: a term has a handful
// of courses and each has a few dozen sections, so a depth-first search over
// courses taken fewest-options-first finds the best answer in milliseconds. A
// node cap bounds the worst case and the best answer found by then is returned.

export type Pick = { course: string; section: Section };

export type Unplaced = {
  course: string;
  // no-sections: the college lists none this term. preferences: it lists some,
  // all ruled out by the student's limits. conflict: some fit the limits but
  // not alongside the other courses chosen.
  reason: 'no-sections' | 'preferences' | 'conflict';
};

export type ScheduleResult = { picks: Pick[]; unplaced: Unplaced[] };

const NODE_CAP = 200_000;

function withinPreferences(section: Section, prefs: SchedulePreferences): boolean {
  const { allowOnline = true, allowInPerson = true, days, earliest, latest } = prefs;
  if (section.mode === 'online' && !allowOnline) return false;
  if (section.mode === 'in-person' && !allowInPerson) return false;
  for (const meeting of section.meetings) {
    if (days && !meeting.days.every((d) => days.includes(d))) return false;
    if (earliest !== undefined && meeting.start < earliest) return false;
    if (latest !== undefined && meeting.end > latest) return false;
  }
  return true;
}

// Two sections can run in one time slot when their dates never overlap, which
// is how an eight-week first session and an eight-week second session share a
// room and an hour. An unknown date is treated as running the whole term.
function datesOverlap(a: Section, b: Section): boolean {
  if (!a.startDate || !a.endDate || !b.startDate || !b.endDate) return true;
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

export function conflicts(a: Section, b: Section): boolean {
  if (!datesOverlap(a, b)) return false;
  return a.meetings.some((x) =>
    b.meetings.some(
      (y) => x.days.some((d) => y.days.includes(d)) && x.start < y.end && y.start < x.end,
    ),
  );
}

// Higher is better. Open seats matter most, since a full section is one the
// student cannot take, then a waitlist, then fewer days on campus.
function score(section: Section): number {
  const seats = section.seatsOpen > 0 ? 100 : section.waitlistCount === 0 ? 10 : 0;
  const days = new Set(section.meetings.flatMap((m) => m.days)).size;
  return seats - 2 * days;
}

export function pickSchedule(
  courses: string[],
  sections: Section[],
  prefs: SchedulePreferences = {},
): ScheduleResult {
  const byCourse = new Map<string, Section[]>();
  for (const section of sections) {
    const key = canonicalCourseKey(section.course);
    const list = byCourse.get(key);
    if (list) list.push(section);
    else byCourse.set(key, [section]);
  }

  const unplaced: Unplaced[] = [];
  const options: { course: string; sections: Section[] }[] = [];
  for (const course of courses) {
    const all = byCourse.get(canonicalCourseKey(course)) ?? [];
    if (all.length === 0) {
      unplaced.push({ course, reason: 'no-sections' });
      continue;
    }
    const allowed = all.filter((s) => withinPreferences(s, prefs)).sort((a, b) => score(b) - score(a));
    if (allowed.length === 0) {
      unplaced.push({ course, reason: 'preferences' });
      continue;
    }
    options.push({ course, sections: allowed });
  }

  // Fewest options first, so the hardest course fails early.
  options.sort((a, b) => a.sections.length - b.sections.length);

  let best: { picks: (Section | null)[]; value: number } = { picks: [], value: -Infinity };
  let nodes = 0;
  const chosen: (Section | null)[] = new Array(options.length).fill(null);

  const search = (index: number, placed: number, total: number) => {
    if (++nodes > NODE_CAP) return;
    if (index === options.length) {
      // Placing more courses always beats a better score on fewer.
      const value = placed * 1_000_000 + total;
      if (value > best.value) best = { picks: [...chosen], value };
      return;
    }
    for (const candidate of options[index].sections) {
      if (chosen.some((c) => c && conflicts(c, candidate))) continue;
      chosen[index] = candidate;
      search(index + 1, placed + 1, total + score(candidate));
      chosen[index] = null;
    }
    // Leave this course out, so a clash on one course cannot sink the rest.
    search(index + 1, placed, total);
  };
  search(0, 0, 0);

  const picks: Pick[] = [];
  options.forEach((option, i) => {
    const section = best.picks[i];
    if (section) picks.push({ course: option.course, section });
    else unplaced.push({ course: option.course, reason: 'conflict' });
  });

  // Back in the order the courses were asked for.
  const order = new Map(courses.map((c, i) => [c, i]));
  picks.sort((a, b) => order.get(a.course)! - order.get(b.course)!);
  return { picks, unplaced };
}

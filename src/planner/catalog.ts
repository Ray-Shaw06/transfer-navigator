import type { Agreement } from '../parser/agreement';
import type { Course } from '../parser/types';

// Every course at the sending college that could satisfy anything on this
// agreement, which is exactly the set a student should be choosing from when
// they say what they have already taken.
//
// Why this exists: completed courses used to be typed as free text and
// matched by exact string equality. "CS 3B" and "CS 003B" are the same course
// to a student and different strings to a computer, so a typed entry that did
// not match the agreement's spelling silently counted for nothing. The plan
// did not move, and the only signal was that the tool appeared not to work.
// The agreement already names every relevant course in the college's own
// spelling, so there is no reason to ask anyone to retype them.

const SORT = /^(.*?)\s*(\d+)(.*)$/;

// Course codes sort naturally, not lexically: MATH 005A comes before MATH 010,
// which a plain string compare gets backwards.
function sortKey(code: string): [string, number, string] {
  const match = SORT.exec(code.trim());
  if (!match) return [code.toUpperCase(), 0, ''];
  const [, prefix, digits, suffix] = match;
  return [prefix.trim().toUpperCase(), Number(digits), suffix.toUpperCase()];
}

export function compareCourseCodes(a: string, b: string): number {
  const [pa, na, sa] = sortKey(a);
  const [pb, nb, sb] = sortKey(b);
  return pa.localeCompare(pb) || na - nb || sa.localeCompare(sb);
}

// The subject a course belongs to, used only to group the chooser so a long
// list stays scannable.
export function subjectOf(code: string): string {
  const match = SORT.exec(code.trim());
  return (match ? match[1].trim() : code).toUpperCase();
}

// A course code reduced to what a student would actually type. Spaces go, and
// so does zero padding: a college prints MATH 005A and everyone writes
// MATH 5A. Searching without this reproduces, in the filter, exactly the
// mismatch the chooser exists to remove.
export function normalizeCode(code: string): string {
  return code
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/0*(\d+)/g, '$1');
}

// Deduped by code. The same course routinely appears under several
// requirements and in several alternatives; a student should see it once.
// Every option is included, not just the one the planner suggested, because a
// student may well have taken an alternative.
export function sendingCourses(agreement: Agreement): Course[] {
  const byCode = new Map<string, Course>();

  for (const row of agreement.rows) {
    if (row.sending.kind !== 'options') continue;
    for (const option of row.sending.options) {
      for (const course of option.courses) {
        const key = course.code.toUpperCase();
        // Keep the first spelling seen, so the label matches what the rest of
        // the plan prints for the same course.
        if (!byCode.has(key)) byCode.set(key, course);
      }
    }
  }

  return [...byCode.values()].sort((a, b) => compareCourseCodes(a.code, b.code));
}

// Grouped by subject, in the same natural order, for display.
export function bySubject(courses: Course[]): [string, Course[]][] {
  const groups = new Map<string, Course[]>();
  for (const course of courses) {
    const subject = subjectOf(course.code);
    groups.set(subject, [...(groups.get(subject) ?? []), course]);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

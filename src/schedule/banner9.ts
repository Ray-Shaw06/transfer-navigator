import { instructorName } from './sdccd';
import type { Day, Meeting, Section } from './types';

// Ellucian Banner 9 student self-service has a public class search that works
// without logging in, and its JSON is the same at every college that runs it:
// the same field names and the same shape. That makes this one adapter for many
// colleges. What differs per college is the host, the term codes and, in a
// multi-college district, how campuses are labelled. See banner9Server.ts.

export type B9Meeting = {
  beginTime: string | null;
  endTime: string | null;
  monday?: boolean;
  tuesday?: boolean;
  wednesday?: boolean;
  thursday?: boolean;
  friday?: boolean;
  saturday?: boolean;
  sunday?: boolean;
  startDate?: string | null;
  endDate?: string | null;
};

export type B9Row = {
  courseReferenceNumber: string;
  subject: string;
  courseNumber: string;
  courseTitle: string;
  campusDescription: string | null;
  creditHours: number | null;
  creditHourLow: number | null;
  seatsAvailable: number;
  waitCount: number;
  openSection: boolean;
  instructionalMethodDescription: string | null;
  faculty: { displayName: string; primaryIndicator: boolean }[];
  meetingsFaculty: { meetingTime: B9Meeting }[];
};

const DAY_FIELDS: [keyof B9Meeting, Day][] = [
  ['monday', 'M'],
  ['tuesday', 'T'],
  ['wednesday', 'W'],
  ['thursday', 'R'],
  ['friday', 'F'],
  ['saturday', 'S'],
  ['sunday', 'U'],
];

function minutes(hhmm: string | null): number | null {
  if (!hhmm || !/^\d{3,4}$/.test(hhmm)) return null;
  const padded = hhmm.padStart(4, '0');
  return Number(padded.slice(0, 2)) * 60 + Number(padded.slice(2));
}

const isoDate = (text: string | null | undefined) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text ?? '');
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
};

export function normalizeBanner9(rows: B9Row[]): Section[] {
  return rows.map((row) => {
    const meetings: Meeting[] = [];
    const seen = new Set<string>();
    const dates: string[] = [];
    for (const { meetingTime: m } of row.meetingsFaculty ?? []) {
      for (const d of [isoDate(m.startDate), isoDate(m.endDate)]) if (d) dates.push(d);
      const start = minutes(m.beginTime);
      const end = minutes(m.endTime);
      const days = DAY_FIELDS.filter(([f]) => m[f] === true).map(([, d]) => d);
      if (start === null || end === null || days.length === 0) continue;
      const key = `${days.join('')}${start}${end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      meetings.push({ days, start, end });
    }
    dates.sort();
    const startDate = dates[0] ?? null;
    const endDate = dates[dates.length - 1] ?? null;
    const weeks = startDate && endDate ? Math.round((Date.parse(endDate) - Date.parse(startDate)) / (7 * 86_400_000)) : 0;

    const primary = row.faculty?.find((f) => f.primaryIndicator) ?? row.faculty?.[0];
    const online = /online|distance|web/i.test(row.instructionalMethodDescription ?? '');

    return {
      crn: row.courseReferenceNumber,
      course: `${row.subject} ${row.courseNumber}`,
      title: row.courseTitle,
      units: row.creditHours ?? row.creditHourLow ?? 0,
      instructor: primary ? instructorName(primary.displayName) : null,
      campus: row.campusDescription ?? '',
      mode: online ? 'online' : meetings.length === 0 ? 'arranged' : 'in-person',
      meetings,
      startDate,
      endDate,
      termPart: weeks > 0 && weeks < 14 ? `${weeks} week session` : null,
      // A section Banner calls closed has no seats to offer, whatever the count.
      seatsOpen: row.openSection ? Math.max(0, row.seatsAvailable) : 0,
      waitlistCount: Math.max(0, row.waitCount),
    } satisfies Section;
  });
}

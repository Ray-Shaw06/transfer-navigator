import { instructorName } from './sdccd';
import type { Day, Meeting, Section } from './types';

// North Orange County CCD (Cypress and Fullerton) publishes each term as static
// JSON under schedule.nocccd.edu/data/<term>/, the same files its own search
// page loads: sections.json for the sections and courses.json for titles and
// units. No login and no token. Winter and Spring share one term code, and the
// four week winter intersession classes carry a campus code ending in NH.

export type NocMeeting = {
  beginTime?: string;
  endTime?: string;
  monDay?: string;
  tueDay?: string;
  wedDay?: string;
  thuDay?: string;
  friDay?: string;
  satDay?: string;
  sunDay?: string;
  bldgCode?: string;
  mtypCode?: string;
  startDate?: string;
  endDate?: string;
};

export type NocSection = {
  sectCrn: string;
  sectSubjCode: string;
  sectCrseNumb: string;
  sectSstsCode: string;
  sectSeatsAvail: number;
  sectWaitCount: number;
  sectCampCode: string;
  sectMeetings?: NocMeeting[];
  sectInstrName?: string;
};

export type NocCourse = {
  crseSubjCode: string;
  crseCrseNumb: string;
  crseTitle: string;
  crseCredHrLow: number | string;
};

// Campus codes, leading digit. 1 is Cypress and 2 is Fullerton.
export const NOC_CAMPUS_COLLEGE: Record<string, number> = { '1': 71, '2': 134 };
const CAMPUS_NAME: Record<string, string> = { '1': 'Cypress College', '2': 'Fullerton College' };

const DAY_FIELDS: [keyof NocMeeting, Day][] = [
  ['monDay', 'M'],
  ['tueDay', 'T'],
  ['wedDay', 'W'],
  ['thuDay', 'R'],
  ['friDay', 'F'],
  ['satDay', 'S'],
  ['sunDay', 'U'],
];

function minutes(hhmm: string | undefined): number | null {
  if (!hhmm || !/^\d{3,4}$/.test(hhmm)) return null;
  const padded = hhmm.padStart(4, '0');
  return Number(padded.slice(0, 2)) * 60 + Number(padded.slice(2));
}

// "02/01/2027" to "2027-02-01".
function isoDate(text: string | undefined): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text ?? '');
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

export const isWinterIntersession = (campCode: string) => campCode.endsWith('NH');

// campus is the leading digit of the campus code. part picks Winter
// intersession or Spring out of the shared Winter/Spring term; Fall has none.
export function normalizeNocccd(
  sections: NocSection[],
  courses: NocCourse[],
  campus: string,
  part?: 'Winter' | 'Spring',
): Section[] {
  const course = new Map(courses.map((c) => [`${c.crseSubjCode} ${c.crseCrseNumb}`, c]));
  const out: Section[] = [];

  for (const s of sections) {
    if (s.sectSstsCode !== 'A' || !s.sectCampCode.startsWith(campus)) continue;
    const winter = isWinterIntersession(s.sectCampCode);
    if (part === 'Winter' && !winter) continue;
    if (part === 'Spring' && winter) continue;

    const meetings: Meeting[] = [];
    const seen = new Set<string>();
    const dates: string[] = [];
    let anyOnlineOnly = (s.sectMeetings ?? []).length > 0;
    for (const m of s.sectMeetings ?? []) {
      if (m.bldgCode !== 'ONLINE') anyOnlineOnly = false;
      const start = isoDate(m.startDate);
      const end = isoDate(m.endDate);
      if (start) dates.push(start);
      if (end) dates.push(end);
      const begin = minutes(m.beginTime);
      const finish = minutes(m.endTime);
      const days = DAY_FIELDS.filter(([f]) => m[f]).map(([, d]) => d);
      if (begin === null || finish === null || days.length === 0) continue;
      const key = `${days.join('')}${begin}${finish}`;
      if (seen.has(key)) continue;
      seen.add(key);
      meetings.push({ days, start: begin, end: finish });
    }
    dates.sort();
    const startDate = dates[0] ?? null;
    const endDate = dates[dates.length - 1] ?? null;
    const weeks = startDate && endDate ? Math.round((Date.parse(endDate) - Date.parse(startDate)) / (7 * 86_400_000)) : 0;

    const code = `${s.sectSubjCode} ${s.sectCrseNumb}`;
    const info = course.get(code);
    const isOnline = anyOnlineOnly || (s.sectMeetings ?? []).some((m) => m.mtypCode === 'ONL') && meetings.length === 0;

    out.push({
      crn: s.sectCrn,
      course: code,
      title: info?.crseTitle ?? code,
      units: Number(info?.crseCredHrLow) || 0,
      instructor: s.sectInstrName ? instructorName(s.sectInstrName) : null,
      campus: CAMPUS_NAME[campus] ?? campus,
      mode: isOnline ? 'online' : meetings.length === 0 ? 'arranged' : 'in-person',
      meetings,
      startDate,
      endDate,
      termPart: weeks > 0 && weeks < 14 ? `${weeks} week session` : null,
      seatsOpen: Math.max(0, s.sectSeatsAvail),
      waitlistCount: Math.max(0, s.sectWaitCount),
    });
  }
  return out;
}

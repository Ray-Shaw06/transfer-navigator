import type { Day, Meeting, Section } from './types';

// San Diego CCD (City, Mesa and Miramar) publishes each term as a static JSON
// file under sdccd.edu/docs/StudentServices/schedule/. Rows come from its
// PeopleSoft campus system. The current term is only served through a token
// gated proxy meant for the college's own page, which this does not use, so
// what is read here is the published files only, a term or more behind.

export type SdRow = {
  CLASS_NBR: number | string;
  SUBJECT: string;
  CATALOG_NBR: string;
  CRSE_NAME: string;
  UNITS: number | string;
  CAMPUS: string;
  LOCATION: string;
  MEETINGINFO: string;
  ENRL_STAT: string;
  ENRL_CAP: number | string;
  ENRL_TOT: number | string;
  WAIT_TOT: number | string;
  START_DT: string;
  END_DT: string;
  X_NO_OF_WEEKS?: number | string;
};

// SDCCD's own campus codes, mapped to the colleges' ASSIST ids.
export const SD_CAMPUS_COLLEGE: Record<string, number> = { CITY: 54, MESA: 101, MIRA: 45 };
const CAMPUS_NAME: Record<string, string> = { CITY: 'City College', MESA: 'Mesa College', MIRA: 'Miramar College' };

const DAYS: Record<string, Day> = { M: 'M', T: 'T', W: 'W', Th: 'R', F: 'F', S: 'S', Sa: 'S', Su: 'U' };

// "9:35 AM" is 575. Minutes are not zero padded in this feed: "10:5 AM" is
// 10:05, and ":0" is on the hour.
function minutes(text: string): number | null {
  const m = /^(\d{1,2}):(\d{1,2}) (AM|PM)$/.exec(text.trim());
  if (!m) return null;
  const hour = Number(m[1]) % 12 + (m[3] === 'PM' ? 12 : 0);
  return hour * 60 + Number(m[2]);
}

const toInt = (v: number | string | undefined) => {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
};

// "07/21/2026" to "2026-07-21".
function isoDate(text: string | undefined): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text ?? '');
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

// The feed writes an instructor as "Last,First Middle". A rating lookup wants
// the first given name and the last name, so "Ramirez,Joseph Allen Ruanto"
// becomes "Joseph Ramirez".
export function instructorName(raw: string): string | null {
  const [last, given] = raw.split(',').map((s) => s.trim());
  if (!last || !given) return null;
  const first = given.split(/\s+/)[0];
  return first ? `${first} ${last}` : null;
}

// One entry per meeting, separated by <br/>. Fields are
// sequence | room | days | start | end | day-or-evening | instructor | email | ...
function parseMeetings(info: string) {
  const meetings: Meeting[] = [];
  let instructor: string | null = null;
  const seen = new Set<string>();
  for (const entry of info.split('<br/>')) {
    const p = entry.split('|').map((s) => s.trim());
    if (p.length < 7) continue;
    if (!instructor && p[6]) instructor = instructorName(p[6]);
    const days = p[2].split(/\s+/).filter(Boolean).map((d) => DAYS[d]).filter(Boolean);
    const start = minutes(p[3]);
    const end = minutes(p[4]);
    if (days.length === 0 || start === null || end === null) continue;
    const key = `${days.join('')}${start}${end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    meetings.push({ days, start, end });
  }
  return { meetings, instructor };
}

export function normalizeSdccd(rows: SdRow[], campus: string): Section[] {
  const sections: Section[] = [];
  for (const row of rows) {
    if (row.CAMPUS !== campus) continue;
    const { meetings, instructor } = parseMeetings(row.MEETINGINFO ?? '');
    const online = /ONLINE/.test(row.LOCATION) && meetings.length === 0;
    const cap = toInt(row.ENRL_CAP);
    const taken = toInt(row.ENRL_TOT);
    const weeks = toInt(row.X_NO_OF_WEEKS);
    sections.push({
      crn: String(row.CLASS_NBR),
      course: `${row.SUBJECT} ${row.CATALOG_NBR.trim()}`,
      title: row.CRSE_NAME,
      units: Number(row.UNITS) || 0,
      instructor,
      campus: CAMPUS_NAME[campus] ?? campus,
      mode: online ? 'online' : meetings.length === 0 ? 'arranged' : 'in-person',
      meetings,
      startDate: isoDate(row.START_DT),
      endDate: isoDate(row.END_DT),
      termPart: weeks > 0 && weeks < 16 ? `${weeks} week session` : null,
      // A closed class has no seats to offer whatever the arithmetic says.
      seatsOpen: row.ENRL_STAT === 'C' ? 0 : Math.max(0, cap - taken),
      waitlistCount: toInt(row.WAIT_TOT),
    });
  }
  return sections;
}

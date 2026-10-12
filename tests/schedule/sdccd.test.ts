import { describe, it, expect } from 'vitest';
import rows from '../fixtures/sdccd-spring-2026-sample.json';
import { instructorName, normalizeSdccd, SD_CAMPUS_COLLEGE, type SdRow } from '../../src/schedule/sdccd';
import { SCHEDULE_COVERAGE } from '../../src/schedule/coverage';

const all = rows as unknown as SdRow[];

describe('SDCCD normalizer, on real Spring 2026 rows', () => {
  it('splits rows by campus and keeps one section per class number', () => {
    for (const campus of Object.keys(SD_CAMPUS_COLLEGE)) {
      const sections = normalizeSdccd(all, campus);
      const crns = sections.map((s) => s.crn);
      expect(new Set(crns).size).toBe(crns.length);
      expect(sections.every((s) => s.campus.length > 0)).toBe(true);
    }
    const total = Object.keys(SD_CAMPUS_COLLEGE).flatMap((c) => normalizeSdccd(all, c));
    expect(total.length).toBe(all.length);
  });

  it('reads meeting days and unpadded minutes', () => {
    const timed = Object.keys(SD_CAMPUS_COLLEGE)
      .flatMap((c) => normalizeSdccd(all, c))
      .filter((s) => s.meetings.length > 0);
    expect(timed.length).toBeGreaterThan(0);
    for (const s of timed) {
      for (const m of s.meetings) {
        expect(m.end).toBeGreaterThan(m.start);
        expect(m.start % 5).toBe(0);
      }
    }
  });

  it('never reports negative seats and treats a closed class as having none', () => {
    const sections = Object.keys(SD_CAMPUS_COLLEGE).flatMap((c) => normalizeSdccd(all, c));
    expect(sections.every((s) => s.seatsOpen >= 0)).toBe(true);
    const closed = new Set(all.filter((r) => r.ENRL_STAT === 'C').map((r) => String(r.CLASS_NBR)));
    expect(sections.filter((s) => closed.has(s.crn)).every((s) => s.seatsOpen === 0)).toBe(true);
  });
});

describe('SDCCD helpers', () => {
  it('turns "Last,First Middle" into the first given name and last name', () => {
    expect(instructorName('Ramirez,Joseph Allen Ruanto')).toBe('Joseph Ramirez');
    expect(instructorName('Staff')).toBeNull();
  });

  it('parses "10:5 AM" as 10:05 and PM correctly', () => {
    const row = {
      CLASS_NBR: 1, SUBJECT: 'X', CATALOG_NBR: ' 1', CRSE_NAME: 'T', UNITS: 3, CAMPUS: 'CITY', LOCATION: 'ONCAMPUS',
      MEETINGINFO: '1 | City A-1 | M W | 8:35 AM | 10:5 AM | Day | Doe,Jane | j@x | 0', ENRL_STAT: 'O',
      ENRL_CAP: 30, ENRL_TOT: 10, WAIT_TOT: 0, START_DT: '02/02/2026', END_DT: '06/01/2026',
    } as SdRow;
    const s = normalizeSdccd([row], 'CITY')[0];
    expect(s.meetings).toEqual([{ days: ['M', 'W'], start: 515, end: 605 }]);
    expect(s.course).toBe('X 1');
    expect(s.startDate).toBe('2026-02-02');
    const pm = normalizeSdccd([{ ...row, MEETINGINFO: '1 | r | T Th | 6:0 PM | 9:0 PM | Evening | Doe,Jane | j@x | 0' }], 'CITY')[0];
    expect(pm.meetings[0]).toEqual({ days: ['T', 'R'], start: 1080, end: 1260 });
  });
});

describe('coverage', () => {
  it('maps every SDCCD campus to a listed college', () => {
    for (const id of Object.values(SD_CAMPUS_COLLEGE)) expect(SCHEDULE_COVERAGE[id]?.provider).toBe('sdccd');
  });
});

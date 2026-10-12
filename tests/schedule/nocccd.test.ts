import { describe, it, expect } from 'vitest';
import data from '../fixtures/nocccd-spring-2027-sample.json';
import { isWinterIntersession, normalizeNocccd, type NocCourse, type NocSection } from '../../src/schedule/nocccd';
import { SCHEDULE_COVERAGE } from '../../src/schedule/coverage';

const sections = data.sections as unknown as NocSection[];
const courses = data.courses as unknown as NocCourse[];

describe('NOCCCD normalizer, on real Winter/Spring 2027 rows', () => {
  it('splits Cypress and Fullerton by campus code', () => {
    const cy = normalizeNocccd(sections, courses, '1', 'Spring');
    const fu = normalizeNocccd(sections, courses, '2', 'Spring');
    expect(cy.length).toBeGreaterThan(0);
    expect(fu.length).toBeGreaterThan(0);
    expect(cy.every((s) => s.campus === 'Cypress College')).toBe(true);
    expect(fu.every((s) => s.campus === 'Fullerton College')).toBe(true);
  });

  it('keeps the 4 week winter intersession out of Spring, and Spring out of Winter', () => {
    const winter = normalizeNocccd(sections, courses, '1', 'Winter').length + normalizeNocccd(sections, courses, '2', 'Winter').length;
    const spring = normalizeNocccd(sections, courses, '1', 'Spring').length + normalizeNocccd(sections, courses, '2', 'Spring').length;
    const nh = sections.filter((s) => isWinterIntersession(s.sectCampCode)).length;
    expect(winter).toBe(nh);
    expect(spring).toBe(sections.length - nh);
  });

  it('joins titles and units from the course list', () => {
    const all = normalizeNocccd(sections, courses, '2', 'Spring');
    expect(all.some((s) => s.title !== s.course && s.units > 0)).toBe(true);
  });

  it('reads times, days and online sections', () => {
    const all = ['1', '2'].flatMap((c) => normalizeNocccd(sections, courses, c));
    for (const s of all) for (const m of s.meetings) expect(m.end).toBeGreaterThan(m.start);
    expect(all.some((s) => s.meetings.length > 0)).toBe(true);
  });

  it('never reports negative seats and names instructors first-last', () => {
    const all = ['1', '2'].flatMap((c) => normalizeNocccd(sections, courses, c));
    expect(all.every((s) => s.seatsOpen >= 0 && s.waitlistCount >= 0)).toBe(true);
    for (const s of all) if (s.instructor) expect(s.instructor).not.toContain(',');
  });

  it('spells course codes the way ASSIST spells Fullerton: "MATH 151 F"', () => {
    const codes = normalizeNocccd(sections, courses, '2').map((s) => s.course);
    expect(codes.some((c) => /^[A-Z/&]+ \d{3}[A-Z]?\s?[A-Z]?$/.test(c))).toBe(true);
  });
});

describe('coverage', () => {
  it('lists both NOCCCD colleges', () => {
    expect(SCHEDULE_COVERAGE[71]?.provider).toBe('nocccd');
    expect(SCHEDULE_COVERAGE[134]?.provider).toBe('nocccd');
  });
});

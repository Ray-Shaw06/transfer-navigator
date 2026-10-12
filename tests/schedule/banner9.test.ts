import { describe, it, expect } from 'vitest';
import rows from '../fixtures/banner9-sample.json';
import { normalizeBanner9, type B9Row } from '../../src/schedule/banner9';
import { BANNER9_HOSTS } from '../../src/schedule/banner9Server';
import { SCHEDULE_COVERAGE } from '../../src/schedule/coverage';

const sections = normalizeBanner9(rows as unknown as B9Row[]);

describe('Banner 9 normalizer, on real rows from Ventura, Kern and Coast', () => {
  it('makes one section per row with a CRN and a course code', () => {
    expect(sections).toHaveLength((rows as unknown[]).length);
    for (const s of sections) {
      expect(s.crn).toMatch(/^\d+$/);
      expect(s.course).toMatch(/^[A-Z/&]+ \S+/);
    }
  });

  it('reads meeting days and times, with end after start', () => {
    const timed = sections.filter((s) => s.meetings.length > 0);
    expect(timed.length).toBeGreaterThan(0);
    for (const s of timed) for (const m of s.meetings) expect(m.end).toBeGreaterThan(m.start);
  });

  it('names instructors first then last, never "Last, First"', () => {
    const named = sections.filter((s) => s.instructor);
    expect(named.length).toBeGreaterThan(0);
    for (const s of named) expect(s.instructor).not.toContain(',');
  });

  it('never reports negative seats and gives a closed section none', () => {
    expect(sections.every((s) => s.seatsOpen >= 0 && s.waitlistCount >= 0)).toBe(true);
    (rows as unknown as B9Row[]).forEach((r, i) => {
      if (!r.openSection) expect(sections[i].seatsOpen).toBe(0);
    });
  });

  it('keeps the campus label so a district can be split into colleges', () => {
    const campuses = new Set(sections.map((s) => s.campus));
    expect([...campuses].some((c) => c.startsWith('Moorpark') || c.startsWith('Oxnard') || c.startsWith('Ventura'))).toBe(true);
    expect([...campuses].some((c) => c.startsWith('BC ') || c.startsWith('CC ') || c.startsWith('Por'))).toBe(true);
  });
});

describe('Banner 9 registry', () => {
  it('has a host for every college the coverage list says is Banner 9, and no others', () => {
    const listed = Object.entries(SCHEDULE_COVERAGE).filter(([, v]) => v.provider === 'banner9').map(([id]) => Number(id));
    expect(listed.sort()).toEqual(Object.keys(BANNER9_HOSTS).map(Number).sort());
  });

  it('gives each college in a shared host its own campus prefix', () => {
    const byHost = new Map<string, number[]>();
    for (const [id, cfg] of Object.entries(BANNER9_HOSTS)) byHost.set(cfg.host, [...(byHost.get(cfg.host) ?? []), Number(id)]);
    for (const ids of byHost.values()) {
      if (ids.length > 1) for (const id of ids) expect(BANNER9_HOSTS[id].campusPrefixes?.length).toBeGreaterThan(0);
    }
  });
});
